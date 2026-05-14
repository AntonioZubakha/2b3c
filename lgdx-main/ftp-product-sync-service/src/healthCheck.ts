/**
 * Health check сервер для мониторинга FTP сервиса
 */

import express from 'express';
import { logger } from './shared/logger';
import { isMongoConnected } from './shared/database';
import { isRabbitMQReady } from './shared/rabbitmq';
import { metricsRegistry } from './services/metrics';
import type { FileWatcher } from './services/fileWatcher';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    mongodb: 'connected' | 'disconnected' | 'error';
    rabbitmq: 'connected' | 'disconnected' | 'error';
    ftpServer: 'running' | 'stopped' | 'error';
  };
  version: string;
}

export interface HealthCheckServerOptions {
  /** Used by lgdx-server admin "Sync" for NEW FTP (re-scan files already on disk). */
  fileWatcher?: FileWatcher;
}

export async function healthCheckServer(port: number, options?: HealthCheckServerOptions): Promise<void> {
  const app = express();

  // Health check endpoint
  app.get('/health', (req, res) => {
    const health = getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  });

  // Metrics endpoint
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  });

  // Ready endpoint для Kubernetes
  app.get('/ready', (req, res) => {
    const isReady = isMongoConnected() && isRabbitMQReady();
    res.status(isReady ? 200 : 503).json({ ready: isReady });
  });

  // Live endpoint для Kubernetes
  app.get('/live', (req, res) => {
    res.status(200).json({ alive: true });
  });

  // Internal: admin-triggered rescan (overlay network only — same pattern as legacy-ftp-poller :3001)
  app.post('/internal/rescan/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const fw = options?.fileWatcher;
    if (!fw) {
      res.status(503).json({ ok: false, error: 'File watcher not initialized' });
      return;
    }
    try {
      const result = await fw.rescanCompanyFiles(companyId);
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logger.error({ err, companyId }, '[HealthCheck] rescan failed');
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Rescan failed',
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info(`[HealthCheck] Health check server listening on port ${port}`);
      resolve();
    });
    server.on('error', reject);
  });
}

function getHealthStatus(): HealthStatus {
  const mongoStatus = isMongoConnected() ? 'connected' : 'disconnected';
  const rabbitStatus = isRabbitMQReady() ? 'connected' : 'disconnected';
  const ftpStatus = 'running'; // Упрощено - если сервис запущен, FTP работает

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Определяем общий статус
  const criticalServicesDown = [mongoStatus, rabbitStatus].filter(s => s === 'disconnected').length;
  
  if (criticalServicesDown > 0) {
    overallStatus = criticalServicesDown === 1 ? 'degraded' : 'unhealthy';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: mongoStatus,
      rabbitmq: rabbitStatus,
      ftpServer: ftpStatus
    },
    version: process.env.npm_package_version || '1.0.0'
  };
}