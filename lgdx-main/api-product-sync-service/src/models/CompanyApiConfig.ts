import mongoose, { Schema, Document, Types } from 'mongoose';
import './Company'; // Ensure Company model is registered before use in ref

// Set strictQuery to suppress deprecation warning
mongoose.set('strictQuery', false);

// Define interfaces for the schema
export interface ITokenUsageRule {
  nameInResponse?: string;
  placeholderName?: string;
  placement: 'header' | 'param' | 'url_segment' | 'body';
  destinationName?: string;
  bodyKeyPath?: string;
  /** Prefix for header/param value, e.g. "Bearer " for Authorization */
  formatPrefix?: string;
  /** Suffix for header/param value */
  formatSuffix?: string;
}

export interface ITokenAuthConfig {
  enabled: boolean;
  url?: string;
  requestType?: 'get' | 'post';
  params?: Record<string, string>;
  headers?: Record<string, string>;
  bodyPayload?: Record<string, unknown>;
  bodyEncodeType?: 'json' | 'form' | 'string';
  tokensPathInResponse?: string | Record<string, string>;
  tokenUsage?: ITokenUsageRule[];
}

export interface IApiConfig {
  url: string;
  requestType: 'get' | 'post';
  headers: Record<string, string>;
  params: Record<string, string | number>;
  baseBodyPayload: Record<string, unknown>;
  dataKey?: string;
  /** Path in response to total count for pagination (e.g. data.totalCount). When set, max pages is computed from totalCount / pageSize. */
  totalCountPath?: string;
  filter: Record<string, string | number | boolean | null | undefined>;
}

export interface ISyncSchedule {
  frequency: 'daily' | 'hourly' | 'manual';
  timeOfDay: string;
}

export interface ICompanyApiConfig extends Document {
  _id: Types.ObjectId;
  company: Types.ObjectId;
  isActive: boolean;
  config: IApiConfig;
  lastSync: Date | null;
  syncStatus: 'idle' | 'in_progress' | 'success' | 'error';
  lastSyncError: string | null;
  syncSchedule: ISyncSchedule;
  tokenAuthConfig?: ITokenAuthConfig;
  allowMissingMedia?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TokenUsageRuleSchema = new Schema({
  nameInResponse: { type: String },
  placeholderName: { type: String },
  placement: {
    type: String,
    enum: ['header', 'param', 'url_segment', 'body'],
    required: true
  },
  destinationName: { type: String },
  bodyKeyPath: { type: String },
  formatPrefix: { type: String },
  formatSuffix: { type: String }
}, { _id: false });

const TokenAuthConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  url: { type: String },
  requestType: { type: String, enum: ['get', 'post'] },
  params: { type: Schema.Types.Mixed },
  headers: { type: Schema.Types.Mixed },
  bodyPayload: { type: Schema.Types.Mixed },
  bodyEncodeType: { type: String, enum: ['json', 'form', 'string'] },
  tokensPathInResponse: { type: Schema.Types.Mixed },
  tokenUsage: [TokenUsageRuleSchema]
}, { _id: false });

const ApiConfigSchema = new Schema({
  url: { type: String, required: true },
  requestType: { type: String, enum: ['get', 'post'], required: true },
  headers: { type: Schema.Types.Mixed, default: {} },
  params: { type: Schema.Types.Mixed, default: {} },
  baseBodyPayload: { type: Schema.Types.Mixed, default: {} },
  dataKey: { type: String, default: 'data' },
  totalCountPath: { type: String },
  filter: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const SyncScheduleSchema = new Schema({
  frequency: {
    type: String,
    enum: ['daily', 'hourly', 'manual'],
    default: 'manual'
  },
  timeOfDay: { type: String, default: '00:00' }
}, { _id: false });

const CompanyApiConfigSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  config: {
    type: ApiConfigSchema,
    required: true
  },
  lastSync: {
    type: Date,
    default: null
  },
  syncStatus: {
    type: String,
    enum: ['idle', 'in_progress', 'success', 'error'],
    default: 'idle',
    index: true
  },
  lastSyncError: {
    type: String,
    default: null
  },
  syncSchedule: {
    type: SyncScheduleSchema,
    default: () => ({})
  },
  tokenAuthConfig: TokenAuthConfigSchema,
  allowMissingMedia: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'companyapiconfigs'
});

// Indexes for efficient querying
CompanyApiConfigSchema.index({ isActive: 1, syncStatus: 1 });
CompanyApiConfigSchema.index({ 'syncSchedule.frequency': 1 });

export default mongoose.model<ICompanyApiConfig>('CompanyApiConfig', CompanyApiConfigSchema); 