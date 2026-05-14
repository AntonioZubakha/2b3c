import { createClient, type RedisClientType } from 'redis';
import { logger } from './logger';
import { config } from './config';

export class RedisLockManager {
  private redis: RedisClientType;
  private connected = false;
  private connecting: Promise<void> | null = null;

  constructor(redisUrl?: string) {
    const url = redisUrl || config.redisUrl;
    this.redis = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) return new Error('Max reconnection attempts reached');
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.redis.on('error', (err) => {
      logger.error({ err }, '[RedisLock] Redis error');
    });
    this.redis.on('connect', () => {
      this.connected = true;
      logger.info('[RedisLock] Redis connected');
    });
    this.redis.on('disconnect', () => {
      this.connected = false;
      logger.warn('[RedisLock] Redis disconnected');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = (async () => {
      try {
        await this.redis.connect();
        this.connected = true;
        logger.info('[RedisLock] Connected to Redis for distributed locking');
      } finally {
        this.connecting = null;
      }
    })();

    await this.connecting;
  }

  async disconnect(): Promise<void> {
    if (this.connecting) {
      try {
        await this.connecting;
      } catch {
        // ignore
      }
    }
    if (this.connected) {
      await this.redis.disconnect();
      this.connected = false;
    }
  }

  async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.connected) await this.connect();
    const result = await this.redis.set(key, value, { EX: ttlSeconds, NX: true });
    return result === 'OK';
  }

  async extendLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.connected) return false;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = (await this.redis.eval(script, {
      keys: [key],
      arguments: [value, ttlSeconds.toString()],
    })) as number;
    return result === 1;
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    if (!this.connected) return false;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = (await this.redis.eval(script, {
      keys: [key],
      arguments: [value],
    })) as number;
    return result === 1;
  }
}

let instance: RedisLockManager | null = null;

export function getRedisLockManager(): RedisLockManager {
  if (!instance) instance = new RedisLockManager();
  return instance;
}

export async function initializeRedisLock(): Promise<void> {
  await getRedisLockManager().connect();
}

export async function closeRedisLock(): Promise<void> {
  if (instance) await instance.disconnect();
}

