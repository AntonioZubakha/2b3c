import fs from 'fs';
import { IConfig } from './types';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      // Swallow error; logger not initialized here
    }
  }
  return process.env[envVar];
};

export const config: IConfig = {
  // MongoDB connection
  mongoUri: getSecretFromFile('MONGODB_URI') || process.env['MONGODB_URI'] || 'mongodb://localhost:27017/lgdx',
  
  // Economic indicators API keys
  oilPriceApiKey: getSecretFromFile('OIL_PRICE_API') || process.env['OIL_PRICE_API'] || '',
  
  // Coefficients for market price adjustment (optimized for Lab-Grown Diamonds)
  // See: info/27_Economic_Coefficients_Analysis.md for detailed analysis
  coeffInr: parseFloat(process.env['COEFF_INR'] || '0.40'),    // ↑ was 0.1 - Primary cost driver (80% of production costs in INR)
  coeffGold: parseFloat(process.env['COEFF_GOLD'] || '0.06'),  // ↓ was 0.1 - Weak psychological correlation only
  coeffOil: parseFloat(process.env['COEFF_OIL'] || '0.07'),    // ↓ was 0.1 - Logistics impact only (~2-5% of final price)
  
  // Logging
  logLevel: process.env['LOG_LEVEL'] || 'info',
  
  // Service settings
  calculationInterval: process.env['CALCULATION_INTERVAL'] || '0 */3 * * *', // Every 3 hours
  maxProcessingTime: parseInt(process.env['MAX_PROCESSING_TIME'] || '1800000'), // 30 minutes
  
  // Database settings
  dbConnectionTimeout: parseInt(process.env['DB_CONNECTION_TIMEOUT'] || '30000'), // 30 seconds
  dbSocketTimeout: parseInt(process.env['DB_SOCKET_TIMEOUT'] || '45000'), // 45 seconds

  // Market price cache publisher
  marketPriceCacheRedisUrl:
    getSecretFromFile('MARKET_PRICE_CACHE_REDIS_URL') ||
    getSecretFromFile('REDIS_URL') ||
    process.env['MARKET_PRICE_CACHE_REDIS_URL'] ||
    process.env['REDIS_URL'],
  marketPriceCacheTtlSeconds: parseInt(process.env['MARKET_PRICE_CACHE_TTL_SECONDS'] || `${24 * 60 * 60}`),
}; 