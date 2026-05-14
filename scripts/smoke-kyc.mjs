/**
 * Optional KYC gate E2E against a running gateway (default :8080).
 *
 * Prerequisites (docker-compose / order-service + user-service):
 * - STONEE_KYC_ENFORCE_MIN_USD must match the numeric threshold you pass (see below).
 * - STONEE_INTERNAL_SECRET set on both user-service and order-service (otherwise gate is skipped).
 * - STONEE_ALLOW_KYC_SELF_VERIFY=true on user-service so this script can flip buyer to verified.
 *
 * Usage:
 *   KYC_SMOKE_MIN_USD=5000 node scripts/smoke-kyc.mjs
 *   node scripts/smoke-kyc.mjs 5000
 *
 * Picks a catalog diamond with price >= threshold via search; fails fast if seed data is too cheap.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(path, { method = 'GET', headers = {}, body } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJson: true, text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${method} ${path}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Like httpJson but returns { ok, status, json } without throwing. */
async function httpJsonRaw(path, { method = 'GET', headers = {}, body } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJson: true, text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function assertOk(name, fn) {
  try {
    const result = await fn();
    console.log(`[OK] ${name}`);
    return result;
  } catch (e) {
    console.error(`[FAIL] ${name}`);
    console.error(e?.message ?? e);
    if (e?.body) console.error('body:', JSON.stringify(e.body, null, 2));
    process.exitCode = 1;
    throw e;
  }
}

async function waitForHealth() {
  const paths = [
    '/health',
    '/api/user/health',
    '/api/search/health',
    '/api/pricing/health',
    '/api/jewelry/health',
    '/api/order/health',
    '/api/supplier/health',
  ];
  const deadline = Date.now() + 90_000;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      await Promise.all(paths.map((p) => httpJson(p)));
      return;
    } catch (e) {
      lastErr = e;
    }
    await sleep(1000);
  }
  throw new Error(`Health timeout: ${paths.join(', ')}. ${lastErr?.message ?? ''}`);
}

function parseMinUsd() {
  const fromEnv = process.env.KYC_SMOKE_MIN_USD;
  const fromArg = process.argv[2];
  const raw = fromEnv ?? fromArg ?? '';
  const n = Number.parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function main() {
  const MIN = parseMinUsd();
  if (MIN == null) {
    console.log(
      'Skip: set KYC_SMOKE_MIN_USD (or pass as first arg) to match STONEE_KYC_ENFORCE_MIN_USD in order-service.',
    );
    return;
  }

  console.log(`KYC smoke target: ${BASE}  (threshold USD >= ${MIN})`);

  await assertOk('health', () => waitForHealth());

  const email = `kyc_smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@stonee.local`;
  const password = 'KycSmoke#12345';

  await assertOk('register buyer', async () => {
    await httpJson('/api/user/auth/register', {
      method: 'POST',
      body: { email, password, name: 'KYC Smoke', role: 'buyer' },
    });
  });

  const login = await assertOk('login', async () => {
    return await httpJson('/api/user/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  });
  const token = login?.token;
  if (!token) throw new Error('Missing token');

  const search = await assertOk(`search diamond price >= ${MIN}`, async () => {
    const res = await httpJson(
      `/api/search/filter?sort=price-desc&minPrice=${encodeURIComponent(String(MIN))}&maxPrice=999999999&minCarat=0&maxCarat=50`,
    );
    if (!res?.success || !Array.isArray(res.data) || res.data.length === 0) {
      throw new Error(
        `No diamonds with price >= ${MIN}. Lower KYC_SMOKE_MIN_USD or seed pricier stones in jewelry/catalog.`,
      );
    }
    const d = res.data[0];
    if (typeof d?.sku !== 'string' || typeof d?.price !== 'number' || d.price < MIN) {
      throw new Error(`First result invalid or below ${MIN}: ${JSON.stringify(d?.sku)}`);
    }
    return d;
  });

  const sessionId = `kyc_${Math.random().toString(36).slice(2, 14)}`;
  await assertOk('cart add (high-ticket)', async () => {
    await httpJson(`/api/order/cart/${sessionId}/add`, {
      method: 'POST',
      body: {
        type: 'diamond',
        productId: search.sku,
        price: search.price,
        quantity: 1,
      },
    });
  });

  const ship = {
    fullName: 'KYC Smoke',
    addressLine1: '1 Gate Way',
    city: 'Dubai',
    country: 'AE',
    zipCode: '00000',
  };

  await assertOk('checkout blocked (403 kyc_required)', async () => {
    const { ok, status, json } = await httpJsonRaw('/api/order/checkout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { sessionId, shippingAddress: ship },
    });
    if (status !== 403 || json?.code !== 'kyc_required') {
      throw new Error(
        `Expected 403 + code kyc_required, got ${status} ${JSON.stringify(json)} — is STONEE_KYC_ENFORCE_MIN_USD<=${MIN} and STONEE_INTERNAL_SECRET set on services?`,
      );
    }
    if (ok) throw new Error('Unexpected 2xx');
  });

  const self = await httpJsonRaw('/api/user/auth/kyc/self-verify', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!self.ok) {
    console.error(`[FAIL] self-verify HTTP ${self.status}`, self.json);
    throw new Error(
      'KYC self-verify failed — set STONEE_ALLOW_KYC_SELF_VERIFY=true on user-service for this smoke.',
    );
  }
  console.log('[OK] self-verify (dev bypass)');

  await assertOk('checkout succeeds after verify', async () => {
    return await httpJson('/api/order/checkout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { sessionId, shippingAddress: ship },
    });
  });

  console.log('KYC smoke OK');
}

main().catch(() => {
  if (!process.exitCode) process.exitCode = 1;
});
