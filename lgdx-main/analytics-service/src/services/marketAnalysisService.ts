import { Product } from '../models/Product';
import { ProductCategoryStats } from '../models/ProductCategoryStats';
import { 
  MarketOverviewData, 
  DemandData, 
  SupplyInsightsData, 
  PriceTrendsData,
  SupplyOpportunity,
  ProfitabilityTrend,
  SupplyInsightsMarketTrends,
  SupplyInsightsCompetitiveAnalysis,
  SupplyInsightsPredictive,
  ShapeStats, 
  WeightStats, 
  PriceSegment,
  DemandStats,
  CategoryComparisonShape,
  ComparisonVerdict,
  CategoryPriceTrend,
  CategoryPriceTrendsResult,
  CategorySupplyOpportunity,
  CategorySupplyInsightsResult,
  CategorySpec,
  CategoryComparisonSide,
  CategoryComparisonFullResult,
  CategoryOptions
} from '../models/AnalyticsData';
import { logger } from '../utils/logger';
import { 
  MAIN_SHAPES, 
  DB_LIMITS, 
  CONFIDENCE_VALUES, 
  DEMAND_CONCENTRATION, 
  CONCENTRATION_PENALTIES,
  TIME_INTERVALS,
  TREND_THRESHOLDS,
  DATA_FRESHNESS
} from '../utils/constants';

interface CertificateInPeriod {
  _id: string;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  avgPricePerCertificate: number;
}

/**
 * Unified Market Analysis Service
 * Combines all analytics functionality into a single, optimized service
 */
export class MarketAnalysisService {
  /**
   * Generate complete analytics data for any period
   */
  static async generateCompleteAnalytics(
    startDate: Date, 
    endDate: Date
  ): Promise<{
    marketOverview: MarketOverviewData;
    demandAnalysis: DemandData;
    supplyInsights: SupplyInsightsData;
    priceTrends: PriceTrendsData;
  }> {
    try {
      logger.info(`📊 Generating complete analytics from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Validate data freshness before proceeding
      await this.validateDataFreshness();

      // Generate market data in parallel
      const [marketOverview, demandAnalysis, priceTrends] = await Promise.all([
        this.generateMarketOverview(),
        this.generateDemandAnalysis(startDate, endDate),
        this.generatePriceTrends()
      ]);

      // Build supply insights from market + demand + price trends (seller-focused)
      const supplyInsights = this.buildSupplyInsights(marketOverview, demandAnalysis, priceTrends);

      return {
        marketOverview,
        demandAnalysis,
        supplyInsights,
        priceTrends
      };
    } catch (error) {
      logger.error('❌ Error generating complete analytics:', error);
      throw error;
    }
  }

  /**
   * Generate market overview data
   */
  private static async generateMarketOverview(): Promise<MarketOverviewData> {
    try {
      logger.info('📊 Generating market overview...');

      // Get total products count
      const totalProducts = await Product.countDocuments({
        status: 'available',
        onDeal: { $ne: true }
      });

      // Get shape statistics
      const shapeStats = await this.getShapeStatistics();
      
      // Get weight statistics
      const weightStats = await this.getWeightStatistics();
      
      // Get price segments
      const priceSegments = await this.getPriceSegments();
      
      // Get new arrivals
      const newArrivals = await this.getNewArrivals();
      
      // Get price dynamics
      const priceDynamics = await this.getPriceDynamics();

      return {
        totalProducts,
        shapeStats,
        weightStats,
        priceSegments,
        newArrivals,
        priceDynamics
      };
    } catch (error) {
      logger.error('❌ Error generating market overview:', error);
      throw error;
    }
  }

  /**
   * Generate demand analysis data using optimized aggregation with detailed logging
   */
  private static async generateDemandAnalysis(startDate: Date, endDate: Date): Promise<DemandData> {
    try {
      logger.info(`📊 Generating demand analysis for period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // Get all certificates that existed during the period
      const certificatesInPeriod = await this.getCertificatesInPeriod(startDate, endDate);
      logger.info(`📋 Certificates in period: ${certificatesInPeriod.length} total`);
      
      // Get currently active certificates
      const currentActiveCerts = await this.getCurrentActiveCertificates();
      logger.info(`📋 Currently active certificates: ${currentActiveCerts.size} total`);
      
      // Log sample certificates for debugging
      if (certificatesInPeriod.length > 0) {
        const sampleCerts = certificatesInPeriod.slice(0, 5).map(cert => cert._id);
        logger.info(`📋 Sample certificates in period: [${sampleCerts.join(', ')}]`);
      }
      
      if (currentActiveCerts.size > 0) {
        const sampleActiveCerts = Array.from(currentActiveCerts).slice(0, 5);
        logger.info(`📋 Sample currently active certificates: [${sampleActiveCerts.join(', ')}]`);
      }
      
      // Calculate disappeared certificates (sold)
      const disappearedCerts = certificatesInPeriod.filter(cert =>
        !currentActiveCerts.has(cert._id)
      );

      logger.info(`📊 ANALYSIS RESULTS:`);
      logger.info(`📊 - Certificates in period: ${certificatesInPeriod.length}`);
      logger.info(`📊 - Currently active: ${currentActiveCerts.size}`);
      logger.info(`📊 - Disappeared (sold): ${disappearedCerts.length}`);
      
      // Log detailed breakdown for day analysis
      if (this.isDayAnalysis(startDate, endDate)) {
        await this.logDetailedDayAnalysis(certificatesInPeriod, currentActiveCerts, disappearedCerts, startDate);
      }

      // Group by categories and calculate demand metrics
      const demandCategories = this.calculateDemandCategories(disappearedCerts, endDate);
      
      // Calculate confidence based on sample size
      const salesConfidence = this.calculateSalesConfidence(demandCategories, disappearedCerts.length);

      // Group by dimensions
      const demandByShape = this.groupByDimension(demandCategories, 'shape') as Array<{ shape: string; disappeared: number; }>;
      const demandByWeight = this.groupByDimension(demandCategories, 'weight') as Array<{ weight: string; disappeared: number; }>;
      const demandByClarity = this.groupByDimension(demandCategories, 'clarity') as Array<{ clarity: string; disappeared: number; }>;
      const demandByColor = this.groupByDimension(demandCategories, 'color') as Array<{ color: string; disappeared: number; }>;

      return {
        totalDisappeared: disappearedCerts.length,
        totalReappeared: 0, // Not applicable with current approach
        salesConfidence,
        topDemandCategories: demandCategories.slice(0, 10),
        categories: demandCategories,
        demandByShape,
        demandByWeight,
        demandByClarity,
        demandByColor
      };
    } catch (error) {
      logger.error('❌ Error generating demand analysis:', error);
      throw error;
    }
  }

  /**
   * Build supply insights from market overview, demand and price trends (seller-focused: what to produce, profitability, trends)
   */
  private static buildSupplyInsights(
    marketOverview: MarketOverviewData,
    demandAnalysis: DemandData,
    priceTrends: PriceTrendsData
  ): SupplyInsightsData {
    try {
      logger.info('📊 Building supply insights for sellers...');

      const totalProducts = marketOverview.totalProducts || 0;
      const shapeStats = marketOverview.shapeStats || [];
      const priceDynamics = priceTrends?.priceDynamics || [];
      const demandByShape = demandAnalysis.demandByShape || [];
      const totalDisappeared = demandAnalysis.totalDisappeared || 0;

      const productionOpportunities: SupplyOpportunity[] = shapeStats.map(shapeStat => {
        const demandForShape = demandByShape.find(d => d.shape === shapeStat._id);
        const disappeared = demandForShape?.disappeared || 0;
        const demandIntensity = totalProducts > 0 && totalDisappeared > 0
          ? Math.min(100, (disappeared / totalDisappeared) * 100 * (totalDisappeared / Math.max(totalProducts / 1000, 1)))
          : 0;
        const marketShare = totalProducts > 0 ? (shapeStat.count / totalProducts) * 100 : 0;
        const supplyDemandRatio = disappeared > 0 ? shapeStat.count / disappeared : shapeStat.count;
        const priceInfo = priceDynamics.find(p => p.shape === shapeStat._id);
        const growthRate = priceInfo?.priceChangePercent ?? 0;
        const averagePrice = priceInfo?.avgPriceLast7Days ?? 0;

        const recommendation: SupplyOpportunity['recommendation'] =
          supplyDemandRatio < 0.5 ? 'undersupplied' : supplyDemandRatio > 2.5 ? 'oversupplied' : 'balanced';
        const competitionLevel: SupplyOpportunity['competitionLevel'] =
          marketShare >= 35 ? 'high' : marketShare >= 15 ? 'medium' : 'low';
        const trendDirection: SupplyOpportunity['trendDirection'] =
          growthRate > TREND_THRESHOLDS.RISING ? 'growing' : growthRate < TREND_THRESHOLDS.DECLINING ? 'declining' : 'stable';

        let profitPotential: SupplyOpportunity['profitPotential'] = 'medium';
        const score = (demandIntensity / 25) + (growthRate > 0 ? growthRate / 5 : 0) + (averagePrice > 800 ? 1 : 0);
        if (score >= 4 || (demandIntensity > 60 && growthRate > 10)) profitPotential = 'very_high';
        else if (score >= 2.5 || demandIntensity > 40) profitPotential = 'high';
        else if (score < 1) profitPotential = 'low';

        const marketGap = Math.max(0, disappeared - shapeStat.count);
        const recommendationText = recommendation === 'undersupplied'
          ? `High demand for ${shapeStat._id} (${demandIntensity.toFixed(0)}% intensity). Increase production to capture sales.`
          : recommendation === 'oversupplied'
            ? `${shapeStat._id} market is well supplied. Consider focusing on higher-demand segments.`
            : `${shapeStat._id} is balanced. Monitor demand and adjust production gradually.`;

        return {
          shape: shapeStat._id,
          count: shapeStat.count,
          percentage: Math.round(marketShare * 10) / 10,
          recommendation,
          currentSupply: `${shapeStat.count.toLocaleString()} units`,
          recommendationText,
          marketGap,
          profitPotential,
          trendDirection,
          demandIntensity: Math.round(Math.min(100, demandIntensity)),
          competitionLevel,
          marketShare: Math.round(marketShare * 10) / 10,
          averagePrice: Math.round(averagePrice * 100) / 100,
          priceVolatility: 0,
          growthRate: Math.round(growthRate * 10) / 10
        };
      }).sort((a, b) => {
        const order = { very_high: 4, high: 3, medium: 2, low: 1 };
        return (order[b.profitPotential!] ?? 0) - (order[a.profitPotential!] ?? 0);
      });

      const profitabilityAnalysis: ProfitabilityTrend[] = priceDynamics.map(pd => {
        const shapeStat = shapeStats.find(s => s._id === pd.shape);
        const demandForShape = demandByShape.find(d => d.shape === pd.shape);
        const supply = shapeStat?.count ?? 0;
        const demand = demandForShape?.disappeared ?? 0;
        const marketShare = totalProducts > 0 && shapeStat ? (shapeStat.count / totalProducts) * 100 : 0;
        const demandStrength = totalDisappeared > 0 && demandForShape
          ? Math.min(100, (demandForShape.disappeared / totalDisappeared) * 100 * 2)
          : 0;
        const supplyDemandRatio = demand > 0 ? supply / demand : supply;
        const priceStability = Math.max(0, 100 - Math.abs(pd.priceChangePercent) * 2);
        const profitability: ProfitabilityTrend['profitability'] =
          pd.priceChangePercent > TREND_THRESHOLDS.RISING ? 'rising' : pd.priceChangePercent < TREND_THRESHOLDS.DECLINING ? 'declining' : 'stable';

        let investmentRisk: ProfitabilityTrend['investmentRisk'] = 'medium';
        if (demandStrength >= 50 && priceStability >= 60 && supplyDemandRatio <= 1.5) investmentRisk = 'low';
        else if (demandStrength < 20 || priceStability < 40 || supplyDemandRatio > 3) investmentRisk = 'high';

        const competitiveAdvantage = Math.min(100, marketShare * 0.4 + demandStrength * 0.4 + priceStability * 0.2);
        const marketPosition: ProfitabilityTrend['marketPosition'] =
          marketShare >= 25 && competitiveAdvantage >= 60 ? 'leader' : competitiveAdvantage >= 45 ? 'challenger' : marketShare >= 10 ? 'follower' : 'niche';

        const recommendation = profitability === 'rising'
          ? `Strong upside: ${pd.shape} prices rising (${pd.priceChangePercent >= 0 ? '+' : ''}${pd.priceChangePercent}%). Good time to produce.`
          : profitability === 'declining'
            ? `Declining: ${pd.shape} prices down. Consider reducing exposure or diversifying.`
            : `${pd.shape} stable. Maintain production and monitor trends.`;

        return {
          shape: pd.shape,
          avgPriceLast7Days: pd.avgPriceLast7Days,
          priceChangePercent: pd.priceChangePercent,
          profitability,
          recommendation,
          marketShare: Math.round(marketShare * 10) / 10,
          demandStrength: Math.round(demandStrength),
          priceStability: Math.round(priceStability),
          investmentRisk,
          supplyDemandRatio: Math.round(supplyDemandRatio * 10) / 10,
          competitiveAdvantage: Math.round(competitiveAdvantage),
          marketPosition
        };
      }).sort((a, b) => {
        const order = { rising: 3, stable: 2, declining: 1 };
        return (order[b.profitability] - order[a.profitability]) || (b.competitiveAdvantage! - a.competitiveAdvantage!);
      });

      const risingCount = profitabilityAnalysis.filter(p => p.profitability === 'rising').length;
      const decliningCount = profitabilityAnalysis.filter(p => p.profitability === 'declining').length;
      const overallSentiment: SupplyInsightsMarketTrends['overallSentiment'] =
        risingCount > profitabilityAnalysis.length * 0.4 ? 'bullish' : decliningCount > profitabilityAnalysis.length * 0.4 ? 'bearish' : 'neutral';

      const marketVolatility = profitabilityAnalysis.length > 0
        ? Math.min(100, profitabilityAnalysis.reduce((s, p) => s + Math.abs(p.priceChangePercent), 0) / profitabilityAnalysis.length * 2)
        : 0;
      const supplyChainStability = totalProducts > 0 && totalDisappeared >= 0
        ? Math.min(100, 100 - (totalDisappeared / Math.max(totalProducts / 100, 1)))
        : 70;

      const marketTrends: SupplyInsightsMarketTrends = {
        overallSentiment,
        keyOpportunities: productionOpportunities
          .filter(o => o.profitPotential === 'high' || o.profitPotential === 'very_high')
          .slice(0, 5)
          .map(o => `${o.shape} — ${o.profitPotential} profit potential, ${o.demandIntensity}% demand intensity`),
        riskFactors: profitabilityAnalysis
          .filter(p => p.profitability === 'declining')
          .slice(0, 3)
          .map(p => `${p.shape} — declining profitability`),
        recommendedActions: overallSentiment === 'bullish'
          ? ['Expand production in high-demand shapes', 'Focus on rising-price segments', 'Capture market share in undersupplied categories']
          : overallSentiment === 'bearish'
            ? ['Reduce exposure to declining segments', 'Diversify into stable shapes', 'Monitor price trends closely']
            : ['Maintain balanced production', 'Watch for emerging opportunities', 'Keep inventory aligned with demand'],
        marketVolatility: Math.round(marketVolatility),
        supplyChainStability: Math.round(supplyChainStability)
      };

      const competitiveAnalysis: SupplyInsightsCompetitiveAnalysis = {
        marketLeaders: shapeStats
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((s, i) => ({
            shape: s._id,
            dominance: totalProducts > 0 ? Math.round((s.count / totalProducts) * 1000) / 10 : 0,
            strategy: i === 0 ? 'Volume leadership' : i === 1 ? 'Strong positioning' : 'Niche focus'
          })),
        emergingOpportunities: productionOpportunities
          .filter(o => o.recommendation === 'undersupplied' && (o.growthRate ?? 0) > 5)
          .slice(0, 3)
          .map(o => ({ shape: o.shape, potential: Math.min(100, (o.demandIntensity ?? 0) + (o.growthRate ?? 0)), timeline: '3–6 months' })),
        saturatedSegments: productionOpportunities
          .filter(o => o.recommendation === 'oversupplied')
          .slice(0, 3)
          .map(o => ({ shape: o.shape, saturation: Math.min(100, o.percentage * 2), recommendation: 'Consider reducing or repositioning' })),
        competitiveIntensity: shapeStats.length > 0
          ? Math.min(100, 100 - (shapeStats.reduce((sum, s) => sum + (s.count / totalProducts) * 100, 0) / shapeStats.length))
          : 50
      };

      const predictiveInsights: SupplyInsightsPredictive = {
        nextMonthForecast: shapeStats.slice(0, 8).map(s => {
          const demand = demandByShape.find(d => d.shape === s._id);
          const pred = demand ? Math.round(demand.disappeared * 1.1) : 0;
          return { shape: s._id, predictedDemand: pred, confidence: Math.min(85, 30 + (demand?.disappeared ?? 0) / 2) };
        }),
        seasonalTrends: shapeStats.slice(0, 5).map(s => ({ shape: s._id, seasonalFactor: 1, peakMonths: ['March', 'September', 'December'] })),
        riskAssessment: profitabilityAnalysis.slice(0, 6).map(p => ({
          shape: p.shape,
          riskLevel: p.investmentRisk!,
          factors: p.profitability === 'declining' ? ['Declining prices'] : p.demandStrength! < 30 ? ['Lower demand visibility'] : ['Stable segment']
        }))
      };

      return {
        productionOpportunities,
        profitabilityAnalysis,
        marketTrends,
        competitiveAnalysis,
        predictiveInsights
      };
    } catch (error) {
      logger.error('❌ Error building supply insights:', error);
      throw error;
    }
  }

  /**
   * Generate price trends data
   */
  private static async generatePriceTrends(): Promise<PriceTrendsData> {
    try {
      logger.info('📊 Generating price trends...');

      const newArrivals = await this.getNewArrivals();
      const priceDynamics = await this.getPriceDynamics();

      return {
        newArrivals,
        priceDynamics
      };
    } catch (error) {
      logger.error('❌ Error generating price trends:', error);
      throw error;
    }
  }

  /**
   * Get shape statistics with proper grouping
   */
  private static async getShapeStatistics(): Promise<ShapeStats[]> {
    const pipeline = [
      {
        $match: {
          status: 'available',
          onDeal: { $ne: true },
          shape: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$shape',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 as 1 | -1 }
      }
    ];

    const results = await Product.aggregate(pipeline);
    
    // Group non-main shapes as "OTHER SHAPES"
    const mainShapes = results.filter(r => 
      MAIN_SHAPES.some(mainShape => 
        mainShape.toLowerCase() === r._id.toLowerCase()
      )
    );
    const otherShapes = results.filter(r => 
      !MAIN_SHAPES.some(mainShape => 
        mainShape.toLowerCase() === r._id.toLowerCase()
      )
    );
    
    const otherCount = otherShapes.reduce((sum, shape) => sum + shape.count, 0);
    
    const finalResults = [...mainShapes];
    if (otherCount > 0) {
      finalResults.push({ _id: 'OTHER SHAPES', count: otherCount });
    }
    
    return finalResults;
  }

  /**
   * Get weight statistics grouped by ranges
   */
  private static async getWeightStatistics(): Promise<WeightStats[]> {
    const pipeline = [
      {
        $match: {
          status: 'available',
          onDeal: { $ne: true },
          carat: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $bucket: {
          groupBy: '$carat',
          boundaries: [0, 0.3, 0.6, 1, 1.4, 1.8, 2.2, 2.6, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 15, 25, 50],
          default: '50+',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ];

    const results = await Product.aggregate(pipeline);
    
    // Map to weight ranges
    const weightRanges = [
      { range: '0-0.29 ct', count: 0 },
      { range: '0.3-0.59 ct', count: 0 },
      { range: '0.6-0.99 ct', count: 0 },
      { range: '1-1.39 ct', count: 0 },
      { range: '1.4-1.79 ct', count: 0 },
      { range: '1.8-2.19 ct', count: 0 },
      { range: '2.2-2.59 ct', count: 0 },
      { range: '2.6-2.99 ct', count: 0 },
      { range: '3-3.49 ct', count: 0 },
      { range: '3.5-3.99 ct', count: 0 },
      { range: '4-4.99 ct', count: 0 },
      { range: '5-5.99 ct', count: 0 },
      { range: '6-6.99 ct', count: 0 },
      { range: '7-7.99 ct', count: 0 },
      { range: '8-8.99 ct', count: 0 },
      { range: '9-9.99 ct', count: 0 },
      { range: '10-11.99 ct', count: 0 },
      { range: '12-14.99 ct', count: 0 },
      { range: '15-24.99 ct', count: 0 },
      { range: '25-50 ct', count: 0 },
      { range: '50+ ct', count: 0 }
    ];

    // Map results to weight ranges
    results.forEach(result => {
      const bucketValue = result._id;
      const rangeMap: Record<string | number, number> = {
        0: 0, 0.3: 1, 0.6: 2, 1: 3, 1.4: 4, 1.8: 5, 2.2: 6, 2.6: 7, 3: 8,
        3.5: 9, 4: 10, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 12: 17,
        15: 18, 25: 19, 50: 20, '50+': 20
      };
      
      const rangeIndex = rangeMap[bucketValue];
      if (rangeIndex !== undefined) {
        weightRanges[rangeIndex].count = result.count;
      }
    });

    return weightRanges.filter(r => r.count > 0);
  }

  /**
   * Get price segments from ProductCategoryStats
   */
  private static async getPriceSegments(): Promise<PriceSegment[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const pipeline = [
      {
        $match: {
          date: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          "productDetails.pricePerCarat": { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $bucket: {
          groupBy: "$productDetails.pricePerCarat",
          boundaries: [0, 100, 200, 300, 500, 1000, 2000, 5000],
          default: "5000+",
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ];

    const results = await ProductCategoryStats.aggregate(pipeline);
    const totalProducts = results.reduce((sum, r) => sum + r.count, 0);

    if (totalProducts === 0) {
      return [];
    }

    // $bucket returns _id: 0, 100, 200, 300, 500, 1000, 2000, 5000, or "5000+"
    // Sum all buckets >= 500 into single $500+ segment so totals match
    const count500Plus = results
      .filter(r => (typeof r._id === 'number' && r._id >= 500) || r._id === '5000+')
      .reduce((sum, r) => sum + r.count, 0);

    const segments = [
      { range: 'Under $100', bucket: 0 },
      { range: '$100-$200', bucket: 100 },
      { range: '$200-$300', bucket: 200 },
      { range: '$300-$500', bucket: 300 },
      { range: '$500+', bucket: 500 }
    ];

    return segments.map(segment => {
      const count = segment.range === '$500+'
        ? count500Plus
        : (results.find(r => r._id === segment.bucket)?.count ?? 0);
      const percentage = totalProducts > 0 ? (count / totalProducts) * 100 : 0;
      return {
        range: segment.range,
        count,
        percentage: Math.round(percentage * 100) / 100
      };
    }).filter(segment => segment.count > 0);
  }

  /**
   * Get new arrivals data
   */
  private static async getNewArrivals(): Promise<{ last24h: number; last72h: number }> {
    const now = new Date();
    const last24h = new Date(now.getTime() - TIME_INTERVALS.LAST_24H);
    const last72h = new Date(now.getTime() - TIME_INTERVALS.LAST_72H);

    const [last24hCount, last72hCount] = await Promise.all([
      Product.countDocuments({
        createdAt: { $gte: last24h },
        status: 'available'
      }),
      Product.countDocuments({
        createdAt: { $gte: last72h },
        status: 'available'
      })
    ]);

    return {
      last24h: last24hCount,
      last72h: last72hCount
    };
  }

  /**
   * Get price dynamics for the last 7 days (delegates to the unified historical method)
   */
  private static async getPriceDynamics(): Promise<Array<{
    shape: string;
    avgPriceLast7Days: number;
    priceChangePercent: number;
    trend: 'Bullish' | 'Bearish' | 'Neutral';
  }>> {
    return this.getPriceDynamicsForDays(7);
  }


  /**
   * Get price dynamics for a configurable number of days using ProductCategoryStats
   * (historical daily snapshots — works correctly for any time window regardless of product availability status)
   */
  static async getPriceDynamicsForDays(days: number): Promise<Array<{
    shape: string;
    avgPriceLast7Days: number;
    priceChangePercent: number;
    trend: 'Bullish' | 'Bearish' | 'Neutral';
  }>> {
    const now = new Date();
    const periodMs = days * 24 * 60 * 60 * 1000;
    const currentPeriodStart = new Date(now.getTime() - periodMs);
    const previousPeriodStart = new Date(now.getTime() - periodMs * 2);

    // Use ProductCategoryStats for accurate historical price comparison.
    // avgPricePerCarat is the daily market price per shape, recorded independently of product status.
    const [currentStats, previousStats] = await Promise.all([
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: currentPeriodStart, $lte: now },
            shape: { $exists: true, $ne: null },
            avgPricePerCarat: { $exists: true, $gt: 0 }
          }
        },
        {
          $group: {
            _id: '$shape',
            avgPrice: { $avg: '$avgPricePerCarat' },
            count: { $sum: 1 }
          }
        }
      ]),
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: previousPeriodStart, $lt: currentPeriodStart },
            shape: { $exists: true, $ne: null },
            avgPricePerCarat: { $exists: true, $gt: 0 }
          }
        },
        {
          $group: {
            _id: '$shape',
            avgPrice: { $avg: '$avgPricePerCarat' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const priceDynamics = currentStats
      .filter(c => c.avgPrice > 0)
      .map(current => {
        const previous = previousStats.find(p => p._id === current._id);
        const priceChangePercent = previous && previous.avgPrice > 0
          ? ((current.avgPrice - previous.avgPrice) / previous.avgPrice) * 100
          : 0;

        const trend: 'Bullish' | 'Bearish' | 'Neutral' = priceChangePercent > TREND_THRESHOLDS.RISING
          ? 'Bullish'
          : priceChangePercent < TREND_THRESHOLDS.DECLINING
            ? 'Bearish'
            : 'Neutral';

        return {
          shape: current._id,
          avgPriceLast7Days: Math.round(current.avgPrice * 100) / 100,
          priceChangePercent: Math.round(priceChangePercent * 100) / 100,
          trend
        };
      });

    return priceDynamics.sort((a, b) => b.avgPriceLast7Days - a.avgPriceLast7Days);
  }

  /**
   * Get top rising and falling categories based on ProductCategoryStats historical snapshots
   * Returns category-level (shape+weight+clarity+color) price trends for any time window
   */
  static async getTopCategoryPriceTrends(days: number, limit: number = 15): Promise<CategoryPriceTrendsResult> {
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 86400000);
    const previousStart = new Date(now.getTime() - days * 2 * 86400000);

    const [currentAgg, previousAgg] = await Promise.all([
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: currentStart, $lte: now },
            avgPricePerCarat: { $gt: 0 },
            count: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' },
            avgPrice: { $avg: '$avgPricePerCarat' },
            avgCount: { $avg: '$count' },
            dataPoints: { $sum: 1 }
          }
        },
        { $match: { dataPoints: { $gte: 2 }, avgCount: { $gte: 1 } } }
      ]),
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: previousStart, $lt: currentStart },
            avgPricePerCarat: { $gt: 0 },
            count: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' },
            avgPrice: { $avg: '$avgPricePerCarat' },
            dataPoints: { $sum: 1 }
          }
        },
        { $match: { dataPoints: { $gte: 1 } } }
      ])
    ]);

    // Build lookup map for previous period
    const prevMap = new Map<string, number>();
    for (const p of previousAgg) {
      const key = `${p._id.shape}|${p._id.weight}|${p._id.clarity}|${p._id.color}`;
      prevMap.set(key, p.avgPrice);
    }

    const results: CategoryPriceTrend[] = [];
    for (const c of currentAgg) {
      const key = `${c._id.shape}|${c._id.weight}|${c._id.clarity}|${c._id.color}`;
      const prevPrice = prevMap.get(key);
      if (!prevPrice || prevPrice <= 0) continue;

      const priceChangePercent = ((c.avgPrice - prevPrice) / prevPrice) * 100;
      if (Math.abs(priceChangePercent) < 0.5) continue; // filter trivial noise

      results.push({
        shape: c._id.shape,
        weight: c._id.weight,
        clarity: c._id.clarity,
        color: c._id.color,
        avgPriceCurrent: Math.round(c.avgPrice * 100) / 100,
        avgPricePrevious: Math.round(prevPrice * 100) / 100,
        priceChangePercent: Math.round(priceChangePercent * 100) / 100,
        avgCount: Math.round(c.avgCount)
      });
    }

    results.sort((a, b) => b.priceChangePercent - a.priceChangePercent);

    return {
      rising: results.filter(r => r.priceChangePercent > 0).slice(0, limit),
      falling: results.filter(r => r.priceChangePercent < 0).reverse().slice(0, limit),
      days,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get top categories worth/not worth producing based on demand, supply, and price trends
   * Uses ProductCategoryStats for accurate per-category metrics
   */
  static async getTopCategorySupplyInsights(days: number = 7, limit: number = 15): Promise<CategorySupplyInsightsResult> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 86400000);
    const prevPeriodStart = new Date(periodStart.getTime() - days * 86400000);

    const [currentAgg, prevAgg] = await Promise.all([
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: periodStart, $lte: now },
            count: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' },
            avgCount: { $avg: '$count' },
            totalDisappeared: { $sum: '$disappearedProductsSinceYesterday' },
            avgPrice: { $avg: '$avgPricePerCarat' },
            dataPoints: { $sum: 1 }
          }
        },
        { $match: { dataPoints: { $gte: 2 }, avgCount: { $gte: 1 } } }
      ]),
      ProductCategoryStats.aggregate([
        {
          $match: {
            date: { $gte: prevPeriodStart, $lt: periodStart },
            count: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' },
            avgPrice: { $avg: '$avgPricePerCarat' }
          }
        }
      ])
    ]);

    const prevMap = new Map<string, number>();
    for (const p of prevAgg) {
      const key = `${p._id.shape}|${p._id.weight}|${p._id.clarity}|${p._id.color}`;
      prevMap.set(key, p.avgPrice);
    }

    const categories: CategorySupplyOpportunity[] = currentAgg.map(s => {
      const key = `${s._id.shape}|${s._id.weight}|${s._id.clarity}|${s._id.color}`;
      const prevPrice = prevMap.get(key) || 0;
      const priceChangePercent = prevPrice > 0
        ? Math.round(((s.avgPrice - prevPrice) / prevPrice) * 10000) / 100
        : 0;

      const avgCount = s.avgCount;
      const totalDisappeared: number = s.totalDisappeared;
      const demandSupplyRatio = Math.round((totalDisappeared / Math.max(avgCount, 1)) * 100) / 100;

      const reasons: string[] = [];
      let score = 0;

      // Demand vs supply
      if (demandSupplyRatio >= 1.0) { score += 4; reasons.push('demand_exceeds_supply'); }
      else if (demandSupplyRatio >= 0.5) { score += 3; reasons.push('high_demand'); }
      else if (demandSupplyRatio >= 0.2) { score += 1; reasons.push('moderate_demand'); }
      else if (demandSupplyRatio < 0.05 && avgCount > 5) { score -= 3; reasons.push('very_low_demand'); }
      else if (totalDisappeared === 0 && avgCount > 3) { score -= 4; reasons.push('no_demand'); }

      // Price trend
      if (priceChangePercent > TREND_THRESHOLDS.RISING) { score += 2; reasons.push('prices_rising'); }
      else if (priceChangePercent > 1) { score += 1; }
      else if (priceChangePercent < TREND_THRESHOLDS.DECLINING) { score -= 2; reasons.push('prices_falling'); }

      // Supply saturation
      if (avgCount > 100) { score -= 2; reasons.push('market_saturated'); }
      else if (avgCount > 50) { score -= 1; }
      else if (avgCount < 5 && totalDisappeared > 0) { score += 1; reasons.push('scarce_supply'); }

      return {
        shape: s._id.shape,
        weight: s._id.weight,
        clarity: s._id.clarity,
        color: s._id.color,
        avgCount: Math.round(avgCount),
        totalDisappeared,
        avgPrice: Math.round(s.avgPrice * 100) / 100,
        priceChangePercent,
        demandSupplyRatio,
        score,
        reasons: reasons.slice(0, 3)
      };
    });

    return {
      worthProducing: categories
        .filter(c => c.score >= 2 && c.totalDisappeared >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
      notWorthProducing: categories
        .filter(c => c.score <= -2 || (c.totalDisappeared === 0 && c.avgCount > 5))
        .sort((a, b) => a.score - b.score)
        .slice(0, limit),
      period: days,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get distinct values available in ProductCategoryStats for each field
   */
  static async getCategoryOptions(): Promise<CategoryOptions> {
    const [shapes, weights, clarities, colors] = await Promise.all([
      ProductCategoryStats.distinct('shape', { shape: { $exists: true, $ne: null } }),
      ProductCategoryStats.distinct('weight', { weight: { $exists: true, $ne: null } }),
      ProductCategoryStats.distinct('clarity', { clarity: { $exists: true, $ne: null } }),
      ProductCategoryStats.distinct('color', { color: { $exists: true, $ne: null } })
    ]);

    const sortWeight = (a: string, b: string) => {
      const aNum = parseFloat(a.split('-')[0].replace('+', ''));
      const bNum = parseFloat(b.split('-')[0].replace('+', ''));
      return (isNaN(aNum) ? 999 : aNum) - (isNaN(bNum) ? 999 : bNum);
    };

    const claritySortOrder = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];
    const sortClarity = (a: string, b: string) => {
      const ai = claritySortOrder.indexOf(a);
      const bi = claritySortOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    };

    return {
      shapes: (shapes as string[]).filter(Boolean).sort(),
      weights: (weights as string[]).filter(Boolean).sort(sortWeight),
      clarities: (clarities as string[]).filter(Boolean).sort(sortClarity),
      colors: (colors as string[]).filter(Boolean).sort()
    };
  }

  /**
   * Compare two full categories (shape + weight + clarity + color) head-to-head
   */
  static async compareTwoCategories(
    catA: CategorySpec,
    catB: CategorySpec,
    days: number
  ): Promise<CategoryComparisonFullResult> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 86400000);
    const prevPeriodStart = new Date(periodStart.getTime() - days * 86400000);

    const computeSide = async (cat: CategorySpec): Promise<CategoryComparisonSide> => {
      const [current, prev] = await Promise.all([
        ProductCategoryStats.aggregate([
          {
            $match: {
              date: { $gte: periodStart, $lte: now },
              shape: cat.shape,
              weight: cat.weight,
              clarity: cat.clarity,
              color: cat.color
            }
          },
          {
            $group: {
              _id: null,
              avgCount: { $avg: '$count' },
              totalDisappeared: { $sum: '$disappearedProductsSinceYesterday' },
              avgPrice: { $avg: '$avgPricePerCarat' },
              dataPoints: { $sum: 1 }
            }
          }
        ]),
        ProductCategoryStats.aggregate([
          {
            $match: {
              date: { $gte: prevPeriodStart, $lt: periodStart },
              shape: cat.shape,
              weight: cat.weight,
              clarity: cat.clarity,
              color: cat.color
            }
          },
          {
            $group: {
              _id: null,
              avgPrice: { $avg: '$avgPricePerCarat' }
            }
          }
        ])
      ]);

      const c = current[0] ?? { avgCount: 0, totalDisappeared: 0, avgPrice: 0, dataPoints: 0 };
      const p = prev[0] ?? { avgPrice: 0 };

      const priceChangePercent = c.avgPrice > 0 && p.avgPrice > 0
        ? Math.round(((c.avgPrice - p.avgPrice) / p.avgPrice) * 10000) / 100
        : 0;

      const avgCount = c.avgCount;
      const totalDisappeared: number = c.totalDisappeared;
      const demandSupplyRatio = Math.round((totalDisappeared / Math.max(avgCount, 1)) * 100) / 100;

      const reasons: string[] = [];
      let score = 0;

      if (demandSupplyRatio >= 1.0) { score += 4; reasons.push('demand_exceeds_supply'); }
      else if (demandSupplyRatio >= 0.5) { score += 3; reasons.push('high_demand'); }
      else if (demandSupplyRatio >= 0.2) { score += 1; reasons.push('moderate_demand'); }
      else if (demandSupplyRatio < 0.05 && avgCount > 5) { score -= 3; reasons.push('very_low_demand'); }
      else if (totalDisappeared === 0 && avgCount > 3) { score -= 4; reasons.push('no_demand'); }

      if (priceChangePercent > TREND_THRESHOLDS.RISING) { score += 2; reasons.push('prices_rising'); }
      else if (priceChangePercent > 1) { score += 1; }
      else if (priceChangePercent < TREND_THRESHOLDS.DECLINING) { score -= 2; reasons.push('prices_falling'); }

      if (avgCount > 100) { score -= 2; reasons.push('market_saturated'); }
      else if (avgCount > 50) { score -= 1; }
      else if (avgCount < 5 && totalDisappeared > 0) { score += 1; reasons.push('scarce_supply'); }

      return {
        ...cat,
        avgCount: Math.round(avgCount),
        totalDisappeared,
        avgPrice: Math.round(c.avgPrice * 100) / 100,
        priceChangePercent,
        demandSupplyRatio,
        score,
        reasons: reasons.slice(0, 3),
        dataPoints: c.dataPoints
      };
    };

    const [sideA, sideB] = await Promise.all([computeSide(catA), computeSide(catB)]);

    const diff = sideA.score - sideB.score;
    const winner: 'A' | 'B' | 'tie' = Math.abs(diff) < 1 ? 'tie' : diff > 0 ? 'A' : 'B';
    const winnerSide = winner === 'A' ? sideA : sideB;
    const loserSide = winner === 'A' ? sideB : sideA;
    const winnerLabel = winner === 'tie' ? '' : `${winnerSide.shape} ${winnerSide.weight}ct ${winnerSide.clarity} ${winnerSide.color}`;

    const verdictReasons: string[] = [];
    if (winner !== 'tie') {
      if (winnerSide.demandSupplyRatio > loserSide.demandSupplyRatio + 0.2) verdictReasons.push('higher_demand_ratio');
      if (winnerSide.priceChangePercent > loserSide.priceChangePercent + 1) verdictReasons.push('better_price_trend');
      if (winnerSide.totalDisappeared > loserSide.totalDisappeared * 1.3 + 1) verdictReasons.push('more_sales');
      if (winnerSide.avgCount < loserSide.avgCount * 0.7 && winnerSide.totalDisappeared > 0) verdictReasons.push('less_competition');
      if (verdictReasons.length === 0) verdictReasons.push('overall_better_score');
    }

    return {
      catA: sideA,
      catB: sideB,
      verdict: { winner, winnerLabel, scoreA: sideA.score, scoreB: sideB.score, reasons: verdictReasons },
      days,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Build a side-by-side comparison of two shapes from already-computed analytics data
   */
  static buildCategoryComparison(
    supplyInsights: SupplyInsightsData,
    priceTrends: PriceTrendsData,
    shapeA: string,
    shapeB: string,
    period: string
  ): {
    shapeA: CategoryComparisonShape;
    shapeB: CategoryComparisonShape;
    verdict: ComparisonVerdict;
    period: string;
    generatedAt: string;
  } {
    const extractShapeData = (shape: string): CategoryComparisonShape => {
      const normalizedShape = shape.toUpperCase();
      const opp = (supplyInsights.productionOpportunities || []).find(
        o => o.shape.toUpperCase() === normalizedShape
      );
      const profit = (supplyInsights.profitabilityAnalysis || []).find(
        p => p.shape.toUpperCase() === normalizedShape
      );
      const priceDynamic = (priceTrends.priceDynamics || []).find(
        p => p.shape.toUpperCase() === normalizedShape
      );

      return {
        shape: normalizedShape,
        profitPotential: opp?.profitPotential ?? 'medium',
        recommendation: opp?.recommendation ?? 'balanced',
        priceTrend7d: priceDynamic?.priceChangePercent ?? profit?.priceChangePercent ?? 0,
        trendDirection: opp?.trendDirection ?? 'stable',
        avgPrice: priceDynamic?.avgPriceLast7Days ?? profit?.avgPriceLast7Days ?? 0,
        demandIntensity: opp?.demandIntensity ?? 0,
        competitionLevel: opp?.competitionLevel ?? 'medium',
        marketShare: opp?.marketShare ?? profit?.marketShare ?? 0,
        supplyDemandRatio: profit?.supplyDemandRatio ?? 1
      };
    };

    const dataA = extractShapeData(shapeA);
    const dataB = extractShapeData(shapeB);

    const potentialScores: Record<string, number> = { very_high: 4, high: 3, medium: 2, low: 1 };
    const compLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };

    const scoreShape = (data: CategoryComparisonShape): number => {
      let score = potentialScores[data.profitPotential] ?? 2;
      if (data.recommendation === 'undersupplied') score += 2;
      if (data.recommendation === 'oversupplied') score -= 2;
      if (data.priceTrend7d > TREND_THRESHOLDS.RISING) score += 2;
      else if (data.priceTrend7d > 0) score += 1;
      else if (data.priceTrend7d < TREND_THRESHOLDS.DECLINING) score -= 2;
      else if (data.priceTrend7d < 0) score -= 1;
      if (data.demandIntensity > 50) score += 1;
      if (data.competitionLevel === 'low') score += 1;
      if (data.competitionLevel === 'high') score -= 1;
      return score;
    };

    const scoreA = scoreShape(dataA);
    const scoreB = scoreShape(dataB);
    const scoreDiff = scoreA - scoreB;
    const winner: 'A' | 'B' | 'tie' = scoreDiff > 1 ? 'A' : scoreDiff < -1 ? 'B' : 'tie';
    const winnerData = winner === 'A' ? dataA : winner === 'B' ? dataB : null;
    const loserData = winner === 'A' ? dataB : winner === 'B' ? dataA : null;

    const reasons: string[] = [];

    if (winner !== 'tie' && winnerData && loserData) {
      if ((potentialScores[winnerData.profitPotential] ?? 0) > (potentialScores[loserData.profitPotential] ?? 0)) {
        reasons.push('higher_profit_potential');
      }
      if (winnerData.recommendation === 'undersupplied' && loserData.recommendation !== 'undersupplied') {
        reasons.push('market_undersupplied');
      }
      if (loserData.recommendation === 'oversupplied') {
        reasons.push('competitor_oversupplied');
      }
      if (winnerData.priceTrend7d > 0 && loserData.priceTrend7d <= 0) {
        reasons.push('prices_rising');
      }
      if (winnerData.demandIntensity > loserData.demandIntensity + 10) {
        reasons.push('higher_demand');
      }
      if ((compLevels[winnerData.competitionLevel] ?? 2) < (compLevels[loserData.competitionLevel] ?? 2)) {
        reasons.push('less_competition');
      }
    } else {
      reasons.push('similar_opportunity');
    }

    return {
      shapeA: dataA,
      shapeB: dataB,
      verdict: {
        winner,
        winnerShape: winner === 'A' ? dataA.shape : winner === 'B' ? dataB.shape : '',
        scoreA,
        scoreB,
        reasons: reasons.slice(0, 3)
      },
      period,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get certificates that existed during the period
   */
  private static async getCertificatesInPeriod(startDate: Date, endDate: Date): Promise<CertificateInPeriod[]> {
    const pipeline = [
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          "productDetails.certificateNumber": { $exists: true, $ne: null }
        }
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $group: {
          _id: "$productDetails.certificateNumber",
          shape: { $first: "$shape" },
          weight: { $first: "$weight" },
          clarity: { $first: "$clarity" },
          color: { $first: "$color" },
          avgPricePerCertificate: { $avg: "$productDetails.pricePerCarat" }
        }
      }
    ];

    return await ProductCategoryStats.aggregate(pipeline);
  }

  /**
   * Get currently active certificates
   */
  private static async getCurrentActiveCertificates(): Promise<Set<string>> {
    const activeCerts = await Product.find({
      status: 'available',
      onDeal: { $ne: true },
      certificateNumber: { $exists: true, $ne: null }
    }).select('certificateNumber').lean();

    return new Set(
      activeCerts.map(p => p.certificateNumber).filter(Boolean)
    );
  }

  /**
   * Calculate demand categories from disappeared certificates
   */
  private static calculateDemandCategories(disappearedCerts: CertificateInPeriod[], endDate: Date): DemandStats[] {
    const categoryMap = new Map();

    for (const cert of disappearedCerts) {
      const key = `${cert.shape}|${cert.weight}|${cert.clarity}|${cert.color}`;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          shape: cert.shape,
          weight: cert.weight,
          clarity: cert.clarity,
          color: cert.color,
          disappearedProductsSinceYesterday: 0,
          avgPricePerCarat_disappearedProducts: 0,
          certificateNumbers: []
        });
      }

      const category = categoryMap.get(key);
      category.disappearedProductsSinceYesterday += 1;
      category.certificateNumbers.push(cert._id);
    }

    // Calculate average prices for each category
    for (const category of categoryMap.values()) {
      const prices = disappearedCerts
        .filter(cert =>
          cert.shape === category.shape &&
          cert.weight === category.weight &&
          cert.clarity === category.clarity &&
          cert.color === category.color
        )
        .map(cert => cert.avgPricePerCertificate)
        .filter(price => price && !isNaN(price));

      if (prices.length > 0) {
        category.avgPricePerCarat_disappearedProducts = Math.round(
          prices.reduce((sum, price) => sum + price, 0) / prices.length * 100
        ) / 100;
      }
    }

    return Array.from(categoryMap.values())
      .sort((a, b) => b.disappearedProductsSinceYesterday - a.disappearedProductsSinceYesterday)
      .map(cat => ({
        ...cat,
        medianPricePerCarat_disappearedProducts: cat.avgPricePerCarat_disappearedProducts,
        date: endDate.toISOString().split('T')[0]
      }));
  }

  /**
   * Calculate sales confidence based on sample size
   */
  private static calculateSalesConfidence(demandCategories: DemandStats[], totalDisappeared: number): number {
    let confidence = 0.5;
    
    // Базовая confidence на основе количества исчезнувших продуктов
    if (totalDisappeared >= 100) {
      confidence = CONFIDENCE_VALUES.EXCELLENT;
    } else if (totalDisappeared >= 50) {
      confidence = CONFIDENCE_VALUES.GOOD;
    } else if (totalDisappeared >= 20) {
      confidence = CONFIDENCE_VALUES.MODERATE;
    } else if (totalDisappeared >= 10) {
      confidence = CONFIDENCE_VALUES.LOW;
    } else if (totalDisappeared > 0) {
      confidence = CONFIDENCE_VALUES.POOR;
    } else {
      confidence = CONFIDENCE_VALUES.NONE;
    }
    
    // Коррекция на основе концентрации спроса
    if (demandCategories.length > 0 && totalDisappeared > 0) {
      const disappearedCounts = demandCategories.map(c => c.disappearedProductsSinceYesterday);
      const maxCategory = Math.max(...disappearedCounts);
      
      if (maxCategory > 0 && totalDisappeared > 0) {
        const concentration = maxCategory / totalDisappeared;
        
        // Снижаем confidence если спрос слишком сконцентрирован в одной категории
        if (concentration > DEMAND_CONCENTRATION.HIGH) {
          confidence *= CONCENTRATION_PENALTIES.HIGH;
        } else if (concentration > DEMAND_CONCENTRATION.MODERATE) {
          confidence *= CONCENTRATION_PENALTIES.MODERATE;
        }
      }
    }
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  /**
   * Group demand categories by dimension
   */
  private static groupByDimension(
    demandCategories: DemandStats[], 
    dimension: 'shape' | 'weight' | 'clarity' | 'color'
  ): Array<{ [key: string]: string | number }> {
    const grouped = new Map<string, number>();
    
    for (const category of demandCategories) {
      const key = category[dimension];
      grouped.set(key, (grouped.get(key) || 0) + category.disappearedProductsSinceYesterday);
    }

    return Array.from(grouped.entries())
      .map(([key, disappeared]) => ({ [dimension]: key, disappeared }))
      .sort((a, b) => b.disappeared - a.disappeared);
  }

  /**
   * Check if this is a day analysis (period = 1 day)
   */
  private static isDayAnalysis(startDate: Date, endDate: Date): boolean {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1;
  }

  /**
   * Log detailed analysis for day calculations
   */
  private static async logDetailedDayAnalysis(
    certificatesInPeriod: CertificateInPeriod[], 
    currentActiveCerts: Set<string>, 
    disappearedCerts: CertificateInPeriod[], 
    startDate: Date
  ): Promise<void> {
    try {
      logger.info(`🔍 DETAILED DAY ANALYSIS for ${startDate.toISOString().split('T')[0]}:`);
      
      // Get yesterday's certificates for comparison
      const yesterday = new Date(startDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayCerts = await this.getCertificatesInPeriod(yesterday, yesterday);
      
      logger.info(`📅 Yesterday's certificates: ${yesterdayCerts.length}`);
      
      // Create sets for comparison
      const yesterdayCertSet = new Set(yesterdayCerts.map(cert => cert._id));
      const periodCertSet = new Set(certificatesInPeriod.map(cert => cert._id));
      
      // Find certificates that were in yesterday but not in today
      const disappearedFromYesterday = yesterdayCerts.filter(cert => 
        !currentActiveCerts.has(cert._id)
      );
      
      logger.info(`📊 BREAKDOWN:`);
      logger.info(`📊 - Certificates yesterday: ${yesterdayCerts.length}`);
      logger.info(`📊 - Certificates in period: ${certificatesInPeriod.length}`);
      logger.info(`📊 - Currently active: ${currentActiveCerts.size}`);
      logger.info(`📊 - Disappeared from yesterday: ${disappearedFromYesterday.length}`);
      logger.info(`📊 - Disappeared from period: ${disappearedCerts.length}`);
      
      // Log sample disappeared certificates
      if (disappearedCerts.length > 0) {
        const sampleDisappeared = disappearedCerts.slice(0, 10).map(cert => cert._id);
        logger.info(`📋 Sample disappeared certificates: [${sampleDisappeared.join(', ')}]`);
        
        // Log certificates with their details
        logger.info(`📋 Disappeared certificates details (first 5):`);
        disappearedCerts.slice(0, 5).forEach((cert, index) => {
          logger.info(`📋   ${index + 1}. ${cert._id} - ${cert.shape} ${cert.weight}ct ${cert.clarity} ${cert.color} (avg: $${cert.avgPricePerCertificate?.toFixed(2) || 'N/A'})`);
        });
      }
      
      // Cross-reference with ProductCategoryStats
      await this.logProductCategoryStatsComparison(startDate, yesterday);
      
    } catch (error) {
      logger.error('❌ Error in detailed day analysis:', error);
    }
  }

  /**
   * Log comparison with ProductCategoryStats data
   */
  private static async logProductCategoryStatsComparison(today: Date, yesterday: Date): Promise<void> {
    try {
      logger.info(`🔍 PRODUCT CATEGORY STATS COMPARISON:`);
      
      // Get today's stats
      const todayStart = new Date(today.toISOString().split('T')[0]);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      
      const todayStats = await ProductCategoryStats.find({
        date: {
          $gte: todayStart,
          $lt: todayEnd
        }
      }).lean();
      
      // Get yesterday's stats
      const yesterdayStart = new Date(yesterday.toISOString().split('T')[0]);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
      
      const yesterdayStats = await ProductCategoryStats.find({
        date: {
          $gte: yesterdayStart,
          $lt: yesterdayEnd
        }
      }).lean();
      
      logger.info(`📊 ProductCategoryStats:`);
      logger.info(`📊 - Today's records: ${todayStats.length}`);
      logger.info(`📊 - Yesterday's records: ${yesterdayStats.length}`);
      
      // Calculate total disappeared from ProductCategoryStats
      const totalDisappearedFromStats = todayStats.reduce((sum, stat) => 
        sum + (stat.disappearedProductsSinceYesterday || 0), 0
      );
      
      logger.info(`📊 - Total disappeared from ProductCategoryStats: ${totalDisappearedFromStats}`);
      
      // Log sample categories with disappeared products
      const categoriesWithDisappeared = todayStats
        .filter(stat => (stat.disappearedProductsSinceYesterday || 0) > 0)
        .slice(0, 5);
      
      if (categoriesWithDisappeared.length > 0) {
        logger.info(`📋 Sample categories with disappeared products:`);
        categoriesWithDisappeared.forEach((stat, index) => {
          logger.info(`📋   ${index + 1}. ${stat.shape} ${stat.weight}ct ${stat.clarity} ${stat.color} - Disappeared: ${stat.disappearedProductsSinceYesterday}`);
        });
      }
      
    } catch (error) {
      logger.error('❌ Error in ProductCategoryStats comparison:', error);
    }
  }

  /**
   * Validate that ProductCategoryStats data is fresh (not stale)
   */
  private static async validateDataFreshness(): Promise<void> {
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // Check if we have data for today
      const todayCount = await ProductCategoryStats.countDocuments({
        date: today
      });
      
      if (todayCount === 0) {
        logger.warn('⚠️ No ProductCategoryStats data for today - Market Price Calculator may not have run yet');
        
        // Check yesterday's data
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const yesterdayCount = await ProductCategoryStats.countDocuments({
          date: yesterday
        });
        
        if (yesterdayCount === 0) {
          throw new Error('No ProductCategoryStats data found for today or yesterday - Market Price Calculator has not run');
        }
        
        logger.warn('⚠️ Using yesterday\'s data as fallback');
        return;
      }
      
      // Check timestamp of latest update
      const latestUpdate = await ProductCategoryStats.findOne({
        date: today
      }).sort({ updatedAt: -1 }).select('updatedAt').lean();
      
      if (latestUpdate && latestUpdate.updatedAt) {
        const hoursSinceUpdate = (Date.now() - latestUpdate.updatedAt.getTime()) / 3600000;
        
        if (hoursSinceUpdate > DATA_FRESHNESS.CRITICAL_HOURS) {
          logger.error(`❌ CRITICAL: ProductCategoryStats data is ${hoursSinceUpdate.toFixed(1)} hours old`);
          logger.error('❌ Market Price Calculator may have failed - urgent attention required!');
        } else if (hoursSinceUpdate > DATA_FRESHNESS.WARNING_HOURS) {
          logger.warn(`⚠️ ProductCategoryStats data is ${hoursSinceUpdate.toFixed(1)} hours old`);
          logger.warn('⚠️ Market Price Calculator may be delayed or failed');
        } else {
          logger.info(`✅ Data freshness OK: last update ${hoursSinceUpdate.toFixed(1)} hours ago`);
        }
      }
    } catch (error) {
      logger.error('❌ Error validating data freshness:', error);
      // Don't throw - allow analytics to proceed with available data
    }
  }
}
