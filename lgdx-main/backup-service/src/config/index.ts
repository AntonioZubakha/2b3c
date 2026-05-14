import { BackupConfig } from '../types';
import * as fs from 'fs';
import { logger } from '../shared/logger';

// Helper: read Docker Swarm secret by name mounted to /run/secrets/<name>
const getDockerSecret = (secretName: string): string | undefined => {
  try {
    const secretPath = `/run/secrets/${secretName}`;
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (e) {
    logger.error(`[Config] Failed to read Docker secret ${secretName}`, { error: e });
  }
  return undefined;
};

// Helper: read value from *FILE env pattern
const getFromFileEnv = (envVarWithPath: string): string | undefined => {
  const filePath = process.env[envVarWithPath];
  if (!filePath) return undefined;
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  } catch (e) {
    logger.error(`[Config] Failed to read file from ${envVarWithPath}`, { filePath, error: e });
  }
  return undefined;
};

export const config: BackupConfig = {
  // Priority: explicit *_FILE -> secret names (both variants) -> plain env
  mongodbUri:
    getFromFileEnv('MONGODB_URI_FILE') ||
    getDockerSecret('mongodb_uri') ||
    getDockerSecret('lgdx_mongodb_uri') ||
    process.env['MONGODB_URI'] ||
    '',
  backupSchedule: process.env['BACKUP_SCHEDULE'] || '0 2 * * *', // Daily at 2 AM
  retentionCount: parseInt(process.env['RETENTION_COUNT'] || '7'),
  backupPath: process.env['BACKUP_PATH'] || '/app/backups',
  reportsPath: process.env['REPORTS_PATH'] || '/opt/lgdx/reports',
  reportsRetentionDays: parseInt(process.env['REPORTS_RETENTION_DAYS'] || '7', 10),
  reportsRetentionHours: parseInt(process.env['REPORTS_RETENTION_HOURS'] || '0', 10),
  /** Default: every 6h UTC — cheap readdir; keeps 24h retention accurate without waiting for daily backup */
  reportsCleanupSchedule: process.env['REPORTS_CLEANUP_SCHEDULE'] || '0 */6 * * *',
};

export const validateConfig = (): void => {
  const requiredFields = ['mongodbUri'];
  
  for (const field of requiredFields) {
    if (!config[field as keyof BackupConfig]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }
  if (process.env.NODE_ENV === 'production') {
    const hasFile = Boolean(process.env['MONGODB_URI_FILE']);
    const hasSecret = Boolean(getDockerSecret('mongodb_uri') || getDockerSecret('lgdx_mongodb_uri'));
    const hasEnv = Boolean(process.env['MONGODB_URI']);
    if (!hasFile && !hasSecret && !hasEnv) {
      throw new Error('[Security] MONGODB_URI must be provided via *_FILE, Docker secret, or environment in production');
    }
  }
  
  logger.info('[Config] Configuration validated successfully');
  logger.info('[Config] Backup configuration', {
    mongodbUri: config.mongodbUri.replace(/\/\/.*@/, '//***:***@'), // Маскируем пароль
    backupSchedule: config.backupSchedule,
    retentionCount: config.retentionCount,
    reportsRetentionHours: config.reportsRetentionHours,
    reportsRetentionDays: config.reportsRetentionHours > 0 ? '(unused; hours set)' : config.reportsRetentionDays,
    reportsCleanupSchedule: config.reportsCleanupSchedule
  });
}; 