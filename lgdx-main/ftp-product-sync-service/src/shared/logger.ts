/**
 * Централизованная система логирования для FTP-сервиса
 * Совместимая с существующей системой логирования LGDX
 */

import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Конфигурация логгера для разных окружений
const loggerConfig = {
  level: LOG_LEVEL,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'ftp-product-sync-service',
    version: '1.0.0',
    environment: NODE_ENV,
  },
};

// Добавляем pretty печать для development
if (NODE_ENV === 'development') {
  (loggerConfig as Record<string, unknown>).transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '[{service}] {msg}',
    },
  };
}

export const logger = pino(loggerConfig);

/**
 * Маскирование чувствительных данных в логах
 */
export function maskSensitiveData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const masked = { ...(data as Record<string, unknown>) };
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'auth',
    'credential',
    'passwordHash',
    'sessionId'
  ];

  for (const field of sensitiveFields) {
    if (field in masked) {
      masked[field] = '***MASKED***';
    }
  }

  return masked;
}

/**
 * Логирование FTP событий с маскированием чувствительных данных
 */
export class FtpLogger {
  static logConnection(companyId: string, ip: string, username: string): void {
    logger.info('[FTP-Connection] User connected', {
      companyId,
      ip,
      username: maskSensitiveData({ username }).username,
      timestamp: new Date().toISOString(),
    });
  }

  static logDisconnection(companyId: string, ip: string, username: string, reason?: string): void {
    logger.info('[FTP-Disconnection] User disconnected', {
      companyId,
      ip,
      username: maskSensitiveData({ username }).username,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  static logFileUpload(companyId: string, fileName: string, fileSize: number): void {
    logger.info('[FTP-Upload] File uploaded', {
      companyId,
      fileName,
      fileSize,
      timestamp: new Date().toISOString(),
    });
  }

  static logFileProcessing(companyId: string, fileName: string, status: 'started' | 'completed' | 'failed'): void {
    logger.info(`[FTP-Processing] File processing ${status}`, {
      companyId,
      fileName,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  static logSecurityEvent(event: string, details: Record<string, unknown>): void {
    logger.warn(`[FTP-Security] ${event}`, {
      ...maskSensitiveData(details),
      timestamp: new Date().toISOString(),
    });
  }

  static logError(context: string, error: Error, metadata?: Record<string, unknown>): void {
    logger.error(`[FTP-Error] ${context}`, {
      error: error.message,
      stack: error.stack,
      ...maskSensitiveData(metadata || {}),
      timestamp: new Date().toISOString(),
    });
  }
}
