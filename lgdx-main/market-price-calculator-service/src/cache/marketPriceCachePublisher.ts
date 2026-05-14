import Redis from 'ioredis';
import winston from 'winston';

interface MarketPriceEntry {
  pricePerCarat: number;
  averagePricePerCarat?: number | undefined;
  medianPricePerCarat?: number | undefined;
  count?: number | undefined;
}

interface MarketPriceSnapshot {
  version: string;
  generatedAt: string;
  ttlSeconds: number;
  service: string;
  schemaVersion: number;
  entryCount: number;
  data: Record<string, MarketPriceEntry>;
}

interface MarketPriceDiffEntry extends MarketPriceEntry {
  previousPricePerCarat?: number | undefined;
}

interface MarketPriceDiff {
  version: string;
  previousVersion: string | null;
  generatedAt: string;
  entryCount: number;
  updated: Record<string, MarketPriceDiffEntry>;
  removed: Record<string, MarketPriceEntry>;
}

interface PublisherConfig {
  redisUrl?: string | undefined;
  ttlSeconds: number;
  logger: winston.Logger;
}

const SNAPSHOT_KEY = 'market-price-cache:latest';
const META_KEY = 'market-price-cache:meta';
const VERSION_KEY = 'market-price-cache:version';
const DIFF_KEY = 'market-price-cache:diff';

let redisClient: Redis | null = null;
let redisConfig: PublisherConfig | null = null;
let latestSnapshot: MarketPriceSnapshot | null = null;
let latestDiff: MarketPriceDiff | null = null;

export const getLatestSnapshot = (): MarketPriceSnapshot | null => latestSnapshot;
export const getLatestDiff = (): MarketPriceDiff | null => latestDiff;

export async function initMarketPriceCachePublisher(config: PublisherConfig): Promise<void> {
  redisConfig = config;

  if (!config.redisUrl) {
    config.logger.warn('[MarketPriceCachePublisher] Redis URL is not configured, publisher disabled');
    return;
  }

  if (redisClient) {
    return;
  }

  redisClient = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  redisClient.on('error', (error) => {
    config.logger.error('[MarketPriceCachePublisher] Redis error', { error });
  });

  redisClient.on('connect', () => {
    config.logger.info('[MarketPriceCachePublisher] Connected to Redis');
  });

  redisClient.on('close', () => {
    config.logger.warn('[MarketPriceCachePublisher] Redis connection closed');
  });

  try {
    await redisClient.connect();
  } catch (error) {
    config.logger.error('[MarketPriceCachePublisher] Failed to connect to Redis', { error });
    redisClient = null;
  }
}

export type SnapshotInput = Array<{
  key: string;
  pricePerCarat: number;
  avgPricePerCarat?: number;
  medianPricePerCarat?: number;
  count?: number;
}>;

function buildSnapshot(input: SnapshotInput, version: string, ttlSeconds: number): MarketPriceSnapshot {
  const data: Record<string, MarketPriceEntry> = {};

  for (const item of input) {
    data[item.key] = {
      pricePerCarat: item.pricePerCarat,
      averagePricePerCarat: item.avgPricePerCarat,
      medianPricePerCarat: item.medianPricePerCarat,
      count: item.count,
    };
  }

  return {
    version,
    generatedAt: new Date().toISOString(),
    ttlSeconds,
    service: 'market-price-calculator',
    schemaVersion: 1,
    entryCount: input.length,
    data,
  };
}

function computeDiff(previous: MarketPriceSnapshot | null, current: MarketPriceSnapshot): MarketPriceDiff {
  const updated: MarketPriceDiff['updated'] = {};
  const removed: MarketPriceDiff['removed'] = {};

  const prevData = previous?.data ?? {};
  const prevKeys = new Set(Object.keys(prevData));

  for (const [key, entry] of Object.entries(current.data)) {
    const previousEntry = prevData[key];
    if (!previousEntry) {
      updated[key] = {
        ...entry,
        previousPricePerCarat: undefined,
      };
      continue;
    }

    if (previousEntry.pricePerCarat !== entry.pricePerCarat || previousEntry.count !== entry.count) {
      updated[key] = {
        ...entry,
        previousPricePerCarat: previousEntry.pricePerCarat,
      };
    }

    prevKeys.delete(key);
  }

  for (const removedKey of prevKeys) {
    removed[removedKey] = prevData[removedKey]!;
  }

  return {
    version: current.version,
    previousVersion: previous?.version ?? null,
    generatedAt: current.generatedAt,
    entryCount: current.entryCount,
    updated,
    removed,
  };
}

export async function publishMarketPriceSnapshot(input: SnapshotInput): Promise<MarketPriceSnapshot | null> {
  if (!redisConfig || !redisClient) {
    redisConfig?.logger.warn('[MarketPriceCachePublisher] Publisher not initialized, skipping snapshot publish');
    return null;
  }

  const version = `${Date.now()}`;
  const snapshot = buildSnapshot(input, version, redisConfig.ttlSeconds);
  const diff = computeDiff(latestSnapshot, snapshot);

  try {
    const pipeline = redisClient.multi();
    pipeline.set(SNAPSHOT_KEY, JSON.stringify(snapshot), 'EX', redisConfig.ttlSeconds);
    pipeline.set(META_KEY, JSON.stringify({
      version: snapshot.version,
      generatedAt: snapshot.generatedAt,
      entryCount: snapshot.entryCount,
      ttlSeconds: snapshot.ttlSeconds,
      schemaVersion: snapshot.schemaVersion,
    }), 'EX', redisConfig.ttlSeconds);
    pipeline.set(VERSION_KEY, snapshot.version, 'EX', redisConfig.ttlSeconds);
    pipeline.set(DIFF_KEY, JSON.stringify(diff), 'EX', redisConfig.ttlSeconds);
    await pipeline.exec();

    latestSnapshot = snapshot;
    latestDiff = diff;

    redisConfig.logger.info('[MarketPriceCachePublisher] Published market price snapshot', {
      version: snapshot.version,
      entryCount: snapshot.entryCount,
      updated: Object.keys(diff.updated).length,
      removed: Object.keys(diff.removed).length,
    });

    return snapshot;
  } catch (error) {
    redisConfig.logger.error('[MarketPriceCachePublisher] Failed to publish snapshot', { error });
    return null;
  }
}

export async function shutdownMarketPriceCachePublisher(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisConfig?.logger.info('[MarketPriceCachePublisher] Redis connection closed');
    } catch (error) {
      redisConfig?.logger.warn('[MarketPriceCachePublisher] Error while closing Redis connection', { error });
    } finally {
      redisClient = null;
    }
  }
}

