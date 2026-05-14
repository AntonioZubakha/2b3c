import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import fs from 'fs';

// Read MongoDB URI from environment variable or secret file
const getMongoUri = (): string => {
  // Try environment variable first
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }
  
  // Try secret file
  if (process.env.MONGODB_URI_FILE) {
    try {
      return fs.readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
    } catch (error) {
      logger.warn('Failed to read MongoDB URI from secret file:', error);
    }
  }
  
  // Fallback to default
  return 'mongodb://localhost:27017/lgdx';
};

const MONGODB_URI = getMongoUri();

const parseMsEnv = (key: string, fallbackMs: number): number => {
  const raw = process.env[key];
  if (!raw) return fallbackMs;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
};

/**
 * Connect to MongoDB
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    if (!MONGODB_URI) {
      throw new Error('MongoDB URI is not configured');
    }

    // Increase timeouts for long-running analytics aggregations.
    // Defaults tuned for scheduled analytics jobs (3 minutes socket timeout).
    const serverSelectionTimeoutMS = parseMsEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 10000);
    const connectTimeoutMS = parseMsEnv('MONGODB_CONNECT_TIMEOUT_MS', 10000);
    const socketTimeoutMS = parseMsEnv('MONGODB_SOCKET_TIMEOUT_MS', 180000);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS,
      socketTimeoutMS,
      connectTimeoutMS,
      maxPoolSize: 10,
      minPoolSize: 1
    });

    logger.info('✅ Connected to MongoDB successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('✅ Disconnected from MongoDB');
  } catch (error) {
    logger.error('❌ Error disconnecting from MongoDB:', error);
    throw error;
  }
};

/**
 * Get database connection status
 */
export const getDatabaseStatus = (): {
  isConnected: boolean;
  readyState: number;
  host: string;
  port: number;
  name: string;
} => {
  const connection = mongoose.connection;
  
  return {
    isConnected: connection.readyState === 1,
    readyState: connection.readyState,
    host: connection.host || 'unknown',
    port: connection.port || 0,
    name: connection.name || 'unknown'
  };
};