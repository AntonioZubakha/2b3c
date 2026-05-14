/**
 * Контроллер для управления FTP доступом через админ-панель
 * Поддерживает оба типа FTP: новый (lgdeal.com) и legacy (прежние внешние FTP поставщиков)
 * Публичный hostname FTP задаётся через env FTP_PASV_URL (по умолчанию lgdeal.com).
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import Company from '../models/Company';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import axios from 'axios';
import * as fs from 'fs-extra';

// Internal URL of the legacy-ftp-poller service (Docker internal network)
const LEGACY_POLLER_URL = process.env.LEGACY_POLLER_URL || 'http://legacy-ftp-poller:3001';
// ftp-product-sync-service health port — admin "Sync" for NEW FTP rescans files on disk
const FTP_SERVICE_URL = process.env.FTP_SERVICE_URL || 'http://ftp-service:3000';

/** Encrypt a password for legacyFtpConfig storage (AES-256-GCM, key = 32 bytes hex). */
function encryptLegacyPassword(plaintext: string): string {
  let keyHex: string;
  const keyFile = process.env.LEGACY_FTP_CRYPTO_KEY_FILE;
  if (keyFile) {
    try {
      keyHex = fs.readFileSync(keyFile, 'utf8').trim().replace(/\s/g, '');
    } catch (err) {
      logger.error('[FtpAdmin] Failed to read LEGACY_FTP_CRYPTO_KEY_FILE', { path: keyFile, err });
      throw new Error('Legacy FTP crypto key file not available. Ensure legacy_ftp_crypto_key secret is mounted.');
    }
  } else {
    keyHex = (process.env.LEGACY_FTP_CRYPTO_KEY || '').trim().replace(/\s/g, '');
  }
  if (!keyHex || keyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    logger.error('[FtpAdmin] LEGACY_FTP_CRYPTO_KEY missing or invalid (must be 64 hex chars)');
    throw new Error('Legacy FTP crypto key not configured or invalid (must be 64 hex characters).');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Trigger the legacy-ftp-poller via its internal HTTP API */
async function triggerLegacyPoller(companyId?: string): Promise<void> {
  const url = companyId
    ? `${LEGACY_POLLER_URL}/trigger/${companyId}`
    : `${LEGACY_POLLER_URL}/trigger-all`;
  try {
    await axios.post(url, {}, { timeout: 5000 });
    logger.info(`[FtpAdmin] Legacy poller triggered: ${url}`);
  } catch (err) {
    // Non-fatal: etag was already cleared, poller will pick it up on next cycle
    logger.warn(`[FtpAdmin] Could not reach legacy poller (${url}): ${err instanceof Error ? err.message : err}`);
  }
}

// ─── GET /admin/ftp/companies ───────────────────────────────────────────────

export const getFtpCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('[FtpAdmin] Getting FTP companies list');

    const companies = await Company.find({ status: 'active' })
      .select('name status ftpConfig legacyFtpConfig createdAt updatedAt')
      .sort({ name: 1 });

    const ftpCompanies = companies.map(company => {
      const hasNew    = !!company.ftpConfig?.enabled;
      const hasLegacy = !!(company as any).legacyFtpConfig?.enabled;
      const ftpType   = hasNew ? 'new' : hasLegacy ? 'legacy' : 'none';
      const legacy    = (company as any).legacyFtpConfig;

      return {
        _id: company._id,
        name: company.name,
        status: company.status,
        ftpType,
        // New FTP fields
        ftpEnabled: hasNew,
        ftpActive: company.ftpConfig?.isActive || false,
        ftpUsername: company.ftpConfig?.username || null,
        lastConnection: company.ftpConfig?.lastConnectionAt || null,
        connectionCount: company.ftpConfig?.connectionCount || 0,
        totalUploads: company.ftpConfig?.totalUploadsCount || 0,
        uploadQuotaMB: company.ftpConfig?.uploadQuotaMB || 0,
        usedQuotaMB: Math.round((company.ftpConfig?.totalBytesUploaded || 0) / 1024 / 1024),
        allowedIPs: company.ftpConfig?.allowedIPs || [],
        settings: company.ftpConfig?.settings || null,
        // Legacy FTP fields
        legacyEnabled: hasLegacy,
        legacyUsername: legacy?.username || null,
        legacyHost: legacy?.host || null,
        legacyLastPolled: legacy?.lastPolledAt || null,
        legacyErrors: legacy?.consecutiveErrors || 0,
        legacyLastError: legacy?.lastError || null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      };
    });

    // Stats
    const totalNew    = ftpCompanies.filter(c => c.ftpType === 'new').length;
    const totalLegacy = ftpCompanies.filter(c => c.ftpType === 'legacy').length;
    const totalNone   = ftpCompanies.filter(c => c.ftpType === 'none').length;

    res.json({
      success: true,
      companies: ftpCompanies,
      total: ftpCompanies.length,
      stats: {
        overview: {
          totalCompanies: ftpCompanies.length,
          ftpEnabledCompanies: totalNew + totalLegacy,
          ftpActiveCompanies: ftpCompanies.filter(c => c.ftpActive || c.legacyEnabled).length,
          enabledPercentage: Math.round(((totalNew + totalLegacy) / (ftpCompanies.length || 1)) * 100),
          newFtp: totalNew,
          legacyFtp: totalLegacy,
          noFtp: totalNone,
        },
        usage: {
          totalConnections: ftpCompanies.reduce((s, c) => s + c.connectionCount, 0),
          totalUploads: ftpCompanies.reduce((s, c) => s + c.totalUploads, 0),
          totalBytesMB: ftpCompanies.reduce((s, c) => s + c.usedQuotaMB, 0),
        },
        topActiveCompanies: [],
      },
    });

  } catch (error) {
    logger.error('[FtpAdmin] Error getting FTP companies:', error);
    res.status(500).json({ error: 'Failed to get FTP companies' });
  }
};

// ─── POST /admin/ftp/companies/:companyId/create ────────────────────────────

export const createFtpAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const {
      uploadQuotaMB = 1000,
      maxConcurrentConnections = 2,
      allowedIPs = [],
      allowedFileTypes = ['xlsx', 'xls', 'csv'],
      maxFileSizeMB = 50,
      autoProcessFiles = true,
      processMode = 'replace'
    } = req.body;

    const company = await Company.findById(companyId);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
    if (company.ftpConfig?.enabled) {
      res.status(400).json({ error: 'FTP access already exists for this company' });
      return;
    }

    const timestamp  = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    const username   = `company_${company._id.toString().slice(-8)}_${timestamp}_${randomPart}`;
    const password   = uuidv4().replace(/-/g, '').substring(0, 16);
    const passwordHash = await bcrypt.hash(password, 12);

    company.ftpConfig = {
      enabled: true,
      username,
      passwordHash,
      homeDirectory: `/ftp-data/${company._id}`,
      maxConcurrentConnections: Math.min(maxConcurrentConnections, 5),
      allowedIPs: Array.isArray(allowedIPs) ? allowedIPs : [],
      uploadQuotaMB: Math.min(uploadQuotaMB, 5000),
      isActive: true,
      connectionCount: 0,
      totalUploadsCount: 0,
      totalBytesUploaded: 0,
      settings: {
        autoProcessFiles,
        deleteAfterProcess: false,
        notifyOnUpload: true,
        allowedFileTypes,
        maxFileSizeMB: Math.min(maxFileSizeMB, 200),
        processMode
      }
    };
    await company.save();

    logger.info(`[FtpAdmin] New FTP access created for ${company.name} (${username})`);

    res.json({
      success: true,
      message: 'FTP access created successfully',
      ftpCredentials: {
        username,
        password,
        server: process.env.FTP_PASV_URL || 'lgdeal.com',
        port: 21
      }
    });
  } catch (error) {
    logger.error('[FtpAdmin] Error creating FTP access:', error);
    res.status(500).json({ error: 'Failed to create FTP access' });
  }
};

// ─── POST /admin/ftp/companies/:companyId/set-legacy ────────────────────────

export const setLegacyFtpAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { username, password, host, port, remoteDir } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const company = await Company.findById(companyId);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    const encryptedPassword = encryptLegacyPassword(password);

    // Disable new FTP, enable legacy
    if (company.ftpConfig?.enabled) {
      company.ftpConfig.enabled = false;
      company.ftpConfig.isActive = false;
    }

    (company as any).legacyFtpConfig = {
      enabled: true,
      host: host || '65.21.109.96',
      port: port || 21,
      username,
      encryptedPassword,
      remoteDir: remoteDir || '/files',
      pollIntervalHours: 12,
      consecutiveErrors: 0,
    };

    await company.save();

    logger.info(`[FtpAdmin] Legacy FTP set for ${company.name} (${username})`);
    res.json({ success: true, message: 'Legacy FTP configured successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[FtpAdmin] Error setting legacy FTP:', { error: message, stack: error instanceof Error ? error.stack : undefined });
    if (message.includes('crypto key') || message.includes('LEGACY_FTP')) {
      res.status(503).json({ error: 'Legacy FTP encryption not configured. Contact administrator.' });
      return;
    }
    res.status(500).json({ error: 'Failed to set legacy FTP access' });
  }
};

// ─── POST /admin/ftp/companies/:companyId/sync ──────────────────────────────

export const syncCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    const isLegacy = !!(company as any).legacyFtpConfig?.enabled;
    const isNew    = !!company.ftpConfig?.enabled;

    if (!isLegacy && !isNew) {
      res.status(400).json({ error: 'No FTP configured for this company' });
      return;
    }

    if (isLegacy) {
      // Reset etag so poller will re-download, then trigger poller
      await Company.updateOne({ _id: company._id }, {
        $set: {
          'legacyFtpConfig.lastFileEtag': null,
          'legacyFtpConfig.consecutiveErrors': 0,
          'legacyFtpConfig.lastError': null,
        }
      });
      await triggerLegacyPoller(companyId);
    }

    let newFtpRescan: unknown;
    if (isNew) {
      const url = `${FTP_SERVICE_URL.replace(/\/$/, '')}/internal/rescan/${companyId}`;
      try {
        const { data } = await axios.post(url, {}, { timeout: 120000 });
        newFtpRescan = data;
        logger.info(`[FtpAdmin] New FTP rescan completed for ${company.name}`, { url, data });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[FtpAdmin] New FTP rescan failed for ${company.name}: ${msg}`);
        res.status(502).json({
          error: 'FTP service rescan failed. Is ftp-service running and FTP_SERVICE_URL correct?',
          details: msg,
        });
        return;
      }
    }

    logger.info(`[FtpAdmin] Sync triggered for company: ${company.name} (${isLegacy ? 'legacy' : 'new'})`);
    res.json({
      success: true,
      message: `Sync triggered for ${company.name}`,
      ...(newFtpRescan !== undefined ? { rescan: newFtpRescan } : {}),
    });
  } catch (error) {
    logger.error('[FtpAdmin] Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
};

// ─── POST /admin/ftp/sync-all ────────────────────────────────────────────────

export const syncAllCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    // Reset etags for all legacy FTP companies
    const result = await Company.updateMany(
      { 'legacyFtpConfig.enabled': true },
      { $set: { 'legacyFtpConfig.lastFileEtag': null, 'legacyFtpConfig.consecutiveErrors': 0 } }
    );

    // Trigger the poller for all
    await triggerLegacyPoller();

    logger.info(`[FtpAdmin] Sync-all triggered. Legacy reset: ${result.modifiedCount}`);
    res.json({
      success: true,
      message: `Sync triggered for all companies (${result.modifiedCount} legacy reset)`
    });
  } catch (error) {
    logger.error('[FtpAdmin] Error triggering sync-all:', error);
    res.status(500).json({ error: 'Failed to trigger sync-all' });
  }
};

// ─── PUT /admin/ftp/companies/:companyId/config ─────────────────────────────

export const updateFtpConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { uploadQuotaMB, maxConcurrentConnections, allowedIPs, allowedFileTypes,
            maxFileSizeMB, autoProcessFiles, processMode, isActive } = req.body;

    const company = await Company.findById(companyId);
    if (!company || !company.ftpConfig?.enabled) {
      res.status(404).json({ error: 'Company or FTP access not found' });
      return;
    }

    if (uploadQuotaMB !== undefined)          company.ftpConfig.uploadQuotaMB = Math.min(uploadQuotaMB, 5000);
    if (maxConcurrentConnections !== undefined) company.ftpConfig.maxConcurrentConnections = Math.min(maxConcurrentConnections, 10);
    if (Array.isArray(allowedIPs))            company.ftpConfig.allowedIPs = allowedIPs;
    if (isActive !== undefined)               company.ftpConfig.isActive = isActive;

    if (!company.ftpConfig.settings) company.ftpConfig.settings = {};
    if (allowedFileTypes !== undefined)  company.ftpConfig.settings.allowedFileTypes = allowedFileTypes;
    if (maxFileSizeMB !== undefined)     company.ftpConfig.settings.maxFileSizeMB = Math.min(maxFileSizeMB, 200);
    if (autoProcessFiles !== undefined)  company.ftpConfig.settings.autoProcessFiles = autoProcessFiles;
    if (processMode !== undefined)       company.ftpConfig.settings.processMode = processMode;

    await company.save();

    res.json({ success: true, message: 'FTP configuration updated successfully' });
  } catch (error) {
    logger.error('[FtpAdmin] Error updating FTP config:', error);
    res.status(500).json({ error: 'Failed to update FTP configuration' });
  }
};

// ─── POST /admin/ftp/companies/:companyId/reset-password ────────────────────

export const resetFtpPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company || !company.ftpConfig?.enabled) {
      res.status(404).json({ error: 'Company or FTP access not found' });
      return;
    }

    const newPassword  = uuidv4().replace(/-/g, '').substring(0, 16);
    company.ftpConfig.passwordHash = await bcrypt.hash(newPassword, 12);
    await company.save();

    res.json({
      success: true,
      message: 'FTP password reset successfully',
      newCredentials: {
        username: company.ftpConfig.username,
        password: newPassword,
        server: process.env.FTP_PASV_URL || 'lgdeal.com',
        port: 21
      }
    });
  } catch (error) {
    logger.error('[FtpAdmin] Error resetting FTP password:', error);
    res.status(500).json({ error: 'Failed to reset FTP password' });
  }
};

// ─── DELETE /admin/ftp/companies/:companyId ──────────────────────────────────

export const deleteFtpAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }

    if (!company.ftpConfig?.enabled && !(company as any).legacyFtpConfig?.enabled) {
      res.status(400).json({ error: 'FTP access not found for this company' });
      return;
    }

    if (company.ftpConfig?.enabled) {
      company.ftpConfig.enabled = false;
      company.ftpConfig.isActive = false;
    }
    if ((company as any).legacyFtpConfig?.enabled) {
      (company as any).legacyFtpConfig.enabled = false;
    }
    await company.save();

    res.json({ success: true, message: 'FTP access deleted successfully' });
  } catch (error) {
    logger.error('[FtpAdmin] Error deleting FTP access:', error);
    res.status(500).json({ error: 'Failed to delete FTP access' });
  }
};

// ─── GET /admin/ftp/stats ────────────────────────────────────────────────────

export const getFtpStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalCompanies        = await Company.countDocuments({ isActive: true });
    const ftpEnabledCompanies   = await Company.countDocuments({ 'ftpConfig.enabled': true, isActive: true });
    const legacyEnabledCompanies= await Company.countDocuments({ 'legacyFtpConfig.enabled': true, isActive: true });

    const usageStats = await Company.aggregate([
      { $match: { 'ftpConfig.enabled': true, isActive: true } },
      { $group: { _id: null,
        totalConnections: { $sum: '$ftpConfig.connectionCount' },
        totalUploads:     { $sum: '$ftpConfig.totalUploadsCount' },
        totalBytes:       { $sum: '$ftpConfig.totalBytesUploaded' }
      }}
    ]);
    const u = usageStats[0] || { totalConnections: 0, totalUploads: 0, totalBytes: 0 };

    res.json({
      success: true,
      stats: {
        overview: {
          totalCompanies,
          ftpEnabledCompanies: ftpEnabledCompanies + legacyEnabledCompanies,
          ftpActiveCompanies:  ftpEnabledCompanies + legacyEnabledCompanies,
          enabledPercentage:   Math.round(((ftpEnabledCompanies + legacyEnabledCompanies) / (totalCompanies || 1)) * 100),
        },
        usage: {
          totalConnections: u.totalConnections,
          totalUploads:     u.totalUploads,
          totalBytesMB:     Math.round(u.totalBytes / 1024 / 1024),
        },
        topActiveCompanies: [],
      }
    });
  } catch (error) {
    logger.error('[FtpAdmin] Error getting FTP statistics:', error);
    res.status(500).json({ error: 'Failed to get FTP statistics' });
  }
};
