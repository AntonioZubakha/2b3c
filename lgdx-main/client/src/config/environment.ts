// ==========================================================================
// ENVIRONMENT CONFIGURATION
// Централизованная конфигурация для разных окружений
// ==========================================================================

import { getSecretValue } from '../utils/secrets';

interface EnvironmentConfig {
  // API Configuration
  apiUrl: string;
  analyticsServiceUrl?: string;
  
  // Logging Configuration
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  enableDebugLogs: boolean;
  
  // Monitoring Configuration
  enableAnalytics: boolean;
  sentryDsn?: string;
  gaMeasurementId?: string;
  
  // App Configuration
  appVersion: string;
  environment: 'development' | 'staging' | 'production';
  
  // Feature Flags
  enableExperimentalFeatures: boolean;
  enablePerformanceMonitoring: boolean;
}

// Определяем конфигурацию в зависимости от окружения
const getEnvironmentConfig = async (): Promise<EnvironmentConfig> => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Читаем Sentry DSN из секрета или переменной окружения
  const sentryDsn = await getSecretValue(
    'REACT_APP_SENTRY_DSN', 
    process.env.REACT_APP_SENTRY_DSN_FILE
  );
  
  // Читаем GA Measurement ID из секрета или переменной окружения
  const gaMeasurementId = await getSecretValue(
    'REACT_APP_GA_MEASUREMENT_ID',
    process.env.REACT_APP_GA_MEASUREMENT_ID_FILE
  );
  
  // Базовая конфигурация
  const devApiUrl =
    process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim().length > 0
      ? process.env.REACT_APP_API_URL
      : '/api';

  const baseConfig: EnvironmentConfig = {
    apiUrl: isDevelopment ? devApiUrl : (process.env.REACT_APP_API_URL || '/api'),
    analyticsServiceUrl: isDevelopment ? 'http://localhost:9200' : (process.env.REACT_APP_ANALYTICS_SERVICE_URL || ''),
    logLevel: (process.env.REACT_APP_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | 'critical') || (isDevelopment ? 'debug' : 'error'),
    enableDebugLogs: process.env.REACT_APP_DEBUG === 'true' || isDevelopment,
    enableAnalytics: isProduction && !!gaMeasurementId,
    sentryDsn: sentryDsn || undefined,
    gaMeasurementId: gaMeasurementId || undefined,
    appVersion: process.env.REACT_APP_VERSION || '1.0.0',
    environment: (process.env.REACT_APP_ENV as 'development' | 'staging' | 'production') || (isDevelopment ? 'development' : 'production'),
    enableExperimentalFeatures: isDevelopment,
    enablePerformanceMonitoring: isProduction
  };

  return baseConfig;
};

// Экспортируем конфигурацию
export const getConfig = getEnvironmentConfig;

// Синхронная версия для обратной совместимости (возвращает undefined для sentryDsn)
export const config: Omit<EnvironmentConfig, 'sentryDsn' | 'gaMeasurementId'> & { sentryDsn?: string; gaMeasurementId?: string } = {
  apiUrl:
    process.env.NODE_ENV === 'development'
      ? (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim().length > 0
          ? process.env.REACT_APP_API_URL
          : '/api')
      : (process.env.REACT_APP_API_URL || '/api'),
  analyticsServiceUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:9200' : (process.env.REACT_APP_ANALYTICS_SERVICE_URL || ''),
  logLevel: (process.env.REACT_APP_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | 'critical') || (process.env.NODE_ENV === 'development' ? 'debug' : 'error'),
  enableDebugLogs: process.env.REACT_APP_DEBUG === 'true' || process.env.NODE_ENV === 'development',
  enableAnalytics: process.env.NODE_ENV === 'production' && !!process.env.REACT_APP_GA_MEASUREMENT_ID,
  sentryDsn: undefined, // Будет установлено асинхронно
  gaMeasurementId: process.env.REACT_APP_GA_MEASUREMENT_ID,
  appVersion: process.env.REACT_APP_VERSION || '1.0.0',
  environment: (process.env.REACT_APP_ENV as 'development' | 'staging' | 'production') || (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
  enableExperimentalFeatures: process.env.NODE_ENV === 'development',
  enablePerformanceMonitoring: process.env.NODE_ENV === 'production'
};
