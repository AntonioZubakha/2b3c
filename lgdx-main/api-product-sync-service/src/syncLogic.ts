import mongoose from 'mongoose';
import httpClient from './shared/httpClient';
import { AxiosRequestConfig, Method } from 'axios';
import { assertSafeUrlOrThrow } from './shared/security';
import { logger } from './shared/logger';

// Mongoose Models (local copies)
import CompanyApiConfig, { ICompanyApiConfig } from './models/CompanyApiConfig';
import Product from './models/Product';

// Shared utilities (local copies)
import { 
    sendSyncStartNotification, 
    sendSyncSuccessNotification, 
    sendSyncErrorNotification, 
    sendSyncProgressNotification,
} from './shared/telegramBot';
import { ProductProcessingStats } from './shared/productUtils';
import { generateSyncReports } from './shared/syncReportUtils';
import { ReportProductData } from './shared/reportUtils';
import * as productUtils from './shared/productUtils';
import { selectFetchProductsStrategy } from './sync-strategies';
import { handleProductSync } from './shared/syncUtils';
import { refreshGlobalParserAliases } from './shared/parserAliasesConfig';


// ---- Interfaces (from companyApiController.ts) ----

// Interface for the structure of config.filter (Map in Mongoose, object in JSON)
interface ApiFilterMap {
    [key: string]: unknown;
}

// Interface for ICompanyApiConfig.config field (structure from Mongoose model)
export interface IApiConfigInternal {
    url: string;
    requestType: 'get' | 'post';
    headers: Record<string, string>; 
    params: Record<string, string | number>;  
    baseBodyPayload: Record<string, unknown>; 
    dataKey: string;
    totalCountPath?: string;
    filter: ApiFilterMap; 
}

// Interface for ICompanyApiConfig.tokenAuthConfig field
export interface ITokenAuthConfigInternal {
    enabled: boolean;
    url?: string;
    requestType?: 'get' | 'post';
    params?: Record<string, string>;  
    headers?: Record<string, string>; 
    bodyPayload?: Record<string, unknown>; 
    bodyEncodeType?: 'json' | 'form' | 'string';
    tokensPathInResponse?: string | Record<string, string>; 
    tokenUsage?: ITokenUsageRuleInternal[];
}

// Interface for ICompanyApiConfig.tokenAuthConfig.tokenUsage items
export interface ITokenUsageRuleInternal {
    nameInResponse?: string;
    placeholderName?: string;
    placement: 'header' | 'param' | 'url_segment' | 'body';
    destinationName?: string;
    bodyKeyPath?: string;
    formatPrefix?: string;
    formatSuffix?: string;
}

// Interface for ICompanyApiConfig.syncSchedule
export interface ISyncScheduleInternal {
    frequency: 'daily' | 'hourly' | 'manual';
    timeOfDay: string;
}

// Representing the CompanyApiConfig document structure as it would be used in code
export interface CompanyApiConfigDataObject {
    _id: mongoose.Types.ObjectId | string;
    company: mongoose.Types.ObjectId | string; 
    isActive: boolean;
    config: IApiConfigInternal;
    lastSync: Date | null;
    syncStatus: 'idle' | 'in_progress' | 'success' | 'error';
    lastSyncError: string | null;
    syncSchedule: ISyncScheduleInternal;
    tokenAuthConfig?: ITokenAuthConfigInternal; 
    createdAt?: Date;
    updatedAt?: Date;
}

// Use ProductProcessingStats from telegramBot as the primary stats type
// It already includes most fields. Add any specific to companyApiController if necessary.
// This interface is now effectively ProductProcessingStats from telegramBot
// We keep it for conceptual clarity if any specific fields were added in original companyApiController,
// but ensure it aligns with ProductProcessingStats.
export interface ControllerSyncStats extends ProductProcessingStats {
    // Ensure all fields that are incremented are initialized as numbers
    // Most fields are already in ProductProcessingStats, ensure any overrides or additions are here.
    // Example: totalUploaded might be used differently or specifically required as non-optional here.
    totalUploaded: number; 
    duration?: string; 
    reportNotes?: string[] | string | null; 
    // Make sure all fields used in syncCompanyProducts are present
    totalFromApi: number;
    // processed: number; // in ProductProcessingStats
    // created: number; // in ProductProcessingStats
    // updated: number; // in ProductProcessingStats
    // skippedByBlacklist: number; // in ProductProcessingStats
    skippedExistingOnDealOrSold: number; // in ProductProcessingStats
    // skippedInvalidStatus: number; // in ProductProcessingStats
    // skippedInvalidColor: number; // in ProductProcessingStats
    // apiErrors: number; // in ProductProcessingStats
    // replacedOtherCompanyProduct: number; // in ProductProcessingStats
    // skippedCheaperExistsOtherCompany: number; // in ProductProcessingStats
    // skippedInvalidClarity: number; // in ProductProcessingStats
    // skippedInvalidPrice: number; // in ProductProcessingStats
    // skippedInvalidCarat: number; // in ProductProcessingStats
    // skippedMissingMedia: number; // in ProductProcessingStats
    // skippedByApiFilter: number; // in ProductProcessingStats
    // skippedMissingCertNumber: number; // in ProductProcessingStats
    // skippedNotLabGrown: number; // in ProductProcessingStats
}


// ---- Helper Functions (from companyApiController.ts) ----

// Helper function to get value from object by path string (e.g., 'data.token')
export function getValueByPath(obj: unknown, path: string | undefined | null): unknown {
  if (!path || typeof path !== 'string') {
    if (path === '' && obj !== undefined) return obj;
    return undefined;
  }
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

// New helper function to fetch authentication tokens
export async function getAuthTokens(tokenAuthConfig?: ITokenAuthConfigInternal): Promise<Record<string, unknown>> {
  if (!tokenAuthConfig || !tokenAuthConfig.enabled || !tokenAuthConfig.url) {
    return {};
  }

  const {
    url,
    requestType = 'post',
    params = {},
    headers = {},
    bodyPayload = {},
    bodyEncodeType = 'json',
    tokensPathInResponse = 'token',
  } = tokenAuthConfig;

  // SSRF guard for token endpoint as well
  if (url) {
    assertSafeUrlOrThrow(url, 'getAuthTokens.url');
  }

  const tokenRequestConfig: AxiosRequestConfig = {
    method: requestType as Method,
    url: url,
    headers: { ...headers },
    params: { ...params },
  };

  if (requestType.toLowerCase() === 'post') {
    if (bodyEncodeType === 'json') {
      tokenRequestConfig.data = bodyPayload;
      if (!tokenRequestConfig.headers || !tokenRequestConfig.headers['Content-Type']) {
        tokenRequestConfig.headers = tokenRequestConfig.headers || {};
        tokenRequestConfig.headers['Content-Type'] = 'application/json';
      }
    } else if (bodyEncodeType === 'form') {
      const formPayload: Record<string, string> = {};
      for (const key in bodyPayload) {
        if (Object.prototype.hasOwnProperty.call(bodyPayload, key)) {
          formPayload[key] = String(bodyPayload[key]);
        }
      }
      tokenRequestConfig.data = new URLSearchParams(formPayload).toString();
      if (!tokenRequestConfig.headers || !tokenRequestConfig.headers['Content-Type']) {
        tokenRequestConfig.headers = tokenRequestConfig.headers || {};
        tokenRequestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (bodyEncodeType === 'string') {
      tokenRequestConfig.data = typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload);
    }
  }

  try {
    const response = await httpClient(tokenRequestConfig);
    const extractedTokens: Record<string, unknown> = {};
    if (typeof tokensPathInResponse === 'string') {
      const tokenValue = getValueByPath(response.data, tokensPathInResponse);
      if (tokenValue !== undefined) {
        extractedTokens.defaultToken = tokenValue;
      }
    } else if (typeof tokensPathInResponse === 'object' && tokensPathInResponse !== null) {
      for (const key in tokensPathInResponse) {
        const path = tokensPathInResponse[key];
        const tokenValue = getValueByPath(response.data, path);
        if (tokenValue !== undefined) {
          extractedTokens[key] = tokenValue;
        }
      }
    } else {
      if (!tokensPathInResponse && response.data) {
        if (typeof response.data === 'string' || typeof response.data === 'number') {
            extractedTokens.defaultToken = response.data;
        }
      }
    }
    return extractedTokens;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorMeta: Record<string, unknown> = { error: errorMessage };
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status: number; data: unknown } };
      errorMeta.status = axiosError.response?.status;
      errorMeta.data = axiosError.response?.data;
    }
    logger.error('[getAuthTokens] Error fetching auth tokens', errorMeta);
    throw new Error(`Failed to fetch authentication tokens: ${errorMessage}`);
  }
}

// Helper function to determine how many products to log based on stock size
export function getLogSampleSize(totalProducts: number): number {
    if (totalProducts <= 50) return Math.min(totalProducts, 5);
    if (totalProducts <= 500) return 7;
    if (totalProducts <= 5000) return 8;
    if (totalProducts <= 50000) return 9;
    return 10;
}

// Helper function to truncate and format product for logging
export function formatProductForLog(product: unknown): string {
    try {
        const stringified = JSON.stringify(product);
        return stringified.substring(0, 600) + (stringified.length > 600 ? '...' : '');
    } catch (e) {
        return '[Error stringifying product]';
    }
}

// Type for the function that fetches products from a specific API
export type FetchProductsFunction = (
    companyApiConfigDoc: ICompanyApiConfig, 
    companyId: string, 
    companyName: string
) => Promise<{ products: unknown[], statsUpdates?: Partial<ProductProcessingStats> }>;

// Main sync functions will be added below

/**
 * Runs a standardized synchronization process for a specific API. (REFACTORED FOR MEMORY)
 * It handles common tasks like fetching configuration, error handling, 
 * success notifications, and updating sync status.
 */
export async function runSpecificApiSync(
    configId: string,
    options?: {
        preDeleteStale?: boolean;
    }
) {
    await refreshGlobalParserAliases();
    const companyApiConfigDoc = await CompanyApiConfig.findById(configId).populate('company');
    if (!companyApiConfigDoc) {
        logger.error(`[runSpecificApiSync] CompanyApiConfig with ID ${configId} not found.`);
        return;
    }

    const companyDoc = companyApiConfigDoc.company;
    const companyIdObj = typeof companyDoc === 'object' && companyDoc && '_id' in companyDoc 
      ? companyDoc._id 
      : companyDoc;

    logger.info(`[runSpecificApiSync] Found CompanyApiConfig:`, {
        configId: String(companyApiConfigDoc._id),
        companyId: String(companyIdObj),
        hasConfig: !!companyApiConfigDoc.config,
    });

    if (!companyApiConfigDoc.config) {
        logger.error(`[runSpecificApiSync] CompanyApiConfig with ID ${configId} has no config field.`);
        return;
    }

    const company = typeof companyDoc === 'object' && companyDoc ? companyDoc : null;
    const companyId = companyIdObj?.toString() || '';
    const companyName = (company && 'name' in company && typeof company.name === 'string') 
      ? company.name 
      : 'Unknown Company';
    const apiName = (companyApiConfigDoc as { syncStrategy?: string }).syncStrategy || companyName;

    const stats: ProductProcessingStats = productUtils.getInitialisedStats();
    const allProcessedProductsDetailed: ReportProductData[] = [];
    const startTime = Date.now();

    try {
        companyApiConfigDoc.syncStatus = 'in_progress';
        await companyApiConfigDoc.save();

        await sendSyncStartNotification(companyId, `${companyName} - ${apiName}`);

        const syncStrategy = selectFetchProductsStrategy(companyApiConfigDoc);
        
        let apiProducts: productUtils.RawProductData[];
        try {
            const fetchResult = await syncStrategy(companyApiConfigDoc, companyId, companyName);
            apiProducts = fetchResult.products as productUtils.RawProductData[];
            if (fetchResult.statsUpdates) {
                Object.assign(stats, fetchResult.statsUpdates);
            }
        } catch (fetchError: unknown) {
            const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
            logger.error(`[runSpecificApiSync][${apiName}] Error during fetchProductsStrategy: ${errorMessage}`);
            stats.apiErrors = (stats.apiErrors || 0) + 1;
            throw fetchError;
        }

        await sendSyncProgressNotification(companyId, companyName, apiName, `Received ${apiProducts.length} products from API`);

        // --- Sold certificates prefilter (load once per run) ---
        let productsToProcess = apiProducts;
        try {
            const soldCertsSet = await getCachedSoldCertificates();
            if (soldCertsSet && soldCertsSet.size > 0) {
                let soldCertRemoved = 0;
                let missingCertRemoved = 0;
                productsToProcess = productsToProcess.filter(p => {
                    const cert = (productUtils.getFieldValue(p, 'certificateNumber') || '').toString().trim().toUpperCase();
                    if (!cert) {
                        missingCertRemoved++;
                        return false;
                    }
                    if (soldCertsSet.has(cert)) {
                        soldCertRemoved++;
                        return false;
                    }
                    return true;
                });
                if (soldCertRemoved > 0) {
                    stats.skippedByBlacklist = (stats.skippedByBlacklist || 0) + soldCertRemoved;
                    logger.info(`[runSpecificApiSync][${apiName}] Sold-cert filter removed ${soldCertRemoved} products`);
                }
                if (missingCertRemoved > 0) {
                    stats.skippedMissingCertNumber =
                        (stats.skippedMissingCertNumber || 0) + missingCertRemoved;
                    logger.info(
                        `[runSpecificApiSync][${apiName}] Sold-cert prefilter dropped ${missingCertRemoved} products (certificate number not resolved — check API field mapping)`,
                    );
                }
            }
        } catch (blError: unknown) {
            const errorMessage = blError instanceof Error ? blError.message : String(blError);
            logger.warn(`[runSpecificApiSync][${apiName}] Sold-cert prefilter skipped due to error: ${errorMessage}`);
        }
        // --- end sold certs prefilter ---
        stats.totalFromApi = productsToProcess.length;

        await handleProductSync(productsToProcess, companyId, stats, allProcessedProductsDetailed as never, {
            preDeleteStale: options?.preDeleteStale || false,
            allowMissingMedia: (companyApiConfigDoc as { allowMissingMedia?: boolean }).allowMissingMedia,
            useUpsertStrategy: apiName === 'Brahmani API',
            // Sold certs were already filtered above via getCachedSoldCertificates().
            // Skipping the duplicate DB query + 340 K-item in-memory filter saves
            // ~40 s per run for large suppliers (e.g. Excellent Corporation).
            skipSoldCertsCheck: true,
        });

        logger.info(`[runSpecificApiSync][${apiName}] Product synchronization logic finished.`);

        stats.processed = stats.created + stats.updated + stats.replacedOtherCompanyProduct;
        stats.duration = ((Date.now() - startTime) / 1000).toFixed(2);

        companyApiConfigDoc.lastSync = new Date();
        companyApiConfigDoc.syncStatus = 'success';
        companyApiConfigDoc.lastSyncError = null;

        // Генерируем отчеты ДО очистки памяти
        logger.info(`[runSpecificApiSync][${apiName}] Generating sync reports for ${allProcessedProductsDetailed.length} detailed products...`);
        const reports = await generateSyncReports({ id: companyId, name: companyName }, stats, allProcessedProductsDetailed);

        logger.info(`[runSpecificApiSync][${apiName}] Sending success notification (reports: xlsx=${!!reports.xlsx}, csv=${!!reports.csv})`);
        await sendSyncSuccessNotification(companyId, companyName, 'API', stats, reports);

        // --- CRITICAL MEMORY MANAGEMENT ---
        productsToProcess = [];
        apiProducts = [];
        allProcessedProductsDetailed.length = 0; // Очищаем детальный отчет ПОСЛЕ генерации отчетов

        if (global.gc) {
            logger.debug('[runSpecificApiSync] Triggering manual garbage collection...');
            global.gc();
            logger.debug('[runSpecificApiSync] Manual garbage collection finished.');

            // Дополнительная сборка мусора через небольшой интервал
            setTimeout(() => {
                if (global.gc) {
                    global.gc();
                    logger.debug('[runSpecificApiSync] Additional garbage collection after delay');
                }
            }, 2000);
        }
        // ---------------------------------

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[runSpecificApiSync][${apiName}] Sync failed for company ${companyName}: ${errorMessage}`);
        
        stats.duration = ((Date.now() - startTime) / 1000).toFixed(2);
        companyApiConfigDoc.syncStatus = 'error';
        companyApiConfigDoc.lastSyncError = errorMessage;
        
        const errorForTelegram = error instanceof Error ? error : new Error(String(error));
        await sendSyncErrorNotification(companyId, companyName, apiName, errorForTelegram.message);
        
    } finally {
        await companyApiConfigDoc.save();
        logger.info(`[runSpecificApiSync][${apiName}] Sync process finished for ${companyName}. Status: ${companyApiConfigDoc.syncStatus}`);
    }
} 

// Cached sold certificate numbers (module-scope)
let cachedSoldCerts: Set<string> | null = null;
let cachedSoldCertsAt: number | null = null;
const SOLD_CERTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL per worker lifecycle

async function getCachedSoldCertificates(): Promise<Set<string>> {
    const now = Date.now();
    if (cachedSoldCerts && cachedSoldCertsAt && now - cachedSoldCertsAt < SOLD_CERTS_CACHE_TTL_MS) {
        return cachedSoldCerts;
    }
    const entries = await Product.find({ status: 'Sold' }, { certificateNumber: 1 }).lean();
    const set = new Set<string>();
    for (const e of entries) {
        const cert = (e as { certificateNumber?: string }).certificateNumber;
        if (typeof cert === 'string' && cert.trim()) {
            set.add(cert.trim().toUpperCase());
        }
    }
    cachedSoldCerts = set;
    cachedSoldCertsAt = now;
    logger.info(`[SoldCerts] Loaded ${set.size} sold certificate numbers into cache`);
    return set;
}