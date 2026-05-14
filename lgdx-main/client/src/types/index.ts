// ==========================================================================
// SERVER DTO TYPES (what server sends)
// ==========================================================================

// Enum для ролей компаний
import { DiamondShape } from '../i18n/types'

export enum CompanyRole {
  SELLER = 'seller',
  BUYER = 'buyer',
  BOTH = 'both'
}

// Server User DTO
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  isActive: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  company?: CompanyDto;
  isLgdealSupervisor?: boolean;
  /** Сервер: компания LGDeal INC (любая роль внутреннего персонала) */
  isLgdealIncStaff?: boolean;
  createdAt?: Date | string;
  lastLogin?: Date | string;
  // Server may include this marker when session is impersonation
  isImpersonation?: boolean;
  telegramId?: string;
  notificationPrefs?: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
}

// Server Company DTO
export interface CompanyDto {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

// ==========================================================================
// CLIENT TYPES (what client uses internally)
// ==========================================================================

// Пользователь
export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  phoneVerified?: boolean;
  companyName?: string;
  company: Company | string; // Can be populated or just an ID
  role: 'admin' | 'supervisor' | 'manager' | 'logist';
  isLgdealSupervisor?: boolean;
  isLgdealIncStaff?: boolean;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  deals?: Deal[] | string[]; // Can be populated or just IDs
  cart?: CartItem[]; // Cart items with products
  status?: 'Active' | 'Pending' | 'Inactive'; // Add status for team management - including Inactive
  invitationId?: string; // Add invitationId for team management
  // Present only for display purposes
  isImpersonation?: boolean;
  /** Set when user has linked Telegram (for password reset etc.) */
  telegramId?: string;
  /** Per-channel toggles for transactional notifications about deal events. */
  notificationPrefs?: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
}

// Компания
export interface Company {
  _id: string;
  name: string;
  description?: string;
  status?: 'pending_review' | 'active' | 'rejected' | 'suspended';
  users?: Array<{
    user: string | User; // ObjectId или полностью загруженный User
    role: string;
    isActive: boolean;
    _id?: string;
  }>;
  // Роли компании (seller, buyer, both)
  roles?: CompanyRole[];
  details?: CompanyDetails;
  // Per-company payment method toggles (mirrors server ICompany.paymentSettings)
  paymentSettings?: {
    stripeEnabled?: boolean;
  };
  apiConfig?: string; // ObjectId для CompanyApiConfig
  reviewedAt?: string;
  reviewedBy?: string | User; // ObjectId или полностью загруженный User
  createdAt?: string;
  updatedAt?: string;
}

// ==========================================================================
// TYPE CONVERSION UTILITIES
// ==========================================================================

// Convert UserDto to User
export function userDtoToUser(dto: UserDto): User {
  return {
    _id: dto.id,
    email: dto.email,
    firstName: dto.firstName,
    lastName: dto.lastName,
    phone: dto.phone,
    phoneVerified: dto.phoneVerified,
    role: dto.role as 'admin' | 'supervisor' | 'manager' | 'logist',
    isLgdealIncStaff: dto.isLgdealIncStaff,
    // LGDEAL supervisor access is derived from company + role in AuthContext, not from server flag
    isActive: dto.isActive,
    emailVerified: dto.emailVerified,
    company: dto.company ? companyDtoToCompany(dto.company) : '',
    createdAt: dto.createdAt ? (typeof dto.createdAt === 'string' ? dto.createdAt : dto.createdAt.toISOString()) : undefined,
    lastLogin: dto.lastLogin ? (typeof dto.lastLogin === 'string' ? dto.lastLogin : dto.lastLogin.toISOString()) : undefined,
    isImpersonation: dto.isImpersonation,
    telegramId: dto.telegramId,
    notificationPrefs: dto.notificationPrefs,
  };
}

// Convert CompanyDto to Company
export function companyDtoToCompany(dto: CompanyDto): Company {
  return {
    _id: dto.id,
    name: dto.name,
    description: dto.description,
    status: dto.status as 'pending_review' | 'active' | 'rejected' | 'suspended' | undefined,
  };
}

// Детали компании
export interface CompanyDetails {
  phone?: string;
  email?: string;
  website?: string;
  companyCountry?: string;
  technology?: string;
  logo?: {
    url?: string;
    filename?: string;
  };
  legalAddress?: Address;
  actualAddress?: Address;
  shippingAddress?: Address;
  bankInformation?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    swiftCode?: string;
    bankAddress?: string;
    correspondentBank?: {
      accountName?: string;
      bankName?: string;
      accountNumber?: string;
      swiftCode?: string;
      bankAddress?: string;
    };
  };
  taxInformation?: {
    taxId?: string;
    vatNumber?: string;
    worksWithVat?: boolean;
  };
}

// Адрес
export interface Address {
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvinceRegion?: string;
  postalCode?: string;
  building?: string;
  office?: string;
}

// Продукт
export interface Product {
  _id: string;
  stockId?: string;
  stockNum?: string;
  customId?: string;
  // certificateId is deprecated, use certificateNumber instead
  certificateId?: string;
  company?: string | Company;
  shape?: DiamondShape;
  carat?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  polish?: string;
  symmetry?: string;
  fluorescence?: string;
  lab?: string;
  price?: number;
  pricePerCarat?: number;
  measurement1?: number;
  measurement2?: number;
  measurement3?: number;
  ratio?: number;
  table?: number;
  depth?: number;
  videoLink?: string;
  video?: string;
  photo?: string;
  certificateLink?: string;
  description?: string;
  status?: 'available' | 'OnDeal' | 'Sold' | 'reserved' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
  
  marketPrice?: number;
  marketPricePerCarat?: number;

  // Additional properties used in the application
  certificateNumber?: string;
  certificateInstitute?: string;
  location?: string;
  
  // Diamond-specific properties
  technology?: string;  // e.g., "HPHT"
  tableSize?: number;   // Table size percentage
  crownHeight?: number; // Crown height percentage
  pavilionDepth?: number; // Pavilion depth percentage
  girdle?: string;      // Girdle description
  culet?: string;       // Culet description
  totalDepth?: number;  // Total depth percentage

  // Fancy (colored) stone attributes
  intensity?: string;   // e.g. "Fancy vivid", "Fancy intense"
  overtone?: string;   // e.g. "Orangey Yellow", "Pink"
}

// Элемент корзины
export interface CartItem {
  product: Product;
  quantity: number;
  addedAt: string;
}

export type DealStage = 'request' | 'payment_delivery' | 'completed' | 'cancelled';
export type StageStatus = 'completed' | 'active' | 'pending' | 'cancelled';

export interface DealStageStepperProps {
  currentStage: DealStage;
  dealStatus: string;
  currentStageOriginal: DealStage;
}

// Deal Enums (matching server exactly)
export type DealStatus =
  'pending' | 'rejected' | 'cancelled' |
  'awaiting_invoice' | 'invoice_pending' | 'awaiting_payment' |
  'alternative_product_proposed' |
  'payment_received' | 'shipped' | 'completed' |
  'shipping_documents_uploaded' | 'delivery_confirmed' |
  'payment_pending' | 'awaiting_shipping_documents' | 'invoice_accepted' |
  // LGDEAL Internal Workflow statuses
  'assigned_to_manager' | 'quality_check_in_progress' | 'quality_approved' | 'quality_rejected' | 'ready_for_shipping';

export type DealType = 'buyer-to-lgdeal' | 'lgdeal-to-seller';

export interface Deal {
  _id: string;
  dealNumber: string;
  status: DealStatus;
  stage: DealStage;
  dealType: DealType;
  amount: number; // Primary amount field (unified from totalAmount)
  fee?: number;
  currency?: string;
  createdAt: string;
  updatedAt?: string;
  lastActionAt?: string;
  completedAt?: string;
  linkedToDealNumber?: string | null;
  
  // Company references (can be populated or just ObjectIds)
  buyerCompanyId?: Company | string;
  sellerCompanyId?: Company | string;
  lgdealCompanyId?: Company | string;
  
  // User references (can be populated or just ObjectIds)
  buyerId?: User | string;
  sellerId?: User | string;
  
  // Deal relationships
  pairedDealId?: string;
  pairedDealIds?: string[];
  
  // UI/computed fields
  isDirectLgdealDeal?: boolean;
  userRole?: string;
  allowedActions?: string[];
  dashboardDealType?: 'mainCustomerSale' | 'primarySupplierPurchase' | 'alternativeSupplierPurchase' | 'standaloneSupplierPurchase';
  counterpartyName?: string;
  
  // Optional extended fields (for detail views)
  products?: DealProduct[];
  activityLog?: ActivityLogEntry[];
  negotiationDetails?: NegotiationDetails;
  shippingDetails?: ShippingDetails;
  paymentDetails?: PaymentDetails;
  requestDetails?: RequestDetails;
  notes?: string;
  cancellationReason?: string;
  dealState?: DealStateInfo;
  
  // LGDEAL Internal Workflow fields
  assignedTo?: User | string; // Manager или Logist которому назначена сделка
  assignedRole?: 'manager' | 'logist'; // Роль назначенного пользователя
  assignedAt?: string; // Дата назначения
  assignedBy?: User | string; // Кто назначил (обычно Supervisor)
  assignmentHistory?: Array<{
    assignedTo: User | string;
    assignedRole: 'manager' | 'logist';
    assignedBy: User | string;
    assignedAt: string;
    reassignmentReason?: string; // Причина переназначения (если применимо)
    autoAssigned?: boolean; // Флаг автоматического назначения (при отклонении качества)
    autoAssignmentReason?: string; // Причина автоназначения
  }>;
  
  // Deprecated fields (keep for backward compatibility)
  totalAmount?: number; // Use amount instead
}

export interface ProductStatusInfo {
  productId: string;
  status: 'selected' | 'pending' | 'available' | 'not_confirmed' | 'completed_not_found' | 'pending_approval' | 'not_available' | 'error';
  displayStatus: string;
  canSelect: boolean;
  shippingCost?: number;
  purchaseShippingCost?: number;
  saleShippingCost?: number;
  purchasePrice?: number;
}

export interface DealStateInfo {
  userRole: string;
  allowedActions: string[];
  isDirectLgdealDeal: boolean;
  productStatuses: ProductStatusInfo[];
  waitingMessage: string;
}

// Supporting interfaces for Deal
export interface DealProduct {
  _id: string;
  product: Product;
  price: number;
  marketPriceAtInitiation?: number;
  quantity?: number;
  originalProductStruckOut?: boolean;
  originalProductDetailsBeforeSwap?: Product;
  originalPriceBeforeSwap?: number;
  originalShippingCostBeforeSwap?: number;
  selectedAlternativeProduct?: Product | string;
  suggestedAlternatives?: SuggestedAlternative[];
  

}

export interface SuggestedAlternative {
  product: Product;
  pairedLgdealToSellerDealId?: {
    status: string;
    stage: string;
  };
}

export interface ActivityLogEntry {
  timestamp: string;
  action: string;
  details?: string;
  performedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
}

export interface ProposedTermProductItem {
  product: Product;
  price: number;
  originalPrice: number;
  discountPercent: number;
}

export interface ProposedTerm {
  proposedBy: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  proposedDate: string;
  price?: number;
  shippingCost?: number;
  deliveryTerms?: string;
  additionalTerms?: string;
  products?: ProposedTermProductItem[];
}

export interface FinalTerms {
  price?: number;
  shippingCost?: number;
  deliveryTerms?: string;
  additionalTerms?: string;
  acceptedDate?: string;
}

export interface NegotiationDetails {
  proposedTerms?: ProposedTerm[];
  finalTerms?: FinalTerms;
}

export interface ShippingAddress {
  recipientName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvinceRegion?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

export interface ShippingDetails {
  cost?: number;
  /** Import tariff / duty cost (buyer-to-lgdeal only); shown to buyer. */
  importTariff?: number;
  trackingNumber?: string;
  carrier?: string;
  deliveredDate?: string;
  shippingAddress?: ShippingAddress;
}

export interface RejectedInvoice {
  originalFilename?: string;
  reason: string;
  date: string;
  rejectedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
}

export interface PaymentDetails {
  method?: string; // 'bank_transfer' | 'stripe'
  status?: string;
  reference?: string;
  invoiceUrl?: string;
  invoiceFilename?: string;
  rejectedInvoices?: RejectedInvoice[];
  // Поле для отслеживания, какая компания загрузила инвойс
  uploadedByCompany?: string; // ID или название компании
  
  // Stripe-specific fields
  stripePaymentIntentId?: string;
  stripeClientSecret?: string;
  stripeStatus?: string;
  stripeChargeId?: string;
  stripeRefundId?: string;
}

export interface RequestDetails {
  rejectionReason?: string;
}

// Контекст аутентификации
export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (login: string, password: string) => Promise<boolean>;
  register: (userData: RegisterUserData) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  setAuthError: (errorMessage: string) => void;
  setUser: (user: User | null) => void;
  isLgdealSupervisor: boolean;
  /** Компания LGDeal INC — любая роль (бэкенд: isLgdealIncStaff / каталог) */
  isLgdealIncStaff: boolean;
  impersonate: (targetUserId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
  isImpersonating: boolean;
}

export interface RegisterUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName?: string;
  companyRole?: CompanyRole;
}

export interface RegisterResult {
  success: boolean;
  user?: User;
  error?: string;
}

// API response types
export interface AuthResponse {
  token: string;
  user: UserDto;
} 