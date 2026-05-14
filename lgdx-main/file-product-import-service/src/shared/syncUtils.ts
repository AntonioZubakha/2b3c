import mongoose from 'mongoose';
import Product from '../models/Product';
import * as productUtils from './productUtils';
import { logger } from './logger';
import {
  ensureFreshMarketPriceCache,
  getSharedMarketPriceCache,
} from './marketPriceCacheClient';

/**
 * Get market price cache for product processing
 */
export async function getMarketPriceCache(): Promise<Map<string, number>> {
  if (process.env.DISABLE_MARKET_PRICE_CACHE === 'true') {
    logger.warn('[MarketPriceCache] Disabled via DISABLE_MARKET_PRICE_CACHE=true');
    return new Map();
  }
  await ensureFreshMarketPriceCache();
  return new Map(getSharedMarketPriceCache());
}
