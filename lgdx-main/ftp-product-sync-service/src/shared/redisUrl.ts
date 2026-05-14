/**
 * Resolves Redis URL for FTP service (file + env fallbacks).
 */

import { existsSync, readFileSync } from 'fs';
import { logger } from './logger';

export function resolveFtpRedisUrl(): string {
  const redisUrlFile = process.env.REDIS_URL_FILE || '/run/secrets/redis_url';
  if (existsSync(redisUrlFile)) {
    const url = readFileSync(redisUrlFile, 'utf8').trim();
    if (url) {
      logger.info('[Redis] Using Redis URL from file');
      return url;
    }
  }
  if (process.env.REDIS_URL) {
    logger.info('[Redis] Using Redis URL from environment variable');
    return process.env.REDIS_URL;
  }
  throw new Error('Redis URL not configured');
}
