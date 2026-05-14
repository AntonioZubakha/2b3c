import { Request, Response } from 'express';
import { ProductCategoryStats } from '../models/ProductCategoryStats';
import { Product } from '../models/Product';
import { logger } from '../utils/logger';

interface CertificateData {
  certificateNumber: string;
  shape: string;
  weight: string;
  clarity: string;
  color: string;
  pricePerCarat: number;
  category: string;
  date: string;
  [key: string]: string | number;
}

/**
 * Debug Controller for analyzing certificate data and sales calculations
 */
export class DebugController {
  /**
   * Analyze certificates for a specific date to debug sales calculations
   */
  static async analyzeCertificates(req: Request, res: Response): Promise<void> {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      targetDate.setUTCHours(0, 0, 0, 0);
      
      const yesterday = new Date(targetDate);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      logger.info(`🔍 DEBUG: Analyzing certificates for ${targetDate.toISOString().split('T')[0]}`);

      // Get certificates from ProductCategoryStats for both days
      const todayStats = await ProductCategoryStats.find({
        date: {
          $gte: targetDate,
          $lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      const yesterdayStats = await ProductCategoryStats.find({
        date: {
          $gte: yesterday,
          $lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      // Get currently active certificates from Products collection
      const currentActiveCerts = await Product.find({
        status: 'available',
        onDeal: { $ne: true },
        certificateNumber: { $exists: true, $ne: null }
      }).select('certificateNumber').lean();

      // Extract all certificates from ProductCategoryStats
      const todayCertificates = new Set<string>();
      const yesterdayCertificates = new Set<string>();
      
      todayStats.forEach(stat => {
        if (stat.productDetails) {
          stat.productDetails.forEach(detail => {
            if (detail.certificateNumber) {
              todayCertificates.add(detail.certificateNumber);
            }
          });
        }
      });

      yesterdayStats.forEach(stat => {
        if (stat.productDetails) {
          stat.productDetails.forEach(detail => {
            if (detail.certificateNumber) {
              yesterdayCertificates.add(detail.certificateNumber);
            }
          });
        }
      });

      const currentActiveSet = new Set(
        currentActiveCerts.map(p => p.certificateNumber).filter(Boolean)
      );

      // Calculate disappeared certificates
      const disappearedFromYesterday = Array.from(yesterdayCertificates).filter(
        cert => !currentActiveSet.has(cert)
      );

      const disappearedFromToday = Array.from(todayCertificates).filter(
        cert => !currentActiveSet.has(cert)
      );

      // Calculate total disappeared from ProductCategoryStats
      const totalDisappearedFromStats = todayStats.reduce((sum, stat) => 
        sum + (stat.disappearedProductsSinceYesterday || 0), 0
      );

      const analysis = {
        date: targetDate.toISOString().split('T')[0],
        yesterday: yesterday.toISOString().split('T')[0],
        
        // Certificate counts
        certificateCounts: {
          todayInStats: todayCertificates.size,
          yesterdayInStats: yesterdayCertificates.size,
          currentlyActive: currentActiveSet.size,
          disappearedFromYesterday: disappearedFromYesterday.length,
          disappearedFromToday: disappearedFromToday.length
        },
        
        // ProductCategoryStats data
        productCategoryStats: {
          todayRecords: todayStats.length,
          yesterdayRecords: yesterdayStats.length,
          totalDisappearedFromStats
        },
        
        // Sample data for verification
        sampleData: {
          todayCertificates: Array.from(todayCertificates).slice(0, 10),
          yesterdayCertificates: Array.from(yesterdayCertificates).slice(0, 10),
          currentActive: Array.from(currentActiveSet).slice(0, 10),
          disappearedFromYesterday: disappearedFromYesterday.slice(0, 10)
        },
        
        // Categories with disappeared products
        categoriesWithDisappeared: todayStats
          .filter(stat => (stat.disappearedProductsSinceYesterday || 0) > 0)
          .slice(0, 10)
          .map(stat => ({
            category: `${stat.shape} ${stat.weight}ct ${stat.clarity} ${stat.color}`,
            disappeared: stat.disappearedProductsSinceYesterday,
            total: stat.count
          }))
      };

      logger.info(`🔍 DEBUG RESULTS for ${targetDate.toISOString().split('T')[0]}:`);
      logger.info(`📊 Certificates: Today=${todayCertificates.size}, Yesterday=${yesterdayCertificates.size}, Active=${currentActiveSet.size}`);
      logger.info(`📊 Disappeared: FromYesterday=${disappearedFromYesterday.length}, FromToday=${disappearedFromToday.length}`);
      logger.info(`📊 ProductCategoryStats: Disappeared=${totalDisappearedFromStats}`);

      res.json({
        success: true,
        data: analysis
      });

    } catch (error) {
      logger.error('❌ Error in certificate analysis:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Compare certificates between two dates
   */
  static async compareCertificates(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'startDate and endDate are required'
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(23, 59, 59, 999);

      logger.info(`🔍 DEBUG: Comparing certificates between ${start.toISOString().split('T')[0]} and ${end.toISOString().split('T')[0]}`);

      // Get certificates for start date
      const startStats = await ProductCategoryStats.find({
        date: {
          $gte: start,
          $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      // Get certificates for end date
      const endStats = await ProductCategoryStats.find({
        date: {
          $gte: end,
          $lt: new Date(end.getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      // Extract certificates
      const startCertificates = new Set<string>();
      const endCertificates = new Set<string>();

      startStats.forEach(stat => {
        if (stat.productDetails) {
          stat.productDetails.forEach(detail => {
            if (detail.certificateNumber) {
              startCertificates.add(detail.certificateNumber);
            }
          });
        }
      });

      endStats.forEach(stat => {
        if (stat.productDetails) {
          stat.productDetails.forEach(detail => {
            if (detail.certificateNumber) {
              endCertificates.add(detail.certificateNumber);
            }
          });
        }
      });

      // Calculate differences
      const added = Array.from(endCertificates).filter(cert => !startCertificates.has(cert));
      const removed = Array.from(startCertificates).filter(cert => !endCertificates.has(cert));
      const common = Array.from(startCertificates).filter(cert => endCertificates.has(cert));

      const comparison = {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        counts: {
          startTotal: startCertificates.size,
          endTotal: endCertificates.size,
          added: added.length,
          removed: removed.length,
          common: common.length
        },
        sampleData: {
          added: added.slice(0, 10),
          removed: removed.slice(0, 10),
          common: common.slice(0, 10)
        }
      };

      logger.info(`🔍 COMPARISON RESULTS:`);
      logger.info(`📊 Start: ${startCertificates.size}, End: ${endCertificates.size}`);
      logger.info(`📊 Added: ${added.length}, Removed: ${removed.length}, Common: ${common.length}`);

      res.json({
        success: true,
        data: comparison
      });

    } catch (error) {
      logger.error('❌ Error in certificate comparison:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Export list of sold certificates with detailed information
   */
  static async exportSoldCertificates(req: Request, res: Response): Promise<void> {
    try {
      const { date, format = 'json' } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      targetDate.setUTCHours(0, 0, 0, 0);
      
      const yesterday = new Date(targetDate);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      logger.info(`🔍 EXPORT: Getting sold certificates for ${targetDate.toISOString().split('T')[0]}`);

      // Get yesterday's certificates from ProductCategoryStats
      const yesterdayStats = await ProductCategoryStats.find({
        date: {
          $gte: yesterday,
          $lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000)
        }
      }).lean();

      // Get currently active certificates
      const currentActiveCerts = await Product.find({
        status: 'available',
        onDeal: { $ne: true },
        certificateNumber: { $exists: true, $ne: null }
      }).select('certificateNumber').lean();

      const currentActiveSet = new Set(
        currentActiveCerts.map(p => p.certificateNumber).filter(Boolean)
      );

      // Extract all certificates from yesterday's stats
      const yesterdayCertificates: Array<{
        certificateNumber: string;
        shape: string;
        weight: string;
        clarity: string;
        color: string;
        pricePerCarat: number;
        category: string;
        date: string;
      }> = [];

      yesterdayStats.forEach(stat => {
        if (stat.productDetails) {
          stat.productDetails.forEach(detail => {
            if (detail.certificateNumber && !currentActiveSet.has(detail.certificateNumber)) {
              yesterdayCertificates.push({
                certificateNumber: detail.certificateNumber,
                shape: stat.shape,
                weight: stat.weight,
                clarity: stat.clarity,
                color: stat.color,
                pricePerCarat: detail.pricePerCarat,
                category: `${stat.shape} ${stat.weight}ct ${stat.clarity} ${stat.color}`,
                date: targetDate.toISOString().split('T')[0]
              });
            }
          });
        }
      });

      logger.info(`📊 EXPORT: Found ${yesterdayCertificates.length} sold certificates`);

      // Sort by certificate number for easier analysis
      yesterdayCertificates.sort((a, b) => a.certificateNumber.localeCompare(b.certificateNumber));

      if (format === 'csv') {
        // Generate CSV
        const csvHeader = 'Certificate Number,Shape,Weight,Clarity,Color,Price Per Carat,Category,Date\n';
        const csvRows = yesterdayCertificates.map(cert => 
          `"${cert.certificateNumber}","${cert.shape}","${cert.weight}","${cert.clarity}","${cert.color}",${cert.pricePerCarat},"${cert.category}","${cert.date}"`
        ).join('\n');
        
        const csvContent = csvHeader + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="sold_certificates_${targetDate.toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
        
      } else {
        // Return JSON
        res.json({
          success: true,
          data: {
            date: targetDate.toISOString().split('T')[0],
            totalSold: yesterdayCertificates.length,
            certificates: yesterdayCertificates,
            summary: {
              byShape: this.getSummaryByField(yesterdayCertificates, 'shape'),
              byWeight: this.getSummaryByField(yesterdayCertificates, 'weight'),
              byClarity: this.getSummaryByField(yesterdayCertificates, 'clarity'),
              byColor: this.getSummaryByField(yesterdayCertificates, 'color'),
              priceRange: this.getPriceRange(yesterdayCertificates)
            }
          }
        });
      }

    } catch (error) {
      logger.error('❌ Error exporting sold certificates:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get summary statistics by field
   */
  private static getSummaryByField(certificates: CertificateData[], field: string): Record<string, number> {
    const summary: Record<string, number> = {};
    certificates.forEach(cert => {
      const value = cert[field];
      summary[value] = (summary[value] || 0) + 1;
    });
    return summary;
  }

  /**
   * Get price range statistics
   */
  private static getPriceRange(certificates: CertificateData[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
  } {
    if (certificates.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0 };
    }

    const prices = certificates
      .map(cert => cert.pricePerCarat)
      .filter(price => price && price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0 };
    }

    const min = prices[0];
    const max = prices[prices.length - 1];
    const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const median = prices.length % 2 === 0 
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    return {
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100
    };
  }
}
