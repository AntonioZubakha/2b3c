#!/usr/bin/env node

/**
 * MongoDB Index Optimization Script
 * Creates optimized indexes for category-stats queries
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lgdx';

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Define the ProductCategoryStats schema for index creation
const productCategoryStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  shape: { type: String, required: true, index: true },
  weight: { type: String, required: true, index: true },
  clarity: { type: String, required: true, index: true },
  color: { type: String, required: true, index: true },
  marketPricePerCarat: { type: Number, default: 0 },
  count: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'productcategorystats'
});

// Create model
const ProductCategoryStats = mongoose.model('ProductCategoryStats', productCategoryStatsSchema);

async function createOptimizedIndexes() {
  console.log('🔧 Creating optimized indexes...');

  try {
    // Drop existing indexes (except _id)
    const existingIndexes = await ProductCategoryStats.collection.indexes();
    console.log(`📊 Found ${existingIndexes.length} existing indexes`);

    for (const index of existingIndexes) {
      if (index.name !== '_id_') {
        await ProductCategoryStats.collection.dropIndex(index.name);
        console.log(`🗑️  Dropped index: ${index.name}`);
      }
    }

    // Create optimized indexes
    const indexes = [
      // Basic single field indexes
      { date: 1 },
      { shape: 1, weight: 1, clarity: 1, color: 1 },

      // Compound index for date range queries with category filters (most used for charts)
      {
        date: 1,
        shape: 1,
        weight: 1,
        clarity: 1,
        color: 1,
        marketPricePerCarat: 1
      },

      // Additional useful compound indexes
      { date: -1, shape: 1, weight: 1 },
      { shape: 1, weight: 1, marketPricePerCarat: -1 },
      { date: 1, marketPricePerCarat: 1 }
    ];

    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      const indexName = `optimized_index_${i + 1}_${Object.keys(index).join('_')}_${Object.values(index).join('_')}`;

      await ProductCategoryStats.collection.createIndex(index, {
        name: indexName,
        background: true
      });

      console.log(`✅ Created index ${i + 1}/${indexes.length}: ${indexName}`);
    }

    console.log('🎉 Index optimization completed!');

  } catch (error) {
    console.error('❌ Failed to create indexes:', error);
    throw error;
  }
}

async function testQueryPerformance() {
  console.log('\n🧪 Testing query performance...');

  try {
    // Test the optimized chart query
    const testQuery = {
      date: {
        $gte: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Last 10 days
        $lte: new Date()
      },
      shape: 'ROUND',
      weight: '1-1.39',
      clarity: 'VS1',
      color: 'G'
    };

    console.log('📊 Testing query:', JSON.stringify(testQuery, null, 2));

    const startTime = Date.now();
    const results = await ProductCategoryStats.find(testQuery)
      .select('date marketPricePerCarat')
      .sort({ date: 1 })
      .limit(20)
      .lean();

    const duration = Date.now() - startTime;

    console.log(`✅ Query completed in ${duration}ms`);
    console.log(`📈 Results: ${results.length} records`);

    if (duration < 50) {
      console.log('🚀 EXCELLENT: Query is very fast!');
    } else if (duration < 200) {
      console.log('✅ GOOD: Query meets performance target');
    } else {
      console.log('⚠️  WARNING: Query is slow, may need further optimization');
    }

  } catch (error) {
    console.error('❌ Query test failed:', error);
  }
}

async function showIndexStats() {
  console.log('\n📊 Current indexes:');

  try {
    const indexes = await ProductCategoryStats.collection.indexes();

    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });

    console.log(`\n📈 Total indexes: ${indexes.length}`);

  } catch (error) {
    console.error('❌ Failed to get index stats:', error);
  }
}

async function main() {
  await connectDB();

  console.log('🚀 MongoDB Index Optimization Tool');
  console.log('=' .repeat(50));

  // Show current indexes
  await showIndexStats();

  // Create optimized indexes
  await createOptimizedIndexes();

  // Show updated indexes
  await showIndexStats();

  // Test performance
  await testQueryPerformance();

  console.log('\n✅ Optimization completed successfully!');
  console.log('💡 Restart analytics-service to use new indexes');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Operation cancelled by user');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the script
main().catch(async (error) => {
  console.error('💥 Script failed:', error);
  await mongoose.connection.close();
  process.exit(1);
});
