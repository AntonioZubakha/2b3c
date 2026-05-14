import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
logger.debug('[marketplaceController.ts] File loaded');
import { Request, Response } from 'express';
import Product, { IProductDocument, IProductLean } from '../models/Product';
import { 
  normalizeShape, 
  normalizeClarity, 
  normalizeGrade, 
  normalizeColor, 
  normalizeCut 
} from '../utils/productUtils';
import { SortOrder, Types } from 'mongoose';
import PerfectPairSettingsService from '../services/perfectPairSettingsService';
import ConstantsSettingsService from '../services/constantsSettingsService';
import Company from '../models/Company';
import { IProduct } from '../types';
import { 
    ValidationError, 
    NotFoundError,
    asyncHandler 
} from '../middleware/errorHandler';
import { ValidatedRequest } from '../middleware/validation';
import cacheService from '../services/cacheService';
import { 
    ProductFilter as ZodProductFilter,
    FindAlternatives,
    Product as ZodProduct
} from '../validation/schemas/productSchemas';

/**
 * MARKETPLACE CONTROLLER
 * 
 * По умолчанию каталог исключает продукты без фото (listing quality).
 * Исключение: пользователи компании LGDeal INC (любая роль: admin / supervisor / manager / logist)
 * не получают фильтр photo и при поиске по сертификату не ограничиваются только цветом D–G —
 * см. req.user.isLgdealIncStaff в middleware.
 * 
 * Продукты с ценой поставщика ниже MIN_SUPPLIER_PRICE не выводятся в каталоге.
 *
 * Исключение: при явном поиске по номеру сертификата / stock / id (`search`) пол
 * min price не применяем — иначе тестовые или служебные позиции (часто у LGDeal)
 * не находятся по известному номеру, хотя строка в инвентаре есть.
 */
/** Fallback when constants settings not yet loaded from DB */
const MIN_SUPPLIER_PRICE_FALLBACK = Number(process.env.MIN_SUPPLIER_PRICE) || 15;
const MEASUREMENT_TOLERANCE_FALLBACK = 0.025;

/** Escape user input for a MongoDB $regex literal substring match. */
const escapeRegexForLiteralSubstring = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface MarketplaceQuery {
  search?: string;
  shape?: string;
  weight?: string;
  clarity?: string;
  symmetry?: string;
  polish?: string;
  cut?: string;
  color?: string;
  lab?: string; // Add lab parameter for certificate institute filtering
  length?: string;
  width?: string;
  height?: string;
  len?: string;
  l?: string;
  wid?: string;
  w?: string;
  h?: string;
  table?: string;
  depth?: string;
  ratio?: string;
  girdle?: string; // Girdle filter parameter
  location?: string; // Location filter parameter
  technology?: string; // Technology filter parameter (CVD, HPHT, etc.)
  companyId?: string; // Supplier filter – only applied for LGDEAL supervisors
  fancyOnly?: string; // 'true' = only fancy/colored stones – only applied for LGDEAL supervisors
  intensity?: string; // Fancy intensity filter – only applied when fancyOnly (e.g. "Fancy vivid", "Fancy intense")
  overtone?: string; // Fancy overtone filter – only applied when fancyOnly (e.g. "Orangey Yellow")
  page?: string;
  limit?: string;
}

interface ProductFilter {
  onDeal: boolean;
  sold: boolean;
  photo?: { $exists: boolean; $ne: string }; // Обычный каталог: только с фото; LGDeal INC staff — поле не задаём
  price?: { $gte?: number; $lte?: number }; // Минимальная цена поставщика для вывода в каталоге
  shape?: string | { $in: string[] }; // Can be string or { $in: string[] }
  clarity?: string | { $in: string[] }; // Can be string or { $in: string[] }
  symmetry?: string | { $in: string[] }; // Can be string or { $in: string[] }
  polish?: string | { $in: string[] }; // Can be string or { $in: string[] }
  cut?: string | { $in: string[] }; // Can be string or { $in: string[] }
  color?: string | { $in: string[] } | { $nin: string[]; $exists: boolean; $ne: string } | { $regex: string; $options: string }; // string, $in, fancy-only ($nin D–G), or case-insensitive regex for fancy colors
  certificateInstitute?: string | { $in: string[] }; // Can be string or { $in: string[] }
  girdle?: string | { $in: string[] }; // Girdle filter (e.g., "Thin", "Medium", etc.)
  location?: string | { $in: string[] } | { $regex: string; $options: string }; // Location filter - supports regex
  technology?: string | { $in: string[] } | { $regex: string; $options: string }; // Technology filter - supports regex
  carat?: { $gte?: number; $lte?: number };
  measurement1?: { $gte?: number; $lte?: number };
  measurement2?: { $gte?: number; $lte?: number };
  measurement3?: { $gte?: number; $lte?: number };
  ratio?: { $gte?: number; $lte?: number };
  tableSize?: { $gte?: number; $lte?: number };
  totalDepth?: { $gte?: number; $lte?: number };
  company?: Types.ObjectId;
  intensity?: string | { $in: string[] } | { $regex: string; $options: string }; // Fancy intensity – only when fancyOnly
  overtone?: string | { $regex: string; $options: string }; // Fancy overtone – only when fancyOnly
  $and?: Array<Record<string, unknown>>;
  $or?: Array<Record<string, unknown>>;
}

interface PairFilter extends Omit<ProductFilter, 'cut'> {
  _id: { $ne: string };
  cut?: string | { $in: Array<string | null | undefined> };
  photo?: { $exists: boolean; $ne: string };
}

/**
 * Marketplace public aggregates: home-stats (stonesCount) + clarities.
 *
 * Оба эндпоинта делят один и тот же «публичный» фильтр доступности, поэтому
 * считаются одним сводным объектом MarketplaceMeta. Это позволяет:
 *   - прогревать кэш одним проходом;
 *   - держать in-process memo и Redis-ключ, консистентные между эндпоинтами;
 *   - выполнять один Redis lock вместо двух (никакого thundering herd).
 *
 * Стратегия доступа (в порядке предпочтения):
 *   1. in-process memo (микросекунды, переживает кратковременный отказ Redis);
 *   2. Redis (shared между репликами, SWR с fresh-маркером);
 *   3. single-flight compute — запускается один раз на процесс, все
 *      конкурентные запросы ждут один и тот же Promise.
 *
 * Холодный путь (пункт 3) в проде не должен случаться: `warmMarketplaceAggregates()`
 * вызывается до `app.listen(...)`, а `startMarketplaceAggregatesRefresher()`
 * обновляет кэш чаще, чем истекает fresh-маркер.
 */

const MARKETPLACE_META_CACHE_KEY = 'marketplace:meta';
const MARKETPLACE_META_FRESH_KEY = 'marketplace:meta:fresh';
const MARKETPLACE_META_LOCK_KEY = 'marketplace:meta:refresh';

/** Redis stale-while-revalidate тайминги. */
const MARKETPLACE_META_HARD_TTL_SEC = 2 * 60 * 60;   // 2h — сколько живёт stale
const MARKETPLACE_META_FRESH_TTL_SEC = 5 * 60;       // 5m — окно «свежести»
const MARKETPLACE_META_LOCK_TTL_SEC = 30;            // защита от thundering herd

/** In-process memo (страхует от короткого отказа Redis и экономит round-trip). */
const MARKETPLACE_META_MEMO_TTL_MS = 60 * 1000;      // 1m

/** Периодический прогрев — чуть чаще, чем FRESH, чтобы маркер не истекал при тишине. */
const MARKETPLACE_META_REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4m

const CLARITY_ORDER = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];

const buildMarketplacePublicAvailabilityFilter = (minPrice: number) => ({
  onDeal: false,
  sold: false,
  photo: { $exists: true, $ne: '' },
  price: { $gte: minPrice }
});

const sortClaritiesForUi = (clarities: string[]): string[] =>
  clarities.sort((a, b) => {
    const indexA = CLARITY_ORDER.indexOf(a);
    const indexB = CLARITY_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

interface MarketplaceMeta {
  stonesCount: number;
  clarities: string[];
}

const isMarketplaceMeta = (value: unknown): value is MarketplaceMeta => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarketplaceMeta>;
  return (
    typeof candidate.stonesCount === 'number' &&
    Array.isArray(candidate.clarities) &&
    candidate.clarities.every((c) => typeof c === 'string')
  );
};

let marketplaceMetaMemo: { value: MarketplaceMeta; expiresAt: number } | null = null;
let marketplaceMetaInFlight: Promise<MarketplaceMeta> | null = null;
let marketplaceMetaRefreshTimer: NodeJS.Timeout | null = null;

const getMarketplaceMetaMemo = (): MarketplaceMeta | null =>
  marketplaceMetaMemo && marketplaceMetaMemo.expiresAt > Date.now()
    ? marketplaceMetaMemo.value
    : null;

const setMarketplaceMetaMemo = (value: MarketplaceMeta): void => {
  marketplaceMetaMemo = {
    value,
    expiresAt: Date.now() + MARKETPLACE_META_MEMO_TTL_MS
  };
};

/**
 * Единственный «тяжёлый» путь: идёт в MongoDB.
 * count + distinct выполняются параллельно и обслуживаются партиальным индексом
 * `idx_marketplace_public_availability_clarity` (см. models/Product.ts).
 */
async function computeMarketplaceMeta(): Promise<MarketplaceMeta> {
  const constants = await ConstantsSettingsService.getSettingsOrCached();
  const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
  const filter = buildMarketplacePublicAvailabilityFilter(minPrice);

  const [total, rawClarities] = await Promise.all([
    Product.countDocuments(filter),
    Product.distinct<string>('clarity', filter).exec()
  ]);

  const stonesCount = Math.floor(total / 10000) * 10000;

  const normalizedClarities = rawClarities
    .filter((c) => Boolean(c))
    .map((c) => normalizeClarity(c))
    .filter((c, index, self) => self.indexOf(c) === index);

  return { stonesCount, clarities: sortClaritiesForUi(normalizedClarities) };
}

async function persistMarketplaceMeta(meta: MarketplaceMeta): Promise<void> {
  setMarketplaceMetaMemo(meta);
  // Перед записью убеждаемся, что соединение с Redis установлено: при `lazyConnect: true`
  // ioredis инициализирует сокет отложенно, а `isConnected` опаздывает — без этого
  // первый `setex` может «молча» пропуститься.
  await cacheService.ensureReady();
  const writes = await Promise.allSettled([
    cacheService.cacheStatsWithTTL(
      MARKETPLACE_META_CACHE_KEY,
      meta,
      MARKETPLACE_META_HARD_TTL_SEC
    ),
    cacheService.setMarker(
      MARKETPLACE_META_FRESH_KEY,
      MARKETPLACE_META_FRESH_TTL_SEC
    )
  ]);
  const failed = writes.find((w) => w.status === 'rejected');
  if (failed && failed.status === 'rejected') {
    logger.warn('[MarketplaceController] meta persist to Redis failed', {
      error: getErrorMessage(failed.reason)
    });
  }
}

/** Объединяет конкурентные запросы холодного пути в один compute. */
function computeMarketplaceMetaSingleFlight(): Promise<MarketplaceMeta> {
  if (marketplaceMetaInFlight) return marketplaceMetaInFlight;
  marketplaceMetaInFlight = (async () => {
    try {
      const value = await computeMarketplaceMeta();
      await persistMarketplaceMeta(value);
      return value;
    } finally {
      marketplaceMetaInFlight = null;
    }
  })();
  return marketplaceMetaInFlight;
}

/**
 * Фоновый refresh под распределённым Redis-lock'ом — гарантирует,
 * что среди всех реплик в данный момент считает только одна.
 */
async function refreshMarketplaceMetaInBackground(): Promise<void> {
  const acquired = await cacheService.tryAcquireLock(
    MARKETPLACE_META_LOCK_KEY,
    MARKETPLACE_META_LOCK_TTL_SEC
  );
  if (!acquired) return;
  try {
    const value = await computeMarketplaceMeta();
    await persistMarketplaceMeta(value);
    logger.debug('[MarketplaceController] meta refreshed', {
      stonesCount: value.stonesCount,
      clarities: value.clarities.length
    });
  } catch (error) {
    logger.error('[MarketplaceController] meta background refresh failed', {
      error: getErrorMessage(error)
    });
  } finally {
    await cacheService.releaseLock(MARKETPLACE_META_LOCK_KEY);
  }
}

/**
 * Читает meta по приоритету источников. Никогда не бросает в Mongo без нужды:
 *   memo -> redis -> single-flight compute.
 */
async function resolveMarketplaceMeta(): Promise<MarketplaceMeta> {
  const memo = getMarketplaceMetaMemo();
  if (memo) {
    // Не дёргаем Redis в самом горячем пути — триггер refresh случится по cron.
    return memo;
  }

  const redisValue = await cacheService.getCachedStats(MARKETPLACE_META_CACHE_KEY);
  if (isMarketplaceMeta(redisValue)) {
    setMarketplaceMetaMemo(redisValue);
    const isFresh = await cacheService.hasMarker(MARKETPLACE_META_FRESH_KEY);
    if (!isFresh) void refreshMarketplaceMetaInBackground();
    return redisValue;
  }

  // Полный cold-start: компьют один раз на процесс.
  return computeMarketplaceMetaSingleFlight();
}

/**
 * Прогрев перед `app.listen(...)` — первый HTTP-запрос всегда попадает в тёплый кэш.
 * Ошибки логируются, но не ломают старт сервиса (иначе деплой может упасть
 * из-за временного лага MongoDB/Redis).
 */
export async function warmMarketplaceAggregates(): Promise<void> {
  try {
    const value = await computeMarketplaceMetaSingleFlight();
    logger.info('[MarketplaceController] aggregates warmed', {
      stonesCount: value.stonesCount,
      clarities: value.clarities.length
    });
  } catch (error) {
    logger.error('[MarketplaceController] aggregates warmup failed', {
      error: getErrorMessage(error)
    });
  }
}

/**
 * Периодический фоновый refresher. Работает чаще, чем FRESH_TTL, —
 * fresh-маркер никогда не «провисает», даже при нулевом пользовательском трафике.
 */
export function startMarketplaceAggregatesRefresher(): void {
  if (marketplaceMetaRefreshTimer) return;
  marketplaceMetaRefreshTimer = setInterval(() => {
    void refreshMarketplaceMetaInBackground();
  }, MARKETPLACE_META_REFRESH_INTERVAL_MS);
  marketplaceMetaRefreshTimer.unref();
  logger.info('[MarketplaceController] aggregates refresher started', {
    intervalMs: MARKETPLACE_META_REFRESH_INTERVAL_MS
  });
}

export function stopMarketplaceAggregatesRefresher(): void {
  if (!marketplaceMetaRefreshTimer) return;
  clearInterval(marketplaceMetaRefreshTimer);
  marketplaceMetaRefreshTimer = null;
}

/**
 * Homepage stats: product count (with photo) rounded down to nearest 10,000.
 * Public, no auth. Used for hero stats "XXX K+ Global Stones".
 *
 * Читает единую MarketplaceMeta: memo -> Redis -> single-flight compute.
 * В проде стабильно отвечает из memo/Redis (~ms) благодаря warmup + cron.
 */
export const getHomeStats = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const meta = await resolveMarketplaceMeta();
  res.json({ stonesCount: meta.stonesCount });
});

// getProducts function
export const getProducts = asyncHandler(async (req: Request & { validatedQuery?: MarketplaceQuery }, res: Response): Promise<void> => {
  const query = (req.validatedQuery || req.query) as MarketplaceQuery;
  
  // Создаем ключ кэша на основе параметров запроса
  const reqUser = (req as Request & { user?: { isLgdealSupervisor?: boolean; isLgdealIncStaff?: boolean } }).user;
  const lgdealStaffCatalogBypass = !!reqUser?.isLgdealIncStaff;
  const internalCatalogPrivileged = !!(reqUser?.isLgdealSupervisor || lgdealStaffCatalogBypass);
  const cacheKey = `products:${JSON.stringify(query)}`;
  const skipCache = internalCatalogPrivileged;

  // Skip cache for LGDeal INC internal users (supervisors + остальной штат) — другая выдача и populate company
  if (!skipCache) {
    const cachedData = await cacheService.getCachedStats(cacheKey);
    if (cachedData) {
      logger.debug('[MarketplaceController] Using cached products data');
      res.json(cachedData);
      return;
    }
  }
  logger.debug('Received marketplace request with query:', { query });
  
  const { 
    search,
    shape, 
    weight, 
    clarity, 
    symmetry, 
    polish, 
    cut, 
    color, 
    lab, // Add lab parameter
    girdle, // Girdle filter parameter
    location, // Location filter parameter
    technology, // Technology filter parameter
    companyId, // Supplier filter – only for LGDEAL supervisors
    fancyOnly, // Fancy catalog – only for LGDEAL supervisors
    intensity, // Fancy intensity – only when fancyOnly
    overtone, // Fancy overtone – only when fancyOnly
    length, 
    width, 
    height,
    len, l,
    wid, w,
    h, 
    table, 
    depth, 
    ratio 
  } = query;

  const constants = await ConstantsSettingsService.getSettingsOrCached();
  const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
  const filter: ProductFilter = {
    onDeal: false,
    sold: false,
  };
  if (!lgdealStaffCatalogBypass) {
    filter.photo = { $exists: true, $ne: '' };
  }
  // Min price только для обычного просмотра каталога; см. комментарий у MIN_SUPPLIER_PRICE
  if (!search) {
    filter.price = { $gte: minPrice };
  }

  // Handle search parameter (certificate number or stock number)
  if (search) {
    const trimmed = String(search).trim();
    const safePattern = escapeRegexForLiteralSubstring(trimmed);
    // Search by certificate number or stock number
    filter.$or = [
      { certificateNumber: { $regex: safePattern, $options: 'i' } },
      { stockNumber: { $regex: safePattern, $options: 'i' } },
      { id: { $regex: safePattern, $options: 'i' } }
    ];
    // Без bypass: в белом каталоге при поиске остаёмся в D–G; fancy — только для привилегированной внутренней выдачи.
    if (!lgdealStaffCatalogBypass) {
      if (fancyOnly === 'true' && internalCatalogPrivileged) {
        filter.color = { $nin: ['D', 'E', 'F', 'G'], $exists: true, $ne: '' };
      } else {
        filter.color = { $in: ['D', 'E', 'F', 'G'] };
      }
    }
    logger.debug('Search filter applied:', { search, filter: filter.$or });
  } else {
    // Shape filter - uses normalizeShape from productUtils
    if (shape) {
    if (shape.includes(',')) {
      const shapeArray = shape.split(',').map(s => normalizeShape(s.trim()));
      filter.shape = { $in: shapeArray };
    } else if (shape !== 'All') {
      filter.shape = normalizeShape(shape);
    }
  }
  
  // Clarity filter - uses normalizeClarity from productUtils
  if (clarity) {
    if (clarity.includes(',')) {
      const clarityArray = clarity.split(',').map(c => normalizeClarity(c.trim()));
      filter.clarity = { $in: clarityArray };
    } else if (clarity !== 'All') {
      filter.clarity = normalizeClarity(clarity);
    }
  }

  // Symmetry filter - uses normalizeGrade from productUtils
  if (symmetry) {
    if (symmetry.includes(',')) {
      const symmetryArray = symmetry.split(',').map(s => normalizeGrade(s.trim()));
      filter.symmetry = { $in: symmetryArray };
    } else if (symmetry !== 'All') {
      filter.symmetry = normalizeGrade(symmetry);
    }
  }

  // Polish filter - uses normalizeGrade from productUtils
  if (polish) {
    if (polish.includes(',')) {
      const polishArray = polish.split(',').map(p => normalizeGrade(p.trim()));
      filter.polish = { $in: polishArray };
    } else if (polish !== 'All') {
      filter.polish = normalizeGrade(polish);
    }
  }

  // Cut filter - uses normalizeGrade from productUtils
  if (cut) {
    if (cut.includes(',')) {
      const cutArray = cut.split(',').map(c => normalizeGrade(c.trim()));
      filter.cut = { $in: cutArray };
    } else if (cut !== 'All') {
      filter.cut = normalizeGrade(cut);
    }
  }
  
  // Color filter - uses normalizeColor from productUtils
  if (color) {
    if (color.includes(',')) {
      const colorArray = color.split(',').map(c => normalizeColor(c.trim()));
      filter.color = { $in: colorArray };
    } else if (color !== 'All') {
      filter.color = normalizeColor(color);
    }
  }

  // Lab filter - maps to certificateInstitute field
  if (lab) {
    if (lab.includes(',')) {
      const labArray = lab.split(',').map(l => l.trim().toUpperCase());
      filter.certificateInstitute = { $in: labArray };
    } else if (lab !== 'All') {
      filter.certificateInstitute = lab.trim().toUpperCase();
    }
  }

  // Girdle filter - case-insensitive search (girdle stored as UPPERCASE in DB)
  if (girdle) {
    if (girdle.includes(',')) {
      const girdleArray = girdle.split(',').map(g => g.trim().toUpperCase());
      filter.girdle = { $in: girdleArray };
    } else if (girdle !== 'All') {
      filter.girdle = girdle.trim().toUpperCase();
    }
  }

  // Location filter - exact match (case-insensitive)
  if (location) {
    if (location.includes(',')) {
      const locationArray = location.split(',').map(l => l.trim());
      filter.location = { $in: locationArray };
    } else if (location !== 'All') {
      // Use case-insensitive exact match for location
      filter.location = { $regex: `^${location.trim()}$`, $options: 'i' };
    }
  }

  // Technology filter - case-insensitive search (CVD, HPHT, etc.)
  if (technology) {
    if (technology.includes(',')) {
      const technologyArray = technology.split(',').map(t => t.trim().toUpperCase());
      filter.technology = { $in: technologyArray };
    } else if (technology !== 'All') {
      filter.technology = { $regex: technology.trim(), $options: 'i' };
    }
  }

  // Supplier (company) filter – LGDeal INC supervisors и остальной штат каталога
  if (companyId && internalCatalogPrivileged) {
    try {
      filter.company = new Types.ObjectId(companyId);
    } catch {
      // Invalid ObjectId ignored
    }
  }

  // Fancy catalog – LGDeal INC internal catalog (supervisors + manager/logist и т.д.)
  if (fancyOnly === 'true' && internalCatalogPrivileged) {
    if (color && color !== 'All') {
      const colorArray = color.split(',').map((c: string) => c.trim()).filter(Boolean);
      if (colorArray.length > 0) {
        // Case-insensitive match: DB may store "PINK", "Pink", "pink" etc.
        const escaped = colorArray.map((c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        filter.color = { $regex: `^(${escaped.join('|')})$`, $options: 'i' };
      } else {
        filter.color = { $nin: ['D', 'E', 'F', 'G'], $exists: true, $ne: '' };
      }
    } else {
      filter.color = { $nin: ['D', 'E', 'F', 'G'], $exists: true, $ne: '' };
    }
    if (intensity && intensity.trim()) {
      filter.intensity = { $regex: `^${intensity.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
    if (overtone && overtone.trim()) {
      filter.overtone = { $regex: `^${overtone.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
  } else if (fancyOnly === 'false' || !fancyOnly) {
    // White catalog: show only white stones (D–G). If no color filter was sent, restrict to white.
    if (!color || color === 'All') {
      filter.color = { $in: ['D', 'E', 'F', 'G'] };
    }
  }

  if (weight) {
    if (weight.includes(',')) {
      const [minStr, maxStr] = weight.split(',').map(w => w.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
        const weightFilter: { $gte?: number; $lte?: number } = {};
        if (!isNaN(min)) weightFilter.$gte = min;
        if (!isNaN(max)) weightFilter.$lte = max;
        filter.carat = weightFilter;
      }
    }
  }

  if (table && table.includes(',')) {
      const [minStr, maxStr] = table.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.tableSize = {};
          if (!isNaN(min)) filter.tableSize.$gte = min;
          if (!isNaN(max)) filter.tableSize.$lte = max;
      }
  }

  if (depth && depth.includes(',')) {
      const [minStr, maxStr] = depth.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.totalDepth = {};
          if (!isNaN(min)) filter.totalDepth.$gte = min;
          if (!isNaN(max)) filter.totalDepth.$lte = max;
      }
  }

  if (ratio && ratio.includes(',')) {
      const [minStr, maxStr] = ratio.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.ratio = {};
          if (!isNaN(min)) filter.ratio.$gte = min;
          if (!isNaN(max)) filter.ratio.$lte = max;
      }
  }

  // Length filter (measurement1) - handle multiple parameter names
  const lengthParam = length || len || l;
  if (lengthParam && lengthParam.includes(',')) {
      const [minStr, maxStr] = lengthParam.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.measurement1 = {};
          if (!isNaN(min)) filter.measurement1.$gte = min;
          if (!isNaN(max)) filter.measurement1.$lte = max;
      }
  }

  // Width filter (measurement2) - handle multiple parameter names
  const widthParam = width || wid || w;
  if (widthParam && widthParam.includes(',')) {
      const [minStr, maxStr] = widthParam.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.measurement2 = {};
          if (!isNaN(min)) filter.measurement2.$gte = min;
          if (!isNaN(max)) filter.measurement2.$lte = max;
      }
  }

  // Height filter (measurement3) - handle multiple parameter names
  const heightParam = height || h;
  if (heightParam && heightParam.includes(',')) {
      const [minStr, maxStr] = heightParam.split(',').map(val => val.trim());
      const min = parseFloat(minStr);
      const max = parseFloat(maxStr);
      if (!isNaN(min) || !isNaN(max)) {
          filter.measurement3 = {};
          if (!isNaN(min)) filter.measurement3.$gte = min;
          if (!isNaN(max)) filter.measurement3.$lte = max;
      }
  }
  } // End of else block for non-search filters

  logger.debug('Applying filter:', { filter });

  // Validate pagination parameters
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '1000', 10);
  
  if (page < 1) {
    throw new ValidationError('Page number must be greater than 0');
  }
  
  if (limit < 1 || limit > 10000) {
    throw new ValidationError('Limit must be between 1 and 10000');
  }

  const skip = (page - 1) * limit;
  const sort: Record<string, 1 | -1> = { price: 1 };

  let products: IProduct[] = internalCatalogPrivileged
    ? await Product.find(filter).populate('company', 'name').sort(sort).skip(skip).limit(limit).lean()
    : await Product.find(filter).sort(sort).skip(skip).limit(limit).lean();
  // Normalize shape for display (e.g. "ROUND (H&A)" -> "Round")
  products = products.map(p => ({ ...p, shape: p.shape ? normalizeShape(p.shape) : p.shape }));
  // Hide supplier price from non-internal-catalog users
  if (!internalCatalogPrivileged) {
    products = products.map(p => {
      const { price, pricePerCarat, ...rest } = p;
      return rest as IProduct;
    });
  }
  const total: number = await Product.countDocuments(filter);
  
  // Подсчитываем общее количество продуктов без учета фильтра по фото
  const totalWithoutPhotoFilter = await Product.countDocuments({
    ...filter,
    photo: { $exists: true } // Убираем только фильтр по photo
  });
  const hiddenDueToNoPhoto = totalWithoutPhotoFilter - total;
  
  const totalIncludingOnDeal: number = await Product.countDocuments({
    ...filter,
    onDeal: { $in: [true, false] }
  });
  const hiddenDueToDeals: number = totalIncludingOnDeal - total;
  
  logger.info(`Found ${products.length} products out of ${total} total matches (${hiddenDueToDeals} products hidden due to being in active deals, ${hiddenDueToNoPhoto} products hidden due to missing photos)`);
  
  // Log market price availability for monitoring
  if (products.length > 0) {
    const productsWithMarketPrice = products.filter(p => p.marketPrice && p.marketPricePerCarat).length;
    logger.info(`[marketplaceController] ${productsWithMarketPrice}/${products.length} products have valid market prices`);
  }

  const responseData = {
    success: true,
    count: products.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    products,
    hiddenProductsInfo: {
      hiddenDueToDeals,
      hiddenDueToNoPhoto,
      message: hiddenDueToDeals > 0 || hiddenDueToNoPhoto > 0 ? 
        `${hiddenDueToDeals > 0 ? `${hiddenDueToDeals} products in active deals` : ''}${hiddenDueToDeals > 0 && hiddenDueToNoPhoto > 0 ? ' and ' : ''}${hiddenDueToNoPhoto > 0 ? `${hiddenDueToNoPhoto} products without photos` : ''} are hidden from search results` : 
        null
    }
  };

  // Cache result for 1 minute (skip for LGDeal INC internal catalog users — populate company + supplier prices)
  if (!skipCache) {
    await cacheService.cacheStats(cacheKey, responseData);
  }

  res.status(200).json(responseData);
});

// findPerfectPair function
export const findPerfectPair = asyncHandler(async (req: Request & { validatedQuery?: Record<string, unknown>; user?: { isLgdealSupervisor?: boolean } }, res: Response): Promise<void> => {
  const validatedQuery = req.validatedQuery || req.query; // Use validated query if available
  const { referenceId } = validatedQuery;
  const isLgdealSupervisor = req.user?.isLgdealSupervisor;
  const stripSupplierPrice = (p: IProduct): IProduct => {
    if (isLgdealSupervisor) return p;
    const { price, pricePerCarat, ...rest } = p;
    return rest as IProduct;
  };

  // Validation is now handled by Zod schema, so referenceId is guaranteed to exist

  const referenceProduct = await Product.findById(referenceId).lean<IProductLean>();

  if (!referenceProduct) {
    throw new NotFoundError('Reference product not found');
  }

  // Validate reference product has required fields for pairing
  if (!referenceProduct.shape || !referenceProduct.color) {
    throw new ValidationError('Reference product must have shape and color to find a pair');
  }

  if (!referenceProduct.carat || referenceProduct.carat <= 0) {
    throw new ValidationError('Reference product must have a valid carat weight (> 0)');
  }

  if (!referenceProduct.photo || referenceProduct.photo === '') {
    throw new ValidationError('Reference product must have a photo to find a pair');
  }

  const constants = await ConstantsSettingsService.getSettingsOrCached();
  const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
  const tol = constants.measurementRatioGeometryTolerancePct ?? MEASUREMENT_TOLERANCE_FALLBACK;
  // Load configurable settings for progressive search
  const ppSettings = await PerfectPairSettingsService.getCurrentSettings();

  // Helper: grade ordering
  const clarityOrder = ['FL','IF','VVS1','VVS2','VS1','VS2','SI1','SI2','I1','I2','I3'];
  const gradeOrder = ['Excellent','Very Good','Good','Fair','Poor','N/A','', null as unknown as string, undefined as unknown as string];

  const gradeIndex = (list: string[], value?: any) => {
    const v = (value ?? '').toString();
    const idx = list.indexOf(v);
    return idx === -1 ? list.length : idx;
  };

  const shape = referenceProduct.shape;
  const color = referenceProduct.color;
  const clarity = referenceProduct.clarity;
  const cut = (referenceProduct.cut as string) || 'N/A';
  const polish = (referenceProduct.polish as string) || 'N/A';
  const symmetry = (referenceProduct.symmetry as string) || 'N/A';
  const carat = referenceProduct.carat as number;

  const maxStages = Math.max(1, Math.min(ppSettings.maxStage || 4, ppSettings.stages?.length || 4));
  const availableStages = ppSettings.stages?.length || 0;

  if (availableStages === 0) {
    throw new Error('Perfect Pair settings: no stages configured');
  }

  let best: { doc: IProductLean; score: number; stage: number } | null = null;

  for (let stageIdx = 0; stageIdx < maxStages; stageIdx++) {
    // Prevent accessing stages beyond available array length
    if (stageIdx >= availableStages) {
      logger.debug(`[PerfectPair] Stage ${stageIdx + 1} skipped: exceeds available stages (${availableStages})`);
      break;
    }

    const stage = ppSettings.stages[stageIdx];

    const caratTol = Math.min(5, stage.caratTolerancePct || 1) / 100;
    const filter: PairFilter = {
      _id: { $ne: referenceProduct._id.toString() },
      onDeal: false,
      sold: false,
      photo: { $exists: true, $ne: "" },
      price: { $gte: minPrice },
      shape,
      color
    } as any;

    // carat window
    filter.carat = { $gte: carat * (1 - caratTol), $lte: carat * (1 + caratTol) };

    // clarity window
    const refClIdx = gradeIndex(clarityOrder, clarity);
    const allowedClarity: string[] = clarityOrder.filter((_, i) => Math.abs(i - refClIdx) <= Math.min(2, stage.clarityStepsAllowed || 0));
    
    // Only apply clarity filter if we have valid clarity values
    if (allowedClarity.length > 0) {
      filter.clarity = { $in: allowedClarity };
    } else if (clarity && clarity !== 'N/A' && clarityOrder.includes(clarity)) {
      // If no allowed clarity found but reference clarity is valid, use exact match
      filter.clarity = clarity;
    }
    // If clarity is empty/N/A or invalid, don't apply filter (allow any clarity)

    // cut/polish/symmetry windows with downgrade limits
    const withDowngrade = (ref: string, maxDown: number) => {
      const refIdx = gradeIndex(gradeOrder, ref);
      const maxIdx = Math.min(refIdx + Math.min(2, maxDown), gradeOrder.length - 1);
      return gradeOrder.slice(refIdx, maxIdx + 1).filter(Boolean) as string[];
    };

    // For round, enforce not below Very Good if ref is EX/VG
    const roundTighten = (list: string[]) => {
      if (shape?.toLowerCase() === 'round' && ['Excellent','Very Good'].includes(cut)) {
        return list.filter(g => ['Excellent','Very Good'].includes(g));
      }
      return list;
    };

    const isRefCutEmpty = !cut || cut === 'N/A' || (typeof cut === 'string' && cut.trim() === '');
    const cutAllowed = isRefCutEmpty ? [] : roundTighten(withDowngrade(cut, stage.cutMaxDowngrade || 0));
    const isRefPolishEmpty = !polish || polish === 'N/A' || (typeof polish === 'string' && polish.trim() === '');
    const isRefSymmetryEmpty = !symmetry || symmetry === 'N/A' || (typeof symmetry === 'string' && symmetry.trim() === '');
    const polishAllowed = isRefPolishEmpty ? [] : withDowngrade(polish, stage.polishMaxDowngrade || 0);
    const symmetryAllowed = isRefSymmetryEmpty ? [] : withDowngrade(symmetry, stage.symmetryMaxDowngrade || 0);

    // Cut filter:
    // - If reference cut is empty/N/A -> do NOT restrict cut at all
    // - Otherwise allow within downgrade window (already tightened for Round EX/VG)
    if (cutAllowed.length > 0) {
      filter.cut = { $in: cutAllowed } as any;
    } // else leave undefined to allow any cut
    if (polishAllowed.length > 0) {
      filter.polish = { $in: polishAllowed } as any;
    }
    if (symmetryAllowed.length > 0) {
      filter.symmetry = { $in: symmetryAllowed } as any;
    }

    // Measurements, ratio, geometry: tolerance from admin settings (only when reference has value)
    const addNumericRange = (key: keyof IProductLean, refVal: number | undefined) => {
      if (refVal != null && typeof refVal === 'number' && refVal > 0) {
        (filter as any)[key] = { $gte: refVal * (1 - tol), $lte: refVal * (1 + tol) };
      }
    };
    addNumericRange('ratio', referenceProduct.ratio as number | undefined);
    addNumericRange('measurement1', referenceProduct.measurement1 as number | undefined);
    addNumericRange('measurement2', referenceProduct.measurement2 as number | undefined);
    addNumericRange('measurement3', referenceProduct.measurement3 as number | undefined);
    addNumericRange('tableSize', referenceProduct.tableSize as number | undefined);
    addNumericRange('totalDepth', referenceProduct.totalDepth as number | undefined);
    addNumericRange('crownHeight', referenceProduct.crownHeight as number | undefined);
    addNumericRange('pavilionDepth', referenceProduct.pavilionDepth as number | undefined);

    logger.debug(`[PerfectPair] Stage ${stageIdx + 1} filter: ${JSON.stringify(filter)}`);

    const limit = Math.max(1, Math.min(200, stage.maxCandidatesPerStage || 50));
    
    // MongoDB query optimization note:
    // The filter uses shape + color (required) + carat range + optional clarity/cut/polish/symmetry
    // Consider adding compound index: { shape: 1, color: 1, carat: 1, onDeal: 1, sold: 1 } for better performance
    // Current indexes on status+shape and status+carat may help but composite index would be optimal
    const candidates = await Product.find(filter).sort({ price: 1 as SortOrder }).limit(limit).lean<IProductLean[]>();
    logger.debug(`[PerfectPair] Stage ${stageIdx + 1} candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      if (!ppSettings.enableProgressiveRelaxation) break;
      continue;
    }

    // scoring
    const weights = ppSettings.weights || { carat: 35, clarity: 20, cut: 15, polish: 10, symmetry: 10, bonusFullGia: 10, pricePenaltyK: 7 };
    // compute price-per-carat stats
    const ppcs = candidates.map(c => (c.pricePerCarat || ((c.price as number) / Math.max(0.0001, (c.carat as number)))));
    const mean = ppcs.reduce((a, b) => a + b, 0) / ppcs.length;
    const std = Math.sqrt(ppcs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, ppcs.length - 1)) || 1;

    const scoreOf = (c: IProductLean) => {
      const car = c.carat as number;
      const caratDiffPct = Math.abs(car - carat) / Math.max(0.0001, carat);
      const caratScore = Math.max(0, weights.carat * (1 - Math.min(1, caratDiffPct / 0.05)));

      // Clarity scoring - handle edge cases where clarity might not be in order
      let clarityScore = 0;
      if (clarity && clarity !== 'N/A' && clarityOrder.includes(clarity)) {
        const clIdx = gradeIndex(clarityOrder, c.clarity as string);
        const clDiff = Math.abs(clIdx - refClIdx);
        const maxAllowedSteps = Math.max(1, Math.min(2, stage.clarityStepsAllowed || 0) || 1);
        clarityScore = Math.max(0, weights.clarity - (weights.clarity / maxAllowedSteps) * clDiff);
      } else {
        // If reference clarity is invalid, give neutral score
        clarityScore = weights.clarity * 0.5;
      }

      // Cut scoring - handle empty/N/A values
      let cutScore = 0;
      if (!isRefCutEmpty && cut !== 'N/A') {
        const cCutIdx = gradeIndex(gradeOrder, c.cut as string);
        const refCutIdx = gradeIndex(gradeOrder, cut);
        const cutDiff = Math.max(0, cCutIdx - refCutIdx); // Only penalize downgrade
        const maxDowngrade = Math.max(1, stage.cutMaxDowngrade || 1);
        cutScore = Math.max(0, weights.cut - (weights.cut / maxDowngrade) * cutDiff);
      } else {
        cutScore = weights.cut * 0.5; // Neutral score if reference cut is empty
      }

      // Polish scoring - handle empty/N/A values
      let polishScore = 0;
      if (!isRefPolishEmpty && polish !== 'N/A') {
        const cPolishIdx = gradeIndex(gradeOrder, c.polish as string);
        const refPolishIdx = gradeIndex(gradeOrder, polish);
        const polishDiff = Math.max(0, cPolishIdx - refPolishIdx); // Only penalize downgrade
        const maxDowngrade = Math.max(1, stage.polishMaxDowngrade || 1);
        polishScore = Math.max(0, weights.polish - (weights.polish / maxDowngrade) * polishDiff);
      } else {
        polishScore = weights.polish * 0.5; // Neutral score if reference polish is empty
      }

      // Symmetry scoring - handle empty/N/A values
      let symmetryScore = 0;
      if (!isRefSymmetryEmpty && symmetry !== 'N/A') {
        const cSymmetryIdx = gradeIndex(gradeOrder, c.symmetry as string);
        const refSymmetryIdx = gradeIndex(gradeOrder, symmetry);
        const symmetryDiff = Math.max(0, cSymmetryIdx - refSymmetryIdx); // Only penalize downgrade
        const maxDowngrade = Math.max(1, stage.symmetryMaxDowngrade || 1);
        symmetryScore = Math.max(0, weights.symmetry - (weights.symmetry / maxDowngrade) * symmetryDiff);
      } else {
        symmetryScore = weights.symmetry * 0.5; // Neutral score if reference symmetry is empty
      }

      // Full GIA bonus - only apply if all fields are non-empty
      const fullGiaBonus = (!isRefCutEmpty && !isRefPolishEmpty && !isRefSymmetryEmpty &&
        c.clarity === clarity && 
        (c.cut as string) === cut && 
        (c.polish as string) === polish && 
        (c.symmetry as string) === symmetry) ? weights.bonusFullGia : 0;

      // Measurements, ratio, geometry: score by closeness within 2.5% (weight 5 per dimension)
      const dimWeight = 5;
      const dimScore = (refVal: number | undefined, candVal: number | undefined) => {
        if (refVal == null || typeof refVal !== 'number' || refVal <= 0) return 0;
        const cv = candVal != null && typeof candVal === 'number' ? candVal : 0;
        const diffPct = Math.abs(cv - refVal) / refVal;
        return dimWeight * Math.max(0, 1 - Math.min(1, diffPct / tol));
      };
      const ratioScore = dimScore(referenceProduct.ratio as number | undefined, c.ratio as number | undefined);
      const m1Score = dimScore(referenceProduct.measurement1 as number | undefined, c.measurement1 as number | undefined);
      const m2Score = dimScore(referenceProduct.measurement2 as number | undefined, c.measurement2 as number | undefined);
      const m3Score = dimScore(referenceProduct.measurement3 as number | undefined, c.measurement3 as number | undefined);
      const tableScore = dimScore(referenceProduct.tableSize as number | undefined, c.tableSize as number | undefined);
      const depthScore = dimScore(referenceProduct.totalDepth as number | undefined, c.totalDepth as number | undefined);
      const crownScore = dimScore(referenceProduct.crownHeight as number | undefined, c.crownHeight as number | undefined);
      const pavilionScore = dimScore(referenceProduct.pavilionDepth as number | undefined, c.pavilionDepth as number | undefined);
      const measurementsRatioGeometryScore = ratioScore + m1Score + m2Score + m3Score + tableScore + depthScore + crownScore + pavilionScore;

      const ppc = c.pricePerCarat || ((c.price as number) / Math.max(0.0001, (c.carat as number)));
      const z = std > 0 ? (ppc - mean) / std : 0;
      const pricePenalty = Math.max(0, z) * (weights.pricePenaltyK || 7);

      return caratScore + clarityScore + cutScore + polishScore + symmetryScore + fullGiaBonus + measurementsRatioGeometryScore - pricePenalty;
    };

    for (const c of candidates) {
      const score = scoreOf(c);
      if (!best || score > best.score || (score === best.score && (c.pricePerCarat || ((c.price as number) / Math.max(0.0001, (c.carat as number)))) < (best.doc.pricePerCarat || ((best.doc.price as number) / Math.max(0.0001, (best.doc.carat as number)))))) {
        best = { doc: c, score, stage: stageIdx + 1 };
      }
    }

    // If we found a candidate in this stage, stop searching
    if (best) {
      logger.debug(`[PerfectPair] Found best match at stage ${best.stage} with score ${best.score.toFixed(2)}`);
      break;
    }
    
    // If progressive relaxation is disabled, stop after first stage
    if (!ppSettings.enableProgressiveRelaxation) {
      logger.debug('[PerfectPair] Progressive relaxation disabled, stopping search');
      break;
    }
  }

  if (best) {
    logger.debug('Found pair market price debug:', {
      _id: best.doc._id,
      marketPrice: best.doc.marketPrice,
      marketPricePerCarat: best.doc.marketPricePerCarat,
      price: best.doc.price,
      pricePerCarat: best.doc.pricePerCarat,
      carat: best.doc.carat,
      matchScore: best.score,
      stageFound: best.stage
    });
    const diamonds = [stripSupplierPrice(best.doc as IProduct)];
    res.status(200).json({ success: true, diamonds, matchScore: best.score, stageFound: best.stage });
    return;
  }

  // Final fallback: widen to carat ±5%, keep strict shape+color, ignore cut/clarity/polish/symmetry
  const fallbackTol = 0.05;
  const fallbackFilter: PairFilter = {
    _id: { $ne: referenceProduct._id.toString() },
    onDeal: false,
    sold: false,
    photo: { $exists: true, $ne: "" },
    price: { $gte: minPrice },
    shape,
    color,
    carat: { $gte: carat * (1 - fallbackTol), $lte: carat * (1 + fallbackTol) }
  } as any;
  const fallbackDoc = await Product.findOne(fallbackFilter).sort({ price: 1 as SortOrder }).lean<IProductLean | null>();
  logger.debug('[PerfectPair] Fallback filter:', JSON.stringify(fallbackFilter));
  logger.debug(`[PerfectPair] Fallback candidates found: ${fallbackDoc ? 1 : 0}`);
  if (fallbackDoc) {
    const diamonds = [stripSupplierPrice(fallbackDoc as IProduct)];
    res.status(200).json({ success: true, diamonds, matchScore: undefined, stageFound: 0 });
    return;
  }

  res.status(200).json({ success: true, message: 'No suitable pair found matching the criteria.', diamonds: [] });
});

// Получение списка компаний-поставщиков с хотя бы одним продуктом в продаже (только для супервайзеров LGDEAL)
export const getSuppliers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const isLgdealSupervisor = (req as Request & { user?: { isLgdealSupervisor?: boolean } }).user?.isLgdealSupervisor;
  if (!isLgdealSupervisor) {
    res.status(403).json({ message: 'Forbidden. Supplier list is available only to LGDEAL supervisors.' });
    return;
  }
  const availableProductFilter = {
    onDeal: false,
    sold: false,
    photo: { $exists: true, $ne: '' }
  };
  const companyIdsWithProducts = await Product.distinct('company', availableProductFilter);
  if (companyIdsWithProducts.length === 0) {
    res.json([]);
    return;
  }
  const suppliers = await Company.find({
    _id: { $in: companyIdsWithProducts },
    status: 'active'
  }).select('_id name description').sort({ name: 1 });
  res.json(suppliers);
});

// Получение доступных форм бриллиантов
export const getShapes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const shapes = await Product.distinct('shape');
  const normalizedShapes = shapes
    .filter(shape => shape) // Убираем пустые значения
    .map(shape => normalizeShape(shape)) // Нормализуем формы
    .filter((shape, index, self) => self.indexOf(shape) === index); // Уникальные значения
  
  res.json(normalizedShapes);
});

// Получение доступных цветов бриллиантов
export const getColors = async (req: Request, res: Response): Promise<void> => {
  try {
    const colors = await Product.distinct('color');
    const normalizedColors = colors
      .filter(color => color) // Убираем пустые значения
      .map(color => normalizeColor(color)) // Нормализуем цвета
      .filter((color, index, self) => self.indexOf(color) === index) // Уникальные значения
      .sort(); // Сортируем для удобства использования
    
    res.json(normalizedColors);
  } catch (error: unknown) {
    logger.error('Error fetching colors:', { error });
    res.status(500).json({ message: 'Error fetching colors', error: getErrorMessage(error) });
  }
};

// Получение доступных чистот бриллиантов.
// Использует ту же MarketplaceMeta, что и /home-stats (один compute на оба эндпоинта).
export const getClarities = async (_req: Request, res: Response): Promise<void> => {
  try {
    const meta = await resolveMarketplaceMeta();
    res.json(meta.clarities);
  } catch (error: unknown) {
    logger.error('Error fetching clarities:', { error });
    res.status(500).json({ message: 'Error fetching clarities', error: getErrorMessage(error) });
  }
};

// Получение доступных огранок бриллиантов
export const getCuts = async (req: Request, res: Response): Promise<void> => {
  try {
    const cuts = await Product.distinct('cut');
    const normalizedCuts = cuts
      .filter(cut => cut) // Убираем пустые значения
      .map(cut => normalizeCut(cut)) // Нормализуем огранки
      .filter((cut, index, self) => self.indexOf(cut) === index); // Уникальные значения
    
    // Сортировка по стандартному порядку огранки
    const cutOrder = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
    const sortedCuts = normalizedCuts.sort((a, b) => {
      const indexA = cutOrder.indexOf(a);
      const indexB = cutOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    res.json(sortedCuts);
  } catch (error: unknown) {
    logger.error('Error fetching cuts:', { error });
    res.status(500).json({ message: 'Error fetching cuts', error: getErrorMessage(error) });
  }
};

// Получение статистики для фильтров (мин/макс значения)
export const getFilterStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const constants = await ConstantsSettingsService.getSettingsOrCached();
    const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
    // Получаем только активные товары, с фото и с ценой не ниже порога (как в каталоге)
    const query = {
      status: 'available',
      sold: false,
      onDeal: false,
      price: { $gte: minPrice },
      photo: { $exists: true, $ne: '' }
    };
    
    const caratStats = await Product.aggregate([
      { $match: query },
      { $group: { 
        _id: null, 
        minCarat: { $min: '$carat' }, 
        maxCarat: { $max: '$carat' } 
      }}
    ]);
    
    const priceStats = await Product.aggregate([
      { $match: query },
      { $group: { 
        _id: null, 
        minPrice: { $min: '$price' }, 
        maxPrice: { $max: '$price' } 
      }}
    ]);
    
    res.json({
      carat: {
        min: caratStats.length > 0 ? caratStats[0].minCarat : 0,
        max: caratStats.length > 0 ? caratStats[0].maxCarat : 0
      },
      price: {
        min: priceStats.length > 0 ? priceStats[0].minPrice : 0,
        max: priceStats.length > 0 ? priceStats[0].maxPrice : 0
      }
    });
  } catch (error: unknown) {
    logger.error('Error fetching filter stats:', { error });
    res.status(500).json({ message: 'Error fetching filter stats', error: getErrorMessage(error) });
  }
};

// Вспомогательная функция для построения запроса фильтрации
const buildFilterQuery = (filters: Record<string, unknown>, minPrice: number = MIN_SUPPLIER_PRICE_FALLBACK) => {
  const query: Record<string, unknown> = {
    status: 'available',
    sold: false,
    onDeal: false,
    // Исключаем продукты без фото
    photo: { 
      $exists: true, 
      $ne: "" 
    },
    // Не показывать камни с нереально низкой ценой поставщика
    price: { $gte: minPrice }
  };
  
  // Фильтр по форме
  if (Array.isArray(filters.shape) && filters.shape.length > 0) {
    query.shape = { $in: filters.shape };
  }
  
  // Фильтр по цвету
  if (Array.isArray(filters.color) && filters.color.length > 0) {
    query.color = { $in: filters.color };
  }
  
  // Фильтр по чистоте
  if (Array.isArray(filters.clarity) && filters.clarity.length > 0) {
    query.clarity = { $in: filters.clarity };
  }
  
  // Фильтр по огранке
  if (Array.isArray(filters.cut) && filters.cut.length > 0) {
    query.cut = { $in: filters.cut };
  }
  
  // Фильтр по весу (карат)
  if (filters.carat && typeof filters.carat === 'object') {
    const carat = filters.carat as { min?: number; max?: number };
    if (carat.min !== undefined || carat.max !== undefined) {
      query.carat = {} as { $gte?: number; $lte?: number };
      if (carat.min !== undefined) {
        (query.carat as { $gte?: number }).$gte = carat.min;
      }
      if (carat.max !== undefined) {
        (query.carat as { $lte?: number }).$lte = carat.max;
      }
    }
  }
  
  // Фильтр по цене (минимум не ниже minPrice)
  if (filters.price && typeof filters.price === 'object') {
    const price = filters.price as { min?: number; max?: number };
    const priceQuery = query.price as { $gte?: number; $lte?: number };
    if (price.min !== undefined) {
      priceQuery.$gte = Math.max(minPrice, price.min);
    }
    if (price.max !== undefined) {
      priceQuery.$lte = price.max;
    }
  }
  
  // Фильтр по компании-поставщику
  if (Array.isArray(filters.company) && filters.company.length > 0) {
    query.company = { $in: filters.company };
  }
  
  return query;
};

// Поиск бриллиантов с применением фильтров
export const searchProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const constants = await ConstantsSettingsService.getSettingsOrCached();
    const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
    const { 
      filters = {}, 
      page = 1, 
      limit = 20, 
      sortBy = 'price', 
      sortOrder = 'asc' 
    } = req.body;
    
    const query = buildFilterQuery(filters, minPrice);
    
    // Настройка сортировки
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Расчет пагинации
    const skip = (page - 1) * limit;
    
    // Подсчет общего количества результатов
    const total = await Product.countDocuments(query);
    
    // Подсчитываем общее количество продуктов без учета фильтра по фото
    const totalWithoutPhotoFilter = await Product.countDocuments({
      ...query,
      photo: { $exists: true } // Убираем только фильтр по photo
    });
    const hiddenDueToNoPhoto = totalWithoutPhotoFilter - total;
    
    // Получение результатов с пагинацией и сортировкой
    const products = await Product.find(query)
      .populate('company', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      products,
      hiddenProductsInfo: {
        hiddenDueToNoPhoto,
        message: hiddenDueToNoPhoto > 0 ? 
          `${hiddenDueToNoPhoto} products without photos are hidden from search results` : 
          null
      }
    });
  } catch (error: unknown) {
    logger.error('Error searching products:', { error });
    res.status(500).json({ message: 'Error searching products', error: getErrorMessage(error) });
  }
};

// Получение деталей одного бриллианта  
export const getProductDetails = async (req: ValidatedRequest<{}, { productId: string }, {}>, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const isLgdealSupervisor = (req as Request & { user?: { isLgdealSupervisor?: boolean } }).user?.isLgdealSupervisor;

    const product = await Product.findById(productId).populate('company', 'name').lean<IProductLean>();
    
    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const constants = await ConstantsSettingsService.getSettingsOrCached();
    const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
    // Не отдавать камни с нереально низкой ценой поставщика (скрыть из каталога)
    if (product.price != null && product.price < minPrice) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const payload = { ...product };
    if (!isLgdealSupervisor) {
      delete (payload as Record<string, unknown>).price;
      delete (payload as Record<string, unknown>).pricePerCarat;
    }
    res.json(payload);
  } catch (error: unknown) {
    logger.error('Error fetching product details:', { error });
    res.status(500).json({ message: 'Error fetching product details', error: getErrorMessage(error) });
  }
};

// Получение истории цен бриллианта
export const getProductPriceHistory = async (req: ValidatedRequest<{}, { productId: string }, {}>, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    
    // Здесь должна быть логика получения истории цен
    // Это зависит от того, как вы отслеживаете изменения цен в вашей системе
    
    // Пример заглушки
    res.json([
      { date: new Date('2023-01-01'), price: 1000 },
      { date: new Date('2023-02-01'), price: 1050 },
      { date: new Date('2023-03-01'), price: 980 }
    ]);
  } catch (error: unknown) {
    logger.error('Error fetching price history:', { error });
    res.status(500).json({ message: 'Error fetching price history', error: getErrorMessage(error) });
  }
};

// Получение похожих бриллиантов
export const getSimilarProducts = async (req: ValidatedRequest<{}, { productId: string }, {}>, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const isLgdealSupervisor = (req as Request & { user?: { isLgdealSupervisor?: boolean } }).user?.isLgdealSupervisor;

    const product = await Product.findById(productId).lean<IProductLean>();
    
    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const constants = await ConstantsSettingsService.getSettingsOrCached();
    const minPrice = constants.minSupplierPrice ?? MIN_SUPPLIER_PRICE_FALLBACK;
    // Найти похожие товары с такой же формой, но небольшими вариациями в карате и цвете
    const caratValue = product.carat || 0;
    let similarProducts = await Product.find({
      _id: { $ne: productId }, // Исключаем сам товар
      shape: product.shape,
      carat: { $gte: caratValue - 0.05, $lte: caratValue + 0.05 },
      status: 'available',
      sold: false,
      onDeal: false,
      price: { $gte: minPrice },
      // Исключаем продукты без фото при поиске похожих
      photo: { 
        $exists: true, 
        $ne: "" 
      }
    })
    .populate('company', 'name')
    .limit(5)
    .lean<IProductLean[]>();

    if (!isLgdealSupervisor) {
      similarProducts = similarProducts.map(p => {
        const { price, pricePerCarat, ...rest } = p;
        return rest as IProductLean;
      });
    }
    
    res.json(similarProducts);
  } catch (error: unknown) {
    logger.error('Error fetching similar products:', { error });
    res.status(500).json({ message: 'Error fetching similar products', error: getErrorMessage(error) });
  }
}; 