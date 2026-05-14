import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import Diamond from '../models/Diamond.js';
import { invalidateSearchCacheAfterCatalogWrite } from '../notifySearchCache.js';

function assertInternal(request: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.STONEE_INTERNAL_SECRET || '';
  if (!secret) return true;
  const got = request.headers['x-stonee-internal'];
  if (got !== secret) {
    reply.code(403).send({ success: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

const catalogRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: { skus?: string[] } }>('/internal/sku-supplier-map', async (request, reply) => {
    if (!assertInternal(request, reply)) return;
    const skus = request.body?.skus;
    if (!Array.isArray(skus) || skus.length === 0) {
      return reply.code(400).send({ success: false, error: 'skus[] required' });
    }
    const uniq = [...new Set(skus.map(s => String(s).trim()).filter(Boolean))].slice(0, 2000);
    try {
      const rows = await Diamond.find({ sku: { $in: uniq } })
        .select('sku supplierId')
        .lean();
      const data: Record<string, string> = {};
      for (const r of rows) {
        if (r.sku && r.supplierId) data[String(r.sku)] = String(r.supplierId);
      }
      return { success: true, data };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Lookup failed' });
    }
  });

  // GET /stats -> lightweight counts (for ops dashboards; avoids loading full catalog)
  fastify.get('/stats', async (_request, reply) => {
    try {
      const inStock = await Diamond.countDocuments({ availability: 'in-stock' });
      const total = await Diamond.countDocuments({});
      return { success: true, data: { inStock, total } };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Failed to count diamonds' });
    }
  });

  // GET / -> Fetch diamonds with advanced filtering + optional pagination
  fastify.get<{ 
    Querystring: { 
      shape?: string, 
      minPrice?: number, 
      maxPrice?: number,
      minCarat?: number,
      maxCarat?: number,
      color?: string,
      clarity?: string,
      cut?: string,
      sort?: string,
      /** 1-based page number (default: no pagination — returns all) */
      page?: number,
      limit?: number,
      /** Catalog `supplierId` (e.g. `SUP-<companyObjectId>`) — public list filter for partner inventory UIs */
      supplierId?: string,
    } 
  }>('/', async (request, reply) => {
    try {
      const { shape, minPrice, maxPrice, minCarat, maxCarat, color, clarity, cut, sort, page, limit, supplierId } = request.query;
      
      const filter: any = { availability: 'in-stock' };

      if (supplierId != null && String(supplierId).trim() !== '') {
        const sid = String(supplierId).trim().slice(0, 80);
        if (/^[\w-]+$/.test(sid)) {
          filter.supplierId = sid;
        }
      }

      if (shape) filter.shape = { $in: shape.split(',') };
      if (color) filter.color = { $in: color.split(',') };
      if (clarity) filter.clarity = { $in: clarity.split(',') };
      if (cut) filter.cut = { $in: cut.split(',') };

      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      if (minCarat || maxCarat) {
        filter.carat = {};
        if (minCarat) filter.carat.$gte = Number(minCarat);
        if (maxCarat) filter.carat.$lte = Number(maxCarat);
      }

      let sortOption: any = { diamondScore: -1 };
      if (sort === 'price-asc') sortOption = { price: 1 };
      if (sort === 'price-desc') sortOption = { price: -1 };
      if (sort === 'createdAt-desc') sortOption = { createdAt: -1 };

      const pageSize = limit ? Math.min(Math.max(1, Number(limit)), 500) : undefined;
      const skip = pageSize && page ? (Math.max(1, Number(page)) - 1) * pageSize : 0;

      let query = Diamond.find(filter).sort(sortOption);
      if (skip) query = query.skip(skip);
      if (pageSize) query = query.limit(pageSize);

      const [diamonds, total] = await Promise.all([
        query.exec(),
        pageSize ? Diamond.countDocuments(filter) : Promise.resolve(undefined),
      ]);

      return {
        success: true,
        count: diamonds.length,
        ...(total !== undefined && { total, page: Number(page ?? 1), pages: Math.ceil(total / pageSize!) }),
        data: diamonds,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Failed to fetch diamonds' });
    }
  });

  // GET /:identifier -> Fetch specific diamond by _id or SKU
  fastify.get<{ Params: { identifier: string } }>('/:identifier', async (request, reply) => {
    try {
      const { identifier } = request.params;
      // Try by MongoDB _id first, then by SKU
      let diamond = null;
      if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
        diamond = await Diamond.findById(identifier);
      }
      if (!diamond) {
        diamond = await Diamond.findOne({ sku: identifier });
      }
      if (!diamond) {
        return reply.code(404).send({ success: false, error: 'Diamond not found' });
      }
      return { success: true, data: diamond };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Failed to fetch diamond details' });
    }
  });

  // POST / -> Add new diamond
  fastify.post<{ Body: any }>('/', async (request, reply) => {
    try {
      const newDiamond = new Diamond(request.body);
      const saved = await newDiamond.save();
      await invalidateSearchCacheAfterCatalogWrite(fastify.log);
      return reply.code(201).send({ success: true, data: saved });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(400).send({ success: false, error: 'Failed to create diamond' });
    }
  });

  // POST /bulk-upsert -> Multi-diamond upsert (for Stage 1 Ingestion)
  fastify.post<{ Body: { diamonds: any[] } }>('/bulk-upsert', async (request, reply) => {
    try {
      const { diamonds } = request.body;
      if (!Array.isArray(diamonds)) {
        return reply.code(400).send({ success: false, error: 'Diamonds must be an array' });
      }

      const operations = diamonds.map(d => ({
        updateOne: {
          filter: { sku: d.sku },
          update: { $set: d },
          upsert: true
        }
      }));

      const result = await Diamond.bulkWrite(operations);

      await invalidateSearchCacheAfterCatalogWrite(fastify.log);

      return {
        success: true,
        upsertedCount: result.upsertedCount,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Bulk upsert failed' });
    }
  });

  // PATCH /status-bulk -> Internal route to update availability
  fastify.patch<{ Body: { skus: string[], availability: string } }>('/status-bulk', async (request, reply) => {
    try {
      const { skus, availability } = request.body;
      if (!Array.isArray(skus)) {
        return reply.code(400).send({ success: false, error: 'SKUs must be an array' });
      }

      const result = await Diamond.updateMany(
        { sku: { $in: skus } },
        { $set: { availability } }
      );

      await invalidateSearchCacheAfterCatalogWrite(fastify.log);

      return { success: true, modifiedCount: result.modifiedCount };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: 'Bulk status update failed' });
    }
  });
};

export default catalogRoutes;
