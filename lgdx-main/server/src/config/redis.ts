/**
 * Redis Client Configuration
 * 
 * Используется для:
 * - Service coordination (координация запуска микросервисов)
 * - Caching (если потребуется в будущем)
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;

/**
 * In Docker Swarm, redis_url may reference a host that only resolves on the host, not in the overlay
 * (e.g. stack-prefixed name). Same pattern as file-product-import-service REDIS_HOST_OVERRIDE.
 */
function applyRedisHostOverride(urlString: string): string {
  const override = process.env.REDIS_HOST_OVERRIDE;
  if (!override) return urlString;
  try {
    const isTls = urlString.startsWith('rediss://');
    const u = new URL(urlString.replace(/^rediss?:\/\//, 'http://'));
    u.hostname = override;
    return u.toString().replace(/^http:\/\//, isTls ? 'rediss://' : 'redis://');
  } catch {
    return urlString;
  }
}

/**
 * Получить Redis URL из файла секрета или переменной окружения
 */
function getRedisUrl(): string {
  const isProd = process.env.NODE_ENV === 'production';
  // Пробуем получить из файла секрета (production)
  const redisUrlFilePath = process.env.REDIS_URL_FILE;
  if (redisUrlFilePath) {
    try {
      const fs = require('fs');
      const raw = fs.readFileSync(redisUrlFilePath, 'utf8').trim();
      return applyRedisHostOverride(raw);
    } catch (error) {
      logger.error('[Redis] Failed to read REDIS_URL_FILE', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Fallback на переменную окружения (development)
  if (process.env.REDIS_URL) return applyRedisHostOverride(process.env.REDIS_URL);
  if (isProd) {
    throw new Error('[Security] REDIS_URL (or REDIS_URL_FILE) is required in production');
  }
  return 'redis://localhost:6379';
}

/**
 * Инициализация Redis клиента
 */
export async function initializeRedisClient(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = getRedisUrl();
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('[Redis] Max reconnection attempts reached');
            return new Error('Redis max reconnection attempts');
          }
          // Exponential backoff: 100ms, 200ms, 400ms, ...
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    });

    // Обработчики событий
    redisClient.on('error', (err) => {
      logger.error('[Redis] Client error:', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected');
    });

    redisClient.on('ready', () => {
      logger.info('[Redis] Ready to accept commands');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('[Redis] Reconnecting...');
    });

    // Подключаемся
    await redisClient.connect();
    
    logger.info('[Redis] Client initialized successfully');
    return redisClient;
  } catch (error) {
    logger.error('[Redis] Failed to initialize client:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

/**
 * Получить существующий Redis клиент (должен быть инициализирован!)
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedisClient() first.');
  }
  return redisClient;
}

/**
 * Закрыть Redis соединение (для graceful shutdown)
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('[Redis] Connection closed');
      redisClient = null;
    } catch (error) {
      logger.error('[Redis] Error closing connection:', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
}

/**
 * Проверка здоровья Redis
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('[Redis] Health check failed:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return false;
  }
}

