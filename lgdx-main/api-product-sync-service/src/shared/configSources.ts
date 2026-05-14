/**
 * Centralized reading of secrets from *_FILE env vars and fallbacks.
 * Keeps behavior identical to previous per-module helpers.
 */

import fs from 'fs';
import { logger } from './logger';

function readSecretFromFileEnv(envVarName: string): string | undefined {
  const filePath = process.env[envVarName];
  if (!filePath) return undefined;
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content || undefined;
  } catch (e) {
    logger.error(`[Config] Failed to read ${envVarName}`, { error: e });
    return undefined;
  }
}

/** Same as legacy index.ts: MONGODB_URI_FILE → MONGODB_URI (no default). */
export function getMongoUriPrimary(): string | undefined {
  if (process.env.MONGODB_URI_FILE) {
    const fromFile = readSecretFromFileEnv('MONGODB_URI_FILE');
    if (fromFile !== undefined) return fromFile;
  }
  return process.env.MONGODB_URI;
}

/** Worker: primary or default local MongoDB. */
export function getMongoUriWorker(): string {
  const uri = getMongoUriPrimary();
  if (uri) return uri;
  return 'mongodb://localhost:27018/lgdx';
}

/** Swarm: secret may use host `rabbitmq`; overlay DNS is `lgdx_rabbitmq` (stack_service). */
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

/** RabbitMQ URL (worker / scheduler). */
export function getRabbitUrlFromEnv(): string {
  let raw: string | undefined;
  if (process.env.RABBITMQ_URL_FILE) {
    raw = readSecretFromFileEnv('RABBITMQ_URL_FILE');
    if (raw !== undefined) return applyRabbitmqHostOverride(raw);
  }
  raw = process.env.RABBITMQ_URL || 'amqp://localhost';
  return applyRabbitmqHostOverride(raw);
}

/** Redis URL (scheduler coordinator, redis lock default). */
export function getRedisUrlFromEnv(): string {
  if (process.env.REDIS_URL_FILE) {
    const fromFile = readSecretFromFileEnv('REDIS_URL_FILE');
    if (fromFile !== undefined) return fromFile;
  }
  // Aligned with legacy RedisLockManager default (docker service name `redis` in many stacks).
  return process.env.REDIS_URL || 'redis://redis:6379';
}
