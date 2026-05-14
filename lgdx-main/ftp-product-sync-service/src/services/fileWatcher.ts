/**
 * Мониторинг файлов FTP для автоматической обработки
 */

import * as chokidar from 'chokidar';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { logger } from '../shared/logger';
import { config } from '../shared/config';
import { sendToQueue, FILE_UPLOAD_QUEUE } from '../shared/rabbitmq';
import Company from '../models/Company';
import { FtpMetrics } from './metrics';
import { FtpRateLimiter } from './rateLimiter';
import { TelegramNotifier } from './telegramNotifier';

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

export type FileProcessOutcome = 'queued' | 'skipped' | 'failed';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private running = false;
  private processingFiles = new Set<string>();
  private metrics: FtpMetrics;
  private rateLimiter: FtpRateLimiter | null;
  private telegramNotifier: TelegramNotifier | null;

  constructor(
    metrics?: FtpMetrics,
    rateLimiter?: FtpRateLimiter,
    telegramNotifier?: TelegramNotifier
  ) {
    this.metrics = metrics || new FtpMetrics();
    this.rateLimiter = rateLimiter || null;
    this.telegramNotifier = telegramNotifier || null;
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[FileWatcher] Already running');
      return;
    }

    try {
      // Watch the same root as FTP server uses for chroot (`config.ftpDataPath/<companyId>/...`)
      const watchRoot = config.ftpDataPath;
      logger.info('[FileWatcher] Starting file watcher', { watchRoot });

      this.watcher = chokidar.watch(watchRoot, {
        ignoreInitial: true,
        depth: 4, // <root>/{companyId}/...
        awaitWriteFinish: {
          stabilityThreshold: 5000, // Wait 5 seconds for file stability
          pollInterval: 500
        },
        ignored: /(^|[\/\\])\../ // ignore dotfiles
      });

      this.setupEventHandlers();
      this.running = true;

      logger.info('[FileWatcher] ✅ File watcher started successfully');
    } catch (error) {
      logger.error('[FileWatcher] ❌ Failed to start file watcher:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher
      .on('add', (filePath: string) => this.handleFileEvent(filePath, 'add'))
      .on('change', (filePath: string) => this.handleFileEvent(filePath, 'change'))
      .on('error', (error: Error) => {
        logger.error('[FileWatcher] ❌ Watcher error:', error);
        this.metrics.recordError('watcher_error', { error: error.message });
      });
  }

  private async handleFileEvent(filePath: string, event: 'add' | 'change'): Promise<void> {
    if (this.processingFiles.has(filePath)) {
      logger.debug(`[FileWatcher] File already being processed: ${filePath}`);
      return;
    }

    this.processingFiles.add(filePath);
    
    try {
      logger.info(`[FileWatcher] File ${event}: ${filePath}`);
      await this.processFile(filePath, {});
    } catch (error) {
      // Исправляем логирование ошибок для видимости полной ошибки
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error(`[FileWatcher] ❌ Error processing file ${filePath}: ${errorMessage}`);
      if (errorStack) {
        logger.error(`[FileWatcher] ❌ Error stack: ${errorStack}`);
      }
      this.metrics.recordError('file_processing_error', { filePath, error: errorMessage });
    } finally {
      this.processingFiles.delete(filePath);
    }
  }

  /**
   * Admin-triggered rescan: обход того же дерева, что и NEW FTP — все файлы под
   * {ftpDataPath}/{companyId}/ с допустимыми расширениями (рекурсивно).
   * Совпадает с тем, куда CompanyFileSystem.write кладёт загрузки (корень companyId),
   * и с подпапкой files/, если файлы там оказались. Папка failed/ пропускается.
   */
  async rescanCompanyFiles(companyId: string): Promise<{
    scanned: number;
    enqueued: number;
    skipped: number;
    failed: number;
    errors: { path: string; reason: string }[];
  }> {
    if (!OBJECT_ID_RE.test(companyId)) {
      return { scanned: 0, enqueued: 0, skipped: 0, failed: 0, errors: [{ path: companyId, reason: 'Invalid company id' }] };
    }
    const root = path.join(config.ftpDataPath, companyId);
    let scanned = 0;
    let enqueued = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { path: string; reason: string }[] = [];

    try {
      await fs.access(root);
    } catch {
      logger.warn('[FileWatcher] rescan: company directory missing', { root });
      return { scanned: 0, enqueued: 0, skipped: 0, failed: 0, errors: [{ path: root, reason: 'Directory not found' }] };
    }

    const candidates = await this.listDataFilesUnderCompanyRoot(root);
    logger.info('[FileWatcher] Admin rescan starting', { companyId, fileCount: candidates.length });

    for (const filePath of candidates) {
      scanned++;
      try {
        const outcome = await this.processFile(filePath, { bypassRateLimit: true });
        if (outcome === 'queued') enqueued++;
        else if (outcome === 'failed') failed++;
        else skipped++;
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        errors.push({ path: filePath, reason });
        logger.error({ err, filePath }, '[FileWatcher] rescan: unexpected error');
      }
    }

    logger.info('[FileWatcher] Admin rescan complete', { companyId, scanned, enqueued, skipped, failed });
    return { scanned, enqueued, skipped, failed, errors };
  }

  private async listDataFilesUnderCompanyRoot(root: string): Promise<string[]> {
    const out: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'failed') continue;
          await walk(full);
          continue;
        }
        if (!ent.isFile()) continue;
        if (ent.name.endsWith('.reason.txt')) continue;
        const ext = path.extname(ent.name).toLowerCase().replace(/^\./, '');
        if (!config.ftpAllowedFileTypes.includes(ext)) continue;
        out.push(full);
      }
    };

    await walk(root);
    return out;
  }

  private async processFile(
    filePath: string,
    options: { bypassRateLimit?: boolean }
  ): Promise<FileProcessOutcome> {
    // Извлекаем ID компании из пути
    const companyId = this.extractCompanyId(filePath);
    if (!companyId) {
      logger.warn(`[FileWatcher] Could not extract company ID from path: ${filePath}`);
      return 'skipped';
    }

    // Получаем информацию о компании
    const company = await Company.findById(companyId);
    if (!company) {
      logger.warn(`[FileWatcher] Company not found: ${companyId}`);
      return 'skipped';
    }

    // Проверяем, что FTP включен и автообработка активна
    if (!company.ftpConfig?.enabled || !company.ftpConfig?.settings?.autoProcessFiles) {
      logger.info(`[FileWatcher] Auto-processing disabled for company: ${company.name}`);
      return 'skipped';
    }

    // Проверяем rate limit (максимум загрузок в сутки)
    if (!options.bypassRateLimit && this.rateLimiter) {
      const rateLimitResult = await this.rateLimiter.checkAndIncrement(companyId, company.name);
      
      if (!rateLimitResult.allowed) {
        const fileName = path.basename(filePath);
        const resetTime = rateLimitResult.resetAt.toISOString().replace('T', ' ').substring(0, 19);
        
        logger.warn(`[FileWatcher] Rate limit exceeded for company: ${company.name}`, {
          companyId,
          fileName,
          currentCount: rateLimitResult.currentCount,
          resetAt: rateLimitResult.resetAt.toISOString()
        });
        
        // Отправляем уведомление в Telegram
        if (this.telegramNotifier) {
          await this.telegramNotifier.sendRateLimitExceeded(
            company.name,
            fileName,
            rateLimitResult.currentCount,
            rateLimitResult.resetAt
          );
        }
        
        // Записываем метрику
        this.metrics.recordError('rate_limit_exceeded', {
          companyId,
          companyName: company.name,
          fileName
        });
        
        // НЕ удаляем файл - он останется для следующей попытки после сброса лимита
        // Просто пропускаем обработку
        return 'skipped';
      }
      
      logger.info(`[FileWatcher] Rate limit check passed`, {
        companyId,
        companyName: company.name,
        remaining: rateLimitResult.remaining,
        currentCount: rateLimitResult.currentCount
      });
    }

    // Валидация файла
    const validation = await this.validateFile(filePath);
    if (!validation.isValid) {
      logger.warn(`[FileWatcher] File validation failed: ${validation.reason}`);
      await this.moveToFailedDirectory(filePath, validation.reason || 'Unknown error');
      return 'failed';
    }

    // Логируем начало обработки
    const fileName = path.basename(filePath);
    this.metrics.recordFileProcessing(companyId, fileName, 'started');

    // Отправляем задачу в RabbitMQ
    const payload = {
      filePath,
      // Never send full company doc through RabbitMQ: it contains sensitive fields (e.g. ftpConfig.passwordHash).
      // The processing service only needs minimal identification + settings.
      companyDoc: {
        _id: company._id,
        name: company.name,
        ftpConfig: company.ftpConfig
          ? {
              enabled: company.ftpConfig.enabled,
              isActive: company.ftpConfig.isActive,
              settings: company.ftpConfig.settings
                ? {
                    autoProcessFiles: company.ftpConfig.settings.autoProcessFiles,
                    processMode: company.ftpConfig.settings.processMode,
                  }
                : undefined,
            }
          : undefined,
      },
      companyName: company.name,
      originalFileName: fileName,
      uploadMode: 'replace', // FTP always replaces inventory (same as API sync)
      source: 'ftp',
      uploadedAt: new Date().toISOString(),
      fileSize: validation.fileSize
    };

    await sendToQueue(FILE_UPLOAD_QUEUE, payload);
    
    logger.info(`[FileWatcher] ✅ File queued for processing: ${fileName} (Company: ${company.name})`);
    this.metrics.recordFileUpload(companyId, fileName, validation.fileSize || 0);
    
    // Note: File will be deleted by the processing service after successful import
    return 'queued';
  }

  private extractCompanyId(filePath: string): string | null {
    try {
      const relative = path.relative(config.ftpDataPath, filePath);
      const parts = relative.split(path.sep).filter(Boolean);
      const candidate = parts[0];
      if (candidate && OBJECT_ID_RE.test(candidate)) return candidate;
      logger.warn('[FileWatcher] Could not extract company ID from path', { filePath, relative });
      return null;
    } catch {
      return null;
    }
  }

  private async validateFile(filePath: string): Promise<{ isValid: boolean; reason?: string; fileSize?: number }> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(fileName).toLowerCase().substring(1);

      // Проверка типа файла
      if (!config.ftpAllowedFileTypes.includes(fileExtension)) {
        return {
          isValid: false,
          reason: `Unsupported file type: ${fileExtension}. Allowed: ${config.ftpAllowedFileTypes.join(', ')}`
        };
      }

      // Проверка размера файла
      // Prefer per-company quota if present (DB), but keep global fallback.
      const maxSizeBytes = config.ftpMaxFileSizeMB * 1024 * 1024;
      if (fileSize > maxSizeBytes) {
        return {
          isValid: false,
          reason: `File size exceeds limit: ${Math.round(fileSize / 1024 / 1024)}MB > ${config.ftpMaxFileSizeMB}MB`
        };
      }

      return { isValid: true, fileSize };
    } catch (error) {
      return {
        isValid: false,
        reason: `File access error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async moveToFailedDirectory(filePath: string, reason: string): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const failedDir = path.join(path.dirname(filePath), 'failed');
      
      // Создаем папку failed если не существует
      await fs.mkdir(failedDir, { recursive: true });
      
      const failedPath = path.join(failedDir, fileName);
      await fs.rename(filePath, failedPath);
      
      // Создаем файл с причиной отклонения
      const reasonPath = path.join(failedDir, `${fileName}.reason.txt`);
      await fs.writeFile(reasonPath, `Failed: ${reason}\nTime: ${new Date().toISOString()}`);
      
      logger.info(`[FileWatcher] File moved to failed directory: ${fileName} (Reason: ${reason})`);
    } catch (error) {
      logger.error(`[FileWatcher] ❌ Failed to move file to failed directory:`, error);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.running = false;
      logger.info('[FileWatcher] ✅ File watcher stopped');
    } catch (error) {
      logger.error('[FileWatcher] ❌ Error stopping file watcher:', error);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getProcessingCount(): number {
    return this.processingFiles.size;
  }
}
