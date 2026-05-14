#!/usr/bin/env node
/**
 * Production deploy gates.
 * Usage:
 *   pnpm run check:prod-gateway
 *     → requires STONEE_CORS_ORIGINS (non-empty)
 *   pnpm run check:prod-gateway:strict
 *     → CORS + JWT_SECRET not missing / not default `changeme`
 * See info/SECURITY.md.
 */

const requireCors = process.argv.includes('--require-cors-env');
const strict = process.argv.includes('--strict');

if (!requireCors) {
  console.error('Usage:');
  console.error('  pnpm run check:prod-gateway');
  console.error('    (uses --require-cors-env; expects STONEE_CORS_ORIGINS)');
  console.error('  pnpm run check:prod-gateway:strict');
  console.error('    (CORS + JWT_SECRET must be set and not default changeme)');
  process.exit(2);
}

const origins = process.env.STONEE_CORS_ORIGINS?.trim();
if (!origins) {
  console.error('FAIL: STONEE_CORS_ORIGINS must be set (comma-separated HTTPS origins) before production deploy.');
  process.exit(1);
}

console.log('OK: STONEE_CORS_ORIGINS is set.');

if (strict) {
  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt) {
    console.error('FAIL: JWT_SECRET must be set (use --strict after wiring secrets in CI/host).');
    process.exit(1);
  }
  if (jwt === 'changeme') {
    console.error('FAIL: JWT_SECRET must not be the default "changeme" in production.');
    process.exit(1);
  }
  console.log('OK: JWT_SECRET is set and not the default placeholder.');
}

process.exit(0);
