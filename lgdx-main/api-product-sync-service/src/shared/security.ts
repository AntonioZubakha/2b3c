/**
 * Minimal SSRF guard: allow only http/https and block obvious local/private targets.
 * No DNS resolution is performed to keep it lightweight and non-invasive.
 */

/** True when host is an IPv4 literal in private/link-local/reserved space. */
function isBlockedIpLiteral(host: string): boolean {
  if (host === '0.0.0.0') return true;
  if (host === '::' || host === '[::]' || host === '::1' || host === '[::1]') return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = host.match(ipv4);
  if (!m) return false;
  const oct = [m[1], m[2], m[3], m[4]].map((x) => parseInt(x, 10));
  if (oct.some((n) => n > 255)) return true;

  const [a, b] = oct;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;

  return false;
}

function isPrivateOrReservedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  if (isBlockedIpLiteral(h)) return true;
  // Hostname-shaped (no full IPv4 match) — block common private prefixes
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  // 100.64.0.0/10 CGNAT
  if (/^100\.(6[4-9]|7\d|8\d|9\d|1[01]\d|12[0-7])\./.test(h)) return true;
  return false;
}

export function isSafeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const protocol = u.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    const host = (u.hostname || '').toLowerCase();
    if (!host || host === '*') return false;

    if (!isPrivateOrReservedHost(host)) return true;

    const allowEnv = process.env.ALLOWED_SUPPLIER_HOSTS;
    if (allowEnv) {
      const allowed = allowEnv
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.includes(host)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function assertSafeUrlOrThrow(rawUrl: string, context: string): void {
  if (!isSafeUrl(rawUrl)) {
    throw new Error(`[Security] Blocked potentially unsafe URL in ${context}`);
  }
}
