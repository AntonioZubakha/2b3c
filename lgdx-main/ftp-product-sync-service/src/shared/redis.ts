/**
 * Redis Connection для FTP Service
 */

import Redis from 'ioredis';
import { logger } from './logger';
import { resolveFtpRedisUrl } from './redisUrl';

let redisClient: Redis | null = null;

export async function connectToRedis(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = resolveFtpRedisUrl();

    // Создаем клиент
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`[Redis] Reconnecting attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      }
    });

    // Обработчики событий
    redisClient.on('connect', () => {
      logger.info('[Redis] Connecting to Redis...');
    });

    redisClient.on('ready', () => {
      logger.info('[Redis] ✅ Connected to Redis successfully');
    });

    redisClient.on('error', (error: Error) => {
      logger.error('[Redis] Redis connection error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('[Redis] Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('[Redis] Reconnecting to Redis...');
    });

    // Ждем подключения
    await redisClient.ping();
    logger.info('[Redis] Redis ping successful');

    return redisClient;
  } catch (error) {
    logger.error('[Redis] Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export async function disconnectFromRedis(): Promise<void> {
  if (redisClient) {
    logger.info('[Redis] Disconnecting from Redis...');
    await redisClient.quit();
    redisClient = null;
    logger.info('[Redis] ✅ Disconnected from Redis');
  }
}

