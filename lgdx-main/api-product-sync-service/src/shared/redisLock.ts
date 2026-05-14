/**
 * Redis Distributed Lock Manager
 * Prevents concurrent sync operations for the same company
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';
import { getRedisUrlFromEnv } from './configSources';

export class RedisLockManager {
  private redis: RedisClientType;
  private connected: boolean = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || getRedisUrlFromEnv();
    
    this.redis = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('[RedisLock] Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    this.redis.on('error', (err) => {
      logger.error('[RedisLock] Redis error:', err);
    });

    this.redis.on('connect', () => {
      logger.info('[RedisLock] Redis connected');
      this.connected = true;
    });

    this.redis.on('disconnect', () => {
      logger.warn('[RedisLock] Redis disconnected');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
      logger.info('[RedisLock] Connected to Redis for distributed locking');
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.disconnect();
      logger.info('[RedisLock] Disconnected from Redis');
    }
  }

  /**
   * Попытка получить distributed lock
   * @param key - Ключ lock (например: sync:lock:companyId)
   * @param value - Уникальное значение (taskId) для идентификации владельца
   * @param ttlSeconds - Time to live в секундах (защита от зависших locks)
   * @returns true если lock получен, false если занят
   */
  async acquireLock(key: string, value: string, ttlSeconds: number = 300): Promise<boolean> {
    try {
      if (!this.connected) {
        logger.warn('[RedisLock] Not connected, attempting to connect...');
        await this.connect();
      }
      
      // SET key value EX ttl NX - atomic operation
      const result = await this.redis.set(key, value, {
        EX: ttlSeconds,
        NX: true
      });
      
      const acquired = result === 'OK';
      
      if (acquired) {
        logger.info('[RedisLock] 🔒 Lock acquired', { key, value, ttl: ttlSeconds });
      } else {
        logger.warn('[RedisLock] 🔒 Lock busy', { key });
      }
      
      return acquired;
    } catch (error) {
      logger.error('[RedisLock] Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Освободить lock (только если это наш lock)
   * @param key - Ключ lock
   * @param value - Наше значение для проверки ownership
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    try {
      // Shutdown calls disconnect() while a consumer may still finish work in `finally`.
      // Without reconnect we never DEL the key → stale lock blocks retries until TTL.
      if (!this.connected) {
        logger.warn('[RedisLock] Not connected when releasing lock — reconnecting to delete key');
        try {
          await this.connect();
        } catch (reconnectErr) {
          logger.error('[RedisLock] Could not reconnect to release lock', { error: reconnectErr });
          return false;
        }
      }
      
      // Lua script для atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      // redis v4 API: evalSha or eval with keys count
      const result = await this.redis.eval(script, {
        keys: [key],
        arguments: [value]
      }) as number;
      
      const released = result === 1;
      
      if (released) {
        logger.info('[RedisLock] 🔓 Lock released', { key, value });
      } else {
        logger.warn('[RedisLock] 🔓 Lock not released (not owner or already released)', { key });
      }
      
      return released;
    } catch (error) {
      logger.error('[RedisLock] Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Проверить занят ли lock
   */
  async isLocked(key: string): Promise<boolean> {
    try {
      const value = await this.redis.get(key);
      return value !== null;
    } catch (error) {
      logger.error('[RedisLock] Error checking lock:', error);
      return false;
    }
  }

  /**
   * Получить информацию о lock
   */
  async getLockInfo(key: string): Promise<{ locked: boolean; by?: string; ttl?: number }> {
    try {
      if (!this.connected) {
        logger.warn('[RedisLock] Not connected when getting lock info');
        return { locked: false };
      }
      
      const value = await this.redis.get(key);
      
      if (!value) {
        return { locked: false };
      }
      
      const ttl = await this.redis.ttl(key);
      
      return { 
        locked: true, 
        by: value, 
        ttl: ttl > 0 ? ttl : undefined 
      };
    } catch (error) {
      logger.error('[RedisLock] Error getting lock info:', error);
      return { locked: false };
    }
  }

  /**
   * Продлить TTL существующего lock (если мы владельцы)
   */
  async extendLock(key: string, value: string, additionalSeconds: number): Promise<boolean> {
    try {
      if (!this.connected) {
        logger.warn('[RedisLock] Not connected when extending lock');
        return false;
      }
      
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      
      const result = await this.redis.eval(script, {
        keys: [key],
        arguments: [value, additionalSeconds.toString()]
      }) as number;
      
      return result === 1;
    } catch (error) {
      logger.error('[RedisLock] Error extending lock:', error);
      return false;
    }
  }

  /**
   * Удалить произвольный ключ (например sync:enqueue:{companyId} после взятия задачи из очереди).
   */
  async deleteKey(key: string): Promise<number> {
    try {
      if (!this.connected) {
        await this.connect();
      }
      return await this.redis.del(key);
    } catch (error) {
      logger.error('[RedisLock] Error deleting key', { key, error });
      return 0;
    }
  }
}

// Singleton instance
let lockManagerInstance: RedisLockManager | null = null;

export function getRedisLockManager(): RedisLockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new RedisLockManager();
  }
  return lockManagerInstance;
}

export async function initializeRedisLock(): Promise<void> {
  const manager = getRedisLockManager();
  await manager.connect();
}

export async function closeRedisLock(): Promise<void> {
  if (lockManagerInstance) {
    await lockManagerInstance.disconnect();
  }
}

