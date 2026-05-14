import httpClient from '../shared/httpClient';
import { externalApiDuration, externalItemsFetched } from '../metrics';
import { logger } from '../shared/logger';
import { sendSyncProgressNotification } from '../shared/telegramBot';
import { assertSafeUrlOrThrow } from '../shared/security';
import { FetchProductsFunction } from '../syncLogic';

const EXCELLENT_API_NAME = 'Excellent corporation API';

function normalizeExcellentPayload(rawData: unknown): unknown[] | null {
    if (Array.isArray(rawData)) {
        return rawData;
    }

    // Some upstream responses occasionally come as JSON text despite having array payload.
    if (typeof rawData === 'string') {
        const trimmed = rawData.trim();

        const tryExtractFromParsed = (parsed: unknown): unknown[] | null => {
            if (Array.isArray(parsed)) return parsed;
            if (typeof parsed === 'string') {
                const inner = parsed.trim();
                if (inner.startsWith('[') || inner.startsWith('{')) {
                    try {
                        const reparsed = JSON.parse(inner);
                        if (Array.isArray(reparsed)) return reparsed;
                        if (reparsed && typeof reparsed === 'object') {
                            const record = reparsed as Record<string, unknown>;
                            if (Array.isArray(record.data)) return record.data;
                            if (Array.isArray(record.items)) return record.items;
                        }
                    } catch {
                        return null;
                    }
                }
                return null;
            }
            if (parsed && typeof parsed === 'object') {
                const record = parsed as Record<string, unknown>;
                if (Array.isArray(record.data)) return record.data;
                if (Array.isArray(record.items)) return record.items;
                if (record.result && typeof record.result === 'object') {
                    const result = record.result as Record<string, unknown>;
                    if (Array.isArray(result.data)) return result.data;
                    if (Array.isArray(result.items)) return result.items;
                }
            }
            return null;
        };

        if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
            try {
                const parsed = JSON.parse(trimmed);
                const extracted = tryExtractFromParsed(parsed);
                if (extracted) return extracted;
            } catch {
                // Try sanitizing known junk chars from upstream payload, then parse again.
                try {
                    const sanitized = trimmed
                        .replace(/^\uFEFF/, '') // UTF-8 BOM
                        .replace(/\u0000/g, '') // NULL bytes
                        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // invalid JSON controls
                    const reparsed = JSON.parse(sanitized);
                    const extracted = tryExtractFromParsed(reparsed);
                    if (extracted) return extracted;
                } catch {
                    return null;
                }
            }
        }
        return null;
    }

    // Defensive fallback for occasional object wrappers.
    if (rawData && typeof rawData === 'object') {
        const record = rawData as Record<string, unknown>;
        if (Array.isArray(record.data)) return record.data;
        if (Array.isArray(record.items)) return record.items;
        if (record.result && typeof record.result === 'object') {
            const result = record.result as Record<string, unknown>;
            if (Array.isArray(result.data)) return result.data;
            if (Array.isArray(result.items)) return result.items;
        }
    }

    return null;
}

/**
 * Dedicated handler for Excellent corporation (excellent.kodllin.com getStockN).
 * API returns a single root-level JSON array (300k+ items). We avoid push(...products)
 * which would cause "Maximum call stack size exceeded" and return the array by reference.
 */
export const fetchExcellentCorporationProducts: FetchProductsFunction = async (
    companyApiConfigDoc,
    companyId,
    companyName
) => {
    const config = companyApiConfigDoc.config;
    if (!config || !config.url) {
        throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
    }

    assertSafeUrlOrThrow(config.url, 'fetchExcellentCorporationProducts.config.url');

    const url = new URL(config.url);
    const paramsFromUrl: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
        paramsFromUrl[key] = value;
    });

    const requestConfig = {
        method: 'post' as const,
        url: `${url.origin}${url.pathname}`,
        headers: (config.headers && typeof config.headers === 'object')
            ? { ...config.headers }
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
        params: { ...paramsFromUrl, ...(config.params && typeof config.params === 'object' ? config.params : {}) },
        data: (config.baseBodyPayload && typeof config.baseBodyPayload === 'object' && Object.keys(config.baseBodyPayload).length > 0)
            ? config.baseBodyPayload
            : {},
        timeout: 600000, // 10 min for large response
    };

    logger.info(`[fetchExcellentCorporationProducts] Request config for ${companyName}:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        paramKeys: Object.keys(requestConfig.params),
        headerKeys: Object.keys(requestConfig.headers),
    });

    await sendSyncProgressNotification(companyId, companyName, EXCELLENT_API_NAME, 'Sending request to API...');

    const startTimer = externalApiDuration.startTimer({
        supplier: companyName,
        endpoint: requestConfig.url,
        status: 'pending',
    });

    const response = await httpClient(requestConfig);

    startTimer({ supplier: companyName, endpoint: requestConfig.url, status: String(response.status) });

    const normalizedData = normalizeExcellentPayload(response.data);
    if (!normalizedData) {
        const preview = typeof response.data === 'object'
            ? JSON.stringify(response.data).slice(0, 300)
            : String(response.data).slice(0, 300);
        logger.error(`[fetchExcellentCorporationProducts] ${companyName}: response is not an array after normalization. Preview: ${preview}`);
        throw new Error('Excellent corporation API returned non-array response');
    }

    logger.info(`[fetchExcellentCorporationProducts] ${companyName}: received ${normalizedData.length} products (normalized array)`);
    externalItemsFetched.inc({ supplier: companyName }, normalizedData.length);

    // Return the array by reference — do not copy or push(...) to avoid "Maximum call stack size exceeded"
    return { products: normalizedData };
};
