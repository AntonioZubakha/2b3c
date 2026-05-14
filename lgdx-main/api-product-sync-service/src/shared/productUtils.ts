import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IProduct } from '../types';
import Product from '../models/Product';
import { logger } from './logger';

// --- Constants for Validation ---
const MIN_PRICE = 0;
const MAX_PRICE = 150000;
/** Minimum supplier price (USD); products below this are skipped */
const MIN_SUPPLIER_PRICE = Number(process.env.MIN_SUPPLIER_PRICE) || 15;
const MIN_CARAT = 0.3;
const MAX_CARAT = 100;
const ALLOWED_CLARITIES = ['VS2', 'VS1', 'VVS2', 'VVS1', 'IF', 'FL'];

// --- Fancy (colored) diamond support (aligned with DiamondField.php / LgdealProductMapperDto.php) ---
/** White color grades D–Z (single letter). */
/** White (colorless) grades accepted for import: D–G only. Fancy colors are accepted separately. */
export const WHITE_COLOR_GRADES = Object.freeze(['D', 'E', 'F', 'G']);
/** Fancy color names for parsing (e.g. "Fancy Vivid Yellow"). */
const FANCY_COLOR_NAMES = ['Yellow', 'Pink', 'Blue', 'Green', 'Red', 'Purple', 'Orange', 'Violet', 'Gray', 'Black', 'Brown', 'Champagne', 'Cognac', 'Chameleon', 'Other'];
const FANCY_INTENSITY_NAMES = ['Faint', 'Very light', 'Light', 'Fancy light', 'Fancy', 'Fancy dark', 'Fancy intense', 'Fancy vivid', 'Fancy deep', 'Other'];
const FANCY_OVERTONE_NAMES = ['Red', 'Orangey Red', 'Reddish Orange', 'Pink', 'Pinkish Orange', 'Orange', 'Yellowish Orange', 'Yellow Orange', 'Orangey Yellow', 'Yellow', 'Yellow Brown', 'Greenish Yellow', 'Green Yellow', 'Yellow Green', 'Yellowish Green', 'Brown Greenish Yellow', 'Gray Greenish Yellow', 'Gray Yellowish Green', 'Gray Green', 'Green', 'Bluish Green', 'Blue Green', 'Green Blue', 'Greenish Blue', 'Blue', 'Violetish Blue', 'Bluish Violet', 'Other'];

/** True if value is a single white grade (D–Z). */
export const isWhiteColorGrade = (value: string): boolean => {
  const v = value.trim().toUpperCase();
  return v.length === 1 && WHITE_COLOR_GRADES.includes(v);
};

/** True if value is a generic placeholder (e.g. "Fancy", "Fancy Color") rather than a specific color like "Pink" or "Fancy Vivid Yellow". */
const isGenericFancyPlaceholder = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return v === 'fancy' || v === 'fancy color' || v === 'fc' || v === 'fancy colour';
};

/** True if value looks like a fancy (colored) diamond description. */
export const isFancyColor = (value: string): boolean => {
  if (!value || !value.trim()) return false;
  const v = value.trim();
  if (isWhiteColorGrade(v)) return false;
  const lower = v.toLowerCase();
  if (lower.includes('fancy')) return true;
  return FANCY_COLOR_NAMES.some(c => lower.includes(c.toLowerCase()));
};

/** Normalize white range like "S-T" or "D-E" to single letter. */
export const normalizeWhiteColorRange = (value: string): string => {
  const v = value.trim().toUpperCase();
  const rangeMatch = v.match(/^([A-Z])-?[A-Z]$/);
  if (rangeMatch) return rangeMatch[1];
  return v;
};

export interface ParsedFancyColor {
  color: string;
  intensity: string;
  overtone: string;
}

/** Escape for regex and sort by length descending so "Fancy vivid" matches before "Fancy". */
const toIntensityPattern = (): string => {
  const sorted = [...FANCY_INTENSITY_NAMES].sort((a, b) => b.length - a.length);
  return sorted.map(s => s.replace(/\s+/g, '\\s+')).join('|');
};

/** Parse "Fancy Vivid Yellow", "Fancy Intense Orange Yellow" etc. into color, intensity, overtone. */
export const parseFancyColorString = (value: string): ParsedFancyColor => {
  const v = value.trim();
  const intensityPat = toIntensityPattern();
  const colorPat = FANCY_COLOR_NAMES.filter(c => c !== 'Other').join('|');

  // Pattern: "Fancy Vivid Yellow" -> intensity + color
  const matchIntensityColor = v.match(new RegExp(`^(${intensityPat})\\s+(${colorPat})$`, 'i'));
  if (matchIntensityColor) {
    return {
      color: matchIntensityColor[2].trim(),
      intensity: matchIntensityColor[1].trim(),
      overtone: 'Other',
    };
  }

  // Pattern: "Fancy Intense Orange Yellow" -> intensity + overtone + color (multi-word)
  const overtonePat = [...FANCY_OVERTONE_NAMES].sort((a, b) => b.length - a.length).map(s => s.replace(/\s+/g, '\\s+')).join('|');
  const matchIntensityOvertoneColor = v.match(new RegExp(`^(${intensityPat})\\s+(${overtonePat})\\s+(${colorPat})$`, 'i'));
  if (matchIntensityOvertoneColor) {
    return {
      color: matchIntensityOvertoneColor[3].trim(),
      intensity: matchIntensityOvertoneColor[1].trim(),
      overtone: matchIntensityOvertoneColor[2].trim(),
    };
  }

  // Pattern: "Fancy Vivid Orangy Yellow" -> intensity + overtone (color stays in description)
  const matchIntensityOvertone = v.match(new RegExp(`^(${intensityPat})\\s+(${overtonePat})$`, 'i'));
  if (matchIntensityOvertone) {
    return {
      color: v,
      intensity: matchIntensityOvertone[1].trim(),
      overtone: matchIntensityOvertone[2].trim(),
    };
  }

  // Fallback: use full string as color
  return { color: v, intensity: 'Other', overtone: 'Other' };
};

const ANOMALOUS_PPC_LIMIT_1_CARAT = 500;
const ANOMALOUS_PPC_LIMIT_5_CARAT = 4000;
const ANOMALOUS_PPC_LIMIT_10_CARAT = 15000;
const ANOMALOUS_PPC_LIMIT_OVER_10_CARAT = 30000;
// --- End Constants ---

/**
 * Checks if a product with the same certificate number exists in the database
 * @param certificateNumber Certificate number to check
 * @param companyId ID of the current product's company
 * @returns Object with information about the existing product or null if the product is not found
 */
export const checkExistingProductByCertificate = async (certificateNumber: string, companyId: string) => {
  if (!certificateNumber) return null;
  
  // Search for a product with the same certificate number
  const existingProduct = await Product.findOne({
    certificateNumber: certificateNumber,
    // Do not exclude products in a deal, to check their status
  }).select('_id company price status certificateNumber certificateInstitute');
  
  if (!existingProduct) return null;
  
  return {
    exists: true,
    _id: existingProduct._id,
    company: existingProduct.company,
    price: existingProduct.price,
    status: existingProduct.status,
    certificateNumber: existingProduct.certificateNumber,
    certificateInstitute: existingProduct.certificateInstitute,
    inCurrentCompany: existingProduct.company.toString() === companyId,
    isOnDealOrSold: ['OnDeal', 'Sold'].includes(existingProduct.status)
  };
};

// Default values for different data types
export const DEFAULT_VALUES = {
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

// Shape mapping for normalization
export const SHAPE_MAPPING: Record<string, string[]> = {
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

// --- Pre-computed Reverse Map for Shape Normalization (Performance Optimization) ---
const SHAPE_REVERSE_MAP = new Map<string, string>();
for (const [standardShape, variations] of Object.entries(SHAPE_MAPPING)) {
  // The key itself is a valid variation
  SHAPE_REVERSE_MAP.set(standardShape.toUpperCase(), standardShape);
  for (const variation of variations) {
    SHAPE_REVERSE_MAP.set(variation.toUpperCase(), standardShape);
  }
}
// --- End Reverse Map ---

// Column mappings to identify fields in uploaded files
// The keys are the target field names in IProduct, values are possible header names in import files.
export const COLUMN_MAPPINGS: Record<keyof IProduct | string, string[]> = {
  shape: ['shape', 'SHP', 'Stone Shape', 'SHAPE NAME', 'Sh', 'SHA', 'Shape', 'SHAPENAME', 'S_NAME'],
  carat: ['carat', 'weight', 'Cts', 'Carats', 'WGT', 'SIZE', 'Stock', 'Stone Weight', 'Crts', 'CRT_WT', 'Weight', 'WEI', 'Wgt', 'WHT.', 'WHT', 'WT.', 'WT', 'CT.', 'CT', 'Ct. Wt.', 'Polish Cts.', 'Cts', 'CTS', 'Carat', 'CARAT', 'I_CARAT'],
  color: ['color', 'col', 'color_value', 'Color', 'CL.', 'COLOUR', 'Stone Color', 'Color type', 'COLORNAME', 'C_NAME'],
  // Separate column for fancy color (LgdealProductMapperDto: FColor => fancyColorValue; if set and color empty, use as color)
  fancyColorValue: ['FColor', 'fancy_color', 'Fancy Color', 'FancyColor', 'FAN_COLOR'],
  clarity: ['clarity', 'cla', 'purity', 'CLARITY', 'Clarity', 'Stone Clarity', 'PURITY', 'CLARI', 'CLA.', 'CLR', 'CLAR', 'CLARITYNAME', 'Q_NAME'],
  cut: ['cut', 'CUT-PROP', 'Cut Grade', 'CutGrade', 'Prop', 'Stone Cut', 'Cut', 'cutGrade', 'CT_NAME'],
  polish: ['polish', 'pol', 'Polish', 'Stone Polish', 'PO', 'Pol/Sym', 'POL or Pol/Sym', 'Pol', 'POL.', 'POLNAME', 'PO_NAME'],
  symmetry: ['symmetry', 'sym', 'Symmetry', 'Stone Symmetry', 'Symn', 'Symm', 'SYM.', 'Sym', 'SY', 'SYMNAME', 'SY_NAME'],
  price: ['price', 'total price', 'cost', 'amount', 'net_value', 'total_price', 'final_price', 'totalprice', 'PartyValue', 'SaleAmt', 'PriceTotal', 'Amount U$', 'sell_amt', 'net_price', 'VALUE', 'FINAL_AMOUNT', 'usdTotal', 'priceListUSD', 'Price', 'Net Rate', 'Total price of diamond', 'System Amount', '$Amount', 'Amount($)', '$ Amount', 'TOTAL', 'Total price', 'TotalPrice', 'T-AMT', 'AMOUNT', 'T.Amt', 'TOTAL $', 'Total Value', 'AMT', 'Total amt', 'Amount', 'Final Amount', 'Final Price', 'FinalAmount', 'Amt $', 'Total Price', 'SALEAMOUNT', 'WEBSITEAMOUNT'],
  pricePerCarat: ['price_per_carat', 'ppc', 'per_carat_price', 'price per carat', 'cost per carat', 'priceperct', 'price/ct', 'PartyRate', 'SaleRate', 'PricePerCarat', 'Price $/cts', 'Price per carat', 'pricePerCts', 'pricePerCt', 'P/CT', '$/Ct', 'price_per_caret', 'usdPerCarat', 'System Price', 'Price_x002F_Ct', 'PRICE_PER_CTS', 'Rate $/CT', 'PPC', 'Price$/cts', 'price_x002f_ct', '$ / ct', 'Price/Carat', 'P-CT', 'Price / Carat', 'Price / Crts', 'Price/Cts', 'Price/Ct', '$/ct', 'SALEPRICEPERCARAT', 'WEBSITEPRICEPERCRT', 'PRICEPERCRT'],
  location: ['location', 'location_country', 'country', 'city', 'state', 'COP', 'Loc', 'Dianmond Country', 'Branch', 'Branch Name', 'Certy Location', 'Diamond Location', 'Location country', 'Country Location', 'Location', 'COU_NAME', 'Stone Location', 'LOCTION', 'Country', 'Location city', 'city', 'Location region', 'Location ZIP', 'LOCATIONNAME', 'COUNTRY'],
  technology: ['technology', 'type', 'growth_type', 'diamond_type', 'growthType', 'Treatment', 'Treatment_value', 'REPORT_COMMENT', 'StoneType', 'Description/Comments', 'CVD_HPHT', 'grown_type', 'growth type', 'Stone Type', 'growth technology', 'growthMethod', 'GROWN TECHNOLOGY', 'TREATMENT', 'LGType', 'Diamon Type', 'GROWN', 'Type (CVD or HPHT)', 'STONE_TYPE', 'Diamond Type', 'diamondType', 'CVD/HPHT', 'TYPES', 'Growth Process', 'Growth Type', 'Technology', 'CVD_HPHT', 'enhance_type', 'Treatment_value', 'SUBCATAGORY', 'DIAMONDTYPE'],
  photo: ['photo', 'image', 'diamond_image', 'image_url', 'picture_url', 'certificate_image', 'imagelink', 'image link', 'diamond image', 'diamond image link', 'real_image', 'DiamondImageURL', 'DiamondImage', 'Image', 'REAL_IMAGE', 'Stone_Img_url', 'ImgURL', 'ImageBLink', 'Photo', 'IMAGE LINK', 'imageUrl', 'IMAGE-LINK', 'ImageLink', 'VIEW IMAGE', 'View Image-', 'IMAGEURL', 'PHOTOLINK'],
  video: ['video', 'diamond_video', 'video_url', 'movie_url', 'videolink', 'diamond video', 'video link', 'diamond video link', 'DiamondVideoURL', 'DiamondVideo', 'ImageURL3D', 'videoUrl', 'VIDEO_DOWNLOAD_LINK', 'URL|VIDEO', 'Video_url', 'VIEW LINK', 'V360', 'VIEW VIDEO', 'View Video-', 'Vid', 'Video', 'VIDEO LINK', 'VideoLink', 'VIDEO_LINK', 'VIDEO-LINK', 'video_url', 'VIDEOURL', 'DOWNLOADVIDEOURL', 'diamondVideo', 'diamondVideos', 'VIDEOLINK1', 'VIDEOLINK2'],
  measurements: ['measurements', 'dims', 'dimensions', 'measure', 'size', 'meas', 'Measurement', 'Measure', 'Measurement (Lenght x Width x Height)', 'Diameter & Depth', 'DIAMETERS', 'DIAM', 'L-W-D', 'MEASUREANT', 'MESS.', 'DIA', 'Measurements', 'Stone measurements', 'MEASUREMENT', 'MEASUREMENTS'],
  measurement1: ['measurement1', 'measurement 1', 'meas1', 'x1', 'length', 'dim1', 'l', 'len', 'measurements_length', 'Measurement 1', 'M1', 'Mes1', 'DIA_MN', 'L mm', 'L', 'Length', 'LENGTH'],
  measurement2: ['measurement2', 'measurement 2', 'meas2', 'x2', 'width', 'dim2', 'w', 'wid', 'measurements_width', 'Measurement 2', 'M2', 'Mes2', 'DIA_MX', 'W mm', 'Width', 'W', 'WIDTH'],
  measurement3: ['measurement3', 'measurement 3', 'meas3', 'x3', 'height', 'depth', 'dim3', 'h', 'measurements_depth', 'Measurement 3', 'M3', 'Mes3', 'HT', 'H mm', 'H', 'D', 'Depth', 'HEIGHT'],
  ratio: ['ratio', 'length_width_ratio', 'lw_ratio', 'l/w', 'length/width', 'proportions', 'RATIO'],
  tableSize: ['table size', 'table', 'table_percent', 'table %', 'table_per', 'Table size', 'tablePerc', 'TablePercent', 'table_percent', 'tablePt', 'Tab_x0025_', 'Table_Diameter_Per', 'Stone table size', 'Table Prct', 'Table', 'TABLE_PER', 'Tab', 'TBL', 'Table Percent', 'Tab %', 'Table %', 'Table%', 'Tab%', 'TA %', 'TA%', 'TABLEPER'],
  crownHeight: ['crown height', 'crown', 'crown_height', 'ch', 'Crown height', 'CR_x0020_Hgt', 'crHt', 'CrownHeight', 'Crown', 'Crown Ht', 'Crown %', 'C.Height', 'Cro %', 'CH', 'CRWHEIGHT_PER'],
  pavilionDepth: ['pavilion depth', 'pavilion', 'pavilion_depth', 'ph', 'Pavilion depth', 'PV_x0020_Hgt', 'PavilionDepth', 'pavDp', 'PavillionHeight', 'Pavilion', 'PAV.', 'P.Depth', 'Pav %', 'Pavillion Height', 'Pavilion Height', 'Pavilion Dep.', 'PH', 'PAVHEIGHT', 'PAVDEPTH_PER'],
  girdle: ['girdle', 'girdle_condition', 'girdle_thin', 'girdle_thick', 'girdle_per', 'girdle %', 'Girdle', 'Girdle_x0025_', 'Girdle Percent', 'girdlePt', 'Girdle%', 'Girdle_Per', 'GRIDLE', 'gridlePer', 'Girdle %', 'girdle_percent', 'Girdle Name', 'Girdle Thin', 'Girdle Condition', 'GIRDLEDESC', 'GIRDLE_NAME', 'GIRDLE_CONDITION', 'GIRDLEPER'],
  culet: ['culet', 'culet_condition', 'culet_size', 'Culet', 'culet_size', 'Culet_Size_ID', 'CUTLET', 'Culet condition', 'Culet Size', 'CuletSize', 'CULET_NAME', 'CULETPER'],
  totalDepth: ['total depth', 'depth_percent', 'depth %', 'dp', 'depth_per', 'total_depth', 'total_depth_percent', 'depth_percentage', 'DP', 'TotDepth_x0020__x0025_', 'Total_Depth_Per', 'DepthPer', 'depthPerc', 'depthPt', 'TotDepth %', 'Stone depth size', 'Total Depth', 'Depth Prct', 'T.DEPTH', 'T.DEP', 'TOTALDEPTH', 'Depth %', 'Depth%', 'Dep %', 'TDep', 'T.D', 'TD', 'TD%', 'TD %', 'Depth Percent', 'DepthPercent', 'depth_percent', 'DEPTH_PER', 'DEPTHPER', 'TOTDEPTH_PER'],
  fluorescence: ['fluorescence', 'flour', 'fluorescence_intensity', 'fluorescence_color', 'Fluorescence', 'Stone Fluorescence', 'FL', 'Fluorescent', 'FLUORESCENCE intensity', 'Fluorescence Intensity', 'Fluorescence Color', 'Flau', 'Fls', 'FLORO', 'fluor_intensity', 'Fluor. Int.', 'FLO', 'FLOU', 'Flur', 'FLURO', 'Flou.', 'FLR', 'FLOURO', 'FlrIntens', 'Fluor', 'Fluo', 'fl', 'Fl', 'Fl.', 'FLS.', 'FLNAME', 'FL_NAME', 'FLOCOL'],
  ha: ['h&a', 'hearts and arrows', 'ha', 'heart_arrow', 'H&A', 'HnA_ID', 'HNA', 'HEART', 'HRT_NAME'],
  // "certificate" / Certificate column may be lab (CSV) or report no (JSON); getFieldValue disambiguates vs certificateNumber.
  certificateInstitute: ['certificate institute', 'lab', 'LAB', 'grading_lab', 'laboratory', 'Certificate Institute', 'Certification Institute', 'Certificat Institute', 'Cert', 'LABNAME', 'Lab', 'Laboratory', 'Institute', 'INST.', 'certificate', 'CERTIFICATE'],
  // Order matters: prefer unambiguous cert-ID columns (Cert.No, LabNo) before generic 'cert' to avoid
  // using a non-unique column (e.g. "Cert" = certificate type) as certificate number and causing duplicate_in_source.
  certificateNumber: [
    'certificate',
    'cert.no', 'Cert.No', 'LabNo', 'Certificat', 'Lab_Report_No', 'certificate_number', 'certificate number', 'certificate no', 'cert_no', 'certno', 'cert_number', 'certificate.number',
    'cert no', 'certificate #', 'cert #', 'report no', 'report number', 'report #', 'report', 'report_number', 'reportNo', 'REPORT_NO', 'report_no', 'CertificateNo', 'CERTNO',
    'Certificate_x0020_No', 'certiNo', 'Lab Report No', 'Certificate numbar', 'Certificate number', 'Repor #', 'certificate_x0020_no', 'ReportNo', 'CERTY NUM', 'Certificate Number', 'VIEW CERTY', 'CERTY NO.', 'CERTY NO', 'CERTY', 'CERTIFICATE_NO', 'Certificate No', 'Certificate No.', 'Certi. No', 'Certi', 'Cert#', 'CERT_NO', 'Cert. No', 'Report #', 'Cert. No.', 'Cert No', 'cert_num', 'Cert Number', 'CertNo', 'CERT NO.', 'Report Number', 'REPORT_NO', 'REPORT NUM', 'Report No', 'REPORT NO.', 'REPORT', 'Certi #', 'Certi No', 'Certificate #',
    // SOAP/XML (rijiyagems / axoneinfotech)
    'LABREPORTNO',
    'cert'  // last: avoid matching non-unique columns like "Cert" (certificate type/lab)
  ],
  overtone: ['overtone', 'Overtone', 'ColorOvertone', 'fancy_color_overtone', 'OVER TONE', 'FCOverton', 'Fancy Color Overtone', 'FancyColorOvertone', 'FAN_COL_OVERTONE'],
  intensity: ['intensity', 'Intensity', 'fancy_color_intensity', 'ColorIntensity', 'FancyColorIntens', 'FCIntens', 'FancyColorIntensity', 'Fancy Color Intensity', 'FAN_COL_INTENSITY'],
  status: ['status', 'availability', 'stock status', 'product status', 'avail', 'StnStatus', 'Result', 'Status', 'StockStatus', 'Availability', 'STNSTATUS', 'STATUS', 'WebStatus'],
  companyId: ['company_id', 'supplier_id'],
  companyName: ['company_name', 'supplier_name'],
  discount: ['discount', 'discount_percent', 'disc', 'Disc_x0020__x0025_', 'Reference Price Discount (R-)', 'discount_main', 'discounts', 'Reference Price Discount (R)', 'Discount(R)', 'Discount (R)', 'FINAL_DISCOUNT', 'discPerc', 'Discount (%)', 'Rapnet Discount', 'DISCA.', 'System Discount', 'Rapnet discount', 'Stone discount from Rap', 'Reference Price Discount(R-)', 'GPer', 'DISCOUNT(%)', 'Rap disc. %', 'RapBack', 'RapBackValue', 'Rap%', 'Rap %', 'Discounts', 'Disc %', 'DISC', 'Rapnet  Discount %', 'Rapnet  Discount', 'Per', 'Ref %', 'Back', 'DiscountRapRate', 'BACK %', 'BACK%', '% Off RAP', 'Disc%', 'Discount', 'Discount%', 'Discount %', 'DISC.', 'Discount Percent', 'Dis %', 'Dis%', 'Off %', 'Off%', 'DIS', 'SaleDisc', 'SaleDis', 'RapnetDiscount', 'PartyDisc', 'SALEDISCOUNT', 'WEBSITEDISCOUNT'],
  reportLink: ['report_link', 'certificate_link', 'cert_link', 'gia_report_link', 'CERTIFICATE URL', 'Inscription #', 'LINK', 'CERTIFICATE_LINK', 'CERTI_LINK', 'CertificateImage', 'CERTURL', 'VERIFYCERTURL', 'REPORTLINK'],
  image360: ['image360', '360view', '360_image', '360_video'],
  description: ['description', 'notes', 'comment', 'details', 'Lab_Report_Comment', 'CERT_COMMENTS', 'REPORT_COMMENT', 'laserInscription', 'laser inscription', 'Laser Inscription', 'Report Comments', 'KeyToSymbols', 'Key_x0020_To_x0020_Sym', 'Report Comment', 'Inscription', 'Compnay Comment', 'Comment', 'IGI Comments', 'REMARK', 'Additional Information', 'Info', 'Legends', 'Legend', 'Cert Comment', 'certComment', 'cert_comment', 'Comments', 'Description/Comments', 'COMMENTS', 'KEYTOSYMB', 'REPORT_TYPE', 'INSCRIPTION'],
  lotNumber: ['lot_number', 'lot_no', 'Ref.No.', 'SKU', 'stockNo', 'STNO', 'stock_num', 'stockId', 'stock_id', 'Stone_x0020_Id', 'Stone_No', 'LOAT_NO', 'Bar Code', '#', 'NO', 'Sr No', 'SR_NO', 'Sr #', 'Name', 'LOT NO.', 'Lot No', 'Lot #', 'Lot#', 'PKT.NO', 'STOCK ID', 'Stock Ref', 'Packet No', 'PACKET_ID', 'Stock#', 'Stock #', 'Stock No.', 'Stock No', 'Stone ID', 'STK REFF. NO.', 'STK ID', 'STOCK_ID', 'STOCKNO', 'PARTYSTOCKNO', 'PKTID'],
  additionalInfo: ['additional_info', 'extra_info'],
};

// Common supplier variants for media arrays/fields.
COLUMN_MAPPINGS.photo.push('diamondImages', 'diamondImage', 'diamond_images');

type ParserAliasesMap = Record<string, string[]>;
const BASE_COLUMN_MAPPINGS: ParserAliasesMap = Object.fromEntries(
  Object.entries(COLUMN_MAPPINGS).map(([field, values]) => [field, [...values]]),
);
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

const rebuildAliasConflicts = (): void => {
  ACTIVE_ALIAS_CONFLICTS.clear();
  const reverse = new Map<string, Set<string>>();
  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    for (const alias of aliases) {
      const normalized = alias.trim().toLowerCase();
      if (!normalized) continue;
      const fields = reverse.get(normalized) || new Set<string>();
      fields.add(field);
      reverse.set(normalized, fields);
    }
  }
  for (const [alias, fields] of reverse.entries()) {
    if (fields.size > 1) ACTIVE_ALIAS_CONFLICTS.set(alias, Array.from(fields.values()));
  }
};

export const applyGlobalParserAliases = (aliases: ParserAliasesMap): void => {
  const merged = mergeParserAliases(aliases);
  applyMergedMappings(merged);
  rebuildAliasConflicts();
};

export const getParserAliasConflicts = (): Record<string, string[]> => {
  return Object.fromEntries(ACTIVE_ALIAS_CONFLICTS.entries());
};

rebuildAliasConflicts();

/**
 * Normalize shape name based on predefined mapping.
 * Strips trailing parenthetical modifiers (e.g. " (H&A)", " (Hearts and Arrows)") so
 * "ROUND (H&A)" normalizes to "Round".
 * @param shape The shape value to normalize.
 * @returns Normalized shape name or original if not found.
 */
export const normalizeShape = (shape?: string | null): string => {
  if (!shape) return DEFAULT_VALUES.STRING;
  const trimmed = shape.trim();
  const trimmedUpperShape = trimmed.toUpperCase();

  // O(1) lookup using the pre-computed reverse map
  let result = SHAPE_REVERSE_MAP.get(trimmedUpperShape);
  if (result !== undefined) return result;

  // Try stripping trailing parenthetical (e.g. "ROUND (H&A)" -> "ROUND", "Round (Hearts and Arrows)" -> "Round")
  const withoutParens = trimmed.replace(/\s*\([^)]*\)\s*$/i, '').trim();
  if (withoutParens && withoutParens.toUpperCase() !== trimmedUpperShape) {
    result = SHAPE_REVERSE_MAP.get(withoutParens.toUpperCase());
    if (result !== undefined) return result;
  }

  return trimmed;
};

/**
 * Normalize clarity value.
 * @param clarity The clarity value to normalize.
 * @returns Normalized clarity value.
 */
export const normalizeClarity = (clarity?: string | null): string => {
  if (!clarity) return DEFAULT_VALUES.STRING;
  return clarity.trim().toUpperCase().replace(/\s+/g, '');
};

/**
 * Normalize grading values (Cut, Polish, Symmetry).
 * @param grade The grade value to normalize (e.g., "Very Good", "VG").
 * @returns Normalized grade value (e.g., "VERY GOOD").
 */
export const normalizeGrade = (grade?: string | null): string => {
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

/**
 * Normalize color value.
 * @param color The color value to normalize.
 * @returns Normalized color value.
 */
export const normalizeColor = (color?: string | null): string => {
  if (!color) return DEFAULT_VALUES.STRING;
  return color.trim().toUpperCase();
};

/**
 * Normalize cut value (specific alias for normalizeGrade for clarity).
 * @param cut The cut value to normalize.
 * @returns Normalized cut value.
 */
export const normalizeCut = (cut?: string | null): string => {
  return normalizeGrade(cut);
};

/**
 * Marketplace rule: FR/F (Fair) is not allowed for Cut/Polish/Symmetry.
 * If any of these grades is FR/F/FAIR -> the product must be skipped (not synced).
 */
const hasDisallowedMarketplaceGrade = (raw: unknown): boolean => {
  if (raw === null || raw === undefined) return false;
  const v = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  return v === 'FR' || v === 'F' || v === 'FAIR';
};

/**
 * Normalizes certificate institute names.
 * @param institute The raw institute name.
 * @returns Normalized institute name or original if not in map.
 */
export const normalizeInstitute = (institute?: string | null): string => {
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

/**
 * Determines stone type (e.g., "diamond", "fancy diamond").
 * @param color The color of the stone.
 * @returns The determined stone type.
 */
export const determineStoneType = (color?: string | null): string => {
  if (!color) return 'diamond';
  const colorLower = color.toLowerCase();
  const fancyKeywords = ['pink', 'blue', 'yellow', 'green', 'red', 'orange', 'purple', 'violet', 'brown', 'gray', 'black', 'fancy'];
  if (fancyKeywords.some(keyword => colorLower.includes(keyword))) {
    return 'fancy diamond';
  }
  return 'diamond';
};

/**
 * Formats a field value to a string, trimming whitespace.
 * @param fieldName The name of the field (for potential future specific formatting).
 * @param value The value to format.
 * @returns The formatted string value or default string if empty.
 */
export const formatFieldValue = (fieldName: string, value: unknown): string => {
  if (value === null || typeof value === 'undefined') return DEFAULT_VALUES.STRING;
  const stringValue = String(value).trim();
  if (!stringValue) return DEFAULT_VALUES.STRING;
  return stringValue;
};

/**
 * Validates a URL. Returns the URL if it starts with http/https, otherwise an empty string.
 * @param url The URL to validate.
 * @returns Validated URL or empty string.
 */
export const validateUrl = (url?: string | null): string => {
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
    for (const key of ['url', 'link', 'src', 'href']) {
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

export interface MeasurementResult {
  measurement1: number;
  measurement2: number;
  measurement3: number;
  raw?: string;
}

/**
 * Parses measurements from a string (e.g., "1.2x3.4x5.6" or "1.2 - 3.4 - 5.6").
 * @param measurements The measurement string.
 * @returns An object with measurement1, measurement2, measurement3.
 */
export const parseMeasurements = (measurements?: string | number | null): MeasurementResult => {
  const defaultResult: MeasurementResult = { measurement1: 0, measurement2: 0, measurement3: 0 };
  if (measurements === null || typeof measurements === 'undefined') return defaultResult;

  const measurementsStr = String(measurements).trim();
  if (!measurementsStr) return defaultResult;

  defaultResult.raw = measurementsStr;

  const parts = measurementsStr.split(/[xX\*\-\s,\/]+/).map(part => parseFloat(part.trim())).filter(num => !isNaN(num));

  return {
    measurement1: parts[0] || 0,
    measurement2: parts[1] || 0,
    measurement3: parts[2] || 0,
    raw: measurementsStr
  };
};

/**
 * Finds a matching internal field name for a given header name from an import file.
 * @param headerName The header name from the uploaded file.
 * @returns The corresponding internal field name or the original header if no specific match.
 */
export const findMatchingField = (headerName?: string | null): string | null => {
  if (!headerName) return null;
  const normalizedHeader = headerName.trim().toLowerCase();

  for (const [internalField, possibleHeaders] of Object.entries(COLUMN_MAPPINGS)) {
    if (possibleHeaders.some(ph => ph.toLowerCase() === normalizedHeader)) {
      return internalField;
    }
  }
  return headerName;
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

/**
 * Retrieves a field value from a product object (with case-insensitive keys).
 * @param product The raw product data object.
 * @param primaryField The internal, standardized field name.
 * @param alternativeFields Alternative field names to check.
 * @returns The value found, or undefined if not present.
 */
export const getFieldValue = (product: RawProductData, primaryField: string, alternativeFields: string[] = []): unknown => {
  if (!product || typeof product !== 'object') return null;

  // 1. Direct key lookup for primaryField (case-sensitive)
  if (product[primaryField] !== undefined) return product[primaryField];

  // 2. Case-insensitive lookup for primaryField
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

  // 3. Try all alternative fields
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
  
  // 4. Fallback to COLUMN_MAPPINGS based search
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

export const STANDARD_DIAMOND_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const STANDARD_DIAMOND_CLARITIES = [
  'IF', 'FL',
  'VVS1', 'VVS2',
  'VS1', 'VS2',
  'SI1', 'SI2', 'SI3',
  'I1', 'I2', 'I3',
  'P1', 'P2', 'P3'
];

export interface ValidationResult {
  isValid: boolean;
  normalizedValue: string;
  originalValue?: string | null;
}

/**
 * Validates diamond color for import: accepts white (D–Z single letter) and fancy (colored) descriptions.
 * @param color The color to validate.
 * @returns An object with normalized color and validity.
 */
export const validateDiamondColor = (color?: string | null): ValidationResult => {
  const originalValue = color;
  if (!color || !String(color).trim()) {
    return { normalizedValue: DEFAULT_VALUES.STRING, isValid: false, originalValue };
  }
  const trimmed = String(color).trim();
  const normalized = normalizeWhiteColorRange(trimmed).toUpperCase();

  // White: single letter D–Z
  if (normalized.length === 1 && WHITE_COLOR_GRADES.includes(normalized)) {
    return { normalizedValue: normalized, isValid: true, originalValue };
  }
  // Fancy: any non-empty description (Fancy Yellow, etc.)
  if (isFancyColor(trimmed)) {
    return { normalizedValue: trimmed, isValid: true, originalValue };
  }
  // Unknown single letter or invalid
  return { normalizedValue: trimmed, isValid: false, originalValue };
};

/**
 * Validates product status.
 * @param status The status string to validate.
 * @returns An object with normalized status and validity.
 */
export const validateProductStatus = (status?: string | null): ValidationResult => {
  const originalValue = status;
  if (!status) {
    return { normalizedValue: 'available', isValid: true, originalValue };
  }
  const normalizedStatus = String(status).trim().toLowerCase();
  
  // GA = available (OK). HOLD, SOLD, MEMO = not OK (skipped).
  const allowedToNormalize: string[] = ['available', '1', 'on stock', 'onstock', 'on hand', 'onhand', 'in stock', 'instock', 'stock', 'yes', 'true', 'g', 'a', 's', 'ga', 'да'];
  
  if (allowedToNormalize.includes(normalizedStatus)) {
    return { normalizedValue: 'available', isValid: true, originalValue };
  }
  
  return { normalizedValue: status.trim(), isValid: false, originalValue }; 
};

export interface ParsedLocation {
  country: string;
  city: string;
  region: string;
  original: string;
}

/**
 * Parses a location string into a structured location object.
 * @param locationInput The raw location string.
 * @returns A structured location object.
 */
export const parseLocationString = (locationInput?: string | number | null): ParsedLocation => {
  const original = String(locationInput || DEFAULT_VALUES.STRING).trim();
  const defaultLocation: ParsedLocation = { country: DEFAULT_VALUES.STRING, city: DEFAULT_VALUES.STRING, region: DEFAULT_VALUES.STRING, original };

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
 * Calculates price per carat.
 * @param price Total price.
 * @param carat Weight in carats.
 * @returns Price per carat, or 0 if input is invalid.
 */
export const calculatePricePerCarat = (price?: number | string | null, carat?: number | string | null): number => {
  const numPrice = parseFloat(String(price));
  const numCarat = parseFloat(String(carat));

  if (isNaN(numPrice) || isNaN(numCarat) || numPrice <= 0 || numCarat <= 0) {
    return DEFAULT_VALUES.NUMBER;
  }
  return parseFloat((numPrice / numCarat).toFixed(2));
};

// Interface for the raw product data from CSV/XLSX
export interface RawProductData {
  [key: string]: unknown;
}

// Interface for the processed product data ready for DB
export interface ProcessedProductData extends Partial<IProduct> {
  _id?: mongoose.Types.ObjectId;
  company?: mongoose.Types.ObjectId;

  // Explicitly list fields from IProduct that are definitely processed
  sku?: string;
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
  
  // Additional fields that might be populated during processing
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
  
  // Fields that exist in the code but might not be in IProduct
  stoneType?: string;
  sold?: boolean;
  marketPrice?: number;
  marketPricePerCarat?: number;
}

export const validateDiamondShape = (shape?: string | null): string => {
  if (!shape) return DEFAULT_VALUES.STRING; 
  const normalized = normalizeShape(shape);
  if (!normalized) return DEFAULT_VALUES.STRING;

  if (SHAPE_MAPPING[normalized]) {
    return normalized;
  }
  for (const standardShapeKey of Object.keys(SHAPE_MAPPING)) {
    if (SHAPE_MAPPING[standardShapeKey].map(s => s.toUpperCase()).includes(normalized.toUpperCase())) {
      return standardShapeKey;
    }
  }
  return normalized;
};

export const validateDiamondClarity = (clarity?: string | null): string => {
  if (!clarity) return DEFAULT_VALUES.STRING; 
  const normalized = normalizeClarity(clarity);
  if (!normalized) return DEFAULT_VALUES.STRING;

  if (STANDARD_DIAMOND_CLARITIES.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_VALUES.STRING; 
};

// Define the Stats interface based on its usage in the JS version
export interface ProductProcessingStats {
  // Fields updated by processProduct (non-optional as they are directly manipulated)
  skippedInvalidStatus: number;
  skippedInvalidColor: number;
  skippedInvalidClarity: number;
  skippedInvalidPrice: number;
  skippedInvalidCarat: number;
  skippedMissingMedia: number;
  skippedMissingCertNumber: number;
  skippedNotLabGrown: number;
  skippedAnomalousPricePerCarat: number;
  skippedInvalidData: number; // Products with disallowed grades (FR/F)

  // Common lifecycle counts (non-optional, typically initialized to 0)
  processed: number;
  created: number;
  updated: number;
  deletedStale: number;

  // Common skipped reasons (non-optional, typically initialized to 0)
  skippedByBlacklist: number;
  skippedExistingOnDealOrSold: number;
  skippedByDuplicateInSource: number;
  apiErrors: number;
  skippedByApiFilter: number;

  // Fields specific to sources or advanced scenarios (optional)
  totalFromApi?: number;
  totalUploaded: number;
  replacedOtherCompanyProduct: number;
  skippedCheaperExistsOtherCompany: number;

  // General optional fields
  duration?: string;
  reportNotes?: string[] | string | null;
  errors?: Array<{
    message: string;
    certificateNumber?: string;
    rawDataSource?: unknown;
    stack?: string;
    [key: string]: unknown;
  }>;

  // Allow any other string keys for extensibility (stats can have dynamic fields)
  [key: string]: string | number | boolean | Date | unknown[] | null | undefined | Array<{
    message: string;
    certificateNumber?: string;
    rawDataSource?: unknown;
    stack?: string;
    [key: string]: unknown;
  }>;
}

// --- Category Enums and Functions (copied from server/src/utils/categoryStatsUtils.ts) ---
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
  W_100_01_PLUS = '100.01+'
}

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

export const determineShapeCategory = (shape: string): ShapeCategory => {
  const normalizedShape = shape.toUpperCase().trim();

  // Проверяем точные совпадения сначала
  switch (normalizedShape) {
    case 'ROUND':
      return ShapeCategory.ROUND;
    case 'OVAL':
      return ShapeCategory.OVAL;
    case 'PEAR':
      return ShapeCategory.PEAR;
    case 'CUSHION':
      return ShapeCategory.CUSHION;
    case 'EMERALD':
      return ShapeCategory.EMERALD;
    case 'RADIANT':
      return ShapeCategory.RADIANT;
    case 'PRINCESS':
      return ShapeCategory.PRINCESS;
    case 'MARQUISE':
      return ShapeCategory.MARQUISE;
    case 'HEART':
      return ShapeCategory.HEART;
    case 'ASSCHER':
      return ShapeCategory.ASSCHER;
    default:
      return ShapeCategory.FANCY;
  }
};

export const determineWeightCategory = (carat: number): WeightCategory => {
  if (isNaN(carat) || carat === null || carat === undefined || carat < 0) {
    return WeightCategory.W_0_00_0_29;
  }
  
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
};

export const determineClarityCategory = (clarity: string): ClarityCategory => {
  const normalizedClarity = clarity.toUpperCase().trim();
  
  switch (normalizedClarity) {
    case 'FL':
      return ClarityCategory.FL;
    case 'IF':
      return ClarityCategory.IF;
    case 'VVS1':
      return ClarityCategory.VVS1;
    case 'VVS2':
      return ClarityCategory.VVS2;
    case 'VS1':
      return ClarityCategory.VS1;
    case 'VS2':
      return ClarityCategory.VS2;
    default:
      if (normalizedClarity.includes('VVS')) {
        return normalizedClarity.includes('1') ? ClarityCategory.VVS1 : ClarityCategory.VVS2;
      } else if (normalizedClarity.includes('VS')) {
        return normalizedClarity.includes('1') ? ClarityCategory.VS1 : ClarityCategory.VS2;
      } else if (normalizedClarity.includes('FL')) {
        return ClarityCategory.FL;
      } else if (normalizedClarity.includes('IF')) {
        return ClarityCategory.IF;
      }
      return ClarityCategory.VS2;
  }
};

export const determineColorCategory = (color?: string | null): ColorCategoryEnum | null => {
  if (!color) return null;
  const normalizedColor = color.trim().toUpperCase();
  if (Object.values(ColorCategoryEnum).includes(normalizedColor as ColorCategoryEnum)) {
    return normalizedColor as ColorCategoryEnum;
  }
  return null;
};

/**
 * Calculate Total Depth % based on diamond shape and measurements
 * @param shape Diamond shape (normalized)
 * @param measurement1 Length
 * @param measurement2 Width  
 * @param measurement3 Height/Depth
 * @returns Total Depth % or 0 if calculation not possible
 */
export const calculateTotalDepthPercent = (
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

/**
 * Process a product object into standardized format, matching server logic exactly.
 */
export const processProduct = async (
  rawProductData: RawProductData, 
  companyIdString: string,
  stats: ProductProcessingStats,
  options: { 
    allowMissingMedia?: boolean;
    marketPriceCache?: Map<string, number>;
  } = {}
): Promise<{ data: ProcessedProductData | null; reason: string | null }> => {
  
  const companyObjectId = new mongoose.Types.ObjectId(companyIdString);

  const product: ProcessedProductData = {
    company: companyObjectId,
  };

  // Check product status - if not valid, update stats and return
  const statusField = getFieldValue(rawProductData, 'status', COLUMN_MAPPINGS.status);
  const statusValidation = validateProductStatus(typeof statusField === 'string' ? statusField : null);
  if (!statusValidation.isValid) {
    stats.skippedInvalidStatus++;
    return { data: null, reason: 'invalid_status' };
  }
  product.status = statusValidation.normalizedValue;

  // Color: merge "Color" and "Fancy Color" columns. Prefer FancyColor when Color is generic ("Fancy") and FancyColor has specific value (e.g. "Pink").
  const rawColor = getFieldValue(rawProductData, 'color', COLUMN_MAPPINGS.color);
  const rawFancy = getFieldValue(rawProductData, 'fancyColorValue', COLUMN_MAPPINGS.fancyColorValue);
  const trimColor = typeof rawColor === 'string' ? rawColor.trim() : '';
  const trimFancy = typeof rawFancy === 'string' ? rawFancy.trim() : '';
  const rawColorMerged =
    trimColor && (isGenericFancyPlaceholder(trimColor) && trimFancy ? trimFancy : trimColor) ||
    (trimFancy || null);
  if (!rawColorMerged || !String(rawColorMerged).trim()) {
    stats.skippedInvalidColor++;
    return { data: null, reason: 'invalid_color' };
  }
  const colorStr = String(rawColorMerged).trim();
  const normalizedForCheck = normalizeWhiteColorRange(colorStr);
  if (isFancyColor(colorStr)) {
    product.color = colorStr;
    const parsed = parseFancyColorString(colorStr);
    product.intensity = parsed.intensity || 'Other';
    product.overtone = parsed.overtone || 'Other';
    // If overtone/intensity came from separate columns, prefer them
    const overtoneField = getFieldValue(rawProductData, 'overtone', COLUMN_MAPPINGS.overtone);
    const intensityField = getFieldValue(rawProductData, 'intensity', COLUMN_MAPPINGS.intensity);
    if (typeof overtoneField === 'string' && overtoneField.trim()) product.overtone = overtoneField.trim();
    if (typeof intensityField === 'string' && intensityField.trim()) product.intensity = intensityField.trim();
  } else {
    const colorValidation = validateDiamondColor(normalizedForCheck);
    if (!colorValidation.isValid) {
      stats.skippedInvalidColor++;
      return { data: null, reason: 'invalid_color' };
    }
    product.color = colorValidation.normalizedValue;
  }

  const rawShape = getFieldValue(rawProductData, 'shape', COLUMN_MAPPINGS.shape);
  product.shape = normalizeShape(typeof rawShape === 'string' ? rawShape : null);
  
  // Process measurements (handle different input formats)
  const measurementsCombinedRaw = getFieldValue(rawProductData, 'measurements', COLUMN_MAPPINGS.measurements);
  let parsedMeasurements: MeasurementResult;
  if (measurementsCombinedRaw !== null && measurementsCombinedRaw !== undefined) {
    parsedMeasurements = parseMeasurements(
      typeof measurementsCombinedRaw === 'string' || typeof measurementsCombinedRaw === 'number' 
        ? measurementsCombinedRaw 
        : null
    );
  } else {
    // Try individual measurement fields if combined is not present
    const m1Raw = getFieldValue(rawProductData, 'measurement1', COLUMN_MAPPINGS.measurement1);
    const m2Raw = getFieldValue(rawProductData, 'measurement2', COLUMN_MAPPINGS.measurement2);
    const m3Raw = getFieldValue(rawProductData, 'measurement3', COLUMN_MAPPINGS.measurement3);
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
  product.measurements = parsedMeasurements.raw;

  // Process ratio: use incoming ratio if exists, otherwise calculate from measurements
  const rawRatio = getFieldValue(rawProductData, 'ratio', COLUMN_MAPPINGS.ratio);
  if (rawRatio && !isNaN(parseFloat(String(rawRatio)))) {
    // Use incoming ratio if provided and valid
    product.ratio = parseFloat(parseFloat(String(rawRatio)).toFixed(2));
  } else if (product.measurement1 > 0 && product.measurement2 > 0) {
    // Calculate ratio from measurements: Length / Width (measurement1 / measurement2)
    product.ratio = parseFloat((product.measurement1 / product.measurement2).toFixed(2));
  } else {
    product.ratio = 0;
  }

  // Process totalDepth: use incoming value if exists, otherwise calculate from measurements and shape
  const rawTotalDepth = getFieldValue(rawProductData, 'totalDepth', COLUMN_MAPPINGS.totalDepth);
  if (rawTotalDepth && !isNaN(parseFloat(String(rawTotalDepth)))) {
    // Use incoming totalDepth if provided and valid
    product.totalDepth = parseFloat(parseFloat(String(rawTotalDepth)).toFixed(2));
  } else if (product.shape && product.measurement1 > 0 && product.measurement2 > 0 && product.measurement3 > 0) {
    // Calculate Total Depth % from measurements and shape
    product.totalDepth = calculateTotalDepthPercent(product.shape, product.measurement1, product.measurement2, product.measurement3);
  } else {
    product.totalDepth = 0;
  }

  // Process prices and carat FIRST, before validations that depend on them
  const rawCarat = getFieldValue(rawProductData, 'carat', COLUMN_MAPPINGS.carat);
  product.carat = parseFloat(String(rawCarat)) || 0;

  let price = parseFloat(String(getFieldValue(rawProductData, 'price', COLUMN_MAPPINGS.price))) || 0;
  let pricePerCarat = parseFloat(String(getFieldValue(rawProductData, 'pricePerCarat', COLUMN_MAPPINGS.pricePerCarat))) || 0;

  if (price > 0 && product.carat > 0) {
    pricePerCarat = price / product.carat;
  } else if (pricePerCarat > 0 && product.carat > 0 && price === 0) {
    price = pricePerCarat * product.carat;
  }
  product.price = parseFloat(price.toFixed(2));
  product.pricePerCarat = parseFloat(pricePerCarat.toFixed(2));

  // VALIDATIONS from JS logic
  const rawClarity = getFieldValue(rawProductData, 'clarity', COLUMN_MAPPINGS.clarity);
  product.clarity = normalizeClarity(typeof rawClarity === 'string' ? rawClarity : null);
  
  if (!ALLOWED_CLARITIES.includes(product.clarity)) {
    stats.skippedInvalidClarity++;
    return { data: null, reason: 'invalid_clarity' };
  }

  // Marketplace quality rule: skip products with FR/F (Fair) on cut/polish/symmetry
  const rawCutForValidation = getFieldValue(rawProductData, 'cut', COLUMN_MAPPINGS.cut);
  const rawPolishForValidation = getFieldValue(rawProductData, 'polish', COLUMN_MAPPINGS.polish);
  const rawSymmetryForValidation = getFieldValue(rawProductData, 'symmetry', COLUMN_MAPPINGS.symmetry);
  if (
    hasDisallowedMarketplaceGrade(rawCutForValidation) ||
    hasDisallowedMarketplaceGrade(rawPolishForValidation) ||
    hasDisallowedMarketplaceGrade(rawSymmetryForValidation)
  ) {
    stats.skippedInvalidData = (stats.skippedInvalidData || 0) + 1;
    return { data: null, reason: 'invalid_grade' };
  }

  if (product.price < MIN_SUPPLIER_PRICE || product.price > MAX_PRICE) {
    stats.skippedInvalidPrice++;
    return { data: null, reason: 'invalid_price' };
  }

  if (!(product.carat >= MIN_CARAT && product.carat <= MAX_CARAT)) {
    stats.skippedInvalidCarat++;
    return { data: null, reason: 'invalid_carat' };
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
    } else { // > 10
      limit = ANOMALOUS_PPC_LIMIT_OVER_10_CARAT;
    }

    if (product.pricePerCarat > limit) {
      stats.skippedAnomalousPricePerCarat = (stats.skippedAnomalousPricePerCarat || 0) + 1;
      return { data: null, reason: `anomalous_price_per_carat` };
    }
  }

  const photoField = getFieldValue(rawProductData, 'photo', COLUMN_MAPPINGS.photo);
  const videoField = getFieldValue(rawProductData, 'video', COLUMN_MAPPINGS.video);
  product.photo = extractMediaUrl(photoField);
  product.video = extractMediaUrl(videoField);

  if (!options.allowMissingMedia && !product.photo && !product.video) {
    stats.skippedMissingMedia++;
    return { data: null, reason: 'missing_media' };
  }

  const rawCertNumber = getFieldValue(rawProductData, 'certificateNumber', COLUMN_MAPPINGS.certificateNumber);
  product.certificateNumber = normalizeCertificateNumber(rawCertNumber);
  
  if (!product.certificateNumber) {
    stats.skippedMissingCertNumber++;
    return { data: null, reason: 'missing_certificate_number' };
  }

  // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА НА ДУБЛИРОВАНИЕ CERTIFICATE NUMBER
  // Нормализуем certificate number для проверки
  const normalizedCertNumber = normalizeCertificateNumber(product.certificateNumber);
  if (!normalizedCertNumber) {
    stats.skippedMissingCertNumber++;
    return { data: null, reason: 'missing_certificate_number' };
  }
  product.certificateNumber = normalizedCertNumber;
  
  const rawCertInstitute = getFieldValue(rawProductData, 'certificateInstitute', COLUMN_MAPPINGS.certificateInstitute);
  product.certificateInstitute = normalizeInstitute(String(rawCertInstitute));

  const rawLocation = getFieldValue(rawProductData, 'location', COLUMN_MAPPINGS.location);
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
  
  // Populate remaining fields
  product.stoneType = determineStoneType(product.color);
  
  const overtoneField = getFieldValue(rawProductData, 'overtone', COLUMN_MAPPINGS.overtone);
  const overtoneFromFile = formatFieldValue('overtone', overtoneField);
  product.overtone = overtoneFromFile || product.overtone || DEFAULT_VALUES.STRING;

  const intensityField = getFieldValue(rawProductData, 'intensity', COLUMN_MAPPINGS.intensity);
  const intensityFromFile = formatFieldValue('intensity', intensityField);
  product.intensity = intensityFromFile || product.intensity || DEFAULT_VALUES.STRING;
  
  const cutField = getFieldValue(rawProductData, 'cut', COLUMN_MAPPINGS.cut);
  const normalizedCut = normalizeCut(typeof cutField === 'string' ? cutField : null);
  if (normalizedCut) {
    product.cut = normalizedCut;
  }
  
  const polishField = getFieldValue(rawProductData, 'polish', COLUMN_MAPPINGS.polish);
  product.polish = normalizeGrade(typeof polishField === 'string' ? polishField : null);
  
  const symmetryField = getFieldValue(rawProductData, 'symmetry', COLUMN_MAPPINGS.symmetry);
  product.symmetry = normalizeGrade(typeof symmetryField === 'string' ? symmetryField : null);
  product.sold = Boolean(getFieldValue(rawProductData, 'sold', []) || DEFAULT_VALUES.BOOLEAN);
  
  const tableSizeField = getFieldValue(rawProductData, 'tableSize', COLUMN_MAPPINGS.tableSize);
  product.tableSize = tableSizeField ? parseFloat(String(tableSizeField)) : DEFAULT_VALUES.NUMBER;
  
  const crownHeightField = getFieldValue(rawProductData, 'crownHeight', COLUMN_MAPPINGS.crownHeight);
  product.crownHeight = crownHeightField ? parseFloat(String(crownHeightField)) : DEFAULT_VALUES.NUMBER;
  
  const pavilionDepthField = getFieldValue(rawProductData, 'pavilionDepth', COLUMN_MAPPINGS.pavilionDepth);
  product.pavilionDepth = pavilionDepthField ? parseFloat(String(pavilionDepthField)) : DEFAULT_VALUES.NUMBER;
  
  const girdleField = getFieldValue(rawProductData, 'girdle', COLUMN_MAPPINGS.girdle);
  product.girdle = formatFieldValue('girdle', girdleField).toUpperCase();
  
  const culetField = getFieldValue(rawProductData, 'culet', COLUMN_MAPPINGS.culet);
  product.culet = formatFieldValue('culet', culetField).toUpperCase();
  
  const fluorescenceField = getFieldValue(rawProductData, 'fluorescence', COLUMN_MAPPINGS.fluorescence);
  product.fluorescence = formatFieldValue('fluorescence', fluorescenceField).toUpperCase();
  
  const haField = getFieldValue(rawProductData, 'ha', COLUMN_MAPPINGS.ha);
  product.ha = String(haField || DEFAULT_VALUES.STRING);
  
  const technologyField = getFieldValue(rawProductData, 'technology', COLUMN_MAPPINGS.technology);
  product.technology = formatFieldValue('technology', technologyField);
  
  const descriptionField = getFieldValue(rawProductData, 'description', COLUMN_MAPPINGS.description);
  product.description = formatFieldValue('description', descriptionField);

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
    'Laboratory Grown Diamond',
    'LABORATORY GROWN DIAMOND',
    'HIGH PRESSURE HIGH TEMPERATURE',
    'CHEMICAL VAPOR DEPOSITION',
    'AS GROWN',
    // Parallel Diamonds / IGI-style comments
    'LABORATORY GROWN DIAMOND WAS CREATED',
    'CREATED BY CHEMICAL VAPOR DEPOSITION',
    'CVD) GROWTH PROCESS',
    'GROWTH PROCESS TYPE IIA'
  ];

  /** Strip HTML tags (e.g. <br/>) from text for keyword matching */
  const stripHtmlForSearch = (text: string): string =>
    String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  let isLabGrown = false;
  let finalTechForProduct = DEFAULT_VALUES.STRING;
  let specificTechFound = false;

  const uniqueDescriptionFieldKeys = Array.from(new Set(COLUMN_MAPPINGS.description || []));

  // Phase 0: Check description/comment fields (e.g. Comments, Lab_Report_Comment) for lab-grown keywords.
  // Build one combined string from all description-like fields so we don't miss e.g. "THIS LABORATORY GROWN DIAMOND WAS CREATED BY CHEMICAL VAPOR DEPOSITION (CVD) GROWTH PROCESS" in Comments.
  let descriptionCombined = '';
  for (const fieldKey of uniqueDescriptionFieldKeys) {
    const fieldValue = getFieldValue(rawProductData, fieldKey, uniqueDescriptionFieldKeys);
    if (fieldValue && String(fieldValue).trim()) {
      descriptionCombined += ' ' + stripHtmlForSearch(String(fieldValue));
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
      if (!specificTechFound) finalTechForProduct = 'N/A';
    }
  }

  const uniquePotentialTechFieldKeys = Array.from(new Set(COLUMN_MAPPINGS.technology || []));

  // Phase 1: Look for specific CVD/HPHT in technology fields
  for (const fieldKey of uniquePotentialTechFieldKeys) {
    const fieldValue = getFieldValue(rawProductData, fieldKey, COLUMN_MAPPINGS[fieldKey as keyof typeof COLUMN_MAPPINGS] || []);
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
      const fieldValue = getFieldValue(rawProductData, fieldKey, COLUMN_MAPPINGS[fieldKey as keyof typeof COLUMN_MAPPINGS] || []);
      if (fieldValue) {
        const valueStrUpper = String(fieldValue).toUpperCase();
        if (labGrownKeywords.some(keyword => valueStrUpper.includes(keyword))) {
          isLabGrown = true;
          finalTechForProduct = "N/A";
          break;
        }
      }
    }
  }

  // Phase 3: If still not lab-grown, treat IGI certificate as lab-grown (many API feeds use IGI predominantly for lab-grown, e.g. Parallel Diamonds)
  if (!isLabGrown && rawCertInstitute != null && rawCertInstitute !== undefined) {
    const instituteNormalized = normalizeInstitute(String(rawCertInstitute));
    if (instituteNormalized === 'IGI') {
      isLabGrown = true;
      if (!specificTechFound) finalTechForProduct = 'N/A';
    }
  }

  // Phase 3b: Discount in lab-grown range (-99.9..-90 or 90..99.9) often indicates lab-grown
  if (!isLabGrown) {
    const discountRaw = getFieldValue(rawProductData, 'discount', COLUMN_MAPPINGS.discount || []);
    const discountNum = discountRaw != null && discountRaw !== '' ? parseFloat(String(discountRaw).replace(/,/g, '.')) : NaN;
    if (!Number.isNaN(discountNum) && ((discountNum >= 90 && discountNum <= 99.9) || (discountNum <= -90 && discountNum >= -99.9))) {
      isLabGrown = true;
      if (!specificTechFound) finalTechForProduct = 'N/A';
    }
  }

  // Decision and assignment
  if (!isLabGrown) {
    const primaryTechValue = getFieldValue(rawProductData, 'technology', COLUMN_MAPPINGS.technology);
    product.technology = formatFieldValue('technology', primaryTechValue);
    stats.skippedNotLabGrown = (stats.skippedNotLabGrown || 0) + 1;
    return { data: null, reason: 'not_lab_grown' };
  }

  product.technology = formatFieldValue('technology', finalTechForProduct);

  // Calculate and set marketPrice
  try {
    if (product.shape && product.carat && product.clarity && product.color) {
      const shapeCat = determineShapeCategory(product.shape);
      const weightCat = determineWeightCategory(product.carat);
      const clarityCat = determineClarityCategory(product.clarity);
      const colorCat = determineColorCategory(product.color);

      if (colorCat) {
        const cacheKey = `${shapeCat}-${weightCat}-${clarityCat}-${colorCat}`;
        let marketPricePerCarat: number | undefined;

        // Try to get from cache first
        if (options.marketPriceCache) {
          marketPricePerCarat = options.marketPriceCache.get(cacheKey);
        }

        // If not in cache, try to get from database
        if (!marketPricePerCarat) {
          try {
            // Skip DB lookup in api-product-sync-service to avoid circular dependencies
            // Market price will be set by main server process or market-price-calculator-service
            logger.info(`[productUtils] No market price in cache for category ${cacheKey}, using own price as fallback`);
          } catch (dbError) {
            logger.warn(`Failed to fetch market price for category ${cacheKey}`, { error: dbError });
          }
        }

        // Set market price if we have valid data
        if (marketPricePerCarat && product.carat > 0) {
          product.marketPrice = parseFloat((marketPricePerCarat * product.carat).toFixed(2));
          product.marketPricePerCarat = marketPricePerCarat;
          // Логируем установку рыночной цены только для каждого 10000-го продукта в продакшене
          if (process.env.NODE_ENV !== 'production' || Math.random() < 0.0001) { // 0.01% шанс в продакшене
            logger.debug(`[productUtils] Set market price for ${product.certificateNumber}`, { marketPrice: product.marketPrice, marketPricePerCarat });
          }
        } else {
          // Fallback to own price only if we couldn't get market price
          product.marketPrice = product.price;
          product.marketPricePerCarat = product.pricePerCarat;
          // Логируем fallback цены только для каждого 1000-го продукта в продакшене
          if (process.env.NODE_ENV !== 'production' || Math.random() < 0.001) {
            logger.warn(`[productUtils] No market price found for category ${cacheKey}, using own price as fallback`, { certificateNumber: product.certificateNumber });
          }
        }
      } else {
        // For non D-G colors, use own price
        product.marketPrice = product.price;
        product.marketPricePerCarat = product.pricePerCarat;
      }
    } else {
      // If categories can't be determined, use own price
      product.marketPrice = product.price;
      product.marketPricePerCarat = product.pricePerCarat;
    }
  } catch (e) {
    logger.error(`Error calculating market price for product ${product.certificateNumber}`, { error: e });
    // Fallback to own price on error
    product.marketPrice = product.price;
    product.marketPricePerCarat = product.pricePerCarat;
  }
  
  return { data: product, reason: null };
};

/**
 * Format product data for update, typically for a single product update scenario.
 * @param {Partial<IProduct>} data - The data to format.
 * @returns {Partial<IProduct>} - The formatted data, ready for DB update.
 */
export const formatProductData = (data: Partial<IProduct>): Partial<IProduct> => {
  const formattedData: Record<string, unknown> = { ...data };

  // Normalize and validate status
  if (data.status !== undefined) {
    const statusValidation = validateProductStatus(data.status);
    formattedData.status = statusValidation.normalizedValue; 
  }

  // Normalize and validate color
  if (data.color !== undefined) {
    const colorValidation = validateDiamondColor(data.color);
    formattedData.color = colorValidation.isValid ? colorValidation.normalizedValue : data.color;
  }

  // Normalize shape
  if (data.shape !== undefined) {
    formattedData.shape = normalizeShape(data.shape);
  }
  
  // Ensure numeric fields are numbers
  const numericFields = ['carat', 'price', 'pricePerCarat', 'discount', 'measurement1', 'measurement2', 'measurement3', 'ratio', 'tableSize', 'totalDepth', 'crownHeight', 'pavilionDepth'] as const;
  for (const field of numericFields) {
    const fieldValue = data[field];
    if (fieldValue !== undefined && fieldValue !== null) {
      const val = parseFloat(String(fieldValue));
      formattedData[field] = isNaN(val) ? DEFAULT_VALUES.NUMBER : val;
    } else if (fieldValue === null && formattedData[field] !== undefined) {
      formattedData[field] = null; 
    }
  }

  // Measurements: if individual m1,m2,m3 are provided and measurements string is not, construct it.
  const m1 = formattedData.measurement1 as number | undefined;
  const m2 = formattedData.measurement2 as number | undefined;
  const m3 = formattedData.measurement3 as number | undefined;
  
  if (m1 && m2 && m3 && !formattedData.measurements) {
    formattedData.measurements = `${m1}x${m2}x${m3}`;
  } else if (data.measurements) {
    const parsed = parseMeasurements(data.measurements);
    formattedData.measurement1 = parsed.measurement1;
    formattedData.measurement2 = parsed.measurement2;
    formattedData.measurement3 = parsed.measurement3;
    formattedData.measurements = parsed.raw || data.measurements;
  }

  // Calculate ratio if not provided but measurements are available
  const ratio = formattedData.ratio as number | undefined;
  const finalM1 = formattedData.measurement1 as number | undefined;
  const finalM2 = formattedData.measurement2 as number | undefined;
  const finalM3 = formattedData.measurement3 as number | undefined;
  
  if (!ratio || ratio === 0) {
    if (finalM1 && finalM1 > 0 && finalM2 && finalM2 > 0) {
      formattedData.ratio = parseFloat((finalM1 / finalM2).toFixed(2));
    }
  }

  // Calculate totalDepth if not provided but measurements and shape are available
  const totalDepth = formattedData.totalDepth as number | undefined;
  const shape = formattedData.shape as string | undefined;
  
  if (!totalDepth || totalDepth === 0) {
    if (shape && finalM1 && finalM1 > 0 && finalM2 && finalM2 > 0 && finalM3 && finalM3 > 0) {
      formattedData.totalDepth = calculateTotalDepthPercent(shape, finalM1, finalM2, finalM3);
    }
  }

  // Normalize string fields (uppercase, trim)
  const upperCaseFields = ['clarity', 'cut', 'polish', 'symmetry', 'fluorescence', 'girdle', 'culet'] as const;
  for (const field of upperCaseFields) {
    const fieldValue = data[field];
    if (fieldValue !== undefined && typeof fieldValue === 'string') {
      formattedData[field] = fieldValue.toUpperCase().trim();
    }
  }
  
  if (data.certificateInstitute !== undefined && typeof data.certificateInstitute === 'string') {
    formattedData.certificateInstitute = normalizeInstitute(data.certificateInstitute);
  }
  if (data.certificateNumber !== undefined && typeof data.certificateNumber === 'string') {
    formattedData.certificateNumber = data.certificateNumber.trim();
  }

  // Calculate price/pricePerCarat if possible
  const price = formattedData.price as number | undefined;
  const carat = formattedData.carat as number | undefined;
  const pricePerCarat = formattedData.pricePerCarat as number | undefined;

  if (price !== undefined && carat !== undefined && carat > 0) {
    if (pricePerCarat === undefined || pricePerCarat === 0) {
        formattedData.pricePerCarat = parseFloat((price / carat).toFixed(2));
    }
  } else if (pricePerCarat !== undefined && carat !== undefined && carat > 0) {
    if (price === undefined || price === 0) {
        formattedData.price = parseFloat((pricePerCarat * carat).toFixed(2));
    }
  }
  
  if (formattedData.price !== undefined) formattedData.price = parseFloat(Number(formattedData.price).toFixed(2));
  if (formattedData.pricePerCarat !== undefined) formattedData.pricePerCarat = parseFloat(Number(formattedData.pricePerCarat).toFixed(2));

  // Timestamps
  formattedData.updatedAt = new Date(); 

  // If cut is empty or invalid, remove it from formattedData
  if (!formattedData.cut) {
    delete formattedData.cut;
  }

  return formattedData as Partial<IProduct>;
};

const isCertificateBlacklisted = async (certificateNumber: string): Promise<boolean> => {
  if (!certificateNumber) return false;
  // Sold-cert filtering is done once per run in syncUtils (Product.find({ status: 'Sold' })).
  return false;
};

/**
 * Enhanced check for Lab-Grown diamonds, ensuring it does not cause performance issues.
 * @param rawProductData The raw product data from the source.
 * @param certificateInstitute The certificate institute of the product.
 * @returns {Promise<boolean>} True if the diamond is confirmed to be lab-grown.
 */
const isConfirmedLabGrown = async (rawProductData: RawProductData, certificateInstitute: string): Promise<boolean> => {
  const technology = getFieldValue(rawProductData, 'technology');
  const comments = getFieldValue(rawProductData, 'description');

  // Primary check: Technology field from source
  if (technology) {
    const techLower = String(technology).toLowerCase();
    if (techLower.includes('cvd') || techLower.includes('hpht') || techLower.includes('lab') || techLower.includes('grown')) return true;
  }

  // Secondary check: Certificate institute (IGI is almost exclusively lab-grown in many feeds)
  if (certificateInstitute === 'IGI') {
    return true;
  }
  
  // Tertiary check: Comments/Description field for keywords
  if (comments && typeof comments === 'string') {
    const commentsLower = comments.toLowerCase();
    if (commentsLower.includes('lab grown') || commentsLower.includes('laboratory grown') || commentsLower.includes('lgd')) {
      return true;
    }
  }

  // The inefficient blacklist check per-product has been removed.
  // The main sync logic (syncUtils.ts) is responsible for pre-fetching the blacklist 
  // and filtering products *before* this function is ever called.

  // Default assumption: If no explicit lab-grown indicators, assume it is not.
  return false;
};

export function getInitialisedStats(): ProductProcessingStats {
    return {
        totalFromApi: 0,
        processed: 0,
        created: 0,
        updated: 0,
        deletedStale: 0,
        skippedByDuplicateInSource: 0,
        skippedByBlacklist: 0,
        skippedExistingOnDealOrSold: 0,
        skippedInvalidStatus: 0,
        skippedInvalidColor: 0,
        skippedInvalidClarity: 0,
        skippedInvalidPrice: 0,
        skippedInvalidCarat: 0,
        skippedMissingMedia: 0,
        skippedByApiFilter: 0,
        skippedMissingCertNumber: 0,
        skippedNotLabGrown: 0,
        skippedAnomalousPricePerCarat: 0,
        replacedOtherCompanyProduct: 0,
        skippedCheaperExistsOtherCompany: 0,
        apiErrors: 0,
        dbErrors: 0,
        totalUploaded: 0,
        skippedInvalidData: 0,
    };
}
