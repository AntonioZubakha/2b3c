import { AnalyticsResponse } from '../models/AnalyticsData';
import { MarketAnalysisService } from './marketAnalysisService';
import { DateUtils } from '../utils/dateUtils';
import { logger } from '../utils/logger';

/**
 * Main Analytics Service - simplified and optimized
 * Handles all analytics data generation with proper error handling
 */
export class AnalyticsService {
  /**
   * Generate complete analytics data for a specific period
   */
  static async getAnalyticsForPeriod(period: 'day' | 'week' | 'month'): Promise<AnalyticsResponse> {
    try {
      logger.info(`📊 Generating analytics for period: ${period}`);

      const { startDate, endDate } = DateUtils.getDateRange(period);
      const daysAnalyzed = period === 'day' ? 1 : period === 'week' ? 7 : 30;

      // Generate all data using the unified market analysis service
      const analyticsData = await MarketAnalysisService.generateCompleteAnalytics(startDate, endDate);

      return {
        success: true,
        data: analyticsData,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          daysAnalyzed
        },
        cached: false,
        cacheAge: 0
      };
    } catch (error) {
      logger.error('❌ Error generating analytics data:', error);
      throw error;
    }
  }

  /**
   * Generate analytics for custom period
   */
  static async getAnalyticsForCustomPeriod(
    startDate: Date, 
    endDate: Date
  ): Promise<AnalyticsResponse> {
    try {
      logger.info(`📊 Generating analytics for custom period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const daysAnalyzed = DateUtils.getDaysBetween(startDate, endDate);
      const analyticsData = await MarketAnalysisService.generateCompleteAnalytics(startDate, endDate);

      return {
        success: true,
        data: analyticsData,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          daysAnalyzed
        },
        cached: false,
        cacheAge: 0
      };
    } catch (error) {
      logger.error('❌ Error generating custom period analytics:', error);
      throw error;
    }
  }
}