// --- User & Auth Types ---
/** @deprecated Prefer stonee_admin; kept for existing JWT/DB rows */
export type LegacyStoneeRole = 'stonee';

export type StoneeStaffRole = 'stonee_admin' | 'stonee_supervisor' | 'stonee_manager';

export type UserRole = 'buyer' | 'supplier' | StoneeStaffRole | LegacyStoneeRole;

/** What this supplier account primarily lists (for dashboards & routing). */
/** KYC for buyers (high-ticket checkout gate in order-service when enforced). */
export type KycStatus = 'not_required' | 'pending' | 'verified' | 'rejected';

export type SupplierCategory =
  | 'lab_grown_diamond'
  | 'natural_diamond'
  | 'colored_stone'
  | 'precious_metal'
  | 'mounting'
  | 'finished_jewelry'
  | 'general';

export const SUPPLIER_CATEGORY_LABELS: Record<SupplierCategory, string> = {
  lab_grown_diamond: 'Lab-grown diamonds',
  natural_diamond: 'Natural diamonds',
  colored_stone: 'Colored gemstones',
  precious_metal: 'Gold / silver / platinum (bullion & semi-finished)',
  mounting: 'Mountings & semi-mounts',
  finished_jewelry: 'Finished jewelry (earrings, rings, etc.)',
  general: 'Mixed / other',
};

export interface IUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  name?: string;
  /** Present when role === 'supplier' */
  supplierCategory?: SupplierCategory;
  /** Buyer KYC lifecycle; staff/supplier typically not_required. */
  kycStatus?: KycStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function isStoneeStaffRole(role: string | undefined | null): boolean {
  return (
    role === 'stonee' ||
    role === 'stonee_admin' ||
    role === 'stonee_supervisor' ||
    role === 'stonee_manager'
  );
}

/** All orders & pipeline (read). */
export function canViewAllOrders(role: string | undefined | null): boolean {
  return isStoneeStaffRole(role);
}

/** Change order status, supplier ingest, sensitive ops. */
export function canEditOrderStatus(role: string | undefined | null): boolean {
  return role === 'stonee' || role === 'stonee_admin' || role === 'stonee_supervisor';
}

/** Finance / margin views (placeholder tab). */
export function canViewFinanceTab(role: string | undefined | null): boolean {
  return role === 'stonee' || role === 'stonee_admin';
}

/** Run supplier sync / HTTP ingest (Stonee operations). */
export function canRunSupplierIngest(role: string | undefined | null): boolean {
  return role === 'stonee' || role === 'stonee_admin' || role === 'stonee_supervisor';
}

export function isSupplierRole(role: string | undefined | null): boolean {
  return role === 'supplier';
}

/** Supplier company membership role (B2B org). */
export type SupplierCompanyMemberRole = 'owner' | 'member';

/** Brief company row for JWT / auth responses (no secrets). */
export interface ISupplierCompanySummary {
  id: string;
  name: string;
  role: SupplierCompanyMemberRole;
  supplierCategory?: SupplierCategory;
}

/**
 * Stable catalog `supplierId` for a supplier **company** (Mongo ObjectId string).
 * All new ingest and listings should use this; never accept arbitrary client strings for ownership.
 */
export function catalogSupplierIdForCompany(companyId: string): string {
  const id = String(companyId).trim();
  return id ? `SUP-${id}` : 'SUP-UNKNOWN';
}

/**
 * @deprecated Legacy catalog rows used the supplier **user** Mongo id. Prefer {@link catalogSupplierIdForCompany}.
 * Kept for env fallbacks and one-off migrations.
 */
export function catalogSupplierIdForUser(userId: string): string {
  const id = String(userId).trim();
  return id ? `SUP-${id}` : 'SUP-UNKNOWN';
}
export type DiamondShape = 'Round' | 'Oval' | 'Emerald' | 'Princess' | 'Cushion' | 'Radiant' | 'Pear' | 'Asscher' | 'Marquise' | 'Heart';
export type DiamondColor = 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';
export type DiamondClarity = 'FL' | 'IF' | 'VVS1' | 'VVS2' | 'VS1' | 'VS2' | 'SI1' | 'SI2';
export type DiamondCut = 'Ideal' | 'Excellent' | 'Very Good' | 'Good' | 'Fair';
export type DiamondSymmetry = 'Excellent' | 'Very Good' | 'Good' | 'Fair';
export type DiamondFluorescence = 'None' | 'Faint' | 'Medium' | 'Strong' | 'Very Strong';
export type DiamondLab = 'IGI' | 'GIA' | 'GCAL';
export type DealBadge = 'BEST VALUE' | 'FAIR DEAL' | 'PREMIUM CUT' | 'OVERPRICED';

export interface IDiamond {
  id: string;              // Mongoose ID
  sku: string;             // Unique identifier across suppliers
  shape: DiamondShape;
  carat: number;
  color: DiamondColor;
  clarity: DiamondClarity;
  cut: DiamondCut;         // Note: Fancy shapes might not have a formal cut grade
  
  // Advanced Proportions (Crucial for Diamond Score)
  depthPercentage: number; 
  tablePercentage: number;
  symmetry: DiamondSymmetry;
  polish: DiamondSymmetry;
  fluorescence: DiamondFluorescence;
  measurements: string;    // e.g., "6.42 x 6.45 x 3.98"
  lxwRatio: number;        // Length to width ratio (important for ovals/emeralds)

  // Certification & Media
  lab: DiamondLab;
  certificateNumber: string;
  certificateUrl?: string; // Link to PDF
  videoUrl?: string;       // 360-degree video
  images: string[];

  // Pricing & Inventory
  supplierId: string;
  price: number;           // Our retail price
  supplierPrice: number;   // Wholesale cost (hidden from frontend)
  availability: 'in-stock' | 'reserved' | 'sold';
  
  // Intelligence System
  diamondScore?: number;   // 0-100 calculated score
  dealBadge?: DealBadge;
  
  createdAt: Date;
  updatedAt: Date;
}

export type MetalType = 'Gold14K' | 'Gold18K' | 'Platinum';
export type MetalColor = 'Yellow' | 'White' | 'Rose';

// --- Jewelry & Setting taxonomy (single source of truth, see info/JEWELRY_SETTINGS.md) ---

export type JewelryCategory = 'Ring' | 'Earrings' | 'Necklace' | 'Bracelet';

export type SettingStyle = 'Solitaire' | 'Halo' | 'Pavé' | 'Side-stone' | 'Three-stone';

export type SettingType =
  | 'Prong'
  | 'Bezel'
  | 'Channel'
  | 'Pavé'
  | 'Peg'
  | 'Screw'
  | 'Tennis'
  | 'Invisible';

export interface SettingTypeInfo {
  label: string;
  tagline: string;
  compatibleCategories: JewelryCategory[];
  compatibleShapes: DiamondShape[];
  pros: string[];
  cons: string[];
}

export const SETTING_TYPE_INFO: Record<SettingType, SettingTypeInfo> = {
  Prong: {
    label: 'Prong',
    tagline: 'Four to six delicate claws cradle the stone — the brightest light path.',
    compatibleCategories: ['Ring', 'Earrings', 'Necklace'],
    compatibleShapes: ['Round', 'Oval', 'Cushion', 'Princess', 'Emerald', 'Pear', 'Marquise', 'Heart', 'Asscher', 'Radiant'],
    pros: ['Maximum light return', 'Showcases the diamond fully'],
    cons: ['Claws may catch on fabric', 'Periodic re-tightening needed'],
  },
  Bezel: {
    label: 'Bezel',
    tagline: 'A soft metal frame embraces the stone — secure and modern.',
    compatibleCategories: ['Ring', 'Earrings', 'Necklace', 'Bracelet'],
    compatibleShapes: ['Round', 'Oval', 'Cushion', 'Emerald', 'Asscher', 'Radiant', 'Pear', 'Marquise', 'Heart', 'Princess'],
    pros: ['Excellent protection', 'Smooth, snag-free surface'],
    cons: ['Covers part of the stone', 'Slightly less brilliance'],
  },
  Channel: {
    label: 'Channel',
    tagline: 'Stones nest between two metal walls — a continuous river of light.',
    compatibleCategories: ['Ring', 'Bracelet'],
    compatibleShapes: ['Princess', 'Emerald', 'Asscher', 'Radiant'],
    pros: ['Stones sit flush', 'No snagging — perfect for daily wear'],
    cons: ['Difficult to repair or resize', 'Single-stone replacement is hard'],
  },
  'Pavé': {
    label: 'Pavé',
    tagline: 'Tiny diamonds set so close, the metal disappears under sparkle.',
    compatibleCategories: ['Ring', 'Earrings', 'Necklace', 'Bracelet'],
    compatibleShapes: ['Round'],
    pros: ['Diamond-dust effect', 'Maximum surface sparkle'],
    cons: ['Small stones can dislodge under impact'],
  },
  Peg: {
    label: 'Peg',
    tagline: 'A discrete post passes through a drilled gem — the way of pearls.',
    compatibleCategories: ['Ring', 'Earrings', 'Necklace'],
    compatibleShapes: [],
    pros: ['Required for drilled stones (pearls, beads)'],
    cons: ['Not suitable for traditional faceted diamonds'],
  },
  Screw: {
    label: 'Screw',
    tagline: 'A jewel held by a discrete screw — interchangeable, heirloom-ready.',
    compatibleCategories: ['Ring', 'Necklace'],
    compatibleShapes: ['Round', 'Oval', 'Emerald', 'Cushion'],
    pros: ['Stone is removable / interchangeable'],
    cons: ['Heavier metalwork', 'Vintage look — not for minimalist tastes'],
  },
  Tennis: {
    label: 'Tennis',
    tagline: 'Four prongs per stone, joined into one endless line of brilliance.',
    compatibleCategories: ['Bracelet', 'Necklace'],
    compatibleShapes: ['Round'],
    pros: ['Seamless ribbon of light', 'Iconic silhouette'],
    cons: ['Single shape and calibrated size only'],
  },
  Invisible: {
    label: 'Invisible',
    tagline: 'No visible metal — stones float as a single monolithic surface.',
    compatibleCategories: ['Ring', 'Earrings', 'Necklace'],
    compatibleShapes: ['Princess', 'Asscher'],
    pros: ['Continuous-stone effect', 'Highest perceived value'],
    cons: ['Very labor-intensive', 'Requires perfectly calibrated stones'],
  },
};

// Lightweight inference for legacy data that has only `style` and no `settingType`.
const SETTING_STYLE_TO_TYPE: Record<SettingStyle, SettingType> = {
  Solitaire: 'Prong',
  Halo: 'Prong',
  'Pavé': 'Pavé',
  'Side-stone': 'Prong',
  'Three-stone': 'Prong',
};

export const inferSettingType = (style: SettingStyle): SettingType => SETTING_STYLE_TO_TYPE[style];

export interface ISetting {
  id: string;
  sku: string;
  name: string;
  style: SettingStyle;
  /** Physical setting technique. Optional for backward-compat with legacy seeds. */
  settingType?: SettingType;
  /** Which jewelry categories this mount can be used in. Optional — falls back to ['Ring']. */
  category?: JewelryCategory;
  metal: MetalType;
  color: MetalColor;
  price: number;
  compatibleShapes: DiamondShape[];
  images: string[];
}

export interface IJewelry {
  id: string;
  sku: string;
  title: string;
  description: string;
  collectionName: string;
  category: JewelryCategory;
  price: number;
  metal: MetalType;
  color: MetalColor;
  mainStoneId?: string; // If it includes a stone
  images: string[];
}

export interface ISupplier {
  id: string;
  name: string;
  location: string;
  apiUrl?: string;
  contactEmail: string;
  markupPercentage: number; // For automatic pricing
  isActive: boolean;
}

export interface IFeedLog {
  id: string;
  supplierId: string;
  timestamp: Date;
  status: 'pending' | 'success' | 'failed';
  recordCount: number;
  errorMessage?: string;
}

// --- Order & Cart Types ---

export interface IBespokePair {
  diamondId: string;
  settingId: string;
}

export interface ICartItem {
  id: string;
  type: 'diamond' | 'setting' | 'jewelry' | 'bespoke';
  productId: string; // The primary ID
  bespokePair?: IBespokePair;
  price: number;
  quantity: number;
}

export interface ICart {
  userId?: string;
  sessionId: string;
  items: ICartItem[];
  totalAmount: number;
}
