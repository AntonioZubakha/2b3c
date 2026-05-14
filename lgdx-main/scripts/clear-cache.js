#!/usr/bin/env node

/**
 * LGDX Cache Clear Utility
 * 
 * Универсальный скрипт для очистки различных типов кэша в системе LGDX
 * 
 * Использование:
 * node scripts/clear-cache.js [--type=all|market|analytics|redis] [--env=dev|prod]
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');

// Конфигурация
const config = {
  dev: {
    mongodb: 'mongodb://admin:password@localhost:27019/lgdx_dev?authSource=admin',
    api: 'http://localhost:5001',
    redis: 'redis://localhost:6380'
  },
  prod: {
    mongodb: 'mongodb://admin:password@localhost:27020/lgdx?authSource=admin',
    api: 'http://localhost:5000',
    redis: 'redis://localhost:6379'
  }
};

// Парсинг аргументов командной строки
const args = process.argv.slice(2);
const type = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'all';
const env = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';

const currentConfig = config[env];
const mongoUri = process.env.MONGODB_URI || currentConfig.mongodb;

console.log(`🧹 LGDX Cache Clear Utility`);
console.log(`Environment: ${env}`);
console.log(`Type: ${type}`);
console.log('');

async function clearMarketCache() {
  console.log('📊 Clearing Market Analytics Cache...');
  
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(env === 'dev' ? 'lgdx_dev' : 'lgdx');
    const collection = db.collection('MarketAnalyticsCache');
    
    const result = await collection.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} market cache entries`);
    
  } catch (error) {
    console.error('❌ Error clearing market cache:', error.message);
  } finally {
    await client.close();
  }
}

async function clearAnalyticsCache() {
  console.log('📈 Clearing Analytics Cache...');
  
  try {
    const response = await axios.post(`${currentConfig.api}/api/category-stats/smart-analytics/clear-cache`, {}, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ Analytics cache cleared successfully');
    } else {
      console.log('⚠️ Analytics cache clear returned status:', response.status);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('⚠️ API server not running, skipping analytics cache clear');
    } else {
      console.error('❌ Error clearing analytics cache:', error.message);
    }
  }
}

async function clearRedisCache() {
  console.log('🔴 Clearing Redis Cache...');
  
  try {
    const response = await axios.post(`${currentConfig.api}/api/cache/clear`, {}, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ Redis cache cleared successfully');
    } else {
      console.log('⚠️ Redis cache clear returned status:', response.status);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('⚠️ API server not running, skipping Redis cache clear');
    } else {
      console.error('❌ Error clearing Redis cache:', error.message);
    }
  }
}

async function main() {
  try {
    switch (type) {
      case 'market':
        await clearMarketCache();
        break;
      case 'analytics':
        await clearAnalyticsCache();
        break;
      case 'redis':
        await clearRedisCache();
        break;
      case 'all':
      default:
        await clearMarketCache();
        await clearAnalyticsCache();
        await clearRedisCache();
        break;
    }
    
    console.log('');
    console.log('🎉 Cache clearing completed!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Запуск скрипта
if (require.main === module) {
  main();
}

module.exports = { clearMarketCache, clearAnalyticsCache, clearRedisCache };
