/**
 * Utility script to clear rate limit counters in Redis
 * Run: node clear-rate-limits.js
 */

const Redis = require('ioredis');
const fs = require('fs');

async function clearRateLimits() {
  let redis;
  
  try {
    // Read Redis URL from secrets or env
    let redisUrl;
    const secretsPath = '/run/secrets/redis_url';
    
    if (fs.existsSync(secretsPath)) {
      redisUrl = fs.readFileSync(secretsPath, 'utf8').trim();
      console.log('✅ Using Redis URL from secrets');
    } else if (process.env.REDIS_URL) {
      redisUrl = process.env.REDIS_URL;
      console.log('✅ Using Redis URL from environment');
    } else {
      throw new Error('Redis URL not found');
    }

    // Connect to Redis
    redis = new Redis(redisUrl);
    console.log('🔌 Connecting to Redis...');

    // Get all rate limit keys
    const keys = await redis.keys('ftp:rate_limit:*');
    console.log(`📊 Found ${keys.length} rate limit keys`);

    if (keys.length === 0) {
      console.log('✅ No keys to delete');
      return;
    }

    // Display keys
    for (const key of keys) {
      const value = await redis.get(key);
      const ttl = await redis.ttl(key);
      const companyId = key.replace('ftp:rate_limit:', '');
      console.log(`  - ${companyId.substring(0, 8)}... : ${value} uploads, TTL: ${ttl}s (${Math.round(ttl / 3600)}h)`);
    }

    // Delete all rate limit keys
    console.log(`\n🗑️  Deleting ${keys.length} keys...`);
    const deleted = await redis.del(...keys);
    console.log(`✅ Deleted ${deleted} keys successfully`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (redis) {
      await redis.quit();
      console.log('👋 Redis connection closed');
    }
  }
}

clearRateLimits();

