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
  app: 'api-product-sync-service'
});

// Включаем сбор стандартных метрик (CPU, память и т.д.)
client.collectDefaultMetrics({ register });

// --- Кастомные метрики ---

// Счетчик обработанных заданий
export const jobsProcessedCounter = new client.Counter({
  name: 'api_sync_jobs_processed_total',
  help: 'Total number of API sync jobs processed',
  labelNames: ['supplier', 'status'], // Например: {supplier: 'bhavani', status: 'success'}
});
register.registerMetric(jobsProcessedCounter);

// Гистограмма для измерения времени обработки задания
export const jobDurationHistogram = new client.Histogram({
  name: 'api_sync_job_duration_seconds',
  help: 'Duration of API sync job processing in seconds',
  labelNames: ['supplier'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300] // Бакеты от 0.1с до 5 минут
});
register.registerMetric(jobDurationHistogram);

// External API call duration
export const externalApiDuration = new client.Histogram({
  name: 'api_sync_external_request_seconds',
  help: 'Duration of external API requests in seconds',
  labelNames: ['supplier', 'endpoint', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});
register.registerMetric(externalApiDuration);

// Count of items fetched from supplier
export const externalItemsFetched = new client.Counter({
  name: 'api_sync_external_items_fetched_total',
  help: 'Number of items fetched from external supplier',
  labelNames: ['supplier']
});
register.registerMetric(externalItemsFetched);

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

// --- Настройка сервера метрик ---

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    service: 'api-product-sync-service'
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
      service: 'api-product-sync-service',
      metrics: {
        totalJobsProcessed: await getTotalJobsProcessed(),
        activeConnections: await getActiveConnections()
      }
    };
    res.status(200).json(health);
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      service: 'api-product-sync-service'
    });
  }
});

app.get('/cache-status', (_req, res) => {
  const status = getMarketPriceCacheStatus();
  res.status(200).json({
    ...status,
    timestamp: new Date().toISOString(),
  });
});

// Настраиваем эндпоинт /metrics, который будет отдавать данные для Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Helper functions for detailed health check
async function getTotalJobsProcessed(): Promise<number> {
  try {
    const metrics = await register.metrics();
    // Parse metrics to get total jobs processed
    const match = metrics.match(/api_sync_jobs_processed_total\s+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch (error) {
    return 0;
  }
}

async function getActiveConnections(): Promise<number> {
  try {
    // This would typically check actual connection pools
    // For now, return a placeholder
    return 1;
  } catch (error) {
    return 0;
  }
}

const port = process.env.METRICS_PORT || 9100;

export const startMetricsServer = () => {
    try {
        app.listen(port, () => {
            logger.info(`Metrics server listening on port ${port}`);
        });
    } catch (error) {
        logger.error({ error }, 'Failed to start metrics server');
        process.exit(1);
    }
}; 