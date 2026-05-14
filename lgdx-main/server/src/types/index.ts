import { Document, Types } from 'mongoose';

// Enum для ролей компаний
export enum CompanyRole {
  SELLER = 'seller',
  BUYER = 'buyer',
  BOTH = 'both'
}

// Базовый интерфейс документа MongoDB
export interface IBaseDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
  toObject<T = this>(): T;
  toJSON<T = this>(): T;
}

// Пользователь
export interface IUser extends IBaseDocument {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  company: Types.ObjectId | ICompany;
  role: 'admin' | 'supervisor' | 'manager' | 'logist';
  isActive: boolean;
  isLgdealSupervisor: boolean;
  companyId?: Types.ObjectId;
  lastLogin?: Date;
  // Email верификация
  emailVerified?: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  // Phone верификация
  phone?: string;
  phoneVerified?: boolean;
  phoneVerificationToken?: string;
  phoneVerificationExpires?: Date;
  phoneVerificationCode?: string;
  // Восстановление пароля
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  /** Telegram chat_id for DMs (e.g. password reset). User must have started the bot. */
  telegramId?: string;
  /** One-time token for "link Telegram" flow. Not sent to client. */
  telegramLinkToken?: string;
  telegramLinkTokenExpires?: Date;
  /** Per-channel transactional notification toggles. */
  notificationPrefs?: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
  /** Соль для мигрированных пользователей: проверка пароля как bcrypt(plainPassword + '_' + salt). Не отдавать в API. */
  legacyPasswordSalt?: string;
  cart?: ICartSchema;
}

// Схема корзины для пользователя
export interface ICartSchema {
  items: Array<ICartItem>;
  updatedAt: Date;
}

// Данные о компании
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
    // Дополнительные поля для совместимости с существующим кодом
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
    // Дополнительные поля для совместимости с существующим кодом
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

// Компания
export interface ICompany extends IBaseDocument {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  details?: ICompanyDetails;
  primaryAdminId: Types.ObjectId | IUser;
  status: string;
  type: string;
  invitedBy?: Types.ObjectId | IUser;
  approvedBy?: Types.ObjectId | IUser;
  approvedAt?: Date;
  notes?: string;
  users?: {
    _id?: Types.ObjectId;
    user: Types.ObjectId | IUser;
    role: 'admin' | 'supervisor' | 'manager' | 'logist';
    isActive: boolean;
  }[];
  // Роли компании (seller, buyer, both)
  roles?: CompanyRole[];
  // Per-company payment toggles. When this company is the seller on a deal,
  // these flags gate which payment methods the buyer can see / use.
  paymentSettings?: {
    stripeEnabled?: boolean;
  };
  // FTP Configuration
  ftpConfig?: {
    enabled: boolean;
    username?: string;
    passwordHash?: string;
    homeDirectory?: string;
    maxConcurrentConnections?: number;
    allowedIPs?: string[];
    uploadQuotaMB?: number;
    isActive?: boolean;
    lastConnectionAt?: Date;
    connectionCount?: number;
    totalUploadsCount?: number;
    totalBytesUploaded?: number;
    settings?: {
      autoProcessFiles?: boolean;
      deleteAfterProcess?: boolean;
      notifyOnUpload?: boolean;
      allowedFileTypes?: string[];
      maxFileSizeMB?: number;
      processMode?: 'replace' | 'append';
    };
  };
}

// Товар
export interface IProduct {
  _id?: Types.ObjectId | string; // MongoDB ObjectId
  id?: string; // System specific UUID or identifier, often same as stockNumber
  sku?: string; // SKU identifier for products
  company?: Types.ObjectId | string; // MongoDB ObjectId ref to Company
  companyId?: string; // Explicit company ID if not populated
  companyName?: string;

  stockNumber?: string; // Main stock identifier
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
  
  status?: string; // e.g., 'Available', 'Sold', 'OnDeal', 'Incoming'
  onDeal?: boolean;
  sold?: boolean;

  photo?: string; // URL
  video?: string; // URL
  reportLink?: string; // URL to certificate/report
  image360?: string; // URL to 360 view

  location?: string; // Raw location string, or specific field like country/city
  technology?: string; // e.g., "Lab Grown", "Natural", "HPHT", "CVD"
  stoneType?: string; // e.g., "diamond", "fancy diamond"
  overtone?: string; // For fancy colors
  intensity?: string; // For fancy colors
  description?: string;
  notes?: string;
  comment?: string;
  details?: string;
  ha?: string; // Hearts & Arrows, e.g., "H&A", "Excellent"

  lotNumber?: string;
  additionalInfo?: string;

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  lastSync?: Date; // If applicable for products synced from external sources
  
  // For internal processing, not necessarily in DB for all products
  isNew?: boolean; 
  history?: Array<{ date: Date; price: number; [key: string]: unknown }>; // Price history or other audit trails

  // Optional fields that might be present from various sources
  [key: string]: unknown; // Allow other dynamic properties if necessary
}

// Снапшот продукта для отображения в сделке после удаления/недоступности продукта из каталога
export interface IProductDisplaySnapshot {
  shape?: string;
  carat?: number;
  color?: string;
  clarity?: string;
  certificateNumber?: string;
  certificateInstitute?: string;
  location?: string;
}

// Элемент сделки (товар)
export interface IDealProduct {
  product: Types.ObjectId | IProduct; // Ссылка на продукт или сам объект продукта
  /** Снапшот полей для отображения; используется, если продукт удалён из каталога */
  productSnapshot?: IProductDisplaySnapshot;
  price: number;
  quantity?: number;
  marketPriceAtInitiation?: number;
  // Поля для альтернатив, если они остаются в этой структуре
  suggestedAlternatives?: Array<{
    product: Types.ObjectId | IProduct;
    pairedLgdealToSellerDealId?: Types.ObjectId | IDeal | null;
  }>;
  originalPrice?: number; // цена из каталога на момент добавления в сделку
  status?: string; // e.g. 'pending', 'accepted', 'rejected', 'alternative_proposed', 'alternative_accepted'
  selectedAlternativeProduct?: Types.ObjectId | IProduct;
  selectedAlternativePrice?: number;
  selectedAlternativeNotes?: string;
  originalProductDetailsBeforeSwap?: Record<string, unknown>; // Added to store original product details before swap
  originalPriceBeforeSwap?: number; // Added to store original price before swap
  originalShippingCostBeforeSwap?: number;
  originalProductStruckOut?: boolean; // Added to mark original product as struck out

}

// +++ НОВЫЙ ИНТЕРФЕЙС ДЛЯ ОТКЛОНЕННЫХ СЧЕТОВ +++
export interface IRejectedInvoice {
  date: Date;
  reason: string;
  rejectedBy: Types.ObjectId | IUser;
  originalFilename?: string; // Имя файла отклоненного счета
}

// Детали оплаты
export interface IPaymentDetails {
  method?: string; // 'bank_transfer' | 'stripe'
  status?: string; // e.g. 'pending', 'paid', 'failed'
  transactionId?: string; // ID транзакции, если применимо
  invoiceFilename?: string; 
  invoiceUrl?: string; 
  // Используем IRejectedInvoice для типизации rejectedInvoices
  rejectedInvoices?: IRejectedInvoice[]; 
  paymentDate?: Date; // Дата платежа
  amountPaid?: number; // Уплаченная сумма
  // Поле для отслеживания, какая компания загрузила инвойс
  uploadedByCompany?: string; // ID или название компании
  
  // Stripe-specific fields
  stripePaymentIntentId?: string; // Stripe Payment Intent ID
  stripeClientSecret?: string; // Client secret для фронтенда
  stripeStatus?: string; // Stripe payment status
  stripeChargeId?: string; // Stripe Charge ID
  stripeRefundId?: string; // Stripe Refund ID (если был возврат)
}

// Детали доставки
export interface IShippingAddress { // Отдельный интерфейс для адреса доставки в сделке
  recipientName?: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvinceRegion?: string;
  postalCode?: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface IShippingDetails {
  shippingAddress?: IShippingAddress;
  cost?: number;
  /** Import tariff / duty cost (buyer-to-lgdeal only); added to buyer's total. */
  importTariff?: number;
  method?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  status?: string; // e.g., 'pending', 'shipped', 'delivered'
  deliveredDate?: Date;
  deliveryConfirmedBy?: Types.ObjectId | IUser;
  carrier?: string;
}

// Запись в логе активности
export interface IActivityLog {
  timestamp: Date;
  action: string;
  performedBy?: Types.ObjectId | IUser; // Может быть системное действие без пользователя
  details: string;
  previousState?: Record<string, unknown>; // Для логирования изменений
  newState?: Record<string, unknown>;
}

// Продукт в предложении (часть IProposedTerm и IFinalNegotiationTerms)
export interface IProposedTermProduct {
  product: Types.ObjectId | IProduct;
  price: number; // Цена за единицу этого продукта в данном предложении
  originalPrice: number; // Исходная цена продукта (из каталога или предыдущего состояния сделки)
  discountPercent: number; // Процент скидки на этот продукт в данном предложении
  quantity?: number; // Количество этого продукта (если применимо, обычно 1 для уникальных товаров)
}

// Предложение в переговорах
export interface IProposedTerm {
  proposedBy: Types.ObjectId | IUser;
  proposedDate?: Date; // Сделаем опциональным, т.к. в схеме default
  price?: number; // Общая сумма всех продуктов в этом предложении (products.price * quantity)
  products?: IProposedTermProduct[];
  deliveryTerms?: string;
  additionalTerms?: string;
  shippingCost?: number; // Стоимость доставки, предложенная в этих условиях
  status: 'pending' | 'accepted' | 'rejected' | 'counter-offered' | 'proposed';
  // Удаляем дублирующие поля terms и proposedAt, если они не используются активно
  // и переходим к единой структуре
}

// Финальные согласованные условия
export interface IFinalNegotiationTerms {
  price: number; // Финальная общая цена продуктов
  products: IProposedTermProduct[]; // Финальный список продуктов с их ценами
  deliveryTerms?: string;
  additionalTerms?: string;
  acceptedDate: Date;
  shippingCost?: number; // Финальная стоимость доставки
}

export interface INegotiationDetails {
  startDate?: Date;
  endDate?: Date;
  proposedTerms: IProposedTerm[];
  finalTerms?: IFinalNegotiationTerms; // Используем новый интерфейс
}

// Сделка
export type DealType = 'buyer-to-lgdeal' | 'lgdeal-to-seller';
export type DealStage = 'request' | 'payment_delivery' | 'completed' | 'cancelled';
// Import DealStatus from constants to avoid duplication and include new workflow statuses
import type { DealStatus as DealStatusFromConstants } from './constants';
export type DealStatus = DealStatusFromConstants;

export interface IDeal extends Document {
  _id: Types.ObjectId;
  dealNumber: string;
  buyerId: Types.ObjectId | IUser;
  sellerId: Types.ObjectId | IUser;
  buyerCompanyId: Types.ObjectId | ICompany;
  sellerCompanyId: Types.ObjectId | ICompany;
  products: IDealProduct[];
  amount: number; // Unified: primary amount field
  fee: number;
  currency?: string; // Made optional since not always used
  status: DealStatus;
  stage: DealStage;
  dealType: DealType;
  negotiationDetails?: INegotiationDetails;
  paymentDetails?: IPaymentDetails;
  shippingDetails?: IShippingDetails;
  shippingDocuments?: Array<{
    filename: string;
    url: string;
    originalName: string;
    mimetype: string;
    size: number;
  }>;
  activityLog: IActivityLog[];
  invoiceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastActionAt?: Date;
  completedAt?: Date;
  isSystemManaged?: boolean;
  pairedDealId?: Types.ObjectId | IDeal;
  pairedDealIds?: Array<Types.ObjectId | IDeal>; 
  notes?: string;
  requestDetails?: IRequestDetails; // Use proper interface instead of any
  cancellationReason?: string;
  notificationSentForPendingProducts?: boolean;
  metadata?: {
    dashboardDealType?: string;
  };
  
  // Computed/UI fields (can be added at runtime)
  totalAmount?: number; // Deprecated: use amount instead
  isDirectLgdealDeal?: boolean;
  userRole?: string;
  allowedActions?: string[];
  dashboardDealType?: 'mainCustomerSale' | 'primarySupplierPurchase' | 'alternativeSupplierPurchase' | 'standaloneSupplierPurchase';
  counterpartyName?: string;
  linkedToDealNumber?: string | null;
  // System fields
  activePurchaseDealId?: Types.ObjectId;

  // LGDEAL Internal Workflow fields (для internal assignment)
  assignedTo?: Types.ObjectId | IUser; // Manager или Logist которому назначена сделка
  assignedRole?: 'manager' | 'logist'; // Роль назначенного пользователя
  assignedAt?: Date; // Дата назначения
  assignedBy?: Types.ObjectId | IUser; // Кто назначил (обычно Supervisor)
  assignmentHistory?: Array<{
    assignedTo: Types.ObjectId | IUser;
    assignedRole: 'manager' | 'logist';
    assignedBy: Types.ObjectId | IUser;
    assignedAt: Date;
    reassignmentReason?: string; // Причина переназначения (если применимо)
    autoAssigned?: boolean; // Флаг автоматического назначения (при отклонении качества)
    autoAssignmentReason?: string; // Причина автоназначения
  }>;
}

// Элемент корзины
export interface ICartItem extends Document {
  _id?: Types.ObjectId; 
  product: Types.ObjectId | IProduct;
  quantity: number;
  price: number;
  companyId: Types.ObjectId | ICompany;
  addedAt: Date;
}

// Тип для элементов сделки на дашборде супервайзера
export interface IDashboardDeal extends IDeal {
  dashboardDealType: 'mainCustomerSale' | 'primarySupplierPurchase' | 'alternativeSupplierPurchase' | 'standaloneSupplierPurchase';
  counterpartyName: string;
  linkedToDealNumber: string | null;
}

// Blacklisted Certificate
export interface IBlacklistedCertificate extends Document {
  _id: Types.ObjectId;
  certificateNumber: string;
  reason: string;
  dealId?: Types.ObjectId | IDeal;
  addedBy: Types.ObjectId | IUser;
  createdAt: Date;
  updatedAt: Date;
}

// Расширение Express Request для включения поля пользователя
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        company?: Types.ObjectId | string; // Можно уточнить тип, если известен
        companyId?: string; // Add companyId for compatibility with existing code
        isLgdealSupervisor?: boolean;
        isLgdealIncStaff?: boolean;
        isLgdealAdmin?: boolean;
        isImpersonation?: boolean;
        originalUserId?: string;
        emailVerified?: boolean;
      };
    }
  }
}

// Интерфейс для статистики обработки инвентаря
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
    stockNumber?: string; 
    certificateNumber?: string;
    rawDataSource?: unknown;
    stack?: string;
    rawProduct?: unknown;
  }>;
}

// Типы для веб-сокетов (примеры)
export interface WebSocketMessage {
  // ... existing code ...
}

// Добавляем интерфейс IRequestDetails, используемый в контроллерах
export interface IRequestDetails {
  requestDate: Date;
  requestedBy: Types.ObjectId | IUser;
  notes?: string;
  rejectionReason?: string; // Если сделка может быть отклонена на этапе запроса
}

export interface DealStageStepperProps {
  currentStage: DealStage;
  dealStatus: string;
  currentStageOriginal: DealStage;
}

// DTO типы для API ответов
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "supervisor" | "manager" | "logist";
  isActive: boolean;
  company?: {
    id: string;
    name: string;
    status?: string;
    description?: string;
  };
  createdAt?: Date;
  isLgdealSupervisor?: boolean;
  /** Компания LGDeal INC — любая роль (внутренний каталог и пр.) */
  isLgdealIncStaff?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  lastLogin?: Date;
  companyId?: string;
  userId?: string; // Добавляем для совместимости
  telegramId?: string;
  notificationPrefs?: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
}

// Расширенный интерфейс для аутентифицированных пользователей
export interface AuthenticatedUser extends UserDto {
  isImpersonation?: boolean;
  originalUserId?: string;
}

// Тип для декодированного JWT токена
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  companyId?: string;
  isLgdealSupervisor?: boolean;
  isLgdealAdmin?: boolean;
  jti?: string; // JWT ID для отслеживания токенов
  iat?: number; // Issued at
  exp?: number; // Expiration time
}

// Типы для ошибок
export interface ApiError {
  message: string;
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

// Типы для пагинации
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

 