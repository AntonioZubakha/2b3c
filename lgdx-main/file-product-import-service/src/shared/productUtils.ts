import { Types } from 'mongoose';
import Product, { IProduct } from '../models/Product';
import { importDuplicatesCounter } from '../metrics';
import { logger } from './logger';

export interface ProductProcessingStats {
    totalUploaded: number;
    processed: number;
    created: number;
    updated: number;
    skippedByBlacklist: number;
    skippedByDuplicateInSource: number;
    skippedExistingOnDealOrSold: number;
    skippedInvalidStatus: number;
    skippedInvalidColor: number;
    skippedInvalidClarity: number;
    skippedInvalidPrice: number;
    skippedInvalidCarat: number;
    skippedMissingMedia: number;
    skippedMissingCertNumber: number;
    skippedNotLabGrown: number;
    skippedAnomalousPricePerCarat: number;
    apiErrors: number;
    skippedByApiFilter: number;
    replacedOtherCompanyProduct: number;
    skippedCheaperExistsOtherCompany: number;
    deletedStale: number;
    skippedInvalidData?: number;
    totalAfterDedup?: number;
    prefetchedExisting?: number;
    errors: Array<{ message: string; certificateNumber?: string; stack?: string; [key: string]: unknown }>;
    totalFromApi?: number;
    duration?: string;
}

interface ExistingProductCacheEntry {
    _id: Types.ObjectId;
    company: Types.ObjectId;
    isOnDealOrSold?: boolean;
    onDeal?: boolean;
    sold?: boolean;
}

// --- Constants for Validation ---
const MIN_PRICE = 0;
const MAX_PRICE = 150000;
/** Minimum supplier price (USD); products below this are skipped */
const MIN_SUPPLIER_PRICE = Number(process.env.MIN_SUPPLIER_PRICE) || 15;
const MIN_CARAT = 0.3;
const MAX_CARAT = 100;
const ALLOWED_CLARITIES = ['VS2', 'VS1', 'VVS2', 'VVS1', 'IF', 'FL'];
const ANOMALOUS_PPC_LIMIT_1_CARAT = 500;
const ANOMALOUS_PPC_LIMIT_5_CARAT = 4000;
const ANOMALOUS_PPC_LIMIT_10_CARAT = 15000;
const ANOMALOUS_PPC_LIMIT_OVER_10_CARAT = 30000;

// Valid values for validation
/** White (colorless) grades accepted for import: D–G only. Fancy colors are validated separately. */
const VALID_COLORS = ['D', 'E', 'F', 'G'];
const VALID_CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'];

// --- Fancy (colored) diamond support (aligned with DiamondField.php / LgdealProductMapperDto.php) ---
const WHITE_COLOR_GRADES = ['D', 'E', 'F', 'G'];
const FANCY_COLOR_NAMES = ['Yellow', 'Pink', 'Blue', 'Green', 'Red', 'Purple', 'Orange', 'Violet', 'Gray', 'Black', 'Brown', 'Champagne', 'Cognac', 'Chameleon', 'Other'];
const FANCY_INTENSITY_NAMES = ['Faint', 'Very light', 'Light', 'Fancy light', 'Fancy', 'Fancy dark', 'Fancy intense', 'Fancy vivid', 'Fancy deep', 'Other'];
const FANCY_OVERTONE_NAMES = ['Red', 'Orangey Red', 'Reddish Orange', 'Pink', 'Pinkish Orange', 'Orange', 'Yellowish Orange', 'Yellow Orange', 'Orangey Yellow', 'Yellow', 'Yellow Brown', 'Greenish Yellow', 'Green Yellow', 'Yellow Green', 'Yellowish Green', 'Brown Greenish Yellow', 'Gray Greenish Yellow', 'Gray Yellowish Green', 'Gray Green', 'Green', 'Bluish Green', 'Blue Green', 'Green Blue', 'Greenish Blue', 'Blue', 'Violetish Blue', 'Bluish Violet', 'Other'];

const isWhiteColorGrade = (value: string): boolean => {
  const v = value.trim().toUpperCase();
  return v.length === 1 && WHITE_COLOR_GRADES.includes(v);
};

const isGenericFancyPlaceholder = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return v === 'fancy' || v === 'fancy color' || v === 'fc' || v === 'fancy colour';
};

const isFancyColor = (value: string): boolean => {
  if (!value || !value.trim()) return false;
  const v = value.trim();
  if (isWhiteColorGrade(v)) return false;
  const lower = v.toLowerCase();
  if (lower.includes('fancy')) return true;
  return FANCY_COLOR_NAMES.some(c => lower.includes(c.toLowerCase()));
};

const normalizeWhiteColorRange = (value: string): string => {
  const v = value.trim().toUpperCase();
  const rangeMatch = v.match(/^([A-Z])-?[A-Z]$/);
  if (rangeMatch) return rangeMatch[1];
  return v;
};

interface ParsedFancyColor { color: string; intensity: string; overtone: string; }
const toIntensityPattern = (): string => {
  const sorted = [...FANCY_INTENSITY_NAMES].sort((a, b) => b.length - a.length);
  return sorted.map(s => s.replace(/\s+/g, '\\s+')).join('|');
};
const parseFancyColorString = (value: string): ParsedFancyColor => {
  const v = value.trim();
  const intensityPat = toIntensityPattern();
  const colorPat = FANCY_COLOR_NAMES.filter(c => c !== 'Other').join('|');
  const matchIntensityColor = v.match(new RegExp(`^(${intensityPat})\\s+(${colorPat})$`, 'i'));
  if (matchIntensityColor) return { color: matchIntensityColor[2].trim(), intensity: matchIntensityColor[1].trim(), overtone: 'Other' };
  const overtonePat = [...FANCY_OVERTONE_NAMES].sort((a, b) => b.length - a.length).map(s => s.replace(/\s+/g, '\\s+')).join('|');
  const matchIntensityOvertoneColor = v.match(new RegExp(`^(${intensityPat})\\s+(${overtonePat})\\s+(${colorPat})$`, 'i'));
  if (matchIntensityOvertoneColor) return { color: matchIntensityOvertoneColor[3].trim(), intensity: matchIntensityOvertoneColor[1].trim(), overtone: matchIntensityOvertoneColor[2].trim() };
  const matchIntensityOvertone = v.match(new RegExp(`^(${intensityPat})\\s+(${overtonePat})$`, 'i'));
  if (matchIntensityOvertone) return { color: v, intensity: matchIntensityOvertone[1].trim(), overtone: matchIntensityOvertone[2].trim() };
  return { color: v, intensity: 'Other', overtone: 'Other' };
};

// Default values
const DEFAULT_VALUES = {
  STRING: '',
  NUMBER: 0,
  BOOLEAN: false,
};

const INVALID_CERTIFICATE_NUMBERS = new Set([
  'NON',
  'NONE',
  'N/A',
  'NA',
  'NULL',
  'NIL',
  '-',
  '--',
  '0',
  '00',
  '000',
  '0000',
  'UNKNOWN',
  'TBD',
]);

// Shape mapping for normalization. Canonical form: Title Case (Round, Oval, …).
// Keep aligned with server/src/utils/productUtils.ts and api-product-sync SHAPE_MAPPING for consistency.
const SHAPE_MAPPING: Record<string, string[]> = {
  'Round': ['RD', 'RB', 'RBC', 'B', 'BR', 'RN', 'RND', 'BRILLIANT', 'raund', 'ROUND', 'Round', 'R', 'Round Brilliant'],
  'Oval': ['OV', 'OB', 'O', 'OMB', 'OVL', 'OVEL', 'S.OVAL', 'OMB', 'Ashoka', 'STEP OVAL', 'OVAL MODIFIED', 'OMB', 'Oval Polygon Step', 'Oval Step', 'OVAL', 'Oval', 'OV/L', 'Oval Modified', 'Oval Brilliant'],
  'Pear': ['P', 'PSH', 'PB', 'PS', 'PMB', 'PB*', 'PE', 'SGP-100', 'PR', 'Pear Modified', 'PEAR', 'Pear', 'Pear Shape', 'Pear Brilliant', 'PS', 'PEAR SHAPE'],
  'Cushion': ['CU CRISS', 'CB', 'C', 'CUN', 'CUS', 'CUSH', 'CU', 'CS', 'SQ Cushion', 'S CUSHION', 'SQ CU', 'sq.cushion', 'CUSHION BRLN', 'CUSHION MODIFIED', 'CM', 'S.CUSHION', 'SQ. CUSHION MODIFIED', 'LONG CUSHION', 'CM-4', 'CMB', 'CU-M', 'Cushion mod', 'L.CUS', 'Long cushion', 'SQ.CUSHION MB', 'SQ. CUSHION BRILLIAN', 'CUSHION LONG', 'CUSHION BRILLANT', 'SQ.CUSHION BRILLANT', 'CUSHION MODIFIED BRILLANT', 'Cushion Mixed', 'Elongated cusion', 'SQUARE CUSHION MODIFIED', 'SQ.CB', 'Cushion Square', 'CUSIHON BRSQ', 'SQ. CU', 'L.V.Cushion', 'Rectangular Cushion Antique', 'RECTANGULAR CUSHION MIXED CUT', 'CUSHION ANTIQUE BRILLIANT', 'CUSHION', 'Cushion', 'CUS', 'Cushion Brilliant', 'Cushion Modified Brilliant', 'Elongated Cushion'],
  'Radiant': ['RA', 'RAD', 'R', 'RC', 'RDN', 'CRB', 'RCRB', 'RADI', 'LG.RAD', 'LR', 'RADIANTB', 'RN', 'Rediant', 'CSMB', 'SQ.RADIANT', 'SQUARE RADIANT', 'SQUERE RADIANT', 'LONG RADIANT', 'L RADIANT', 'SQ RAD', 'S L.Radiant', 'L.Radiant', '.V.L. Radiant', 'cornered rectangular modified', 'cornered rectangular', 'cornered modified', 'rectangular', 'rectangular modified', 'RADIANT', 'Radiant', 'RAD', 'Radiant Cut', 'Square Radiant', 'Rectangular Radiant'],
  'Asscher': ['AS', 'A', 'CSS', 'CSSC', 'AC', 'Assher', 'ACCER', 'SQ.EMERALD', 'SEM', 'SE', 'ASHER', 'ASH', 'ASSCHER', 'Asscher', 'Asher', 'ASSCH', 'Asscher Cut'],
  'Princess': ['PS', 'PRN', 'PRIN', 'PN', 'PC', 'PRI', 'SMB', 'BEZEL PRINCESS', 'Rectangular Princess', 'PRINCESS', 'Princess', 'PR', 'Princess Cut', 'Square Princess', 'SQ. PRINCESS'],
  'Emerald': ['EM', 'EMRALD', 'E', 'EC', 'EMR', 'EMERALD 4STEP', 'ASYMEMERALD4S', 'EM-HD', 'MODIFIED EMERALD', 'EMERALD MODIFIED', 'Square Emerald', 'SQEM', 'SQ EM', 'SQ-EM', 'SQ.EM', 'Sq.emerald', 'SQE', 'SQ EMD', 'S.EM', 'S.EMERALD', 'Sq.Emerald', 'SQ EMERALD', 'EMERALD', 'Emerald', 'EM', 'Emerald Cut', 'Octagonal Emerald', 'Rectangular Emerald'],
  'Baguette': ['BA', 'BAG', 'BG', 'BT', 'RC', 'RSC', 'BAGUETTE', 'Baguette', 'BAG', 'Step Cut Baguette', 'Straight Baguette', 'Tapered Baguette'],
  'Marquise': ['MQ', 'MQB', 'M', 'MB', 'MAQ', 'MARQUISH', 'MARQ', 'S.MARQUISE', 'MQS', 'Marquise Modified', 'Marquise Step', 'MARQUISE', 'Marquise', 'MAR', 'Marquise Brilliant', 'MS'],
  'Heart': ['HT', 'HS', 'H', 'MHRC', 'MHB', 'HB', 'HE', 'S.HEART', 'ROSE HEART', 'HRT JODI', 'Heart-P8-P8', 'HRT', 'Heart Modified', 'HEART', 'Heart', 'Heart Shape', 'Heart Brilliant'],
  'Trillion': ['Tr', 'Trill', 'TRILLION', 'Trillion', 'TR', 'Trilliant', 'Trillian', 'Triangle', 'TRI', 'Triangular Brilliant', 'Triangular', 'Triangular Modified Brilliant'],
  'Other': ['MODIFIED SHIELD STEP CUT', 'HALFMOON', 'X-TREE', 'TURTLE', 'TULIP', 'PANTHER', 'OV-ROSE', 'MAHAVIR', 'KITE-FLAT', 'KING', 'ICE CREAM', 'HORSE', 'HAMSA', 'GOAT', 'GANPATI', 'FLORO', 'FISH TAIL', 'FISH', 'FIRE', 'EURO CUT', 'EM-ROSE', 'CARRE', 'CADILLAC', 'ALPHABET', 'cut cornered rectangular mixed cut', 'PENS', 'PENTAGON STEP', 'PIE', 'MODIFIED PIE MIXED', 'KITE', 'tapered', 'PENTAGON', 'Modified Octagon Step', 'Cornered Rectangular Modified', 'Hexagonal Step', 'HFM (Half moon) shape', 'HFM', 'CARR', 'HEXAGONE', 'Criss EM', 'round cornered modified', 'Heptagonal Step', 'Old Euro', 'Old European', 'CAPRI', 'HARMONIA', 'FUSION', 'OLD EUROPEAN', 'Old European shape', 'Old mine', 'Old mine2', 'OLD MINE 2', 'Long kite', 'SCB', 'CMB', 'BRIOLETTE', 'BCM', 'SE MARQUISE', 'SEQ', 'Criss EM', 'ASHOKA', 'CRISS', 'CM-B', 'TEPPER', 'RTG', 'CRMB', 'RECTANGLE', 'RCRMB', 'Shield', 'SH', 'Square', 'SQ', 'MSB', 'MDSQB', 'SQUAR MOD', 'Star', 'S', 'ST', 'Trapezoid', 'TP', 'TRAP', 'TRAPB', 'TZ', 'Trapeze', 'X', 'BAT', 'FXS', 'BUTTERFLY', 'Pentagonal', 'PEN', 'SX', 'SEM', 'Tapered Baguette', 'TBAG', 'Tapered Bullet', 'TBU', 'Briolette', 'BRIO', 'BRIOLET', 'Bullets', 'BU', 'CUX', 'CM', 'CRC', 'CSC', 'CX', 'SCMB', 'SCX', 'CSMB', 'EuropeanCut', 'EU', 'European', 'Flanders', 'FL', 'FC', 'Half Moon', 'HM', 'HMB', 'Hexagonal', 'HEX', 'HEXA', 'Hexagon', 'Kite', 'K', 'KT', 'Lozenge', 'LOZ', 'Octagonal', 'Octagonal Modified', 'OC', 'Octagon', 'Old Miner', 'OM', 'Old Mine Round', 'Oval Leo', 'Marquise Leo', 'OTHER', 'Other', 'Unique', 'Special', 'Fancy', 'Custom', 'Irregular', 'Mixed', 'Specialty', 'Miscellaneous', 'Old Mine']
};

// Pre-computed Reverse Map for Shape Normalization
const SHAPE_REVERSE_MAP = new Map<string, string>();
for (const [standardShape, variations] of Object.entries(SHAPE_MAPPING)) {
  SHAPE_REVERSE_MAP.set(standardShape.toUpperCase(), standardShape);
  for (const variation of variations) {
    SHAPE_REVERSE_MAP.set(variation.toUpperCase(), standardShape);
  }
}

// --- Market price cache: category enums (aligned with api-product-sync and market-price-calculator) ---
export enum ShapeCategory {
  ROUND = 'ROUND',
  OVAL = 'OVAL',
  PEAR = 'PEAR',
  CUSHION = 'CUSHION',
  EMERALD = 'EMERALD',
  RADIANT = 'RADIANT',
  PRINCESS = 'PRINCESS',
  MARQUISE = 'MARQUISE',
  HEART = 'HEART',
  ASSCHER = 'ASSCHER',
  FANCY = 'FANCY',
}

export enum WeightCategory {
  W_0_00_0_29 = '0.00-0.29',
  W_0_30_0_59 = '0.3-0.59',
  W_0_60_0_99 = '0.6-0.99',
  W_1_00_1_39 = '1-1.39',
  W_1_40_1_79 = '1.4-1.79',
  W_1_80_2_19 = '1.8-2.19',
  W_2_20_2_59 = '2.2-2.59',
  W_2_60_2_99 = '2.6-2.99',
  W_3_00_3_49 = '3-3.49',
  W_3_50_3_99 = '3.5-3.99',
  W_4_00_4_99 = '4-4.99',
  W_5_00_5_99 = '5-5.99',
  W_6_00_6_99 = '6-6.99',
  W_7_00_7_99 = '7-7.99',
  W_8_00_8_99 = '8-8.99',
  W_9_00_9_99 = '9-9.99',
  W_10_00_11_99 = '10-11.99',
  W_12_00_14_99 = '12-14.99',
  W_15_00_24_99 = '15-24.99',
  W_25_00_50_00 = '25-50',
  W_50_01_100_00 = '50.01-100',
  W_100_01_PLUS = '100.01+',
}

export enum ClarityCategory {
  FL = 'FL',
  IF = 'IF',
  VVS1 = 'VVS1',
  VVS2 = 'VVS2',
  VS1 = 'VS1',
  VS2 = 'VS2',
}

/** White (D–G) only; fancy colors have no market-price category. */
export enum ColorCategoryEnum {
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G',
}

export function determineShapeCategory(shape: string): ShapeCategory {
  const n = (shape || '').trim().toUpperCase();
  switch (n) {
    case 'ROUND': return ShapeCategory.ROUND;
    case 'OVAL': return ShapeCategory.OVAL;
    case 'PEAR': return ShapeCategory.PEAR;
    case 'CUSHION': return ShapeCategory.CUSHION;
    case 'EMERALD': return ShapeCategory.EMERALD;
    case 'RADIANT': return ShapeCategory.RADIANT;
    case 'PRINCESS': return ShapeCategory.PRINCESS;
    case 'MARQUISE': return ShapeCategory.MARQUISE;
    case 'HEART': return ShapeCategory.HEART;
    case 'ASSCHER': return ShapeCategory.ASSCHER;
    default: return ShapeCategory.FANCY;
  }
}

export function determineWeightCategory(carat: number): WeightCategory {
  if (typeof carat !== 'number' || isNaN(carat) || carat < 0) return WeightCategory.W_0_00_0_29;
  if (carat >= 0.0 && carat < 0.3) return WeightCategory.W_0_00_0_29;
  if (carat >= 0.3 && carat < 0.6) return WeightCategory.W_0_30_0_59;
  if (carat >= 0.6 && carat < 1.0) return WeightCategory.W_0_60_0_99;
  if (carat >= 1.0 && carat < 1.4) return WeightCategory.W_1_00_1_39;
  if (carat >= 1.4 && carat < 1.8) return WeightCategory.W_1_40_1_79;
  if (carat >= 1.8 && carat < 2.2) return WeightCategory.W_1_80_2_19;
  if (carat >= 2.2 && carat < 2.6) return WeightCategory.W_2_20_2_59;
  if (carat >= 2.6 && carat < 3.0) return WeightCategory.W_2_60_2_99;
  if (carat >= 3.0 && carat < 3.5) return WeightCategory.W_3_00_3_49;
  if (carat >= 3.5 && carat < 4.0) return WeightCategory.W_3_50_3_99;
  if (carat >= 4.0 && carat < 5.0) return WeightCategory.W_4_00_4_99;
  if (carat >= 5.0 && carat < 6.0) return WeightCategory.W_5_00_5_99;
  if (carat >= 6.0 && carat < 7.0) return WeightCategory.W_6_00_6_99;
  if (carat >= 7.0 && carat < 8.0) return WeightCategory.W_7_00_7_99;
  if (carat >= 8.0 && carat < 9.0) return WeightCategory.W_8_00_8_99;
  if (carat >= 9.0 && carat < 10.0) return WeightCategory.W_9_00_9_99;
  if (carat >= 10.0 && carat < 12.0) return WeightCategory.W_10_00_11_99;
  if (carat >= 12.0 && carat < 15.0) return WeightCategory.W_12_00_14_99;
  if (carat >= 15.0 && carat < 25.0) return WeightCategory.W_15_00_24_99;
  if (carat >= 25.0 && carat <= 50.0) return WeightCategory.W_25_00_50_00;
  if (carat > 50.0 && carat <= 100.0) return WeightCategory.W_50_01_100_00;
  if (carat > 100.0) return WeightCategory.W_100_01_PLUS;
  return WeightCategory.W_0_00_0_29;
}

export function determineClarityCategory(clarity: string): ClarityCategory {
  const n = (clarity || '').trim().toUpperCase().replace(/\s+/g, '');
  switch (n) {
    case 'FL': return ClarityCategory.FL;
    case 'IF': return ClarityCategory.IF;
    case 'VVS1': return ClarityCategory.VVS1;
    case 'VVS2': return ClarityCategory.VVS2;
    case 'VS1': return ClarityCategory.VS1;
    case 'VS2': return ClarityCategory.VS2;
    default:
      if (n.includes('VVS')) return n.includes('1') ? ClarityCategory.VVS1 : ClarityCategory.VVS2;
      if (n.includes('VS')) return n.includes('1') ? ClarityCategory.VS1 : ClarityCategory.VS2;
      if (n.includes('FL')) return ClarityCategory.FL;
      if (n.includes('IF')) return ClarityCategory.IF;
      return ClarityCategory.VS2;
  }
}

/** Returns D/E/F/G for white stones, null for fancy/colored (use supplier price as market price). */
export function determineColorCategory(color?: string | null): ColorCategoryEnum | null {
  if (!color) return null;
  const n = color.trim().toUpperCase();
  if (n === 'D' || n === 'E' || n === 'F' || n === 'G') return n as ColorCategoryEnum;
  return null;
}

// Column mappings to identify fields in uploaded files
export const COLUMN_MAPPINGS: Record<string, string[]> = {
  shape: ['shape', 'SHP', 'Stone Shape', 'SHAPE NAME', 'Sh', 'SHA', 'Shape'],
  carat: ['carat', 'weight', 'Cts', 'Carats', 'WGT', 'SIZE', 'Stock', 'Stone Weight', 'Crts', 'CRT_WT', 'Weight', 'WEI', 'Wgt', 'WHT.', 'WHT', 'WT.', 'WT', 'CT.', 'CT', 'Ct. Wt.', 'Polish Cts.', 'Cts', 'CTS', 'Carat'],
  color: ['color', 'col', 'color_value', 'Color', 'CL.', 'COLOUR', 'Stone Color', 'Color type'],
  fancyColorValue: ['FColor', 'fancy_color', 'Fancy Color', 'FancyColor'],
  clarity: ['clarity', 'cla', 'purity', 'CLARITY', 'Clarity', 'Stone Clarity', 'PURITY', 'CLARI', 'CLA.', 'CLR', 'CLAR'],
  cut: ['cut', 'CUT-PROP', 'Cut Grade', 'CutGrade', 'Prop', 'Stone Cut', 'Cut', 'cutGrade'],
  polish: ['polish', 'pol', 'Polish', 'Stone Polish', 'PO', 'Pol/Sym', 'POL or Pol/Sym', 'Pol', 'POL.'],
  symmetry: ['symmetry', 'sym', 'Symmetry', 'Stone Symmetry', 'Symn', 'Symm', 'SYM.', 'Sym', 'SY'],
  price: ['price', 'total price', 'cost', 'amount', 'net_value', 'total_price', 'final_price', 'totalprice', 'PartyValue', 'SaleAmt', 'PriceTotal', 'Amount U$', 'sell_amt', 'net_price', 'VALUE', 'FINAL_AMOUNT', 'usdTotal', 'priceListUSD', 'Price', 'Net Rate', 'Total price of diamond', 'System Amount', '$Amount', 'Amount($)', '$ Amount', 'TOTAL', 'Total price', 'TotalPrice', 'T-AMT', 'AMOUNT', 'T.Amt', 'TOTAL $', 'Total Value', 'AMT', 'Total amt', 'Amount', 'Final Amount', 'Final Price', 'FinalAmount', 'Amt $', 'Total Price'],
  pricePerCarat: ['price_per_carat', 'ppc', 'per_carat_price', 'price per carat', 'cost per carat', 'priceperct', 'price/ct', 'PartyRate', 'SaleRate', 'PricePerCarat', 'Price $/cts', 'Price per carat', 'pricePerCts', 'pricePerCt', 'P/CT', '$/Ct', 'price_per_caret', 'usdPerCarat', 'System Price', 'Price_x002F_Ct', 'PRICE_PER_CTS', 'Rate $/CT', 'PPC', 'Price$/cts', 'price_x002f_ct', '$ / ct', 'Price/Carat', 'P-CT', 'Price / Carat', 'Price / Crts', 'Price/Cts', 'Price/Ct', '$/ct'],
  location: ['location', 'location_country', 'country', 'city', 'state', 'COP', 'Loc', 'Dianmond Country', 'Branch', 'Branch Name', 'Certy Location', 'Diamond Location', 'Location country', 'Country Location', 'Location', 'COU_NAME', 'Stone Location', 'LOCTION', 'Country', 'Location city', 'city', 'Location region', 'Location ZIP'],
  technology: ['technology', 'type', 'growth_type', 'diamond_type', 'growthType', 'Treatment', 'Treatment_value', 'REPORT_COMMENT', 'StoneType', 'Description/Comments', 'CVD_HPHT', 'grown_type', 'growth type', 'Stone Type', 'growth technology', 'growthMethod', 'GROWN TECHNOLOGY', 'TREATMENT', 'LGType', 'Diamon Type', 'GROWN', 'Type (CVD or HPHT)', 'STONE_TYPE', 'Diamond Type', 'diamondType', 'CVD/HPHT', 'TYPES', 'Growth Process', 'Growth Type', 'Technology', 'CVD_HPHT', 'enhance_type', 'Treatment_value'],
  photo: ['photo', 'image', 'diamond_image', 'image_url', 'picture_url', 'certificate_image', 'imagelink', 'image link', 'diamond image', 'diamond image link', 'real_image', 'DiamondImageURL', 'DiamondImage', 'Image', 'REAL_IMAGE', 'Stone_Img_url', 'ImgURL', 'ImageBLink', 'Photo', 'IMAGE LINK', 'imageUrl', 'IMAGE-LINK', 'ImageLink', 'VIEW IMAGE', 'View Image-'],
  video: ['video', 'diamond_video', 'video_url', 'movie_url', 'videolink', 'diamond video', 'video link', 'diamond video link', 'DiamondVideoURL', 'DiamondVideo', 'ImageURL3D', 'videoUrl', 'VIDEO_DOWNLOAD_LINK', 'URL|VIDEO', 'Video_url', 'VIEW LINK', 'V360', 'VIEW VIDEO', 'View Video-', 'Vid', 'Video', 'VIDEO LINK', 'VideoLink', 'VIDEO_LINK', 'VIDEO-LINK', 'video_url', 'diamondVideo', 'diamondVideos'],
  measurements: ['measurements', 'dims', 'dimensions', 'measure', 'size', 'meas', 'Measurement', 'Measure', 'Measurement (Lenght x Width x Height)', 'Diameter & Depth', 'DIAMETERS', 'DIAM', 'L-W-D', 'MEASUREANT', 'MESS.', 'DIA', 'Measurements', 'Stone measurements'],
  measurement1: ['measurement1', 'measurement 1', 'meas1', 'x1', 'length', 'dim1', 'l', 'len', 'measurements_length', 'Measurement 1', 'M1', 'Mes1', 'DIA_MN', 'L mm', 'L', 'Length'],
  measurement2: ['measurement2', 'measurement 2', 'meas2', 'x2', 'width', 'dim2', 'w', 'wid', 'measurements_width', 'Measurement 2', 'M2', 'Mes2', 'DIA_MX', 'W mm', 'Width', 'W'],
  measurement3: ['measurement3', 'measurement 3', 'meas3', 'x3', 'height', 'depth', 'dim3', 'h', 'measurements_depth', 'Measurement 3', 'M3', 'Mes3', 'HT', 'H mm', 'H', 'D', 'Depth'],
  ratio: ['ratio', 'length_width_ratio', 'lw_ratio', 'l/w', 'length/width', 'proportions'],
  tableSize: ['table size', 'table', 'table_percent', 'table %', 'Table size', 'tablePerc', 'TablePercent', 'table_percent', 'tablePt', 'Tab_x0025_', 'Table_Diameter_Per', 'Stone table size', 'Table Prct', 'Table', 'TABLE_PER', 'Tab', 'TBL', 'Table Percent', 'Tab %', 'Table %', 'Table%', 'Tab%', 'TA %', 'TA%'],
  crownHeight: ['crown height', 'crown', 'crown_height', 'Crown height', 'CR_x0020_Hgt', 'crHt', 'CrownHeight', 'Crown', 'Crown Ht', 'Crown %', 'C.Height', 'Cro %', 'CH'],
  pavilionDepth: ['pavilion depth', 'pavilion', 'pavilion_depth', 'Pavilion depth', 'PV_x0020_Hgt', 'PavilionDepth', 'pavDp', 'PavillionHeight', 'Pavilion', 'PAV.', 'P.Depth', 'Pav %', 'Pavillion Height', 'Pavilion Height', 'Pavilion Dep.', 'PH'],
  girdle: ['girdle', 'girdle_condition', 'girdle_thin', 'girdle_thick', 'girdle_per', 'girdle %', 'Girdle', 'Girdle Percent', 'girdlePt', 'Girdle%', 'Girdle_Per', 'GRIDLE', 'gridlePer', 'Girdle %', 'girdle_percent', 'Girdle Name', 'Girdle Thin', 'Girdle Condition'],
  culet: ['culet', 'culet_condition', 'culet_size', 'Culet', 'culet_size', 'Culet_Size_ID', 'CUTLET', 'Culet condition', 'Culet Size', 'CuletSize'],
  totalDepth: ['total depth', 'depth_percent', 'depth %', 'dp', 'depth_per', 'total_depth', 'total_depth_percent', 'depth_percentage', 'DP', 'TotDepth_x0020__x0025_', 'Total_Depth_Per', 'DepthPer', 'depthPerc', 'depthPt', 'TotDepth %', 'Stone depth size', 'Total Depth', 'Depth Prct', 'T.DEPTH', 'T.DEP', 'TOTALDEPTH', 'Depth %', 'Depth%', 'Dep %', 'TDep', 'T.D', 'TD', 'TD%', 'TD %', 'Depth Percent', 'DepthPercent', 'depth_percent', 'DEPTH_PER'],
  fluorescence: ['fluorescence', 'flour', 'fluorescence_intensity', 'fluorescence_color', 'Fluorescence', 'Stone Fluorescence', 'FL', 'Fluorescent', 'FLUORESCENCE intensity', 'Fluorescence Intensity', 'Fluorescence Color', 'Flau', 'Fls', 'FLORO', 'fluor_intensity', 'Fluor. Int.', 'FLO', 'FLOU', 'Flur', 'FLURO', 'Flou.', 'FLR', 'FLOURO', 'FlrIntens', 'Fluor', 'Fluo', 'fl', 'Fl', 'Fl.', 'FLS.'],
  ha: ['h&a', 'hearts and arrows', 'ha', 'heart_arrow', 'H&A', 'HnA_ID', 'HNA', 'HEART'],
  // "certificate" / Certificate column may be lab (CSV) or report no (JSON); getFieldValue disambiguates vs certificateNumber.
  // Do NOT include generic "certificate" here: it's overloaded (sometimes report number or URL) and is disambiguated separately.
  certificateInstitute: ['certificate institute', 'lab', 'grading_lab', 'laboratory', 'certificate_institute', 'Certificate Institute', 'Certification Institute', 'Certificat Institute', 'Cert', 'LABNAME', 'Lab', 'Laboratory', 'Institute', 'INST.'],
  certificateNumber: [
    'certificate',
    'certificate_number', 'certificate number', 'cert no', 'certificate #', 'cert #', 'cert', 'certificate no', 'cert_no', 'certno', 'cert.no', 'cert_number', 'certificate.number',
    'report no', 'report number', 'report #', 'report', 'report_number', 'reportNo', 'REPORT_NO', 'report_no', 'CertificateNo', 'Lab_Report_No',
    'Certificate_x0020_No', 'certiNo', 'Lab Report No', 'Lab_Report_No', 'Certificate numbar', 'Certificate number', 'Repor #', 'certificate_x0020_no', 'ReportNo', 'CERTY NUM', 'Certificate Number', 'VIEW CERTY', 'CERTY NO.', 'CERTY NO', 'CERTY', 'CERTIFICATE_NO', 'Certificate No', 'Certificate No.', 'Certi. No', 'Certi', 'Cert#', 'CERT_NO', 'Cert. No', 'Report #', 'Cert. No.', 'Cert No', 'cert_num', 'Cert Number', 'CertNo', 'CERT NO.', 'Report Number', 'REPORT_NO', 'REPORT NUM', 'Report No', 'REPORT NO.', 'REPORT', 'Certi #', 'Certi No', 'Certificate #'
  ],
  overtone: ['overtone', 'Overtone', 'ColorOvertone', 'fancy_color_overtone', 'OVER TONE', 'FCOverton', 'Fancy Color Overtone', 'FancyColorOvertone'],
  intensity: ['intensity', 'Intensity', 'fancy_color_intensity', 'ColorIntensity', 'FancyColorIntens', 'FCIntens', 'FancyColorIntensity', 'Fancy Color Intensity'],
  status: ['status', 'availability', 'stock status', 'product status', 'avail', 'StnStatus', 'Result', 'Status', 'StockStatus', 'Availability', 'STNSTATUS'],
  companyId: ['company_id', 'supplier_id'],
  companyName: ['company_name', 'supplier_name'],
  discount: ['discount', 'discount_percent', 'disc', 'Reference Price Discount (R-)', 'discount_main', 'discounts', 'Reference Price Discount (R)', 'Discount(R)', 'Discount (R)', 'FINAL_DISCOUNT', 'discPerc', 'Discount (%)', 'Rapnet Discount', 'DISCA.', 'System Discount', 'Rapnet discount', 'Stone discount from Rap', 'Reference Price Discount(R-)', 'GPer', 'DISCOUNT(%)', 'Rap disc. %', 'RapBack', 'RapBackValue', 'Rap%', 'Rap %', 'Discounts', 'Disc %', 'DISC', 'Rapnet  Discount %', 'Rapnet  Discount', 'Per', 'Ref %', 'Back', 'DiscountRapRate', 'BACK %', 'BACK%', '% Off RAP', 'Disc%', 'Discount', 'Discount%', 'Discount %', 'DISC.', 'Discount Percent', 'Dis %', 'Dis%', 'Off %', 'Off%', 'DIS', 'SaleDisc', 'SaleDis', 'RapnetDiscount', 'PartyDisc'],
  reportLink: ['report_link', 'certificate_link', 'cert_link', 'gia_report_link', 'CERTIFICATE URL', 'Inscription #', 'LINK', 'CERTIFICATE_LINK', 'CERTI_LINK', 'CertificateImage'],
  image360: ['image360', '360view', '360_image', '360_video'],
  description: ['description', 'notes', 'comment', 'details', 'Lab_Report_Comment', 'CERT_COMMENTS', 'REPORT_COMMENT', 'laserInscription', 'laser inscription', 'Laser Inscription', 'Report Comments', 'KeyToSymbols', 'Key_x0020_To_x0020_Sym', 'Report Comment', 'Inscription', 'Compnay Comment', 'Comment', 'IGI Comments', 'REMARK', 'Additional Information', 'Info', 'Legends', 'Legend', 'Cert Comment', 'certComment', 'cert_comment', 'Comments', 'Description/Comments'],
  lotNumber: ['lot_number', 'lot_no', 'Ref.No.', 'SKU', 'stockNo', 'STNO', 'stock_num', 'stockId', 'stock_id', 'Stone_x0020_Id', 'Stone_No', 'LOAT_NO', 'Bar Code', '#', 'NO', 'Sr No', 'SR_NO', 'Sr #', 'Name', 'LOT NO.', 'Lot No', 'Lot #', 'Lot#', 'PKT.NO', 'STOCK ID', 'Stock Ref', 'Packet No', 'PACKET_ID', 'Stock#', 'Stock #', 'Stock No.', 'Stock No', 'Stone ID', 'STK REFF. NO.', 'STK ID'],
  additionalInfo: ['additional_info', 'extra_info'],
};

// Common supplier variants for media arrays/fields.
COLUMN_MAPPINGS.photo.push('diamondImages', 'diamondImage', 'diamond_images');

type ParserAliasesMap = Record<string, string[]>;
const BASE_COLUMN_MAPPINGS: ParserAliasesMap = Object.fromEntries(
  Object.entries(COLUMN_MAPPINGS).map(([field, values]) => [field, [...values]]),
);

/** Precomputed map: normalized header (lowercase) -> internal field name. Used for O(1) header lookup in parsers. */
const HEADER_TO_FIELD_MAP = new Map<string, string>();
const ACTIVE_ALIAS_CONFLICTS = new Map<string, string[]>();

const normalizeAliasList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const alias = String(value ?? '').trim();
    if (!alias) continue;
    const dedupeKey = alias.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(alias);
  }
  return out;
};

const mergeParserAliases = (input: ParserAliasesMap): ParserAliasesMap => {
  const merged: ParserAliasesMap = Object.fromEntries(
    Object.entries(BASE_COLUMN_MAPPINGS).map(([field, values]) => [field, [...values]]),
  );
  for (const [field, aliasesRaw] of Object.entries(input || {})) {
    const key = String(field || '').trim();
    if (!key) continue;
    const aliases = normalizeAliasList(aliasesRaw);
    if (aliases.length === 0) continue;
    if (!merged[key]) merged[key] = [];
    const seen = new Set(merged[key].map((v) => v.trim().toLowerCase()));
    for (const alias of aliases) {
      const dedupeKey = alias.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged[key].push(alias);
    }
  }
  return merged;
};

const applyMergedMappings = (merged: ParserAliasesMap): void => {
  for (const key of Object.keys(COLUMN_MAPPINGS)) {
    delete COLUMN_MAPPINGS[key];
  }
  for (const [field, aliases] of Object.entries(merged)) {
    COLUMN_MAPPINGS[field] = [...aliases];
  }
};

const rebuildHeaderLookup = (): void => {
  HEADER_TO_FIELD_MAP.clear();
  ACTIVE_ALIAS_CONFLICTS.clear();
  const conflictAccumulator = new Map<string, Set<string>>();
  for (const [internalField, possibleHeaders] of Object.entries(COLUMN_MAPPINGS)) {
    for (const ph of possibleHeaders) {
      const normalized = ph.toLowerCase().trim();
      if (!normalized) continue;
      const mapped = HEADER_TO_FIELD_MAP.get(normalized);
      if (mapped && mapped !== internalField) {
        const fields = conflictAccumulator.get(normalized) || new Set<string>([mapped]);
        fields.add(internalField);
        conflictAccumulator.set(normalized, fields);
        continue;
      }
      HEADER_TO_FIELD_MAP.set(normalized, internalField);
    }
  }
  for (const [alias, fields] of conflictAccumulator.entries()) {
    ACTIVE_ALIAS_CONFLICTS.set(alias, Array.from(fields.values()));
  }
};

export const applyGlobalParserAliases = (aliases: ParserAliasesMap): void => {
  const merged = mergeParserAliases(aliases);
  applyMergedMappings(merged);
  rebuildHeaderLookup();
};

export const getParserAliasConflicts = (): Record<string, string[]> => {
  return Object.fromEntries(ACTIVE_ALIAS_CONFLICTS.entries());
};

rebuildHeaderLookup();

export interface RawProductData {
    [key: string]: unknown;
    stockNumber?: string;
    shape?: string;
    carat?: number | string;
    color?: string;
    clarity?: string;
    price?: number | string;
    certificateNumber?: string;
    certificateInstitute?: string;
    location?: string;
}

export interface ProcessedProductData extends Partial<IProduct> {
    _id?: Types.ObjectId;
    company?: Types.ObjectId;
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
    pricePerCarat?: number;
    discount?: number;
    measurements?: string;
    measurement1?: number;
    measurement2?: number;
    measurement3?: number;
    ratio?: number;
    tableSize?: number;
    totalDepth?: number;
    status?: string;
    photo?: string;
    video?: string;
    reportLink?: string;
    image360?: string;
    location?: string;
    technology?: string;
    ha?: string;
    girdle?: string;
    culet?: string;
    isNew?: boolean;
    hasError?: boolean;
    errorReason?: string;
    originalData?: RawProductData;
    processed?: boolean;
    skipped?: boolean;
    skipReason?: string;
    crownHeight?: number;
    pavilionDepth?: number;
    overtone?: string;
    intensity?: string;
    description?: string;
    lotNumber?: string;
    additionalInfo?: string;
}

export interface ProductProcessingResult {
    success: boolean;
    data?: ProcessedProductData;
    reason?: string;
    action?: 'created' | 'updated' | 'skipped';
}

// Utility functions – strip trailing parenthetical (e.g. "ROUND (H&A)" -> "Round")
const normalizeShape = (shape?: string | null): string => {
  if (!shape) return DEFAULT_VALUES.STRING;
  const trimmed = shape.trim();
  const trimmedUpperShape = trimmed.toUpperCase();
  let result = SHAPE_REVERSE_MAP.get(trimmedUpperShape);
  if (result !== undefined) return result;
  const withoutParens = trimmed.replace(/\s*\([^)]*\)\s*$/i, '').trim();
  if (withoutParens && withoutParens.toUpperCase() !== trimmedUpperShape) {
    result = SHAPE_REVERSE_MAP.get(withoutParens.toUpperCase());
    if (result !== undefined) return result;
  }
  return trimmed;
};

const normalizeClarity = (clarity?: string | null): string => {
  if (!clarity) return DEFAULT_VALUES.STRING;
  return clarity.trim().toUpperCase().replace(/\s+/g, '');
};

const normalizeColor = (color?: string | null): string => {
  if (!color) return DEFAULT_VALUES.STRING;
  return color.trim().toUpperCase();
};

const normalizeGrade = (grade?: string | null): string => {
  if (!grade) return DEFAULT_VALUES.STRING;
  const gradeUpper = grade.trim().toUpperCase().replace(/\s+/g, '');
  // FR (Fair) excluded - same as catalog: only GD, VG, EX, ID
  if (gradeUpper === 'FR' || gradeUpper === 'F') return DEFAULT_VALUES.STRING;
  const gradeMap: Record<string, string> = {
    'EX': 'EXCELLENT',
    'VG': 'VERY GOOD',
    'G': 'GOOD',
    'GD': 'GOOD',
    'P': 'POOR',
    'ID': 'IDEAL',
    'EXC': 'EXCELLENT',
    'V GOOD': 'VERY GOOD',
    'VGOOD': 'VERY GOOD',
  };
  const result = gradeMap[gradeUpper] || gradeUpper;
  if (result === 'POOR' || gradeUpper === 'P') return DEFAULT_VALUES.STRING;
  return result;
};

const normalizeCut = (cut?: string | null): string => {
  return normalizeGrade(cut);
};

/**
 * Marketplace rule: FR/F (Fair) is not allowed for Cut/Polish/Symmetry.
 * If any of these grades is FR/F/FAIR -> the product must be skipped (not imported).
 */
const hasDisallowedMarketplaceGrade = (raw: unknown): boolean => {
  if (raw === null || raw === undefined) return false;
  const v = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  return v === 'FR' || v === 'F' || v === 'FAIR';
};

const normalizeInstitute = (institute?: string | null): string => {
  if (!institute) return DEFAULT_VALUES.STRING;
  const raw = String(institute).trim();
  if (!raw) return DEFAULT_VALUES.STRING;

  // Guardrail: some feeds mistakenly put report/verify URLs into the "lab" field.
  // Convert known lab URLs to lab codes, otherwise ignore URL-like values.
  const rawLower = raw.toLowerCase();
  if (rawLower.startsWith('http://') || rawLower.startsWith('https://')) {
    if (rawLower.includes('igi.org')) return 'IGI';
    if (rawLower.includes('gia.edu') || rawLower.includes('gia.')) return 'GIA';
    if (rawLower.includes('agslab') || rawLower.includes('ags.org')) return 'AGS';
    if (rawLower.includes('hrdantwerp') || rawLower.includes('hrd')) return 'HRD';
    return DEFAULT_VALUES.STRING;
  }

  const normalized = raw.toUpperCase().trim();
  const instituteMap: Record<string, string> = {
    'GEMOLOGICAL INSTITUTE OF AMERICA': 'GIA',
    'INTERNATIONAL GEMOLOGICAL INSTITUTE': 'IGI',
    'AMERICAN GEM SOCIETY': 'AGS',
    'HOGE RAAD VOOR DIAMANT': 'HRD',
    'GEMOLOGICAL SCIENCE INTERNATIONAL': 'GSI',
    'EUROPEAN GEMOLOGICAL LABORATORY': 'EGL',
    'GEM CERTIFICATION & ASSURANCE LAB': 'GCAL',
    'AGS LABORATORIES': 'AGS',
    'HRD ANTWERP': 'HRD',
  };
  if (instituteMap[normalized]) {
    return instituteMap[normalized];
  }
  if (['GIA', 'IGI', 'AGS', 'HRD', 'GSI', 'EGL', 'GCAL'].includes(normalized)) {
    return normalized;
  }
  return raw;
};

const validateUrl = (url?: string | null): string => {
  if (!url) return DEFAULT_VALUES.STRING;
  const stringUrl = String(url).trim();
  if (!stringUrl) return DEFAULT_VALUES.STRING;
  if (stringUrl.startsWith('http://') || stringUrl.startsWith('https://')) {
    try {
      new URL(stringUrl);
      return stringUrl;
    } catch (e) {
      return DEFAULT_VALUES.STRING;
    }
  }
  return DEFAULT_VALUES.STRING;
};

const extractMediaUrl = (raw: unknown): string => {
  if (raw === null || raw === undefined) return DEFAULT_VALUES.STRING;

  const asValid = (value: unknown): string => validateUrl(typeof value === 'string' ? value : String(value));

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && 'url' in item) {
        const fromObj = asValid((item as { url?: unknown }).url);
        if (fromObj) return fromObj;
      }
      const direct = asValid(item);
      if (direct) return direct;
    }
    return DEFAULT_VALUES.STRING;
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['url', 'link', 'src', 'href', 'hyperlink']) {
      const v = obj[key];
      const parsed = asValid(v);
      if (parsed) return parsed;
    }
    return DEFAULT_VALUES.STRING;
  }

  const text = String(raw).trim();
  if (!text) return DEFAULT_VALUES.STRING;

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return extractMediaUrl(JSON.parse(text));
    } catch {
      // Continue with plain-text fallbacks.
    }
  }

  for (const candidate of text.split(/[,\s;|]+/)) {
    const parsed = asValid(candidate);
    if (parsed) return parsed;
  }

  return asValid(text);
};

const normalizeCertificateNumber = (raw: unknown): string => {
  if (raw === null || raw === undefined) return DEFAULT_VALUES.STRING;
  let cert = String(raw).trim().toUpperCase();
  if (!cert) return DEFAULT_VALUES.STRING;
  cert = cert.replace(/\s+/g, '');
  cert = cert.replace(/[.,;:]+$/g, '');
  if (/^\d+\.0$/.test(cert)) cert = cert.slice(0, -2);
  if (!cert || INVALID_CERTIFICATE_NUMBERS.has(cert)) return DEFAULT_VALUES.STRING;
  return cert;
};

const formatFieldValue = (fieldName: string, value: unknown): string => {
  if (value === null || typeof value === 'undefined') return DEFAULT_VALUES.STRING;
  const stringValue = String(value).trim();
  if (!stringValue) return DEFAULT_VALUES.STRING;
  return stringValue;
};

const determineStoneType = (color?: string | null): string => {
  if (!color) return 'diamond';
  const colorLower = color.toLowerCase();
  const fancyKeywords = ['pink', 'blue', 'yellow', 'green', 'red', 'orange', 'purple', 'violet', 'brown', 'gray', 'black', 'fancy'];
  if (fancyKeywords.some(keyword => colorLower.includes(keyword))) {
    return 'fancy diamond';
  }
  return 'diamond';
};

const parseMeasurements = (measurements?: string | number | null): { measurement1: number; measurement2: number; measurement3: number; raw?: string } => {
  const defaultResult = { measurement1: 0, measurement2: 0, measurement3: 0, raw: undefined };
  if (measurements === null || typeof measurements === 'undefined') return defaultResult;

  const measurementsStr = String(measurements).trim();
  if (!measurementsStr) return defaultResult;

  const parts = measurementsStr.split(/[xX\*\-\s,\/]+/).map(part => parseFloat(part.trim())).filter(num => !isNaN(num));

  return {
    measurement1: parts[0] || 0,
    measurement2: parts[1] || 0,
    measurement3: parts[2] || 0,
    raw: measurementsStr
  };
};

export const findMatchingField = (headerName?: string | null): string | null => {
  if (!headerName) return null;
  const normalizedHeader = headerName.trim().toLowerCase();
  const mapped = HEADER_TO_FIELD_MAP.get(normalizedHeader);
  return mapped ?? headerName;
};

/** JSON/CSV key "certificate" is overloaded: report number vs lab name — classify before mapping. */
const LAB_TOKEN_IN_CERT_COLUMN = /\b(GIA|IGI|HRD|EGL|AGS|SGL|PGS|NGTC|GCAL|IIDGR|DFHK)\b/i;

const looksLikeCertificateReportNumber = (value: string): boolean => {
  const v = value.trim().replace(/\s/g, '');
  if (!v) return false;
  if (/^\d{5,}$/.test(v)) return true;
  if (/^\d[\d\-]{4,}$/.test(v)) return true;
  const digits = (v.match(/\d/g) || []).length;
  return digits >= 5 && digits >= v.length * 0.45;
};

const looksLikeCertificateInstituteLabel = (value: string): boolean => {
  const v = value.trim();
  if (!v) return false;
  if (LAB_TOKEN_IN_CERT_COLUMN.test(v)) return true;
  const compact = v.replace(/\s+/g, '');
  if (/^[A-Z]{2,6}$/i.test(compact) && !/\d/.test(compact)) return true;
  if (v.length > 8 && !/\d/.test(v) && /institute|laboratory|gemological/i.test(v)) return true;
  return false;
};

const classifyCertificateColumnValue = (str: string): { meansReportNumber: boolean; meansLab: boolean } => {
  const likeNum = looksLikeCertificateReportNumber(str);
  const likeLab = looksLikeCertificateInstituteLabel(str);
  if (likeNum && !likeLab) return { meansReportNumber: true, meansLab: false };
  if (likeLab && !likeNum) return { meansReportNumber: false, meansLab: true };
  if (likeNum && likeLab) {
    const digits = (str.match(/\d/g) || []).length;
    const reportHeavy = digits >= 5;
    return { meansReportNumber: reportHeavy, meansLab: !reportHeavy };
  }
  const digits = (str.match(/\d/g) || []).length;
  const reportHeavy = digits >= 4;
  return { meansReportNumber: reportHeavy, meansLab: !reportHeavy };
};

const readCertificateColumn = (product: RawProductData): { raw: unknown; str: string } | null => {
  for (const key in product) {
    if (!Object.prototype.hasOwnProperty.call(product, key)) continue;
    if (key.trim().toLowerCase() !== 'certificate') continue;
    const raw = product[key];
    const str = raw !== undefined && raw !== null ? String(raw).trim() : '';
    if (!str) return null;
    return { raw, str };
  }
  return null;
};

const isBareCertificateAlias = (name: string): boolean => name.trim().toLowerCase() === 'certificate';

export const getFieldValue = (product: RawProductData, primaryField: string, alternativeFields: string[] = []): unknown => {
  if (!product || typeof product !== 'object') return null;

  if (product[primaryField] !== undefined) return product[primaryField];

  const primaryFieldLower = primaryField.toLowerCase();
  for (const key in product) {
    if (Object.prototype.hasOwnProperty.call(product, key) && key.trim().toLowerCase() === primaryFieldLower) {
      return product[key];
    }
  }

  let skipBareCertificateAlias = false;
  if (primaryField === 'certificateNumber' || primaryField === 'certificateInstitute') {
    const certCol = readCertificateColumn(product);
    if (certCol) {
      const { meansReportNumber, meansLab } = classifyCertificateColumnValue(certCol.str);
      if (primaryField === 'certificateNumber' && meansReportNumber) return certCol.raw;
      if (primaryField === 'certificateInstitute' && meansLab) return certCol.raw;
      skipBareCertificateAlias =
        (primaryField === 'certificateNumber' && !meansReportNumber) ||
        (primaryField === 'certificateInstitute' && !meansLab);
    }
  }

  for (const altField of alternativeFields) {
    if (skipBareCertificateAlias && isBareCertificateAlias(altField)) continue;
    if (product[altField] !== undefined) return product[altField];

    const altFieldLower = altField.toLowerCase();
    for (const key in product) {
      if (skipBareCertificateAlias && isBareCertificateAlias(key)) continue;
      if (Object.prototype.hasOwnProperty.call(product, key) && key.trim().toLowerCase() === altFieldLower) {
        return product[key];
      }
    }
  }

  const mappedAlternativeFields = COLUMN_MAPPINGS[primaryField as keyof typeof COLUMN_MAPPINGS];
  if (mappedAlternativeFields && Array.isArray(mappedAlternativeFields)) {
    for (const headerVariation of mappedAlternativeFields) {
      if (skipBareCertificateAlias && isBareCertificateAlias(headerVariation)) continue;
      if (product[headerVariation] !== undefined) {
         const value = product[headerVariation];
         if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      const headerVariationLower = headerVariation.toLowerCase();
      for (const key in product) {
        if (skipBareCertificateAlias && isBareCertificateAlias(key)) continue;
        if (Object.prototype.hasOwnProperty.call(product, key) && key.trim().toLowerCase() === headerVariationLower) {
          const value = product[key];
          if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
      }
    }
  }

  return null;
};

/** Canonical field keys read by processProduct. Resolve each once per product to avoid repeated getFieldValue scans. */
const NORMALIZED_FIELD_KEYS: (keyof typeof COLUMN_MAPPINGS | 'sold')[] = [
  'status', 'color', 'fancyColorValue', 'shape', 'measurements', 'measurement1', 'measurement2', 'measurement3',
  'ratio', 'totalDepth', 'carat', 'price', 'pricePerCarat', 'clarity', 'cut', 'polish', 'symmetry',
  'photo', 'video', 'certificateNumber', 'certificateInstitute', 'location', 'overtone', 'intensity',
  'sold', 'tableSize', 'crownHeight', 'pavilionDepth', 'girdle', 'culet', 'fluorescence', 'ha', 'technology', 'description'
];

function getNormalizedFields(rawProduct: RawProductData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of NORMALIZED_FIELD_KEYS) {
    const alts = key === 'sold' ? [] : (COLUMN_MAPPINGS[key as keyof typeof COLUMN_MAPPINGS] ?? []);
    out[key] = getFieldValue(rawProduct, key, alts);
  }
  return out;
}

const validateProductStatus = (status?: string | null): { isValid: boolean; normalizedValue: string; originalValue?: string | null } => {
  const originalValue = status;
  if (!status) {
    return { normalizedValue: 'available', isValid: true, originalValue };
  }
  const normalizedStatus = String(status).trim().toLowerCase();
  
  const allowedToNormalize: string[] = ['available', '1', 'on stock', 'onstock', 'on hand', 'onhand', 'in stock', 'instock', 'stock', 'yes', 'true', 'g', 'a', 'да'];
  
  if (allowedToNormalize.includes(normalizedStatus)) {
    return { normalizedValue: 'available', isValid: true, originalValue };
  }
  
  return { normalizedValue: status.trim(), isValid: false, originalValue };
};

const validateDiamondColor = (color?: string | null): { isValid: boolean; normalizedValue: string; originalValue?: string | null } => {
  const originalValue = color;
  if (!color || !String(color).trim()) {
    return { normalizedValue: DEFAULT_VALUES.STRING, isValid: false, originalValue };
  }
  const trimmed = String(color).trim();
  const normalized = normalizeWhiteColorRange(trimmed).toUpperCase();
  if (normalized.length === 1 && WHITE_COLOR_GRADES.includes(normalized)) {
    return { normalizedValue: normalized, isValid: true, originalValue };
  }
  if (isFancyColor(trimmed)) {
    return { normalizedValue: trimmed, isValid: true, originalValue };
  }
  return { normalizedValue: trimmed, isValid: false, originalValue };
};

/**
 * Calculate Total Depth % based on diamond shape and measurements
 * @param shape Diamond shape (normalized)
 * @param measurement1 Length
 * @param measurement2 Width  
 * @param measurement3 Height/Depth
 * @returns Total Depth % or 0 if calculation not possible
 */
const calculateTotalDepthPercent = (
  shape?: string | null, 
  measurement1?: number, 
  measurement2?: number, 
  measurement3?: number
): number => {
  if (!shape || !measurement1 || !measurement2 || !measurement3 || 
      measurement1 <= 0 || measurement2 <= 0 || measurement3 <= 0) {
    return 0;
  }

  const normalizedShape = shape.toUpperCase().trim();
  
  // For round and nearly round shapes: Total Depth % = (Depth / Average Diameter) × 100
  const roundShapes = ['ROUND', 'PRINCESS', 'ASSCHER', 'CUSHION'];
  if (roundShapes.includes(normalizedShape)) {
    const averageDiameter = (measurement1 + measurement2) / 2;
    return parseFloat(((measurement3 / averageDiameter) * 100).toFixed(2));
  }
  
  // For elongated shapes: Total Depth % = (Depth / Width) × 100
  const elongatedShapes = ['OVAL', 'EMERALD', 'PEAR', 'MARQUISE', 'HEART', 'RADIANT'];
  if (elongatedShapes.includes(normalizedShape)) {
    // Width is typically the smaller of measurement1 and measurement2
    const width = Math.min(measurement1, measurement2);
    return parseFloat(((measurement3 / width) * 100).toFixed(2));
  }
  
  // For other shapes, use average diameter method as fallback
  const averageDiameter = (measurement1 + measurement2) / 2;
  return parseFloat(((measurement3 / averageDiameter) * 100).toFixed(2));
};

const parseLocationString = (locationInput?: string | number | null): { country: string; city: string; region: string; original: string } => {
  const original = String(locationInput || DEFAULT_VALUES.STRING).trim();
  const defaultLocation = { country: DEFAULT_VALUES.STRING, city: DEFAULT_VALUES.STRING, region: DEFAULT_VALUES.STRING, original };

  if (!original) return defaultLocation;
  
  const parts = original.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  let country = DEFAULT_VALUES.STRING;
  let city = DEFAULT_VALUES.STRING;
  let region = DEFAULT_VALUES.STRING;

  if (parts.length > 0) {
    const rawCountry = parts[parts.length - 1];
    
    // Enhanced city→country mapping for diamond industry hubs
    const cityToCountryMap: { [key: string]: string } = {
      // India
      'IN': 'India', 'IND': 'India', 'INDIA': 'India',
      'MUMBAI': 'India', 'SURAT': 'India', 'DELHI': 'India', 'KOLKATA': 'India',
      'CHENNAI': 'India', 'BANGALORE': 'India', 'BENGALURU': 'India', 'HYDERABAD': 'India',
      'PUNE': 'India', 'AHMEDABAD': 'India', 'JAIPUR': 'India', 'NASHIK': 'India',
      'RAJKOT': 'India', 'VADODARA': 'India', 'NOIDA': 'India', 'CHANDIGARH': 'India',
      
      // Belgium
      'BELGIUM': 'Belgium', 'BE': 'Belgium',
      'ANTWERP': 'Belgium', 'ANVERS': 'Belgium', 'BRUSSELS': 'Belgium',
      
      // Israel
      'ISRAEL': 'Israel', 'IL': 'Israel',
      'TEL AVIV': 'Israel', 'TELAVIV': 'Israel', 'RAMAT GAN': 'Israel', 'RAMAT-GAN': 'Israel',
      
      // USA
      'USA': 'USA', 'US': 'USA', 'UNITED STATES': 'USA', 'AMERICA': 'USA',
      'NEW YORK': 'USA', 'NEWYORK': 'USA', 'NY': 'USA', 'LOS ANGELES': 'USA',
      
      // China / Hong Kong
      'CHINA': 'China', 'CN': 'China',
      'HONG KONG': 'Hong Kong', 'HONGKONG': 'Hong Kong', 'HK': 'Hong Kong',
      'SHANGHAI': 'China', 'SHENZHEN': 'China',
      
      // UAE
      'DUBAI': 'UAE', 'UAE': 'UAE',
      
      // Singapore
      'SINGAPORE': 'Singapore', 'SG': 'Singapore',
      
      // South Africa
      'SOUTH AFRICA': 'South Africa', 'ZA': 'South Africa',
      'JOHANNESBURG': 'South Africa', 'CAPE TOWN': 'South Africa',
      
      // Russia
      'RUSSIA': 'Russia', 'RU': 'Russia', 'MOSCOW': 'Russia',
      
      // Other
      'UK': 'UK', 'UNITED KINGDOM': 'UK', 'LONDON': 'UK',
      'THAILAND': 'Thailand', 'TH': 'Thailand'
    };
    
    const normalized = rawCountry.toUpperCase();
    country = cityToCountryMap[normalized] || rawCountry;
    
    if (parts.length > 1) {
      city = parts[0];
    }
    if (parts.length > 2) {
      region = parts.slice(1, -1).join(', ');
    }
  }
  
  return { country, city, region, original };
};

/**
 * Process a single product from raw API data
 */
export async function processProduct(
    rawProduct: RawProductData,
    companyId: string,
    stats: ProductProcessingStats,
    options: { marketPriceCache?: Map<string, number>; existingProductsMap?: Map<string, ExistingProductCacheEntry> } = {}
): Promise<ProductProcessingResult> {
    let lastCertificateNumber: string | undefined;
    try {
        const n = getNormalizedFields(rawProduct);
        const product: ProcessedProductData = {
            company: companyId as unknown as Types.ObjectId,
        };

        // Check product status
        const statusField = n['status'];
        const statusValidation = validateProductStatus(typeof statusField === 'string' ? statusField : null);
        if (!statusValidation.isValid) {
            stats.skippedInvalidStatus++;
            return { success: false, reason: 'invalid_status' };
        }
        product.status = statusValidation.normalizedValue;

        // Color: merge "Color" and "Fancy Color". Prefer FancyColor when Color is generic ("Fancy") and FancyColor has specific value (e.g. "Pink").
        const rawColor = n['color'];
        const rawFancy = n['fancyColorValue'];
        const trimColor = typeof rawColor === 'string' ? rawColor.trim() : '';
        const trimFancy = typeof rawFancy === 'string' ? rawFancy.trim() : '';
        const rawColorMerged =
          trimColor ? (isGenericFancyPlaceholder(trimColor) && trimFancy ? trimFancy : trimColor) : (trimFancy || null);
        if (!rawColorMerged || !String(rawColorMerged).trim()) {
            stats.skippedInvalidColor++;
            return { success: false, reason: 'invalid_color' };
        }
        const colorStr = String(rawColorMerged).trim();
        const normalizedForCheck = normalizeWhiteColorRange(colorStr);
        if (isFancyColor(colorStr)) {
            product.color = colorStr;
            const parsed = parseFancyColorString(colorStr);
            product.intensity = parsed.intensity || 'Other';
            product.overtone = parsed.overtone || 'Other';
            const overtoneFromFile = typeof n['overtone'] === 'string' ? n['overtone'].trim() : '';
            const intensityFromFile = typeof n['intensity'] === 'string' ? n['intensity'].trim() : '';
            if (overtoneFromFile) product.overtone = overtoneFromFile;
            if (intensityFromFile) product.intensity = intensityFromFile;
        } else {
            const colorValidation = validateDiamondColor(normalizedForCheck);
            if (!colorValidation.isValid) {
                stats.skippedInvalidColor++;
                return { success: false, reason: 'invalid_color' };
            }
            product.color = colorValidation.normalizedValue;
        }

        const rawShape = n['shape'];
        product.shape = normalizeShape(typeof rawShape === 'string' ? rawShape : null);
        
        // Process measurements
        const measurementsCombinedRaw = n['measurements'];
        let parsedMeasurements: { measurement1: number; measurement2: number; measurement3: number; raw?: string };
        if (measurementsCombinedRaw !== null && measurementsCombinedRaw !== undefined) {
            parsedMeasurements = parseMeasurements(
                typeof measurementsCombinedRaw === 'string' || typeof measurementsCombinedRaw === 'number'
                    ? measurementsCombinedRaw
                    : null
            );
        } else {
            const m1Raw = n['measurement1'];
            const m2Raw = n['measurement2'];
            const m3Raw = n['measurement3'];
            parsedMeasurements = {
                measurement1: m1Raw ? parseFloat(String(m1Raw)) : 0,
                measurement2: m2Raw ? parseFloat(String(m2Raw)) : 0,
                measurement3: m3Raw ? parseFloat(String(m3Raw)) : 0,
                raw: (m1Raw || m2Raw || m3Raw) ? `${String(m1Raw || '')}x${String(m2Raw || '')}x${String(m3Raw || '')}` : undefined
            };
        }
        product.measurement1 = parsedMeasurements.measurement1;
        product.measurement2 = parsedMeasurements.measurement2;
        product.measurement3 = parsedMeasurements.measurement3;
        product.measurements = parsedMeasurements.raw || undefined;

        // Process ratio: use incoming ratio if exists, otherwise calculate from measurements
        const rawRatio = n['ratio'];
        if (rawRatio && !isNaN(parseFloat(String(rawRatio)))) {
            product.ratio = parseFloat(parseFloat(String(rawRatio)).toFixed(2));
        } else if (product.measurement1 && product.measurement2 && product.measurement1 > 0 && product.measurement2 > 0) {
            product.ratio = parseFloat((product.measurement1 / product.measurement2).toFixed(2));
        } else {
            product.ratio = 0;
        }

        // Process totalDepth: use incoming value if exists, otherwise calculate from measurements and shape
        const rawTotalDepth = n['totalDepth'];
        if (rawTotalDepth && !isNaN(parseFloat(String(rawTotalDepth)))) {
            product.totalDepth = parseFloat(parseFloat(String(rawTotalDepth)).toFixed(2));
        } else if (product.shape && product.measurement1 && product.measurement2 && product.measurement3 && product.measurement1 > 0 && product.measurement2 > 0 && product.measurement3 > 0) {
            product.totalDepth = calculateTotalDepthPercent(product.shape, product.measurement1, product.measurement2, product.measurement3);
        } else {
            product.totalDepth = 0;
        }

        // Process prices and carat
        const rawCarat = n['carat'];
        product.carat = parseFloat(String(rawCarat)) || 0;

        let price = parseFloat(String(n['price'])) || 0;
        let pricePerCarat = parseFloat(String(n['pricePerCarat'])) || 0;

        if (price > 0 && product.carat > 0) {
            pricePerCarat = price / product.carat;
        } else if (pricePerCarat > 0 && product.carat > 0 && price === 0) {
            price = pricePerCarat * product.carat;
        }
        product.price = parseFloat(price.toFixed(2));
        product.pricePerCarat = parseFloat(pricePerCarat.toFixed(2));

        // Weight category (for schema/display; market price key uses determineWeightCategory(carat))
        if (product.carat > 0) {
            product.weight = determineWeightCategory(product.carat);
        }

        // Set clarity BEFORE market price check
        const rawClarity = n['clarity'];
        product.clarity = normalizeClarity(typeof rawClarity === 'string' ? rawClarity : null);
        
        if (!ALLOWED_CLARITIES.includes(product.clarity)) {
            stats.skippedInvalidClarity++;
            return { success: false, reason: 'invalid_clarity' };
        }

        // Marketplace quality rule: skip products with FR/F (Fair) on cut/polish/symmetry
        const rawCutForValidation = n['cut'];
        const rawPolishForValidation = n['polish'];
        const rawSymmetryForValidation = n['symmetry'];
        if (
            hasDisallowedMarketplaceGrade(rawCutForValidation) ||
            hasDisallowedMarketplaceGrade(rawPolishForValidation) ||
            hasDisallowedMarketplaceGrade(rawSymmetryForValidation)
        ) {
            stats.skippedInvalidData = (stats.skippedInvalidData || 0) + 1;
            return { success: false, reason: 'invalid_grade' };
        }

        // Set market price (aligned with api-product-sync): white stones D–G use cache; colored use supplier price
        try {
            const colorCat = determineColorCategory(product.color);
            if (colorCat !== null && product.shape && product.carat > 0 && product.clarity) {
                // White stones (D, E, F, G): try cache with same key format as market-price-calculator / api-product-sync
                const shapeCat = determineShapeCategory(product.shape);
                const weightCat = determineWeightCategory(product.carat);
                const clarityCat = determineClarityCategory(product.clarity);
                const cacheKey = `${shapeCat}-${weightCat}-${clarityCat}-${colorCat}`;
                let marketPricePerCarat: number | undefined;
                if (options.marketPriceCache) {
                    marketPricePerCarat = options.marketPriceCache.get(cacheKey);
                }
                if (marketPricePerCarat != null && marketPricePerCarat > 0) {
                    product.marketPrice = parseFloat((marketPricePerCarat * product.carat).toFixed(2));
                    product.marketPricePerCarat = marketPricePerCarat;
                    if (process.env.NODE_ENV !== 'production' || Math.random() < 0.0001) {
                        logger.debug('[processProduct] Applied market price from cache', {
                            certificateNumber: product.certificateNumber,
                            marketPrice: product.marketPrice,
                            marketPricePerCarat,
                            cacheKey,
                        });
                    }
                } else {
                    product.marketPrice = product.price;
                    product.marketPricePerCarat = product.pricePerCarat;
                    if (process.env.NODE_ENV !== 'production' || Math.random() < 0.001) {
                        logger.warn('[processProduct] No market price in cache for category, using supplier price', {
                            certificateNumber: product.certificateNumber,
                            cacheKey,
                        });
                    }
                }
            } else {
                // Colored stones (non D–G): market price = supplier price
                product.marketPrice = product.price;
                product.marketPricePerCarat = product.pricePerCarat;
            }
        } catch (e) {
            logger.error('[processProduct] Error setting market price', { certificateNumber: product.certificateNumber, error: e });
            product.marketPrice = product.price;
            product.marketPricePerCarat = product.pricePerCarat;
        }

        // Validations
        if (product.price < MIN_SUPPLIER_PRICE || product.price > MAX_PRICE) {
            stats.skippedInvalidPrice++;
            return { success: false, reason: 'invalid_price' };
        }

        if (!(product.carat >= MIN_CARAT && product.carat <= MAX_CARAT)) {
            stats.skippedInvalidCarat++;
            return { success: false, reason: 'invalid_carat' };
        }

        // Anomalous price per carat filter
        if (product.carat > 0 && product.pricePerCarat > 0) {
            let limit = 0;
            if (product.carat <= 1) {
                limit = ANOMALOUS_PPC_LIMIT_1_CARAT;
            } else if (product.carat <= 5) {
                limit = ANOMALOUS_PPC_LIMIT_5_CARAT;
            } else if (product.carat <= 10) {
                limit = ANOMALOUS_PPC_LIMIT_10_CARAT;
            } else {
                limit = ANOMALOUS_PPC_LIMIT_OVER_10_CARAT;
            }

            if (product.pricePerCarat > limit) {
                stats.skippedAnomalousPricePerCarat = (stats.skippedAnomalousPricePerCarat || 0) + 1;
                return { success: false, reason: 'anomalous_price_per_carat' };
            }
        }

        const photoField = n['photo'];
        const videoField = n['video'];
        product.photo = extractMediaUrl(photoField);
        product.video = extractMediaUrl(videoField);

        if (!product.photo && !product.video) {
            stats.skippedMissingMedia++;
            return { success: false, reason: 'missing_media' };
        }

        const rawCertNumber = n['certificateNumber'];
        product.certificateNumber = normalizeCertificateNumber(rawCertNumber);
        lastCertificateNumber = product.certificateNumber || undefined;
        
        if (!product.certificateNumber) {
            stats.skippedMissingCertNumber++;
            return { success: false, reason: 'missing_certificate_number' };
        }
        
        const rawCertInstitute = n['certificateInstitute'];
        product.certificateInstitute = normalizeInstitute(String(rawCertInstitute));

        const rawLocation = n['location'];
        if (rawLocation !== null && rawLocation !== undefined) {
            const locationStr = String(rawLocation).trim();
            if (locationStr) {
                const parsedLoc = parseLocationString(locationStr);
                product.location = parsedLoc.country;
            } else {
                product.location = DEFAULT_VALUES.STRING;
            }
        } else {
            product.location = DEFAULT_VALUES.STRING;
        }
        
        // Populate remaining fields (from normalized cache)
        product.stoneType = determineStoneType(product.color);
        const overtoneFormatted = formatFieldValue('overtone', n['overtone']);
        product.overtone = overtoneFormatted || product.overtone || DEFAULT_VALUES.STRING;
        const intensityFormatted = formatFieldValue('intensity', n['intensity']);
        product.intensity = intensityFormatted || product.intensity || DEFAULT_VALUES.STRING;
        const cutField = n['cut'];
        const normalizedCut = normalizeCut(typeof cutField === 'string' ? cutField : null);
        if (normalizedCut) {
            product.cut = normalizedCut;
        }
        product.polish = normalizeGrade(typeof n['polish'] === 'string' ? n['polish'] : null);
        product.symmetry = normalizeGrade(typeof n['symmetry'] === 'string' ? n['symmetry'] : null);
        product.sold = Boolean(n['sold'] || DEFAULT_VALUES.BOOLEAN);
        product.tableSize = parseFloat(String(n['tableSize'])) || DEFAULT_VALUES.NUMBER;
        product.crownHeight = parseFloat(String(n['crownHeight'])) || DEFAULT_VALUES.NUMBER;
        product.pavilionDepth = parseFloat(String(n['pavilionDepth'])) || DEFAULT_VALUES.NUMBER;
        product.girdle = formatFieldValue('girdle', n['girdle']).toUpperCase();
        product.culet = formatFieldValue('culet', n['culet']).toUpperCase();
        product.totalDepth = parseFloat(String(n['totalDepth'])) || DEFAULT_VALUES.NUMBER;
        product.fluorescence = formatFieldValue('fluorescence', n['fluorescence']).toUpperCase();
        product.ha = String(n['ha'] || DEFAULT_VALUES.STRING);
        product.technology = formatFieldValue('technology', n['technology']);
        product.description = formatFieldValue('description', n['description']);

        // Check if the product is Lab-Grown
        const labGrownKeywords = [
            'LAB GROWN', 
            'LAB-GROWN', 
            'SYNTHETIC', 
            'LG', 
            'GIA LG',           // GIA laser inscription e.g. [GIA LG] 2496106454; LABORATORY-GROWN
            'LAB CREATED', 
            'MAN-MADE', 
            'MAN MADE',
            'LABORATORY GROWN',
            'LABORATORY-GROWN',
            'CVD',
            'HPHT',
            'Labgrown',
            'LAB_GROWN',
            'Laboratory Grown Diamond'
        ];
        
        let isLabGrown = false;
        let finalTechForProduct = DEFAULT_VALUES.STRING;
        let specificTechFound = false;

        // Phase 0: Check description/inscription (e.g. laser inscription with [GIA LG] ... LABORATORY-GROWN)
        const uniqueDescriptionFieldKeys = Array.from(new Set(COLUMN_MAPPINGS.description || []));
        let descriptionCombined = '';
        for (const fieldKey of uniqueDescriptionFieldKeys) {
            const fieldValue = getFieldValue(rawProduct, fieldKey, uniqueDescriptionFieldKeys);
            if (fieldValue && String(fieldValue).trim()) {
                descriptionCombined += ' ' + String(fieldValue).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }
        const descriptionUpper = descriptionCombined.trim().toUpperCase();
        if (descriptionUpper) {
            if (descriptionUpper.includes('CHEMICAL VAPOR DEPOSITION') || /\bCVD\b/.test(descriptionUpper)) {
                isLabGrown = true;
                finalTechForProduct = 'CVD';
                specificTechFound = true;
            } else if (descriptionUpper.includes('HIGH PRESSURE HIGH TEMPERATURE') || /\bHPHT\b/.test(descriptionUpper)) {
                isLabGrown = true;
                finalTechForProduct = 'HPHT';
                specificTechFound = true;
            } else if (labGrownKeywords.some(keyword => descriptionUpper.includes(keyword))) {
                isLabGrown = true;
                if (!specificTechFound) finalTechForProduct = 'LABORATORY-GROWN';
            }
        }

        // Phase 0b: Discount in lab-grown range (-99.9..-90 or 90..99.9) often indicates lab-grown
        if (!isLabGrown) {
            const discountRaw = getFieldValue(rawProduct, 'discount', COLUMN_MAPPINGS.discount || []);
            const discountNum = discountRaw != null && discountRaw !== '' ? parseFloat(String(discountRaw).replace(/,/g, '.')) : NaN;
            if (!Number.isNaN(discountNum) && ((discountNum >= 90 && discountNum <= 99.9) || (discountNum <= -90 && discountNum >= -99.9))) {
                isLabGrown = true;
                if (!specificTechFound) finalTechForProduct = 'N/A';
            }
        }

        const uniquePotentialTechFieldKeys = Array.from(new Set(COLUMN_MAPPINGS.technology || []));

        // Phase 1: Look for specific CVD/HPHT
        for (const fieldKey of uniquePotentialTechFieldKeys) {
            const fieldValue = getFieldValue(rawProduct, fieldKey, COLUMN_MAPPINGS[fieldKey as keyof typeof COLUMN_MAPPINGS] || []);
            if (fieldValue) {
                const valueStrUpper = String(fieldValue).toUpperCase();
                if (valueStrUpper.includes("CHEMICAL VAPOR DEPOSITION") || /\bCVD\b/.test(valueStrUpper)) {
                    isLabGrown = true;
                    finalTechForProduct = "CVD";
                    specificTechFound = true;
                    break; 
                }
                if (valueStrUpper.includes("HIGH PRESSURE HIGH TEMPERATURE") || /\bHPHT\b/.test(valueStrUpper)) {
                    isLabGrown = true;
                    finalTechForProduct = "HPHT";
                    specificTechFound = true;
                    break;
                }
            }
        }

        // Phase 2: If no specific tech found, look for general lab-grown terms
        if (!specificTechFound) {
            for (const fieldKey of uniquePotentialTechFieldKeys) {
                const fieldValue = getFieldValue(rawProduct, fieldKey, COLUMN_MAPPINGS[fieldKey as keyof typeof COLUMN_MAPPINGS] || []);
                if (fieldValue) {
                    const valueStrUpper = String(fieldValue).toUpperCase();
                    if (labGrownKeywords.some(keyword => valueStrUpper.includes(keyword))) {
                        isLabGrown = true;
                        finalTechForProduct = "LABORATORY-GROWN";
                        break;
                    }
                }
            }
        }
        
        if (!isLabGrown) {
            product.technology = formatFieldValue('technology', n['technology']);
            stats.skippedNotLabGrown = (stats.skippedNotLabGrown || 0) + 1;
            return { success: false, reason: 'not_lab_grown' };
        }

        product.technology = formatFieldValue('technology', finalTechForProduct);

        // Check if product already exists
        const normalizedCert = product.certificateNumber ? product.certificateNumber.trim().toUpperCase() : '';
        const cachedProduct = normalizedCert && options.existingProductsMap
            ? options.existingProductsMap.get(normalizedCert)
            : undefined;

        let existingProduct: ExistingProductCacheEntry | null = cachedProduct ?? null;

        if (!existingProduct) {
            const fetchedProduct = await Product.findOne({
                company: companyId,
                certificateNumber: product.certificateNumber
            })
                .select('_id company onDeal sold isOnDealOrSold')
                .lean<{ _id: Types.ObjectId; company: Types.ObjectId; onDeal?: boolean; sold?: boolean; isOnDealOrSold?: boolean }>();

            if (fetchedProduct) {
                existingProduct = {
                    _id: fetchedProduct._id,
                    company: fetchedProduct.company,
                    isOnDealOrSold: fetchedProduct.isOnDealOrSold,
                    onDeal: fetchedProduct.onDeal,
                    sold: fetchedProduct.sold,
                };

                if (options.existingProductsMap && normalizedCert) {
                    options.existingProductsMap.set(normalizedCert, existingProduct);
                }
            }
        }

        if (existingProduct) {
            const isOnDealOrSold = Boolean(
                (existingProduct as { isOnDealOrSold?: boolean }).isOnDealOrSold ??
                (existingProduct as { onDeal?: boolean }).onDeal ??
                (existingProduct as { sold?: boolean }).sold
            );

            if (isOnDealOrSold) {
                stats.skippedExistingOnDealOrSold++;
                return { success: false, reason: 'Product is already on deal or sold' };
            }

            const existingId = existingProduct._id instanceof Types.ObjectId
                ? existingProduct._id
                : (String(existingProduct._id) as unknown as Types.ObjectId);

            await Product.findByIdAndUpdate(existingId, product);
            stats.updated++;

            if (options.existingProductsMap && normalizedCert) {
                options.existingProductsMap.set(normalizedCert, {
                    _id: existingId,
                    company: companyId as unknown as Types.ObjectId,
                    isOnDealOrSold: false,
                    onDeal: false,
                    sold: false,
                });
            }

            return {
                success: true,
                data: product,
                action: 'updated'
            };
        }

        // Cross-company "cheapest wins" check.
        // A cert+lab uniquely identifies a physical stone. If another company
        // already lists the same stone, only the cheaper listing should exist.
        const certInst = (product as Record<string, unknown>).certificateInstitute as string | undefined;
        const crossQuery: Record<string, unknown> = {
            certificateNumber: product.certificateNumber,
            company: { $ne: companyId },
        };
        if (certInst) crossQuery.certificateInstitute = certInst;

        const rival = await Product.findOne(crossQuery)
            .select('_id company price isOnDealOrSold onDeal sold')
            .lean<{ _id: Types.ObjectId; company: Types.ObjectId; price?: number; isOnDealOrSold?: boolean; onDeal?: boolean; sold?: boolean }>()
            .exec();

        if (rival) {
            const rivalLocked = Boolean(rival.isOnDealOrSold || rival.onDeal || rival.sold);

            if (rivalLocked) {
                // Cannot replace a stone that is in a deal or sold — skip
                stats.skippedCheaperExistsOtherCompany++;
                return { success: false, reason: 'duplicate_cert_rival_locked' };
            }

            const currentPrice = (product as Record<string, unknown>).price as number ?? Infinity;
            const rivalPrice = rival.price ?? Infinity;

            if (currentPrice >= rivalPrice) {
                // Rival is equal or cheaper — keep theirs, skip ours
                stats.skippedCheaperExistsOtherCompany++;
                return { success: false, reason: 'duplicate_cert_rival_cheaper' };
            }

            // Current is cheaper — delete rival and take over
            await Product.deleteOne({ _id: rival._id });
            stats.replacedOtherCompanyProduct++;
        }

        const createdProduct = await Product.create(product);
        stats.created++;

        return {
            success: true,
            data: product,
            action: 'created'
        };
         
    } catch (error: unknown) {
        stats.apiErrors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMeta = {
            certificateNumber: lastCertificateNumber,
            companyId,
            error: errorMessage,
        };

        if (errorMessage.includes('E11000')) {
            // Duplicate cert+lab from a race condition — not a true error, just a skip
            importDuplicatesCounter.inc({ stage: 'process_product' });
            stats.apiErrors--; // not a real api error
            stats.skippedCheaperExistsOtherCompany++;
            logger.info('[processProduct] Duplicate cert skipped (race condition)', errorMeta);
            return { success: false, reason: 'duplicate_cert_race' };
        } else {
            logger.error('[processProduct] Error processing product', errorMeta);
        }

        return {
            success: false,
            reason: `Processing error: ${errorMessage}`
        };
    }
}

/**
 * Normalize raw product data to standard format
 */
function normalizeProductData(rawProduct: RawProductData): RawProductData {
    const normalized: RawProductData = { ...rawProduct };

    // Convert string numbers to actual numbers
    if (normalized.carat && typeof normalized.carat === 'string') {
        normalized.carat = parseFloat(normalized.carat);
    }
    if (normalized.price && typeof normalized.price === 'string') {
        normalized.price = parseFloat(normalized.price.toString().replace(/[^0-9.-]/g, ''));
    }

    // Normalize strings
    if (normalized.color) {
        normalized.color = normalized.color.toString().trim().toUpperCase();
    }
    if (normalized.clarity) {
        normalized.clarity = normalized.clarity.toString().trim().toUpperCase();
    }

    return normalized;
}

/**
 * Validate product data
 */
function validateProductData(product: RawProductData): { isValid: boolean; reason?: string } {
    // Check required fields
    if (!product.stockNumber) {
        return { isValid: false, reason: 'Missing stock number' };
    }
    if (!product.certificateNumber) {
        return { isValid: false, reason: 'Missing certificate number' };
    }
    if (!product.shape) {
        return { isValid: false, reason: 'Missing shape' };
    }
    if (!product.carat || Number(product.carat) <= 0) {
        return { isValid: false, reason: 'Invalid carat weight' };
    }
    if (!product.price || Number(product.price) <= 0) {
        return { isValid: false, reason: 'Invalid price' };
    }
    if (!product.color) {
        return { isValid: false, reason: 'Missing color' };
    }
    if (!product.clarity) {
        return { isValid: false, reason: 'Missing clarity' };
    }

    // Validate against allowed values (white D–Z or fancy)
    const colorUpper = product.color.toString().trim().toUpperCase();
    if (colorUpper.length === 1 && !VALID_COLORS.includes(colorUpper)) {
        return { isValid: false, reason: 'Invalid color grade' };
    }
    if (colorUpper.length > 1 && !isFancyColor(product.color.toString().trim())) {
        return { isValid: false, reason: 'Invalid color grade' };
    }
    if (!VALID_CLARITIES.includes(product.clarity.toString().toUpperCase())) {
        return { isValid: false, reason: 'Invalid clarity grade' };
    }

    return { isValid: true };
}

/**
 * Update statistics based on skip reason
 */
function updateStatsForSkip(stats: ProductProcessingStats, reason: string): void {
    const reasonLower = reason.toLowerCase();
    
    if (reasonLower.includes('color')) {
        stats.skippedInvalidColor++;
    } else if (reasonLower.includes('clarity')) {
        stats.skippedInvalidClarity++;
    } else if (reasonLower.includes('price')) {
        stats.skippedInvalidPrice++;
    } else if (reasonLower.includes('carat')) {
        stats.skippedInvalidCarat++;
    } else if (reasonLower.includes('certificate')) {
        stats.skippedMissingCertNumber++;
    } else {
        stats.apiErrors++;
    }
}
