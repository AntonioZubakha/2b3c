/**
 * Dev/staging helper: docker compose up → seed users + wipe catalog → write .env supplier id →
 * recreate supplier-service → login as da@local.com → POST Diamond Atelier sync via gateway.
 *
 * Requires: Docker, pnpm seed deps, port 8080 (gateway) and 27018 (Mongo host map).
 *
 * Optional env (defaults match Diamond Atelier test API from partner docs):
 *   DIAMOND_ATELIER_USER_NAME, DIAMOND_ATELIER_PASSWORD, DIAMOND_ATELIER_BASE_URL
 *   GATEWAY_URL (default http://127.0.0.1:8080)
 *   DA_LOGIN_EMAIL / DA_LOGIN_PASSWORD (default da@local.com / 12345qwert from seed:core)
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const GATEWAY = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';

function run(cmd, inherit = true) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function runOut(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', env: { ...process.env } });
}

function upsertEnvLine(key, value) {
  let text = '';
  if (existsSync(ENV_PATH)) text = readFileSync(ENV_PATH, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const next = [];
  let seen = false;
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      next.push(`${key}=${value}`);
      seen = true;
    } else {
      next.push(line);
    }
  }
  if (!seen) next.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, next.join('\n') + '\n', 'utf8');
}

function ensureBaseEnv() {
  const defaults = {
    JWT_SECRET: 'changeme_prod_secret',
    DIAMOND_ATELIER_BASE_URL:
      process.env.DIAMOND_ATELIER_BASE_URL ||
      'https://api.diamondatelier.in:6023/api/GetStockList/GetStockListCertified',
    DIAMOND_ATELIER_USER_NAME: process.env.DIAMOND_ATELIER_USER_NAME || 'diamond_atelier',
    DIAMOND_ATELIER_PASSWORD: process.env.DIAMOND_ATELIER_PASSWORD || 'DA@2025',
  };
  if (!existsSync(ENV_PATH)) {
    writeFileSync(
      ENV_PATH,
      Object.entries(defaults)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n',
      'utf8',
    );
    console.log('Created .env with JWT + Diamond Atelier API defaults (local dev).');
    return;
  }
  let text = readFileSync(ENV_PATH, 'utf8');
  for (const [k, v] of Object.entries(defaults)) {
    if (!new RegExp(`^${k}=`, 'm').test(text)) {
      text += `${k}=${v}\n`;
    }
  }
  writeFileSync(ENV_PATH, text, 'utf8');
  console.log('Merged missing keys into .env');
}

async function waitGateway(ms = 120_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${GATEWAY}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Gateway not reachable at ${GATEWAY}/health within ${ms}ms`);
}

async function main() {
  console.log('=== 1) Ensure .env (JWT + Diamond Atelier API) ===');
  ensureBaseEnv();

  console.log('=== 2) docker compose up -d ===');
  run('docker compose up -d', true);

  console.log('=== 3) Wait for gateway health ===');
  await waitGateway();

  console.log('=== 4) pnpm seed:core (users + wipe catalog + cache hint) ===');
  const seedOut = runOut('pnpm seed:core');
  console.log(seedOut);
  const mCo = seedOut.match(/DIAMOND_ATELIER_SUPPLIER_COMPANY_ID=([a-f0-9]{24})/i);
  const mUs = seedOut.match(/DIAMOND_ATELIER_SUPPLIER_USER_ID=([a-f0-9]{24})/i);
  if (mCo) {
    upsertEnvLine('DIAMOND_ATELIER_SUPPLIER_COMPANY_ID', mCo[1]);
    console.log('Wrote DIAMOND_ATELIER_SUPPLIER_COMPANY_ID to .env');
  } else if (mUs) {
    upsertEnvLine('DIAMOND_ATELIER_SUPPLIER_USER_ID', mUs[1]);
    console.log('Wrote DIAMOND_ATELIER_SUPPLIER_USER_ID to .env (legacy seed output)');
  } else {
    throw new Error('Could not parse DIAMOND_ATELIER_SUPPLIER_COMPANY_ID or USER_ID from seed output');
  }

  console.log('=== 5) Recreate supplier-service (pick up .env) ===');
  run('docker compose up -d --force-recreate supplier-service', true);

  console.log('=== 6) Wait gateway again ===');
  await waitGateway(60_000);

  const daEmail = process.env.DA_LOGIN_EMAIL || 'da@local.com';
  const daPassword = process.env.DA_LOGIN_PASSWORD || '12345qwert';

  console.log('=== 7) Login as', daEmail, '===');
  const loginRes = await fetch(`${GATEWAY}/api/user/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: daEmail, password: daPassword }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    console.error(loginJson);
    throw new Error(`Login failed HTTP ${loginRes.status}`);
  }
  const token = loginJson.token;
  if (!token) throw new Error('No token in login response');

  console.log('=== 8) Diamond Atelier sync (may take several minutes) ===');
  const syncRes = await fetch(`${GATEWAY}/api/supplier/sync/diamond-atelier`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ maxPages: 50 }),
    signal: AbortSignal.timeout(600_000),
  });
  const syncJson = await syncRes.json().catch(() => ({}));
  if (!syncRes.ok) {
    console.error(syncJson);
    throw new Error(`Sync failed HTTP ${syncRes.status}`);
  }
  console.log('Sync response:', JSON.stringify(syncJson, null, 2));

  console.log('');
  console.log('Done. Open http://localhost:3000/marketplace (or your frontend URL) and refresh.');
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
