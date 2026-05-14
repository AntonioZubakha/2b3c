import mongoose from 'mongoose';
import User from '../models/User';
import Company from '../models/Company';
import { logger } from '../utils/logger';

// Test user emails to clean up
const TEST_EMAILS = [
  'testuser1@example.com',
  'testuser2@example.com',
  // Add more test emails as needed
];

const TEST_PHONES = [
  '+1234567890',
  '+1234567891',
  // Add more test phones as needed
];

const TEST_COMPANY_NAMES = [
  'Test Company Regular',
  'LGDeal INC',
  // Add more test company names as needed
];

async function connectDB() {
  try {
    const getMongoUri = () => {
      if (process.env.MONGODB_URI_FILE) {
        try {
          return require('fs').readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
        } catch (e) {
          logger.error('[CleanupScript] Failed to read MONGODB_URI_FILE:', { error: e });
        }
      }
      return process.env.MONGODB_URI || 'mongodb://localhost:27017/lgdx';
    };

    const mongoURI = getMongoUri();
    await mongoose.connect(mongoURI);
    logger.info('[CleanupScript] Connected to MongoDB');
  } catch (error: any) {
    logger.error('[CleanupScript] MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function cleanupTestUsers() {
  logger.info('🧹 Starting cleanup of test users...');

  try {
    // Find and delete test users
    const testUsers = await User.find({
      $or: [
        { email: { $in: TEST_EMAILS } },
        { phone: { $in: TEST_PHONES } }
      ]
    });

    logger.info(`Found ${testUsers.length} test users to delete`);

    if (testUsers.length > 0) {
      // Get company IDs for cleanup
      const companyIds = testUsers.map(user => user.company).filter(Boolean);

      // Delete test users
      const deleteResult = await User.deleteMany({
        $or: [
          { email: { $in: TEST_EMAILS } },
          { phone: { $in: TEST_PHONES } }
        ]
      });

      logger.info(`✅ Deleted ${deleteResult.deletedCount} test users`);

      // Clean up test companies (only if they have no other users)
      if (companyIds.length > 0) {
        for (const companyId of companyIds) {
          const remainingUsers = await User.countDocuments({ company: companyId });
          if (remainingUsers === 0) {
            await Company.findByIdAndDelete(companyId);
            logger.info(`✅ Deleted empty test company: ${companyId}`);
          }
        }
      }

      // Also cleanup by company names
      const testCompanies = await Company.find({
        name: { $in: TEST_COMPANY_NAMES }
      });

      for (const company of testCompanies) {
        const remainingUsers = await User.countDocuments({ company: company._id });
        if (remainingUsers === 0) {
          await Company.findByIdAndDelete(company._id);
          logger.info(`✅ Deleted test company: ${company.name}`);
        } else {
          logger.warn(`⚠️  Company ${company.name} still has ${remainingUsers} users, skipping deletion`);
        }
      }
    } else {
      logger.info('✅ No test users found to delete');
    }

  } catch (error: any) {
    logger.error('❌ Error during cleanup:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await cleanupTestUsers();
    logger.info('🎉 Cleanup completed successfully');
  } catch (error: any) {
    logger.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run cleanup if called directly
if (require.main === module) {
  main().catch((e) => logger.error('Cleanup main error:', e?.message || e));
}

export { cleanupTestUsers, connectDB }; 