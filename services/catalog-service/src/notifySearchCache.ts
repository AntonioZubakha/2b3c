import axios from 'axios';
import type { FastifyBaseLogger } from 'fastify';

const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://search-service:3000';
const CACHE_SECRET = process.env.STONEE_CACHE_INVALIDATE_SECRET || '';

/** Await so the next search request never reads stale Redis after this catalog write. */
export async function invalidateSearchCacheAfterCatalogWrite(log: FastifyBaseLogger): Promise<void> {
  try {
    await axios.post(
      `${SEARCH_SERVICE_URL}/internal/invalidate-search-cache`,
      {},
      {
        timeout: 10_000,
        headers: CACHE_SECRET ? { 'x-stonee-cache-invalidate': CACHE_SECRET } : {},
      }
    );
    log.info('Search cache invalidated after catalog mutation');
  } catch (err) {
    log.warn({ err }, 'Search cache invalidation failed (results may be stale for up to a few minutes)');
  }
}
