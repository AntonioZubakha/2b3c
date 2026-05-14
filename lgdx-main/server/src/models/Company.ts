import mongoose, { Schema, Document, Model } from 'mongoose';
import { ICompany, ICompanyDetails, CompanyRole } from '../types';

// Интерфейс для документа компании
export interface ICompanyDocument extends ICompany {}

// Интерфейс для адресной информации
interface AddressSchema {
  country?: string;
  addressLine1?: string; 
  addressLine2?: string;
  city?: string;
  stateProvinceRegion?: string;
  postalCode?: string;
  building?: string; 
  office?: string;
}

// Структура схемы адреса
const addressSchemaStructure = {
  country: String,
  addressLine1: String, 
  addressLine2: String,
  city: String,
  stateProvinceRegion: String,
  postalCode: String,
  // Оставляем building/office на случай, если они понадобятся для доп. деталей
  building: String, 
  office: String
};

// Схема компании
const CompanySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending_review', 'active', 'rejected', 'suspended'],
    default: 'pending_review'
  },
  users: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['supervisor', 'manager', 'logist'],
      required: true
    },
    isActive: {
      type: Boolean,
      default: false
    }
  }],
  // Роли компании (seller, buyer, both)
  roles: [{
    type: String,
    enum: Object.values(CompanyRole),
    default: [CompanyRole.SELLER]
  }],
  details: {
    // General Information
    phone: String,
    email: String, 
    website: String, 
    companyCountry: String, // Основная страна компании (чтобы не конфликтовать с country в адресах)
    technology: String, // Пока как строка, можно будет изменить на массив если нужно много технологий

    logo: {
      url: String,
      filename: String
    },
    
    // Addresses
    legalAddress: addressSchemaStructure,
    actualAddress: addressSchemaStructure,
    shippingAddress: addressSchemaStructure,

    // Bank Information
    bankInformation: {
      accountName: String, 
      bankName: String,
      accountNumber: String,
      routingNumber: String, 
      swiftCode: String,
      bankAddress: String, 
      correspondentBank: {
        accountName: String, // Имя счета в банке-корреспонденте
        bankName: String,    // Название банка-корреспондента
        accountNumber: String,
        swiftCode: String,
        bankAddress: String 
      }
    },

    // Tax Information
    taxInformation: {
      taxId: String, // Общее поле для TIN/VAT/EIN. Можно будет разбить при необходимости.
      vatNumber: String, // Оставляем на всякий случай, если нужно отдельно
      worksWithVat: Boolean 
    }
  },
  apiConfig: {
    type: Schema.Types.ObjectId,
    ref: 'CompanyApiConfig'
  },
  // FTP Configuration
  ftpConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    passwordHash: {
      type: String,
      select: false
    },
    homeDirectory: String,
    maxConcurrentConnections: {
      type: Number,
      default: 2,
      min: 1,
      max: 10
    },
    allowedIPs: [String],
    uploadQuotaMB: {
      type: Number,
      default: 500,
      min: 50,
      max: 5000
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastConnectionAt: Date,
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
        default: ['xlsx', 'xls', 'csv']
      },
      maxFileSizeMB: {
        type: Number,
        default: 50,
        min: 1,
        max: 200
      },
      processMode: {
        type: String,
        enum: ['replace', 'append'],
        default: 'replace'
      }
    }
  },
  // Payment settings — per-company toggles for checkout/payment methods.
  // Used on deals where this company is the seller: if stripeEnabled is false,
  // buyers will not see the Stripe option and the Stripe payment intent will
  // be rejected on the backend.
  paymentSettings: {
    stripeEnabled: {
      type: Boolean,
      default: true
    }
  },
  // Legacy FTP (lgdeal.com) polling configuration
  legacyFtpConfig: {
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
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Last stock sync (file upload); API sync uses CompanyApiConfig.lastSync
  lastSync: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Перед созданием модели регистрируем middleware для обновления дат
CompanySchema.pre('save', function(next) {
  // timestamps: true уже автоматически обрабатывает createdAt и updatedAt
  next();
});

const Company = mongoose.model<ICompanyDocument>('Company', CompanySchema);

export default Company; 