import express, { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

const register = new client.Registry();

register.setDefaultLabels({
  service: 'market-price-calculator',
});

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'market_price_http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by the market price calculator service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

register.registerMetric(httpRequestDuration);

const calculationDuration = new client.Histogram({
  name: 'market_price_calculation_duration_seconds',
  help: 'Duration of market price calculations',
  labelNames: ['trigger', 'status'],
  buckets: [5, 15, 30, 60, 120, 300, 600],
});

register.registerMetric(calculationDuration);

const calculationCounter = new client.Counter({
  name: 'market_price_calculations_total',
  help: 'Total number of market price calculations',
  labelNames: ['trigger', 'status'],
});

register.registerMetric(calculationCounter);

const snapshotEntryGauge = new client.Gauge({
  name: 'market_price_snapshot_entries',
  help: 'Number of entries in the latest market price snapshot',
});

register.registerMetric(snapshotEntryGauge);

const snapshotAgeGauge = new client.Gauge({
  name: 'market_price_snapshot_age_minutes',
  help: 'Age of the latest market price snapshot in minutes',
});

register.registerMetric(snapshotAgeGauge);

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

interface SnapshotInfo {
  generatedAt?: string;
  entryCount?: number;
}

export const recordCalculationMetrics = (
  trigger: string,
  durationMs: number,
  status: 'success' | 'error' | 'partial',
  snapshot?: SnapshotInfo,
): void => {
  const durationSeconds = durationMs / 1000;
  calculationDuration.observe({ trigger, status }, durationSeconds);
  calculationCounter.inc({ trigger, status });

  if (snapshot?.entryCount !== undefined) {
    snapshotEntryGauge.set(snapshot.entryCount);
  }

  if (snapshot?.generatedAt) {
    const ageMinutes = (Date.now() - new Date(snapshot.generatedAt).getTime()) / 60000;
    snapshotAgeGauge.set(Math.max(ageMinutes, 0));
  }
};

export { register as metricsRegistry };

