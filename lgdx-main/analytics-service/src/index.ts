import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AnalyticsController } from './controllers/analyticsController';
import { DebugController } from './controllers/debugController';
import { connectDatabase, disconnectDatabase } from './config/database';
import './models/AnalyticsDataModel'; // Register the model
import { AnalyticsScheduler } from './scheduler/analyticsScheduler';
import { DatabaseIndexes } from './utils/databaseIndexes';
import { logger } from './utils/logger';
import { sendAnalyticsStartNotification } from './shared/telegramBot';
import { initGracefulShutdown, registerCleanup } from './utils/gracefulShutdown';
import { metricsMiddleware, metricsRouter } from './utils/metrics';
import { getServiceCoordinator } from './utils/serviceCoordinator';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 9200;

// Middleware
app.use(metricsMiddleware);
app.use('/metrics', metricsRouter);
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', AnalyticsController.healthCheck);

// Specific analytics routes (must come before /:period wildcard)
app.get('/analytics/compare', AnalyticsController.compareCategories);
app.get('/analytics/price-trends', AnalyticsController.getPriceTrendsForPeriod);
app.get('/analytics/supply-opportunities', AnalyticsController.getCategorySupplyOpportunities);
app.get('/analytics/category-options', AnalyticsController.getCategoryOptions);
app.get('/analytics/compare-categories', AnalyticsController.compareTwoCategories);
app.post('/analytics/recalculate', AnalyticsController.recalculate);

// Main analytics routes (wildcard last)
app.get('/analytics/day', AnalyticsController.getAnalytics);
app.get('/analytics/week', AnalyticsController.getAnalytics);
app.get('/analytics/month', AnalyticsController.getAnalytics);
app.get('/analytics/:period', AnalyticsController.getAnalytics);

// Category stats routes
app.get('/category-stats', AnalyticsController.getCategoryStats);
app.get('/category-stats/chart/:shape/:weight/:clarity/:color', AnalyticsController.getChartData);

// Debug routes for certificate analysis (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/certificates', DebugController.analyzeCertificates);
  app.get('/debug/compare', DebugController.compareCertificates);
  app.get('/debug/export-sold', DebugController.exportSoldCertificates);
} else {
  // In production, return 404 for debug endpoints
  app.get('/debug/*', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Initialize Service Coordinator
    const redisUrl = process.env.REDIS_URL_FILE 
      ? require('fs').readFileSync(process.env.REDIS_URL_FILE, 'utf8').trim()
      : process.env.REDIS_URL;
    
    const coordinator = getServiceCoordinator(logger);
    await coordinator.initialize(redisUrl);
    
    if (coordinator.isEnabled()) {
      logger.info('✅ Service Coordinator enabled - will wait for Market Price Calculator');
    } else {
      logger.info('ℹ️  Service Coordinator disabled - set SERVICE_COORDINATOR_ENABLED=true to enable');
    }

    // Send startup notification
    await sendAnalyticsStartNotification('Analytics Service');
    
    // Create optimized indexes for analytics
    await DatabaseIndexes.createAnalyticsIndexes();
    
    // Analyze existing indexes
    await DatabaseIndexes.analyzeIndexUsage();
    
    // Start analytics scheduler
    const scheduler = AnalyticsScheduler.getInstance();
    scheduler.start();
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Analytics Service (REFACTORED) started on port ${PORT}`);
      logger.info(`📊 Available endpoints:`);
      logger.info(`   GET /health - Health check`);
      logger.info(`   GET /analytics/:period - Get analytics (day/week/month)`);
      logger.info(`   POST /analytics/recalculate - Recalculate all analytics`);
      logger.info(`   GET /category-stats - Get category statistics`);
      logger.info(`   GET /category-stats/chart/:shape/:weight/:clarity/:color - Optimized chart data`);
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`   GET /debug/certificates - Analyze certificates for debugging (DEV ONLY)`);
        logger.info(`   GET /debug/compare - Compare certificates between dates (DEV ONLY)`);
        logger.info(`   GET /debug/export-sold - Export sold certificates (JSON/CSV) (DEV ONLY)`);
      }
      logger.info(`📅 Analytics scheduler started - daily generation at 00:00 UTC`);
      logger.info(`🔧 OPTIMIZATIONS ENABLED:`);
      logger.info(`   ✅ MongoDB Aggregation Pipeline`);
      logger.info(`   ✅ Optimized Database Indexes`);
      logger.info(`   ✅ Memory Usage Monitoring`);
      logger.info(`   ✅ Simplified Architecture`);
    });
    
    // Register cleanup for graceful shutdown
    registerCleanup(async () => {
      logger.info('🛑 Stopping analytics scheduler...');
      const scheduler = AnalyticsScheduler.getInstance();
      scheduler.stop();
    }, 'Analytics Scheduler');
    
    registerCleanup(async () => {
      logger.info('🔄 Closing Service Coordinator...');
      await coordinator.close();
      logger.info('✅ Service Coordinator closed');
    }, 'Service Coordinator');
    
    registerCleanup(async () => {
      logger.info('🗄️ Disconnecting from database...');
      await disconnectDatabase();
    }, 'MongoDB Connection');
    
    // Initialize graceful shutdown
    initGracefulShutdown();
    logger.info('✅ Graceful shutdown initialized');
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
