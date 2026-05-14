import cron from 'node-cron';
import { backupService } from './services/backupService';
import { logger } from './utils/logger';
import { config } from './config';
import { getServiceCoordinator } from './utils/serviceCoordinator';

// Function to get Redis URL from file or environment variable
const getRedisUrl = () => {
  if (process.env.REDIS_URL_FILE) {
    try {
      const url = require('fs').readFileSync(process.env.REDIS_URL_FILE, 'utf8').trim();
      logger.info('[Scheduler] Read Redis URL from file');
      return url;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error('[Scheduler] Failed to read REDIS_URL_FILE', { error: errorMessage });
    }
  }
  const fallbackUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  logger.info('[Scheduler] Using Redis URL from env or default');
  return fallbackUrl;
};

export class BackupScheduler {
  private backupJob: cron.ScheduledTask | null = null;
  private reportsCleanupJob: cron.ScheduledTask | null = null;

  start(): void {
    logger.info('Starting backup scheduler');
    
    // Daily backup - every day at 2 AM (но теперь с координацией!)
    this.backupJob = cron.schedule(config.backupSchedule, async () => {
      logger.info('Starting scheduled backup');
      
      // Initialize Service Coordinator (для координации с api-sync!)
      const coordinator = getServiceCoordinator();
      const redisUrl = getRedisUrl();
      
      try {
        await coordinator.initialize(redisUrl);
        
        // КРИТИЧНО: Ждем завершения api-sync перед backup!
        logger.info('[Scheduler] Checking if api-sync is completed...');
        const canStart = await coordinator.waitForCompletion('api-sync', 7200000); // 2 часа max
        
        if (!canStart) {
          logger.warn('[Scheduler] ⚠️ api-sync still running after 2 hours timeout');
          logger.warn('[Scheduler] Skipping backup to avoid inconsistent data');
          await coordinator.close();
          return; // Пропускаем backup!
        }
        
        logger.info('[Scheduler] ✅ api-sync completed, starting backup');
        
        // Устанавливаем свой статус: начало backup
        await coordinator.setStatus('backup', {
          status: 'running',
          startedAt: new Date()
        });
        
        // Выполняем backup (существующая логика)
        await backupService.createBackup();
        
        logger.info('Scheduled backup completed');
        
        // Устанавливаем статус: успех
        await coordinator.setStatus('backup', {
          status: 'completed',
          completedAt: new Date()
        });
        
      } catch (error) {
        logger.error('Scheduled backup failed', { error: error instanceof Error ? error.message : error });
        
        // Устанавливаем статус: ошибка
        await coordinator.setStatus('backup', {
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        await coordinator.close();
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Reports cleanup: runs on its own schedule (no Mongo, no coordinator) — keeps disk bounded even if backup fails/skips
    this.reportsCleanupJob = cron.schedule(config.reportsCleanupSchedule, async () => {
      logger.info('[Scheduler] Scheduled reports retention cleanup');
      try {
        await backupService.cleanupOldReports();
      } catch (error) {
        logger.error('[Scheduler] Reports cleanup failed', {
          error: error instanceof Error ? error.message : error
        });
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('Backup scheduler started successfully');
    logger.info(`Schedule: ${config.backupSchedule} (every day at 2 AM)`);
    logger.info(`Reports cleanup schedule: ${config.reportsCleanupSchedule}`);
  }

  stop(): void {
    logger.info('Stopping backup scheduler');
    
    if (this.backupJob) {
      this.backupJob.stop();
      this.backupJob = null;
    }
    if (this.reportsCleanupJob) {
      this.reportsCleanupJob.stop();
      this.reportsCleanupJob = null;
    }
    
    logger.info('Backup scheduler stopped');
  }

  getStatus(): { running: boolean } {
    return {
      running: !!this.backupJob
    };
  }

  // Manual trigger method
  async triggerBackup(): Promise<void> {
    logger.info('Manually triggering backup');
    try {
      await backupService.createBackup();
      logger.info('Manual backup completed');
    } catch (error) {
      logger.error('Manual backup failed', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }
}

export const backupScheduler = new BackupScheduler(); 