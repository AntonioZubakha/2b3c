import { createClient, RedisClientType } from 'redis';
import axios from 'axios';
import { performance } from 'perf_hooks';
import { ProductCategoryStats } from '../models/ProductCategoryStats';
import {
  marketPriceCacheCategoriesGauge,
  marketPriceCacheDurationHistogram,
  marketPriceCacheVersionAgeGauge,
} from '../metrics';
import { logger } from './logger';

type CacheSource = 'redis' | 'http' | 'mongo' | 'none';

interface SnapshotResponse {
  version: string;
  generatedAt: string;
  entryCount: number;
  data: Record<string, { pricePerCarat: number }>;
}

interface DiffResponse {
  version: string;
  previousVersion: string | null;
  generatedAt: string;
  updated: Record<string, { pricePerCarat: number }>;
  removed: Record<string, { pricePerCarat: number }>;
}

interface CacheState {
  map: Map<string, number>;
  version: string | null;
  generatedAt?: string;
  lastLoadedAt: number | null;
  lastSource: CacheSource;
  lastError?: string;
}

const SNAPSHOT_KEY = 'market-price-cache:latest';
const VERSION_KEY = 'market-price-cache:version';
const DIFF_KEY = 'market-price-cache:diff';

const REFRESH_INTERVAL_MS = parseInt(process.env.MARKET_PRICE_CACHE_REFRESH_MS || '300000', 10);
const DIFF_THRESHOLD = parseInt(process.env.MARKET_PRICE_CACHE_DIFF_THRESHOLD || '500', 10);
const ENABLE_MONGO_FALLBACK = process.env.MARKET_PRICE_CACHE_MONGO_FALLBACK !== 'false';

const cacheState: CacheState = {
  map: new Map<string, number>(),
  version: null,
  generatedAt: undefined,
  lastLoadedAt: null,
  lastSource: 'none',
  lastError: undefined,
};

let redisClient: RedisClientType | null = null;
let refreshPromise: Promise<void> | null = null;

/** Apply REDIS_HOST_OVERRIDE so Swarm can use short name "redis" when secret has "lgdx_redis". */
function applyRedisHostOverride(urlString: string | undefined): string | undefined {
  if (!urlString) return undefined;
  const override = process.env.REDIS_HOST_OVERRIDE;
  if (!override) return urlString;
  try {
    const u = new URL(urlString.replace(/^redis:\/\//, 'http://'));
    u.hostname = override;
    return u.toString().replace(/^http:\/\//, 'redis://');
  } catch {
    return urlString;
  }
}

const redisUrl = applyRedisHostOverride(
  resolveSecret('MARKET_PRICE_CACHE_REDIS_URL')
  || resolveSecret('REDIS_URL')
  || process.env.MARKET_PRICE_CACHE_REDIS_URL
  || process.env.REDIS_URL
);

const httpEndpoint = process.env.MARKET_PRICE_CACHE_ENDPOINT
  || 'http://market-price-calculator:9100/market-price-cache';

function resolveSecret(envKey: string): string | undefined {
  const fileKey = `${envKey}_FILE`;
  if (process.env[fileKey]) {
    try {
      return require('fs').readFileSync(process.env[fileKey]!, 'utf8').trim();
    } catch (error) {
      logger.warn(`[MarketPriceCache] Failed to read secret file for ${envKey}`, { error });
    }
  }
  return process.env[envKey];
}

async function ensureRedisClient(): Promise<RedisClientType | null> {
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
      },
    });

    redisClient.on('error', (error) => {
      logger.error('[MarketPriceCache] Redis error', { error });
    });

    redisClient.on('end', () => {
      logger.warn('[MarketPriceCache] Redis connection closed');
    });

    try {
      await redisClient.connect();
    } catch (error) {
      logger.error('[MarketPriceCache] Failed to connect to Redis', { error });
      redisClient = null;
      return null;
    }
  }

  return redisClient;
}

function shouldRefresh(force: boolean): boolean {
  if (force) {
    return true;
  }

  if (!cacheState.lastLoadedAt) {
    return true;
  }

  return Date.now() - cacheState.lastLoadedAt >= REFRESH_INTERVAL_MS;
}

function recordMetrics(source: CacheSource, durationSeconds: number, size: number, generatedAt?: string): void {
  marketPriceCacheDurationHistogram.observe({ source }, durationSeconds);
  marketPriceCacheCategoriesGauge.set({ source }, size);
  if (generatedAt) {
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    if (!Number.isNaN(ageMs)) {
      marketPriceCacheVersionAgeGauge.set({ source }, Math.max(ageMs / 60000, 0));
    }
  }
}

function applySnapshot(snapshot: SnapshotResponse, durationSeconds: number, source: CacheSource): void {
  const map = new Map<string, number>();
  for (const [key, entry] of Object.entries(snapshot.data)) {
    if (typeof entry?.pricePerCarat === 'number') {
      map.set(key, entry.pricePerCarat);
    }
  }

  cacheState.map = map;
  cacheState.version = snapshot.version;
  cacheState.generatedAt = snapshot.generatedAt;
  cacheState.lastLoadedAt = Date.now();
  cacheState.lastSource = source;
  cacheState.lastError = undefined;

  recordMetrics(source, durationSeconds, map.size, snapshot.generatedAt);

  logger.info('[MarketPriceCache] Loaded snapshot', {
    source,
    version: snapshot.version,
    entryCount: map.size,
  });
}

function tryApplyDiff(diff: DiffResponse, durationSeconds: number, source: CacheSource): boolean {
  if (!cacheState.version || cacheState.version !== diff.previousVersion) {
    return false;
  }

  const updates = Object.keys(diff.updated).length;
  const removals = Object.keys(diff.removed).length;
  if (updates + removals > DIFF_THRESHOLD) {
    logger.info('[MarketPriceCache] Diff too large, falling back to full snapshot', {
      updates,
      removals,
      threshold: DIFF_THRESHOLD,
    });
    return false;
  }

  for (const [key, entry] of Object.entries(diff.updated)) {
    if (typeof entry?.pricePerCarat === 'number') {
      cacheState.map.set(key, entry.pricePerCarat);
    }
  }

  for (const key of Object.keys(diff.removed)) {
    cacheState.map.delete(key);
  }

  cacheState.version = diff.version;
  cacheState.generatedAt = diff.generatedAt;
  cacheState.lastLoadedAt = Date.now();
  cacheState.lastSource = source;
  cacheState.lastError = undefined;

  recordMetrics(source, durationSeconds, cacheState.map.size, diff.generatedAt);

  logger.info('[MarketPriceCache] Applied incremental diff', {
    source,
    version: diff.version,
    updates,
    removals,
    size: cacheState.map.size,
  });

  return true;
}

async function refreshFromRedis(): Promise<boolean> {
  const client = await ensureRedisClient();
  if (!client) {
    return false;
  }

  const start = performance.now();
  try {
    const version = await client.get(VERSION_KEY);
    if (!version) {
      logger.warn('[MarketPriceCache] Redis version key is empty');
      return false;
    }

    if (cacheState.version === version && cacheState.generatedAt) {
      const durationSeconds = (performance.now() - start) / 1000;
      recordMetrics('redis', durationSeconds, cacheState.map.size, cacheState.generatedAt);
      return true;
    }

    const diffRaw = await client.get(DIFF_KEY);
    if (diffRaw) {
      try {
        const diff = JSON.parse(diffRaw) as DiffResponse;
        const durationSeconds = (performance.now() - start) / 1000;
        if (diff.version === version && tryApplyDiff(diff, durationSeconds, 'redis')) {
          return true;
        }
      } catch (error) {
        logger.warn('[MarketPriceCache] Failed to parse diff payload from Redis', { error });
      }
    }

    const snapshotRaw = await client.get(SNAPSHOT_KEY);
    if (!snapshotRaw) {
      logger.warn('[MarketPriceCache] Redis snapshot key is empty');
      return false;
    }

    const snapshot = JSON.parse(snapshotRaw) as SnapshotResponse;
    const durationSeconds = (performance.now() - start) / 1000;
    applySnapshot(snapshot, durationSeconds, 'redis');
    return true;
  } catch (error) {
    logger.error('[MarketPriceCache] Failed to refresh from Redis', { error });
    cacheState.lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

async function refreshFromHttp(): Promise<boolean> {
  const start = performance.now();
  try {
    const response = await axios.get<SnapshotResponse>(httpEndpoint, { timeout: 5000 });
    const snapshot = response.data;

    const durationSeconds = (performance.now() - start) / 1000;
    applySnapshot(snapshot, durationSeconds, 'http');
    return true;
  } catch (error) {
    logger.error('[MarketPriceCache] Failed to refresh from HTTP endpoint', { error, endpoint: httpEndpoint });
    cacheState.lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

async function refreshFromMongo(): Promise<boolean> {
  if (!ENABLE_MONGO_FALLBACK) {
    return false;
  }

  const start = performance.now();
  try {
    const stats = await ProductCategoryStats.find({})
      .select('shape weight clarity color marketPricePerCarat')
      .lean();

    const map = new Map<string, number>();
    for (const stat of stats) {
      if (stat && stat.marketPricePerCarat && stat.marketPricePerCarat > 0) {
        const key = `${stat.shape}-${stat.weight}-${stat.clarity}-${stat.color}`;
        map.set(key, stat.marketPricePerCarat);
      }
    }

    cacheState.map = map;
    cacheState.lastLoadedAt = Date.now();
    cacheState.lastSource = 'mongo';
    cacheState.lastError = undefined;

    const durationSeconds = (performance.now() - start) / 1000;
    recordMetrics('mongo', durationSeconds, map.size, new Date().toISOString());

    logger.warn('[MarketPriceCache] Fallback to MongoDB cache warmup', {
      size: map.size,
    });

    return true;
  } catch (error) {
    logger.error('[MarketPriceCache] Failed to warm cache from MongoDB', { error });
    cacheState.lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

async function refreshCache(force: boolean): Promise<void> {
  const refreshed = (await refreshFromRedis()) || (await refreshFromHttp());
  if (refreshed) {
    return;
  }

  await refreshFromMongo();
}

export async function initializeMarketPriceCache(): Promise<void> {
  await ensureFreshMarketPriceCache(true);
}

export async function ensureFreshMarketPriceCache(force = false): Promise<void> {
  if (!shouldRefresh(force)) {
    return;
  }

  if (!refreshPromise) {
    refreshPromise = refreshCache(force).finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
}

export function getSharedMarketPriceCache(): Map<string, number> {
  return cacheState.map;
}

export function getMarketPriceCacheStatus() {
  return {
    version: cacheState.version,
    generatedAt: cacheState.generatedAt,
    size: cacheState.map.size,
    lastSource: cacheState.lastSource,
    lastLoadedAt: cacheState.lastLoadedAt,
    lastError: cacheState.lastError,
    redisConfigured: Boolean(redisUrl),
    httpEndpoint,
  };
}

export async function shutdownMarketPriceCache(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (error) {
      logger.warn('[MarketPriceCache] Error closing Redis connection', { error });
    } finally {
      redisClient = null;
    }
  }
}

