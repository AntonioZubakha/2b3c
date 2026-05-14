import express, { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

const register = new client.Registry();

register.setDefaultLabels({
  service: 'backup-service',
});

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'backup_http_request_duration_seconds',
  help: 'Duration of HTTP requests processed by the backup service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

register.registerMetric(httpRequestDuration);

const backupDuration = new client.Histogram({
  name: 'backup_job_duration_seconds',
  help: 'Duration of backup jobs',
  labelNames: ['status'],
  buckets: [30, 60, 120, 300, 600, 900, 1800],
});

register.registerMetric(backupDuration);

const backupCounter = new client.Counter({
  name: 'backup_jobs_total',
  help: 'Total number of backup jobs executed',
  labelNames: ['status'],
});

register.registerMetric(backupCounter);

const lastSuccessfulBackupTimestamp = new client.Gauge({
  name: 'backup_last_success_timestamp',
  help: 'Unix timestamp of the last successful backup',
});

register.registerMetric(lastSuccessfulBackupTimestamp);

const lastFailedBackupTimestamp = new client.Gauge({
  name: 'backup_last_failure_timestamp',
  help: 'Unix timestamp of the last failed backup',
});

register.registerMetric(lastFailedBackupTimestamp);

export const metricsRouter = express.Router();

metricsRouter.get('/', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/metrics') {
    next();
    return;
  }

  const end = httpRequestDuration.startTimer({ method: req.method });

  res.on('finish', () => {
    const route = req.route?.path ?? req.path;
    end({
      route,
      status_code: res.statusCode,
    });
  });

  next();
};

export const recordBackupMetrics = (durationMs: number, status: 'success' | 'error'): void => {
  const durationSeconds = durationMs / 1000;
  backupDuration.observe({ status }, durationSeconds);
  backupCounter.inc({ status });

  const timestamp = Date.now() / 1000;
  if (status === 'success') {
    lastSuccessfulBackupTimestamp.set(timestamp);
  } else {
    lastFailedBackupTimestamp.set(timestamp);
  }
};

export { register as metricsRegistry };

