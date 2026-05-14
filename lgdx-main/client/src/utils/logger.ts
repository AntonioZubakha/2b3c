// ==========================================================================
// PRODUCTION LOGGING SYSTEM
// Централизованная система логирования для продакшена
// ==========================================================================

import { config } from '../config/environment';
import * as Sentry from "@sentry/react";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
}

class Logger {
  private isProduction = config.environment === 'production';
  private logLevel = this.getLogLevel();
  private sessionId = this.generateSessionId();
  private userId?: string;

  private getLogLevel(): LogLevel {
    switch (config.logLevel) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      case 'critical': return LogLevel.CRITICAL;
      default: return this.isProduction ? LogLevel.ERROR : LogLevel.DEBUG;
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
      userId: this.userId,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const levelName = levelNames[entry.level];
    
    let formatted = `[${entry.timestamp}] ${levelName}: ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      formatted += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += ` | Stack: ${entry.error.stack}`;
      }
    }
    
    return formatted;
  }

  private sendToMonitoring(entry: LogEntry) {
    if (!this.isProduction) return;

    if (config.sentryDsn) {
      Sentry.captureException(entry.error || new Error(entry.message), {
        extra: entry.context,
        tags: {
          userId: entry.userId,
          sessionId: entry.sessionId
        }
      });
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
      console.debug(this.formatLogEntry(entry));
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, context);
      console.info(this.formatLogEntry(entry));
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, context);
      console.warn(this.formatLogEntry(entry));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, context, error);
      console.error(this.formatLogEntry(entry));
      this.sendToMonitoring(entry);
    }
  }

  critical(message: string, error?: Error, context?: Record<string, unknown>) {
    if (this.shouldLog(LogLevel.CRITICAL)) {
      const entry = this.createLogEntry(LogLevel.CRITICAL, message, context, error);
      console.error(this.formatLogEntry(entry));
      this.sendToMonitoring(entry);
    }
  }

  // Специальные методы для типичных сценариев
  apiError(endpoint: string, error: Error, context?: Record<string, unknown>) {
    // Type guard для Axios error
    const axiosError = error as { response?: { status?: number; statusText?: string } };
    
    this.error(`API Error: ${endpoint}`, error, {
      endpoint,
      status: axiosError.response?.status,
      statusText: axiosError.response?.statusText,
      ...context
    });
  }

  authError(action: string, error: Error, context?: Record<string, unknown>) {
    this.error(`Authentication Error: ${action}`, error, {
      action,
      ...context
    });
  }

  userAction(action: string, context?: Record<string, unknown>) {
    this.info(`User Action: ${action}`, {
      action,
      ...context
    });
  }

  performance(operation: string, duration: number, context?: Record<string, unknown>) {
    this.info(`Performance: ${operation}`, {
      operation,
      duration,
      ...context
    });
  }
}

// Создаем глобальный экземпляр логгера
export const logger = new Logger();

// Экспортируем типы для использования в других модулях 