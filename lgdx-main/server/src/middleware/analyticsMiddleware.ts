import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import fs from 'fs';
import { logger } from '../utils/logger';

// Redis client for storing analytics data
let redisClient: ReturnType<typeof createClient> | null = null;

// Function to get Redis URL from file or environment variable
const getRedisUrl = () => {
  const isProd = process.env.NODE_ENV === 'production';
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
  
  if (isProd) {
    throw new Error('[Security] REDIS_URL (or REDIS_URL_FILE) is required in production');
  }
  logger.info('[Config] Using default Redis URL');
  return 'redis://localhost:6379';
};

const redactRedisUrl = (url: string): string => {
  try {
    // redis://:password@host:6379 -> redis://***@host:6379
    return url.replace(/^(redis(?:\+sentinel)?:\/\/)([^@]+)@/i, (_m, p1) => `${p1}***@`);
  } catch {
    return '[redacted]';
  }
};

// Initialize Redis client
const initRedisClient = async () => {
  if (!redisClient) {
    const redisUrl = getRedisUrl();
    logger.info('[Redis] Connecting to Redis', { url: redactRedisUrl(redisUrl) });
    
    redisClient = createClient({
      url: redisUrl
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', { error: err });
    });
    
    await redisClient.connect();
  }
  return redisClient;
};

// Analytics middleware to track page views
export const trackPageView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip tracking for API routes and static files
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/static/') || 
        req.path.includes('.') ||
        req.method !== 'GET') {
      return next();
    }

    const client = await initRedisClient();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const pageKey = `page_views:${today}:${req.path}`;
    const totalKey = `total_views:${today}`;

    // Increment page views for today
    await client.incr(pageKey);
    await client.incr(totalKey);

    // Set expiration for 30 days
    await client.expire(pageKey, 30 * 24 * 60 * 60);
    await client.expire(totalKey, 30 * 24 * 60 * 60);

    // Track user agent and IP for basic analytics
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    const sessionKey = `session:${today}:${ip}`;
    await client.sAdd(sessionKey, userAgent);
    await client.expire(sessionKey, 24 * 60 * 60); // 24 hours

  } catch (error) {
    logger.error('Analytics tracking error:', { error });
    // Don't block the request if analytics fails
  }

  next();
};

// Get analytics data from Redis
export const getAnalyticsData = async (date: string = new Date().toISOString().split('T')[0]) => {
  try {
    const client = await initRedisClient();
    
    // Get total views for the date
    const totalViews = await client.get(`total_views:${date}`) || '0';
    
    // Get all page view keys for the date
    const pageKeys = await client.keys(`page_views:${date}:*`);
    
    const pageViews = await Promise.all(
      pageKeys.map(async (key) => {
        const page = key.split(':')[2]; // Extract page path
        const views = await client.get(key) || '0';
        return { page, views: parseInt(views) };
      })
    );

    // Get unique sessions (IPs) for the date
    const sessionKeys = await client.keys(`session:${date}:*`);
    const uniqueVisitors = sessionKeys.length;

    return {
      date,
      totalViews: parseInt(totalViews),
      uniqueVisitors,
      pageViews: pageViews.sort((a, b) => b.views - a.views)
    };
  } catch (error) {
    logger.error('Error getting analytics data:', { error });
    return {
      date,
      totalViews: 0,
      uniqueVisitors: 0,
      pageViews: []
    };
  }
};

// Cleanup function for Redis client
export const cleanupAnalytics = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}; 