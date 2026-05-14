/**
 * Integration smoke against API gateway (default :8080).
 * After changing supplier-service, rebuild the container or Docker may still run old code:
 *   docker compose build supplier-service && docker compose up -d supplier-service
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

async function assertOk(name, fn) {
  try {
    const result = await fn();
    console.log(`[OK] ${name}`);
    return result;
  } catch (e) {
    console.error(`[FAIL] ${name}`);
    console.error(e?.message ?? e);
    if (e?.body) console.error('body:', JSON.stringify(e.body, null, 2));
    if (
      e?.status === 400 &&
      typeof e?.message === 'string' &&
      e.message.includes('/api/supplier/ingest')
    ) {
      console.error(
        'Hint: supplier-service image may be stale — run: docker compose build supplier-service && docker compose up -d supplier-service'
      );
    }
    process.exitCode = 1;
    throw e;
  }
}

async function waitForHealth() {
  const paths = [
    '/health',
    '/api/user/health',
    '/api/catalog/health',
    '/api/search/health',
    '/api/pricing/health',
    '/api/jewelry/health',
    '/api/order/health',
    '/api/supplier/health',
    '/api/notifications/health',
    '/api/recommendations/health',
  ];

  const deadline = Date.now() + 90_000;
  let lastErr = null;
  // Retry because docker-compose may still be warming up.
  while (Date.now() < deadline) {
    try {
      await Promise.all(paths.map((p) => httpJson(p)));
      return;
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  const hint =
    'Is the full stack up? Try: docker compose up -d --build (gateway :8080, Mongo, Redis, services). ' +
    'If a single /health returns 404, rebuild that service image (e.g. docker compose build notification-service catalog-service && docker compose up -d).';
  const extra = lastErr?.message ? ` Last error: ${lastErr.message}` : '';
  throw new Error(`Health timeout after 90s for ${paths.join(', ')}.${extra} ${hint}`);
}

async function main() {
  console.log(`Smoke target: ${BASE}`);

  await assertOk('health endpoints', async () => {
    await waitForHealth();
  });

  await assertOk('catalog stats', async () => {
    const res = await httpJson('/api/catalog/stats');
    if (!res?.success || typeof res.data?.total !== 'number' || typeof res.data?.inStock !== 'number') {
      throw new Error('Invalid /api/catalog/stats response');
    }
  });

  await assertOk('catalog list with pagination meta', async () => {
    const res = await httpJson('/api/catalog/?limit=1&page=1&sort=score-desc');
    if (!res?.success || !Array.isArray(res.data)) throw new Error('Invalid paginated catalog list');
    if (res.total !== undefined) {
      if (typeof res.total !== 'number' || typeof res.page !== 'number' || typeof res.pages !== 'number') {
        throw new Error('Missing pagination fields (total, page, pages)');
      }
    }
  });

  await assertOk('recommendations match (public)', async () => {
    const settings = await httpJson('/api/jewelry/settings');
    if (!settings?.success || !Array.isArray(settings.data) || settings.data.length === 0) {
      throw new Error('No jewelry settings for recommendations smoke');
    }
    const sku = settings.data[0]?.sku;
    if (!sku || typeof sku !== 'string') throw new Error('Setting SKU missing');
    const enc = encodeURIComponent(sku);
    const rec = await httpJson(`/api/recommendations/match/${enc}`);
    if (!rec?.success || !Array.isArray(rec.data)) throw new Error('Invalid recommendations match response');
  });

  const sessionId = Math.random().toString(36).slice(2, 12);
  const bespokeSessionId = Math.random().toString(36).slice(2, 12);
  const email = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@stonee.local`;
  const password = 'SmokeTest#12345';

  await assertOk('register', async () => {
    // user-service may return non-2xx for duplicate; unique email avoids it.
    await httpJson('/api/user/auth/register', {
      method: 'POST',
      body: { email, password, name: 'Smoke Test', role: 'buyer' },
    });
  });

  const login = await assertOk('login', async () => {
    return await httpJson('/api/user/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  });

  const token = login?.token;
  if (!token) throw new Error('Missing token in login response');

  await assertOk('auth/me (JWT profile)', async () => {
    const res = await httpJson('/api/user/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res?.success || !res.user) throw new Error('Invalid auth/me response');
    if (typeof res.user.email !== 'string' || typeof res.user.role !== 'string') {
      throw new Error('auth/me user missing email or role');
    }
  });

  const searchRes = await httpJson('/api/search/filter?sort=score-desc&minPrice=0&maxPrice=15000&minCarat=0&maxCarat=5');
  const diamonds =
    searchRes?.success && Array.isArray(searchRes.data) ? searchRes.data : [];
  const skipBuyerDiamondFlow = diamonds.length === 0;
  if (skipBuyerDiamondFlow) {
    console.log(
      '[SKIP] Search returned no diamonds — run POST /api/supplier/sync/diamond-atelier or ingest. Skipping cart/checkout/bespoke buyer flows.',
    );
  }

  const diamond = diamonds[0];
  if (!skipBuyerDiamondFlow) {
    if (!diamond?.sku || typeof diamond?.price !== 'number') {
      throw new Error('Invalid diamond payload (expected sku, price)');
    }
  }

  if (!skipBuyerDiamondFlow) {
    await assertOk('cart/add diamond', async () => {
      await httpJson(`/api/order/cart/${sessionId}/add`, {
        method: 'POST',
        body: {
          type: 'diamond',
          productId: diamond.sku,
          price: diamond.price,
          quantity: 1,
        },
      });
    });

    const checkout = await assertOk('checkout', async () => {
      return await httpJson('/api/order/checkout', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          sessionId,
          shippingAddress: {
            fullName: 'Smoke Test',
            addressLine1: '1 Stonee Way',
            city: 'Test City',
            country: 'Testland',
            zipCode: '00000',
          },
        },
      });
    });

    const orderId = checkout?.data?.orderId ?? checkout?.orderId;
    if (!orderId) throw new Error('Missing orderId in checkout response');

    await assertOk('pay order', async () => {
      await httpJson(`/api/order/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    });

    await assertOk('my-orders contains created order', async () => {
      const res = await httpJson('/api/order/my-orders', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res?.success || !Array.isArray(res.data)) throw new Error('Invalid my-orders response');
      const found = res.data.some((o) => o?._id === orderId);
      if (!found) throw new Error(`Order ${orderId} not found in my-orders`);
    });

    // --- Bespoke flow: add bespoke item (diamond + setting) -> checkout -> pay ---
    const settings = await assertOk('jewelry/settings -> pick 1 setting', async () => {
      const res = await httpJson('/api/jewelry/settings');
      if (!res?.success || !Array.isArray(res.data) || res.data.length === 0) {
        throw new Error('No settings returned from jewelry-service');
      }
      return res.data;
    });

    const setting = settings[0];
    if (!setting?.sku || typeof setting?.price !== 'number') {
      throw new Error('Invalid setting payload (expected sku, price)');
    }

    await assertOk('cart/add bespoke', async () => {
      await httpJson(`/api/order/cart/${bespokeSessionId}/add`, {
        method: 'POST',
        body: {
          type: 'bespoke',
          productId: `BESPOKE-${diamond._id ?? diamond.sku}-${setting._id ?? setting.sku}`,
          bespokePair: {
            diamondId: diamond.sku,
            settingId: setting.sku,
          },
          price: diamond.price + setting.price,
          quantity: 1,
        },
      });
    });

    const bespokeCheckout = await assertOk('checkout (bespoke)', async () => {
      return await httpJson('/api/order/checkout', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          sessionId: bespokeSessionId,
          shippingAddress: {
            fullName: 'Smoke Test',
            addressLine1: '1 Stonee Way',
            city: 'Test City',
            country: 'Testland',
            zipCode: '00000',
          },
        },
      });
    });

    const bespokeOrderId = bespokeCheckout?.data?.orderId ?? bespokeCheckout?.orderId;
    if (!bespokeOrderId) throw new Error('Missing orderId in bespoke checkout response');

    await assertOk('pay order (bespoke)', async () => {
      await httpJson(`/api/order/orders/${bespokeOrderId}/pay`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    });
  }

  const supplierEmail = `smoke_sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@stonee.local`;
  const supplierPassword = 'SmokeSupplier#12345';

  const supReg = await assertOk('register supplier', async () => {
    return await httpJson('/api/user/auth/register', {
      method: 'POST',
      body: {
        email: supplierEmail,
        password: supplierPassword,
        name: 'Smoke Supplier',
        role: 'supplier',
        supplierCategory: 'lab_grown_diamond',
        companyName: `Smoke Supplier Co ${Date.now().toString(36)}`,
      },
    });
  });

  const supplierCompanyId = supReg?.company?.id;
  if (!supplierCompanyId) throw new Error('Missing supplier company id from register (company required for suppliers)');

  const supLogin = await assertOk('login supplier', async () => {
    return await httpJson('/api/user/auth/login', {
      method: 'POST',
      body: { email: supplierEmail, password: supplierPassword },
    });
  });

  const supToken = supLogin?.token;
  if (!supToken) throw new Error('Missing supplier token');

  const smokeSku = `SMOKE-SUP-${Date.now()}`;
  const expectedSupplierId = `SUP-${String(supplierCompanyId)}`;

  await assertOk('supplier self/summary matches catalog supplier id', async () => {
    const res = await httpJson('/api/supplier/self/summary', {
      headers: {
        authorization: `Bearer ${supToken}`,
        'x-supplier-company-id': supplierCompanyId,
      },
    });
    if (!res?.success || !res.data) throw new Error('Invalid self/summary response');
    if (res.data.catalogSupplierId !== expectedSupplierId) {
      throw new Error(
        `Expected catalogSupplierId "${expectedSupplierId}", got "${res.data.catalogSupplierId}"`,
      );
    }
    if (String(res.data.supplierCompanyId) !== String(supplierCompanyId)) {
      throw new Error('self/summary supplierCompanyId mismatch');
    }
  });

  await assertOk('supplier self-ingest stonee-json', async () => {
    const diamond = {
      sku: smokeSku,
      shape: 'Round',
      carat: 0.5,
      color: 'H',
      clarity: 'VS2',
      cut: 'Very Good',
      depthPercentage: 61,
      tablePercentage: 56,
      symmetry: 'Very Good',
      polish: 'Very Good',
      fluorescence: 'Faint',
      measurements: '5.2x5.2x3.1',
      lxwRatio: 1,
      lab: 'IGI',
      certificateNumber: `SMOKE-IGI-${smokeSku}`,
      images: [],
      price: 900,
      supplierPrice: 500,
      availability: 'in-stock',
    };
    return await httpJson('/api/supplier/ingest/stonee-json', {
      method: 'POST',
      headers: { authorization: `Bearer ${supToken}` },
      body: { diamonds: [diamond] },
    });
  });

  await assertOk('catalog diamond has trusted supplierId', async () => {
    const res = await httpJson(`/api/catalog/${encodeURIComponent(smokeSku)}`);
    const sid = res?.data?.supplierId;
    if (sid !== expectedSupplierId) {
      throw new Error(`Expected supplierId "${expectedSupplierId}", got "${sid}"`);
    }
  });

  await assertOk('catalog list filtered by supplierId (partner inventory)', async () => {
    const q = new URLSearchParams({
      supplierId: expectedSupplierId,
      limit: '50',
      sort: 'createdAt-desc',
    });
    const res = await httpJson(`/api/catalog/?${q.toString()}`);
    if (!res?.success || !Array.isArray(res.data)) {
      throw new Error('Invalid catalog list with supplierId');
    }
    if (!res.data.some((d) => d?.sku === smokeSku)) {
      throw new Error(`supplierId filter did not return smoke sku ${smokeSku}`);
    }
  });

  await assertOk('search shows ingested sku after cache invalidation', async () => {
    const res = await httpJson(`/api/search/filter?sku=${encodeURIComponent(smokeSku)}`);
    if (!res?.success || !Array.isArray(res.data)) {
      throw new Error('Invalid search response');
    }
    if (!res.data.some((d) => d?.sku === smokeSku)) {
      throw new Error(`Search did not return sku ${smokeSku} (cache/catalog mismatch)`);
    }
  });

  console.log('Smoke OK');
}

main().catch(() => {
  if (!process.exitCode) process.exitCode = 1;
});

