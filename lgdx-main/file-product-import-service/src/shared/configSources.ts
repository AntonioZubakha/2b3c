/**
 * Centralized reading of secrets from *_FILE env vars and fallbacks.
 * Preserves legacy behavior from index.ts (order of resolution and default URLs).
 */

import { logger } from './logger';

type FsSync = {
  readFileSync: (path: string, encoding: 'utf8') => string;
};

function readFs(): FsSync {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('fs');
}

function readSecretFromFileEnv(envVarName: string): string | undefined {
  const filePath = process.env[envVarName];
  if (!filePath) return undefined;
  try {
    const content = readFs().readFileSync(filePath, 'utf8').trim();
    return content || undefined;
  } catch (e) {
    logger.error(`[Config] Failed to read ${envVarName}`, { error: e });
    return undefined;
  }
}

/** MongoDB: MONGODB_URI_FILE → MONGODB_URI → default (same as previous index.ts). */
export function getMongoUriFileImport(): string {
  if (process.env.MONGODB_URI_FILE) {
    const fromFile = readSecretFromFileEnv('MONGODB_URI_FILE');
    if (fromFile !== undefined) return fromFile;
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27018/lgdx';
}

/** RabbitMQ: RABBITMQ_URL_FILE → RABBITMQ_URL → default with dev credentials (legacy index.ts). */
export function getRabbitUrlFileImport(): string {
  if (process.env.RABBITMQ_URL_FILE) {
    const fromFile = readSecretFromFileEnv('RABBITMQ_URL_FILE');
    if (fromFile !== undefined) return fromFile;
  }
  return process.env.RABBITMQ_URL || 'amqp://lgdx:lgdx2024@localhost:5672';
}

/**
 * Base Redis URL before REDIS_HOST_OVERRIDE (see RedisLockManager.applyRedisHostOverride).
 */
export function getRedisBaseUrlFileImport(): string {
  if (process.env.REDIS_URL_FILE) {
    try {
      const url = readFs().readFileSync(process.env.REDIS_URL_FILE, 'utf8').trim();
      if (url) return url;
    } catch (e) {
      logger.error('[RedisLock] Failed to read REDIS_URL_FILE');
    }
    return process.env.REDIS_URL || 'redis://redis:6379';
  }
  return process.env.REDIS_URL || 'redis://redis:6379';
}
