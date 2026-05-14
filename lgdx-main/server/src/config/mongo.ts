/**
 * Lightweight MongoDB connector for standalone workers (Baileys, Cloud WhatsApp, Telegram user).
 *
 * Workers historically did not connect to Mongo, but they import code paths
 * (e.g. `getWhatsAppMarketingPromptResolved` → `BotPromptSnapshot.findOne`) that hit Mongo.
 * Without an active connection, Mongoose buffers queries until `bufferTimeoutMS` (default 10s)
 * and throws — which crashes the inbound message pipeline before the user message is even
 * stored in the admin chat history.
 *
 * Behavior:
 * - If `MONGODB_URI_FILE` or `MONGODB_URI` is configured, connect with `bufferCommands: false`
 *   so failures are fast (<3s) instead of 10s buffer waits.
 * - If neither is set, log once and skip — calling code MUST still be resilient (try/catch
 *   with disk fallback) so a missing connection cannot break message ingestion.
 */
import fs from 'fs';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

let connectPromise: Promise<typeof mongoose> | null = null;

function getMongoUri(): string | null {
  const filePath = process.env.MONGODB_URI_FILE;
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error('[WorkerMongo] Failed to read MONGODB_URI_FILE', {
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) {
    return process.env.MONGODB_URI.trim();
  }
  return null;
}

/**
 * Connect Mongoose for a worker process. Idempotent.
 * Resolves whether or not the connection ultimately succeeds — connection errors are logged
 * and surfaced via Mongoose's own retry/event handlers; callers must not depend on Mongo
 * being reachable for the inbound pipeline to keep working.
 */
export async function connectWorkerMongo(tag: string): Promise<void> {
  if (connectPromise) {
    await connectPromise.catch(() => undefined);
    return;
  }

  const uri = getMongoUri();
  if (!uri) {
    logger.warn(`[${tag}] MongoDB URI not configured; DB-backed features will fall back to disk/defaults`);
    return;
  }

  mongoose.set('strictQuery', false);
  mongoose.set('strictPopulate', false);
  // Fail fast instead of buffering queries for 10s when the server is unreachable.
  // Worker code paths must already have try/catch + filesystem/default fallbacks.
  mongoose.set('bufferCommands', false);

  connectPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 3000,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 10000,
    maxPoolSize: 5,
    minPoolSize: 1,
    heartbeatFrequencyMS: 5000,
    retryWrites: true,
    retryReads: true
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`[${tag}] MongoDB connection error`, {
      error: err instanceof Error ? err.message : String(err)
    });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn(`[${tag}] MongoDB disconnected`);
  });
  mongoose.connection.on('reconnected', () => {
    logger.info(`[${tag}] MongoDB reconnected`);
  });

  try {
    await connectPromise;
    logger.info(`[${tag}] MongoDB connected`, { host: mongoose.connection.host });
  } catch (err) {
    logger.error(`[${tag}] MongoDB initial connect failed; continuing with fallbacks`, {
      error: err instanceof Error ? err.message : String(err)
    });
    // Reset so a future call can retry.
    connectPromise = null;
  }
}
