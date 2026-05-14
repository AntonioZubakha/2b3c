import { Document, Types } from 'mongoose';

// ===== REPORT TYPES =====
export type ReportFormat = 'json' | 'csv' | 'xlsx';

// ===== PRODUCT CATEGORIES =====
export enum ShapeCategory {
  ROUND = 'ROUND',                    // Круглая
  OVAL = 'OVAL',                      // Овальная
  PEAR = 'PEAR',                      // Грушевидная
  CUSHION = 'CUSHION',                // Подушка
  EMERALD = 'EMERALD',                // Изумруд
  RADIANT = 'RADIANT',                // Радиант
  PRINCESS = 'PRINCESS',              // Принцесса
  MARQUISE = 'MARQUISE',              // Маркиз
  HEART = 'HEART',                    // Сердце
  ASSCHER = 'ASSCHER',                // Ашчер
  FANCY = 'FANCY'                     // Фенси (все остальные)
}

export type WeightCategory =
  | '0.00-0.29'
  | '0.3-0.59'
  | '0.6-0.99'
  | '1-1.39'
  | '1.4-1.79'
  | '1.8-2.19'
  | '2.2-2.59'
  | '2.6-2.99'
  | '3-3.49'
  | '3.5-3.99'
  | '4-4.99'
  | '5-5.99'
  | '6-6.99'
  | '7-7.99'
  | '8-8.99'
  | '9-9.99'
  | '10-11.99'
  | '12-14.99'
  | '15-24.99'
  | '25-50'
  | '50.01-100'
  | '100.01+';

export enum ClarityCategory {
  FL = 'FL',
  IF = 'IF',
  VVS1 = 'VVS1',
  VVS2 = 'VVS2',
  VS1 = 'VS1',
  VS2 = 'VS2'
}

export enum ColorCategoryEnum {
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G'
}

// ===== BASE DOCUMENT =====
export interface IBaseDocument extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ===== COMPANY TYPES =====
export interface ICompanyDetails {
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  zipCode?: string;
  taxId?: string;
  registrationNumber?: string;
  shippingAddress?: {
    addressLine1?: string;
    city?: string;
    stateProvinceRegion?: string;
    postalCode?: string;
    country?: string;
    address?: string;
    region?: string;
    zipCode?: string;
  };
  legalAddress?: {
    addressLine1?: string;
    city?: string;
    stateProvinceRegion?: string;
    postalCode?: string;
    country?: string;
    address?: string;
    region?: string;
    zipCode?: string;
  };
  billingAddress?: {
    addressLine1?: string;
    city?: string;
    stateProvinceRegion?: string;
    postalCode?: string;
    country?: string;
  };
  logoUrl?: string;
  logo?: {
    url: string;
    filename: string;
  };
  documents?: Array<{
    name: string;
    url: string;
    uploadedAt: Date;
  }>;
}

export interface ICompany extends IBaseDocument {
  name: string;
  description?: string;
  details?: ICompanyDetails;
  primaryAdminId: Types.ObjectId;
  status: string;
  type: string;
  invitedBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  notes?: string;
  users?: { 
    _id?: Types.ObjectId;
    user: Types.ObjectId;
    role: string; 
    isActive: boolean; 
  }[];
}

// ===== USER TYPES =====
export interface IUser extends IBaseDocument {
  email: string;
  // Add other fields if they become necessary for reporting
}

// ===== PRODUCT TYPES =====
export interface IProduct extends IBaseDocument {
  _id: Types.ObjectId;
  id?: string; // System specific UUID or identifier
  company?: Types.ObjectId | ICompany; // Может быть populated
  companyId?: string; // Explicit company ID if not populated
  companyName?: string;

  sku?: string; // Stock keeping unit
  shape?: string;
  carat?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  certificateInstitute?: string;
  certificateNumber?: string;
  price?: number;
  marketPrice?: number;
  marketPricePerCarat?: number;
  pricePerCarat?: number;
  discount?: number; // Percentage or amount

  measurements?: string; // Raw measurement string e.g., "1.0x2.0x3.0"
  measurement1?: number; // Typically Length
  measurement2?: number; // Typically Width
  measurement3?: number; // Typically Height/Depth
  ratio?: number; // Length/Width ratio (measurement1/measurement2)

  tableSize?: number; // Percentage
  totalDepth?: number; // Percentage
  crownHeight?: number; // Percentage or mm
  pavilionDepth?: number; // Percentage or mm
  girdle?: string; // Description e.g., "THIN TO MEDIUM"
  culet?: string; // e.g., "NONE", "SMALL"
  
  status?: string; // e.g., 'Available', 'Sold', 'OnDeal'
  onDeal?: boolean;
  sold?: boolean;

  photo?: string; // URL
  video?: string; // URL
  reportLink?: string; // URL to certificate/report
  image360?: string; // URL to 360 view

  location?: string; // Raw location string
  technology?: string; // e.g., "Lab Grown", "Natural", "HPHT", "CVD"
  stoneType?: string; // e.g., "diamond", "fancy diamond"
  overtone?: string; // For fancy colors
  intensity?: string; // For fancy colors
  description?: string;
  ha?: string; // Hearts & Arrows

  lotNumber?: string;
  additionalInfo?: string;

  // Timestamps
  lastSyncedAt?: Date;
  
  // For internal processing
  // isNew is inherited from mongoose Document
  
  // Legacy fields for compatibility
  weight?: string; // Category weight
  sellerSku?: string;
  totalPrice?: number;
  certificate?: {
    lab: string;
    certNumber: string;
    link: string;
  };
  media?: {
    image?: string;
    video?: string;
  };
  isSold?: boolean;
  isOnDeal?: boolean;
  isDeleted?: boolean;
  isArchived?: boolean;
  notes?: string;
  lastSyncAt?: Date;
  category?: {
    shape: ShapeCategory;
    weight: WeightCategory;
    clarity: ClarityCategory;
    color: ColorCategoryEnum;
  };

  // Optional fields that might be present from various sources
  // Note: Index signature оставлен для динамических полей от разных API источников
  [key: string]: unknown;
}

// ===== API CONFIG TYPES =====
export interface IApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown> | unknown;
}

export interface IAuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2';
  username?: string;
  password?: string;
  token?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  tokenUrl?: string;
}

export interface ITokenAuthConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  grantType: 'client_credentials' | 'password' | 'refresh_token';
  username?: string;
  password?: string;
  refreshToken?: string;
}

export interface ICompanyApiConfig extends IBaseDocument {
  companyId: Types.ObjectId;
  name: string;
  description?: string;
  baseUrl: string;
  endpoints: {
    products: IApiEndpoint;
    auth?: IApiEndpoint;
  };
  authConfig?: IAuthConfig;
  tokenAuthConfig?: ITokenAuthConfig;
  productMapping: {
    id: string;
    shape: string;
    weight: string;
    color: string;
    clarity: string;
    cut?: string;
    polish?: string;
    symmetry?: string;
    fluorescence?: string;
    price: string;
    certificateLab: string;
    certificateNumber: string;
    certificateLink: string;
    image?: string;
    video?: string;
    location?: string;
    notes?: string;
  };
  isActive: boolean;
  lastSyncAt?: Date;
  syncFrequency?: number; // in minutes
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

// ===== BLACKLISTED CERTIFICATE =====
export interface IBlacklistedCertificate extends IBaseDocument {
  certificateNumber: string;
  reason: string;
  addedBy: Types.ObjectId;
}

// ===== SYNC STATISTICS =====
export interface InventoryProcessingStats {
  totalUploaded: number;
  processed: number;
  created: number;
  updated: number;
  skippedByBlacklist: number;
  skippedExistingOnDealOrSold: number;
  skippedInvalidStatus: number;
  skippedInvalidColor: number;
  replacedOtherCompanyProduct: number;
  skippedCheaperExistsOtherCompany: number;
  skippedInvalidClarity: number;
  skippedInvalidPrice: number;
  skippedInvalidCarat: number;
  skippedMissingMedia: number;
  skippedMissingCertNumber?: number;
  apiErrors?: number; 
  skippedByApiFilter?: number; 
  duration?: string; 
  reportNotes?: string[] | string | null;
  errors?: Array<{ 
    message: string; 
    certificateNumber?: string;
    rawDataSource?: unknown;
    stack?: string;
    rawProduct?: unknown;
  }>;
}

// ===== RAW PRODUCT DATA =====
// Данные от различных API источников - типы неизвестны заранее
export interface RawProductData {
  [key: string]: unknown;
}

// ===== TASK PAYLOADS =====
export interface ApiSyncTaskPayload {
  configId: string;
  companyId: string;
  companyName: string;
}

export interface FileUploadTaskPayload {
  filePath: string;
  userId: string;
  companyDoc: ICompany;
  companyName: string;
  originalFileName: string;
  uploadMode: 'replace' | 'add';
} 