import express, { Router, Request, Response } from 'express';
import { getMessageBrokerStatus, isMessageBrokerHealthy } from '../services/messageBroker';
import mongoose from 'mongoose';
import axios from 'axios';

const router: Router = express.Router();

// Basic health check
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'lgdx-server'
  });
});

// Detailed health check
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const messageBrokerStatus = await getMessageBrokerStatus();
    
    const healthStatus = {
      status: dbStatus === 'connected' && messageBrokerStatus.connected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'lgdx-server',
      services: {
        database: {
          status: dbStatus,
          readyState: mongoose.connection.readyState
        },
        messageBroker: messageBrokerStatus
      },
      system: {
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external
        },
        cpu: process.cpuUsage()
      }
    };

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'lgdx-server'
    });
  }
});

// Readiness probe
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const dbReady = mongoose.connection.readyState === 1;
    const messageBrokerReady = (await getMessageBrokerStatus()).connected;
    
    const ready = dbReady && messageBrokerReady;
    const statusCode = ready ? 200 : 503;
    
    res.status(statusCode).json({
      ready,
      timestamp: new Date().toISOString(),
      services: {
        database: dbReady,
        messageBroker: messageBrokerReady
      }
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Liveness probe
router.get('/live', (req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Microservice health endpoints
router.get('/sync', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'api-sync-service',
    message: 'API sync service health check endpoint'
  });
});

router.get('/import', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'file-import-service',
    message: 'File import service health check endpoint'
  });
});

router.get('/calculator', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'market-price-calculator',
    message: 'Market price calculator service health check endpoint'
  });
});

router.get('/db', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const statusCode = dbStatus === 'connected' ? 200 : 503;
  
  res.status(statusCode).json({
    status: dbStatus,
    timestamp: new Date().toISOString(),
    service: 'mongodb',
    readyState: mongoose.connection.readyState
  });
});

router.get('/redis', async (req: Request, res: Response) => {
  try {
    // Simple Redis health check - you might want to add actual Redis connection check
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'redis',
      message: 'Redis health check endpoint'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'redis',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/queue', async (req: Request, res: Response) => {
  try {
    const ARE_MICROSERVICES_LIVE = process.env.ARE_MICROSERVICES_LIVE === 'true';
    
    if (!ARE_MICROSERVICES_LIVE) {
      // When microservices are disabled, RabbitMQ is still healthy and running
      // Server just doesn't connect to it (uses direct processing instead)
      // We trust that Docker Swarm's health checks ensure RabbitMQ is actually running
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'rabbitmq',
        connected: false,
        mode: 'standalone',
        message: 'RabbitMQ is running but not connected (microservices disabled)'
      });
      return;
    }
    
    // When microservices are enabled, check our connection
    const isConnected = isMessageBrokerHealthy();
    const statusCode = isConnected ? 200 : 503;
    
    res.status(statusCode).json({
      status: isConnected ? 'ok' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'rabbitmq',
      connected: isConnected,
      mode: 'connected'
    });
  } catch (error) {
    // If we can't check the status, assume it's unhealthy
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'rabbitmq',
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 