import Fastify from 'fastify';
import mongoose from 'mongoose';
import catalogRoutes from './routes/catalogRoutes.js';
import Diamond from './models/Diamond.js';

/** Large bulk-upsert from supplier-service (chunked client-side; keep headroom for big rows). */
const bodyLimitBytes = Math.min(
  50 * 1024 * 1024,
  Math.max(2 * 1024 * 1024, parseInt(process.env.CATALOG_BODY_LIMIT_BYTES || '20971520', 10) || 20971520),
);

const fastify = Fastify({ logger: true, bodyLimit: bodyLimitBytes });

fastify.get('/health', async () => ({ status: 'ok', service: 'catalog-service' }));

// Register Routes
fastify.register(catalogRoutes, { prefix: '/' });

// Database Connection & Seeder
const initDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_catalog';
    await mongoose.connect(mongoUri);
    fastify.log.info('Connected to MongoDB');

    const count = await Diamond.countDocuments();
    if (count === 0) {
      fastify.log.info('Catalog diamonds collection is empty — load inventory via supplier-service /sync/diamond-atelier or ingest.');
    }
  } catch (error) {
    fastify.log.error(error, 'Failed to connect to MongoDB');
    process.exit(1);
  }
};

const start = async () => {
  await initDB();
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
