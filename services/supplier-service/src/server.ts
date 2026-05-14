import Fastify from 'fastify';
import axios from 'axios';
import mongoose from 'mongoose';
import {
  assertDiamondAtelierSyncAllowed,
  assertStaffIngestAllowed,
  assertSupplierSelfIngest,
  supplierMayUseDiamondAtelierEnvBinding,
  trustedSupplierCatalogId,
} from './ingestAuth.js';
import { verifyBearerJwt } from './verifyBearerJwt.js';
import { canRunSupplierIngest, isSupplierRole } from '@stonee/shared-types';
import FeedSyncState from './models/FeedSyncState.js';
import { runDiamondAtelierSync } from './diamondAtelierSync.js';

const MAX_DIAMONDS_PER_JSON_INGEST = Math.min(
  10_000,
  Math.max(1, parseInt(process.env.MAX_DIAMONDS_PER_JSON_INGEST || '3000', 10) || 3000),
);

const rawBodyLimit = process.env.SUPPLIER_BODY_LIMIT_BYTES
  ? parseInt(process.env.SUPPLIER_BODY_LIMIT_BYTES, 10)
  : NaN;
const bodyLimitBytes = Number.isFinite(rawBodyLimit)
  ? Math.min(20 * 1024 * 1024, Math.max(256 * 1024, rawBodyLimit))
  : 6 * 1024 * 1024;

const fastify = Fastify({
  logger: true,
  bodyLimit: bodyLimitBytes,
});

const postAuth = { preHandler: [verifyBearerJwt] };

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3000';
const PRICING_SERVICE_URL = process.env.PRICING_SERVICE_URL || 'http://pricing-service:3000';

/** Axios instance with a sensible default timeout for internal service calls. */
const http = axios.create({ timeout: 30_000 });

const SUPPLIER_META_MONGO_URI =
  process.env.SUPPLIER_META_MONGO_URI || 'mongodb://mongodb:27017/stonee_supplier_meta';

async function recalculateScores() {
  try {
    await axios.post(`${PRICING_SERVICE_URL}/recalculate-all`, {}, { timeout: 120_000 });
    fastify.log.info('Pricing recalculate-all completed after supplier ingest');
  } catch (err) {
    fastify.log.error({ err }, 'recalculate-all failed (catalog still updated)');
  }
}

type RegistryFeedRow = { id: string; label: string; method: string; path: string; product: string };

const REGISTRY_FEEDS_ALL: RegistryFeedRow[] = [
  {
    id: 'diamond-atelier-certified',
    label: 'Diamond Atelier — GetStockListCertified (lab-grown stock)',
    method: 'POST',
    path: '/sync/diamond-atelier',
    product: 'diamonds',
  },
  {
    id: 'partner-self-json',
    label: 'Partner catalog JSON (your account → fixed supplierId in catalog)',
    method: 'POST',
    path: '/ingest/stonee-json',
    product: 'diamonds',
  },
  {
    id: 'stonee-json',
    label: 'Partner JSON already in Stonee catalog field names',
    method: 'POST',
    path: '/ingest/stonee-json',
    product: 'diamonds',
  },
  {
    id: 'http-feed',
    label: 'Pull JSON from partner HTTPS URL (Stonee-shaped body)',
    method: 'POST',
    path: '/ingest/http-feed',
    product: 'diamonds',
  },
];

function registryAuthBlurb(includeDiamondAtelier: boolean): string {
  const base =
    'Suppliers: POST /ingest/stonee-json or /ingest/http-feed with your JWT; supplierId is derived from your active supplier company (x-supplier-company-id from gateway when you belong to several). ';
  const da = includeDiamondAtelier
    ? 'Diamond Atelier bulk sync: POST /sync/diamond-atelier only for the supplier company bound in server env (DIAMOND_ATELIER_SUPPLIER_COMPANY_ID or legacy user id). '
    : 'Diamond Atelier bulk sync is not available for your company — use JSON/HTTP ingest for your inventory. ';
  const staff = process.env.SUPPLIER_INGEST_TOKEN
    ? 'Staff must send x-stonee-ingest-token for staff-only routes.'
    : 'Optional x-stonee-ingest-token not configured — tighten for production.';
  return base + da + staff;
}

fastify.get('/registry', async () => {
  return {
    success: true,
    data: {
      feeds: [...REGISTRY_FEEDS_ALL],
      auth: registryAuthBlurb(true),
    },
  };
});

fastify.post<{ Body: { maxPages?: number } }>('/sync/diamond-atelier', postAuth, async (request, reply) => {
  if (!assertDiamondAtelierSyncAllowed(request, reply)) return;
  const maxPages =
    request.body?.maxPages != null ? Math.min(500, Math.max(1, Number(request.body.maxPages) || 1)) : undefined;
  const out = await runDiamondAtelierSync(fastify.log, maxPages !== undefined ? { maxPages } : undefined);
  if (!out.success) {
    return reply.code(502).send({ success: false, error: out.error ?? 'Sync failed', data: out });
  }
  return { success: true, data: out };
});

fastify.get('/admin/diamond-atelier-status', postAuth, async (request, reply) => {
  if (!assertStaffIngestAllowed(request, reply)) return;
  const doc = await FeedSyncState.findOne({ source: 'diamond-atelier' }).lean();
  const baseConfigured = Boolean(
    process.env.DIAMOND_ATELIER_USER_NAME &&
      process.env.DIAMOND_ATELIER_PASSWORD &&
      (process.env.DIAMOND_ATELIER_SUPPLIER_COMPANY_ID || process.env.DIAMOND_ATELIER_SUPPLIER_USER_ID),
  );
  return {
    success: true,
    data: {
      envConfigured: baseConfigured,
      baseUrl: process.env.DIAMOND_ATELIER_BASE_URL || '(default Diamond Atelier host)',
      supplierCompanyIdSet: Boolean(process.env.DIAMOND_ATELIER_SUPPLIER_COMPANY_ID),
      supplierUserIdSet: Boolean(process.env.DIAMOND_ATELIER_SUPPLIER_USER_ID),
      last: doc ?? null,
    },
  };
});

fastify.get('/self/summary', postAuth, async (request, reply) => {
  if (!assertSupplierSelfIngest(request, reply)) return;
  const companyId = String(request.headers['x-supplier-company-id'] || '');
  const catalogSupplierId = trustedSupplierCatalogId(request);
  const canSyncDiamondAtelier = supplierMayUseDiamondAtelierEnvBinding(request);
  const doc = canSyncDiamondAtelier
    ? await FeedSyncState.findOne({ source: 'diamond-atelier' }).lean()
    : null;
  return {
    success: true,
    data: {
      supplierCompanyId: companyId,
      catalogSupplierId,
      canSyncDiamondAtelier,
      diamondAtelierFeed: doc ?? null,
    },
  };
});

/** Ingestion registry rows relevant to this supplier company (no Diamond Atelier row unless env-bound to this company). */
fastify.get('/self/registry', postAuth, async (request, reply) => {
  if (!assertSupplierSelfIngest(request, reply)) return;
  const includeDa = supplierMayUseDiamondAtelierEnvBinding(request);
  const feeds = REGISTRY_FEEDS_ALL.filter(f => f.id !== 'diamond-atelier-certified' || includeDa);
  return {
    success: true,
    data: {
      feeds,
      auth: registryAuthBlurb(includeDa),
    },
  };
});

fastify.post<{ Body: { supplierId?: string; diamonds: unknown[] } }>('/ingest/stonee-json', postAuth, async (request, reply) => {
  const role = request.headers['x-user-role'] as string | undefined;
  const diamonds = request.body?.diamonds;
  if (!Array.isArray(diamonds)) {
    return reply.code(400).send({ success: false, error: 'diamonds[] required' });
  }
  if (diamonds.length > MAX_DIAMONDS_PER_JSON_INGEST) {
    return reply.code(400).send({
      success: false,
      error: `Too many diamonds in one request (max ${MAX_DIAMONDS_PER_JSON_INGEST})`,
    });
  }

  let supplierId: string;
  if (isSupplierRole(role)) {
    if (!assertSupplierSelfIngest(request, reply)) return;
    const sid = trustedSupplierCatalogId(request);
    if (!sid) {
      return reply.code(401).send({ success: false, error: 'Missing authenticated user' });
    }
    supplierId = sid;
  } else if (canRunSupplierIngest(role)) {
    if (!assertStaffIngestAllowed(request, reply)) return;
    const bodySid = request.body?.supplierId;
    if (!bodySid || typeof bodySid !== 'string') {
      return reply.code(400).send({ success: false, error: 'supplierId required for staff ingest' });
    }
    supplierId = bodySid;
  } else {
    return reply.code(403).send({ success: false, error: 'Not allowed to run catalog ingest' });
  }

  try {
    const stamped = diamonds.map(d => ({
      ...(d && typeof d === 'object' ? (d as Record<string, unknown>) : {}),
      supplierId,
    }));
    const response = await http.post(`${CATALOG_SERVICE_URL}/bulk-upsert`, { diamonds: stamped });
    void recalculateScores();
    return { success: true, catalogResponse: response.data };
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    fastify.log.error({ err }, 'stonee-json ingest failed');
    return reply.code(500).send({ success: false, error: err.message, details: err.response?.data });
  }
});

fastify.post<{ Body: { url: string; supplierId?: string; headers?: Record<string, string> } }>(
  '/ingest/http-feed',
  postAuth,
  async (request, reply) => {
    const role = request.headers['x-user-role'] as string | undefined;
    let supplierId: string;
    let url: string;
    let headers: Record<string, string> | undefined;

    if (isSupplierRole(role)) {
      if (!assertSupplierSelfIngest(request, reply)) return;
      const sid = trustedSupplierCatalogId(request);
      if (!sid) {
        return reply.code(401).send({ success: false, error: 'Missing authenticated user' });
      }
      supplierId = sid;
      ({ url, headers } = request.body ?? {});
      if (!url || typeof url !== 'string') {
        return reply.code(400).send({ success: false, error: 'url required' });
      }
    } else if (canRunSupplierIngest(role)) {
      if (!assertStaffIngestAllowed(request, reply)) return;
      const body = request.body ?? {};
      const staffUrl = body.url;
      const staffSupplierId = body.supplierId;
      headers = body.headers;
      if (!staffUrl || typeof staffUrl !== 'string' || !staffSupplierId || typeof staffSupplierId !== 'string') {
        return reply.code(400).send({ success: false, error: 'url and supplierId required' });
      }
      url = staffUrl;
      supplierId = staffSupplierId;
    } else {
      return reply.code(403).send({ success: false, error: 'Not allowed to run catalog ingest' });
    }

    try {
      const res = await axios.get(url, {
        headers: { accept: 'application/json', ...headers },
        timeout: 60_000,
      });

      const payload = res.data as unknown;
      let diamonds: unknown[] = [];
      if (Array.isArray(payload)) {
        diamonds = payload;
      } else if (
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { diamonds?: unknown[] }).diamonds)
      ) {
        diamonds = (payload as { diamonds: unknown[] }).diamonds;
      } else {
        return reply.code(400).send({ success: false, error: 'Expected JSON array or { diamonds: [] }' });
      }

      if (diamonds.length > MAX_DIAMONDS_PER_JSON_INGEST) {
        return reply.code(400).send({
          success: false,
          error: `Feed too large (max ${MAX_DIAMONDS_PER_JSON_INGEST} diamonds per request)`,
        });
      }

      const stamped = diamonds.map(d => ({
        ...(d && typeof d === 'object' ? (d as Record<string, unknown>) : {}),
        supplierId,
      }));
      const cat = await http.post(`${CATALOG_SERVICE_URL}/bulk-upsert`, { diamonds: stamped });
      void recalculateScores();
      return { success: true, pulled: diamonds.length, catalogResponse: cat.data };
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: unknown } };
      fastify.log.error({ err }, 'http-feed ingest failed');
      return reply.code(500).send({ success: false, error: err.message, details: err.response?.data });
    }
  },
);

fastify.get('/health', async () => {
  return { status: 'Supplier Service is healthy' };
});

const start = async () => {
  try {
    await mongoose.connect(SUPPLIER_META_MONGO_URI);
    fastify.log.info(`Supplier meta MongoDB: ${SUPPLIER_META_MONGO_URI.replace(/:[^:@/]+@/, ':***@')}`);
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info('Supplier Service is running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
