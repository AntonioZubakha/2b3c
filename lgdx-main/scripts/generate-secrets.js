#!/usr/bin/env node

/**
 * LGDX Microservices - Secret Generator
 * 
 * Генерирует безопасные секреты для production окружения
 * 
 * Использование:
 * node scripts/generate-secrets.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Генерация случайных секретов
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

function generateJWTSecret() {
  return crypto.randomBytes(64).toString('base64');
}

// Генерация MongoDB URI для production
function generateMongoURI() {
  const username = 'lgdx_admin';
  const password = generateSecret(32);
  const host = 'mongodb'; // Внутри Docker Swarm
  const port = '27017';   // Внутренний порт MongoDB
  const database = 'lgdx';
  
  return {
    uri: `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`,
    username,
    password
  };
}

// Генерация RabbitMQ URL
function generateRabbitMQURL() {
  const username = 'lgdx';
  const password = generateSecret(16);
  const host = 'rabbitmq'; // Внутри Docker Swarm
  const port = '5672';
  
  return {
    url: `amqp://${username}:${password}@${host}:${port}`,
    username,
    password
  };
}

console.log('🔐 Генерация секретов для LGDX Production...\n');

const mongoCreds = generateMongoURI();
const rabbitCreds = generateRabbitMQURL();

// Генерируем все секреты (один вызов Mongo/Rabbit — иначе URI и пароль не совпадали бы)
const secrets = {
    NODE_ENV: 'production',
    JWT_SECRET: generateJWTSecret(),
    ADMIN_SECRET_KEY: generateSecret(32),
    MONGODB_URI: mongoCreds.uri,
    MONGODB_USER: mongoCreds.username,
    MONGODB_PASSWORD: mongoCreds.password,
    RABBITMQ_URL: rabbitCreds.url,
    RABBITMQ_USER: rabbitCreds.username,
    RABBITMQ_PASSWORD: rabbitCreds.password,
    RABBITMQ_MANAGEMENT_PORT: '15672',
    REDIS_URL: 'redis://redis:6379',
    REDIS_PASSWORD: generateSecret(16),
    API_SYNC_PREFETCH_COUNT: '2',
    API_SYNC_RETRY_DELAY: '10000',
    API_SYNC_MAX_RETRIES: '3',
    FILE_IMPORT_PREFETCH_COUNT: '1',
    FILE_IMPORT_RETRY_DELAY: '15000',
    FILE_IMPORT_MAX_RETRIES: '3',
    SERVER_PORT: '5000',
    CLIENT_PORT: '3000',
    PORT: '5000',
    TELEGRAM_BOT_TOKEN: '<YOUR_TELEGRAM_BOT_TOKEN>',
    TELEGRAM_CHAT_ID: '<YOUR_TELEGRAM_CHAT_ID>',
    STOCK_TELEGRAM_BOT_TOKEN: '<YOUR_STOCK_TELEGRAM_BOT_TOKEN>',
    STOCK_TELEGRAM_CHAT_ID: '<YOUR_STOCK_TELEGRAM_CHAT_ID>',
    FRONTEND_BASE_URL: 'http://localhost',
    OIL_PRICE_API: '<YOUR_OIL_PRICE_API_KEY>',
    GEMINI_API_KEY: '<YOUR_GEMINI_API_KEY>',
    MAX_FILE_SIZE: '10485760',
    UPLOAD_PATH: '/app/uploads',
    PROCESSED_PATH: '/app/processed',
    FAILED_PATH: '/app/failed',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'combined',
    DOCKER_REGISTRY: '<YOUR_DOCKER_REGISTRY>',
    IMAGE_TAG: 'latest',
    WORKER_MEMORY_LIMIT: '1G',
    WORKER_CPU_LIMIT: '1.0',
    MAX_CONCURRENT_JOBS: '5',
    HEALTH_CHECK_INTERVAL: '30s',
    HEALTH_CHECK_TIMEOUT: '10s',
    HEALTH_CHECK_RETRIES: '3'
};

console.log('✅ INFO: The .env.production file is no longer auto-generated for security reasons.');

// Создаем отдельный файл с секретами для Docker Secrets
const dockerSecrets = {
    jwt_secret: secrets.JWT_SECRET,
    admin_secret_key: secrets.ADMIN_SECRET_KEY,
    mongodb_password: secrets.MONGODB_PASSWORD,
    mongodb_uri: secrets.MONGODB_URI,
    rabbitmq_password: secrets.RABBITMQ_PASSWORD,
    rabbitmq_url: secrets.RABBITMQ_URL,
    redis_password: secrets.REDIS_PASSWORD,
    redis_url: `redis://:${secrets.REDIS_PASSWORD}@redis:6379`,
    // Grafana admin credentials (used via GF_*__FILE env vars)
    grafana_admin_user: 'admin',
    grafana_admin_password: generateSecret(16),
    telegram_bot_token: secrets.TELEGRAM_BOT_TOKEN,
    stock_telegram_bot_token: secrets.STOCK_TELEGRAM_BOT_TOKEN,
    stripe_secret_key: '<PASTE_STRIPE_SECRET_KEY_FROM_DASHBOARD>',
    stripe_publishable_key: '<PASTE_STRIPE_PUBLISHABLE_KEY_FROM_DASHBOARD>',
    stripe_webhook_secret: '<PASTE_STRIPE_WEBHOOK_SIGNING_SECRET>',
    system_monitoring_bot_token: '<YOUR_SYSTEM_MONITORING_BOT_TOKEN>',
    system_monitoring_chat_id: '<YOUR_SYSTEM_MONITORING_CHAT_ID>',
    chat_telegram_bot_token: '<YOUR_CHAT_TELEGRAM_BOT_TOKEN>',
    chat_telegram_chat_id: '<YOUR_CHAT_TELEGRAM_CHAT_ID>',
    registration_telegram_bot_token: '<YOUR_REGISTRATION_TELEGRAM_BOT_TOKEN>',
    registration_telegram_chat_id: '<YOUR_REGISTRATION_TELEGRAM_CHAT_ID>',
    twilio_account_sid: '<YOUR_TWILIO_ACCOUNT_SID>',
    twilio_auth_token: '<YOUR_TWILIO_AUTH_TOKEN>',
    twilio_verify_service_sid: '<YOUR_TWILIO_VERIFY_SERVICE_SID>',
    twilio_phone_number: '<YOUR_TWILIO_PHONE_NUMBER>'
};

const secretsPath = path.join(process.cwd(), 'docker-secrets');
if (!fs.existsSync(secretsPath)) {
    fs.mkdirSync(secretsPath);
}

Object.entries(dockerSecrets).forEach(([name, value]) => {
    const secretPath = path.join(secretsPath, name);
    try {
        fs.writeFileSync(secretPath, value);
        console.log(`✅ Docker secret создан: ${secretPath}`);
    } catch (error) {
        console.error(`❌ Ошибка создания secret ${name}: ${error.message}`);
    }
});

console.log('\n🎉 Все секреты созданы успешно!');
console.log('\n📋 Следующие шаги:');
console.log('1. Настройте Telegram токены в docker-secrets/telegram_bot_token и docker-secrets/stock_telegram_bot_token');
console.log('2. Настройте Stripe ключи в docker-secrets/stripe_secret_key, stripe_publishable_key и stripe_webhook_secret');
console.log('3. Запустите: scripts\\win\\prod-setup-docker-secrets.bat (Windows) или ./scripts/mac/prod-setup-docker-secrets.sh (Linux/Mac)');
console.log('4. Запустите production local: scripts\\win\\prod-clean-rebuild-keep-data.bat (Windows) или ./scripts/mac/prod-deploy.sh (Linux/Mac)');
console.log('\n🔗 MongoDB Compass (password masked):');
console.log('mongodb://lgdx_admin:***@localhost:27020/lgdx?authSource=admin');
console.log('   (full URI is in docker-secrets/mongodb_uri after deploy)');