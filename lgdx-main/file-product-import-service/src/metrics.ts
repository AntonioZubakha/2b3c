import express from 'express';
import client from 'prom-client';
import pino from 'pino';
import { getMarketPriceCacheStatus } from './shared/marketPriceCacheClient';

const logger = pino({
    transport: {
        target: 'pino-pretty'
    }
});

const app = express();
const register = new client.Registry();

// Добавляем метку по умолчанию, которая будет у всех метрик
register.setDefaultLabels({
  app: 'file-product-import-service'
});

// Включаем сбор стандартных метрик (CPU, память и т.д.)
client.collectDefaultMetrics({ register });

// --- Кастомные метрики ---

// Счетчик обработанных файлов
export const filesProcessedCounter = new client.Counter({
  name: 'file_import_files_processed_total',
  help: 'Total number of files processed',
  labelNames: ['status', 'file_type'], // Например: {status: 'success', file_type: 'csv'}
});
register.registerMetric(filesProcessedCounter);

// Гистограмма для измерения времени обработки файла
export const fileProcessingDurationHistogram = new client.Histogram({
  name: 'file_import_processing_duration_seconds',
  help: 'Duration of file processing in seconds',
  labelNames: ['file_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600] // Бакеты от 1с до 10 минут
});
register.registerMetric(fileProcessingDurationHistogram);

// Счетчик ошибок обработки
export const fileProcessingErrorsCounter = new client.Counter({
  name: 'file_import_errors_total',
  help: 'Total number of file processing errors',
  labelNames: ['error_type', 'file_type'],
});
register.registerMetric(fileProcessingErrorsCounter);

// Market price cache warmup duration
export const marketPriceCacheDurationHistogram = new client.Histogram({
  name: 'market_price_cache_duration_seconds',
  help: 'Duration of market price cache warmup',
  labelNames: ['source'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]
});
register.registerMetric(marketPriceCacheDurationHistogram);

// Market price cache categories gauge
export const marketPriceCacheCategoriesGauge = new client.Gauge({
  name: 'market_price_cache_categories',
  help: 'Number of categories loaded into market price cache',
  labelNames: ['source']
});
register.registerMetric(marketPriceCacheCategoriesGauge);

// Duplicate insert counter
export const importDuplicatesCounter = new client.Counter({
  name: 'import_duplicates_total',
  help: 'Number of duplicate key conflicts detected during import',
  labelNames: ['stage']
});
register.registerMetric(importDuplicatesCounter);

export const marketPriceCacheVersionAgeGauge = new client.Gauge({
  name: 'market_price_cache_version_age_minutes',
  help: 'Age of the current market price cache version in minutes',
  labelNames: ['source'],
});
register.registerMetric(marketPriceCacheVersionAgeGauge);

// --- Health Check Endpoints ---

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    service: 'file-product-import-service'
  });
});

// Detailed health check
app.get('/health/detailed', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      service: 'file-product-import-service',
      metrics: {
        totalFilesProcessed: await getTotalFilesProcessed(),
        totalErrors: await getTotalErrors(),
        averageProcessingTime: await getAverageProcessingTime()
      }
    };
    res.status(200).json(health);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: errorMessage,
      service: 'file-product-import-service'
    });
  }
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (ex) {
    res.status(500).send(String(ex));
  }
});

app.get('/cache-status', (_req, res) => {
  const status = getMarketPriceCacheStatus();
  res.status(200).json({
    ...status,
    timestamp: new Date().toISOString(),
  });
});

// Helper functions for detailed health check
async function getTotalFilesProcessed(): Promise<number> {
  try {
    const metrics = await register.metrics();
    const match = metrics.match(/file_import_files_processed_total\s+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch (error) {
    return 0;
  }
}

async function getTotalErrors(): Promise<number> {
  try {
    const metrics = await register.metrics();
    const match = metrics.match(/file_import_errors_total\s+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch (error) {
    return 0;
  }
}

async function getAverageProcessingTime(): Promise<number> {
  try {
    const metrics = await register.metrics();
    // This would typically calculate average from histogram buckets
    // For now, return a placeholder
    return 30; // 30 seconds average
  } catch (error) {
    return 0;
  }
}

const port = process.env.METRICS_PORT || 9101;

export const startMetricsServer = () => {
    try {
        app.listen(port, () => {
            logger.info(`File Import Service metrics server listening on port ${port}`);
        });
    } catch (error) {
        logger.error({ error }, 'Failed to start metrics server');
        process.exit(1);
    }
}; 