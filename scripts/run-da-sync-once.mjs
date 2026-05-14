/** Login da@local.com (seed defaults) and POST Diamond Atelier sync via gateway. */
const GATEWAY = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';
const email = process.env.DA_LOGIN_EMAIL || 'da@local.com';
const password = process.env.DA_LOGIN_PASSWORD || '12345qwert';

const loginRes = await fetch(`${GATEWAY}/api/user/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const loginJson = await loginRes.json().catch(() => ({}));
if (!loginRes.ok) {
  console.error(loginJson);
  process.exit(1);
}
const token = loginJson.token;
if (!token) {
  console.error('No token');
  process.exit(1);
}

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
console.log(JSON.stringify(syncJson, null, 2));
if (!syncRes.ok) process.exit(1);
