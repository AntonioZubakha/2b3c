import Fastify from 'fastify';
import mongoose from 'mongoose';
import { Setting } from './models/Setting.js';
import { Jewelry } from './models/Jewelry.js';

const fastify = Fastify({ logger: true });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_jewelry';

// 1. GET /settings -> Fetch setting catalog with optional shape filtering
fastify.get<{ Querystring: { shape?: string } }>('/settings', async (request, reply) => {
  try {
    const { shape } = request.query;
    
    // Compatibility Logic: 
    // If shape is provided, find settings where compatibleShapes ARRAY contains the shape
    const filter: any = {};
    if (shape) {
      filter.compatibleShapes = { $in: [shape] };
    }

    const settings = await Setting.find(filter);
    return { success: true, count: settings.length, data: settings };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch settings' });
  }
});

// 2. GET /settings/:id -> Get specific setting details
fastify.get<{ Params: { id: string } }>('/settings/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    // Support both Mongo _id and SKU (pricing/cart uses SKU as productId)
    const setting = id.match(/^[0-9a-fA-F]{24}$/)
      ? await Setting.findById(id)
      : await Setting.findOne({ sku: id });
    if (!setting) return reply.status(404).send({ error: 'Setting not found' });
    return { success: true, data: setting };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// 3. GET /collections -> Fetch ready-to-wear jewelry items
fastify.get('/collections', async (request, reply) => {
  try {
    const items = await Jewelry.find({});
    return { success: true, count: items.length, data: items };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch collections' });
  }
});

// 3.1 GET /collections/:id -> Single piece by Mongo _id or SKU (checkout / pricing)
fastify.get<{ Params: { id: string } }>('/collections/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    const item = id.match(/^[0-9a-fA-F]{24}$/)
      ? await Jewelry.findById(id)
      : await Jewelry.findOne({ sku: id });
    if (!item) return reply.status(404).send({ error: 'Jewelry not found' });
    return { success: true, data: item };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// 3.2 POST /collections/bulk-upsert -> Supplier ingestion (SKU upsert)
fastify.post<{ Body: { items: Record<string, unknown>[] } }>('/collections/bulk-upsert', async (request, reply) => {
  try {
    const { items } = request.body;
    if (!Array.isArray(items)) {
      return reply.status(400).send({ success: false, error: 'items must be an array' });
    }

    const operations = items.map((row) => ({
      updateOne: {
        filter: { sku: row.sku as string },
        update: { $set: row },
        upsert: true,
      },
    }));

    const result = await Jewelry.bulkWrite(operations);
    return {
      success: true,
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Bulk upsert failed' });
  }
});

// 4. Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'jewelry-service' }));

const start = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    fastify.log.info('Jewelry Service connected to MongoDB');
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
