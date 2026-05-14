import axios, { isAxiosError } from 'axios'
import dotenv from 'dotenv';
import fs from 'fs';
import { logger } from '../utils/logger';
import { getErrorMessage, isAxiosError as customIsAxiosError } from '../utils/errorHelpers';

dotenv.config();

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[externalDataService] Failed to read ${envVar}_FILE:`, { error: e });
        }
    }
    return process.env[envVar];
};

// Oil Price API configuration
const OIL_PRICE_API_KEY = getSecretFromFile('OIL_PRICE_API') || '';
const OIL_PRICE_API_BASE_URL = 'https://api.oilpriceapi.com/v1';

// Frankfurter API configuration
const FRANKFURTER_API_BASE_URL = 'https://api.frankfurter.dev/v1';

// Gold Price API configuration
const GOLD_PRICE_API_BASE_URL = 'https://api.gold-api.com';

// Type definitions for Oil Price API response
interface OilPriceResponse {
  status: string;
  data: {
    price: string;
    timestamp: string;
    currency: string;
    unit: string;
  };
}

// Type definitions for Frankfurter API response
interface FrankfurterResponse {
  base: string;
  date: string;
  rates: {
    [currency: string]: number;
  };
}

// Type definitions for Gold Price API response
interface GoldPriceResponse {
  price: number;
  timestamp: string;
  currency: string;
}

const oilPriceApiClient = axios.create({
  baseURL: OIL_PRICE_API_BASE_URL,
  headers: {
    'Authorization': `Token ${OIL_PRICE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

const frankfurterApiClient = axios.create({
  baseURL: FRANKFURTER_API_BASE_URL,
});

const goldPriceApiClient = axios.create({
  baseURL: GOLD_PRICE_API_BASE_URL,
});

export interface EconomicIndicators {
  goldPrice?: number;
  oilPrice?: number;
  inrUsdRate?: number;
}


const toErrorPayload = (err: unknown): unknown => {
  if (isAxiosError(err)) return err.response?.data || err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return (err as { message: unknown }).message;
  }
  return String(err);
};

/**
 * Fetches the latest oil price from Oil Price API
 * @returns The latest oil price or undefined if the request fails
 */
const getOilPrice = async (): Promise<number | undefined> => {
  if (!OIL_PRICE_API_KEY) {
    logger.warn('[externalDataService] OIL_PRICE_API_KEY is missing. Skipping oil price fetch.');
    return undefined;
  }

  try {
    const response = await oilPriceApiClient.get<OilPriceResponse>('/prices/latest', {
      params: {
        by_code: 'WTI_USD' // Using WTI as the benchmark
      }
    });

    const data = response.data;
    if (data?.data?.price) {
      return parseFloat(data.data.price);
    } else {
      logger.warn('[externalDataService] Could not parse oil price from response', { data });
    }
  } catch (error: unknown) {
    if (customIsAxiosError(error)) {
      logger.error('[externalDataService] Axios error fetching oil price', { error: error.response?.data || error.message });
    } else {
      logger.error('[externalDataService] Error fetching oil price', { error: toErrorPayload(error) });
    }
  }
  return undefined;
};

/**
 * Fetches the latest INR/USD exchange rate from Frankfurter API
 * @returns The latest INR/USD rate or undefined if the request fails
 */
const getInrUsdRate = async (): Promise<number | undefined> => {
  try {
    const response = await frankfurterApiClient.get<FrankfurterResponse>('/latest', {
      params: {
        base: 'USD',
        symbols: 'INR'
      }
    });

    const data = response.data;
    if (data?.rates?.INR) {
      return parseFloat(data.rates.INR.toFixed(4));
    } else {
      logger.warn('[externalDataService] Could not parse INR/USD rate from response', { data });
    }
  } catch (error: unknown) {
    if (customIsAxiosError(error)) {
      logger.error('[externalDataService] Axios error fetching INR/USD rate', { error: error.response?.data || error.message });
    } else {
      logger.error('[externalDataService] Error fetching INR/USD rate', { error: toErrorPayload(error) });
    }
  }
  return undefined;
};

/**
 * Fetches the latest gold price from Gold Price API
 * @returns The latest gold price or undefined if the request fails
 */
const getGoldPrice = async (): Promise<number | undefined> => {
  try {
    const response = await goldPriceApiClient.get<GoldPriceResponse>('/price/XAU');
    
    const data = response.data;
    if (data?.price) {
      return parseFloat(data.price.toFixed(2));
    } else {
      logger.warn('[externalDataService] Could not parse gold price from response', { data });
    }
  } catch (error: unknown) {
    if (customIsAxiosError(error)) {
      logger.error('[externalDataService] Axios error fetching gold price', { error: error.response?.data || error.message });
    } else {
      logger.error('[externalDataService] Error fetching gold price', { error: toErrorPayload(error) });
    }
  }
  return undefined;
};

/**
 * Fetches the latest economic indicators using multiple APIs.
 * Returns undefined for any indicator that fails to fetch.
 */
export const fetchEconomicIndicators = async (): Promise<EconomicIndicators> => {
  const indicators: EconomicIndicators = {};

  // Fetch oil price from Oil Price API
  indicators.oilPrice = await getOilPrice();

  // Fetch INR/USD rate from Frankfurter API
  indicators.inrUsdRate = await getInrUsdRate();

  // Fetch gold price from Gold Price API
  indicators.goldPrice = await getGoldPrice();
  
  logger.info('[externalDataService] Fetched indicators', { indicators });
  return indicators;
}; 