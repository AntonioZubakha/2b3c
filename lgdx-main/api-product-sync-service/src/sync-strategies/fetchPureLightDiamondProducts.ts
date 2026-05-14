/**
 * Fetch strategy for onlineapi.pldiam.com (Pure Light Diamond)
 *
 * API characteristics (observed in Postman):
 *   GET /api/v1/inventory/fetch-live-stock?page=N
 *   Headers: Authorization: <JWT>
 *   Response: { pagination: { totalRecords, totalPages, limit }, data: [...] }
 *
 * Performance:
 *   - Page 1 (returns pagination meta too): ~4-5 min
 *   - Pages 2-N: ~1-2 min each (observed via Postman)
 *   - Sequential 23 pages ≈ 40-50 min total
 *
 * Solution: parallel page fetching — page 1 is fetched first to discover
 * totalPages, then remaining pages are fetched in concurrent batches.
 * CONCURRENCY=2 gives ~2× speedup without overloading the upstream server.
 * Total wall-clock time ≈ (totalPages / CONCURRENCY) × per-page-time ≈ 20-25 min.
 */

import https from 'https';
import { AxiosResponse } from 'axios';
import httpClient from '../shared/httpClient';
import { logger } from '../shared/logger';
import * as productUtils from '../shared/productUtils';
import { assertSafeUrlOrThrow } from '../shared/security';
import { sendSyncProgressNotification } from '../shared/telegramBot';
import { FetchProductsFunction } from '../syncLogic';

const PURE_LIGHT_DIAMOND_API_NAME = 'Pure Light Diamond API';

// How many pages to fetch in parallel.
// 2 gives a ~2× speedup without overloading the upstream server or Docker
// network. With CONCURRENCY=3 all three requests compete for bandwidth and
// each stretches beyond the timeout; with 2 each gets enough throughput.
const CONCURRENCY = 2;

// Page 1 also returns pagination metadata (totalPages, totalRecords) so it is
// heavier than subsequent pages.
// Priority is to complete the sync regardless of API slowness; timeouts are
// intentionally generous until the upstream API improves its response times.
const PAGE1_TIMEOUT_MS   =  8 * 60 * 1000; //  8 min — page 1 (meta + data, observed ~4-5 min)
const REQUEST_TIMEOUT_MS = 18 * 60 * 1000; // 18 min — pages 2-N (worst-case slow days)
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 20_000;

// Batch-level retry: if a batch fails, wait 10 minutes and retry the failed pages.
// After 3 failed batch attempts, skip the batch and continue with the next one.
const BATCH_MAX_ATTEMPTS = 3;
const BATCH_RETRY_DELAY_MS = 10 * 60 * 1000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Persistent keep-alive agent: all parallel requests reuse the already-established
// TLS connection, saving ~0.5-1 s of handshake overhead per page.
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY + 2,
  timeout: REQUEST_TIMEOUT_MS,
  rejectUnauthorized: true,
});

interface PureLightPagination {
  totalRecords?: number;
  totalPages?: number;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = AxiosResponse<any>;

/** Build request config for one page. */
function buildRequestConfig(baseUrl: string, authToken: string, page: number, timeoutMs: number) {
  return {
    method: 'get' as const,
    url: baseUrl,
    params: { page },
    headers: {
      authorization: authToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Explicitly request compression — reduces ~8 MB JSON payloads
      // significantly in transit (same headers Postman sends by default).
      'Accept-Encoding': 'gzip, deflate, br',
    },
    timeout: timeoutMs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpsAgent: keepAliveAgent as any,
    decompress: true,
  };
}

/** Fetch one page with retry. Returns null on "end-of-data" API responses. */
async function fetchPage(
  baseUrl: string,
  authToken: string,
  page: number,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<AnyResponse | null> {
  const cfg = buildRequestConfig(baseUrl, authToken, page, timeoutMs);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      logger.info(
        `[fetchPureLightDiamondProducts] Page ${page} retry ${attempt}/${MAX_ATTEMPTS} after ${RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      const tReq = Date.now();
      const response = await httpClient(cfg);
      logger.info(
        `[fetchPureLightDiamondProducts] Page ${page} OK (attempt ${attempt}) — status ${response.status}, ${((Date.now() - tReq) / 1000).toFixed(1)}s`,
      );
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errAny = err as any;
      const httpStatus: number | undefined = errAny?.response?.status;
      const httpMsg: string | undefined   = errAny?.response?.data?.message;

      logger.error(`[fetchPureLightDiamondProducts] Page ${page} attempt ${attempt} failed: ${msg}`);

      // End-of-data sentinels — not real errors
      if (httpStatus === 400 && httpMsg === 'No stock available') {
        logger.info(`[fetchPureLightDiamondProducts] Page ${page}: "No stock available" — end of data.`);
        return null;
      }
      if (httpStatus === 404) {
        logger.info(`[fetchPureLightDiamondProducts] Page ${page}: 404 — end of pages.`);
        return null;
      }

      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `[fetchPureLightDiamondProducts] Page ${page} failed after ${MAX_ATTEMPTS} attempts: ${msg}`,
        );
      }
    }
  }
  return null;
}

/** Extract the products array from a Pure Light Diamond response. */
function extractProducts(data: unknown, dataKey: string, page: number): unknown[] {
  if (!data || typeof data !== 'object') return [];

  // Primary: { pagination: {...}, data: [...] }  or any configured dataKey
  const record = data as Record<string, unknown>;
  if (Array.isArray(record[dataKey])) return record[dataKey] as unknown[];

  // Fallback: bare array
  if (Array.isArray(data)) return data as unknown[];

  logger.warn(`[fetchPureLightDiamondProducts] Unexpected shape on page ${page}:`, {
    type: typeof data,
    keys: Object.keys(record).slice(0, 10),
  });
  return [];
}

export const fetchPureLightDiamondProducts: FetchProductsFunction = async (
  companyApiConfigDoc,
  companyId,
  companyName,
) => {
  if (!companyApiConfigDoc.config?.url) {
    throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
  }

  const apiUrl = companyApiConfigDoc.config.url;
  assertSafeUrlOrThrow(apiUrl, 'fetchPureLightDiamondProducts.config.url');

  // Strip any query-string from the stored URL — we add ?page=N ourselves
  const parsedUrl = new URL(apiUrl);
  const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

  const authToken = companyApiConfigDoc.config.headers?.authorization;
  if (!authToken) {
    throw new Error(`Authorization token is required for ${PURE_LIGHT_DIAMOND_API_NAME}`);
  }

  const dataKey = companyApiConfigDoc.config.dataKey || 'data';

  logger.info(
    `[fetchPureLightDiamondProducts] Starting parallel fetch for ${companyName} (concurrency=${CONCURRENCY})`,
  );

  // ── Step 1: page 1 — discover pagination ───────────────────────────────────
  // Page 1 uses a longer timeout because it also carries pagination metadata
  // and is consistently slower than subsequent pages (~4-5 min vs ~1-2 min).
  const page1Response = await fetchPage(baseUrl, authToken, 1, PAGE1_TIMEOUT_MS);
  if (!page1Response) {
    logger.warn(`[fetchPureLightDiamondProducts] Page 1 returned no data for ${companyName}`);
    return { products: [] };
  }

  const products1 = extractProducts(page1Response.data, dataKey, 1);

  const pagination = (page1Response.data as { pagination?: PureLightPagination })?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  logger.info(
    `[fetchPureLightDiamondProducts] Pagination: totalRecords=${pagination?.totalRecords ?? '?'}, totalPages=${totalPages}, limit=${pagination?.limit ?? '?'}`,
  );

  const allApiProducts: unknown[] = [...products1];
  let apiErrors = 0;

  if (totalPages <= 1) {
    logger.info(`[fetchPureLightDiamondProducts] Single page — done. Products: ${allApiProducts.length}`);
    return { products: allApiProducts, statsUpdates: { apiErrors } };
  }

  // Notify TG: fetch started, total scope known
  void sendSyncProgressNotification(
    companyId,
    companyName,
    'fetchPureLightDiamondProducts',
    `⏳ Fetching started — ${totalPages} pages, ~${pagination?.totalRecords?.toLocaleString() ?? '?'} products total. Page 1 ✅ (${allApiProducts.length.toLocaleString()} loaded)`,
  );

  // ── Step 2: pages 2..totalPages in parallel batches ────────────────────────
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  let endOfDataReached = false;

  for (let batchStart = 0; batchStart < remainingPages.length; batchStart += CONCURRENCY) {
    const batch = remainingPages.slice(batchStart, batchStart + CONCURRENCY);

    logger.info(
      `[fetchPureLightDiamondProducts] Fetching pages [${batch.join(', ')}] in parallel`,
    );

    let pagesToFetch = [...batch];
    const batchOkPages: number[] = [];
    const batchFailedPagesFinal: number[] = [];

    for (let batchAttempt = 1; batchAttempt <= BATCH_MAX_ATTEMPTS; batchAttempt++) {
      if (pagesToFetch.length === 0 || endOfDataReached) break;

      if (batchAttempt > 1) {
        logger.warn(
          `[fetchPureLightDiamondProducts] Retrying failed pages after ${Math.round(BATCH_RETRY_DELAY_MS / 60000)}m (attempt ${batchAttempt}/${BATCH_MAX_ATTEMPTS}): [${pagesToFetch.join(', ')}]`,
        );
        void sendSyncProgressNotification(
          companyId,
          companyName,
          'fetchPureLightDiamondProducts',
          `⏸️ Batch retry ${batchAttempt}/${BATCH_MAX_ATTEMPTS} in 10 minutes — retrying pages [${pagesToFetch.join(', ')}]`,
        );
        await delay(BATCH_RETRY_DELAY_MS);
      }

      const tBatch = Date.now();
      const results = await Promise.allSettled(
        pagesToFetch.map((page) => fetchPage(baseUrl, authToken, page)),
      );
      const batchSec = ((Date.now() - tBatch) / 1000).toFixed(1);
      logger.info(
        `[fetchPureLightDiamondProducts] Batch [${pagesToFetch.join(', ')}] done in ${batchSec}s`,
      );

      const nextFailed: number[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const page = pagesToFetch[i];

        if (result.status === 'rejected') {
          logger.error(
            `[fetchPureLightDiamondProducts] Page ${page} failed in batch attempt ${batchAttempt}/${BATCH_MAX_ATTEMPTS}: ${result.reason}`,
          );
          nextFailed.push(page);
          continue;
        }

        const response = result.value;
        if (!response) {
          // End-of-data sentinel from fetchPage
          logger.info(`[fetchPureLightDiamondProducts] Page ${page}: end-of-data — stopping`);
          endOfDataReached = true;
          // Truncate remaining batch processing: remaining pages beyond end are empty too
          remainingPages.length = batchStart + batchOkPages.length;
          break;
        }

        const pageProducts = extractProducts(response.data, dataKey, page);
        allApiProducts.push(...pageProducts);
        batchOkPages.push(page);

        logger.info(
          `[fetchPureLightDiamondProducts] Page ${page}: ${pageProducts.length} products — running total: ${allApiProducts.length}`,
        );
      }

      pagesToFetch = nextFailed;

      if (pagesToFetch.length === 0 || endOfDataReached) {
        // Notify TG on success of this batch attempt (at least one page OK)
        if (batchOkPages.length > 0) {
          const pagesLabel = batchOkPages.length === 1
            ? `page ${batchOkPages[batchOkPages.length - 1]}`
            : `pages [${batchOkPages.slice(-CONCURRENCY).join(', ')}]`;
          void sendSyncProgressNotification(
            companyId,
            companyName,
            'fetchPureLightDiamondProducts',
            `✅ Batch done in ${batchSec}s — ${pagesLabel} OK\n📦 Running total: ${allApiProducts.length.toLocaleString()} products`,
          );
        }
        break;
      }

      // Still failed pages after this attempt
      if (batchAttempt < BATCH_MAX_ATTEMPTS) {
        void sendSyncProgressNotification(
          companyId,
          companyName,
          'fetchPureLightDiamondProducts',
          `⚠️ Batch attempt ${batchAttempt}/${BATCH_MAX_ATTEMPTS} failed for pages [${pagesToFetch.join(', ')}]. Will retry in 10 minutes.`,
        );
      } else {
        // Give up this batch and continue with next one
        batchFailedPagesFinal.push(...pagesToFetch);
        apiErrors += pagesToFetch.length;
        logger.error(
          `[fetchPureLightDiamondProducts] Giving up after ${BATCH_MAX_ATTEMPTS} attempts. Skipping pages: [${pagesToFetch.join(', ')}]`,
        );
        void sendSyncProgressNotification(
          companyId,
          companyName,
          'fetchPureLightDiamondProducts',
          `🟠 Skipping pages after ${BATCH_MAX_ATTEMPTS} failed attempts: [${pagesToFetch.join(', ')}]. Continuing with next batch.`,
        );
      }
    }

    if (endOfDataReached) break;
  }

  logger.info(
    `[fetchPureLightDiamondProducts] Finished. Total products: ${allApiProducts.length} from ${companyName}`,
  );

  void sendSyncProgressNotification(
    companyId,
    companyName,
    'fetchPureLightDiamondProducts',
    `🏁 All pages fetched — <b>${allApiProducts.length.toLocaleString()}</b> products loaded from ${totalPages} pages${apiErrors > 0 ? ` (⚠️ ${apiErrors} page errors)` : ''}. Processing to DB...`,
  );

  return { products: allApiProducts, statsUpdates: { apiErrors } };
};
