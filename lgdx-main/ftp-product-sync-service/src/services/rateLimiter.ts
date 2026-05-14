/**
 * Rate Limiter для FTP загрузок
 * Ограничивает количество обработок файлов на компанию в сутки
 */

import Redis from 'ioredis';
import { logger } from '../shared/logger';
import { config } from '../shared/config';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  currentCount: number;
}

export class FtpRateLimiter {
  private redis: Redis;
  private readonly dailyLimit: number;
  private readonly windowSeconds: number;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
    this.dailyLimit = parseInt(process.env.FTP_UPLOAD_DAILY_LIMIT || '1', 10);
    this.windowSeconds = parseInt(process.env.FTP_UPLOAD_RATE_LIMIT_WINDOW || '43200', 10); // 12 hours
    
    logger.info('[RateLimiter] Initialized', {
      uploadLimit: this.dailyLimit,
      windowHours: this.windowSeconds / 3600,
      description: `${this.dailyLimit} upload(s) every ${this.windowSeconds / 3600} hours`
    });
  }

  /**
   * Проверяет и инкрементирует счетчик загрузок для компании
   */
  async checkAndIncrement(companyId: string, companyName: string): Promise<RateLimitResult> {
    const key = this.getRateLimitKey(companyId);
    
    try {
      // Используем Redis pipeline для атомарной операции
      const pipeline = this.redis.pipeline();
      
      // Инкрементируем счетчик
      pipeline.incr(key);
      
      // Устанавливаем TTL только если ключ новый
      pipeline.expire(key, this.windowSeconds, 'NX');
      
      // Получаем TTL для расчета resetAt
      pipeline.ttl(key);
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }
      
      const currentCount = results[0]?.[1] as number || 1;
      const ttl = results[2]?.[1] as number || this.windowSeconds;
      
      const allowed = currentCount <= this.dailyLimit;
      const remaining = Math.max(0, this.dailyLimit - currentCount);
      const resetAt = new Date(Date.now() + ttl * 1000);
      
      if (!allowed) {
        logger.warn('[RateLimiter] Rate limit exceeded', {
          companyId,
          companyName,
          currentCount,
          dailyLimit: this.dailyLimit,
          resetAt: resetAt.toISOString()
        });
      } else {
        logger.info('[RateLimiter] Rate limit check passed', {
          companyId,
          companyName,
          currentCount,
          remaining,
          resetAt: resetAt.toISOString()
        });
      }
      
      return {
        allowed,
        remaining,
        resetAt,
        currentCount
      };
    } catch (error) {
      logger.error('[RateLimiter] Error checking rate limit:', error);
      
      // В случае ошибки Redis - разрешаем (fail-open)
      // Лучше обработать файл, чем потерять данные
      return {
        allowed: true,
        remaining: this.dailyLimit,
        resetAt: new Date(Date.now() + this.windowSeconds * 1000),
        currentCount: 0
      };
    }
  }

  /**
   * Декрементирует счетчик (в случае отката или ошибки)
   */
  async decrement(companyId: string): Promise<void> {
    const key = this.getRateLimitKey(companyId);
    
    try {
      const current = await this.redis.get(key);
      if (current && parseInt(current, 10) > 0) {
        await this.redis.decr(key);
        logger.info('[RateLimiter] Decremented rate limit counter', { companyId });
      }
    } catch (error) {
      logger.error('[RateLimiter] Error decrementing rate limit:', error);
    }
  }

  /**
   * Получает текущий статус rate limit для компании
   */
  async getStatus(companyId: string): Promise<RateLimitResult> {
    const key = this.getRateLimitKey(companyId);
    
    try {
      const [currentCount, ttl] = await Promise.all([
        this.redis.get(key).then(val => parseInt(val || '0', 10)),
        this.redis.ttl(key)
      ]);
      
      const remaining = Math.max(0, this.dailyLimit - currentCount);
      const resetAt = ttl > 0 
        ? new Date(Date.now() + ttl * 1000)
        : new Date(Date.now() + this.windowSeconds * 1000);
      
      return {
        allowed: currentCount < this.dailyLimit,
        remaining,
        resetAt,
        currentCount
      };
    } catch (error) {
      logger.error('[RateLimiter] Error getting status:', error);
      
      return {
        allowed: true,
        remaining: this.dailyLimit,
        resetAt: new Date(Date.now() + this.windowSeconds * 1000),
        currentCount: 0
      };
    }
  }

  /**
   * Сбрасывает rate limit для компании (админ функция)
   */
  async reset(companyId: string): Promise<void> {
    const key = this.getRateLimitKey(companyId);
    
    try {
      await this.redis.del(key);
      logger.info('[RateLimiter] Reset rate limit', { companyId });
    } catch (error) {
      logger.error('[RateLimiter] Error resetting rate limit:', error);
    }
  }

  private getRateLimitKey(companyId: string): string {
    return `ftp:rate_limit:${companyId}`;
  }

  /**
   * Закрывает соединение с Redis (для graceful shutdown)
   */
  async close(): Promise<void> {
    // Не закрываем Redis connection здесь, так как он может использоваться другими сервисами
    logger.info('[RateLimiter] Shutting down');
  }
}

