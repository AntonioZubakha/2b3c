import { simpleHealthCheck } from './health';
import { logger } from './shared/logger';

async function main() {
  try {
    const isHealthy = await simpleHealthCheck();
    if (isHealthy) {
      // Health check скрипт - оставляем console.log для Docker healthcheck
      console.log('Health check passed');
      process.exit(0);
    } else {
      console.log('Health check failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error('[HealthCheck] Health check error', { error });
    process.exit(1);
  }
}

main(); 