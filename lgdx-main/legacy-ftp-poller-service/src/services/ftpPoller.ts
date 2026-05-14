/**
 * Core logic: connect to old lgdeal.com FTP, find the most recently modified
 * file in /files, download it if it changed, then dispatch to the processing
 * pipeline via the shared ftp_data volume + RabbitMQ.
 */

import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { logger } from '../shared/logger';
import { config } from '../shared/config';
import { sendToQueue } from '../shared/rabbitmq';
import { decryptPassword } from './cryptoService';
import Company, { ICompany, LegacyFtpConfig } from '../models/Company';

interface FtpFileInfo {
  name: string;
  size: number;
  modifiedAt: Date;
  etag: string; // "{name}:{size}:{mtime_unix}"
}

/**
 * Poll one company's old FTP account.
 * Returns true if a new file was downloaded and queued.
 */
async function pollCompany(company: ICompany): Promise<boolean> {
  const cfg = company.legacyFtpConfig as LegacyFtpConfig;
  const companyId = (company._id as mongoose.Types.ObjectId).toString();
  const log = logger.child({ company: company.name, companyId });

  let password: string;
  try {
    password = decryptPassword(cfg.encryptedPassword);
  } catch (err) {
    log.error({ err }, '[Poller] Failed to decrypt password');
    throw new Error('Password decryption failed');
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.username,
      password,
      secure: false
    });

    // Force passive mode (required by old server)
    // basic-ftp uses passive mode by default — nothing extra needed

    // List files in remote directory
    const list = await client.list(cfg.remoteDir);

    if (list.length === 0) {
      log.info('[Poller] No files found in remote dir');
      client.close();
      return false;
    }

    // Find the most recently modified file (as per supplier instructions).
    // modifiedAt may be null on some FTP servers — fall back to epoch so
    // the file still gets picked up rather than silently dropped.
    const files: FtpFileInfo[] = list
      .filter(f => f.type === ftp.FileType.File && f.name && f.size != null)
      .map(f => {
        const mtime = f.modifiedAt ?? new Date(0);
        return {
          name: f.name,
          size: f.size!,
          modifiedAt: mtime,
          etag: `${f.name}:${f.size}:${Math.floor(mtime.getTime() / 1000)}`
        };
      })
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    if (files.length === 0) {
      log.info('[Poller] No downloadable files found');
      client.close();
      return false;
    }

    const newest = files[0];

    // Check if file changed since last poll
    if (cfg.lastFileEtag && cfg.lastFileEtag === newest.etag) {
      log.info({ etag: newest.etag }, '[Poller] File unchanged, skipping');
      client.close();
      // Still update lastPolledAt so we know the check ran
      await Company.updateOne(
        { _id: company._id },
        { $set: { 'legacyFtpConfig.lastPolledAt': new Date() } }
      );
      return false;
    }

    log.info({ file: newest.name, size: newest.size }, '[Poller] Downloading new/updated file');

    // Ensure destination directory exists
    const destDir = path.join(config.ftpDataPath, companyId);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, newest.name);

    await client.downloadTo(destPath, path.posix.join(cfg.remoteDir, newest.name));
    client.close();

    const fileSize = fs.statSync(destPath).size;

    log.info({ destPath, fileSize }, '[Poller] File downloaded successfully');

    // Build RabbitMQ payload — same format as FileWatcher
    const payload = {
      filePath: destPath,
      companyDoc: {
        _id: companyId,
        name: company.name,
        ftpConfig: company.ftpConfig ?? { enabled: false },
        legacyFtpConfig: cfg
      },
      companyName: company.name,
      originalFileName: newest.name,
      uploadMode: 'replace' as const,
      source: 'legacy_ftp',
      uploadedAt: new Date().toISOString(),
      fileSize
    };

    await sendToQueue(config.fileUploadQueue, payload);

    log.info('[Poller] Queued for processing');

    // Update metadata
    await Company.updateOne(
      { _id: company._id },
      {
        $set: {
          'legacyFtpConfig.lastPolledAt': new Date(),
          'legacyFtpConfig.lastFileEtag': newest.etag,
          'legacyFtpConfig.consecutiveErrors': 0,
          'legacyFtpConfig.lastError': undefined
        }
      }
    );

    return true;
  } catch (err) {
    client.close();
    throw err;
  }
}

/**
 * Poll a single company by its MongoDB ID (used by HTTP trigger endpoint).
 */
export async function pollByCompanyId(companyId: string): Promise<void> {
  const company = await Company.findOne({
    _id: companyId,
    'legacyFtpConfig.enabled': true,
  }).lean() as unknown as ICompany | null;

  if (!company) {
    logger.warn({ companyId }, '[Poller] Company not found or legacy FTP not enabled');
    return;
  }
  await pollCompanyWithErrorHandling(company);
}

/**
 * Poll all active companies with legacyFtpConfig.enabled = true.
 * Processes up to `config.concurrency` companies at a time.
 */
export async function runPollCycle(): Promise<void> {
  logger.info('[Poller] Starting poll cycle');

  const companies = await Company.find({
    'legacyFtpConfig.enabled': true,
    status: { $in: ['active', 'pending_review'] }
  }).lean() as unknown as ICompany[];

  if (companies.length === 0) {
    logger.info('[Poller] No companies to poll');
    return;
  }

  logger.info({ count: companies.length }, '[Poller] Companies to poll');

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches (concurrency limit)
  for (let i = 0; i < companies.length; i += config.concurrency) {
    const batch = companies.slice(i, i + config.concurrency);
    const results = await Promise.allSettled(
      batch.map(company => pollCompanyWithErrorHandling(company))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value) downloaded++;
        else skipped++;
      } else {
        errors++;
      }
    }
  }

  logger.info(
    { downloaded, skipped, errors },
    '[Poller] Poll cycle complete'
  );
}

async function pollCompanyWithErrorHandling(company: ICompany): Promise<boolean> {
  const companyId = (company._id as mongoose.Types.ObjectId).toString();
  const log = logger.child({ company: company.name, companyId });

  try {
    return await pollCompany(company);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ err }, '[Poller] Error polling company');

    // Increment consecutive errors; auto-disable after threshold
    const newCount = ((company.legacyFtpConfig?.consecutiveErrors) ?? 0) + 1;
    const shouldDisable = newCount >= config.maxConsecutiveErrors;

    await Company.updateOne(
      { _id: company._id },
      {
        $set: {
          'legacyFtpConfig.consecutiveErrors': newCount,
          'legacyFtpConfig.lastError': errorMessage,
          'legacyFtpConfig.lastPolledAt': new Date(),
          ...(shouldDisable ? { 'legacyFtpConfig.enabled': false } : {})
        }
      }
    );

    if (shouldDisable) {
      log.error(
        { consecutiveErrors: newCount },
        '[Poller] ❌ Auto-disabled after too many consecutive errors'
      );
    }

    return false;
  }
}
