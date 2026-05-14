/**
 * 1) Wipes `users` in the user DB and inserts exactly two accounts:
 *    - Stonee staff (stonee_admin)
 *    - Diamond Atelier supplier (lab_grown_diamond)
 * 2) Creates supplier company + owner membership (catalog supplierId = SUP-<companyId>)
 * 3) Wipes all rows in catalog `diamonds` (removes old seed / smoke SMOKE-SUP-* / etc.)
 * 4) Tries to invalidate search-service Redis (needs search reachable — see docker-compose port 3005)
 *
 * Usage (from repo root):
 *   pnpm seed:core
 *
 * Env (optional):
 *   SEED_MONGO_URI (default mongodb://127.0.0.1:27018/stonee_users)
 *   SEED_CATALOG_MONGO_URI — override catalog DB URI (default: same host/port, DB stonee_catalog)
 *   SEED_SKIP_CATALOG_WIPE=1 — do not delete diamonds
 *   SEED_STONEE_ADMIN_EMAIL / SEED_STONEE_ADMIN_PASSWORD
 *   SEED_DA_EMAIL / SEED_DA_PASSWORD (or SEED_DA_SUPPLIER_PASSWORD)
 *   SEED_SEARCH_SERVICE_URL — default http://127.0.0.1:3005 (search-service /internal/...)
 *   STONEE_CACHE_INVALIDATE_SECRET — send as x-stonee-cache-invalidate if set (match search-service env)
 *
 * Defaults: admin@local.com + da@local.com, password 12345qwert (override in production).
 */
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';

const uri = process.env.SEED_MONGO_URI || 'mongodb://127.0.0.1:27018/stonee_users';
const defaultPassword = '12345qwert';
const adminEmail = process.env.SEED_STONEE_ADMIN_EMAIL || 'admin@local.com';
const adminPassword = process.env.SEED_STONEE_ADMIN_PASSWORD || defaultPassword;
const daEmail = process.env.SEED_DA_EMAIL || 'da@local.com';
const daPassword = process.env.SEED_DA_SUPPLIER_PASSWORD || process.env.SEED_DA_PASSWORD || defaultPassword;

function catalogMongoUriFromUsersUri(usersUri) {
  if (process.env.SEED_CATALOG_MONGO_URI) return process.env.SEED_CATALOG_MONGO_URI;
  if (usersUri.includes('/stonee_users')) return usersUri.replace('/stonee_users', '/stonee_catalog');
  const trimmed = usersUri.replace(/\/?$/, '');
  return `${trimmed}/stonee_catalog`;
}

async function wipeCatalogDiamonds() {
  if (process.env.SEED_SKIP_CATALOG_WIPE === '1') {
    console.log('Skipping catalog diamond wipe (SEED_SKIP_CATALOG_WIPE=1).');
    return;
  }
  const catUri = catalogMongoUriFromUsersUri(uri);
  const catClient = new MongoClient(catUri);
  await catClient.connect();
  try {
    const wiped = await catClient.db().collection('diamonds').deleteMany({});
    console.log(`Removed ${wiped.deletedCount} diamond document(s) from catalog (${catUri}).`);
  } finally {
    await catClient.close();
  }
}

async function tryInvalidateSearchCache() {
  const base = (process.env.SEED_SEARCH_SERVICE_URL || 'http://127.0.0.1:3005').replace(/\/$/, '');
  const secret = process.env.STONEE_CACHE_INVALIDATE_SECRET || '';
  const url = `${base}/internal/invalidate-search-cache`;
  try {
    const headers = {};
    if (secret) headers['x-stonee-cache-invalidate'] = secret;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      console.log('Search Redis cache invalidated.');
      return;
    }
    console.warn(
      `Search cache invalidation returned HTTP ${res.status}. Marketplace may show stale listings until Redis TTL expires or search-service is restarted.`,
    );
  } catch (e) {
    console.warn('Search cache invalidation failed:', e?.message ?? e);
    console.warn(
      'Tip: start the stack and expose search on :3005 (see docker-compose), or restart search-service + redis after wiping catalog.',
    );
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const users = db.collection('users');
    const companies = db.collection('supplier_companies');
    const members = db.collection('supplier_company_members');

    await members.deleteMany({});
    await companies.deleteMany({});
    const r = await users.deleteMany({});
    console.log(`Removed ${r.deletedCount} user document(s).`);

    const adminHash = await bcrypt.hash(adminPassword, 10);
    const daHash = await bcrypt.hash(daPassword, 10);
    const now = new Date();

    const adminIns = await users.insertOne({
      email: adminEmail,
      passwordHash: adminHash,
      role: 'stonee_admin',
      name: 'Stonee Admin',
      kycStatus: 'not_required',
      createdAt: now,
      updatedAt: now,
    });

    const daIns = await users.insertOne({
      email: daEmail,
      passwordHash: daHash,
      role: 'supplier',
      name: 'Diamond Atelier',
      supplierCategory: 'lab_grown_diamond',
      kycStatus: 'not_required',
      createdAt: now,
      updatedAt: now,
    });

    const compIns = await companies.insertOne({
      name: 'Diamond Atelier',
      supplierCategory: 'lab_grown_diamond',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await members.insertOne({
      company: compIns.insertedId,
      user: daIns.insertedId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    console.log('Created Stonee admin:', adminEmail, 'id=', adminIns.insertedId.toString());
    console.log('Created Diamond Atelier supplier:', daEmail, 'id=', daIns.insertedId.toString());
    console.log('Created supplier company id=', compIns.insertedId.toString());
    console.log('');
    console.log('Add to .env / docker-compose for supplier-service (preferred):');
    console.log(`DIAMOND_ATELIER_SUPPLIER_COMPANY_ID=${compIns.insertedId.toString()}`);
    console.log('Legacy (user-based catalog id, deprecated):');
    console.log(`DIAMOND_ATELIER_SUPPLIER_USER_ID=${daIns.insertedId.toString()}`);
  } finally {
    await client.close();
  }

  await wipeCatalogDiamonds();
  await tryInvalidateSearchCache();

  console.log('');
  console.log(
    'Next: set DIAMOND_ATELIER_SUPPLIER_COMPANY_ID in .env, restart supplier-service, then run Diamond Atelier sync (supplier portal or POST /api/supplier/sync/diamond-atelier).',
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
