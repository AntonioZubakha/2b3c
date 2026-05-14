import Fastify, { type FastifyBaseLogger } from 'fastify';
import axios from 'axios';
import type { IDiamond } from '@stonee/shared-types';
import { calculateDiamondScore } from './services/scoringEngine.js';

const fastify = Fastify({ logger: true });

const DEAL_BADGE_LABEL: Record<string, string> = {
  'best-value': 'BEST VALUE',
  'fair-deal': 'FAIR DEAL',
  'premium-cut': 'PREMIUM CUT',
  overpriced: 'OVERPRICED',
};

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3000';
const JEWELRY_SERVICE_URL = process.env.JEWELRY_SERVICE_URL || 'http://jewelry-service:3000';

const http = axios.create({
  timeout: 12_000,
});

function formatDealBadge(badge: string): string {
  return DEAL_BADGE_LABEL[badge] ?? badge.replace(/-/g, ' ').toUpperCase();
}

async function withUpstreamRetry<T>(
  log: FastifyBaseLogger,
  label: string,
  fn: () => Promise<T>,
  retries = 6
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable =
        axios.isAxiosError(e) &&
        (e.code === 'ECONNREFUSED' ||
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT' ||
          e.code === 'EAI_AGAIN' ||
          e.response?.status === 502 ||
          e.response?.status === 503);
      if (!retryable || i === retries - 1) throw e;
      const wait = 400 * (i + 1);
      log.warn({ err: e, label, attempt: i + 1, waitMs: wait }, 'upstream transient error, retrying');
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

fastify.get('/health', async () => {
  return { status: 'healthy', service: 'pricing-service' };
});

/** Single-stone score (catalog seeding & supplier enrichment). */
fastify.post('/calculate-score', async (request, reply) => {
  try {
    const body = request.body as Partial<IDiamond>;
    const { score, badge } = calculateDiamondScore(body as IDiamond);
    const label = DEAL_BADGE_LABEL[badge] ?? badge.replace(/-/g, ' ').toUpperCase();
    return { score, badge: label };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(400).send({ error: 'Invalid diamond payload for scoring' });
  }
});

// 2. Validate current prices for a list of items
fastify.post('/validate-prices', async (request, reply) => {
  try {
    const { items } = request.body as { items: any[] };
    const validatedItems = await Promise.all(items.map(async (item) => {
      let currentPrice = item.price;

      if (item.type === 'diamond') {
        const res = await withUpstreamRetry(fastify.log, `catalog:${item.productId}`, () =>
          http.get(`${CATALOG_SERVICE_URL}/${item.productId}`)
        );
        currentPrice = res.data.data.price;
      } else if (item.type === 'setting') {
        const res = await withUpstreamRetry(fastify.log, `setting:${item.productId}`, () =>
          http.get(`${JEWELRY_SERVICE_URL}/settings/${item.productId}`)
        );
        currentPrice = res.data.data.price;
      } else if (item.type === 'bespoke') {
        const [dRes, sRes] = await Promise.all([
          withUpstreamRetry(fastify.log, `catalog:${item.bespokePair.diamondId}`, () =>
            http.get(`${CATALOG_SERVICE_URL}/${item.bespokePair.diamondId}`)
          ),
          withUpstreamRetry(fastify.log, `setting:${item.bespokePair.settingId}`, () =>
            http.get(`${JEWELRY_SERVICE_URL}/settings/${item.bespokePair.settingId}`)
          ),
        ]);
        currentPrice = dRes.data.data.price + sRes.data.data.price;
      } else if (item.type === 'jewelry') {
        const res = await withUpstreamRetry(fastify.log, `jewelry:${item.productId}`, () =>
          http.get(`${JEWELRY_SERVICE_URL}/collections/${item.productId}`)
        );
        currentPrice = res.data.data.price;
      }

      return { ...item, price: currentPrice };
    }));

    const totalAmount = validatedItems.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);
    return { success: true, items: validatedItems, totalAmount };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ success: false, error: 'Price validation failed' });
  }
});

/**
 * RECALCULATE-ALL: Mass update for Stage 1 MVP
 * Fetches all stones, applies new AI Scorer, and pushes back to Catalog
 */
fastify.post('/recalculate-all', async (request, reply) => {
  fastify.log.info('Starting mass diamond re-calculation...');
  
  try {
    // 1. Fetch all diamonds (can be large; bounded wait)
    const catalogRes = await http.get(`${CATALOG_SERVICE_URL}/`, { timeout: 120_000 });
    const diamonds = catalogRes.data.data;

    if (!Array.isArray(diamonds)) {
      throw new Error('Invalid response from catalog service');
    }

    fastify.log.info(`Processing ${diamonds.length} diamonds...`);

    // 2. Score and map to bulk update format
    const updates = diamonds.map((d: any) => {
      const { score, badge } = calculateDiamondScore(d);
      return {
        sku: d.sku,
        diamondScore: score,
        dealBadge: formatDealBadge(badge),
      };
    });

    // 3. Push back to catalog
    const bulkRes = await http.post(
      `${CATALOG_SERVICE_URL}/bulk-upsert`,
      { diamonds: updates },
      { timeout: 120_000 },
    );

    return {
      success: true,
      processedCount: diamonds.length,
      catalogResponse: bulkRes.data
    };

  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ 
      success: false, 
      error: error.message,
      details: error.response?.data 
    });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Pricing Service is running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
