import httpClient from '../shared/httpClient';
import { externalApiDuration, externalItemsFetched } from '../metrics';
import { logger } from '../shared/logger';
import { sendSyncProgressNotification } from '../shared/telegramBot';
import { assertSafeUrlOrThrow } from '../shared/security';
import { FetchProductsFunction } from '../syncLogic';
import { getValueByPath } from '../syncLogic';
import * as https from 'https';
import { URL } from 'url';

const PROUDEST_LEGEND_API_NAME = 'Proudest Legend API';

// Alternative approach: direct HTTP request without proxy
async function fetchProudestLegendProductsDirect(companyApiConfigDoc: any, companyId: string, companyName: string) {
    const apiInternalConfig = companyApiConfigDoc.config;

    // SSRF guard: ensure target URL is safe
    assertSafeUrlOrThrow(apiInternalConfig.url, 'fetchProudestLegendProducts.config.url');

    // For Proudest Legend API, we need to extract the base URL and parameters separately
    const originalUrl = new URL(apiInternalConfig.url);
    const baseUrl = `${originalUrl.origin}${originalUrl.pathname}`;

    // Extract parameters from URL and merge with config params
    const paramsFromUrl = Object.fromEntries(originalUrl.searchParams.entries());
    const allParams = { ...paramsFromUrl, ...(apiInternalConfig.params || {}) };

    // Create query string
    const queryParams = new URLSearchParams(allParams);
    const fullUrl = `${baseUrl}?${queryParams.toString()}`;

    logger.info(`[fetchProudestLegendProducts] Making direct request to: ${fullUrl}`);

    const requestConfig: any = {
        method: 'GET',
        url: fullUrl,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LGDEAL-API-Client/1.0',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: 600000, // 10 минут для больших ответов
        maxContentLength: 1024 * 1024 * 100, // 100MB
        maxBodyLength: 1024 * 1024 * 100, // 100MB
        httpsAgent: new https.Agent({
            keepAlive: true,
            timeout: 600000,
            rejectUnauthorized: false, // Для обхода проблем с сертификатами
        }),
        responseType: 'json'
    };

    logger.info(`[fetchProudestLegendProducts] Direct request config:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        timeout: requestConfig.timeout,
        maxContentLength: requestConfig.maxContentLength
    });

    try {
        const endTimer = externalApiDuration.startTimer({
            supplier: companyName,
            endpoint: baseUrl,
            status: 'pending'
        });

        logger.info(`[fetchProudestLegendProducts] Starting direct HTTP request...`);
        const response = await httpClient(requestConfig);
        logger.info(`[fetchProudestLegendProducts] Direct HTTP request completed successfully`);
        endTimer({
            supplier: companyName,
            endpoint: baseUrl,
            status: String(response.status)
        });

        logger.info(`[fetchProudestLegendProducts] Direct response status: ${response.status}`);
        logger.info(`[fetchProudestLegendProducts] Direct response data type:`, typeof response.data);
        logger.info(`[fetchProudestLegendProducts] Direct response data keys:`, response.data ? Object.keys(response.data) : 'NO_DATA');

        // Extract products from the response - Proudest Legend API uses different field names
        let products;
        let statusInfo = null;

        // Check for authentication status first
        if (response.data && response.data.d) {
            if (typeof response.data.d === 'string') {
                try {
                    const parsed = JSON.parse(response.data.d);
                    if (parsed.STATUS_TABLE && Array.isArray(parsed.STATUS_TABLE)) {
                        statusInfo = parsed.STATUS_TABLE[0];
                        if (statusInfo.STATUS !== '1') {
                            throw new Error(`API Authentication failed: ${statusInfo.MESSAGE}`);
                        }
                    }

                    // Extract products - could be in different fields
                    if (parsed.data && Array.isArray(parsed.data)) {
                        products = parsed.data;
                    } else if (parsed.RESULT) {
                        // RESULT could be an array-like object or actual array
                        if (Array.isArray(parsed.RESULT)) {
                            products = parsed.RESULT;
                        } else if (typeof parsed.RESULT === 'object' && parsed.RESULT !== null) {
                            // Check if it's an array-like object (has numeric keys and length)
                            const keys = Object.keys(parsed.RESULT);
                            if (keys.length > 0 && keys.every(key => !isNaN(Number(key))) && parsed.RESULT.length !== undefined) {
                                products = Object.values(parsed.RESULT);
                            } else {
                                logger.error(`[fetchProudestLegendProducts] RESULT is object but not array-like`);
                                logger.error(`[fetchProudestLegendProducts] RESULT keys:`, keys.slice(0, 10));
                                throw new Error(`RESULT field is not an array`);
                            }
                        } else {
                            logger.error(`[fetchProudestLegendProducts] RESULT is not array or object:`, typeof parsed.RESULT);
                            throw new Error(`RESULT field is not an array`);
                        }
                    } else if (Array.isArray(parsed)) {
                        products = parsed;
                    } else {
                        logger.error(`[fetchProudestLegendProducts] No products array found in response`);
                        logger.error(`[fetchProudestLegendProducts] Parsed response keys:`, Object.keys(parsed));
                        throw new Error(`No products array found in API response`);
                    }
                } catch (parseError) {
                    logger.error(`[fetchProudestLegendProducts] Failed to parse d field as JSON:`, parseError);
                    throw new Error(`Invalid response format from Proudest Legend API`);
                }
            } else if (Array.isArray(response.data.d)) {
                products = response.data.d;
            } else {
                logger.error(`[fetchProudestLegendProducts] d field is not an array or string:`, typeof response.data.d);
                throw new Error(`Invalid response format from Proudest Legend API`);
            }
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
            products = response.data.data;
        } else if (response.data && response.data.RESULT && Array.isArray(response.data.RESULT)) {
            products = response.data.RESULT;
        } else if (Array.isArray(response.data)) {
            products = response.data;
        } else {
            logger.error(`[fetchProudestLegendProducts] Unexpected response structure:`, Object.keys(response.data || {}));
            throw new Error(`Unexpected response structure from Proudest Legend API`);
        }

        if (!Array.isArray(products)) {
            logger.error(`[fetchProudestLegendProducts] Expected array in response, got:`, typeof products);
            logger.error(`[fetchProudestLegendProducts] Response structure:`, Object.keys(response.data || {}));
            throw new Error(`Proudest Legend API returned invalid data structure. Expected array in response.`);
        }

        if (products.length === 0) {
            logger.warn(`[fetchProudestLegendProducts] No products returned from API`);
            return { products: [] };
        }

        logger.info(`[fetchProudestLegendProducts] Successfully retrieved ${products.length} products via direct connection`);
        externalItemsFetched.inc({ supplier: companyName }, products.length);

        return { products };

    } catch (error: any) {
        logger.error(`[fetchProudestLegendProducts] Direct request failed:`, {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            code: error?.code,
            stack: error?.stack?.substring(0, 500)
        });
        throw error;
    }
}

export const fetchProudestLegendProducts: FetchProductsFunction = async (companyApiConfigDoc, companyId, companyName) => {
    if (!companyApiConfigDoc.config || !companyApiConfigDoc.config.url) {
        throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
    }

    logger.info(`[fetchProudestLegendProducts] Starting fetch for ${companyName}`);
    await sendSyncProgressNotification(companyId, companyName, PROUDEST_LEGEND_API_NAME, 'Starting API fetch...');

    // First try direct approach
    try {
        logger.info(`[fetchProudestLegendProducts] Trying direct connection first...`);
        const result = await fetchProudestLegendProductsDirect(companyApiConfigDoc, companyId, companyName);
        await sendSyncProgressNotification(companyId, companyName, PROUDEST_LEGEND_API_NAME, `Successfully retrieved ${result.products.length} products via direct connection`);
        return result;
    } catch (directError: any) {
        logger.warn(`[fetchProudestLegendProducts] Direct connection failed: ${directError.message}`);
        logger.info(`[fetchProudestLegendProducts] Falling back to proxy approach...`);

        // Fallback to proxy approach
    const apiInternalConfig = companyApiConfigDoc.config;
    
    // SSRF guard: ensure target URL is safe
    assertSafeUrlOrThrow(apiInternalConfig.url, 'fetchProudestLegendProducts.config.url');
    
    // For Proudest Legend API, we need to extract the base URL and parameters separately
    const originalUrl = new URL(apiInternalConfig.url);
    const baseUrl = `${originalUrl.origin}${originalUrl.pathname}`;
    
    // Extract parameters from URL and merge with config params
    const paramsFromUrl = Object.fromEntries(originalUrl.searchParams.entries());
    const allParams = { ...paramsFromUrl, ...(apiInternalConfig.params || {}) };

    // Используем локальный прокси для обхода блокировки IP
    // В Docker контейнере используем localhost для обращения к самому себе
    const proxyUrl = process.env.PROXY_URL || 'http://localhost:3001';
    const proxiedUrl = `${proxyUrl}${originalUrl.pathname}`;

    const requestConfig: any = {
        method: 'get',
        url: proxiedUrl,
        params: allParams,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LGDEAL-API-Client/1.0',
            'Accept': 'application/json',
            'Host': originalUrl.hostname, // Важно для прокси
            },
            timeout: 600000, // 10 минут для больших ответов
            maxContentLength: 1024 * 1024 * 100, // 100MB
            maxBodyLength: 1024 * 1024 * 100, // 100MB
    };

    // Sanitize logs to avoid leaking secrets
    logger.info(`[fetchProudestLegendProducts] Request config for ${companyName}:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        paramKeys: Object.keys(requestConfig.params || {}),
        headerKeys: Object.keys(requestConfig.headers || {})
    });

    logger.info(`[fetchProudestLegendProducts] Sending API request to ${baseUrl}`);
        await sendSyncProgressNotification(companyId, companyName, PROUDEST_LEGEND_API_NAME, 'Sending request via proxy...');

    try {
        const endTimer = externalApiDuration.startTimer({ 
            supplier: companyName, 
            endpoint: baseUrl, 
            status: 'pending' 
        });

            logger.info(`[fetchProudestLegendProducts] About to make HTTP request to: ${requestConfig.url}`);
            logger.info(`[fetchProudestLegendProducts] Request config:`, {
                method: requestConfig.method,
                url: requestConfig.url,
                headers: Object.keys(requestConfig.headers || {}),
                params: Object.keys(requestConfig.params || {})
            });
        
        let response;
        try {
                logger.info(`[fetchProudestLegendProducts] Starting HTTP request via proxy...`);
            response = await httpClient(requestConfig);
                logger.info(`[fetchProudestLegendProducts] HTTP request completed successfully`);
            endTimer({ 
                supplier: companyName, 
                endpoint: baseUrl, 
                status: String(response.status) 
            });
        } catch (err: any) {
                logger.error(`[fetchProudestLegendProducts] HTTP request failed:`, {
                    message: err.message,
                    status: err?.response?.status,
                    statusText: err?.response?.statusText,
                    code: err?.code,
                    stack: err?.stack?.substring(0, 500)
                });
            endTimer({ 
                supplier: companyName, 
                endpoint: baseUrl, 
                status: String(err?.response?.status || 'error') 
            });
            throw err;
        }

        logger.info(`[fetchProudestLegendProducts] API request completed with status: ${response.status}`);
            logger.info(`[fetchProudestLegendProducts] Response headers:`, Object.keys(response.headers || {}));
            logger.info(`[fetchProudestLegendProducts] Response data type:`, typeof response.data);
            logger.info(`[fetchProudestLegendProducts] Response data keys:`, response.data ? Object.keys(response.data) : 'NO_DATA');

        // Extract products from the response - Proudest Legend API uses different field names
        let products;

        // Check for authentication status first
        if (response.data && response.data.d) {
            if (typeof response.data.d === 'string') {
                try {
                    const parsed = JSON.parse(response.data.d);
                    if (parsed.STATUS_TABLE && Array.isArray(parsed.STATUS_TABLE)) {
                        const statusInfo = parsed.STATUS_TABLE[0];
                        if (statusInfo.STATUS !== '1') {
                            throw new Error(`API Authentication failed: ${statusInfo.MESSAGE}`);
                        }
                    }

                    // Extract products - could be in different fields
                    if (parsed.data && Array.isArray(parsed.data)) {
                        products = parsed.data;
                    } else if (parsed.RESULT) {
                        // RESULT could be an array-like object or actual array
                        if (Array.isArray(parsed.RESULT)) {
                            products = parsed.RESULT;
                        } else if (typeof parsed.RESULT === 'object' && parsed.RESULT !== null) {
                            // Check if it's an array-like object (has numeric keys and length)
                            const keys = Object.keys(parsed.RESULT);
                            if (keys.length > 0 && keys.every(key => !isNaN(Number(key))) && parsed.RESULT.length !== undefined) {
                                products = Object.values(parsed.RESULT);
                            } else {
                                logger.error(`[fetchProudestLegendProducts] RESULT is object but not array-like`);
                                logger.error(`[fetchProudestLegendProducts] RESULT keys:`, keys.slice(0, 10));
                                throw new Error(`RESULT field is not an array`);
                            }
                        } else {
                            logger.error(`[fetchProudestLegendProducts] RESULT is not array or object:`, typeof parsed.RESULT);
                            throw new Error(`RESULT field is not an array`);
                        }
                    } else if (Array.isArray(parsed)) {
                        products = parsed;
                    } else {
                        logger.error(`[fetchProudestLegendProducts] No products array found in response`);
                        logger.error(`[fetchProudestLegendProducts] Parsed response keys:`, Object.keys(parsed));
                        throw new Error(`No products array found in API response`);
                    }
                } catch (parseError) {
                    logger.error(`[fetchProudestLegendProducts] Failed to parse d field as JSON:`, parseError);
                    throw new Error(`Invalid response format from Proudest Legend API`);
                }
            } else if (Array.isArray(response.data.d)) {
                products = response.data.d;
            } else {
                logger.error(`[fetchProudestLegendProducts] d field is not an array or string:`, typeof response.data.d);
                throw new Error(`Invalid response format from Proudest Legend API`);
            }
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
            products = response.data.data;
        } else if (response.data && response.data.RESULT && Array.isArray(response.data.RESULT)) {
            products = response.data.RESULT;
        } else if (Array.isArray(response.data)) {
            products = response.data;
        } else {
            logger.error(`[fetchProudestLegendProducts] Unexpected response structure:`, Object.keys(response.data || {}));
            throw new Error(`Unexpected response structure from Proudest Legend API`);
        }

        if (!Array.isArray(products)) {
            logger.error(`[fetchProudestLegendProducts] Expected array in response, got:`, typeof products);
            logger.error(`[fetchProudestLegendProducts] Response structure:`, Object.keys(response.data || {}));
            throw new Error(`Proudest Legend API returned invalid data structure. Expected array in response.`);
        }

        if (products.length === 0) {
            logger.warn(`[fetchProudestLegendProducts] No products returned from API`);
            return { products: [] };
        }

            logger.info(`[fetchProudestLegendProducts] Successfully retrieved ${products.length} products via proxy`);
        externalItemsFetched.inc({ supplier: companyName }, products.length);

        return { products };

    } catch (error: any) {
        logger.error(`[fetchProudestLegendProducts] API request failed:`, {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data ? 
                (typeof error.response.data === 'string' ? 
                    error.response.data.substring(0, 500) : 
                    JSON.stringify(error.response.data).substring(0, 500)) : 
                'No response data'
        });

            throw new Error(`Proudest Legend API request failed: ${error.message}`);
        }
    }
};