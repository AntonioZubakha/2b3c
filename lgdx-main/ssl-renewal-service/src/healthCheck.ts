import * as http from 'http';
import { logger } from './logger';
import { metricsCollector } from './metrics';
import type { SSLRenewalService } from './sslRenewalService';

let renewalServiceInstance: SSLRenewalService | null = null;

export function setRenewalServiceInstance(service: SSLRenewalService): void {
  renewalServiceInstance = service;
}

export function createHealthCheckServer(): void {
  const port = process.env.HEALTH_PORT || 3000;

  const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'ssl-renewal-service',
        timestamp: new Date().toISOString()
      }));
    }
    // Metrics endpoint (Prometheus format)
    else if (req.url === '/metrics' && req.method === 'GET') {
      const metrics = metricsCollector.generatePrometheusMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(metrics);
    }
    // Manual trigger endpoint
    else if (req.url === '/trigger-renewal' && req.method === 'POST') {
      if (!renewalServiceInstance) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Service not initialized',
          message: 'SSL renewal service is not ready yet'
        }));
        return;
      }

      logger.info('🔧 Manual SSL renewal triggered via API');
      
      // Trigger renewal asynchronously
      renewalServiceInstance.renewCertificate()
        .then(() => {
          logger.info('✅ Manual SSL renewal completed successfully');
        })
        .catch((error) => {
          logger.error('❌ Manual SSL renewal failed', { error });
        });

      // Return 202 Accepted immediately
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'triggered',
        message: 'SSL renewal process started',
        timestamp: new Date().toISOString()
      }));
    }
    // Status endpoint (JSON metrics)
    else if (req.url === '/status' && req.method === 'GET') {
      const metrics = metricsCollector.getMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        metrics,
        timestamp: new Date().toISOString()
      }));
    }
    // Not found
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Not found',
        availableEndpoints: [
          'GET /health - Health check',
          'GET /metrics - Prometheus metrics',
          'GET /status - JSON status and metrics',
          'POST /trigger-renewal - Manually trigger SSL renewal'
        ]
      }));
    }
  });

  server.listen(port, () => {
    logger.info(`🏥 Health check server listening on port ${port}`);
    logger.info(`📊 Endpoints: /health, /metrics, /status, /trigger-renewal`);
  });

  server.on('error', (error) => {
    logger.error('❌ Health check server error', { error });
  });
}

