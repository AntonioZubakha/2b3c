#!/usr/bin/env node

/**
 * LGDX System Health Check
 * 
 * Комплексная проверка состояния всех сервисов системы LGDX
 * 
 * Использование:
 * node scripts/check-system.js [--env=dev|prod] [--verbose]
 */

const axios = require('axios');
const { MongoClient } = require('mongodb');

// Конфигурация
const config = {
  dev: {
    mongodb: 'mongodb://admin:password@localhost:27019/lgdx_dev?authSource=admin',
    api: 'http://localhost:5001',
    redis: 'redis://localhost:6380',
    rabbitmq: 'http://localhost:15673',
    client: 'http://localhost:3001'
  },
  prod: {
    mongodb: 'mongodb://admin:password@localhost:27020/lgdx?authSource=admin',
    api: 'http://localhost:5000',
    redis: 'redis://localhost:6379',
    rabbitmq: 'http://localhost:15672',
    client: 'http://localhost'
  }
};

// Парсинг аргументов
const args = process.argv.slice(2);
const env = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
const verbose = args.includes('--verbose');

const currentConfig = config[env];
const mongoUri = process.env.MONGODB_URI || currentConfig.mongodb;

// Результаты проверок
const results = {
  mongodb: { status: 'unknown', message: '', details: null },
  api: { status: 'unknown', message: '', details: null },
  redis: { status: 'unknown', message: '', details: null },
  rabbitmq: { status: 'unknown', message: '', details: null },
  client: { status: 'unknown', message: '', details: null },
  docker: { status: 'unknown', message: '', details: null }
};

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logCheck(service, status, message, details = null) {
  const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  const color = status === 'ok' ? 'green' : status === 'warning' ? 'yellow' : 'red';
  
  log(`${icon} ${service}: ${message}`, color);
  
  if (verbose && details) {
    log(`   Details: ${JSON.stringify(details, null, 2)}`, 'blue');
  }
  
  results[service] = { status, message, details };
}

async function checkMongoDB() {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    
    const db = client.db(env === 'dev' ? 'lgdx_dev' : 'lgdx');
    const collections = await db.listCollections().toArray();
    
    await client.close();
    
    logCheck('MongoDB', 'ok', `Connected successfully (${collections.length} collections)`, {
      collections: collections.map(c => c.name)
    });
    
  } catch (error) {
    logCheck('MongoDB', 'error', `Connection failed: ${error.message}`);
  }
}

async function checkAPI() {
  try {
    const response = await axios.get(`${currentConfig.api}/health`, { timeout: 5000 });
    
    if (response.status === 200) {
      logCheck('API Server', 'ok', `Health check passed (${response.status})`, response.data);
    } else {
      logCheck('API Server', 'warning', `Unexpected status: ${response.status}`);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logCheck('API Server', 'error', 'Connection refused - server not running');
    } else {
      logCheck('API Server', 'error', `Health check failed: ${error.message}`);
    }
  }
}

async function checkRedis() {
  try {
    const response = await axios.get(`${currentConfig.api}/api/cache/status`, { timeout: 5000 });
    
    if (response.status === 200) {
      logCheck('Redis', 'ok', 'Cache service responding', response.data);
    } else {
      logCheck('Redis', 'warning', `Cache service returned status: ${response.status}`);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logCheck('Redis', 'error', 'Cache service not available');
    } else {
      logCheck('Redis', 'error', `Cache check failed: ${error.message}`);
    }
  }
}

async function checkRabbitMQ() {
  try {
    const response = await axios.get(`${currentConfig.rabbitmq}`, { timeout: 5000 });
    
    if (response.status === 200) {
      logCheck('RabbitMQ', 'ok', 'Management interface accessible');
    } else {
      logCheck('RabbitMQ', 'warning', `Management interface returned status: ${response.status}`);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logCheck('RabbitMQ', 'error', 'Management interface not accessible');
    } else {
      logCheck('RabbitMQ', 'error', `RabbitMQ check failed: ${error.message}`);
    }
  }
}

async function checkClient() {
  try {
    const response = await axios.get(`${currentConfig.client}`, { timeout: 5000 });
    
    if (response.status === 200) {
      logCheck('Client', 'ok', 'Frontend accessible');
    } else {
      logCheck('Client', 'warning', `Frontend returned status: ${response.status}`);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logCheck('Client', 'error', 'Frontend not accessible');
    } else {
      logCheck('Client', 'error', `Client check failed: ${error.message}`);
    }
  }
}

async function checkDocker() {
  try {
    const { execSync } = require('child_process');
    
    // Проверяем Docker
    execSync('docker --version', { stdio: 'pipe' });
    
    // Проверяем Docker Swarm (для production)
    if (env === 'prod') {
      const swarmInfo = execSync('docker info', { stdio: 'pipe' }).toString();
      if (swarmInfo.includes('Swarm: active')) {
        logCheck('Docker', 'ok', 'Docker and Swarm are active');
      } else {
        logCheck('Docker', 'warning', 'Docker is running but Swarm is not active');
      }
    } else {
      logCheck('Docker', 'ok', 'Docker is running');
    }
    
  } catch (error) {
    logCheck('Docker', 'error', `Docker check failed: ${error.message}`);
  }
}

async function main() {
  log(`🔍 LGDX System Health Check (${env.toUpperCase()})`, 'bright');
  log('', 'reset');
  
  // Выполняем все проверки параллельно
  await Promise.all([
    checkMongoDB(),
    checkAPI(),
    checkRedis(),
    checkRabbitMQ(),
    checkClient(),
    checkDocker()
  ]);
  
  // Итоговый отчет
  log('', 'reset');
  log('📊 SUMMARY:', 'bright');
  
  const okCount = Object.values(results).filter(r => r.status === 'ok').length;
  const warningCount = Object.values(results).filter(r => r.status === 'warning').length;
  const errorCount = Object.values(results).filter(r => r.status === 'error').length;
  
  log(`✅ OK: ${okCount}`, 'green');
  log(`⚠️  Warnings: ${warningCount}`, 'yellow');
  log(`❌ Errors: ${errorCount}`, 'red');
  
  if (errorCount > 0) {
    log('', 'reset');
    log('🚨 System has critical issues that need attention!', 'red');
    process.exit(1);
  } else if (warningCount > 0) {
    log('', 'reset');
    log('⚠️  System is running but has some warnings', 'yellow');
  } else {
    log('', 'reset');
    log('🎉 All systems are operational!', 'green');
  }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
  log(`❌ Uncaught Exception: ${error.message}`, 'red');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection: ${reason}`, 'red');
  process.exit(1);
});

// Запуск скрипта
if (require.main === module) {
  main();
}

module.exports = { checkMongoDB, checkAPI, checkRedis, checkRabbitMQ, checkClient, checkDocker };
