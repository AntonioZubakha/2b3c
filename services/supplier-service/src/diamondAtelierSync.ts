import axios from 'axios';
import type { FastifyBaseLogger } from 'fastify';
import { catalogSupplierIdForCompany, catalogSupplierIdForUser } from '@stonee/shared-types';
import FeedSyncState from './models/FeedSyncState.js';
import { extractAtelierTable, mapAtelierRowToStoneeDiamond } from './diamondAtelierMapper.js';

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3000';
const PRICING_SERVICE_URL = process.env.PRICING_SERVICE_URL || 'http://pricing-service:3000';

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('password')) u.searchParams.set('password', '***');
    return u.toString();
  } catch {
    return url.replace(/password=[^&]+/i, 'password=***');
  }
}

async function recalculateScores(log: FastifyBaseLogger) {
  try {
    await axios.post(`${PRICING_SERVICE_URL}/recalculate-all`, {}, { timeout: 120_000 });
    log.info('Pricing recalculate-all completed after Diamond Atelier sync');
  } catch (err) {
    log.error({ err }, 'recalculate-all failed (catalog still updated)');
  }
}

export type DiamondAtelierSyncOutcome = {
  success: boolean;
  totalRecords: number;
  pages: number;
  error?: string;
};

/**
 * Pulls all pages from Diamond Atelier GetStockListCertified and bulk-upserts into catalog.
 * Credentials and supplier binding come from environment variables only.
 */
export async function runDiamondAtelierSync(
  log: FastifyBaseLogger,
  opts?: { maxPages?: number },
): Promise<DiamondAtelierSyncOutcome> {
  const baseUrl = (
    process.env.DIAMOND_ATELIER_BASE_URL ||
    'https://api.diamondatelier.in:6023/api/GetStockList/GetStockListCertified'
  ).trim();
  const userName = (process.env.DIAMOND_ATELIER_USER_NAME || '').trim();
  const password = (process.env.DIAMOND_ATELIER_PASSWORD || '').trim();
  const supplierCompanyId = process.env.DIAMOND_ATELIER_SUPPLIER_COMPANY_ID?.trim() || '';
  const supplierUserIdLegacy = process.env.DIAMOND_ATELIER_SUPPLIER_USER_ID?.trim() || '';
  const rowPerPage = Math.min(
    5000,
    Math.max(100, parseInt(process.env.DIAMOND_ATELIER_ROWS_PER_PAGE || '5000', 10) || 5000),
  );
  const maxPages = Math.min(
    500,
    Math.max(
      1,
      opts?.maxPages ?? (parseInt(process.env.DIAMOND_ATELIER_MAX_PAGES || '200', 10) || 200),
    ),
  );

  if (!userName || !password) {
    return { success: false, totalRecords: 0, pages: 0, error: 'Set DIAMOND_ATELIER_USER_NAME and DIAMOND_ATELIER_PASSWORD' };
  }
  if (!supplierCompanyId && !supplierUserIdLegacy) {
    return {
      success: false,
      totalRecords: 0,
      pages: 0,
      error:
        'Set DIAMOND_ATELIER_SUPPLIER_COMPANY_ID (Mongo _id of supplier company) or legacy DIAMOND_ATELIER_SUPPLIER_USER_ID',
    };
  }

  const supplierId = supplierCompanyId
    ? catalogSupplierIdForCompany(supplierCompanyId)
    : catalogSupplierIdForUser(supplierUserIdLegacy);
  const source = 'diamond-atelier';

  const started = new Date();
  await FeedSyncState.findOneAndUpdate(
    { source },
    {
      source,
      lastStartedAt: started,
      lastStatus: 'running',
      lastError: undefined,
      lastRequestUrlMasked: maskUrl(`${baseUrl}?user_name=${encodeURIComponent(userName)}&password=***`),
    },
    { upsert: true },
  );

  let total = 0;
  let pages = 0;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const u = new URL(baseUrl);
      u.searchParams.set('user_name', userName);
      u.searchParams.set('password', password);
      u.searchParams.set('page_no', String(page));
      u.searchParams.set('row_per_page', String(rowPerPage));

      const res = await axios.get(u.toString(), {
        headers: { Accept: 'application/json' },
        timeout: 120_000,
        validateStatus: () => true,
      });

      if (res.status >= 400) {
        const msg = `HTTP ${res.status} from Diamond Atelier`;
        throw new Error(typeof res.data === 'string' ? `${msg}: ${res.data.slice(0, 200)}` : msg);
      }

      let payload: unknown = res.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload) as unknown;
        } catch {
          throw new Error('Diamond Atelier returned non-JSON body');
        }
      }
      const table = extractAtelierTable(payload);
      if (!table || table.length === 0) {
        pages = page;
        break;
      }

      const diamonds: Record<string, unknown>[] = [];
      for (const raw of table) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const mapped = mapAtelierRowToStoneeDiamond(row, supplierId);
        if (mapped) diamonds.push(mapped);
      }

      if (diamonds.length === 0) {
        log.warn({ page }, 'Diamond Atelier page returned rows but none mapped — check column aliases');
      } else {
        const chunkSize = Math.min(
          500,
          Math.max(50, parseInt(process.env.DIAMOND_ATELIER_UPSERT_CHUNK || '200', 10) || 200),
        );
        for (let i = 0; i < diamonds.length; i += chunkSize) {
          const slice = diamonds.slice(i, i + chunkSize);
          await axios.post(`${CATALOG_SERVICE_URL}/bulk-upsert`, { diamonds: slice }, { timeout: 120_000 });
          total += slice.length;
        }
      }

      pages = page;
      if (table.length < rowPerPage) break;
    }

    const finished = new Date();
    await FeedSyncState.findOneAndUpdate(
      { source },
      {
        lastFinishedAt: finished,
        lastStatus: 'ok',
        lastRecordCount: total,
        lastPages: pages,
        lastError: undefined,
      },
    );

    void recalculateScores(log);

    return { success: true, totalRecords: total, pages };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'Diamond Atelier sync failed');
    await FeedSyncState.findOneAndUpdate(
      { source },
      {
        lastFinishedAt: new Date(),
        lastStatus: 'error',
        lastError: message,
        lastRecordCount: total,
        lastPages: pages,
      },
    );
    return { success: false, totalRecords: total, pages, error: message };
  }
}
