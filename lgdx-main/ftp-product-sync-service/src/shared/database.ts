/**
 * Подключение к MongoDB для FTP сервиса
 */

import mongoose from 'mongoose';
import { logger } from './logger';
import { config } from './config';

let isConnected = false;

export async function connectToDatabase(): Promise<void> {
  if (isConnected) {
    logger.info('[Database] Already connected to MongoDB');
    return;
  }

  try {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      // bufferMaxEntries удален так как не поддерживается в новых версиях
    };

    await mongoose.connect(config.mongoUri, options);
    
    isConnected = true;
    logger.info('[Database] ✅ Connected to MongoDB successfully');

    // Обработка событий подключения
    mongoose.connection.on('error', (error) => {
      logger.error('[Database] ❌ MongoDB connection error:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('[Database] ⚠️ MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('[Database] ✅ MongoDB reconnected');
      isConnected = true;
    });

  } catch (error) {
    logger.error('[Database] ❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('[Database] ✅ Disconnected from MongoDB');
  } catch (error) {
    logger.error('[Database] ❌ Error disconnecting from MongoDB:', error);
    throw error;
  }
}

export function isMongoConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}