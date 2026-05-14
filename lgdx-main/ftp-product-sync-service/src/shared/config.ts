/**
 * Конфигурация FTP сервиса
 */

import * as dotenv from 'dotenv';
import { readSecretAtPath } from './secrets';

dotenv.config();

// Функция для получения значения из переменной окружения или Docker Secret
// ВАЖНО: Не логируем значения конфигурации, так как они могут содержать секреты
const getConfigValue = (envVar: string, secretFile?: string, fallback?: string): string => {
  // Сначала проверяем переменную окружения
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }
  
  // Затем проверяем Docker Secret
  if (secretFile) {
    const secretPath = process.env[secretFile];
    if (secretPath) {
      return readSecretAtPath(secretPath, fallback);
    }
  }
  
  // Если ничего не найдено, используем fallback
  if (fallback) {
    return fallback;
  }
  
  throw new Error(`Configuration value not found for ${envVar}`);
};

export const config = {
  // MongoDB
  mongoUri: getConfigValue(
    'MONGODB_URI',
    'MONGODB_URI_FILE',
    'mongodb://localhost:27017/lgdx_dev'
  ),

  // RabbitMQ
  rabbitmqUrl: getConfigValue(
    'RABBITMQ_URL',
    'RABBITMQ_URL_FILE',
    'amqp://localhost:5672'
  ),

  // FTP Configuration
  ftpPort: parseInt(process.env.FTP_PORT || '21', 10),
  ftpHost: process.env.FTP_HOST || '0.0.0.0',
  ftpPasvUrl: process.env.FTP_PASV_URL || 'localhost',
  ftpPasvPortMin: parseInt(process.env.FTP_PASV_PORT_MIN || '10000', 10),
  ftpPasvPortMax: parseInt(process.env.FTP_PASV_PORT_MAX || '10100', 10),
  ftpDataPath: process.env.FTP_DATA_PATH || '/app',
  ftpMaxFileSizeMB: parseInt(process.env.FTP_MAX_FILE_SIZE_MB || '50', 10),
  ftpAllowedFileTypes: (process.env.FTP_ALLOWED_FILE_TYPES || 'xlsx,xls,csv').split(','),
  ftpMaxConnections: parseInt(process.env.FTP_MAX_CONNECTIONS || '50', 10),
  ftpConnectionTimeout: parseInt(process.env.FTP_CONNECTION_TIMEOUT || '300000', 10),
  ftpIdleTimeout: parseInt(process.env.FTP_IDLE_TIMEOUT || '900000', 10),

  // Health Check
  healthPort: parseInt(process.env.HEALTH_PORT || '3000', 10),

  // Telegram Bot Configuration
  telegramBotToken: getConfigValue(
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BOT_TOKEN_FILE',
    undefined
  ),
  stockTelegramBotToken: getConfigValue(
    'STOCK_TELEGRAM_BOT_TOKEN',
    'STOCK_TELEGRAM_BOT_TOKEN_FILE',
    undefined
  ),
  stockTelegramChatId: getConfigValue(
    'STOCK_TELEGRAM_CHAT_ID',
    'STOCK_TELEGRAM_CHAT_ID_FILE',
    undefined
  ),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};