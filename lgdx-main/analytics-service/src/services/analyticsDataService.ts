import { AnalyticsData, IAnalyticsData } from '../models/AnalyticsDataModel';
import { AnalyticsService } from './analyticsService';
import { DateUtils } from '../utils/dateUtils';
import { logger } from '../utils/logger';

export class AnalyticsDataService {
  /**
   * Сохранить аналитику в БД
   */
  static async saveAnalyticsData(
    period: 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date,
    analyticsResponse: Record<string, unknown>
  ): Promise<IAnalyticsData> {
    try {
      logger.info(`💾 Saving analytics data to DB for period: ${period}`);
      
      // Удаляем старые данные для этого периода (если есть)
      await AnalyticsData.deleteMany({ 
        period,
        startDate: { $gte: startDate },
        endDate: { $lte: endDate }
      });
      
      // Создаем новую запись
      const dataObject = analyticsResponse.data as Record<string, unknown>;
      const analyticsData = new AnalyticsData({
        period,
        startDate,
        endDate,
        generatedAt: new Date(),
        ...dataObject
      });
      
      const savedData = await analyticsData.save();
      logger.info(`✅ Analytics data saved to DB with ID: ${savedData._id}`);
      
      return savedData;
    } catch (error) {
      logger.error('❌ Error saving analytics data to DB:', error);
      throw error;
    }
  }
  
  /**
   * Получить аналитику из БД
   */
  static async getAnalyticsData(period: 'day' | 'week' | 'month'): Promise<IAnalyticsData | null> {
    try {
      logger.info(`📊 Getting analytics data from DB for period: ${period}`);
      
      // Получаем последние данные для этого периода
      const analyticsData = await AnalyticsData.findOne({ period })
        .sort({ endDate: -1 })
        .lean();
      
      if (analyticsData) {
        logger.info(`✅ Found analytics data in DB for period: ${period}`);
        return analyticsData;
      } else {
        logger.info(`📊 No analytics data found in DB for period: ${period}`);
        return null;
      }
    } catch (error) {
      logger.error('❌ Error getting analytics data from DB:', error);
      throw error;
    }
  }
  
  /**
   * Получить или сгенерировать аналитику
   */
  static async getOrGenerateAnalytics(period: 'day' | 'week' | 'month'): Promise<Record<string, unknown>> {
    try {
      // Сначала пытаемся получить из БД
      let analyticsData = await this.getAnalyticsData(period);
      
      if (!analyticsData) {
        logger.info(`📊 No data in DB for period: ${period}, generating fresh data`);
        
        // Генерируем свежие данные
        const analyticsResponse = await AnalyticsService.getAnalyticsForPeriod(period);
        
        // Вычисляем даты используя утилитную функцию
        const { startDate, endDate } = DateUtils.getDateRange(period);
        
        // Сохраняем в БД
        analyticsData = await this.saveAnalyticsData(period, startDate, endDate, analyticsResponse as never);
      }
      
      // Возвращаем в формате, ожидаемом фронтендом
      return {
        success: true,
        data: {
          marketOverview: analyticsData.marketOverview,
          demandAnalysis: analyticsData.demandAnalysis,
          supplyInsights: analyticsData.supplyInsights,
          priceTrends: analyticsData.priceTrends
        },
        period: {
          startDate: analyticsData.startDate.toISOString(),
          endDate: analyticsData.endDate.toISOString(),
          daysAnalyzed: period === 'day' ? 1 : period === 'week' ? 7 : 30
        },
        cached: false,
        cacheAge: 0,
        fromDatabase: true,
        generatedAt: analyticsData.generatedAt
      };
    } catch (error) {
      logger.error('❌ Error getting or generating analytics:', error);
      throw error;
    }
  }
  
  /**
   * Принудительно пересчитать и сохранить аналитику
   */
  static async recalculateAnalytics(period: 'day' | 'week' | 'month'): Promise<Record<string, unknown>> {
    try {
      logger.info(`🔄 Recalculating analytics for period: ${period}`);
      
      // Генерируем свежие данные
      const analyticsResponse = await AnalyticsService.getAnalyticsForPeriod(period);
      
      // Вычисляем даты
      const { startDate, endDate } = DateUtils.getDateRange(period);
      
      // Сохраняем в БД
      const analyticsData = await this.saveAnalyticsData(period, startDate, endDate, analyticsResponse as never);
      
      logger.info(`✅ Analytics recalculated and saved for period: ${period}`);
      
      return {
        success: true,
        data: {
          marketOverview: analyticsData.marketOverview,
          demandAnalysis: analyticsData.demandAnalysis,
          supplyInsights: analyticsData.supplyInsights,
          priceTrends: analyticsData.priceTrends
        },
        period: {
          startDate: analyticsData.startDate.toISOString(),
          endDate: analyticsData.endDate.toISOString(),
          daysAnalyzed: period === 'day' ? 1 : period === 'week' ? 7 : 30
        },
        cached: false,
        cacheAge: 0,
        fromDatabase: true,
        generatedAt: analyticsData.generatedAt,
        recalculated: true
      };
    } catch (error) {
      logger.error('❌ Error recalculating analytics:', error);
      throw error;
    }
  }
  
  /**
   * Получить историю аналитики
   */
  static async getAnalyticsHistory(period: 'day' | 'week' | 'month', limit: number = 10): Promise<IAnalyticsData[]> {
    try {
      const history = await AnalyticsData.find({ period })
        .sort({ endDate: -1 })
        .limit(limit)
        .lean();
      
      return history;
    } catch (error) {
      logger.error('❌ Error getting analytics history:', error);
      throw error;
    }
  }
  
  /**
   * Очистить старые данные (старше N дней)
   */
  static async cleanupOldData(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await AnalyticsData.deleteMany({
        endDate: { $lt: cutoffDate }
      });
      
      logger.info(`🗑️ Cleaned up ${result.deletedCount} old analytics records`);
      return result.deletedCount;
    } catch (error) {
      logger.error('❌ Error cleaning up old analytics data:', error);
      throw error;
    }
  }
}
