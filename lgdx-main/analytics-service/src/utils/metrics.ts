import express, { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();

register.setDefaultLabels({
  service: 'analytics-service',
});

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'analytics_http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by the analytics service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

register.registerMetric(httpRequestDuration);

export const analyticsJobDuration = new client.Histogram({
  name: 'analytics_job_duration_seconds',
  help: 'Duration of analytics generation jobs',
  labelNames: ['job', 'status'],
  buckets: [5, 15, 30, 60, 120, 300, 600, 1200],
});

register.registerMetric(analyticsJobDuration);

export const analyticsJobCounter = new client.Counter({
  name: 'analytics_jobs_total',
  help: 'Total analytics jobs executed',
  labelNames: ['job', 'status'],
});

register.registerMetric(analyticsJobCounter);

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

  const end = httpRequestDuration.startTimer({
    method: req.method,
  });

  res.on('finish', () => {
    const route = req.route?.path ?? req.path;
    end({
      route,
      status_code: res.statusCode,
    });
  });

  next();
};

export { register as metricsRegistry };

