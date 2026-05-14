import mongoose from 'mongoose';
import axios, { isAxiosError } from 'axios';
import winston from 'winston';
import { config } from './config';
import {
  IProduct,
  IEconomicIndicators,
  ShapeCategory,
  WeightCategory,
  ClarityCategory,
  ColorCategoryEnum
} from './types';
import { EnhancedGiaCoefficientCalculator } from './giaCoefficientCalculator.enhanced';
import { UsaLocationCoefficientCalculator } from './usaLocationCoefficientCalculator';
import { publishMarketPriceSnapshot, SnapshotInput } from './cache/marketPriceCachePublisher';

// Configure logger
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'market-price-calculator' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Product Schema (simplified for this service)
const productSchema = new mongoose.Schema<IProduct>({
  _id: mongoose.Schema.Types.ObjectId,
  shape: String,
  carat: Number,
  clarity: String,
  color: String,
  pricePerCarat: Number,
  marketPrice: Number,
  marketPricePerCarat: Number,  // ✅ Добавляю marketPricePerCarat
  certificateNumber: String,
  certificateInstitute: String,  // ✅ Добавляю поле certificateInstitute
  status: String,
  onDeal: Boolean,
  company: mongoose.Schema.Types.ObjectId,  // ✅ Добавляю поле company
  location: String  // Country (e.g. USA, India) for USA location coefficient
}, { collection: 'products' });

const Product = mongoose.model<IProduct>('Product', productSchema);

// Company Schema (simplified for this service)
const companySchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  name: String
}, { collection: 'companies' });

const _Company = mongoose.model('Company', companySchema); // Used in analyzeDataQualityIssues function


// Helper functions
const determineShapeCategory = (shape: string): ShapeCategory => {
  const normalizedShape = shape.toUpperCase().trim();
  
  // Конкретные шейпы
  if (normalizedShape === 'ROUND') {
    return ShapeCategory.ROUND;
  }
  
  if (normalizedShape === 'OVAL') {
    return ShapeCategory.OVAL;
  }
  
  if (normalizedShape === 'PEAR') {
    return ShapeCategory.PEAR;
  }
  
  if (normalizedShape === 'CUSHION') {
    return ShapeCategory.CUSHION;
  }
  
  if (normalizedShape === 'EMERALD') {
    return ShapeCategory.EMERALD;
  }
  
  if (normalizedShape === 'RADIANT') {
    return ShapeCategory.RADIANT;
  }
  
  if (normalizedShape === 'PRINCESS') {
    return ShapeCategory.PRINCESS;
  }
  
  if (normalizedShape === 'MARQUISE') {
    return ShapeCategory.MARQUISE;
  }
  
  if (normalizedShape === 'HEART') {
    return ShapeCategory.HEART;
  }
  
  if (normalizedShape === 'ASSCHER') {
    return ShapeCategory.ASSCHER;
  }
  
  // All other shapes (Other, Baguette, Trillion, and any unmapped name) go to FANCY.
  return ShapeCategory.FANCY;
};

const determineWeightCategory = (carat: number): WeightCategory => {
  if (isNaN(carat) || carat === null || carat === undefined || carat < 0) {
    return WeightCategory.W_0_00_0_29;
  }
  
  if (carat >= 0.0 && carat < 0.3) return WeightCategory.W_0_00_0_29;
  if (carat >= 0.3 && carat < 0.6) return WeightCategory.W_0_30_0_59;
  if (carat >= 0.6 && carat < 1.0) return WeightCategory.W_0_60_0_99;
  if (carat >= 1.0 && carat < 1.4) return WeightCategory.W_1_00_1_39;
  if (carat >= 1.4 && carat < 1.8) return WeightCategory.W_1_40_1_79;
  if (carat >= 1.8 && carat < 2.2) return WeightCategory.W_1_80_2_19;
  if (carat >= 2.2 && carat < 2.6) return WeightCategory.W_2_20_2_59;
  if (carat >= 2.6 && carat < 3.0) return WeightCategory.W_2_60_2_99;
  if (carat >= 3.0 && carat < 3.5) return WeightCategory.W_3_00_3_49;
  if (carat >= 3.5 && carat < 4.0) return WeightCategory.W_3_50_3_99;
  if (carat >= 4.0 && carat < 5.0) return WeightCategory.W_4_00_4_99;
  if (carat >= 5.0 && carat < 6.0) return WeightCategory.W_5_00_5_99;
  if (carat >= 6.0 && carat < 7.0) return WeightCategory.W_6_00_6_99;
  if (carat >= 7.0 && carat < 8.0) return WeightCategory.W_7_00_7_99;
  if (carat >= 8.0 && carat < 9.0) return WeightCategory.W_8_00_8_99;
  if (carat >= 9.0 && carat < 10.0) return WeightCategory.W_9_00_9_99;
  if (carat >= 10.0 && carat < 12.0) return WeightCategory.W_10_00_11_99;
  if (carat >= 12.0 && carat < 15.0) return WeightCategory.W_12_00_14_99;
  if (carat >= 15.0 && carat < 25.0) return WeightCategory.W_15_00_24_99;
  if (carat >= 25.0 && carat <= 50.0) return WeightCategory.W_25_00_50_00;
  if (carat > 50.0 && carat <= 100.0) return WeightCategory.W_50_01_100_00;
  if (carat > 100.0) return WeightCategory.W_100_01_PLUS;
  
  return WeightCategory.W_0_00_0_29;
};

const determineClarityCategory = (clarity: string): ClarityCategory => {
  const normalizedClarity = clarity.toUpperCase().trim();
  
  switch (normalizedClarity) {
    case 'FL': return ClarityCategory.FL;
    case 'IF': return ClarityCategory.IF;
    case 'VVS1': return ClarityCategory.VVS1;
    case 'VVS2': return ClarityCategory.VVS2;
    case 'VS1': return ClarityCategory.VS1;
    case 'VS2': return ClarityCategory.VS2;
    default:
      if (normalizedClarity.includes('VVS')) {
        return normalizedClarity.includes('1') ? ClarityCategory.VVS1 : ClarityCategory.VVS2;
      } else if (normalizedClarity.includes('VS')) {
        return normalizedClarity.includes('1') ? ClarityCategory.VS1 : ClarityCategory.VS2;
      } else if (normalizedClarity.includes('FL')) {
        return ClarityCategory.FL;
      } else if (normalizedClarity.includes('IF')) {
        return ClarityCategory.IF;
      }
      return ClarityCategory.VS2;
  }
};

/**
 * Maps product color to a category used for market price calculation.
 * Only D, E, F, G are supported. Products with color H, I, J, K, or fancy colors
 * return null (they are handled separately: fancy get market price = supplier price).
 */
const determineColorCategory = (color?: string | null): ColorCategoryEnum | null => {
  if (!color) return null;
  const normalizedColor = color.trim().toUpperCase();
  if (Object.values(ColorCategoryEnum).includes(normalizedColor as ColorCategoryEnum)) {
    return normalizedColor as ColorCategoryEnum;
  }
  return null;
};

/** White grades used for category-based market price. Fancy (colored) are D–G only. */
const generateAllCategoryCombinations = () => {
  const combinations = [];
  
  for (const shape of Object.values(ShapeCategory)) {
    for (const weight of Object.values(WeightCategory)) {
      for (const clarity of Object.values(ClarityCategory)) {
        for (const color of Object.values(ColorCategoryEnum)) {
          combinations.push({ shape, weight, clarity, color });
        }
      }
    }
  }
  
  return combinations;
};

// Monitor market price quality
const monitorMarketPriceQuality = (category: string, marketPrice: number, avgPrice: number, count: number): void => {
  if (count === 0) return;
  
  const priceRatio = marketPrice / avgPrice;
  const deviation = Math.abs(priceRatio - 1) * 100; // Percentage deviation
  
  // Log warnings for significant deviations
  if (deviation > 50) {
    logger.warn(`[quality] High deviation detected for ${category}: marketPrice=${marketPrice}, avgPrice=${avgPrice}, deviation=${deviation.toFixed(1)}%`);
  } else if (deviation > 25) {
    logger.info(`[quality] Moderate deviation for ${category}: marketPrice=${marketPrice}, avgPrice=${avgPrice}, deviation=${deviation.toFixed(1)}%`);
  }
  
  // Log suspiciously low market prices
  if (priceRatio < 0.3) {
    logger.warn(`[quality] Suspiciously low market price for ${category}: ratio=${priceRatio.toFixed(3)}`);
  }
  
  // Log suspiciously high market prices
  if (priceRatio > 3.0) {
    logger.warn(`[quality] Suspiciously high market price for ${category}: ratio=${priceRatio.toFixed(3)}`);
  }
};

// Validate economic indicators
const validateEconomicIndicators = (indicators: IEconomicIndicators): IEconomicIndicators => {
  const validated: IEconomicIndicators = {};
  
  if (indicators.goldPrice !== undefined) {
    if (indicators.goldPrice >= 1000 && indicators.goldPrice <= 6000) {
      validated.goldPrice = indicators.goldPrice;
      if (indicators.goldPrice > 5500) logger.warn(`[validation] Gold price unusually high ($${indicators.goldPrice}), accepting`);
    } else {
      logger.warn(`[validation] Gold price out of range (${indicators.goldPrice}), skipping`);
    }
  }
  if (indicators.oilPrice !== undefined) {
    if (indicators.oilPrice >= 20 && indicators.oilPrice <= 200) {
      validated.oilPrice = indicators.oilPrice;
    } else {
      logger.warn(`[validation] Oil price out of range (${indicators.oilPrice}), skipping`);
    }
  }
  if (indicators.inrUsdRate !== undefined) {
    if (indicators.inrUsdRate >= 40 && indicators.inrUsdRate <= 200) {
      validated.inrUsdRate = indicators.inrUsdRate;
    } else {
      logger.warn(`[validation] INR/USD rate out of range (${indicators.inrUsdRate}), skipping`);
    }
  }
  
  return validated;
};

// Cache for oil price (in-memory, will be replaced with Redis)
let cachedOilPrice: { price: number; timestamp: number } | null = null;
const OIL_PRICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Fetch oil price with multiple fallback sources
const fetchOilPriceWithFallbacks = async (): Promise<number | null> => {
  // Check cache first
  if (cachedOilPrice && (Date.now() - cachedOilPrice.timestamp) < OIL_PRICE_CACHE_TTL) {
    logger.info(`[OilPrice] Using cached price: $${cachedOilPrice.price} (cached ${Math.round((Date.now() - cachedOilPrice.timestamp) / 1000 / 60)} minutes ago)`);
    return cachedOilPrice.price;
  }

  const maxRetries = 2;
  const baseDelay = 1000;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithRetry = async <T = unknown>(url: string, options: Record<string, unknown>, apiName: string): Promise<T | null> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<T>(url, { ...options, timeout: 10000 });
        return response.data;
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isAxiosError(error)) {
          const status = error.response?.status;
          // Skip retry for 429 (rate limit) or 401 (auth) errors
          if (status === 429 || status === 401) {
            logger.warn(`[${apiName}] Rate limit or auth error (${status}), skipping`);
            return null;
          }
        }

        if (isLastAttempt) {
          return null;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
    return null;
  };

  // Try primary API (oilpriceapi.com)
  if (config.oilPriceApiKey) {
    try {
      const oilResponse = await fetchWithRetry<{ data: { price: string } }>(
        'https://api.oilpriceapi.com/v1/prices/latest',
        {
          headers: { 'Authorization': `Token ${config.oilPriceApiKey}` },
          params: { by_code: 'WTI_USD' }
        },
        'OilPriceAPI'
      );
      
      if (oilResponse && typeof oilResponse === 'object' && 'data' in oilResponse && oilResponse.data) {
        const oilData = oilResponse.data as { price: string };
        if (oilData.price) {
          const price = parseFloat(oilData.price);
          if (!isNaN(price) && price > 0) {
            cachedOilPrice = { price, timestamp: Date.now() };
            logger.info(`[OilPriceAPI] Successfully fetched oil price: $${price}`);
            return price;
          }
        }
      }
    } catch (error) {
      logger.warn('[OilPriceAPI] Failed to fetch oil price from primary API');
    }
  }

  // Fallback 1: Free public API - Yahoo Finance alternative (no key required)
  try {
    const response = await fetchWithRetry<any>(
      'https://query1.finance.yahoo.com/v8/finance/chart/CL=F',
      {
        params: {
          interval: '1d',
          range: '1d'
        }
      },
      'YahooFinance'
    );
    
    if (response) {
      // Yahoo Finance returns: { chart: { result: [{ meta: { regularMarketPrice: number }, indicators: {...} }] } }
      let price: number | null = null;
      
      if (response.chart?.result?.[0]?.meta?.regularMarketPrice) {
        price = response.chart.result[0].meta.regularMarketPrice;
      } else if (response.quoteResponse?.result?.[0]?.regularMarketPrice) {
        price = response.quoteResponse.result[0].regularMarketPrice;
      } else if (response.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0]) {
        // Try to get from indicators
        const closePrices = response.chart.result[0].indicators.quote[0].close;
        price = closePrices[closePrices.length - 1]; // Get last price
      }
      
      if (price !== null && !isNaN(price) && price > 0) {
        cachedOilPrice = { price, timestamp: Date.now() };
        logger.info(`[YahooFinance] Successfully fetched oil price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail, will try next fallback
  }

  // Fallback 2: Alternative API - Commodities API (free tier)
  try {
    const response = await fetchWithRetry<any>(
      'https://api.commodities-api.com/v1/latest',
      {
        params: {
          base: 'USD',
          symbols: 'CRUDE_OIL'
        }
      },
      'CommoditiesAPI'
    );
    
    if (response && response.data && response.data.CRUDE_OIL) {
      const price = parseFloat(response.data.CRUDE_OIL);
      if (!isNaN(price) && price > 0) {
        cachedOilPrice = { price, timestamp: Date.now() };
        logger.info(`[CommoditiesAPI] Successfully fetched oil price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail, will try next fallback
  }

  // Fallback 3: Simple public API - Oil prices from EIA (Energy Information Administration)
  try {
    const response = await fetchWithRetry<any>(
      'https://api.eia.gov/v2/petroleum/pri/spt/data/',
      {
        params: {
          api_key: process.env['EIA_API_KEY'] || 'demo',
          frequency: 'daily',
          data: ['0'],
          facets: { series: ['WTI'] },
          sort: [{ column: 'period', direction: 'desc' }],
          length: 1
        }
      },
      'EIA'
    );
    
    if (response && response.response?.data?.[0]?.[0]) {
      const price = parseFloat(response.response.data[0][0]);
      if (!isNaN(price) && price > 0) {
        cachedOilPrice = { price, timestamp: Date.now() };
        logger.info(`[EIA] Successfully fetched oil price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail
  }

  logger.warn('[OilPrice] All API sources failed, will try to use cached or database value');
  return null;
};

// Cache for gold price (valid for 1 hour)
let cachedGoldPrice: { price: number; timestamp: number } | null = null;
const GOLD_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Fetch gold price from multiple sources with fallback
const fetchGoldPriceWithFallbacks = async (): Promise<number | null> => {
  // Check cache first
  if (cachedGoldPrice && (Date.now() - cachedGoldPrice.timestamp) < GOLD_CACHE_DURATION) {
    logger.info(`[GoldPrice] Using cached value: $${cachedGoldPrice.price}`);
    return cachedGoldPrice.price;
  }

  const fetchWithRetry = async <T = unknown>(url: string, options: Record<string, unknown>, apiName: string): Promise<T | null> => {
    const maxRetries = 3;
    const baseDelay = 1000;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<T>(url, { ...options, timeout: 10000 });
        return response.data;
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isAxiosError(error)) {
          const status = error.response?.status;
          // Skip retry for 429 (rate limit) or 401 (auth) errors
          if (status === 429 || status === 401) {
            logger.warn(`[${apiName}] Rate limit or auth error (${status}), skipping`);
            return null;
          }
        }

        if (isLastAttempt) {
          logger.warn(`[${apiName}] All ${maxRetries} attempts failed`);
          return null;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
    return null;
  };

  // Fallback 1: Yahoo Finance for Gold (GC=F - Gold Futures)
  try {
    const response = await fetchWithRetry<any>(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F',
      {
        params: {
          interval: '1d',
          range: '1d'
        }
      },
      'YahooFinance-Gold'
    );
    
    if (response) {
      let price: number | null = null;
      
      if (response.chart?.result?.[0]?.meta?.regularMarketPrice) {
        price = response.chart.result[0].meta.regularMarketPrice;
      } else if (response.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0]) {
        const closePrices = response.chart.result[0].indicators.quote[0].close;
        price = closePrices[closePrices.length - 1];
      }
      
      if (price !== null && !isNaN(price) && price > 0) {
        cachedGoldPrice = { price, timestamp: Date.now() };
        logger.info(`[YahooFinance-Gold] Successfully fetched gold price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail, will try next fallback
  }

  // Fallback 2: Metals.dev API (free, no key required)
  try {
    const response = await fetchWithRetry<any>(
      'https://api.metals.dev/v1/latest',
      {
        params: {
          api_key: 'DEMO',
          currency: 'USD',
          unit: 'toz' // troy ounce
        }
      },
      'MetalsDev'
    );
    
    if (response && response.metals && response.metals.gold) {
      const price = parseFloat(response.metals.gold);
      if (!isNaN(price) && price > 0) {
        cachedGoldPrice = { price, timestamp: Date.now() };
        logger.info(`[MetalsDev] Successfully fetched gold price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail, will try next fallback
  }

  // Fallback 3: GoldAPI.io (original, still try in case it's back)
  try {
    const response = await fetchWithRetry<{ price: number }>(
      'https://api.gold-api.com/price/XAU',
      { timeout: 10000 },
      'GoldAPI'
    );
    
    if (response && typeof response === 'object' && 'price' in response && response.price) {
      const price = parseFloat(response.price.toFixed(2));
      if (!isNaN(price) && price > 0) {
        cachedGoldPrice = { price, timestamp: Date.now() };
        logger.info(`[GoldAPI] Successfully fetched gold price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail
  }

  // Fallback 4: Frankfurter with XAU (if supported)
  try {
    const response = await fetchWithRetry<any>(
      'https://api.frankfurter.dev/v1/latest',
      {
        params: { base: 'USD', symbols: 'XAU' }
      },
      'Frankfurter-Gold'
    );
    
    if (response && response.rates && response.rates.XAU) {
      // Frankfurter returns XAU per USD, need to invert
      const price = 1 / parseFloat(response.rates.XAU);
      if (!isNaN(price) && price > 0) {
        cachedGoldPrice = { price, timestamp: Date.now() };
        logger.info(`[Frankfurter-Gold] Successfully fetched gold price: $${price}`);
        return price;
      }
    }
  } catch (error) {
    // Silently fail
  }

  logger.warn('[GoldPrice] All API sources failed, will try to use cached or database value');
  return null;
};

// Fetch economic indicators with retry logic
const fetchEconomicIndicators = async (): Promise<IEconomicIndicators> => {
  const indicators: IEconomicIndicators = {};

  // Retry configuration
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithRetry = async <T = unknown>(url: string, options: Record<string, unknown>, apiName: string): Promise<T | null> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<T>(url, options);
        return response.data;
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

        if (isLastAttempt) {
          logger.warn(`[${apiName}] All ${maxRetries} attempts failed`);
          return null;
        }

        await sleep(delay);
      }
    }
    return null;
  };

  try {
    // Fetch oil price with multiple fallback sources
    const oilPrice = await fetchOilPriceWithFallbacks();
    if (oilPrice !== null) {
      indicators.oilPrice = oilPrice;
    } else {
      logger.warn('[externalDataService] Failed to fetch oil price from all sources, will use fallback or skip');
    }

    // Fetch INR/USD rate with retry
    const inrResponse = await fetchWithRetry<{ rates: { INR: number } }>(
      'https://api.frankfurter.dev/v1/latest',
      {
        params: { base: 'USD', symbols: 'INR' },
        timeout: 10000
      },
      'FrankfurterAPI'
    );
    
    if (inrResponse && typeof inrResponse === 'object' && 'rates' in inrResponse && inrResponse.rates) {
      const rates = inrResponse.rates as { INR: number };
      if (rates.INR) {
        indicators.inrUsdRate = parseFloat(rates.INR.toFixed(4));
        logger.info(`[FrankfurterAPI] Successfully fetched INR/USD rate: ${indicators.inrUsdRate}`);
      }
    } else {
      logger.warn('[FrankfurterAPI] Failed to fetch INR/USD rate, will use fallback or skip');
    }

    // Fetch gold price with multiple fallback sources
    const goldPrice = await fetchGoldPriceWithFallbacks();
    if (goldPrice !== null) {
      indicators.goldPrice = goldPrice;
    } else {
      logger.warn('[GoldPrice] Failed to fetch gold price from all sources, will use fallback or skip');
    }

    // Log summary of fetched indicators
    const fetchedCount = Object.keys(indicators).filter(key => indicators[key as keyof IEconomicIndicators] !== undefined).length;
    if (fetchedCount === 3) {
      logger.info(`[externalDataService] Successfully fetched all economic indicators: oil=$${indicators.oilPrice}, gold=$${indicators.goldPrice}, inr=${indicators.inrUsdRate}`);
    } else {
      logger.warn(`[externalDataService] Fetched ${fetchedCount}/3 economic indicators`);
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[externalDataService] Unexpected error in fetchEconomicIndicators:', errorMessage);
  }

  return indicators;
};

/** Run-time config for market price calculation (from admin panel or env defaults). */
export interface IMarketPriceRunConfig {
  coeffInr: number;
  coeffGold: number;
  coeffOil: number;
  weightPriceDecreased: number;
  weightPriceIncreased: number;
  weightNewProducts: number;
  weightDisappeared: number;
  weightUnchanged: number;
  medianSmallKeepPct: number;
  medianMediumKeepPct: number;
  medianLargeExpensiveExcludePct: number;
  medianLargeCheapExcludePct: number;
  medianVeryLargeExpensiveExcludePct: number;
  medianVeryLargeCheapExcludePct: number;
}

function defaultRunConfig(): IMarketPriceRunConfig {
  return {
    coeffInr: config.coeffInr,
    coeffGold: config.coeffGold,
    coeffOil: config.coeffOil,
    weightPriceDecreased: 1.05,
    weightPriceIncreased: 1.05,
    weightNewProducts: 1.15,
    weightDisappeared: 1.25,
    weightUnchanged: 0.9,
    medianSmallKeepPct: 0.7,
    medianMediumKeepPct: 0.5,
    medianLargeExpensiveExcludePct: 0.65,
    medianLargeCheapExcludePct: 0.03,
    medianVeryLargeExpensiveExcludePct: 0.75,
    medianVeryLargeCheapExcludePct: 0.05,
  };
}

/** Load market price coefficients from DB (admin panel). Falls back to env/defaults if none saved. */
async function getMarketPriceRunConfig(): Promise<IMarketPriceRunConfig> {
  try {
    const db = mongoose.connection.db;
    if (!db) return defaultRunConfig();
    const col = db.collection('marketpricesettings');
    const doc = await col.findOne({}, { sort: { updatedAt: -1 } });
    if (!doc) return defaultRunConfig();
    const c = defaultRunConfig();
    return {
      coeffInr: typeof doc['coeffInr'] === 'number' ? doc['coeffInr'] : c.coeffInr,
      coeffGold: typeof doc['coeffGold'] === 'number' ? doc['coeffGold'] : c.coeffGold,
      coeffOil: typeof doc['coeffOil'] === 'number' ? doc['coeffOil'] : c.coeffOil,
      weightPriceDecreased: typeof doc['weightPriceDecreased'] === 'number' ? doc['weightPriceDecreased'] : c.weightPriceDecreased,
      weightPriceIncreased: typeof doc['weightPriceIncreased'] === 'number' ? doc['weightPriceIncreased'] : c.weightPriceIncreased,
      weightNewProducts: typeof doc['weightNewProducts'] === 'number' ? doc['weightNewProducts'] : c.weightNewProducts,
      weightDisappeared: typeof doc['weightDisappeared'] === 'number' ? doc['weightDisappeared'] : c.weightDisappeared,
      weightUnchanged: typeof doc['weightUnchanged'] === 'number' ? doc['weightUnchanged'] : c.weightUnchanged,
      medianSmallKeepPct: typeof doc['medianSmallKeepPct'] === 'number' ? doc['medianSmallKeepPct'] : c.medianSmallKeepPct,
      medianMediumKeepPct: typeof doc['medianMediumKeepPct'] === 'number' ? doc['medianMediumKeepPct'] : c.medianMediumKeepPct,
      medianLargeExpensiveExcludePct: typeof doc['medianLargeExpensiveExcludePct'] === 'number' ? doc['medianLargeExpensiveExcludePct'] : c.medianLargeExpensiveExcludePct,
      medianLargeCheapExcludePct: typeof doc['medianLargeCheapExcludePct'] === 'number' ? doc['medianLargeCheapExcludePct'] : c.medianLargeCheapExcludePct,
      medianVeryLargeExpensiveExcludePct: typeof doc['medianVeryLargeExpensiveExcludePct'] === 'number' ? doc['medianVeryLargeExpensiveExcludePct'] : c.medianVeryLargeExpensiveExcludePct,
      medianVeryLargeCheapExcludePct: typeof doc['medianVeryLargeCheapExcludePct'] === 'number' ? doc['medianVeryLargeCheapExcludePct'] : c.medianVeryLargeCheapExcludePct,
    };
  } catch (err) {
    logger.warn('[calculator] Failed to load market price settings from DB, using defaults', { error: err });
    return defaultRunConfig();
  }
}

// Main calculation function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const calculateAndSaveCategoryStats = async (ProductCategoryStatsModel: any): Promise<void> => {
  try {
    logger.info('Starting daily calculation of category statistics...');

    const runConfig = await getMarketPriceRunConfig();
    logger.info('[calculator] Run config loaded (economic + median weights from DB/env)');
    
    const today = new Date(new Date().toISOString().split('T')[0] || '');
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    
    // Fetch and validate economic indicators
    const rawEconomicIndicators = await fetchEconomicIndicators();
    
    // If oil price is missing, try to get it from yesterday's stats or recent stats
    if (!rawEconomicIndicators.oilPrice) {
      logger.info('[externalDataService] Oil price not fetched, trying to get from database...');
      const recentStats = await ProductCategoryStatsModel.findOne({
        oilPrice: { $exists: true, $ne: null, $gt: 0 }
      })
        .sort({ date: -1 })
        .lean();
      
      if (recentStats && (recentStats as any).oilPrice) {
        rawEconomicIndicators.oilPrice = (recentStats as any).oilPrice;
        logger.info(`[externalDataService] Using oil price from database: $${rawEconomicIndicators.oilPrice} (from ${(recentStats as any).date})`);
      } else {
        logger.warn('[externalDataService] No oil price found in database, calculations will proceed without oil price adjustment');
      }
    }
    
    const economicIndicators = validateEconomicIndicators(rawEconomicIndicators);

    // Fetch yesterday's economic indicators from DB
    const yesterdayStatsSample = await ProductCategoryStatsModel.findOne({
      date: yesterday,
    }).lean();
    
    const allAvailableProducts = await Product.find({ 
      status: 'available',
      onDeal: { $ne: true } // Exclude products in deals
    })
    .select('_id shape carat clarity price pricePerCarat color certificateNumber certificateInstitute status onDeal company location')
    .lean();
    logger.info(`Loaded ${allAvailableProducts.length} available products (excl. deals)`);

    // Filter out products with invalid carat and pricePerCarat values
    const validProductIds = new Set();
    const validProducts = allAvailableProducts.filter((product: IProduct) => {
      const isValid = product.carat !== undefined && product.carat !== null && !isNaN(product.carat) &&
             product.pricePerCarat !== undefined && product.pricePerCarat !== null && !isNaN(product.pricePerCarat) && product.pricePerCarat > 0;
      if (isValid) {
        validProductIds.add(product._id.toString());
      }
      return isValid;
    });
    
    const initiallyFilteredOutCount = allAvailableProducts.length - validProducts.length;
    logger.info(`Valid products: ${validProducts.length} (filtered out ${initiallyFilteredOutCount} with invalid carat/pricePerCarat)`);
    if (initiallyFilteredOutCount > 0) {
      logger.warn(`Filtered out ${initiallyFilteredOutCount} products; first 5: ${allAvailableProducts.filter(p => !validProductIds.has(p._id.toString())).slice(0, 5).map(p => `${p.certificateNumber || p._id} carat=${p.carat} ppc=${p.pricePerCarat}`).join('; ')}`);
    }
        
    const allCombinations = generateAllCategoryCombinations();
    const existingCombinations = allCombinations.filter(combo => {
      const productsInCombo = validProducts.filter(product => {
        if (product.status === 'OnDeal' || (product as any).onDeal === true) return false;
        
        const productShapeCategory = determineShapeCategory(product.shape || '');
        const productWeightCategory = determineWeightCategory(product.carat);
        const productClarityCategory = determineClarityCategory(product.clarity || '');
        const productColorCategory = determineColorCategory(product.color || '');
        
        return productShapeCategory === combo.shape &&
               productWeightCategory === combo.weight &&
               productClarityCategory === combo.clarity &&
               productColorCategory === combo.color;
      });
      
      return productsInCombo.length > 0;
    });
    
    logger.info(`Categories with products: ${existingCombinations.length} (of ${allCombinations.length} possible)`);

    // Track the total number of products processed
    let totalProductsProcessed = 0;
    
    // Create a map to store products already counted to avoid double counting
    const processedProductIds = new Set<string>();
    
    // Initialize GIA and USA location coefficient calculators
    const giaCoefficientCalculator = new EnhancedGiaCoefficientCalculator();
    const usaLocationCoefficientCalculator = new UsaLocationCoefficientCalculator();
    const snapshotEntries: SnapshotInput = [];
    const snapshotEntryMap = new Map<string, SnapshotInput[number]>();
    
    // Cache for GIA and USA location coefficients to avoid recalculation
    const giaCoefficientsCache = new Map<string, { giaCoefficient: number }>();
    const usaCoefficientsCache = new Map<string, number>();
    
    const totalCategories = existingCombinations.length;
    const progressLogInterval = Math.max(1, Math.floor(totalCategories / 12)); // ~12 progress lines over full run
    const runStartMs = Date.now();

    // Process each combination
    let categoryIndex = 0;
    for (const { shape, weight, clarity, color } of existingCombinations) {
      categoryIndex++;
      if (categoryIndex % progressLogInterval === 0 || categoryIndex === 1) {
        const elapsedMin = ((Date.now() - runStartMs) / 60000).toFixed(1);
        logger.info(`📊 Progress: ${categoryIndex}/${totalCategories} categories (${(100 * categoryIndex / totalCategories).toFixed(0)}%) | elapsed ${elapsedMin} min`);
      }
      const pricesPerCaratInCategory: number[] = [];
      const productDetailsForCategory: Array<{ certificateNumber: string; pricePerCarat: number }> = [];

      // Filter products by the current category combination
      const productsInCategory = validProducts.filter((product: IProduct) => {
        // Additional safety check: exclude products in deals
        if (product.status === 'OnDeal' || (product as any).onDeal === true) {
          return false;
        }
        
        // Shape check
        const productShapeCategory = determineShapeCategory(product.shape || '');
        if (productShapeCategory !== shape) return false;
        
        // Weight check
        const productWeightCategory = determineWeightCategory(product.carat); 
        if (productWeightCategory !== weight) return false;
        
        // Clarity check
        const productClarityCategory = determineClarityCategory(product.clarity || '');
        if (productClarityCategory !== clarity) return false;

        // Color check
        const productColorCategory = determineColorCategory(product.color || '');
        return productColorCategory === color;
      });
      
      // Dedup key: certificateNumber or _id so products without cert don't collapse into one
      const certKey = (p: IProduct) => (p.certificateNumber && String(p.certificateNumber).trim()) || p._id.toString();
      let uniqueCount = 0;
      for (const product of productsInCategory) {
        const key = certKey(product);
        if (!processedProductIds.has(key)) {
          processedProductIds.add(key);
          uniqueCount++;
        }
      }

      // Repopulate pricesPerCaratInCategory and productDetailsForCategory (all products in category, valid price only)
      pricesPerCaratInCategory.length = 0;
      productDetailsForCategory.length = 0;
      uniqueCount = productsInCategory.length; // total count for this category today
      for (const product of productsInCategory) {
        const ppc = product.pricePerCarat;
        if (ppc != null && ppc > 0 && isFinite(ppc)) {
          pricesPerCaratInCategory.push(ppc);
          productDetailsForCategory.push({ certificateNumber: certKey(product), pricePerCarat: ppc });
        }
      }

      let avgPricePerCarat = 0;
      let medianPricePerCarat = 0;

      if (pricesPerCaratInCategory.length > 0) {
        // Calculate average pricePerCarat
        avgPricePerCarat = pricesPerCaratInCategory.reduce((sum, price) => sum + price, 0) / pricesPerCaratInCategory.length;
        avgPricePerCarat = parseFloat(avgPricePerCarat.toFixed(2));

        // Calculate median pricePerCarat
        pricesPerCaratInCategory.sort((a, b) => a - b);
        const mid = Math.floor(pricesPerCaratInCategory.length / 2);
        medianPricePerCarat = pricesPerCaratInCategory.length % 2 !== 0
          ? pricesPerCaratInCategory[mid]!
          : (pricesPerCaratInCategory[mid - 1]! + pricesPerCaratInCategory[mid]!) / 2;
        medianPricePerCarat = parseFloat(medianPricePerCarat.toFixed(2));
      }
      
      // Calculate Diffs with Yesterday
      let newProductsToday = 0;
      let disappearedProductsSinceYesterday = 0;
      let priceIncreasedCount = 0;
      let priceDecreasedCount = 0;
      let priceUnchangedCount = 0;

      // New arrays to store prices for each group
      const newProductPrices: number[] = [];
      const disappearedProductPrices: number[] = [];
      const priceIncreasedPrices: number[] = [];
      const priceDecreasedPrices: number[] = [];
      const priceUnchangedPrices: number[] = [];

      // Fetch yesterday's stat for this specific category
      const yesterdayStatDoc = await ProductCategoryStatsModel.findOne({
        date: yesterday,
        shape,
        weight,
        clarity,
        color,
      }).lean() as any;

      const yesterdayProductDetailsMap = new Map<string, number>();
      if (yesterdayStatDoc && yesterdayStatDoc.productDetails) {
        yesterdayStatDoc.productDetails.forEach((detail: { certificateNumber: string; pricePerCarat: number }) => {
          if (detail && detail.certificateNumber) {
            yesterdayProductDetailsMap.set(detail.certificateNumber, detail.pricePerCarat);
          }
        });
      }

      const todayProductDetailsMap = new Map<string, number>();
      productDetailsForCategory.forEach(detail => {
        todayProductDetailsMap.set(detail.certificateNumber, detail.pricePerCarat);
      });

      // Calculate new and price changes for products present today (skip invalid pricePerCarat for medians)
      for (const todayDetail of productDetailsForCategory) {
        const ppc = todayDetail.pricePerCarat;
        if (ppc == null || ppc <= 0 || !isFinite(ppc)) continue;
        if (!yesterdayProductDetailsMap.has(todayDetail.certificateNumber)) {
          newProductsToday++;
          newProductPrices.push(ppc);
        } else {
          const yesterdayPrice = yesterdayProductDetailsMap.get(todayDetail.certificateNumber)!;
          if (ppc > yesterdayPrice) {
            priceIncreasedCount++;
            priceIncreasedPrices.push(ppc);
          } else if (ppc < yesterdayPrice) {
            priceDecreasedCount++;
            priceDecreasedPrices.push(ppc);
          } else {
            priceUnchangedCount++;
            priceUnchangedPrices.push(ppc);
          }
        }
      }

      // Calculate disappeared products (skip invalid pricePerCarat so median is not broken)
      if (yesterdayStatDoc && yesterdayStatDoc.productDetails) {
        for (const yesterdayDetail of yesterdayStatDoc.productDetails) {
          if (yesterdayDetail.certificateNumber && !todayProductDetailsMap.has(yesterdayDetail.certificateNumber)) {
            const ppc = yesterdayDetail.pricePerCarat;
            if (ppc != null && ppc > 0 && isFinite(ppc)) {
              disappearedProductsSinceYesterday++;
              disappearedProductPrices.push(ppc);
            }
          }
        }
      }
      
      // Calculate Average Prices for each group
      const calculateAverage = (prices: number[]) => prices.length > 0 ? parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)) : 0;
      
      const avgPricePerCarat_newProducts = calculateAverage(newProductPrices);
      const avgPricePerCarat_disappearedProducts = calculateAverage(disappearedProductPrices);
      const avgPricePerCarat_priceIncreased = calculateAverage(priceIncreasedPrices);
      const avgPricePerCarat_priceDecreased = calculateAverage(priceDecreasedPrices);
      const avgPricePerCarat_priceUnchanged = calculateAverage(priceUnchangedPrices);

      // Calculate Median Prices for each group for Market Price calculation (uses runConfig from admin/DB)
      const calculateMedian = (prices: number[]): number => {
        if (prices.length === 0) {
          return 0;
        }

        const sortedPrices = [...prices].sort((a, b) => a - b);
        let pricesForMedian = sortedPrices;

        // Adaptive exclusion based on sample size (configurable via admin panel)
        if (sortedPrices.length > 5) {
          const sampleSize = sortedPrices.length;
          let category = '';
          let exclusionInfo = '';
          const smallKeep = runConfig.medianSmallKeepPct;
          const mediumKeep = runConfig.medianMediumKeepPct;
          const largeExp = runConfig.medianLargeExpensiveExcludePct;
          const largeCheap = runConfig.medianLargeCheapExcludePct;
          const veryLargeExp = runConfig.medianVeryLargeExpensiveExcludePct;
          const veryLargeCheap = runConfig.medianVeryLargeCheapExcludePct;

          if (sampleSize <= 15) {
            const keepCount = Math.round(sampleSize * smallKeep);
            pricesForMedian = sortedPrices.slice(0, keepCount);
            category = 'Small sample';
            exclusionInfo = `excluded ${sampleSize - keepCount} expensive (${((1 - smallKeep) * 100).toFixed(0)}%)`;
          } else if (sampleSize <= 50) {
            const keepCount = Math.round(sampleSize * mediumKeep);
            pricesForMedian = sortedPrices.slice(0, keepCount);
            category = 'Medium sample';
            exclusionInfo = `excluded ${sampleSize - keepCount} expensive (${((1 - mediumKeep) * 100).toFixed(0)}%)`;
          } else if (sampleSize <= 100) {
            const expensiveExcludeCount = Math.round(sampleSize * largeExp);
            const cheapExcludeCount = Math.round(sampleSize * largeCheap);
            pricesForMedian = sortedPrices.slice(cheapExcludeCount, sampleSize - expensiveExcludeCount);
            category = 'Large sample';
            exclusionInfo = `excluded ${expensiveExcludeCount} expensive (${(largeExp * 100).toFixed(0)}%) + ${cheapExcludeCount} cheap (${(largeCheap * 100).toFixed(0)}%)`;
          } else {
            const expensiveExcludeCount = Math.round(sampleSize * veryLargeExp);
            const cheapExcludeCount = Math.round(sampleSize * veryLargeCheap);
            pricesForMedian = sortedPrices.slice(cheapExcludeCount, sampleSize - expensiveExcludeCount);
            category = 'Very large sample';
            exclusionInfo = `excluded ${expensiveExcludeCount} expensive (${(veryLargeExp * 100).toFixed(0)}%) + ${cheapExcludeCount} cheap (${(veryLargeCheap * 100).toFixed(0)}%)`;
          }

          if (sampleSize >= 20) {
            logger.debug(`[AdaptiveMedian] ${category} (${sampleSize} products): ${exclusionInfo}, ${pricesForMedian.length} remaining for median`);
          }
        }

        if (pricesForMedian.length === 0) {
          return 0;
        }

        const mid = Math.floor(pricesForMedian.length / 2);
        const median = pricesForMedian.length % 2 !== 0
          ? pricesForMedian[mid]!
          : (pricesForMedian[mid - 1]! + pricesForMedian[mid]!) / 2;
        return parseFloat(median.toFixed(2));
      };

      const medianPricePerCarat_newProducts = calculateMedian(newProductPrices);
      const medianPricePerCarat_disappearedProducts = calculateMedian(disappearedProductPrices);
      const medianPricePerCarat_priceIncreased = calculateMedian(priceIncreasedPrices);
      const medianPricePerCarat_priceDecreased = calculateMedian(priceDecreasedPrices);
      const medianPricePerCarat_priceUnchanged = calculateMedian(priceUnchangedPrices);

      const categoryKey = `${shape}-${weight}-${clarity}-${color}`;
      const simpleMedian = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 !== 0 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
      };
      if (uniqueCount >= 80) {
        const catPrices = [...pricesPerCaratInCategory].sort((a, b) => a - b);
        const minPpc = catPrices[0];
        const maxPpc = catPrices[catPrices.length - 1];
        const p10 = catPrices[Math.floor(0.1 * catPrices.length)];
        logger.info(`[market-price-diagnostic] === ${categoryKey} (n=${uniqueCount}) ===`);
        logger.info(`[market-price-diagnostic] Category price range: min=$/ct=${minPpc}, 10th%=${p10}, max=$/ct=${maxPpc}`);
        const logGroup = (name: string, arr: number[], usedMedian: number) => {
          if (arr.length === 0) {
            logger.info(`[market-price-diagnostic]   ${name}: count=0, (no data)`);
            return;
          }
          const sm = simpleMedian(arr);
          const amin = Math.min(...arr);
          const amax = Math.max(...arr);
          logger.info(`[market-price-diagnostic]   ${name}: count=${arr.length}, simpleMedian=${sm.toFixed(2)}, adaptiveMedian(used)=${usedMedian.toFixed(2)}, min=${amin.toFixed(2)}, max=${amax.toFixed(2)}`);
        };
        logGroup('new', newProductPrices, medianPricePerCarat_newProducts);
        logGroup('disappeared', disappearedProductPrices, medianPricePerCarat_disappearedProducts);
        logGroup('priceIncreased', priceIncreasedPrices, medianPricePerCarat_priceIncreased);
        logGroup('priceDecreased', priceDecreasedPrices, medianPricePerCarat_priceDecreased);
        logGroup('priceUnchanged', priceUnchangedPrices, medianPricePerCarat_priceUnchanged);
      }

      // Special rule: if category has exactly 1 product, set market price as 1.04 × supplier price.
      // This prevents noisy analytics/trends for ultra-sparse categories.
      if (uniqueCount === 1 && productsInCategory.length === 1) {
        const only = productsInCategory[0] as IProduct;
        const carat = only.carat;
        const supplierTotalPrice =
          typeof only.price === 'number' && isFinite(only.price) && only.price > 0
            ? only.price
            : (typeof only.pricePerCarat === 'number' && isFinite(only.pricePerCarat) && only.pricePerCarat > 0 && carat > 0
                ? only.pricePerCarat * carat
                : 0);

        if (carat > 0 && supplierTotalPrice > 0) {
          const supplierPricePerCarat = supplierTotalPrice / carat;
          const referencePricePerCarat = parseFloat((supplierPricePerCarat * 1.04).toFixed(2));

          // Update the (single) product in this category using the computed reference directly (no GIA/USA/economic multipliers).
          const marketPrice = parseFloat((referencePricePerCarat * carat).toFixed(2));
          try {
            await Product.updateOne(
              {
                _id: new mongoose.Types.ObjectId((only as any)._id.toString()),
                status: { $ne: 'OnDeal' },
                onDeal: { $ne: true }
              },
              { $set: { marketPrice, marketPricePerCarat: referencePricePerCarat } }
            );
          } catch (error) {
            logger.error(`Error updating single-product category item ${(only as any)._id}:`, error);
          }

          if (totalProductsProcessed <= 2) {
            logger.info(
              `Stats sample (single-unit override): ${shape}-${weight}-${clarity}-${color} | count=${uniqueCount}, supplier=$/ct=${supplierPricePerCarat.toFixed(2)}, market=$/ct=${referencePricePerCarat}`
            );
          }

          const snapshotEntry = {
            key: `${shape}-${weight}-${clarity}-${color}`,
            pricePerCarat: referencePricePerCarat,
            avgPricePerCarat,
            medianPricePerCarat,
            count: uniqueCount,
          };
          snapshotEntries.push(snapshotEntry);
          snapshotEntryMap.set(snapshotEntry.key, snapshotEntry);

          // Save stats (chart "today" matches product card baseline)
          try {
            await (ProductCategoryStatsModel as any)['findOrCreateStats'](
              today,
              shape,
              weight,
              clarity,
              color,
              uniqueCount,
              avgPricePerCarat,
              medianPricePerCarat,
              productDetailsForCategory,
              newProductsToday,
              disappearedProductsSinceYesterday,
              priceIncreasedCount,
              priceDecreasedCount,
              priceUnchangedCount,
              avgPricePerCarat_newProducts,
              avgPricePerCarat_disappearedProducts,
              avgPricePerCarat_priceIncreased,
              avgPricePerCarat_priceDecreased,
              avgPricePerCarat_priceUnchanged,
              referencePricePerCarat,
              medianPricePerCarat_newProducts,
              medianPricePerCarat_disappearedProducts,
              medianPricePerCarat_priceIncreased,
              medianPricePerCarat_priceDecreased,
              medianPricePerCarat_priceUnchanged,
              economicIndicators.goldPrice,
              economicIndicators.oilPrice,
              economicIndicators.inrUsdRate
            );
          } catch (error) {
            logger.error(`Error saving stats for single-product category ${shape}-${weight}-${clarity}-${color}:`, error);
          }

          totalProductsProcessed += uniqueCount;
          continue;
        }
        // If we can't compute supplier price safely, fall through to normal algorithm.
      }

      // Calculate Market Price based on internal dynamics (weights from runConfig)
      let internalMarketPrice = 0;
      const wDec = runConfig.weightPriceDecreased;
      const wInc = runConfig.weightPriceIncreased;
      const wNew = runConfig.weightNewProducts;
      const wDis = runConfig.weightDisappeared;
      const wUnch = runConfig.weightUnchanged;
      const numerator =
        (medianPricePerCarat_priceDecreased * wDec * priceDecreasedCount) +
        (medianPricePerCarat_priceIncreased * wInc * priceIncreasedCount) +
        (medianPricePerCarat_newProducts * wNew * newProductsToday) +
        (medianPricePerCarat_disappearedProducts * wDis * disappearedProductsSinceYesterday) +
        (medianPricePerCarat_priceUnchanged * wUnch * priceUnchangedCount);

      const denominator =
        (wDec * priceDecreasedCount) +
        (wInc * priceIncreasedCount) +
        (wNew * newProductsToday) +
        (wDis * disappearedProductsSinceYesterday) +
        (wUnch * priceUnchangedCount);

      if (denominator > 0) {
        internalMarketPrice = parseFloat((numerator / denominator).toFixed(2));
        if (uniqueCount >= 80) {
          logger.info(`[market-price-diagnostic] Weights: wDec=${wDec}, wInc=${wInc}, wNew=${wNew}, wDis=${wDis}, wUnch=${wUnch}`);
          logger.info(`[market-price-diagnostic] numerator=${numerator.toFixed(2)}, denominator=${denominator.toFixed(2)} → internalMarketPrice=${internalMarketPrice}`);
        }
        monitorMarketPriceQuality(categoryKey, internalMarketPrice, avgPricePerCarat, uniqueCount);
      }

      // Calculate GIA coefficient for this category
      let giaCoefficient = 1.0; // Default coefficient
      
        try {
          const coefficientCalculation = giaCoefficientCalculator.calculateGiaCoefficient(
            productsInCategory,
            categoryKey
          );

          giaCoefficient = coefficientCalculation.calculatedCoefficient;
          giaCoefficientsCache.set(categoryKey, giaCoefficientCalculator.createGiaCoefficient(coefficientCalculation));

          if (coefficientCalculation.isValid) {
            logger.debug(`[GIA] Category ${categoryKey}: coefficient=${giaCoefficient.toFixed(3)}, GIA=${coefficientCalculation.giaProducts.length}, IGI=${coefficientCalculation.igiProducts.length}`);
          } else {
            logger.warn(`[GIA] Category ${categoryKey}: ${coefficientCalculation.reason}, using coefficient ${giaCoefficient.toFixed(3)}`);
          }
        } catch (error) {
          logger.error(`[GIA] Error calculating coefficient for category ${categoryKey}:`, error);
          giaCoefficient = 1.0; // Fallback to default
        }

      // Calculate USA location coefficient for this category (USA stones slightly higher market price)
      let usaCoefficient = 1.0;
      try {
        const usaCalculation = usaLocationCoefficientCalculator.calculateUsaCoefficient(productsInCategory, categoryKey);
        usaCoefficient = usaCalculation.calculatedCoefficient;
        usaCoefficientsCache.set(categoryKey, usaCoefficient);
        if (usaCalculation.isValid) {
          logger.debug(`[USA] Category ${categoryKey}: coefficient=${usaCoefficient.toFixed(3)}, USA=${usaCalculation.usaProducts.length}, nonUSA=${usaCalculation.nonUsaProducts.length}`);
        } else if (usaCalculation.reason) {
          logger.warn(`[USA] Category ${categoryKey}: ${usaCalculation.reason}, using coefficient ${usaCoefficient.toFixed(3)}`);
        }
      } catch (error) {
        logger.error(`[USA] Error calculating coefficient for category ${categoryKey}:`, error);
        usaCoefficient = 1.0;
      }

      // Adjust Market Price with Economic Indicators
      let finalMarketPrice = internalMarketPrice;

      if (yesterdayStatsSample && internalMarketPrice > 0) {
        const { goldPrice: yesterdayGold, oilPrice: yesterdayOil, inrUsdRate: yesterdayInr } = yesterdayStatsSample as any;
        const { goldPrice: todayGold, oilPrice: todayOil, inrUsdRate: todayInr } = economicIndicators;

        const calculateDelta = (todayVal?: number, yesterdayVal?: number) => {
          if (todayVal && yesterdayVal && yesterdayVal > 0) {
            return (todayVal - yesterdayVal) / yesterdayVal;
          }
          return 0;
        };

        const deltaInr = calculateDelta(todayInr, yesterdayInr);
        const deltaGold = calculateDelta(todayGold, yesterdayGold);
        const deltaOil = calculateDelta(todayOil, yesterdayOil);

        // Coefficients from run config (admin panel or env defaults)
        const alpha = runConfig.coeffInr; // α
        const beta = runConfig.coeffGold; // β
        const gamma = runConfig.coeffOil; // γ

        const inrFactor = 1 + (alpha * deltaInr);
        const goldFactor = 1 + (beta * deltaGold);
        const oilFactor = 1 + (gamma * deltaOil);

        const adjustmentFactor = inrFactor * goldFactor * oilFactor;
        
        // Calculate individual contributions for monitoring
        const inrContribution = ((inrFactor - 1) * 100).toFixed(2);
        const goldContribution = ((goldFactor - 1) * 100).toFixed(2);
        const oilContribution = ((oilFactor - 1) * 100).toFixed(2);
        const totalAdjustment = ((adjustmentFactor - 1) * 100).toFixed(2);
        
        if (isFinite(adjustmentFactor) && adjustmentFactor > 0 && adjustmentFactor < 10) {
          finalMarketPrice = parseFloat((internalMarketPrice * adjustmentFactor).toFixed(2));
          
          if (uniqueCount >= 80) {
            logger.info(`[market-price-diagnostic] Economic: yesterday Au=${yesterdayGold} Oil=${yesterdayOil} INR=${yesterdayInr}`);
            logger.info(`[market-price-diagnostic] Economic: today Au=${todayGold} Oil=${todayOil} INR=${todayInr}`);
            logger.info(`[market-price-diagnostic] Economic: deltas INR=${(deltaInr * 100).toFixed(3)}% Gold=${(deltaGold * 100).toFixed(3)}% Oil=${(deltaOil * 100).toFixed(3)}%`);
            logger.info(`[market-price-diagnostic] Economic: coeffs α=${alpha} β=${beta} γ=${gamma} → adjustmentFactor=${adjustmentFactor.toFixed(4)}`);
            logger.info(`[market-price-diagnostic] Economic: internalMarketPrice=${internalMarketPrice} × ${adjustmentFactor.toFixed(4)} → finalMarketPrice=${finalMarketPrice}`);
          }
          logger.debug(`[economic] Category ${shape}-${weight}-${clarity}-${color}:`);
          logger.debug(`[economic]   INR: ${inrContribution}% (Δ${(deltaInr * 100).toFixed(2)}% × ${alpha})`);
          logger.debug(`[economic]   Gold: ${goldContribution}% (Δ${(deltaGold * 100).toFixed(2)}% × ${beta})`);
          logger.debug(`[economic]   Oil: ${oilContribution}% (Δ${(deltaOil * 100).toFixed(2)}% × ${gamma})`);
          logger.debug(`[economic]   Total adjustment: ${totalAdjustment}% → $${internalMarketPrice.toFixed(2)} → $${finalMarketPrice.toFixed(2)}`);
          
          if (Math.abs(adjustmentFactor - 1) > 0.15) {
            logger.warn(`[economic] ⚠️ Large price adjustment detected (${totalAdjustment}%) for ${shape}-${weight}-${clarity}-${color}`);
            logger.warn(`[economic]   Breakdown - INR: ${inrContribution}%, Gold: ${goldContribution}%, Oil: ${oilContribution}%`);
          }
        } else {
          logger.warn(`[calculator] Invalid adjustment factor ${adjustmentFactor} for category ${shape}-${weight}-${clarity}-${color}. Skipping economic adjustment.`);
          finalMarketPrice = internalMarketPrice;
        }
      } else if (uniqueCount >= 80 && internalMarketPrice > 0) {
        logger.info(`[market-price-diagnostic] Economic: no yesterdayStatsSample, finalMarketPrice=internalMarketPrice=${internalMarketPrice}`);
      }

      // Reference = finalMarketPrice (category price from supplier medians). No division by
      // avgBlendFactor: finalMarketPrice is not a GIA/USA-blended average, so dividing would
      // wrongly deflate below supplier floor. IGI non-USA products get this; GIA/USA get reference × coeffs.
      const referencePricePerCarat = finalMarketPrice;
      if (uniqueCount >= 80) {
        logger.info(`[market-price-diagnostic] Reference = finalMarketPrice (no blend division) → referencePricePerCarat=${referencePricePerCarat}`);
        logger.info(`[market-price-diagnostic] === RESULT: market $/ct (saved) = ${referencePricePerCarat} ===`);
      }

      // Update marketPrice for products in this category
      if (productsInCategory.length > 0) {
        let updatedCount = 0;
        for (const product of productsInCategory) {
          if (product.status === 'OnDeal' || (product as any).onDeal === true) continue;
          if (!product.carat || product.carat <= 0) continue;
          if (!referencePricePerCarat || referencePricePerCarat <= 0) continue;

          const afterGia = giaCoefficientCalculator.applyGiaCoefficient(
            referencePricePerCarat,
            giaCoefficient,
            product.certificateInstitute
          );
          const adjustedMarketPricePerCarat = usaLocationCoefficientCalculator.applyLocationCoefficient(
            afterGia,
            usaCoefficient,
            product.location
          );
          const marketPrice = parseFloat((adjustedMarketPricePerCarat * product.carat).toFixed(2));

          try {
            const updateResult = await Product.updateOne(
              {
                _id: new mongoose.Types.ObjectId(product._id.toString()),
                status: { $ne: 'OnDeal' },
                onDeal: { $ne: true }
              },
              { $set: { marketPrice, marketPricePerCarat: adjustedMarketPricePerCarat } }
            );
            if (updateResult.modifiedCount > 0) updatedCount++;
          } catch (error) {
            logger.error(`Error updating product ${product._id}:`, error);
          }
        }
        logger.debug(`Category ${shape}-${weight}-${clarity}-${color}: updated ${updatedCount} products, reference $/ct=${referencePricePerCarat}`);
      }
      
      if (totalProductsProcessed <= 2) {
        logger.info(`Stats sample: ${shape}-${weight}-${clarity}-${color} | count=${uniqueCount}, avg=$/ct=${avgPricePerCarat}, market=$/ct=${referencePricePerCarat}`);
      }

      // Use referencePricePerCarat for chart/stats so "today" on graph matches product marketPricePerCarat (IGI, non-USA)
      const snapshotEntry = {
        key: `${shape}-${weight}-${clarity}-${color}`,
        pricePerCarat: referencePricePerCarat,
        avgPricePerCarat,
        medianPricePerCarat,
        count: uniqueCount,
      };
      snapshotEntries.push(snapshotEntry);
      snapshotEntryMap.set(snapshotEntry.key, snapshotEntry);

      // Save the stats using findOrCreateStats (identical to server)
      try {
        await (ProductCategoryStatsModel as any)['findOrCreateStats'](
          today,
          shape,
          weight,
          clarity,
          color,
          uniqueCount,
          avgPricePerCarat,
          medianPricePerCarat,
          productDetailsForCategory,
          newProductsToday,
          disappearedProductsSinceYesterday,
          priceIncreasedCount,
          priceDecreasedCount,
          priceUnchangedCount,
          avgPricePerCarat_newProducts,
          avgPricePerCarat_disappearedProducts,
          avgPricePerCarat_priceIncreased,
          avgPricePerCarat_priceDecreased,
          avgPricePerCarat_priceUnchanged,
          referencePricePerCarat, // marketPricePerCarat — same as product baseline so chart "today" matches product card
          medianPricePerCarat_newProducts,
          medianPricePerCarat_disappearedProducts,
          medianPricePerCarat_priceIncreased,
          medianPricePerCarat_priceDecreased,
          medianPricePerCarat_priceUnchanged,
          economicIndicators.goldPrice,
          economicIndicators.oilPrice,
          economicIndicators.inrUsdRate
        );
      } catch (error) {
        logger.error(`Error saving stats for category ${shape}-${weight}-${clarity}-${color}:`, error);
      }
      
      totalProductsProcessed += uniqueCount;
    }
    
    logger.info(`Completed category statistics. Processed ${totalProductsProcessed} products (${totalCategories} categories).`);

    // Check if counts match
    if (totalProductsProcessed !== validProducts.length) {
      const keyOf = (p: IProduct) => (p.certificateNumber && String(p.certificateNumber).trim()) || p._id.toString();
      const unprocessedCount = validProducts.filter(p => !processedProductIds.has(keyOf(p))).length;
      logger.warn(`Processed ${totalProductsProcessed} vs valid ${validProducts.length} (${unprocessedCount} not in any tracked category)`);
    }

    // Analyze problematic suppliers and data issues
    // Для анализа качества данных нам важны и нулевые цены/отсутствующие поля,
    // поэтому используем полный набор доступных продуктов, а не отфильтрованные
    await analyzeDataQualityIssues(allAvailableProducts);
    
    // REMOVED: Smart demand analytics calculation - moved to analytics-service
    
    logger.info('✅ Daily calculation completed successfully');

    if (snapshotEntries.length > 0) {
      try {
        await publishMarketPriceSnapshot(snapshotEntries);
      } catch (error) {
        logger.error('Failed to publish market price snapshot', {
          error,
          entries: snapshotEntries.length,
        });
      }
    } else {
      logger.warn('Skipping market price snapshot publish: no entries generated');
    }
    
  } catch (error) {
    logger.error('Error calculating product category statistics:', error);
    throw error;
  }
};

// REMOVED: updateCategoryStatsWithSmartAnalytics - moved to analytics-service

// Analyze data quality issues and problematic suppliers
const analyzeDataQualityIssues = async (products: IProduct[]): Promise<void> => {
  try {
    logger.info('Data quality analysis...');
    
    // Prefetch only companies present in the provided products
    const companyIds = Array.from(
      new Set(
        products
          .map(p => (p.company ? p.company.toString() : null))
          .filter((v): v is string => Boolean(v))
      )
    );
    const companies = companyIds.length > 0
      ? await _Company.find({ _id: { $in: companyIds.map(id => new mongoose.Types.ObjectId(id)) } }, 'name _id').lean()
      : [];
    const companyMap = new Map<string, string>(companies.map((c) => [
      (c as { _id: mongoose.Types.ObjectId; name?: string })._id.toString(), 
      (c as { _id: mongoose.Types.ObjectId; name?: string }).name || 'Unknown'
    ]));
    
    // 1. Analyze products with zero prices
    const zeroPriceProducts = products.filter(p => p.pricePerCarat === 0 || (p.price ?? 0) === 0);
    if (zeroPriceProducts.length > 0) {
      logger.warn(`⚠️  Found ${zeroPriceProducts.length} products with zero prices`);
      
      // Group by company
      const zeroPriceByCompany = new Map<string, { count: number, examples: IProduct[] }>();
      zeroPriceProducts.forEach(p => {
        const companyId = p.company ? p.company.toString() : undefined;
        const companyName = (companyId && companyMap.get(companyId)) || 'Unknown Company';
        
        if (!zeroPriceByCompany.has(companyName)) {
          zeroPriceByCompany.set(companyName, { count: 0, examples: [] });
        }
        
        const companyData = zeroPriceByCompany.get(companyName)!;
        companyData.count++;
        if (companyData.examples.length < 3) {
          companyData.examples.push(p);
        }
      });
      
      logger.warn('📊 Zero price products by company:');
      Array.from(zeroPriceByCompany.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .forEach(([company, data]) => {
          logger.warn(`  ${company}: ${data.count} products`);
          data.examples.forEach(ex => {
            logger.warn(`    - Cert: ${ex.certificateNumber || 'N/A'}, Carat: ${ex.carat}, Price: $${ex.price}, Price/ct: $${ex.pricePerCarat}`);
          });
        });
    }
    
    // 2. Analyze extremely low prices (suspicious pricing)
    const suspiciousLowPriceProducts = products.filter(p => 
      p.pricePerCarat > 0 && p.pricePerCarat < 10 // Less than $10 per carat is suspicious
    );
    
    if (suspiciousLowPriceProducts.length > 0) {
      logger.warn(`⚠️  Found ${suspiciousLowPriceProducts.length} products with suspiciously low prices (<$10/ct)`);
      
      const lowPriceByCompany = new Map<string, { count: number, avgPrice: number, examples: IProduct[] }>();
      suspiciousLowPriceProducts.forEach(p => {
        const companyId = p.company ? p.company.toString() : undefined;
        const companyName = (companyId && companyMap.get(companyId)) || 'Unknown Company';
        
        if (!lowPriceByCompany.has(companyName)) {
          lowPriceByCompany.set(companyName, { count: 0, avgPrice: 0, examples: [] });
        }
        
        const companyData = lowPriceByCompany.get(companyName)!;
        companyData.count++;
        companyData.avgPrice += p.pricePerCarat;
        
        if (companyData.examples.length < 3) {
          companyData.examples.push(p);
        }
      });
      
      // Calculate averages
      lowPriceByCompany.forEach(data => {
        data.avgPrice = data.avgPrice / data.count;
      });
      
      logger.warn('📊 Suspiciously low price products by company:');
      Array.from(lowPriceByCompany.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .forEach(([company, data]) => {
          logger.warn(`  ${company}: ${data.count} products, avg $${data.avgPrice.toFixed(2)}/ct`);
          data.examples.forEach(ex => {
            logger.warn(`    - Cert: ${ex.certificateNumber || 'N/A'}, ${ex.carat}ct, ${ex.clarity} ${ex.color}, $${ex.pricePerCarat}/ct`);
          });
        });
    }
    
    // 3. Analyze companies with most products
    const productsByCompany = new Map<string, number>();
    products.forEach(p => {
      const companyId = p.company ? p.company.toString() : undefined;
      const companyName = (companyId && companyMap.get(companyId)) || 'Unknown Company';
      productsByCompany.set(companyName, (productsByCompany.get(companyName) || 0) + 1);
    });
    
    logger.info('📊 Top 10 companies by product count:');
    Array.from(productsByCompany.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([company, count]) => {
        logger.info(`  ${company}: ${count} products`);
      });
    
    // 4. Analyze price distribution by company
    const priceAnalysisByCompany = new Map<string, { 
      count: number, 
      avgPrice: number, 
      minPrice: number, 
      maxPrice: number,
      zeroPriceCount: number 
    }>();
    
    products.forEach(p => {
      const companyId = p.company?.toString();
      const companyName = (companyId && companyMap.get(companyId)) || 'Unknown Company';
      
      if (!priceAnalysisByCompany.has(companyName)) {
        priceAnalysisByCompany.set(companyName, { 
          count: 0, 
          avgPrice: 0, 
          minPrice: Infinity, 
          maxPrice: 0,
          zeroPriceCount: 0 
        });
      }
      
      const companyData = priceAnalysisByCompany.get(companyName)!;
      companyData.count++;
      
      if (p.pricePerCarat > 0) {
        companyData.avgPrice += p.pricePerCarat;
        companyData.minPrice = Math.min(companyData.minPrice, p.pricePerCarat);
        companyData.maxPrice = Math.max(companyData.maxPrice, p.pricePerCarat);
      } else {
        companyData.zeroPriceCount++;
      }
    });
    
    // Calculate averages and find problematic companies
    const problematicCompanies: Array<{ name: string, issues: string[] }> = [];
    
    priceAnalysisByCompany.forEach((data, company) => {
      const validPriceCount = data.count - data.zeroPriceCount;
      if (validPriceCount > 0) {
        data.avgPrice = data.avgPrice / validPriceCount;
      }
      
      const issues: string[] = [];
      if (data.zeroPriceCount > 0) {
        issues.push(`${data.zeroPriceCount} zero-price products`);
      }
      if (data.avgPrice < 50 && validPriceCount > 10) {
        issues.push(`Very low avg price: $${data.avgPrice.toFixed(2)}/ct`);
      }
      if (data.maxPrice > 0 && data.minPrice > 0 && (data.maxPrice / data.minPrice) > 1000) {
        issues.push(`Extreme price range: $${data.minPrice.toFixed(2)} - $${data.maxPrice.toFixed(2)}/ct`);
      }
      
      if (issues.length > 0) {
        problematicCompanies.push({ name: company, issues });
      }
    });
    
    if (problematicCompanies.length > 0) {
      logger.warn('🚨 Companies with potential data quality issues:');
      problematicCompanies
        .sort((a, b) => b.issues.length - a.issues.length)
        .slice(0, 15)
        .forEach(company => {
          logger.warn(`  ${company.name}:`);
          company.issues.forEach(issue => {
            logger.warn(`    - ${issue}`);
          });
        });
    }
    
    // 5. Summary statistics
    const totalCompanies = productsByCompany.size;
    const companiesWithIssues = problematicCompanies.length;
    const totalZeroPriceProducts = zeroPriceProducts.length;
    const totalSuspiciousLowPriceProducts = suspiciousLowPriceProducts.length;
    
    logger.info(`Data quality: ${totalCompanies} companies, ${companiesWithIssues} with issues; zeroPrice=${totalZeroPriceProducts}, lowPrice<10/ct=${totalSuspiciousLowPriceProducts}`);
    
  } catch (error) {
    logger.error('Error analyzing data quality issues:', error);
  }
};

// REMOVED: Smart Demand Analytics Types - moved to analytics-service 