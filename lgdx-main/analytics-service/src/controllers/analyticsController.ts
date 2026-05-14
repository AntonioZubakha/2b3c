import { Request, Response } from 'express';
import { AnalyticsDataService } from '../services/analyticsDataService';
import { MarketAnalysisService } from '../services/marketAnalysisService';
import { ProductCategoryStats } from '../models/ProductCategoryStats';
import { CategoryComparisonResult, CategorySupplyInsightsResult, CategoryComparisonFullResult, CategoryOptions } from '../models/AnalyticsData';
import { logger } from '../utils/logger';
import { DB_LIMITS } from '../utils/constants';

// In-memory cache for comparison results (15-minute TTL)
const COMPARISON_CACHE_TTL_MS = 15 * 60 * 1000;
const comparisonCache = new Map<string, { data: CategoryComparisonResult; expiry: number }>();

// In-memory cache for price trends by days (15-minute TTL)
const PRICE_TRENDS_CACHE_TTL_MS = 15 * 60 * 1000;
const priceTrendsCache = new Map<string, { data: unknown; expiry: number }>();

// In-memory cache for supply opportunities (15-minute TTL)
const supplyOppsCache = new Map<string, { data: CategorySupplyInsightsResult; expiry: number }>();

// In-memory cache for full category comparison (15-minute TTL)
const fullCompCache = new Map<string, { data: CategoryComparisonFullResult; expiry: number }>();

// In-memory cache for category options (60-minute TTL — options don't change often)
const CATEGORY_OPTIONS_CACHE_TTL_MS = 60 * 60 * 1000;
let categoryOptionsCache: { data: CategoryOptions; expiry: number } | null = null;

/**
 * Simplified Analytics Controller
 * Handles all analytics endpoints with proper error handling
 */
export class AnalyticsController {
  /**
   * Health check endpoint
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        memory: {
          used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`
        },
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('❌ Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get analytics data for a specific period
   * Supports both new format (/analytics/v2/cached/:period) and legacy format (/analytics/:period)
   */
  static async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      let period = req.params.period;
      
      // Support legacy format
      if (!period) {
        const path = req.path;
        if (path.includes('/analytics/day')) {
          period = 'day';
        } else if (path.includes('/analytics/week')) {
          period = 'week';
        } else if (path.includes('/analytics/month')) {
          period = 'month';
        }
      }
      
      if (!period || !['day', 'week', 'month'].includes(period)) {
        res.status(400).json({
          success: false,
          error: 'Period must be day, week, or month'
        });
        return;
      }

      logger.info(`📊 Getting analytics for period: ${period}`);
      
      // Try to get from database first, then generate if not found
      const analyticsData = await AnalyticsDataService.getOrGenerateAnalytics(period as 'day' | 'week' | 'month');
      
      res.json(analyticsData);
    } catch (error) {
      logger.error('❌ Failed to get analytics:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get category statistics for a specific date range
   */
  static async getCategoryStats(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, shape, weight, clarity, color } = req.query;

      // Validate required parameters
      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'startDate and endDate are required'
        });
        return;
      }

      logger.info(`📊 Getting category stats for range: ${startDate} to ${endDate}`);
      logger.info(`📊 Query parameters:`, { startDate, endDate, shape, weight, clarity, color });

      // Build query
      const query: Record<string, unknown> = {
        date: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        }
      };

      // Add optional filters
      if (shape) {
        // Support both single shape and array of shapes
        // Express converts arrays to objects like {"0":"ROUND","1":"OVAL"}, so we need to handle both cases
        let shapeArray: string[] = [];
        
        if (Array.isArray(shape)) {
          shapeArray = shape.filter(s => typeof s === 'string') as string[];
        } else if (typeof shape === 'object' && shape !== null) {
          // Convert object {"0":"ROUND","1":"OVAL"} to array ["ROUND","OVAL"]
          shapeArray = Object.values(shape).filter(s => typeof s === 'string') as string[];
        } else if (typeof shape === 'string') {
          shapeArray = [shape];
        }
        
        if (shapeArray.length > 0) {
          query.shape = { $in: shapeArray };
          logger.info(`📊 Using shape filter with array:`, shapeArray);
        }
      } else {
        logger.info(`📊 No shape filter applied`);
      }
      if (weight) query.weight = weight;
      if (clarity) query.clarity = clarity;
      if (color) query.color = color;

      // Get data from database with optimization
      const stats = await ProductCategoryStats.find(query)
        .select('date shape weight clarity color count marketPricePerCarat avgPricePerCarat medianPricePerCarat newProductsToday disappearedProductsSinceYesterday priceIncreasedCount priceDecreasedCount priceUnchangedCount avgPricePerCarat_newProducts avgPricePerCarat_disappearedProducts avgPricePerCarat_priceIncreased avgPricePerCarat_priceDecreased avgPricePerCarat_priceUnchanged medianPricePerCarat_newProducts medianPricePerCarat_disappearedProducts medianPricePerCarat_priceIncreased medianPricePerCarat_priceDecreased medianPricePerCarat_priceUnchanged goldPrice oilPrice inrUsdRate')
        .sort({ date: 1 })
        .limit(DB_LIMITS.MAX_CATEGORY_STATS)
        .lean();

      logger.info(`📊 Found ${stats.length} category stats records`);
      
      // Debug: Log sample count values
      if (stats.length > 0) {
        logger.info(`📊 Sample count values: ${stats.slice(0, 5).map(s => `${s.shape}-${s.weight}-${s.clarity}-${s.color}: count=${s.count}`).join(', ')}`);
        
        // Check if all counts are 0 or undefined
        const zeroCounts = stats.filter(s => !s.count || s.count === 0).length;
        const totalCounts = stats.length;
        logger.info(`📊 Count analysis: ${zeroCounts}/${totalCounts} records have count=0 or undefined`);
        
        // Log first record with full details
        if (stats[0]) {
          logger.info(`📊 First record details:`, JSON.stringify(stats[0], null, 2));
        }
      }

      res.json({
        success: true,
        startDate,
        endDate,
        totalRecords: stats.length,
        data: stats
      });

    } catch (error) {
      logger.error('❌ Failed to get category stats:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get optimized chart data for a specific diamond category
   */
  static async getChartData(req: Request, res: Response): Promise<void> {
    try {
      const { shape, weight, clarity, color } = req.params;
      const { days = '10' } = req.query;

      const daysNum = parseInt(days as string, 10);
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (daysNum * 24 * 60 * 60 * 1000));

      logger.info(`📊 Getting chart data for ${shape}-${weight}-${clarity}-${color}, ${daysNum} days`);

      // Optimized query for chart data
      const stats = await ProductCategoryStats.find({
        date: { $gte: startDate, $lte: endDate },
        shape: shape.toUpperCase(),
        weight,
        clarity: clarity.toUpperCase(),
        color: color.toUpperCase(),
      })
      .select('date marketPricePerCarat avgPricePerCarat medianPricePerCarat')
      .sort({ date: 1 })
      .limit(DB_LIMITS.MAX_CHART_POINTS)
      .lean();

      logger.info(`📊 Found ${stats.length} chart data points`);

      res.json({
        success: true,
        data: stats,
        totalPoints: stats.length,
        dateRange: { startDate, endDate }
      });

    } catch (error) {
      logger.error('❌ Failed to get chart data:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Compare two diamond categories and return a production verdict
   * GET /analytics/compare?shapeA=ROUND&shapeB=OVAL&period=week
   */
  static async compareCategories(req: Request, res: Response): Promise<void> {
    try {
      const { shapeA, shapeB, period = 'week' } = req.query;

      if (!shapeA || !shapeB || typeof shapeA !== 'string' || typeof shapeB !== 'string') {
        res.status(400).json({ success: false, error: 'shapeA and shapeB are required string parameters' });
        return;
      }

      const normalizedA = shapeA.toUpperCase().trim();
      const normalizedB = shapeB.toUpperCase().trim();

      if (normalizedA === normalizedB) {
        res.status(400).json({ success: false, error: 'shapeA and shapeB must be different' });
        return;
      }

      const validPeriods = ['day', 'week', 'month'];
      const analyticsperiod = validPeriods.includes(period as string) ? (period as string) : 'week';

      const cacheKey = `${normalizedA}:${normalizedB}:${analyticsperiod}`;
      const cached = comparisonCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        res.json({ success: true, data: cached.data, cached: true, cacheAge: COMPARISON_CACHE_TTL_MS - (cached.expiry - Date.now()) });
        return;
      }

      logger.info(`📊 Comparing categories: ${normalizedA} vs ${normalizedB} (period: ${analyticsperiod})`);

      const analyticsResponse = await AnalyticsDataService.getOrGenerateAnalytics(analyticsperiod as 'day' | 'week' | 'month');
      const data = (analyticsResponse as { data: { supplyInsights: unknown; priceTrends: unknown } }).data;

      const result = MarketAnalysisService.buildCategoryComparison(
        data.supplyInsights as Parameters<typeof MarketAnalysisService.buildCategoryComparison>[0],
        data.priceTrends as Parameters<typeof MarketAnalysisService.buildCategoryComparison>[1],
        normalizedA,
        normalizedB,
        analyticsperiod
      );

      comparisonCache.set(cacheKey, { data: result, expiry: Date.now() + COMPARISON_CACHE_TTL_MS });

      res.json({ success: true, data: result, cached: false });
    } catch (error) {
      logger.error('❌ Failed to compare categories:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Get top rising/falling categories (shape+weight+clarity+color) for a configurable number of days
   * GET /analytics/price-trends?days=7|14|30
   */
  static async getPriceTrendsForPeriod(req: Request, res: Response): Promise<void> {
    try {
      const { days = '7' } = req.query;
      const daysNum = Math.min(Math.max(parseInt(days as string, 10) || 7, 1), 90);
      const limit = 15;
      const cacheKey = `price-trends-cat:${daysNum}`;

      const cached = priceTrendsCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        res.json({ success: true, ...(cached.data as object), cached: true });
        return;
      }

      logger.info(`📊 Getting category price trends for ${daysNum} days`);
      const result = await MarketAnalysisService.getTopCategoryPriceTrends(daysNum, limit);

      priceTrendsCache.set(cacheKey, { data: result, expiry: Date.now() + PRICE_TRENDS_CACHE_TTL_MS });
      res.json({ success: true, ...result, cached: false });
    } catch (error) {
      logger.error('❌ Failed to get price trends:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Get top categories worth/not worth producing based on demand and price analysis
   * GET /analytics/supply-opportunities?days=7|14|30
   */
  static async getCategorySupplyOpportunities(req: Request, res: Response): Promise<void> {
    try {
      const { days = '7' } = req.query;
      const daysNum = Math.min(Math.max(parseInt(days as string, 10) || 7, 1), 30);
      const cacheKey = `supply-opps:${daysNum}`;

      const cached = supplyOppsCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        res.json({ success: true, data: cached.data, cached: true });
        return;
      }

      logger.info(`📊 Getting category supply opportunities for ${daysNum} days`);
      const result = await MarketAnalysisService.getTopCategorySupplyInsights(daysNum, 15);

      supplyOppsCache.set(cacheKey, { data: result, expiry: Date.now() + PRICE_TRENDS_CACHE_TTL_MS });
      res.json({ success: true, data: result, cached: false });
    } catch (error) {
      logger.error('❌ Failed to get supply opportunities:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Get distinct values available in ProductCategoryStats (for populating dropdowns)
   * GET /analytics/category-options
   */
  static async getCategoryOptions(_req: Request, res: Response): Promise<void> {
    try {
      if (categoryOptionsCache && categoryOptionsCache.expiry > Date.now()) {
        res.json({ success: true, data: categoryOptionsCache.data, cached: true });
        return;
      }

      const data = await MarketAnalysisService.getCategoryOptions();
      categoryOptionsCache = { data, expiry: Date.now() + CATEGORY_OPTIONS_CACHE_TTL_MS };
      res.json({ success: true, data, cached: false });
    } catch (error) {
      logger.error('❌ Failed to get category options:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Compare two full categories (shape + weight + clarity + color) head-to-head
   * GET /analytics/compare-categories?shapeA=&weightA=&clarityA=&colorA=&shapeB=&weightB=&clarityB=&colorB=&days=7
   */
  static async compareTwoCategories(req: Request, res: Response): Promise<void> {
    try {
      const { shapeA, weightA, clarityA, colorA, shapeB, weightB, clarityB, colorB, days = '7' } = req.query as Record<string, string>;

      if (!shapeA || !weightA || !clarityA || !colorA || !shapeB || !weightB || !clarityB || !colorB) {
        res.status(400).json({ success: false, error: 'All category fields required: shapeA, weightA, clarityA, colorA, shapeB, weightB, clarityB, colorB' });
        return;
      }

      const daysNum = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);
      const cacheKey = `full-comp:${shapeA}|${weightA}|${clarityA}|${colorA}:${shapeB}|${weightB}|${clarityB}|${colorB}:${daysNum}`;

      const cached = fullCompCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        res.json({ success: true, data: cached.data, cached: true });
        return;
      }

      const result = await MarketAnalysisService.compareTwoCategories(
        { shape: shapeA, weight: weightA, clarity: clarityA, color: colorA },
        { shape: shapeB, weight: weightB, clarity: clarityB, color: colorB },
        daysNum
      );

      fullCompCache.set(cacheKey, { data: result, expiry: Date.now() + COMPARISON_CACHE_TTL_MS });
      res.json({ success: true, data: result, cached: false });
    } catch (error) {
      logger.error('❌ Failed to compare categories:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Recalculate analytics for all periods
   */
  static async recalculate(req: Request, res: Response): Promise<void> {
    try {
      logger.info('🔄 Starting analytics recalculation...');

      const startTime = Date.now();
      const results = [];

      // Recalculate analytics for all periods
      const periods = ['day', 'week', 'month'];

      for (const period of periods) {
        try {
          const periodStartTime = Date.now();

          // Recalculate and save to database
          await AnalyticsDataService.recalculateAnalytics(period as 'day' | 'week' | 'month');

          const periodDuration = Date.now() - periodStartTime;

          results.push({
            period,
            success: true,
            message: `Analytics recalculated and saved to database`,
            duration: `${periodDuration}ms`
          });

          logger.info(`✅ ${period} analytics recalculated in ${periodDuration}ms`);
        } catch (periodError) {
          results.push({
            period,
            success: false,
            message: periodError instanceof Error ? periodError.message : 'Unknown error'
          });

          logger.error(`❌ Failed to recalculate ${period} analytics:`, periodError);
        }
      }

      const totalDuration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Market overview recalculated and saved to database. ${successCount}/${results.length} periods updated.`,
        results,
        duration: `${totalDuration}ms`,
        timestamp: new Date().toISOString(),
        savedToDatabase: true
      });

    } catch (error) {
      logger.error('❌ Recalculation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to recalculate market overview',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
