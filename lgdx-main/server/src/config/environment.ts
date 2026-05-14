// Environment configuration
export interface EnvironmentConfig {
  isProduction: boolean;
  isDevelopment: boolean;
  isLocalhost: boolean;
  frontendBaseUrl: string;
  emailService: {
    enabled: boolean;
    provider: string;
  };
  smsService: {
    enabled: boolean;
    provider: string;
    developmentMode: boolean;
  };
  database: {
    url: string;
    name: string;
  };
  server: {
    port: number;
    host: string;
  };
}

// Detect environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';

// Environment detection helpers
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';
const isLocalhost = FRONTEND_BASE_URL.includes('localhost') || 
                   FRONTEND_BASE_URL.includes('127.0.0.1') ||
                   FRONTEND_BASE_URL.includes('0.0.0.0');

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return require('fs').readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            // Using console here is acceptable only at startup; still unify via logger if available
            try { const { logger } = require('../utils/logger'); logger.error(`[Config] Failed to read ${envVar}_FILE:`, { error: e }); } catch {}
        }
    }
    return process.env[envVar];
};

// Email service configuration
const emailServiceConfig = {
  enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && getSecretFromFile('SMTP_PASS')),
  provider: process.env.SMTP_HOST ? 'smtp' : 'disabled'
};

// SMS service configuration
const smsServiceConfig = {
  enabled: !!(getSecretFromFile('TWILIO_ACCOUNT_SID') && getSecretFromFile('TWILIO_AUTH_TOKEN') && getSecretFromFile('TWILIO_VERIFY_SERVICE_SID')),
  provider: getSecretFromFile('TWILIO_ACCOUNT_SID') ? 'twilio-verify' : 'development',
  developmentMode: isDevelopment // Only force development mode for development environment, not localhost
};

// Database configuration
const getMongoUri = () => {
  if (process.env.MONGODB_URI_FILE) {
    try {
      return require('fs').readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
    } catch (e) {
      try { const { logger } = require('../utils/logger'); logger.error('[Config] Failed to read MONGODB_URI_FILE:', { error: e }); } catch {}
    }
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27017';
};

const databaseConfig = {
  url: getMongoUri(),
  name: process.env.MONGODB_NAME || 'lgdeal'
};

// Redact credentials from Mongo URI for safe logging
const redactMongoUri = (uri: string): string => {
  try {
    // mongodb://user:pass@host:27017/db  -> mongodb://***:***@host:27017/db
    // mongodb+srv://user:pass@host/db   -> mongodb+srv://***:***@host/db
    return uri.replace(/^(mongodb(?:\+srv)?:\/\/)([^@]+)@/i, (_m, p1) => `${p1}***:***@`);
  } catch {
    return '[redacted]';
  }
};

// Server configuration
const serverConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0'
};

// Export configuration
export const config: EnvironmentConfig = {
  isProduction,
  isDevelopment,
  isLocalhost,
  frontendBaseUrl: FRONTEND_BASE_URL,
  emailService: emailServiceConfig,
  smsService: smsServiceConfig,
  database: databaseConfig,
  server: serverConfig
};

// Environment-specific settings
export const getEnvironmentSettings = () => {
  if (isProduction) {
    return {
      logLevel: 'info',
      corsOrigin: process.env.FRONTEND_BASE_URL || 'https://lgdeal.com',
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      }
    };
  }
  
  if (isDevelopment) {
    return {
      logLevel: 'debug',
      corsOrigin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000 // higher limit for development
      }
    };
  }
  
  // Default settings
  return {
    logLevel: 'info',
    corsOrigin: FRONTEND_BASE_URL,
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100
    }
  };
};

// Validation functions
export const validateEnvironment = (): string[] => {
  const errors: string[] = [];
  
  // Required for production
  if (isProduction) {
    const mongoUri = getMongoUri();
    if (!mongoUri || mongoUri === 'mongodb://localhost:27017') {
      errors.push('MONGODB_URI or MONGODB_URI_FILE is required in production');
    }
    // Accept either env var or *_FILE
    const jwtSecret = getSecretFromFile('JWT_SECRET');
    if (!jwtSecret) {
      errors.push('JWT_SECRET (or JWT_SECRET_FILE) is required in production');
    }
    const adminSecret = getSecretFromFile('ADMIN_SECRET_KEY');
    if (!adminSecret) {
      errors.push('ADMIN_SECRET_KEY (or ADMIN_SECRET_KEY_FILE) is required in production');
    }
    if (!process.env.FRONTEND_BASE_URL) {
      errors.push('FRONTEND_BASE_URL is required in production');
    }
  }
  
  // Email service validation
  if (emailServiceConfig.enabled) {
    if (!process.env.SMTP_HOST) {
      errors.push('SMTP_HOST is required when email service is enabled');
    }
    if (!process.env.SMTP_USER) {
      errors.push('SMTP_USER is required when email service is enabled');
    }
    if (!getSecretFromFile('SMTP_PASS')) {
      errors.push('SMTP_PASS is required when email service is enabled');
    }
  }
  
  // SMS service validation
  if (smsServiceConfig.enabled && !smsServiceConfig.developmentMode) {
    if (!process.env.TWILIO_ACCOUNT_SID) {
      errors.push('TWILIO_ACCOUNT_SID is required when SMS service is enabled');
    }
    if (!process.env.TWILIO_AUTH_TOKEN) {
      errors.push('TWILIO_AUTH_TOKEN is required when SMS service is enabled');
    }
    if (!process.env.TWILIO_PHONE_NUMBER) {
      errors.push('TWILIO_PHONE_NUMBER is required when SMS service is enabled');
    }
  }
  
  return errors;
};

// Log environment configuration
export const logEnvironmentConfig = () => {
  try {
    const { logger } = require('../utils/logger');
    logger.info('🌍 Environment Configuration:');
    logger.info(`   Environment: ${NODE_ENV}`);
    logger.info(`   Frontend URL: ${FRONTEND_BASE_URL}`);
    logger.info(`   Is Production: ${isProduction}`);
    logger.info(`   Is Development: ${isDevelopment}`);
    logger.info(`   Is Localhost: ${isLocalhost}`);
    logger.info(`   Email Service: ${emailServiceConfig.enabled ? 'enabled' : 'disabled'} (${emailServiceConfig.provider})`);
    logger.info(`   SMS Service: ${smsServiceConfig.enabled ? 'enabled' : 'disabled'} (${smsServiceConfig.provider})`);
    logger.info(`   Database: ${redactMongoUri(databaseConfig.url)}/${databaseConfig.name}`);
    logger.info(`   Server: ${serverConfig.host}:${serverConfig.port}`);
  } catch {
    // Fallback silently if logger isn't available at import time
  }
  
  // Log validation errors
  const errors = validateEnvironment();
  if (errors.length > 0) {
    try {
      const { logger } = require('../utils/logger');
      logger.warn('⚠️  Environment validation warnings:');
      errors.forEach((error: string) => logger.warn(`   - ${error}`));
    } catch {}
  }
}; 