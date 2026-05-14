import dotenv from 'dotenv';
import { startWorker, cleanupWorker } from './worker';
import { startMetricsServer } from './metrics';
import { startProxyServer } from './shared/proxyServer';
import { initGracefulShutdown, registerCleanup } from './utils/gracefulShutdown';
import { initializeScheduler, stopScheduler } from './scheduler';
import { initializeMarketPriceCache, shutdownMarketPriceCache } from './shared/marketPriceCacheClient';
import { startHealthServer } from './health';
import { logger } from './shared/logger';

// During heavy bulk-write phases the logger writes many lines synchronously to
// stdout/stderr.  Node's Writable stream adds a transient 'drain' listener for
// each buffered write, which harmlessly fires "MaxListenersExceededWarning" once
// more than 10 are queued.  Raising the limit silences the false-positive.
process.stdout.setMaxListeners(50);
process.stderr.setMaxListeners(50);

// Memory monitoring setup
if (process.env.NODE_ENV === 'production') {
    // Log memory usage every 30 seconds in production
    setInterval(() => {
        const memUsage = process.memoryUsage();
        logger.info('[Memory Monitor] Memory usage', {
            rssMB: Math.round(memUsage.rss / 1024 / 1024),
            heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
        });
    }, 30000);
}

dotenv.config();

async function main() {
    try {
        logger.info('[Main] Starting service...');
        startHealthServer();
        startMetricsServer();
        startProxyServer(); // Запускаем прокси-сервер
        await initializeMarketPriceCache();
        await startWorker();
        
        // Initialize automatic scheduler
        initializeScheduler();
        logger.info('[Main] Service started successfully.');
        
        // Register cleanup functions for graceful shutdown
        registerCleanup(cleanupWorker, 'API Sync Worker (RabbitMQ + MongoDB)');
        registerCleanup(stopScheduler, 'API Sync Scheduler');
        registerCleanup(shutdownMarketPriceCache, 'Market Price Cache Client');
        
        // Initialize graceful shutdown handlers
        initGracefulShutdown();
        logger.info('[Main] Graceful shutdown initialized');
    } catch (error) {
        logger.error('[Main] Failed to start service', { error });
        process.exit(1);
    }
}

main(); 