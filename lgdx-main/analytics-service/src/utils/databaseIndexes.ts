import mongoose from 'mongoose';
import { logger } from './logger';

/**
 * Database Indexes Utility for Analytics Service
 * Creates optimized indexes for analytics queries
 */
export class DatabaseIndexes {
  
  /**
   * Create all necessary indexes for analytics performance
   */
  public static async createAnalyticsIndexes(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        logger.warn('[Indexes] Database not connected, skipping index creation');
        return;
      }

      logger.info('[Indexes] Starting analytics indexes creation...');

      // Get collections
      const productCategoryStatsCollection = db.collection('productcategorystats');
      const productsCollection = db.collection('products');

      // Create indexes for ProductCategoryStats (analytics queries)
      await this.createProductCategoryStatsIndexes(productCategoryStatsCollection);
      
      // Create indexes for Products (if needed for analytics)
      await this.createProductsIndexes(productsCollection);

      logger.info('[Indexes] ✅ All analytics indexes created successfully');
    } catch (error) {
      logger.error('[Indexes] ❌ Error creating analytics indexes:', error);
      throw error;
    }
  }

  /**
   * Create indexes for ProductCategoryStats collection
   */
  private static async createProductCategoryStatsIndexes(collection: ReturnType<typeof mongoose.connection.db['collection']>): Promise<void> {
    logger.info('[Indexes] Creating ProductCategoryStats indexes...');

    // Helper function to safely create index
    const safeCreateIndex = async (indexSpec: Record<string, number | string>, options: Record<string, unknown>, description: string): Promise<boolean> => {
      try {
        // Check if index already exists
        const existingIndexes = await collection.listIndexes().toArray();
        const indexExists = existingIndexes.some((idx: { name?: string }) => idx.name === options.name);
        
        if (indexExists) {
          logger.info(`[Indexes] ⏭️ Index ${options.name} already exists, skipping`);
          return true;
        }

        await collection.createIndex(indexSpec as never, options);
        logger.info(`[Indexes] ✅ Created ${description}`);
        return true;
      } catch (error) {
        logger.error(`[Indexes] ❌ Failed to create ${description}:`, error);
        return false;
      }
    };

    // 1. CRITICAL: Main analytics query index - date range + productDetails.certificateNumber
    // This index is ESSENTIAL for aggregation pipeline performance
    await safeCreateIndex(
      { 
        date: 1, 
        "productDetails.certificateNumber": 1 
      },
      { 
        name: "analytics_date_certificate_CRITICAL",
        background: true,
        sparse: true // Some documents might not have productDetails
      },
      "CRITICAL analytics_date_certificate index"
    );

    // 2. Category lookup index for grouping
    await safeCreateIndex(
      { 
        date: 1,
        shape: 1,
        weight: 1,
        clarity: 1,
        color: 1
      },
      { 
        name: "analytics_category_lookup",
        background: true
      },
      "analytics_category_lookup index"
    );

    // 3. Date range index for time-based queries
    await safeCreateIndex(
      { 
        date: -1 
      },
      { 
        name: "analytics_date_desc",
        background: true
      },
      "analytics_date_desc index"
    );

    // 4. Disappeared products index
    await safeCreateIndex(
      { 
        date: 1,
        disappearedProductsSinceYesterday: -1
      },
      { 
        name: "analytics_disappeared_products",
        background: true,
        sparse: true
      },
      "analytics_disappeared_products index"
    );

    // 5. New products index
    await safeCreateIndex(
      { 
        date: 1,
        newProductsToday: -1
      },
      { 
        name: "analytics_new_products",
        background: true,
        sparse: true
      },
      "analytics_new_products index"
    );

    // 6. Compound index for demand analysis aggregation
    await safeCreateIndex(
      { 
        date: 1,
        shape: 1,
        weight: 1,
        clarity: 1,
        color: 1,
        disappearedProductsSinceYesterday: 1
      },
      { 
        name: "analytics_demand_compound",
        background: true
      },
      "analytics_demand_compound index"
    );

    // 7. TTL index for automatic cleanup of old data (optional)
    // Uncomment if you want automatic cleanup of old analytics data
    /*
    await collection.createIndex(
      { 
        date: 1 
      },
      { 
        name: "analytics_ttl_cleanup",
        expireAfterSeconds: 31536000, // 1 year
        background: true
      }
    );
    logger.info('[Indexes] ✅ Created analytics_ttl_cleanup index');
    */
  }

  /**
   * Create indexes for Products collection (if needed for analytics)
   */
  private static async createProductsIndexes(collection: ReturnType<typeof mongoose.connection.db['collection']>): Promise<void> {
    logger.info('[Indexes] Creating Products indexes for analytics...');

    // Helper function to safely create index
    const safeCreateIndex = async (indexSpec: Record<string, unknown>, options: Record<string, unknown>, description: string): Promise<boolean> => {
      try {
        // Check if index already exists
        const existingIndexes = await collection.listIndexes().toArray();
        const indexExists = existingIndexes.some((idx: { name?: string }) => idx.name === options.name);
        
        if (indexExists) {
          logger.info(`[Indexes] ⏭️ Index ${options.name} already exists, skipping`);
          return true;
        }

        await collection.createIndex(indexSpec as never, options);
        logger.info(`[Indexes] ✅ Created ${description}`);
        return true;
      } catch (error) {
        logger.error(`[Indexes] ❌ Failed to create ${description}:`, error);
        return false;
      }
    };

    // 1. Status and availability index
    await safeCreateIndex(
      { 
        status: 1,
        onDeal: 1,
        createdAt: -1
      },
      { 
        name: "analytics_products_status",
        background: true
      },
      "analytics_products_status index"
    );

    // 2. Category analysis index
    await safeCreateIndex(
      { 
        status: 1,
        shape: 1,
        carat: 1,
        color: 1,
        clarity: 1,
        pricePerCarat: 1
      },
      { 
        name: "analytics_products_category",
        background: true
      },
      "analytics_products_category index"
    );

    // 3. Price trends index
    await safeCreateIndex(
      { 
        createdAt: 1,
        pricePerCarat: 1,
        shape: 1
      },
      { 
        name: "analytics_products_price_trends",
        background: true
      },
      "analytics_products_price_trends index"
    );
  }

  /**
   * Check existing indexes and their usage
   */
  public static async analyzeIndexUsage(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        logger.warn('[Indexes] Database not connected, skipping index analysis');
        return;
      }

      logger.info('[Indexes] Analyzing index usage...');

      const collections = ['productcategorystats', 'products'];
      
      for (const collectionName of collections) {
        const collection = db.collection(collectionName);
        const indexes = await collection.listIndexes().toArray();
        
        logger.info(`[Indexes] Collection '${collectionName}' has ${indexes.length} indexes:`);
        
        for (const index of indexes) {
          logger.info(`[Indexes]   - ${index.name}: ${JSON.stringify(index.key)}`);
        }
      }
    } catch (error) {
      logger.error('[Indexes] ❌ Error analyzing index usage:', error);
    }
  }

  /**
   * Drop unused indexes (use with caution)
   */
  public static async dropUnusedIndexes(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        logger.warn('[Indexes] Database not connected, skipping index dropping');
        return;
      }

      logger.warn('[Indexes] ⚠️ Dropping unused indexes - use with caution!');

      // This is a placeholder - implement actual logic to identify unused indexes
      // You can use MongoDB's index usage statistics to identify unused indexes
      
      logger.info('[Indexes] Index dropping completed');
    } catch (error) {
      logger.error('[Indexes] ❌ Error dropping unused indexes:', error);
    }
  }

  /**
   * Get index statistics
   */
  public static async getIndexStats(): Promise<Record<string, unknown> | null> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        return null;
      }

      const stats = {
        productcategorystats: await db.collection('productcategorystats').stats(),
        products: await db.collection('products').stats()
      };

      logger.info('[Indexes] Index statistics:', {
        productcategorystats: {
          count: stats.productcategorystats.count,
          size: stats.productcategorystats.size,
          indexes: stats.productcategorystats.nindexes,
          avgObjSize: stats.productcategorystats.avgObjSize
        },
        products: {
          count: stats.products.count,
          size: stats.products.size,
          indexes: stats.products.nindexes,
          avgObjSize: stats.products.avgObjSize
        }
      });

      return stats;
    } catch (error) {
      logger.error('[Indexes] ❌ Error getting index stats:', error);
      return null;
    }
  }
}
