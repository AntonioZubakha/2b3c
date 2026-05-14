#!/usr/bin/env node

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { calculateAndSaveCategoryStats } from '../calculator';
import { config } from '../config';
import { logger } from '../shared/logger';
import { ProductCategoryStats } from '../db/models';

// Load environment variables
dotenv.config();

// Simple logger mapping
const log = (message: string) => logger.info(message);

// Connect to MongoDB
const connectToDatabase = async (): Promise<void> => {
  try {
    const mongoUri = config.mongoUri;
    if (!mongoUri) {
      throw new Error('MongoDB URI is not configured');
    }

    log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: config.dbConnectionTimeout,
      socketTimeoutMS: config.dbSocketTimeout,
      connectTimeoutMS: config.dbConnectionTimeout,
      maxPoolSize: 10,
      minPoolSize: 1
    });
    log('✅ Connected to MongoDB successfully');
  } catch (error) {
    log('❌ Failed to connect to MongoDB:');
    logger.error((error as Error)?.message);
    process.exit(1);
  }
};

// Main execution function
const main = async (): Promise<void> => {
  log('🚀 Starting Market Price Calculation Script...');
  
  try {
    // Connect to database
    await connectToDatabase();
    
    // Run calculation
    log('📊 Starting market price calculation...');
    await calculateAndSaveCategoryStats(ProductCategoryStats);
    
    log('✅ Market price calculation completed successfully!');
    
  } catch (error) {
    log('❌ Error during calculation:');
    logger.error((error as Error)?.message);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Handle process signals
process.on('SIGTERM', () => {
  log('🛑 Received SIGTERM. Shutting down gracefully...');
  mongoose.connection.close().then(() => {
    log('✅ Graceful shutdown completed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('🛑 Received SIGINT. Shutting down gracefully...');
  mongoose.connection.close().then(() => {
    log('✅ Graceful shutdown completed');
    process.exit(0);
  });
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    log('💥 Fatal error:');
    logger.error((error as Error)?.message);
    process.exit(1);
  });
} 