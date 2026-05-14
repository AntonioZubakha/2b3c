import mongoose from 'mongoose';
import { logger } from './logger';
import { config } from './config';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000
    });
    logger.info('[DB] Connected to MongoDB');
  } catch (err) {
    logger.error({ err }, '[DB] Failed to connect to MongoDB');
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('[DB] Disconnected from MongoDB');
}
