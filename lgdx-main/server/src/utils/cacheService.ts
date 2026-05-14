import { createClient, RedisClientType } from 'redis';
import fs from 'fs';
import { logger } from './logger';

// Function to get Redis URL from file or environment variable
const getRedisUrl = () => {
  if (process.env.REDIS_URL_FILE) {
    try {
      const urlFromFile = fs.readFileSync(process.env.REDIS_URL_FILE, 'utf8').trim();
    logger.info('[Config] Using Redis URL from file');
      return urlFromFile;
    } catch (e) {
    logger.error('[Config] Failed to read REDIS_URL_FILE:', { error: e });
    }
  }
  
  if (process.env.REDIS_URL) {
  logger.info('[Config] Using Redis URL from environment variable');
    return process.env.REDIS_URL;
  }
  
  logger.info('[Config] Using default Redis URL');
  return 'redis://127.0.0.1:6379';
};

// In-memory cache fallback when Redis is not available
interface InMemoryCacheItem {
  value: string;
  expiry: number;
}

class InMemoryCache {
  private cache = new Map<string, InMemoryCacheItem>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired items every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  get(key: string): string | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  set(key: string, value: string, ttlSeconds = 3600): void {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiry });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  exists(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  flushPattern(pattern: string): void {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

interface CacheServiceInterface {
  isConnected: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  flushPattern(pattern: string): Promise<void>;
  disconnect(): Promise<void>;
}

class CacheService implements CacheServiceInterface {
  private client: any = null;
  public isConnected = false;
  private memoryCache = new InMemoryCache();

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      const redisUrl = getRedisUrl();
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000
        }
      });

      // Set up error handlers before connecting
      this.client.on('error', (err: any) => {
        // Only log first error to avoid spam
        if (this.isConnected) {
        logger.warn('[CacheService] Redis client disconnected:', { error: err.message });
        }
        this.isConnected = false;
      });

      this.client.on('connect', () => {
      logger.info('[CacheService] Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
      logger.warn('[CacheService] Redis client disconnected');
        this.isConnected = false;
      });

      // Try to connect with timeout
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      
    logger.info('[CacheService] Redis connected successfully');
      this.isConnected = true;
      
    } catch (error: any) {
    logger.warn('[CacheService] Redis connection failed, using in-memory cache', { error: error.message });
      this.client = null;
      this.isConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (error) {
      logger.error('[CacheService] Redis get error, falling back to memory', { error });
        this.isConnected = false;
      }
    }

    // Fallback to in-memory cache
    return this.memoryCache.get(key);
  }

  async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.setEx(key, ttlSeconds, value);
        return;
      } catch (error) {
      logger.error('[CacheService] Redis set error, falling back to memory', { error });
        this.isConnected = false;
      }
    }

    // Fallback to in-memory cache
    this.memoryCache.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (error) {
      logger.error('[CacheService] Redis del error, falling back to memory', { error });
        this.isConnected = false;
      }
    }

    // Fallback to in-memory cache
    this.memoryCache.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        const result = await this.client.exists(key);
        return result === 1;
      } catch (error) {
      logger.error('[CacheService] Redis exists error, falling back to memory', { error });
        this.isConnected = false;
      }
    }

    // Fallback to in-memory cache
    return this.memoryCache.exists(key);
  }

  async flushPattern(pattern: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        logger.info(`[CacheService] Deleted ${keys.length} Redis keys matching pattern: ${pattern}`);
        }
        return;
      } catch (error) {
      logger.error('[CacheService] Redis flushPattern error, falling back to memory', { error });
        this.isConnected = false;
      }
    }

    // Fallback to in-memory cache
    this.memoryCache.flushPattern(pattern);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
      logger.error('[CacheService] Error disconnecting Redis', { error });
      }
      this.client = null;
      this.isConnected = false;
    }
    
    this.memoryCache.destroy();
  }
}

// Singleton instance
export const cacheService = new CacheService();

// Helper functions for common cache patterns
export const CacheKeys = {
  USER_CART: (userId: string) => `cart:user:${userId}`,
  JWT_REVOKED: (jti: string) => `auth:revoked:${jti}`,
  PRODUCT_DETAILS: (productId: string) => `product:${productId}`,
  COMPANY_PRODUCTS: (companyId: string, page: number, limit: number) => `products:company:${companyId}:page:${page}:limit:${limit}`,
  MARKETPLACE_SEARCH: (query: string) => `marketplace:search:${Buffer.from(query).toString('base64')}`,
  USER_DEALS: (userId: string) => `deals:user:${userId}`,
  COMPANY_API_CONFIG: (companyId: string) => `api:config:${companyId}`
};

export const CacheTTL = {
  CART: 1800, // 30 minutes
  PRODUCT: 3600, // 1 hour
  SEARCH: 300, // 5 minutes  
  DEALS: 600, // 10 minutes
  CONFIG: 7200 // 2 hours
};

// Helper function to safely cache JSON data
export const cacheJSON = async (key: string, data: any, ttl?: number): Promise<void> => {
  try {
    const jsonString = JSON.stringify(data);
    await cacheService.set(key, jsonString, ttl);
  } catch (error) {
    logger.error('[CacheService] Error caching JSON', { error });
  }
};

// Helper function to safely retrieve and parse JSON data
export const getCachedJSON = async <T>(key: string): Promise<T | null> => {
  try {
    const jsonString = await cacheService.get(key);
    if (!jsonString) return null;
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.error('[CacheService] Error retrieving cached JSON', { error });
    return null;
  }
}; 