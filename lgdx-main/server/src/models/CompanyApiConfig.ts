import mongoose, { Schema, Document, Types } from 'mongoose';

// Set strictQuery to suppress deprecation warning
mongoose.set('strictQuery', false);

// Define interfaces for the schema
export interface ITokenUsage {
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

interface ITokenAuthConfig {
  enabled: boolean;
  url?: string;
  requestType?: 'get' | 'post';
  params?: Record<string, any>;
  headers?: Record<string, any>;
  bodyPayload?: Record<string, any> | string;
  bodyEncodeType?: 'json' | 'form' | 'string';
  tokensPathInResponse?: string | Record<string, string>;
  tokenUsage?: ITokenUsage[];
}

interface ISyncSchedule {
  frequency: 'daily' | 'hourly' | 'manual';
  timeOfDay?: string;
}

interface IApiConfig {
  url: string;
  requestType?: 'get' | 'post';
  headers?: Record<string, any>;
  params?: Record<string, any>;
  baseBodyPayload?: Record<string, any>;
  dataKey?: string;
  totalCountPath?: string;
  filter?: Map<string, any>;
}

export interface ICompanyApiConfig extends Document {
  company: Types.ObjectId;
  isActive: boolean;
  allowMissingMedia: boolean;
  config: IApiConfig;
  lastSync: Date | null;
  syncStatus: 'idle' | 'in_progress' | 'success' | 'error';
  lastSyncError: string | null;
  syncSchedule: ISyncSchedule;
  tokenAuthConfig: ITokenAuthConfig;
  // Brahmani-specific fields for multi-part sync state persistence
  // brahmaniFullStoneList?: any; // Removed: Too large to store in DB
  brahmaniTotalPages?: number;
  brahmaniCurrentPage?: number; // Stores the last successfully processed page index or next page to process.
}

const CompanyApiConfigSchema = new Schema<ICompanyApiConfig>({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  allowMissingMedia: {
    type: Boolean,
    default: false
  },
  config: {
    url: {
      type: String,
      required: true,
      trim: true
    },
    requestType: {
      type: String,
      enum: ['get', 'post'],
      default: 'get'
    },
    headers: {
      type: Schema.Types.Mixed,
      default: {}
    },
    params: {
      type: Schema.Types.Mixed,
      default: {}
    },
    baseBodyPayload: {
      type: Schema.Types.Mixed,
      default: {}
    },
    dataKey: {
      type: String,
      default: 'data'
    },
    totalCountPath: {
      type: String
    },
    filter: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map()
    }
  },
  lastSync: {
    type: Date,
    default: null
  },
  syncStatus: {
    type: String,
    enum: ['idle', 'in_progress', 'success', 'error'],
    default: 'idle'
  },
  lastSyncError: {
    type: String,
    default: null
  },
  syncSchedule: {
    frequency: {
      type: String,
      enum: ['daily', 'hourly', 'manual'],
      default: 'daily'
    },
    timeOfDay: {
      type: String,
      default: '00:00' // For daily syncs
    }
  },
  tokenAuthConfig: {
    enabled: { type: Boolean, default: false },
    url: String,
    requestType: { type: String, enum: ['get', 'post'], default: 'post' },
    // For simple key-value params in token URL or simple form data in body
    params: { type: Schema.Types.Mixed, default: {} }, 
    headers: { type: Schema.Types.Mixed, default: {} },
    // For complex JSON body or specific string body for token request
    bodyPayload: { type: Schema.Types.Mixed, default: {} }, 
    bodyEncodeType: { type: String, enum: ['json', 'form', 'string'], default: 'json' },
    // How to extract token(s) from response. Example: "data.token" or for multiple: {accessToken: "data.access_token", refreshToken: "data.refresh_token"}
    tokensPathInResponse: { type: Schema.Types.Mixed, default: 'token' }, 
    // How to use the token(s) in the main request
    // Example for single token: { name: "token", placement: "header", format: "Bearer {token}"} 
    // Example for multiple: [{ name: "accessToken", placement: "header", format: "Bearer {accessToken}"}, { name: "userId", placement: "param"}]
    tokenUsage: [{ 
      nameInResponse: String, // Key used in tokensPathInResponse if it's an object (e.g. "accessToken")
      placeholderName: String, // Placeholder in main request URL/params/headers (e.g., "{token}" or "{accessToken}")
      placement: { type: String, enum: ['header', 'param', 'url_segment', 'body'], required: true },
      destinationName: String, // For header/param name, or for body, this is the key in the body.
      bodyKeyPath: String, // Optional: For 'body' placement, if the token needs to be nested, e.g., 'auth.token'
      formatPrefix: String, // e.g. "Bearer " for Authorization header
      formatSuffix: String
    }]
  },
  // Brahmani-specific fields for multi-part sync state persistence
  // brahmaniFullStoneList: { type: Schema.Types.Mixed, required: false }, // Removed
  brahmaniTotalPages: { type: Number, required: false },
  brahmaniCurrentPage: { type: Number, default: 0, required: false },
}, {
  timestamps: true
});

export default mongoose.model<ICompanyApiConfig>('CompanyApiConfig', CompanyApiConfigSchema); 