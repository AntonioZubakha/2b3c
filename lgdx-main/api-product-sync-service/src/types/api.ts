import { Request } from 'express';  
import mongoose from 'mongoose';    
import { JwtPayload } from './auth';

// --- Base Auth Interfaces ---

export interface AuthenticatedRequest extends Request {
    user?: JwtPayload;
    file?: Express.Multer.File;
}


// --- API Configuration Interfaces ---

// Structure for config.filter (Map in Mongoose, object in JSON)
export interface ApiFilterMap {
    [key: string]: string | number | boolean | null | undefined;
}

// Interface for ICompanyApiConfig.config field
export interface IApiConfigInternal {
    url: string;
    requestType: 'get' | 'post';
    headers: Record<string, string>;
    params: Record<string, string | number>;
    baseBodyPayload: Record<string, unknown>;
    dataKey: string;
    filter: ApiFilterMap;
}

// Interface for ICompanyApiConfig.tokenAuthConfig.tokenUsage items
export interface ITokenUsageRuleInternal {
    nameInResponse?: string;
    placeholderName?: string;
    placement: 'header' | 'param' | 'url_segment' | 'body';
    destinationName?: string;
    bodyKeyPath?: string;
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

// Interface for ICompanyApiConfig.syncSchedule
export interface ISyncScheduleInternal {
    frequency: 'daily' | 'hourly' | 'manual';
    timeOfDay: string;
}

// Represents the CompanyApiConfig document structure as a plain data object
export interface CompanyApiConfigDataObject {
    _id: mongoose.Types.ObjectId | string;
    company: mongoose.Types.ObjectId | string | { _id: mongoose.Types.ObjectId; name: string }; // Can be populated
    isActive: boolean;
    config: IApiConfigInternal;
    lastSync: Date | null;
    syncStatus: 'idle' | 'in_progress' | 'success' | 'error';
    lastSyncError: string | null;
    syncSchedule: ISyncScheduleInternal;
    tokenAuthConfig?: ITokenAuthConfigInternal;
    createdAt?: Date;
    updatedAt?: Date;
    allowMissingMedia?: boolean;
}


// --- Controller Method-Specific Interfaces ---

export interface CompanyIdParams {
    companyId: string;
}

export interface GetApiConfigResponse extends CompanyApiConfigDataObject {}

export interface UpdateApiConfigRequestBody {
    url?: string;
    requestType?: 'get' | 'post';
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
    dataKey?: string;
    filter?: ApiFilterMap;
    baseBodyPayload?: Record<string, unknown>;
    syncSchedule?: ISyncScheduleInternal;
    tokenAuthConfig?: ITokenAuthConfigInternal;
    allowMissingMedia?: boolean;
    config?: Partial<IApiConfigInternal>; // For nested structure
}

export interface UpdateApiConfigResponse extends CompanyApiConfigDataObject {}

export interface TriggerSyncResponse {
    message: string;
    queueStatus?: {
        running: number;
        queued: number;
    };
}

export interface SyncQueueStatusResponse {
    running: number;
    message: string;
    error?: string;
} 