/**
 * Normalize URL to canonical form for SEO:
 * - Remove www subdomain
 * - Remove trailing slash (except for root)
 * - Remove query parameters and hash
 * - Always use https://lgdeal.com
 *
 * This utility ensures consistent canonical URLs across the application
 * to fix Google Search Console canonicalization issues.
 *
 * Note: legacy hosts (e.g. `lgdeal.net`) are rewritten to the canonical
 * `lgdeal.com` so that any stray link emits the new domain as canonical.
 */
const CANONICAL_HOST = 'lgdeal.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

export const normalizeCanonicalUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);

    // Remove www from hostname
    let hostname = urlObj.hostname.replace(/^www\./, '');

    // Ensure canonical domain (lgdeal.com). Any other host — including legacy
    // lgdeal.net — is coerced to the canonical apex.
    if (hostname !== CANONICAL_HOST) {
      hostname = CANONICAL_HOST;
    }

    // Get pathname and remove trailing slash (except root)
    let pathname = urlObj.pathname;
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Build canonical URL (no query, no hash)
    return `https://${hostname}${pathname}`;
  } catch (error) {
    // Fallback: try to extract path from URL string (accept both .com and .net)
    const match = url.match(/https?:\/\/(?:www\.)?lgdeal\.(?:com|net)([^?#]*)/);
    if (match) {
      let pathname = match[1] || '/';
      if (pathname !== '/' && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      return `${CANONICAL_ORIGIN}${pathname}`;
    }
    // Ultimate fallback
    return `${CANONICAL_ORIGIN}/`;
  }
};

/**
 * Get canonical origin (always https://lgdeal.com)
 */
export const getCanonicalOrigin = (): string => {
  return CANONICAL_ORIGIN;
};
