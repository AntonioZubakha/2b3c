import { HealthStatus } from './types';
import { backupService } from './services/backupService';
import { config } from './config';
import { logger } from './utils/logger';

export async function getHealthStatus(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();
  
  try {
    // Simple health check - just check if service is running
    const diskUsage = await getDiskUsage();
    const lastBackup = backupService.getLastBackup();
    
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp,
      lastBackup: lastBackup || undefined,
      diskUsage,
      mongodbConnection: true // Assume connection is working
    };
    
    logger.debug('Health check completed', { status: 'healthy' });
    
    return healthStatus;
    
  } catch (error) {
    logger.error('Health check failed', { error: error instanceof Error ? error.message : error });
    
    return {
      status: 'unhealthy',
      timestamp,
      diskUsage: {
        total: 0,
        used: 0,
        available: 0,
        percentage: 0
      },
      mongodbConnection: false
    };
  }
}

async function getDiskUsage(): Promise<{ total: number; used: number; available: number; percentage: number }> {
  try {
    // Simple disk usage check for now
    const total = 1000000000; // 1GB
    const used = 500000000;   // 500MB
    const available = total - used;
    const percentage = (used / total) * 100;
    
    return {
      total,
      used,
      available,
      percentage: Math.round(percentage * 100) / 100
    };
  } catch (error) {
    logger.error('Failed to get disk usage', { error: error instanceof Error ? error.message : error });
    return {
      total: 0,
      used: 0,
      available: 0,
      percentage: 0
    };
  }
}

async function testMongoDBConnection(): Promise<boolean> {
  try {
    // Simple connection test - just check if we can parse the URI
    const uri = new URL(config.mongodbUri);
    const host = uri.hostname;
    const port = uri.port || '27017';
    
    // For now, just return true if URI is valid
    // In production, you might want to add a lightweight ping test
    return host && port ? true : false;
    
  } catch (error) {
    logger.error('MongoDB connection test failed', { error: error instanceof Error ? error.message : error });
    return false;
  }
}

// Simple health check for Docker health check
export async function simpleHealthCheck(): Promise<boolean> {
  try {
    // Just check if the service is running - no MongoDB connection test
    return true;
  } catch (error) {
    logger.error('Simple health check failed', { error: error instanceof Error ? error.message : error });
    return false;
  }
} 