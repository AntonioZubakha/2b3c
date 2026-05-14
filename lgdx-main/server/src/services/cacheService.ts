import fs from 'fs';
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Единые настройки подключения ioredis-клиента кэша.
 *
 * ВАЖНО: в проде пароль/юзер приходят через REDIS_URL (или файл секрета
 * REDIS_URL_FILE). Раньше этот класс читал только отдельные REDIS_HOST /
 * REDIS_PASSWORD из окружения, которых в продовском контейнере нет —
 * в результате клиент подключался анонимно к защищённому Redis: TCP
 * вставал, команды молча отваливались (NOAUTH), а circuit-breaker
 * `if (!isConnected) return` глотал все записи. Теперь URL имеет
 * приоритет над отдельными переменными.
 */
const REDIS_CONNECTION_NAME = 'lgdx-cache';

function readRedisUrlFromFile(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    logger.warn('[CacheService] Failed to read REDIS_URL_FILE', {
      filePath,
      error: (error as Error)?.message || error
    });
    return undefined;
  }
}

function buildRedisOptions(): { options: RedisOptions; url?: string } {
  const commonOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectionName: REDIS_CONNECTION_NAME,
    /**
     * ioredis шлёт `INFO replication` после TCP-handshake, чтобы определить
     * роль сервера (master/replica). На нашем managed Redis эта команда
     * отклоняется (ACL / конфигурация), что вгоняет клиент в бесконечный
     * цикл reconnect. Кэш-клиенту ролевая информация не нужна.
     */
    enableReadyCheck: false,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  };

  const fileUrl = readRedisUrlFromFile(process.env.REDIS_URL_FILE);
  const envUrl = process.env.REDIS_URL;
  const url = fileUrl || envUrl;
  if (url) return { options: commonOptions, url };

  // Fallback: отдельные переменные (dev/local).
  return {
    options: {
      ...commonOptions,
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD
    }
  };
}

class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    const { options, url } = buildRedisOptions();
    this.redis = url ? new Redis(url, options) : new Redis(options);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('[CacheService] Connected to Redis');
    });

    this.redis.on('error', (error: Error) => {
      this.isConnected = false;
      logger.error('[CacheService] Redis connection error:', { error });
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      logger.warn('[CacheService] Redis connection closed');
    });
  }

  /**
   * Принудительно инициализирует соединение c Redis и ждёт, пока оно станет готово.
   * Из-за `lazyConnect: true` конструктор не поднимает соединение сразу, а флаг
   * `isConnected` включается лишь по событию 'connect' — это приводит к гонке,
   * когда первые вызовы `cache*` проваливаются «молча» (if (!isConnected) return).
   *
   * Вызывается на старте процесса, до прогрева кэшей, чтобы warmup реально писал
   * данные в Redis, а не оседал только в in-process memo.
   *
   * Реализация строго на событиях ioredis (без дополнительных команд вроде ping),
   * чтобы не создавать трафик до того, как клиент действительно готов.
   */
  async ensureReady(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isConnected) return true;
    const status = (this.redis as unknown as { status?: string }).status;
    if (status === 'ready') {
      this.isConnected = true;
      return true;
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        this.redis.off('ready', onReady);
        this.redis.off('error', onError);
      };
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onReady = () => {
        this.isConnected = true;
        finish(true);
      };
      const onError = (error: Error) => {
        logger.warn('[CacheService] ensureReady observed connection error', {
          error: error?.message || error
        });
        finish(false);
      };
      const timer = setTimeout(() => {
        logger.warn('[CacheService] ensureReady timed out', { timeoutMs });
        finish(false);
      }, timeoutMs);
      this.redis.once('ready', onReady);
      this.redis.once('error', onError);
      // Разогнать ленивое соединение; «already connecting/connected» игнорируем.
      void this.redis.connect().catch((error: Error) => {
        const msg = error?.message || '';
        if (!/already|connected|connecting/i.test(msg)) onError(error);
      });
    });
  }

  // Кэширование продуктов для корзины
  async cacheProducts(products: any[]): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const key = 'products:all';
      await this.redis.setex(key, 300, JSON.stringify(products)); // 5 минут
      logger.debug('[CacheService] Products cached successfully');
    } catch (error) {
      logger.error('[CacheService] Failed to cache products:', { error });
    }
  }

  async getCachedProducts(): Promise<any[] | null> {
    if (!this.isConnected) return null;
    
    try {
      const key = 'products:all';
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('[CacheService] Failed to get cached products:', { error });
      return null;
    }
  }

  // Кэширование пользовательских данных
  async cacheUserData(userId: string, userData: any): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const key = `user:${userId}`;
      await this.redis.setex(key, 600, JSON.stringify(userData)); // 10 минут
    } catch (error) {
      logger.error('[CacheService] Failed to cache user data:', { error });
    }
  }

  async getCachedUserData(userId: string): Promise<any | null> {
    if (!this.isConnected) return null;
    
    try {
      const key = `user:${userId}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('[CacheService] Failed to get cached user data:', { error });
      return null;
    }
  }

  // Кэширование данных сделок
  async cacheDealData(dealId: string, dealData: any): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const key = `deal:${dealId}`;
      await this.redis.setex(key, 180, JSON.stringify(dealData)); // 3 минуты
    } catch (error) {
      logger.error('[CacheService] Failed to cache deal data:', { error });
    }
  }

  async getCachedDealData(dealId: string): Promise<any | null> {
    if (!this.isConnected) return null;
    
    try {
      const key = `deal:${dealId}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('[CacheService] Failed to get cached deal data:', { error });
      return null;
    }
  }

  // Кэширование статистики
  async cacheStats(statsType: string, data: any): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const key = `stats:${statsType}`;
      await this.redis.setex(key, 60, JSON.stringify(data)); // 1 минута
    } catch (error) {
      logger.error('[CacheService] Failed to cache stats:', { error });
    }
  }

  async getCachedStats(statsType: string): Promise<any | null> {
    if (!this.isConnected) return null;
    
    try {
      const key = `stats:${statsType}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('[CacheService] Failed to get cached stats:', { error });
      return null;
    }
  }

  /**
   * Кэширование статистики с настраиваемым TTL.
   * Используется для долгоживущих агрегатов (home-stats и т.п.),
   * чтобы не упираться в дефолтный 60-секундный TTL `cacheStats`.
   */
  async cacheStatsWithTTL(statsType: string, data: any, ttlSec: number): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = `stats:${statsType}`;
      await this.redis.setex(key, Math.max(1, Math.floor(ttlSec)), JSON.stringify(data));
    } catch (error) {
      logger.error('[CacheService] Failed to cache stats with TTL:', { error });
    }
  }

  /**
   * Поставить временный "freshness" маркер.
   * Используется в SWR-логике: пока маркер существует — данные считаются свежими;
   * после истечения — основной кэш возвращается как stale, в фоне триггерится refresh.
   */
  async setMarker(key: string, ttlSec: number): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.redis.setex(`marker:${key}`, Math.max(1, Math.floor(ttlSec)), '1');
    } catch (error) {
      logger.error('[CacheService] Failed to set marker:', { error });
    }
  }

  async hasMarker(key: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const exists = await this.redis.exists(`marker:${key}`);
      return exists === 1;
    } catch (error) {
      logger.error('[CacheService] Failed to check marker:', { error });
      return false;
    }
  }

  /**
   * Простой Redis lock через SETNX с TTL.
   * Защита от thundering herd при stale-while-revalidate refresh:
   * только один воркер пересчитывает тяжёлый запрос, остальные пропускают.
   */
  async tryAcquireLock(key: string, ttlSec: number): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const result = await this.redis.set(`lock:${key}`, '1', 'EX', Math.max(1, Math.floor(ttlSec)), 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('[CacheService] Failed to acquire lock:', { error });
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.redis.del(`lock:${key}`);
    } catch (error) {
      logger.error('[CacheService] Failed to release lock:', { error });
    }
  }

  // Инвалидация кэша
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`[CacheService] Invalidated ${keys.length} cache entries for pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error('[CacheService] Failed to invalidate cache pattern:', { error });
    }
  }

  // Очистка всего кэша
  async clearAll(): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      await this.redis.flushdb();
      logger.info('[CacheService] All cache cleared');
    } catch (error) {
      logger.error('[CacheService] Failed to clear all cache:', { error });
    }
  }

  // Проверка соединения
  async ping(): Promise<boolean> {
    if (!this.isConnected) return false;
    
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('[CacheService] Ping failed:', { error });
      return false;
    }
  }

  // Получение статистики кэша
  async getStats(): Promise<any> {
    if (!this.isConnected) return null;
    
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      return { info, keyspace };
    } catch (error) {
      logger.error('[CacheService] Failed to get cache stats:', { error });
      return null;
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();
export default cacheService;
