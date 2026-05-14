import express from 'express';
import { validateConfig } from './config';
import { logger } from './utils/logger';
import { backupScheduler } from './scheduler';
import { backupService } from './services/backupService';
import { restoreService } from './services/restoreService';
import { getHealthStatus, simpleHealthCheck } from './health';
import { metricsMiddleware, metricsRouter } from './metrics';

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', { error: error instanceof Error ? error.message : error });
  process.exit(1);
}

// Create Express app
const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(metricsMiddleware);
app.use('/metrics', metricsRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error instanceof Error ? error.message : error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Simple health check for Docker
app.get('/health/simple', async (req, res) => {
  try {
    const isHealthy = await simpleHealthCheck();
    res.status(isHealthy ? 200 : 503).json({ status: isHealthy ? 'healthy' : 'unhealthy' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Manual backup trigger (БЕЗ координации)
app.post('/backup', async (req, res) => {
  try {
    logger.info('Manual backup requested');
    const result = await backupService.createBackup();
    res.json(result);
  } catch (error) {
    logger.error('Manual backup failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test backup WITH coordination (для тестирования ServiceCoordinator!)
app.post('/backup/test-coordinated', async (req, res) => {
  try {
    logger.info('🧪 TEST: Coordinated backup requested');
    
    // Вызываем scheduler напрямую (он имеет координацию!)
    const coordinator = require('./utils/serviceCoordinator').getServiceCoordinator();
    const fs = require('fs');
    
    const getRedisUrl = () => {
      if (process.env.REDIS_URL_FILE) {
        try {
          return fs.readFileSync(process.env.REDIS_URL_FILE, 'utf8').trim();
        } catch (e) {}
      }
      return process.env.REDIS_URL || 'redis://lgdx_redis:6379';
    };
    
    const redisUrl = getRedisUrl();
    await coordinator.initialize(redisUrl);
    
    logger.info('[TEST] Checking if api-sync is completed...');
    const canStart = await coordinator.waitForCompletion('api-sync', 7200000);
    
    if (!canStart) {
      logger.warn('[TEST] ⚠️ api-sync still running, backup would be skipped');
      await coordinator.close();
      return res.json({ 
        message: 'api-sync still running, backup skipped (AS EXPECTED!)',
        wouldWait: true
      });
    }
    
    logger.info('[TEST] ✅ api-sync completed, backup would start');
    await coordinator.close();
    
    res.json({ 
      message: 'api-sync completed, backup can start',
      wouldWait: false
    });
    
  } catch (error) {
    logger.error('Test coordinated backup failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List backups
app.get('/backups', async (req, res) => {
  try {
    const backups = await backupService.listBackups();
    res.json(backups);
  } catch (error) {
    logger.error('Failed to list backups', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get backup info
app.get('/backups/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const backupInfo = await backupService.getBackupInfo(filename);
    
    if (!backupInfo) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    
    res.json(backupInfo);
  } catch (error) {
    logger.error('Failed to get backup info', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete backup
app.delete('/backups/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const success = await backupService.deleteBackup(filename);
    
    if (!success) {
      return res.status(404).json({ error: 'Backup not found or could not be deleted' });
    }
    
    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete backup', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Restore from backup
app.post('/restore/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { test = false } = req.body as { test?: boolean };
    
    logger.info('Restore requested', { filename, test });
    
    let result;
    if (test) {
      result = await restoreService.testRestore(filename);
    } else {
      result = await restoreService.restoreFromBackup(filename);
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Restore failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Scheduler status
app.get('/scheduler/status', (req, res) => {
  const status = backupScheduler.getStatus();
  res.json(status);
});

// Start/stop scheduler
app.post('/scheduler/start', (req, res) => {
  try {
    backupScheduler.start();
    res.json({ success: true, message: 'Scheduler started' });
  } catch (error) {
    logger.error('Failed to start scheduler', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/scheduler/stop', (req, res) => {
  try {
    backupScheduler.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error) {
    logger.error('Failed to stop scheduler', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  backupScheduler.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  backupScheduler.stop();
  process.exit(0);
});

// Start the server
async function startServer() {
  try {
    // Start backup scheduler
    backupScheduler.start();
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Backup service started on port ${PORT}`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error: error instanceof Error ? error.message : error });
    process.exit(1);
  }
}

// Start the application
startServer(); 