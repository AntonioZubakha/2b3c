/**
 * Модель компании для FTP-сервиса
 * Расширенная версия с FTP конфигурацией
 */

import mongoose, { Schema, Document } from 'mongoose';

// Интерфейс для FTP конфигурации компании
export interface FtpConfig {
  enabled: boolean;
  username?: string;
  passwordHash?: string;
  homeDirectory?: string;
  maxConcurrentConnections: number;
  allowedIPs: string[];
  uploadQuotaMB: number;
  isActive: boolean;
  lastConnectionAt?: Date;
  connectionCount: number;
  totalUploadsCount: number;
  totalBytesUploaded: number;
  settings: {
    autoProcessFiles: boolean;
    deleteAfterProcess: boolean;
    notifyOnUpload: boolean;
    allowedFileTypes: string[];
    maxFileSizeMB: number;
    processMode: 'replace' | 'add';
  };
}

// Конфигурация для опроса FTP старого проекта (lgdeal.com)
export interface LegacyFtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string; // AES-256-GCM, ключ из Docker secret legacy_ftp_crypto_key
  remoteDir: string;
  pollIntervalHours: number;
  lastPolledAt?: Date;
  lastFileEtag?: string; // "{filename}:{size}:{mtime_unix}" — отпечаток последнего скачанного файла
  consecutiveErrors: number;
  lastError?: string;
}

// Интерфейс для базовой информации компании
export interface ICompanyBase {
  name: string;
  description?: string;
  status?: 'pending_review' | 'active' | 'rejected' | 'suspended';
  users?: Array<{
    user: mongoose.Types.ObjectId;
    role: 'supervisor' | 'manager';
    isActive: boolean;
  }>;
  details?: Record<string, unknown>;
  apiConfig?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  isActive?: boolean;
  syncStatus?: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt?: Date;
  ftpConfig?: FtpConfig;
  legacyFtpConfig?: LegacyFtpConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

// Интерфейс для документа компании
export interface ICompanyDocument extends ICompanyBase, Document {
  // Методы для работы с FTP
  createFtpAccess(options: Partial<FtpConfig>): Promise<string>;
  updateFtpPassword(): Promise<string>;
  disableFtpAccess(): Promise<void>;
  incrementConnectionCount(): Promise<void>;
  recordFileUpload(fileSize: number): Promise<void>;
  checkUploadQuota(fileSize: number): boolean;
}

// Схема FTP конфигурации
const FtpConfigSchema = new Schema({
  enabled: {
    type: Boolean,
    default: false,
    index: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true, // Уникальность только для существующих значений
    trim: true
  },
  passwordHash: {
    type: String
  },
  homeDirectory: {
    type: String,
    trim: true
  },
  maxConcurrentConnections: {
    type: Number,
    default: 2,
    min: 1,
    max: 10
  },
  allowedIPs: [{
    type: String,
    trim: true,
    validate: {
      validator: function(ip: string) {
        // Простая валидация IP адреса
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^(\d{1,3}\.){3}\*$|^\*$/;
        return ipRegex.test(ip);
      },
      message: 'Invalid IP address format'
    }
  }],
  uploadQuotaMB: {
    type: Number,
    default: 500,
    min: 50,
    max: 5000
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastConnectionAt: {
    type: Date,
    index: true
  },
  connectionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalUploadsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalBytesUploaded: {
    type: Number,
    default: 0,
    min: 0
  },
  settings: {
    autoProcessFiles: {
      type: Boolean,
      default: true
    },
    deleteAfterProcess: {
      type: Boolean,
      default: false
    },
    notifyOnUpload: {
      type: Boolean,
      default: true
    },
    allowedFileTypes: {
      type: [String],
      default: ['xlsx', 'xls', 'csv'],
      validate: {
        validator: function(types: string[]) {
          const allowedTypes = ['xlsx', 'xls', 'csv', 'txt'];
          return types.every(type => allowedTypes.includes(type.toLowerCase()));
        },
        message: 'Invalid file type specified'
      }
    },
    maxFileSizeMB: {
      type: Number,
      default: 50,
      min: 1,
      max: 200
    },
    processMode: {
      type: String,
      enum: ['replace', 'add'],
      default: 'replace'
    }
  }
}, { _id: false });

// Основная схема компании
const CompanySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending_review', 'active', 'rejected', 'suspended'],
    default: 'pending_review',
    index: true
  },
  users: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['supervisor', 'manager'],
      required: true
    },
    isActive: {
      type: Boolean,
      default: false
    }
  }],
  details: Schema.Types.Mixed,
  apiConfig: {
    type: Schema.Types.ObjectId,
    ref: 'CompanyApiConfig'
  },
  reviewedAt: Date,
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  syncStatus: {
    type: String,
    enum: ['idle', 'syncing', 'success', 'error'],
    default: 'idle',
    index: true
  },
  lastSyncAt: Date,
  
  ftpConfig: {
    type: FtpConfigSchema,
    default: () => ({
      enabled: false,
      maxConcurrentConnections: 2,
      allowedIPs: [],
      uploadQuotaMB: 500,
      isActive: false,
      connectionCount: 0,
      totalUploadsCount: 0,
      totalBytesUploaded: 0,
      settings: {
        autoProcessFiles: true,
        deleteAfterProcess: false,
        notifyOnUpload: true,
        allowedFileTypes: ['xlsx', 'xls', 'csv'],
        maxFileSizeMB: 50,
        processMode: 'replace'
      }
    })
  },
  legacyFtpConfig: {
    type: new Schema({
      enabled: { type: Boolean, default: false },
      host: { type: String, trim: true },
      port: { type: Number, default: 21 },
      username: { type: String, trim: true },
      encryptedPassword: { type: String },
      remoteDir: { type: String, default: '/files', trim: true },
      pollIntervalHours: { type: Number, default: 12 },
      lastPolledAt: { type: Date },
      lastFileEtag: { type: String },
      consecutiveErrors: { type: Number, default: 0 },
      lastError: { type: String }
    }, { _id: false }),
    default: undefined
  }
}, {
  timestamps: true,
  collection: 'companies'
});

// Методы для работы с FTP
CompanySchema.methods.createFtpAccess = async function(
  this: ICompanyDocument,
  options: Partial<FtpConfig> = {}
): Promise<string> {
  const bcrypt = require('bcrypt');
  const { v4: uuidv4 } = require('uuid');
  
  // Генерация уникального username
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  const username = `company_${(this._id as any).toString().slice(-8)}_${timestamp}_${randomPart}`;
  
  // Генерация безопасного пароля
  const password = uuidv4().replace(/-/g, '').substring(0, 16);
  const passwordHash = await bcrypt.hash(password, 12);
  
  // Обновление FTP конфигурации
  this.ftpConfig = {
    ...this.ftpConfig,
    enabled: true,
    username,
    passwordHash,
    homeDirectory: `/ftp-data/${this._id}`,
    isActive: true,
    maxConcurrentConnections: Math.min(options.maxConcurrentConnections || 2, 10),
    allowedIPs: options.allowedIPs || [],
    uploadQuotaMB: Math.min(options.uploadQuotaMB || 500, 5000),
    connectionCount: 0,
    totalUploadsCount: 0,
    totalBytesUploaded: 0,
    settings: {
      autoProcessFiles: true,
      deleteAfterProcess: false,
      notifyOnUpload: true,
      allowedFileTypes: ['xlsx', 'xls', 'csv'],
      maxFileSizeMB: 50,
      processMode: 'replace'
    }
  } as any;
  
  await this.save();
  return password;
};

CompanySchema.methods.updateFtpPassword = async function(
  this: ICompanyDocument
): Promise<string> {
  const bcrypt = require('bcrypt');
  const { v4: uuidv4 } = require('uuid');
  
  const password = uuidv4().replace(/-/g, '').substring(0, 16);
  const passwordHash = await bcrypt.hash(password, 12);
  
  this.ftpConfig!.passwordHash = passwordHash;
  await this.save();
  
  return password;
};

CompanySchema.methods.disableFtpAccess = async function(
  this: ICompanyDocument
): Promise<void> {
  if (this.ftpConfig) {
    this.ftpConfig.enabled = false;
    this.ftpConfig.isActive = false;
    await this.save();
  }
};

CompanySchema.methods.incrementConnectionCount = async function(
  this: ICompanyDocument
): Promise<void> {
  if (this.ftpConfig) {
    this.ftpConfig.connectionCount += 1;
    this.ftpConfig.lastConnectionAt = new Date();
    await this.save();
  }
};

CompanySchema.methods.recordFileUpload = async function(
  this: ICompanyDocument,
  fileSize: number
): Promise<void> {
  if (this.ftpConfig) {
    this.ftpConfig.totalUploadsCount += 1;
    this.ftpConfig.totalBytesUploaded += fileSize;
    await this.save();
  }
};

CompanySchema.methods.checkUploadQuota = function(
  this: ICompanyDocument,
  fileSize: number
): boolean {
  if (!this.ftpConfig) return false;
  
  const currentQuotaMB = this.ftpConfig.totalBytesUploaded / (1024 * 1024);
  const fileSizeMB = fileSize / (1024 * 1024);
  
  return (currentQuotaMB + fileSizeMB) <= this.ftpConfig.uploadQuotaMB;
};

// Индексы для эффективного поиска
CompanySchema.index({ 'ftpConfig.enabled': 1, 'ftpConfig.isActive': 1 });
  // ftpConfig.username unique index is created by schema option unique: true, sparse: true
  CompanySchema.index({ 'legacyFtpConfig.enabled': 1 });
CompanySchema.index({ name: 1, isActive: 1 });

const Company = mongoose.model<ICompanyDocument>('Company', CompanySchema);

export default Company;
