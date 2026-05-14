import mongoose, { Schema, Document, Types } from 'mongoose';
import { ICompanyDetails } from '../types';

// Интерфейс для основных данных компании (без Mongoose свойств)
export interface ICompanyBase {
  name: string;
  description?: string;
  status?: string;
  apiName?: string; // For identifying the sync strategy
  users?: Array<{
    user: mongoose.Types.ObjectId;
    role: string;
    isActive: boolean;
    _id?: mongoose.Types.ObjectId;
  }>;
  details?: ICompanyDetails;
  apiConfig?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

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

// Интерфейс для документа компании
export interface ICompanyDocument extends ICompanyBase, Document {}

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
  apiName: {
    type: String,
    trim: true
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
  reviewedAt: {
    type: Date
  },
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
  lastSyncAt: { type: Date }
}, {
  timestamps: true,
  collection: 'companies'
});

// Перед созданием модели регистрируем middleware для обновления дат
CompanySchema.pre('save', function(next) {
  // timestamps: true уже автоматически обрабатывает createdAt и updatedAt
  next();
});

// Indexes for efficient querying
CompanySchema.index({ isActive: 1, syncStatus: 1 });

const Company = mongoose.model<ICompanyDocument>('Company', CompanySchema);

export default Company; 