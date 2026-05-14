import Fastify from 'fastify';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import Diamond from './models/Diamond.js';
import { invalidateSearchRedisCache } from './cacheKeys.js';

const fastify = Fastify({ logger: true });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_catalog';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const CACHE_INVALIDATE_SECRET = process.env.STONEE_CACHE_INVALIDATE_SECRET || '';

const redis = new Redis(REDIS_URL);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

/**
 * PRODUCTION SEARCH ENGINE
 * 1. Filtered Querying
 * 2. Response Caching (Redis)
 * 3. Faceted Search (Counts by shape/color/etc)
 */

fastify.get('/health', async () => ({ status: 'ok', service: 'search-service' }));

/**
 * Internal: drop filter + facets cache after catalog writes.
 * When STONEE_CACHE_INVALIDATE_SECRET is set, require header x-stonee-cache-invalidate.
 */
fastify.post('/internal/invalidate-search-cache', async (request, reply) => {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !CACHE_INVALIDATE_SECRET) {
    return reply.code(503).send({
      success: false,
      error: 'STONEE_CACHE_INVALIDATE_SECRET must be set in production',
    });
  }
  if (CACHE_INVALIDATE_SECRET) {
    const token = request.headers['x-stonee-cache-invalidate'];
    if (token !== CACHE_INVALIDATE_SECRET) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
  }
  try {
    const { filterKeysDeleted, facetsDeleted } = await invalidateSearchRedisCache(redis);
    return {
      success: true,
      filterKeysDeleted,
      facetsCleared: facetsDeleted,
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.code(500).send({ success: false, error: 'Cache invalidation failed' });
  }
});

// 1. Faceted Search - Returns counts for filters
fastify.get('/facets', async (request, reply) => {
  const cacheKey = 'search:facets';
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const facets = await Diamond.aggregate([
      { $match: { availability: 'in-stock' } },
      {
        $facet: {
          shapes: [{ $group: { _id: '$shape', count: { $sum: 1 } } }],
          colors: [{ $group: { _id: '$color', count: { $sum: 1 } } }],
          clarity: [{ $group: { _id: '$clarity', count: { $sum: 1 } } }],
          priceRange: [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }],
          caratRange: [{ $group: { _id: null, min: { $min: '$carat' }, max: { $max: '$carat' } } }]
        }
      }
    ]);

    const result = facets[0];
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600); // Cache for 10 mins
    return result;
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch facets' });
  }
});

// 2. High-Performance Filtered Search
fastify.get('/filter', async (request: any, reply) => {
  const { shape, minPrice, maxPrice, minCarat, maxCarat, color, clarity, sort, sku } = request.query;
  
  // Generate a unique cache key based on query params
  // IMPORTANT: use deterministic serialization to avoid cache fragmentation
  const cacheKey = `search:filter:${stableStringify(request.query)}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const filter: any = { availability: 'in-stock' };

    if (sku) filter.sku = String(sku);

    if (shape) filter.shape = { $in: shape.split(',') };
    if (color) filter.color = { $in: color.split(',') };
    if (clarity) filter.clarity = { $in: clarity.split(',') };

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (minCarat || maxCarat) {
      filter.carat = {};
      if (minCarat) filter.carat.$gte = Number(minCarat);
      if (maxCarat) filter.carat.$lte = Number(maxCarat);
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };
    if (sort === 'score-desc') sortOption = { diamondScore: -1 };

    // Keep payload lean for speed; details are fetched from catalog by id/sku.
    const diamonds = await Diamond.find(filter)
      .select(
        'sku shape carat color clarity cut price lab diamondScore dealBadge availability images videoUrl depthPercentage tablePercentage symmetry polish fluorescence createdAt updatedAt',
      )
      .sort(sortOption)
      .limit(100);
    
    const result = { success: true, count: diamonds.length, data: diamonds };
    
    // Cache the result for 5 minutes
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    
    return result;
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Search failed' });
  }
});

const start = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    fastify.log.info('Search Service connected to MongoDB');
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
