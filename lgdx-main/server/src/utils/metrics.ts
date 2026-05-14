import express, { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();

register.setDefaultLabels({
  service: 'lgdx-server',
});

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

register.registerMetric(httpRequestDuration);

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

