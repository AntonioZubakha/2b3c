import mongoose from 'mongoose';
import Product from '../models/Product';
import { logger } from '../utils/logger';

async function checkDuplicateProducts() {
    try {
        await mongoose.connect(process.env.DATABASE_URL as string);
        logger.info('Connected to database');

        // Find duplicates by certificate number
        const duplicates = await Product.aggregate([
            {
                $group: {
                    _id: '$certificateNumber',
                    count: { $sum: 1 },
                    docs: { $push: { id: '$_id', company: '$company', price: '$price', createdAt: '$createdAt' } }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        logger.info(`Found ${duplicates.length} certificate numbers with duplicates`);

        let totalDuplicateProducts = 0;
        for (const duplicate of duplicates) {
            totalDuplicateProducts += duplicate.count - 1; // Subtract 1 for the original
            logger.info(`Certificate ${duplicate._id}: ${duplicate.count} copies`);
            
            // Show details of duplicates
            for (const doc of duplicate.docs) {
                logger.debug(`  - ID: ${doc.id}, Company: ${doc.company}, Price: ${doc.price}, Created: ${doc.createdAt}`);
            }
        }

        logger.info(`Total duplicate products that could be removed: ${totalDuplicateProducts}`);

        // Optionally remove duplicates (keeping the cheapest one)
        if (process.argv.includes('--fix')) {
            logger.info('Starting duplicate removal...');
            let removedCount = 0;

            for (const duplicate of duplicates) {
                // Sort by price (ascending) and then by createdAt (newest first for same price)
                const sortedDocs = duplicate.docs.sort((a: any, b: any) => {
                    if (a.price !== b.price) return a.price - b.price;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });

                // Keep the first one (cheapest), remove others
                const toKeep = sortedDocs[0];
                const toRemove = sortedDocs.slice(1);

                logger.info(`Keeping product ${toKeep.id} (price: ${toKeep.price}) for certificate ${duplicate._id}`);

                for (const doc of toRemove) {
                    await Product.findByIdAndDelete(doc.id);
                    logger.info(`  Removed product ${doc.id} (price: ${doc.price})`);
                    removedCount++;
                }
            }

            logger.info(`Removed ${removedCount} duplicate products`);
        } else {
            logger.info('Run with --fix flag to remove duplicates (keeps cheapest product for each certificate)');
        }

    } catch (error) {
        logger.error('Error checking duplicates:', { error });
    } finally {
        await mongoose.disconnect();
    }
}

checkDuplicateProducts(); 