// Generic
import httpClient from '../shared/httpClient';
import { externalApiDuration, externalItemsFetched } from '../metrics';
import * as productUtils from '../shared/productUtils';
import { ICompanyApiConfig, ITokenUsageRule } from '../models/CompanyApiConfig';
import { FetchProductsFunction, getAuthTokens } from '../syncLogic';
import { format as formatDate } from 'date-fns';
import { assertSafeUrlOrThrow } from '../shared/security';
import { getFieldValue } from '../shared/productUtils';
import { logger } from '../shared/logger';
import { XMLParser } from 'fast-xml-parser';

// Helper function to get value from object by path string (e.g., 'data.token')
function getValueByPath(obj: any, path: string | undefined | null): any {
  if (!path || typeof path !== 'string') {
    if (path === '' && obj !== undefined) return obj;
    return undefined;
  }
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/** Detect if response body looks like XML */
function isXmlResponse(data: any): data is string {
  if (typeof data !== 'string') return false;
  const trimmed = data.trim();
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<');
}

/** Normalize XML-parsed item: copy @_attr keys to attr so getFieldValue/column mappings can find them */
function normalizeXmlItem(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  for (const key of Object.keys(item)) {
    if (key.startsWith('@_')) {
      const plainKey = key.slice(2);
      if (!(plainKey in out)) out[plainKey] = item[key];
    }
  }
  return out;
}

/** Parse XML string and extract array at dataKey (handles XML where key wraps an array or single object) */
function parseXmlAndGetArray(xmlString: string, dataKey: string): any[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlString);
  const value = getValueByPath(parsed, dataKey);
  let arr: any[] = [];
  if (Array.isArray(value)) arr = value;
  else if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter(k => !k.startsWith('@')); // skip attribute keys
    const firstArrayKey = keys.find(k => Array.isArray(value[k]));
    if (firstArrayKey) arr = value[firstArrayKey];
    else if (keys.length > 0) arr = [value]; // single product object (e.g. one <ExcelData> block)
  }
  return arr.map(normalizeXmlItem);
}

/** Detect if response body looks like CSV (header line + comma-separated values) */
function isCsvResponse(data: any): data is string {
  if (typeof data !== 'string' || !data.trim()) return false;
  const firstLine = data.split(/\r?\n/)[0]?.trim() || '';
  return firstLine.includes(',') && firstLine.length > 2 && !firstLine.startsWith('<');
}

/** Parse one CSV line respecting quoted fields (e.g. "a,b" -> one field) */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      out.push(cur.trim());
      cur = '';
    } else if (c !== '\r') {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Parse CSV string (first line = headers) into array of objects */
function parseCsvToArray(csvString: string): Record<string, string>[] {
  const lines = csvString.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

/**
 * When dataKey is empty or points at a wrapper object, APIs often return
 * `{ "StockList": [ ... ] }` — getValueByPath then yields a non-array object and we
 * would fetch 0 products. Unwrap the first (or largest) array property.
 */
function tryUnwrapJsonObjectToProductArray(
  productsOnPage: unknown,
  responseData: unknown,
  companyName: string,
  dataKey: string
): any[] {
  const tryOne = (obj: unknown): any[] | null => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const record = obj as Record<string, unknown>;
    const arrayKeys = Object.keys(record).filter((k) => Array.isArray(record[k]));
    if (arrayKeys.length === 1) {
      const arr = record[arrayKeys[0]] as any[];
      logger.info(
        `[fetchGenericProducts] ${companyName}: unwrapped JSON array from property "${arrayKeys[0]}" (dataKey="${dataKey}") -> length=${arr.length}`
      );
      return arr;
    }
    if (arrayKeys.length > 1) {
      let best: any[] = [];
      let bestKey = '';
      for (const k of arrayKeys) {
        const arr = record[k] as any[];
        if (arr.length > best.length) {
          best = arr;
          bestKey = k;
        }
      }
      if (best.length > 0) {
        logger.info(
          `[fetchGenericProducts] ${companyName}: unwrapped largest array property "${bestKey}" among ${arrayKeys.length} (dataKey="${dataKey}") -> length=${best.length}`
        );
        return best;
      }
    }
    return null;
  };

  if (Array.isArray(productsOnPage)) return productsOnPage;

  const fromPath = tryOne(productsOnPage);
  if (fromPath) return fromPath;

  if (responseData !== undefined && responseData !== productsOnPage) {
    const fromRoot = tryOne(responseData);
    if (fromRoot) return fromRoot;
  }

  return [];
}

const MAX_PAGES_DEFAULT = 100;
const MAX_PAGES_START_END = 100;

function getHeaderValue(headers: any, key: string): string {
  if (!headers || typeof headers !== 'object') return '';
  const foundKey = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase());
  return foundKey ? String(headers[foundKey] ?? '') : '';
}

function isSoapXmlContentType(contentType: string): boolean {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('text/xml') || ct.includes('application/soap+xml') || ct.includes('application/xml');
}

function tryGetRawBodyXml(baseBodyPayload: any): string | null {
  if (!baseBodyPayload) return null;
  if (typeof baseBodyPayload === 'string' && baseBodyPayload.trim()) return baseBodyPayload;
  if (typeof baseBodyPayload === 'object') {
    const raw = baseBodyPayload.__rawBody ?? baseBodyPayload.rawBody ?? baseBodyPayload.rawXml ?? baseBodyPayload.xml;
    if (typeof raw === 'string' && raw.trim()) return raw;
  }
  return null;
}

export const fetchGenericProducts: FetchProductsFunction = async (companyApiConfigDoc, companyId, companyName) => {
    let acquiredAuthTokens: Record<string, any> = {};

    const tokenAuthConfig = companyApiConfigDoc.tokenAuthConfig;

    if (tokenAuthConfig && tokenAuthConfig.enabled && tokenAuthConfig.url) {
        try {
            acquiredAuthTokens = await getAuthTokens(tokenAuthConfig);
            const tokenKeys = Object.keys(acquiredAuthTokens);
            const usageRulesCount = (tokenAuthConfig.tokenUsage && tokenAuthConfig.tokenUsage.length) || 0;
            logger.info(`[fetchGenericProducts] Token auth for ${companyName}: tokens acquired=${tokenKeys.length} (keys: ${tokenKeys.join(',') || 'none'}), tokenUsage rules=${usageRulesCount}`);
            if (tokenKeys.length === 0 && usageRulesCount > 0) {
                logger.warn(`[fetchGenericProducts] Token authentication for ${companyName} is enabled, but no tokens were acquired. Check Token(s) Path in Response (e.g. data.token).`);
            }
        } catch (tokenError: any) {
            logger.error(`[fetchGenericProducts] Token acquisition failed: ${tokenError.message}`);
            throw new Error(`Token acquisition failed: ${tokenError.message}`);
        }
    }

    const apiInternalConfig = companyApiConfigDoc.config;
    if (!apiInternalConfig || !apiInternalConfig.url) {
        throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
    }
    
    // SSRF guard: ensure target URL is safe
    assertSafeUrlOrThrow(apiInternalConfig.url, 'fetchGenericProducts.config.url');
    const originalUrl = new URL(apiInternalConfig.url);
    const paramsFromUrl = Object.fromEntries(originalUrl.searchParams.entries());

    const baseRequestConfig: any = {
        method: (apiInternalConfig.requestType || 'get').toLowerCase(),
        url: `${originalUrl.origin}${originalUrl.pathname}`,
        headers: { ...(apiInternalConfig.headers || {}) },
        params: { ...paramsFromUrl, ...(apiInternalConfig.params || {}) },
        timeout: 600000 // 10 min for large XML/JSON responses (e.g. Parallel Diamonds)
    };

    // Sanitize logs to avoid leaking secrets (never log header/param values)
    logger.info(`[fetchGenericProducts] Request config for ${companyName}:`, {
        method: baseRequestConfig.method,
        url: baseRequestConfig.url,
        paramKeys: Object.keys(baseRequestConfig.params || {}),
        headerKeys: Object.keys(baseRequestConfig.headers || {})
    });

    if (tokenAuthConfig && tokenAuthConfig.enabled && tokenAuthConfig.tokenUsage && tokenAuthConfig.tokenUsage.length > 0 && Object.keys(acquiredAuthTokens).length > 0) {
        tokenAuthConfig.tokenUsage.forEach((rawRule: ITokenUsageRule) => {
            // Normalize to plain object (Mongoose subdocuments may not expose properties the same way)
            const usageRule: ITokenUsageRule = rawRule && typeof (rawRule as unknown as { toObject?: () => ITokenUsageRule }).toObject === 'function'
                ? (rawRule as unknown as { toObject: () => ITokenUsageRule }).toObject()
                : { ...rawRule };

            const tokenKeyInAcquired = usageRule.nameInResponse || 'defaultToken';
            const tokenValue = acquiredAuthTokens[tokenKeyInAcquired];

            if (tokenValue === undefined || tokenValue === null) return;

            const placeholder = usageRule.placeholderName;
            let escapedPlaceholder: RegExp | null = null;
            if (typeof placeholder === 'string' && placeholder) {
                const placeholderRegexString = placeholder.replace(/[.*+?^${}()|[\\\]]/g, '\\$&');
                escapedPlaceholder = new RegExp(placeholderRegexString, 'g');
            }

            const tokenStr = tokenValue.toString();
            const prefix = usageRule.formatPrefix ?? '';
            const suffix = usageRule.formatSuffix ?? '';
            const placement = String(usageRule.placement || '').toLowerCase().trim();
            const destName = (typeof usageRule.destinationName === 'string' ? usageRule.destinationName : '').trim();
            const destHeader = destName || (placement === 'header' && prefix.toLowerCase().includes('bearer') ? 'Authorization' : '');

            switch (placement) {
                case 'header':
                    if (destHeader) {
                        baseRequestConfig.headers = baseRequestConfig.headers || {};
                        baseRequestConfig.headers[destHeader] = prefix + tokenStr + suffix;
                    }
                    break;
                case 'param':
                    if (destName) {
                        baseRequestConfig.params = baseRequestConfig.params || {};
                        baseRequestConfig.params[destName] = prefix + tokenStr + suffix;
                    }
                    break;
                case 'url_segment':
                    if (escapedPlaceholder && baseRequestConfig.url && baseRequestConfig.url.includes(placeholder!)) {
                        baseRequestConfig.url = baseRequestConfig.url.replace(escapedPlaceholder, tokenValue.toString());
                    }
                    break;
                case 'body': {
                    // Defer body injection; it depends on method and content-type
                    baseRequestConfig.__deferredBodyTokens = baseRequestConfig.__deferredBodyTokens || [];
                    baseRequestConfig.__deferredBodyTokens.push({ usageRule, tokenValue });
                    break;
                }
            }
        });
        const authHeaderKey = baseRequestConfig.headers && Object.keys(baseRequestConfig.headers).find(
            k => k.toLowerCase() === 'authorization'
        );
        const authHeaderValue = authHeaderKey ? String(baseRequestConfig.headers?.[authHeaderKey] ?? '').trim() : '';
        const hasValidAuthHeader = !!authHeaderValue && authHeaderValue.toLowerCase().startsWith('bearer ') && authHeaderValue.length > 7;
        if (!hasValidAuthHeader && Object.keys(acquiredAuthTokens).length > 0) {
            const tokenForAuth = acquiredAuthTokens.defaultToken ?? acquiredAuthTokens.token ?? Object.values(acquiredAuthTokens)[0];
            if (tokenForAuth != null && String(tokenForAuth).trim()) {
                baseRequestConfig.headers = baseRequestConfig.headers || {};
                baseRequestConfig.headers['Authorization'] = 'Bearer ' + String(tokenForAuth).trim();
                logger.info(`[fetchGenericProducts] ${companyName}: Set Authorization header (fallback).`);
            } else {
                logger.warn(`[fetchGenericProducts] ${companyName}: Token auth enabled but no token value. Check Token(s) Path in Response (e.g. data.token).`);
            }
        }
    }

    const allApiProducts: any[] = [];
    let currentPage = 1;
    let hasMore = true;
    let previousPageCerts: string | null = null;

    const paginationKeys = ['limit', 'per_page', 'pageSize', 'size'];
    const paramsObj = baseRequestConfig.params && typeof baseRequestConfig.params === 'object' ? baseRequestConfig.params : {};
    const paramsKeys = Object.keys(paramsObj);
    let itemsPerPageKey = paramsKeys.find(k => paginationKeys.includes(k.toLowerCase()));
    let itemsPerPageRaw: string | number | undefined = itemsPerPageKey ? paramsObj[itemsPerPageKey] : undefined;
    if (itemsPerPageRaw === undefined && originalUrl.searchParams) {
        for (const key of paginationKeys) {
            const v = originalUrl.searchParams.get(key);
            if (v != null && v !== '') {
                itemsPerPageKey = key;
                itemsPerPageRaw = v;
                break;
            }
        }
    }
    const itemsPerPage = itemsPerPageRaw != null ? parseInt(String(itemsPerPageRaw), 10) : 5000;
    const hasPaginationParam = itemsPerPageKey != null && Number.isFinite(itemsPerPage) && itemsPerPage > 0;
    const maxPages = hasPaginationParam ? MAX_PAGES_DEFAULT : 1;
    const totalCountPath = apiInternalConfig.totalCountPath;
    let effectiveMaxPages = maxPages;

    while (hasMore && currentPage <= effectiveMaxPages) {
        const paginatedRequestConfig = JSON.parse(JSON.stringify(baseRequestConfig));
        // Remove internal helper field if present
        if (paginatedRequestConfig.__deferredBodyTokens) {
            delete paginatedRequestConfig.__deferredBodyTokens;
        }
        const now = new Date();

        if (paginatedRequestConfig.params) {
            Object.keys(paginatedRequestConfig.params).forEach(key => {
                let value = paginatedRequestConfig.params[key];
                if (typeof value === 'string') {
                    value = value.replace(/\{page\}/g, String(currentPage));
                    value = value.replace(/\{YYYY-MM-DD HH:mm:ss\}/g, formatDate(now, 'yyyy-MM-dd HH:mm:ss'));
                    value = value.replace(/\{YYYY-MM-DD\}/g, formatDate(now, 'yyyy-MM-dd'));
                    paginatedRequestConfig.params[key] = value;
                }
            });
        }
        // Ensure final URL is still safe after placeholder substitutions
        if (paginatedRequestConfig.url) {
            assertSafeUrlOrThrow(paginatedRequestConfig.url, 'fetchGenericProducts.final.url');
        }
        const hasPostBody = apiInternalConfig.baseBodyPayload && typeof apiInternalConfig.baseBodyPayload === 'object' && Object.keys(apiInternalConfig.baseBodyPayload).length > 0;
        const requestContentType = getHeaderValue(paginatedRequestConfig.headers, 'Content-Type');
        const rawSoapBody = paginatedRequestConfig.method?.toLowerCase() === 'post' && isSoapXmlContentType(requestContentType)
          ? tryGetRawBodyXml(apiInternalConfig.baseBodyPayload)
          : null;

        if (rawSoapBody) {
            // SOAP/XML: send raw XML string as body (do NOT JSON-encode).
            paginatedRequestConfig.data = rawSoapBody;
            // SOAP servers can be strict about these.
            if (!getHeaderValue(paginatedRequestConfig.headers, 'Accept')) {
              paginatedRequestConfig.headers = paginatedRequestConfig.headers || {};
              paginatedRequestConfig.headers['Accept'] = 'text/xml';
            }
        } else if (paginatedRequestConfig.method?.toLowerCase() === 'post' && (hasPostBody || (paginatedRequestConfig.params && typeof paginatedRequestConfig.params === 'object' && Object.keys(paginatedRequestConfig.params).length > 0))) {
            // Send as form-urlencoded when URL is MRM/Avira or config explicitly requests application/x-www-form-urlencoded
            const contentType = requestContentType ? String(requestContentType).toLowerCase() : '';
            const isFormDataRequest = apiInternalConfig.url?.includes('mrmsolitaires.in') ||
                apiInternalConfig.url?.includes('avirastar.com') ||
                apiInternalConfig.url?.includes('rushabhdiam.com') ||
                apiInternalConfig.url?.includes('thediamonddreams.com') ||
                contentType.includes('application/x-www-form-urlencoded');

            if (isFormDataRequest) {
                // Convert to form body (application/x-www-form-urlencoded); source: baseBodyPayload, then params
                const formData = new URLSearchParams();
                const bodySource = (hasPostBody ? apiInternalConfig.baseBodyPayload : {}) as Record<string, unknown>;
                const paramSource = (paginatedRequestConfig.params && typeof paginatedRequestConfig.params === 'object')
                    ? paginatedRequestConfig.params as Record<string, unknown> : {};
                const formEntries = { ...paramSource, ...bodySource };
                Object.keys(formEntries).forEach(key => {
                    let value = formEntries[key];
                    if (value === undefined || value === null) return;
                    if (typeof value === 'string') {
                        value = value.replace(/\{page\}/g, String(currentPage));
                    }
                    formData.append(key, String(value));
                });
                paginatedRequestConfig.data = formData;
                if (!paginatedRequestConfig.headers) paginatedRequestConfig.headers = {};
                paginatedRequestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else {
                // Default JSON behavior: merge base body with pagination params so POST APIs that expect page/pageSize in body get them
                const baseBody = JSON.parse(JSON.stringify(apiInternalConfig.baseBodyPayload || {}));
                const paginationParams = paginatedRequestConfig.params && typeof paginatedRequestConfig.params === 'object'
                    ? Object.fromEntries(Object.entries(paginatedRequestConfig.params).map(([k, v]) => [k, typeof v === 'number' ? v : String(v)]))
                    : {};
                paginatedRequestConfig.data = { ...baseBody, ...paginationParams };
                Object.keys(paginatedRequestConfig.data).forEach(key => {
                    let value = paginatedRequestConfig.data[key];
                    if (typeof value === 'string') {
                        value = value.replace(/\{page\}/g, String(currentPage));
                        value = value.replace(/\{YYYY-MM-DD HH:mm:ss\}/g, formatDate(now, 'yyyy-MM-dd HH:mm:ss'));
                        value = value.replace(/\{YYYY-MM-DD\}/g, formatDate(now, 'yyyy-MM-dd'));
                        paginatedRequestConfig.data[key] = value;
                    }
                });
                // Inject tokens into body if configured
                if (Array.isArray(baseRequestConfig.__deferredBodyTokens)) {
                    for (const item of baseRequestConfig.__deferredBodyTokens) {
                        const rule = item.usageRule as ITokenUsageRule;
                        const value = item.tokenValue;
                        if (rule.bodyKeyPath) {
                            const pathParts = rule.bodyKeyPath.split('.');
                            let cursor = paginatedRequestConfig.data;
                            for (let i = 0; i < pathParts.length - 1; i++) {
                                const part = pathParts[i];
                                if (cursor[part] === undefined || cursor[part] === null || typeof cursor[part] !== 'object') {
                                    cursor[part] = {};
                                }
                                cursor = cursor[part];
                            }
                            cursor[pathParts[pathParts.length - 1]] = value.toString();
                        }
                    }
                }
                
                // Ensure Content-Type is set for JSON requests
                if (!paginatedRequestConfig.headers['Content-Type']) {
                    paginatedRequestConfig.headers['Content-Type'] = 'application/json';
                }
            }
        }

        // Sanitize logging (no header/param values)
        const logPayload: { method: string; url: string; paramsInUrl?: string; hasAuthHeader?: boolean } = {
            method: paginatedRequestConfig.method,
            url: paginatedRequestConfig.url
        };
        if (paginatedRequestConfig.method?.toLowerCase() === 'get' && paginatedRequestConfig.params && Object.keys(paginatedRequestConfig.params).length > 0) {
            const qs = new URLSearchParams();
            Object.keys(paginatedRequestConfig.params).forEach(k => qs.set(k, '***'));
            logPayload.paramsInUrl = qs.toString();
        }
        const outAuthKey = paginatedRequestConfig.headers && Object.keys(paginatedRequestConfig.headers).find(k => k.toLowerCase() === 'authorization');
        logPayload.hasAuthHeader = !!outAuthKey && !!String(paginatedRequestConfig.headers?.[outAuthKey] ?? '').trim();
        logger.info(`[fetchGenericProducts] Final request config for ${companyName} (page ${currentPage}):`, logPayload);

        try {
            const endTimer = externalApiDuration.startTimer({ supplier: companyName, endpoint: baseRequestConfig.url, status: 'pending' });
            let response;
            try {
              response = await httpClient(paginatedRequestConfig);
              endTimer({ supplier: companyName, endpoint: baseRequestConfig.url, status: String(response.status) });
            } catch (err: any) {
              endTimer({ supplier: companyName, endpoint: baseRequestConfig.url, status: String(err?.response?.status || 'error') });
              throw err;
            }
            const dataKey = apiInternalConfig.dataKey || '';
            const contentType = response.headers?.['content-type'] || response.headers?.['Content-Type'] || '';
            const isResponseArray = Array.isArray(response.data);
            logger.info(`[fetchGenericProducts] ${companyName} page ${currentPage}: response.data type=${typeof response.data}, isArray=${isResponseArray}, content-type=${contentType}, dataKey="${dataKey}"`);
            if (typeof response.data === 'string') {
              const preview = response.data.length > 400 ? response.data.slice(0, 400) + '...' : response.data;
              logger.info(`[fetchGenericProducts] ${companyName} response body preview: ${preview.replace(/\s+/g, ' ')}`);
            }

            let productsOnPage: any;
            if (isXmlResponse(response.data)) {
              const parser = new XMLParser({ ignoreAttributes: false });
              const parsed = parser.parse(response.data);
              const topKeys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
              logger.info(`[fetchGenericProducts] ${companyName} XML parsed top-level keys: ${topKeys.join(', ')}`);
              productsOnPage = parseXmlAndGetArray(response.data, dataKey);
              // Parallel Diamonds (and similar) wrap payload in <Inventory><ExcelData>...</ExcelData></Inventory>
              if ((!productsOnPage || (Array.isArray(productsOnPage) && productsOnPage.length === 0)) && dataKey === 'ExcelData' && topKeys.some((k: string) => k === 'Inventory')) {
                const fallbackKey = 'Inventory.ExcelData';
                productsOnPage = parseXmlAndGetArray(response.data, fallbackKey);
                if (Array.isArray(productsOnPage) && productsOnPage.length > 0) {
                  logger.info(`[fetchGenericProducts] ${companyName} XML used fallback path "${fallbackKey}" -> array length=${productsOnPage.length}`);
                }
              }
              logger.info(`[fetchGenericProducts] ${companyName} XML dataKey="${dataKey}" -> array length=${Array.isArray(productsOnPage) ? productsOnPage.length : 'not-array'}`);
            } else if (typeof response.data === 'string' && isCsvResponse(response.data)) {
              productsOnPage = parseCsvToArray(response.data);
              logger.info(`[fetchGenericProducts] ${companyName} CSV parsed -> array length=${productsOnPage.length}`);
            } else {
              productsOnPage = getValueByPath(response.data, dataKey);
              if (!Array.isArray(productsOnPage) && isResponseArray) {
                productsOnPage = response.data;
                logger.info(`[fetchGenericProducts] ${companyName}: response is root-level array, using as products (length=${productsOnPage.length})`);
              }
              if (Array.isArray(productsOnPage)) {
                logger.info(`[fetchGenericProducts] ${companyName}: products array length=${productsOnPage.length}`);
              } else if (typeof response.data === 'object' && response.data !== null) {
                const keys = Object.keys(response.data);
                logger.info(`[fetchGenericProducts] ${companyName}: response is object, keys=${keys.slice(0, 12).join(',')}${keys.length > 12 ? '...' : ''}, productsFromPath=not-array`);
              }
              if (!Array.isArray(productsOnPage)) {
                const unwrapped = tryUnwrapJsonObjectToProductArray(productsOnPage, response.data, companyName, dataKey);
                if (unwrapped.length > 0) {
                  productsOnPage = unwrapped;
                  logger.info(`[fetchGenericProducts] ${companyName}: after unwrap, products array length=${productsOnPage.length}`);
                }
              }
            }

            if (Array.isArray(productsOnPage) && productsOnPage.length > 0) {
                // After first successful response, optionally cap pages by totalCount from API (e.g. data.totalCount)
                if (totalCountPath && currentPage === 1) {
                    const totalCount = getValueByPath(response.data, totalCountPath);
                    const totalNum = typeof totalCount === 'number' && totalCount > 0 ? totalCount : (typeof totalCount === 'string' ? parseInt(totalCount, 10) : NaN);
                    logger.info(`[fetchGenericProducts] ${companyName}: totalCountPath="${totalCountPath}" rawValue=${JSON.stringify(totalCount)} totalNum=${totalNum} itemsPerPage=${itemsPerPage}`);
                    if (Number.isFinite(totalNum) && itemsPerPage > 0) {
                        // If totalCount equals itemsPerPage, API may be returning page size instead of total — don't cap to 1 page
                        if (totalNum === itemsPerPage && productsOnPage.length === itemsPerPage) {
                            logger.info(`[fetchGenericProducts] ${companyName}: totalCount (${totalNum}) equals page size; treating as uncertain, will fetch until empty/duplicate page`);
                        } else {
                            effectiveMaxPages = Math.min(effectiveMaxPages, Math.ceil(totalNum / itemsPerPage));
                            logger.info(`[fetchGenericProducts] ${companyName}: totalCount=${totalNum}, will fetch up to ${effectiveMaxPages} pages`);
                        }
                    }
                }
                const currentPageCerts = JSON.stringify(productsOnPage.map(p => getFieldValue(p, 'certificateNumber')).sort());
                if (previousPageCerts && previousPageCerts === currentPageCerts) {
                    logger.info(`[fetchGenericProducts] Duplicate page content detected for ${companyName} on page ${currentPage}. Stopping pagination.`);
                    hasMore = false;
                    continue;
                }
                previousPageCerts = currentPageCerts;

                allApiProducts.push(...productsOnPage);
                externalItemsFetched.inc({ supplier: companyName }, productsOnPage.length);

                if (productsOnPage.length < itemsPerPage) {
                    // Fewer items than requested -> likely last page
                    hasMore = false;
                } else {
                    // Got a full page -> there may be more pages
                    hasMore = true;
                }
            } else {
                if (typeof response?.data === 'string' && response.data.length < 600) {
                    logger.info(`[fetchGenericProducts] ${companyName} page ${currentPage}: 0 products, response preview: ${response.data.replace(/\s+/g, ' ').trim()}`);
                } else if (Array.isArray(productsOnPage) && productsOnPage.length === 0) {
                    logger.info(`[fetchGenericProducts] ${companyName} page ${currentPage}: 0 products returned`);
                }
                hasMore = false;
            }
        } catch (error: any) {
            logger.error(`[fetchGenericProducts] API Error on page ${currentPage} for company ${companyName}: ${error.message}`);
            if (error.response) {
                logger.error(`[fetchGenericProducts] Response status: ${error.response.status}`);
                // Log response body for 4xx/5xx to help debug auth and server errors (e.g. 403 from Rushabh)
                const body = error.response.data;
                if (body !== undefined && body !== null) {
                    const preview = typeof body === 'string' ? (body.length > 500 ? body.slice(0, 500) + '...' : body) : JSON.stringify(body).slice(0, 500);
                    logger.error(`[fetchGenericProducts] Response body: ${preview.replace(/\s+/g, ' ').trim()}`);
                }
            }
            // Exponential backoff + limited retries per page
            const maxRetries = 3;
            let lastRetryError: any = error;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(r => setTimeout(r, delay));
                    const retryEnd = externalApiDuration.startTimer({ supplier: companyName, endpoint: baseRequestConfig.url, status: 'retry' });
                    const retryResp = await httpClient(paginatedRequestConfig);
                    retryEnd({ supplier: companyName, endpoint: baseRequestConfig.url, status: String(retryResp.status) });
                    const dataKey = apiInternalConfig.dataKey || '';
                    const productsOnPage = isXmlResponse(retryResp.data)
                      ? parseXmlAndGetArray(retryResp.data, dataKey)
                      : (typeof retryResp.data === 'string' && isCsvResponse(retryResp.data))
                        ? parseCsvToArray(retryResp.data)
                        : getValueByPath(retryResp.data, dataKey);
                    if (Array.isArray(productsOnPage) && productsOnPage.length > 0) {
                        allApiProducts.push(...productsOnPage);
                        externalItemsFetched.inc({ supplier: companyName }, productsOnPage.length);
                    }
                    // If retry succeeded (even if 0 products), continue pagination loop.
                    lastRetryError = null;
                    break;
                } catch (e) {
                    lastRetryError = e;
                    if (attempt === maxRetries) {
                    logger.error(`[fetchGenericProducts] Page ${currentPage} failed after retries`);
                    }
                }
            }
            if (lastRetryError) {
                const status = lastRetryError?.response?.status ?? error?.response?.status;
                const statusPart = status ? ` (status ${status})` : '';
                throw new Error(`API request failed${statusPart} for ${companyName} on page ${currentPage}: ${lastRetryError?.message || error?.message || 'Unknown error'}`);
            }
            hasMore = false;
        }

        currentPage++;
    }

    return { products: allApiProducts };
};
