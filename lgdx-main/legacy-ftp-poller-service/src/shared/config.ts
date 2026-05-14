import { readSecretFileOrFallback } from './secrets';

function applyRabbitmqHostOverride(urlString: string): string {
  const override = process.env.RABBITMQ_HOST_OVERRIDE?.trim();
  if (!override) return urlString;
  try {
    const isTls = urlString.startsWith('amqps://');
    const u = new URL(urlString.replace(/^amqps?:\/\//, 'http://'));
    u.hostname = override;
    return u.toString().replace(/^http:\/\//, isTls ? 'amqps://' : 'amqp://');
  } catch {
    return urlString;
  }
}

export const config = {
  mongoUri: readSecretFileOrFallback(
    process.env.MONGODB_URI_FILE,
    process.env.MONGODB_URI || 'mongodb://localhost:27018/lgdx',
  ),
  redisUrl: readSecretFileOrFallback(
    process.env.REDIS_URL_FILE,
    process.env.REDIS_URL || 'redis://localhost:6379',
  ),
  rabbitmqUrl: applyRabbitmqHostOverride(
    readSecretFileOrFallback(
      process.env.RABBITMQ_URL_FILE,
      process.env.RABBITMQ_URL || 'amqp://lgdx:lgdx2024@localhost:5672',
    ),
  ),
  // AES-256-GCM key for legacy FTP passwords (64 hex chars = 32 bytes)
  cryptoKey: readSecretFileOrFallback(
    process.env.LEGACY_FTP_CRYPTO_KEY_FILE,
    process.env.LEGACY_FTP_CRYPTO_KEY || '',
  ),
  // Cron schedule: every 12 hours
  cronSchedule: process.env.POLL_CRON_SCHEDULE || '0 */12 * * *',
  // Max companies to poll in parallel
  concurrency: parseInt(process.env.POLL_CONCURRENCY || '3', 10),
  // Shared volume path (same as ftp-service and file-import-service)
  ftpDataPath: process.env.FTP_DATA_PATH || '/app/ftp-data',
  // Max consecutive errors before auto-disabling a company
  maxConsecutiveErrors: parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '5', 10),
  // File upload queue name (must match ftp-product-sync-service)
  fileUploadQueue: 'file_upload_tasks',
};
