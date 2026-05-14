import { Request, Response, NextFunction } from 'express';
import { ValidatedRequest } from '../middleware/validation';
import mongoose, { Types, Document, FilterQuery } from 'mongoose';
import axios from 'axios';
import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { AuthenticatedRequest } from '../types/api';
import { JwtPayload } from '../types/auth';

// Replacing old imports with imports from @shared
import {
    sendSyncStartNotification,
    sendSyncSuccessNotification,
    sendSyncErrorNotification,
    sendSyncProgressNotification,
    SyncReports,
} from '../utils/telegramBot';
import { generateProductReportXlsx } from '../utils/reportUtils';
import {
  processProduct,
  getFieldValue,
  COLUMN_MAPPINGS,
  ProductProcessingStats,
  ProcessedProductData
} from '../utils/productUtils';

import { publishApiSyncTask } from '../services/messageBroker'; // Use relative path
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';

// ---- Model Imports (using require for now) ----
// const CompanyApiConfig: any = require('../models/CompanyApiConfig');
// const Company: any = require('../models/Company');
// const Product: any = require('../models/Product');
import CompanyApiConfig from '../models/CompanyApiConfig';
import Company from '../models/Company';
import Product from '../models/Product';
// ---- End Model Imports ----

// ---- Re-used Interfaces (consider moving to a shared types file) ----
// From commandController.ts or authController.ts - ensure consistency or centralize

// ---- Specific Interfaces for companyApiController ----

// Interface for the structure of config.filter (Map in Mongoose, object in JSON)
interface ApiFilterMap {
    [key: string]: unknown;
}

// Interface for ICompanyApiConfig.config field (structure from Mongoose model)
interface IApiConfigInternal {
    url: string;
    requestType: 'get' | 'post';
    headers: Record<string, unknown>; // Mongoose Mixed
    params: Record<string, unknown>;  // Mongoose Mixed
    baseBodyPayload: Record<string, unknown>; // Mongoose Mixed
    dataKey: string;
    totalCountPath?: string;
    filter: ApiFilterMap; // Was Map, but will be object in JS/TS logic mostly
}

// Interface for ICompanyApiConfig.tokenAuthConfig field
interface ITokenAuthConfigInternal {
    enabled: boolean;
    url?: string;
    requestType?: 'get' | 'post';
    params?: Record<string, unknown>;  // Mongoose Mixed
    headers?: Record<string, unknown>; // Mongoose Mixed
    bodyPayload?: Record<string, unknown>; // Mongoose Mixed
    bodyEncodeType?: 'json' | 'form' | 'string';
    tokensPathInResponse?: string | Record<string, string>; // Mongoose Mixed
    tokenUsage?: ITokenUsageRuleInternal[];
}

// Interface for ICompanyApiConfig.tokenAuthConfig.tokenUsage items
interface ITokenUsageRuleInternal {
    nameInResponse?: string;
    placeholderName?: string;
    placement: 'header' | 'param' | 'url_segment' | 'body';
    destinationName?: string;
    bodyKeyPath?: string;
    formatPrefix?: string;
    formatSuffix?: string;
}

// Interface for ICompanyApiConfig.syncSchedule
interface ISyncScheduleInternal {
    frequency: 'daily' | 'hourly' | 'manual';
    timeOfDay: string;
}

// Representing the CompanyApiConfig document structure as it would be used in code
// (after .toObject() or when constructing new one, Mongoose specific types like Map are handled)
interface CompanyApiConfigDataObject {
    _id: mongoose.Types.ObjectId | string;
    company: mongoose.Types.ObjectId | string | any; // Or ICompanyDocument if populated
    isActive: boolean;
    config: IApiConfigInternal;
    lastSync: Date | null;
    syncStatus: 'idle' | 'in_progress' | 'success' | 'error';
    lastSyncError: string | null;
    syncSchedule: ISyncScheduleInternal;
    tokenAuthConfig?: ITokenAuthConfigInternal; // Optional as per schema
    createdAt?: Date;
    updatedAt?: Date;
    allowMissingMedia?: boolean;
}

interface CompanyIdParams {
    companyId: string;
}

interface GetApiConfigResponse extends CompanyApiConfigDataObject {} // Or a more specific DTO

interface UpdateApiConfigRequestBody {
    // Can be flat or nested under 'config' property
    url?: string;
    requestType?: 'get' | 'post';
    headers?: Record<string, any>;
    params?: Record<string, any>;
    dataKey?: string;
    totalCountPath?: string;
    filter?: ApiFilterMap;
    baseBodyPayload?: Record<string, any>;
    syncSchedule?: ISyncScheduleInternal;
    tokenAuthConfig?: ITokenAuthConfigInternal;
    allowMissingMedia?: boolean;
    // For nested structure
    config?: Partial<IApiConfigInternal>;
}

interface UpdateApiConfigResponse extends CompanyApiConfigDataObject {} // Or a specific DTO

interface TriggerSyncResponse {
    message: string;
    queueStatus?: { // Based on JS response
        running: number;
        queued: number;
    };
}

interface SyncQueueStatusResponse {
    running: number;
    queued: number;
    pendingCompanyIds?: string[]; // Assuming syncQueue.getStatus() returns this
}

interface ResetSyncStatusResponse {
    message: string;
}

interface DeleteApiConfigResponse {
    message: string;
}

interface ErrorResponse {
    message: string;
    error?: unknown; // For detailed error reporting
}

// Use ProductProcessingStats from productUtils as the primary stats type
// It already includes most fields. Add any specific to companyApiController if necessary.
interface ControllerSyncStats extends ProductProcessingStats {
    totalUploaded: number; // Ensure this is non-optional for this controller's usage
    duration?: string; 
    reportNotes?: string[] | string | null; 
    // Ensure all fields that are incremented are initialized as numbers
    totalFromApi: number;
    processed: number;
    created: number;
    updated: number;
    skippedByBlacklist: number;
    skippedExistingOnDealOrSold: number;
    skippedInvalidStatus: number;
    skippedInvalidColor: number;
    apiErrors: number;
    replacedOtherCompanyProduct: number;
    skippedCheaperExistsOtherCompany: number;
    skippedInvalidClarity: number;
    skippedInvalidPrice: number;
    skippedInvalidCarat: number;
    skippedMissingMedia: number;
    skippedByApiFilter: number;
    skippedMissingCertNumber: number; // Added based on usage in processProduct
    skippedNotLabGrown: number; // Added to satisfy ControllerSyncStats
    skippedAnomalousPricePerCarat: number; // Added to satisfy ProductProcessingStats
    deletedStale: number; // Changed to required number
    skippedByDuplicateInSource: number;
}

// Helper function to get value from object by path string (e.g., 'data.token')
function getValueByPath(obj: unknown, path: string | undefined | null): unknown {
  if (!path || typeof path !== 'string') {
    // If path is empty string and obj is defined, return obj (original behavior for specific cases)
    // Otherwise, if path is null, undefined, or not a string (and not empty string), return undefined.
    if (path === '' && obj !== undefined) return obj;
    return undefined;
  }
  return path.split('.').reduce((acc: Record<string, unknown> | undefined, part) => 
    (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined) as Record<string, unknown> | undefined, 
    obj as Record<string, unknown>
  );
}

// New helper function to fetch authentication tokens
async function getAuthTokens(tokenAuthConfig?: ITokenAuthConfigInternal): Promise<Record<string, unknown>> {
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

  const tokenRequestConfig: {
    method: 'get' | 'post';
    url: string;
    headers: Record<string, string>;
    params: Record<string, string>;
    data?: Record<string, unknown> | string;
  } = {
    method: requestType as ('get' | 'post'),
    url: url,
    headers: headers as Record<string, string>,
    params: params as Record<string, string>,
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
    const response = await axios(tokenRequestConfig);
    const extractedTokens: Record<string, any> = {};
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
        logger.error('[getAuthTokens] Error fetching auth tokens:', { error: getErrorMessage(error) });
    if (error && typeof error === 'object' && 'response' in error) {
        logger.error('[getAuthTokens] Token API error response', {
        status: (error as { response?: { status?: number; data?: unknown } }).response?.status,
        data: (error as { response?: { status?: number; data?: unknown } }).response?.data,
      });
    }
    throw new Error(`Failed to fetch authentication tokens: ${getErrorMessage(error)}`);
  }
}

export const getApiConfig = async (
    req: ValidatedRequest<{}, { companyId: string }, {}> & { user?: JwtPayload },
    res: Response<GetApiConfigResponse | ErrorResponse>
) => {
    const { companyId } = req.params;

    try {
        logger.debug('[getApiConfig] Getting API config for company', { companyId });
        const configDocument = await CompanyApiConfig.findOne({ company: companyId })
            .populate('company', 'name');
        
        if (!configDocument) {
            logger.info('[getApiConfig] API configuration not found for company', { companyId });
            return res.status(404).json({ message: 'API configuration not found' });
        }
        
        // Convert Mongoose Maps to plain objects for JSON response
        const responseConfig = configDocument.toObject({
            transform: (doc, ret) => {
                if (ret.config?.filter instanceof Map) {
                    ret.config.filter = Object.fromEntries(ret.config.filter);
                }
                if (ret.config?.baseBodyPayload instanceof Map) {
                    ret.config.baseBodyPayload = Object.fromEntries(ret.config.baseBodyPayload);
                }
                if (ret.config?.headers instanceof Map) {
                    ret.config.headers = Object.fromEntries(ret.config.headers);
                }
                if (ret.config?.params instanceof Map) {
                    ret.config.params = Object.fromEntries(ret.config.params);
                }
                if (ret.tokenAuthConfig?.params instanceof Map) {
                    ret.tokenAuthConfig.params = Object.fromEntries(ret.tokenAuthConfig.params);
                }
                if (ret.tokenAuthConfig?.headers instanceof Map) {
                    ret.tokenAuthConfig.headers = Object.fromEntries(ret.tokenAuthConfig.headers);
                }
                if (ret.tokenAuthConfig?.bodyPayload instanceof Map) {
                    ret.tokenAuthConfig.bodyPayload = Object.fromEntries(ret.tokenAuthConfig.bodyPayload);
                }
                return ret;
            }
        }) as GetApiConfigResponse;

        res.status(200).json(responseConfig);
    } catch (error: unknown) {
        logger.error('[getApiConfig] Error fetching API config:', { error });
        res.status(500).json({ message: 'Error fetching API configuration', error: getErrorMessage(error) });
    }
};

export const updateApiConfig = async (
    req: ValidatedRequest<UpdateApiConfigRequestBody, { companyId: string }, {}> & { user?: JwtPayload },
    res: Response<UpdateApiConfigResponse | ErrorResponse>
) => {
    const { companyId } = req.params;
    
    try {
        logger.info('[updateApiConfig] Updating API config for company', { companyId });
        logger.debug('[updateApiConfig] Request body', { body: req.body });

        const formData: UpdateApiConfigRequestBody = req.body;
        
        if (!formData.config?.url && !formData.url) {
            return res.status(400).json({
                message: 'API URL is required',
                error: { receivedData: formData }
            });
        }
        
        let companyApiConfigDoc = await CompanyApiConfig.findOne({ company: companyId });

        if (companyApiConfigDoc) {
            logger.info('[updateApiConfig] Updating existing config');
            const configData = formData.config || formData;
            companyApiConfigDoc.config.url = configData.url || companyApiConfigDoc.config.url;
            companyApiConfigDoc.config.requestType = configData.requestType || companyApiConfigDoc.config.requestType;
            if (configData.headers !== undefined) companyApiConfigDoc.config.headers = configData.headers;
            if (configData.params !== undefined) companyApiConfigDoc.config.params = configData.params;
            if (configData.dataKey !== undefined) companyApiConfigDoc.config.dataKey = configData.dataKey;
            if (configData.totalCountPath !== undefined) companyApiConfigDoc.config.totalCountPath = configData.totalCountPath;
            if (configData.filter !== undefined) companyApiConfigDoc.config.filter = new Map(Object.entries(configData.filter));
            if (configData.baseBodyPayload !== undefined) companyApiConfigDoc.config.baseBodyPayload = configData.baseBodyPayload;
            if (formData.syncSchedule) companyApiConfigDoc.syncSchedule = formData.syncSchedule;
            if (formData.tokenAuthConfig) companyApiConfigDoc.tokenAuthConfig = formData.tokenAuthConfig;
            if (typeof formData.allowMissingMedia === 'boolean') {
              companyApiConfigDoc.allowMissingMedia = formData.allowMissingMedia;
            }
        } else {
            logger.info('[updateApiConfig] Creating new config for company', { companyId });
            const companyExists = await Company.findById(companyId);
            if (!companyExists) {
                return res.status(404).json({ message: `Company with ID ${companyId} not found.` });
            }

            const configData = (formData.config || formData) as IApiConfigInternal;

            companyApiConfigDoc = new CompanyApiConfig({
                company: companyId,
                config: {
                    url: configData.url,
                    requestType: configData.requestType || 'get',
                    headers: configData.headers || {},
                    params: configData.params || {},
                    dataKey: configData.dataKey ?? 'data',
                    totalCountPath: configData.totalCountPath,
                    filter: configData.filter ? new Map(Object.entries(configData.filter)) : new Map(),
                    baseBodyPayload: configData.baseBodyPayload || {}
                },
                syncSchedule: formData.syncSchedule || { frequency: 'daily', timeOfDay: '00:00' },
                tokenAuthConfig: formData.tokenAuthConfig || { enabled: false },
                allowMissingMedia: formData.allowMissingMedia ?? false,
            });
        }

        const savedConfigDoc = await companyApiConfigDoc.save();

        await Company.findByIdAndUpdate(companyId, { apiConfig: savedConfigDoc._id });

        const responseData = savedConfigDoc.toObject() as UpdateApiConfigResponse;
        if (responseData.config?.filter && savedConfigDoc.config.filter instanceof Map) {
            responseData.config.filter = Object.fromEntries(savedConfigDoc.config.filter);
        }

        res.json(responseData);
    } catch (error: unknown) {
        logger.error('[updateApiConfig] Error:', { error });
        res.status(500).json({ message: 'Server error', error: getErrorMessage(error) });
    }
};

export const triggerSync = async (
    req: ValidatedRequest<{}, { companyId: string }, {}> & { user?: JwtPayload },
    res: Response<TriggerSyncResponse | ErrorResponse>
) => {
    const { companyId } = req.params;
    
    try {
        logger.info('[triggerSync] Received request', { companyId });
        const companyApiConfig = await CompanyApiConfig.findOne({ company: companyId })
            .populate('company', 'name');

        if (!companyApiConfig) {
            return res.status(404).json({ message: 'API configuration not found for this company.' });
        }

        if (!companyApiConfig.isActive) {
            return res.status(400).json({ message: 'API sync is not active for this company.' });
        }

        // Type-safe access to populated company or ObjectId
        const company = companyApiConfig.company as unknown as { _id: Types.ObjectId; name: string } | Types.ObjectId;
        const companyName = typeof company === 'object' && 'name' in company ? company.name : 'Unknown Company';
        const companyIdStr = typeof company === 'object' && '_id' in company 
            ? company._id.toString() 
            : (company as Types.ObjectId).toString();
        
        await publishApiSyncTask({ 
            configId: companyApiConfig._id.toString(), 
            companyId: companyIdStr,
            companyName 
        });

        res.status(200).json({ 
            message: `Sync request for ${companyName} has been published.`
        });
    } catch (error: unknown) {
        logger.error('[triggerSync] Error processing sync request', { companyId, error });
        res.status(500).json({ message: 'Failed to publish sync request', error: getErrorMessage(error) });
    }
};

export const triggerSyncAllActiveApis = async (
    req: AuthenticatedRequest,
    res: Response<{ message: string; publishedCount: number; errors: string[] } | ErrorResponse>
) => {
    try {
        const activeConfigs = await CompanyApiConfig.find({ isActive: true }).populate('company', 'name');

        if (!activeConfigs.length) {
            return res.status(404).json({ message: 'No active API configurations found.' });
        }

        let publishedCount = 0;
        const errors: string[] = [];

        for (const config of activeConfigs) {
            try {
                // Type-safe access to populated company or ObjectId
                const company = config.company as unknown as { _id: Types.ObjectId; name: string } | Types.ObjectId;
                const companyName = typeof company === 'object' && 'name' in company ? company.name : 'Unknown Company';
                const companyIdStr = typeof company === 'object' && '_id' in company 
                    ? company._id.toString() 
                    : (company as Types.ObjectId).toString();
                
                await publishApiSyncTask({ 
                    configId: config._id.toString(), 
                    companyId: companyIdStr,
                    companyName 
                });
                publishedCount++;
            } catch (error: unknown) {
                const companyName = (typeof config.company === 'object' && config.company && 'name' in config.company) 
                    ? (config.company as { name?: string }).name || `Config ID ${config._id}`
                    : `Config ID ${config._id}`;
                errors.push(`Failed to publish sync for ${companyName}: ${getErrorMessage(error)}`);
                logger.error('[triggerSyncAllActiveApis] Error publishing sync', { companyName, error: getErrorMessage(error) });
            }
        }
        
        const message = `Published ${publishedCount} of ${activeConfigs.length} active API configurations for synchronization.`;
        if (errors.length > 0) {
            return res.status(207).json({ message, publishedCount, errors });
        }

        res.status(200).json({ message, publishedCount, errors: [] });
    } catch (error: unknown) {
        logger.error('[triggerSyncAllActiveApis] General error:', { error });
        res.status(500).json({ message: 'Failed to trigger sync for all active APIs', error: getErrorMessage(error) });
    }
};

// Helper function to determine how many products to log based on stock size
function getLogSampleSize(totalProducts: number): number {
    if (totalProducts <= 50) return Math.min(totalProducts, 5);
    if (totalProducts <= 500) return 7;
    if (totalProducts <= 5000) return 8;
    if (totalProducts <= 50000) return 9;
    return 10;
}

// Helper function to truncate and format product for logging
function formatProductForLog(product: unknown): string {
    try {
        const stringified = JSON.stringify(product);
        return stringified.substring(0, 600) + (stringified.length > 600 ? '...' : '');
    } catch (e) {
        return '[Error stringifying product]';
    }
}

// Function removed - sync is now handled by microservices

interface ReplayApiSyncDlqRequestBody {
    limit?: number;
    dedupeByCompany?: boolean;
}

export const replayApiSyncDlq = async (
    req: AuthenticatedRequest,
    res: Response<
        | { message: string; moved: number; dropped: number; queued: number; dlqQueued: number; }
        | { message: string; error?: any }
    >
) => {
    const API_SYNC_QUEUE = 'api_sync_tasks';
    const DLX = 'api_sync_dlx';
    const DLQ = 'api_sync_dlq';
    const RETRY_HEADER = 'x-api-sync-retry';
    const LEGACY_RETRY_HEADER = 'retry-count';

    const body = (req.body || {}) as ReplayApiSyncDlqRequestBody;
    const limit = typeof body.limit === 'number' ? body.limit : 500;
    const dedupeByCompany = body.dedupeByCompany !== false; // default true

    const getRabbitMQUrl = () => {
        const isProd = process.env.NODE_ENV === 'production';
        if (process.env.RABBITMQ_URL_FILE) {
            const url = fs.readFileSync(process.env.RABBITMQ_URL_FILE, 'utf8').trim();
            return url;
        }
        if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
        if (isProd) {
            throw new Error('[Security] RABBITMQ_URL (or RABBITMQ_URL_FILE) is required in production');
        }
        const user = process.env.RABBITMQ_USER || 'lgdx';
        const pass = process.env.RABBITMQ_PASS || 'test123';
        const host = process.env.RABBITMQ_HOST || 'rabbitmq';
        const port = process.env.RABBITMQ_PORT || '5672';
        return `amqp://${user}:${pass}@${host}:${port}`;
    };

    try {
        const rabbitmqUrl = getRabbitMQUrl();
        const conn = await amqplib.connect(rabbitmqUrl);
        const ch = await conn.createChannel();

        // Ensure bindings/queues exist (must match worker)
        await ch.assertExchange(DLX, 'direct', { durable: true });
        await ch.assertQueue(DLQ, { durable: true });
        await ch.bindQueue(DLQ, DLX, DLQ);

        await ch.assertQueue(API_SYNC_QUEUE, {
            durable: true,
            arguments: {
                'x-message-ttl': 7200000, // 2 hours — match api-product-sync-service queue
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': DLQ,
            },
        });

        let moved = 0;
        let dropped = 0;
        const movedCompanies = new Set<string>();

        for (let i = 0; i < limit; i++) {
            const msg = await ch.get(DLQ, { noAck: false });
            if (!msg) break;

            let payload: { companyId?: string; companyName?: string } | null = null;
            try {
                payload = JSON.parse(msg.content.toString());
            } catch {
                payload = null;
            }

            const companyId = payload?.companyId;

            if (dedupeByCompany && companyId) {
                if (movedCompanies.has(companyId)) {
                    await ch.ack(msg);
                    dropped++;
                    continue;
                }
                movedCompanies.add(companyId);
            }

            const originalHeaders = msg.properties?.headers || {};
            const headers: Record<string, unknown> = {
                ...originalHeaders,
                // Reset retry counter so the worker has a fresh chance.
                [RETRY_HEADER]: 0,
                [LEGACY_RETRY_HEADER]: 0,
            };

            await ch.sendToQueue(API_SYNC_QUEUE, msg.content, { persistent: true, headers });
            await ch.ack(msg);
            moved++;
        }

        const tasksInfo = await ch.checkQueue(API_SYNC_QUEUE);
        const dlqInfo = await ch.checkQueue(DLQ);

        await ch.close();
        await conn.close();

        res.status(200).json({
            message: `Replayed DLQ -> tasks (moved=${moved}, dropped=${dropped}).`,
            moved,
            dropped,
            queued: tasksInfo.messageCount || 0,
            dlqQueued: dlqInfo.messageCount || 0,
        });
    } catch (error: unknown) {
        logger.error('[replayApiSyncDlq] Error:', { error });
        res.status(500).json({ message: 'Failed to replay API sync DLQ', error: getErrorMessage(error) });
    }
};

export const getSyncQueueStatus = async (req: AuthenticatedRequest, res: Response<SyncQueueStatusResponse | ErrorResponse>) => {
    try {
        // Queue status is now handled by microservices
        res.status(200).json({ running: 0, queued: 0 });
    } catch (error: unknown) {
        logger.error('[getSyncQueueStatus] Error fetching queue status:', { error });
        res.status(500).json({ message: 'Error fetching queue status', error: getErrorMessage(error) });
    }
};

export const resetSyncStatus = async (
  req: AuthenticatedRequest,
  res: Response<ResetSyncStatusResponse | ErrorResponse>
) => {
    const { companyId } = req.params as unknown as CompanyIdParams;
    try {
        const config = await CompanyApiConfig.findOne({ company: companyId });
        if (!config) {
            return res.status(404).json({ message: 'API configuration not found' });
        }
        config.syncStatus = 'idle';
        config.lastSyncError = null;
        await config.save();
        res.json({ message: 'Sync status reset successfully' });
    } catch (error: unknown) {
        logger.error('[resetSyncStatus] Error:', { error });
        res.status(500).json({ message: 'Server error', error: getErrorMessage(error) });
    }
};

export const deleteApiConfig = async (
  req: AuthenticatedRequest,
  res: Response<DeleteApiConfigResponse | ErrorResponse>
) => {
    const { companyId } = req.params as unknown as CompanyIdParams;
    try {
        const result = await CompanyApiConfig.deleteOne({ company: companyId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'API configuration not found' });
        }
        await Company.updateOne({ _id: companyId }, { $unset: { apiConfig: 1 } });
        res.json({ message: 'API configuration deleted successfully' });
    } catch (error: unknown) {
        logger.error('[deleteApiConfig] Error:', { error });
        res.status(500).json({ message: 'Server error', error: getErrorMessage(error) });
    }
};