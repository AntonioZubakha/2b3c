import mongoose from 'mongoose'; // Added import for mongoose
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';
import { IProduct } from '../types'; // Assuming IProduct is available
// REMOVED: categoryStatsUtils functions - market price calculation moved to market-price-calculator-service

// --- Constants for Validation ---
const MIN_PRICE = 0;
const MAX_PRICE = 150000;
/** Minimum supplier price (USD); products below this are skipped to avoid unrealistically low prices in catalog */
const MIN_SUPPLIER_PRICE = Number(process.env.MIN_SUPPLIER_PRICE) || 15;
const MIN_CARAT = 0.3;
const MAX_CARAT = 100;
const ALLOWED_CLARITIES = ['VS2', 'VS1', 'VVS2', 'VVS1', 'IF', 'FL']; // 'EX' removed as it's not a clarity grade

// --- Fancy (colored) diamond support (aligned with DiamondField.php / LgdealProductMapperDto.php) ---
/** White (colorless) grades accepted for import: D–G only. Fancy colors are accepted separately. */
const WHITE_COLOR_GRADES = Object.freeze(['D', 'E', 'F', 'G']);
const FANCY_COLOR_NAMES = ['Yellow', 'Pink', 'Blue', 'Green', 'Red', 'Purple', 'Orange', 'Violet', 'Gray', 'Black', 'Brown', 'Champagne', 'Cognac', 'Chameleon', 'Other'];
const FANCY_INTENSITY_NAMES = ['Faint', 'Very light', 'Light', 'Fancy light', 'Fancy', 'Fancy dark', 'Fancy intense', 'Fancy vivid', 'Fancy deep', 'Other'];
const FANCY_OVERTONE_NAMES = ['Red', 'Orangey Red', 'Reddish Orange', 'Pink', 'Pinkish Orange', 'Orange', 'Yellowish Orange', 'Yellow Orange', 'Orangey Yellow', 'Yellow', 'Yellow Brown', 'Greenish Yellow', 'Green Yellow', 'Yellow Green', 'Yellowish Green', 'Brown Greenish Yellow', 'Gray Greenish Yellow', 'Gray Yellowish Green', 'Gray Green', 'Green', 'Bluish Green', 'Blue Green', 'Green Blue', 'Greenish Blue', 'Blue', 'Violetish Blue', 'Bluish Violet', 'Other'];

const isWhiteColorGrade = (value: string): boolean => {
  const v = value.trim().toUpperCase();
  return v.length === 1 && WHITE_COLOR_GRADES.includes(v);
};

export const isGenericFancyPlaceholder = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return v === 'fancy' || v === 'fancy color' || v === 'fc' || v === 'fancy colour';
};

export const isFancyColor = (value: string): boolean => {
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

const ANOMALOUS_PPC_LIMIT_1_CARAT = 500;
const ANOMALOUS_PPC_LIMIT_5_CARAT = 4000;
const ANOMALOUS_PPC_LIMIT_10_CARAT = 15000;
const ANOMALOUS_PPC_LIMIT_OVER_10_CARAT = 30000;
// --- End Constants ---

// Import the product model for duplicate checking
import Product from '../models/Product';

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
    status: existingProduct.status as string,
    certificateNumber: existingProduct.certificateNumber,
    certificateInstitute: existingProduct.certificateInstitute,
    inCurrentCompany: existingProduct.company?.toString() === companyId,
    isOnDealOrSold: ['OnDeal', 'Sold'].includes(existingProduct.status as string)
  };
};

// Default values for different data types
export const DEFAULT_VALUES = {
  STRING: '',
  NUMBER: 0,
  BOOLEAN: false,
};

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
  location: ['location', 'country', 'city', 'state', 'COP', 'Loc', 'Dianmond Country', 'Branch', 'Branch Name', 'Certy Location', 'Diamond Location', 'Location country', 'Country Location', 'Location', 'COU_NAME', 'Stone Location', 'LOCTION', 'Country', 'Location city', 'city', 'Location region', 'Location ZIP'],
  technology: ['technology', 'type', 'growth_type', 'diamond_type', 'growthType', 'Treatment', 'Treatment_value', 'REPORT_COMMENT', 'StoneType', 'Description/Comments', 'CVD_HPHT', 'growth technology', 'growthMethod', 'GROWN TECHNOLOGY', 'TREATMENT', 'LGType', 'Diamon Type', 'GROWN', 'Type (CVD or HPHT)', 'STONE_TYPE', 'Diamond Type', 'diamondType', 'CVD/HPHT', 'TYPES', 'Growth Process', 'Growth Type', 'Technology', 'CVD_HPHT', 'enhance_type', 'Treatment_value'],
  photo: ['photo', 'image', 'diamond_image', 'image_url', 'picture_url', 'certificate_image', 'imagelink', 'image link', 'diamond image', 'diamond image link', 'real_image', 'DiamondImageURL', 'DiamondImage', 'Image', 'REAL_IMAGE', 'Stone_Img_url', 'ImgURL', 'ImageBLink', 'Photo', 'IMAGE LINK', 'imageUrl', 'IMAGE-LINK', 'ImageLink', 'VIEW IMAGE', 'View Image-'],
  video: ['video', 'diamond_video', 'video_url', 'movie_url', 'videolink', 'diamond video', 'video link', 'diamond video link', 'DiamondVideoURL', 'DiamondVideo', 'ImageURL3D', 'videoUrl', 'VIDEO_DOWNLOAD_LINK', 'URL|VIDEO', 'Video_url', 'VIEW LINK', 'V360', 'VIEW VIDEO', 'View Video-', 'Vid', 'Video', 'VIDEO LINK', 'VideoLink', 'VIDEO_LINK', 'VIDEO-LINK', 'video_url'],
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
  certificateInstitute: ['certificate institute', 'lab', 'grading_lab', 'laboratory', 'Certificate Institute', 'Certification Institute', 'Certificat Institute', 'Cert', 'LABNAME', 'Lab', 'Laboratory', 'Institute', 'INST.', 'certificate', 'CERTIFICATE'],
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
  description: ['description', 'notes', 'comment', 'details', 'Lab_Report_Comment', 'CERT_COMMENTS', 'REPORT_COMMENT', 'laserInscription', 'Report Comments', 'KeyToSymbols', 'Key_x0020_To_x0020_Sym', 'Report Comment', 'Inscription', 'Compnay Comment', 'Comment', 'IGI Comments', 'REMARK', 'Additional Information', 'Info', 'Legends', 'Legend', 'Cert Comment', 'certComment', 'cert_comment', 'Comments', 'Description/Comments'],
  lotNumber: ['lot_number', 'lot_no', 'Ref.No.', 'SKU', 'stockNo', 'STNO', 'stock_num', 'stockId', 'stock_id', 'Stone_x0020_Id', 'Stone_No', 'LOAT_NO', 'Bar Code', '#', 'NO', 'Sr No', 'SR_NO', 'Sr #', 'Name', 'LOT NO.', 'Lot No', 'Lot #', 'Lot#', 'PKT.NO', 'STOCK ID', 'Stock Ref', 'Packet No', 'PACKET_ID', 'Stock#', 'Stock #', 'Stock No.', 'Stock No', 'Stone ID', 'STK REFF. NO.', 'STK ID'],
  additionalInfo: ['additional_info', 'extra_info'],
};

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
  // Basic normalization: trim and uppercase. Add more specific mappings if needed.
  // Example: 'SI 1' -> 'SI1'
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
  // Do not store POOR (P) either - align with catalog
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
  return normalizeGrade(cut); // Uses the same logic as polish and symmetry
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

/**
 * Normalizes certificate institute names.
 * @param institute The raw institute name.
 * @returns Normalized institute name or original if not in map.
 */
export const normalizeInstitute = (institute?: string | null): string => {
  if (!institute) return DEFAULT_VALUES.STRING;
  const normalized = institute.toUpperCase().trim();
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
  return institute;
};


/**
 * Determines stone type (e.g., "diamond", "fancy diamond").
 * This is a basic implementation; more sophisticated logic might be needed.
 * @param color The color of the stone.
 * @returns The determined stone type.
 */
export const determineStoneType = (color?: string | null): string => {
  if (!color) return 'diamond'; // Default to diamond if no color specified
  const colorLower = color.toLowerCase();
  // Basic check for fancy colors - this might need to be more robust
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
  if (!stringValue) return DEFAULT_VALUES.STRING; // Ensure empty string after trim also returns default
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
      // Further validation with URL constructor
      new URL(stringUrl);
      return stringUrl;
    } catch (e) {
      return DEFAULT_VALUES.STRING; // Invalid URL structure
    }
  }
  return DEFAULT_VALUES.STRING;
};

export interface MeasurementResult {
  measurement1: number;
  measurement2: number;
  measurement3: number;
  raw?: string; // Keep original string if needed
}

/**
 * Parses measurements from a string (e.g., "1.2x3.4x5.6" or "1.2 - 3.4 - 5.6").
 * Handles various delimiters like 'x', '*', '-', or spaces.
 * @param measurements The measurement string.
 * @returns An object with measurement1, measurement2, measurement3.
 */
export const parseMeasurements = (measurements?: string | number | null): MeasurementResult => {
  const defaultResult: MeasurementResult = { measurement1: 0, measurement2: 0, measurement3: 0 };
  if (measurements === null || typeof measurements === 'undefined') return defaultResult;

  const measurementsStr = String(measurements).trim();
  if (!measurementsStr) return defaultResult;

  defaultResult.raw = measurementsStr;

  // Regex to capture up to 3 numbers separated by common delimiters (x, *, -, space, comma)
  // It tries to be flexible with spacing around delimiters.
  // Allows for formats like "1.00 * 2.00 * 3.00" or "1-2-3" or "1 2 3" or "1,2,3"
  // Also handles cases with only one or two dimensions.
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
 * It checks against the COLUMN_MAPPINGS.
 * @param headerName The header name from the uploaded file.
 * @returns The corresponding internal field name (e.g., 'certificateNumber') or the original header if no specific match.
 */
export const findMatchingField = (headerName?: string | null): string | null => {
  if (!headerName) return null;
  const normalizedHeader = headerName.trim().toLowerCase();

  for (const [internalField, possibleHeaders] of Object.entries(COLUMN_MAPPINGS)) {
    if (possibleHeaders.some(ph => ph.toLowerCase() === normalizedHeader)) {
      return internalField;
    }
  }
  // If no specific mapping found, consider returning a normalized version of the header
  // or null/original based on desired behavior for unmapped columns.
  // For now, returning original header to allow passthrough of unknown columns if RawProductData allows it.
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
 * Retrieves a field value from a product object (with case-insensitive keys)
 * using a primary target field name and its possible header variations from COLUMN_MAPPINGS.
 * @param product The raw product data object (keys will be lowercased internally).
 * @param targetInternalFieldName The internal, standardized field name (e.g., 'certificateNumber', 'color').
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

  // 3. Try all alternative fields (provided from COLUMN_MAPPINGS or manually)
  for (const altField of alternativeFields) {
    if (skipBareCertificateAlias && isBareCertificateAlias(altField)) continue;
    // Direct key lookup for altField
    if (product[altField] !== undefined) return product[altField];

    // Case-insensitive lookup for altField
    const altFieldLower = altField.toLowerCase();
    for (const key in product) {
      if (skipBareCertificateAlias && isBareCertificateAlias(key)) continue;
      if (Object.prototype.hasOwnProperty.call(product, key) && key.trim().toLowerCase() === altFieldLower) {
        return product[key];
      }
    }
  }

  // 4. Fallback to COLUMN_MAPPINGS based search if primaryField itself might be a "concept" like 'certificateNumber'
  // This part integrates the logic similar to former getFieldValueFromRaw
  const mappedAlternativeFields = COLUMN_MAPPINGS[primaryField as keyof typeof COLUMN_MAPPINGS];
  if (mappedAlternativeFields && Array.isArray(mappedAlternativeFields)) {
    for (const headerVariation of mappedAlternativeFields) {
      if (skipBareCertificateAlias && isBareCertificateAlias(headerVariation)) continue;
      // Direct key lookup for headerVariation
      if (product[headerVariation] !== undefined) {
         const value = product[headerVariation];
         if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      // Case-insensitive lookup for headerVariation
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

  return null; // Return null if not found after all checks
};

export const STANDARD_DIAMOND_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const STANDARD_DIAMOND_CLARITIES = [
  'IF', 'FL', // Flawless, Internally Flawless
  'VVS1', 'VVS2', // Very, Very Slightly Included
  'VS1', 'VS2', // Very Slightly Included
  'SI1', 'SI2', 'SI3', // Slightly Included (SI3 is sometimes used)
  'I1', 'I2', 'I3', // Included (also P1, P2, P3 for Piqué)
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
  if (normalized.length === 1 && WHITE_COLOR_GRADES.includes(normalized)) {
    return { normalizedValue: normalized, isValid: true, originalValue };
  }
  if (isFancyColor(trimmed)) {
    return { normalizedValue: trimmed, isValid: true, originalValue };
  }
  return { normalizedValue: trimmed, isValid: false, originalValue };
};

/**
 * Validates product status based on productUtils.js logic.
 * @param status The status string to validate.
 * @returns An object with normalized status ('available' or original) and validity.
 */
export const validateProductStatus = (status?: string | null): ValidationResult => {
  const originalValue = status;
  if (!status) {
    // JS version defaulted to { normalizedStatus: 'available', isValid: true }
    return { normalizedValue: 'available', isValid: true, originalValue }; // Changed to lowercase 'available'
  }
  const normalizedStatus = String(status).trim().toLowerCase();
  
  // Allowed status values that will be normalized to 'available' (lowercase 'a')
  const allowedToNormalize: string[] = ['available', '1', 'on stock', 'onstock', 'in stock', 'instock', 'yes', 'true', 'g', 'a', 'да'];
  
  if (allowedToNormalize.includes(normalizedStatus)) {
    return { normalizedValue: 'available', isValid: true, originalValue }; // Changed to lowercase 'available'
  }
  
  // Any other status value means product should not be imported (isValid: false based on JS logic)
  // We return the original normalized attempt for potential logging.
  return { normalizedValue: status.trim(), isValid: false, originalValue }; 
};

export interface ParsedLocation {
  country: string;
  city: string;
  region: string;
  original: string; // Changed from 'raw' to 'original' to match JS logic
}

/**
 * Parses a location string into a structured location object based on productUtils.js logic.
 * @param locationInput The raw location string.
 * @returns A structured location object.
 */
export const parseLocationString = (locationInput?: string | number | null): ParsedLocation => {
  const original = String(locationInput || DEFAULT_VALUES.STRING).trim();
  const defaultLocation: ParsedLocation = { country: DEFAULT_VALUES.STRING, city: DEFAULT_VALUES.STRING, region: DEFAULT_VALUES.STRING, original };

  if (!original) return defaultLocation;
  
  const parts = original.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  let country = DEFAULT_VALUES.STRING;
  let city = DEFAULT_VALUES.STRING; // City not explicitly parsed in the provided JS snippet
  let region = DEFAULT_VALUES.STRING; // Region not explicitly parsed

  if (parts.length > 0) {
    // The last part is considered the country, as per productUtils.js snippet
    let rawCountry = parts[parts.length - 1];
    
    // Enhanced city→country mapping for diamond industry hubs
    const cityToCountryMap: { [key: string]: string } = {
      // India (major diamond hubs)
      'IND': 'India', 'INDIA': 'India',
      'MUMBAI': 'India', 'SURAT': 'India', 'DELHI': 'India', 'KOLKATA': 'India',
      'CHENNAI': 'India', 'BANGALORE': 'India', 'BENGALURU': 'India', 'HYDERABAD': 'India',
      'PUNE': 'India', 'AHMEDABAD': 'India', 'JAIPUR': 'India', 'LUCKNOW': 'India',
      'KANPUR': 'India', 'NAGPUR': 'India', 'INDORE': 'India', 'THANE': 'India',
      'BHOPAL': 'India', 'VISAKHAPATNAM': 'India', 'PATNA': 'India', 'VADODARA': 'India',
      'GHAZIABAD': 'India', 'LUDHIANA': 'India', 'AGRA': 'India', 'NASHIK': 'India',
      'FARIDABAD': 'India', 'MEERUT': 'India', 'RAJKOT': 'India', 'VARANASI': 'India',
      'SRINAGAR': 'India', 'AURANGABAD': 'India', 'NOIDA': 'India', 'HOWRAH': 'India',
      'RANCHI': 'India', 'CHANDIGARH': 'India', 'GUNTUR': 'India',
      
      // Belgium (diamond capital)
      'BELGIUM': 'Belgium', 'BE': 'Belgium',
      'ANTWERP': 'Belgium', 'ANVERS': 'Belgium', 'BRUSSELS': 'Belgium', 'BRUXELLES': 'Belgium',
      
      // Israel (major cutting center)
      'ISRAEL': 'Israel', 'IL': 'Israel',
      'TEL AVIV': 'Israel', 'TELAVIV': 'Israel', 'RAMAT GAN': 'Israel', 'RAMAT-GAN': 'Israel',
      'NETANYA': 'Israel', 'JERUSALEM': 'Israel', 'HAIFA': 'Israel',
      
      // USA
      'USA': 'USA', 'US': 'USA', 'UNITED STATES': 'USA', 'AMERICA': 'USA',
      'NEW YORK': 'USA', 'NEWYORK': 'USA', 'NY': 'USA', 'LOS ANGELES': 'USA',
      'CHICAGO': 'USA', 'MIAMI': 'USA', 'LAS VEGAS': 'USA',
      
      // China / Hong Kong
      'CHINA': 'China', 'CN': 'China',
      'HONG KONG': 'Hong Kong', 'HONGKONG': 'Hong Kong', 'HK': 'Hong Kong',
      'SHANGHAI': 'China', 'BEIJING': 'China', 'SHENZHEN': 'China', 'GUANGZHOU': 'China',
      
      // UAE (Dubai)
      'DUBAI': 'UAE', 'UAE': 'UAE', 'ABU DHABI': 'UAE',
      
      // Singapore
      'SINGAPORE': 'Singapore', 'SG': 'Singapore',
      
      // South Africa
      'SOUTH AFRICA': 'South Africa', 'ZA': 'South Africa',
      'JOHANNESBURG': 'South Africa', 'CAPE TOWN': 'South Africa', 'KIMBERLEY': 'South Africa',
      
      // Russia
      'RUSSIA': 'Russia', 'RU': 'Russia',
      'MOSCOW': 'Russia', 'ST PETERSBURG': 'Russia', 'SAINT PETERSBURG': 'Russia',
      
      // Other countries
      'AUSTRALIA': 'Australia', 'AU': 'Australia',
      'CANADA': 'Canada', 'CA': 'Canada',
      'THAILAND': 'Thailand', 'TH': 'Thailand', 'BANGKOK': 'Thailand',
      'SRI LANKA': 'Sri Lanka', 'LK': 'Sri Lanka',
      'UK': 'UK', 'UNITED KINGDOM': 'UK', 'LONDON': 'UK',
      'GERMANY': 'Germany', 'DE': 'Germany', 'BERLIN': 'Germany',
      'FRANCE': 'France', 'FR': 'France', 'PARIS': 'France',
      'SWITZERLAND': 'Switzerland', 'CH': 'Switzerland',
      'ITALY': 'Italy', 'IT': 'Italy',
      'JAPAN': 'Japan', 'JP': 'Japan', 'TOKYO': 'Japan'
    };
    
    const normalized = rawCountry.toUpperCase();
    country = cityToCountryMap[normalized] || rawCountry;
    
    // The JS snippet did not show parsing for city/region from multiple parts,
    // but if there was more than one part, the first part could be considered city.
    if (parts.length > 1) {
        city = parts[0]; // Tentatively assign first part to city
    }
    if (parts.length > 2) {
        region = parts.slice(1, -1).join(', '); // Tentatively assign middle parts to region
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

export const calculatePricePerCarat = (price?: number | string | null, carat?: number | string | null): number => {
  const numPrice = parseFloat(String(price));
  const numCarat = parseFloat(String(carat));

  if (isNaN(numPrice) || isNaN(numCarat) || numPrice <= 0 || numCarat <= 0) {
    return DEFAULT_VALUES.NUMBER;
  }
  return parseFloat((numPrice / numCarat).toFixed(2)); // Round to 2 decimal places
};

// Placeholder for processProduct and formatProductData
// These will be more complex and will be added in subsequent steps.

// Interface for the raw product data from CSV/XLSX
export interface RawProductData {
  [key: string]: unknown;
}

// Interface for the processed product data ready for DB
// This should align closely with IProduct, but might have intermediate fields
// or slightly different structures before final transformation to IProduct.
export interface ProcessedProductData extends Partial<IProduct> {
  _id?: mongoose.Types.ObjectId | string; // Mongoose ObjectId as string or ObjectId
  company?: mongoose.Types.ObjectId | string; // Mongoose ObjectId as string or ObjectId

  // Explicitly list fields from IProduct that are definitely processed
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
  measurements?: string; // Raw string
  measurement1?: number;
  measurement2?: number;
  measurement3?: number;
  ratio?: number;
  tableSize?: number;
  totalDepth?: number;
  status?: string; // e.g., 'Available', 'Sold', 'OnDeal'
  photo?: string;
  video?: string;
  reportLink?: string;
  image360?: string;
  location?: string; // Or a structured object if parsed
  technology?: string; // e.g., 'Lab Grown', 'Natural'
  ha?: string; // Hearts & Arrows
  girdle?: string;
  culet?: string;
  
  // Fields that might be populated during processing
  isNew?: boolean;
  hasError?: boolean;
  errorReason?: string;
  originalData?: RawProductData; // To store the raw row for debugging or history
  processed?: boolean; // Flag to indicate if product has been processed in the loop
  skipped?: boolean; // Flag to indicate if product has been skipped
  skipReason?: string; // Reason for skipping
  // Ensure all fields from original processProduct stats are covered or can be derived
  crownHeight?: number;
  pavilionDepth?: number;
  overtone?: string;
  intensity?: string;
  description?: string;
  lotNumber?: string; // Added for completeness, ensure in COLUMN_MAPPINGS if used
  additionalInfo?: string; // Added for completeness, ensure in COLUMN_MAPPINGS if used
}

// Add other utility functions from the original productUtils.js as needed, with types
// For example:
// export const someOtherUtil = (param: type): returnType => { ... }

export const validateDiamondShape = (shape?: string | null): string => {
  if (!shape) return DEFAULT_VALUES.STRING; 
  const normalized = normalizeShape(shape); // normalizeShape already returns original if not mapped
  if (!normalized) return DEFAULT_VALUES.STRING;

  // Check if the normalized shape is a known standard shape key or a valid variation that leads to a standard shape
  if (SHAPE_MAPPING[normalized]) { // It's a direct key like 'Round', 'Oval'
    return normalized;
  }
  // Check if it normalized to one of the values (which normalizeShape should already handle by returning the key)
  // This double check might be redundant if normalizeShape is robust.
  for (const standardShapeKey of Object.keys(SHAPE_MAPPING)) {
    if (SHAPE_MAPPING[standardShapeKey].map(s => s.toUpperCase()).includes(normalized.toUpperCase())) {
      return standardShapeKey; // Return the standard key it maps to
    }
  }
  // If normalizeShape returned the original because it couldn't map it, and it wasn't an empty string originally,
  // it means it's an unknown shape. Depending on strictness, this could be invalid.
  // For now, if normalizeShape (which tries to map to known shapes) returns something, we accept it.
  // This implies normalizeShape should return DEFAULT_VALUES.STRING if it truly can't make sense of the input.
  // Let's adjust normalizeShape slightly: if it doesn't find a map, it returns original. If original was empty, it returns empty.
  // So if normalized is not empty here, it's either a known shape or the original non-empty unknown shape.
  return normalized; // Accept if normalized (even if original unmapped but non-empty)
};

export const validateDiamondClarity = (clarity?: string | null): string => {
  if (!clarity) return DEFAULT_VALUES.STRING; 
  const normalized = normalizeClarity(clarity); // normalizeClarity trims, uppercases, and removes spaces
  if (!normalized) return DEFAULT_VALUES.STRING;

  if (STANDARD_DIAMOND_CLARITIES.includes(normalized)) {
    return normalized;
  }
  // Add more checks if there are other valid non-standard formats for clarity
  // For now, if not in the standard list after normalization, consider it invalid.
  return DEFAULT_VALUES.STRING; 
};

// Define the Stats interface based on its usage in the JS version of processProduct and calling controllers
export interface ProductProcessingStats {
  // Fields updated by processProduct (non-optional as they are directly manipulated)
  skippedInvalidStatus: number;
  skippedInvalidColor: number;
  skippedInvalidClarity: number;
  skippedInvalidPrice: number;
  skippedInvalidCarat: number;
  skippedMissingMedia: number;
  skippedMissingCertNumber: number;
  skippedNotLabGrown: number; // Added for Lab-Grown check
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
  apiErrors: number; // Made non-optional
  skippedByApiFilter: number; // Made non-optional

  // Fields specific to sources or advanced scenarios (optional)
  totalFromApi?: number;       // Primarily for API syncs
  totalUploaded: number;      // Primarily for file uploads, made non-optional
  replacedOtherCompanyProduct: number; // Made non-optional
  skippedCheaperExistsOtherCompany: number; // Made non-optional

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

  // Allow any other string keys for extensibility if some controllers use unique stat fields
  [key: string]: number | string | undefined | null | string[] | Array<{ certificateNumber?: string; message: string; rawDataSource?: unknown; stack?: string; [key: string]: unknown }>;
}

/**
 * Process a product object into standardized format, matching JS logic.
 * @param {RawProductData} rawProductData - The raw product data to process.
 * @param {string} companyIdString - The company ID.
 * @param {ProductProcessingStats} stats - Statistics object to track skipped products.
 * @param {object} [options] - Optional settings for processing.
 * @param {boolean} [options.allowMissingMedia=false] - If true, allows products without photo or video.
 * @param {object} [options] - Optional settings for processing (market price cache removed).
 * @returns {{ data: ProcessedProductData | null, reason: string | null }} - Processed data or null if skipped.
 */
export const processProduct = async (
  rawProductData: RawProductData, 
  companyIdString: string, // Renamed for clarity
  stats: ProductProcessingStats,
  options: {
    allowMissingMedia?: boolean;
  } = {}
): Promise<{ data: ProcessedProductData | null; reason: string | null }> => {
  
  const companyObjectId = new mongoose.Types.ObjectId(companyIdString); // Convert string to ObjectId

  const product: ProcessedProductData = {
    company: companyObjectId, // Assign ObjectId
    // Initialize other ProcessedProductData fields to their defaults or leave undefined
  };

  // Populate product.id - crucial for the schema
  // Use stockNumber if available and considered unique, otherwise generate a UUID
  // if (stockNum) { // Logic for product.id removed
  //   product.id = stockNum; 
  // } else {
  //   product.id = uuidv4(); 
  // }
  // Ensure stockNumber is also set if it exists, as it's a separate field in ProcessedProductData

  // Check product status - if not valid, update stats and return
  const statusValidation = validateProductStatus(getFieldValue(rawProductData, 'status', COLUMN_MAPPINGS.status) as string | null | undefined);
  if (!statusValidation.isValid) {
    stats.skippedInvalidStatus++;
    return { data: null, reason: 'invalid_status' };
  }
  product.status = statusValidation.normalizedValue;

  // Color: merge "Color" and "Fancy Color". Prefer FancyColor when Color is generic ("Fancy") and FancyColor has specific value (e.g. "Pink").
  const rawColor = getFieldValue(rawProductData, 'color', COLUMN_MAPPINGS.color) as string | null | undefined;
  const rawFancy = getFieldValue(rawProductData, 'fancyColorValue', COLUMN_MAPPINGS.fancyColorValue) as string | null | undefined;
  const trimColor = typeof rawColor === 'string' ? rawColor.trim() : '';
  const trimFancy = typeof rawFancy === 'string' ? rawFancy.trim() : '';
  const rawColorMerged =
    trimColor ? (isGenericFancyPlaceholder(trimColor) && trimFancy ? trimFancy : trimColor) : (trimFancy || null);
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

  const rawShape = getFieldValue(rawProductData, 'shape', COLUMN_MAPPINGS.shape) as string | null | undefined;
  product.shape = normalizeShape(rawShape);
  
  // Process measurements (handle different input formats)
  const measurementsCombinedRaw = getFieldValue(rawProductData, 'measurements', COLUMN_MAPPINGS.measurements) as string | number | null | undefined;
  let parsedMeasurements: MeasurementResult;
  if (measurementsCombinedRaw) {
    parsedMeasurements = parseMeasurements(measurementsCombinedRaw as string | number);
  } else {
    // Try individual measurement fields if combined is not present
    const m1Raw = getFieldValue(rawProductData, 'measurement1', COLUMN_MAPPINGS.measurement1);
    const m2Raw = getFieldValue(rawProductData, 'measurement2', COLUMN_MAPPINGS.measurement2);
    const m3Raw = getFieldValue(rawProductData, 'measurement3', COLUMN_MAPPINGS.measurement3);
    parsedMeasurements = {
        measurement1: parseFloat(String(m1Raw)) || 0,
        measurement2: parseFloat(String(m2Raw)) || 0,
        measurement3: parseFloat(String(m3Raw)) || 0,
        raw: (m1Raw || m2Raw || m3Raw) ? `${m1Raw || ''}x${m2Raw || ''}x${m3Raw || ''}`: undefined
    };
  }
  product.measurement1 = parsedMeasurements.measurement1;
  product.measurement2 = parsedMeasurements.measurement2;
  product.measurement3 = parsedMeasurements.measurement3;
  product.measurements = parsedMeasurements.raw; // Store raw measurement string if available

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
  const rawClarity = getFieldValue(rawProductData, 'clarity', COLUMN_MAPPINGS.clarity) as string | null | undefined;
  product.clarity = normalizeClarity(rawClarity);
  
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

  product.photo = validateUrl(getFieldValue(rawProductData, 'photo', COLUMN_MAPPINGS.photo) as string | null | undefined);
  product.video = validateUrl(getFieldValue(rawProductData, 'video', COLUMN_MAPPINGS.video) as string | null | undefined);

  if (!options.allowMissingMedia && !product.photo && !product.video) {
    stats.skippedMissingMedia++;
    return { data: null, reason: 'missing_media' };
  }

  const rawCertNumber = getFieldValue(rawProductData, 'certificateNumber', COLUMN_MAPPINGS.certificateNumber);
  product.certificateNumber = rawCertNumber ? String(rawCertNumber).trim() : DEFAULT_VALUES.STRING;
  
  if (!product.certificateNumber) {
    stats.skippedMissingCertNumber++; // Simplified increment
    return { data: null, reason: 'missing_certificate_number' };
  }
  
  const rawCertInstitute = getFieldValue(rawProductData, 'certificateInstitute', COLUMN_MAPPINGS.certificateInstitute);
  product.certificateInstitute = normalizeInstitute(String(rawCertInstitute));

  const rawLocation = getFieldValue(rawProductData, 'location', COLUMN_MAPPINGS.location);
  if (rawLocation !== null && rawLocation !== undefined) {
    const locationStr = String(rawLocation).trim();
    if (locationStr) {
      const parsedLoc = parseLocationString(locationStr);
      product.location = parsedLoc.country; // Store only country as per JS logic
    } else {
      product.location = DEFAULT_VALUES.STRING;
    }
  } else {
    product.location = DEFAULT_VALUES.STRING;
  }
  
  // Populate remaining fields
  product.stoneType = determineStoneType(product.color);
  const overtoneFormatted = formatFieldValue('overtone', getFieldValue(rawProductData, 'overtone', COLUMN_MAPPINGS.overtone));
  product.overtone = overtoneFormatted || product.overtone || DEFAULT_VALUES.STRING;
  const intensityFormatted = formatFieldValue('intensity', getFieldValue(rawProductData, 'intensity', COLUMN_MAPPINGS.intensity));
  product.intensity = intensityFormatted || product.intensity || DEFAULT_VALUES.STRING;
  const normalizedCut = normalizeCut(getFieldValue(rawProductData, 'cut', COLUMN_MAPPINGS.cut) as string | null | undefined);
  if (normalizedCut) {
    product.cut = normalizedCut;
  }
  product.polish = normalizeGrade(getFieldValue(rawProductData, 'polish', COLUMN_MAPPINGS.polish) as string | null | undefined);
  product.symmetry = normalizeGrade(getFieldValue(rawProductData, 'symmetry', COLUMN_MAPPINGS.symmetry) as string | null | undefined);
  product.sold = Boolean(getFieldValue(rawProductData, 'sold', []) || DEFAULT_VALUES.BOOLEAN); // Ensure 'sold' is mapped or handled if needed
  product.tableSize = parseFloat(String(getFieldValue(rawProductData, 'tableSize', COLUMN_MAPPINGS.tableSize))) || DEFAULT_VALUES.NUMBER;
  product.crownHeight = parseFloat(String(getFieldValue(rawProductData, 'crownHeight', COLUMN_MAPPINGS.crownHeight))) || DEFAULT_VALUES.NUMBER;
  product.pavilionDepth = parseFloat(String(getFieldValue(rawProductData, 'pavilionDepth', COLUMN_MAPPINGS.pavilionDepth))) || DEFAULT_VALUES.NUMBER;
  product.girdle = formatFieldValue('girdle', getFieldValue(rawProductData, 'girdle', COLUMN_MAPPINGS.girdle)).toUpperCase();
  product.culet = formatFieldValue('culet', getFieldValue(rawProductData, 'culet', COLUMN_MAPPINGS.culet)).toUpperCase();
  product.totalDepth = parseFloat(String(getFieldValue(rawProductData, 'totalDepth', COLUMN_MAPPINGS.totalDepth))) || DEFAULT_VALUES.NUMBER;
  product.fluorescence = formatFieldValue('fluorescence', getFieldValue(rawProductData, 'fluorescence', COLUMN_MAPPINGS.fluorescence)).toUpperCase();
  product.ha = String(getFieldValue(rawProductData, 'ha', COLUMN_MAPPINGS.ha) || DEFAULT_VALUES.STRING);
  product.technology = formatFieldValue('technology', getFieldValue(rawProductData, 'technology', COLUMN_MAPPINGS.technology));
  product.description = formatFieldValue('description', getFieldValue(rawProductData, 'description', COLUMN_MAPPINGS.description));
  // product.lotNumber = formatFieldValue('lotNumber', getFieldValue(rawProductData, 'lotNumber', COLUMN_MAPPINGS.lotNumber || []));
  // product.additionalInfo = formatFieldValue('additionalInfo', getFieldValue(rawProductData, 'additionalInfo', COLUMN_MAPPINGS.additionalInfo || []));

  // ID and Link will be set by the calling controller in JS, so we don't set them here.
  // Similarly for createdAt, updatedAt, onDeal.
  // product.id is no longer set here as the field is removed from the model

  // Check if the product is Lab-Grown
  const labGrownKeywords = [
    'LAB GROWN', 
    'LAB-GROWN', 
    'SYNTHETIC', 
    'LG', 
    'LAB CREATED', 
    'MAN-MADE', 
    'MAN MADE',
    'LABORATORY GROWN',
    'LABORATORY-GROWN',
    'CVD',
    'HPHT',
    'Labgrown',
    'LAB_GROWN', // User added
    'Laboratory Grown Diamond' // User added
  ];
  
  let isLabGrown = false;
  let finalTechForProduct = DEFAULT_VALUES.STRING;
  let specificTechFound = false; // True if "CVD" or "HPHT" is confirmed

  const uniquePotentialTechFieldKeys = Array.from(new Set(COLUMN_MAPPINGS.technology || []));

  // Phase 1: Look for specific CVD/HPHT
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
        // Check all labGrownKeywords. If a specific one like CVD/HPHT is matched here,
        // it implies it wasn't caught in Phase 1 (e.g. not as a whole word or full phrase),
        // but is still a valid keyword. In this case, we use standardized "LABORATORY-GROWN".
        if (labGrownKeywords.some(keyword => valueStrUpper.includes(keyword))) {
          isLabGrown = true;
          finalTechForProduct = "LABORATORY-GROWN"; // Use standardized value instead of original
          break; // Found a general lab-grown term (or a specific one in a general context), use this and stop.
        }
      }
    }
  }
  
  // Decision and assignment
  if (!isLabGrown) {
    // If not lab-grown after checking all relevant fields, assign the primary 'technology' field's value (which might be "Natural", empty, etc.)
    const primaryTechValue = getFieldValue(rawProductData, 'technology', COLUMN_MAPPINGS.technology);
    product.technology = formatFieldValue('technology', primaryTechValue);
    stats.skippedNotLabGrown = (stats.skippedNotLabGrown || 0) + 1;
    return { data: null, reason: 'not_lab_grown' };
  }

  // If isLabGrown is true, finalTechForProduct contains "CVD", "HPHT", or the content of the field with a general keyword.
  product.technology = formatFieldValue('technology', finalTechForProduct);

  // --- Market price calculation moved to market-price-calculator-service ---
  
  return { data: product, reason: null };
};

/**
 * Format product data for update, typically for a single product update scenario.
 * @param {Partial<IProduct>} data - The data to format.
 * @returns {Partial<IProduct>} - The formatted data, ready for DB update.
 */
export const formatProductData = (data: Partial<IProduct>): Partial<IProduct> => {
  const formattedData: Partial<IProduct> = { ...data };

  // Normalize and validate status
  if (data.status !== undefined) {
    const statusValidation = validateProductStatus(data.status);
    // For formatProductData, we might be more lenient or expect already valid statuses.
    // If it needs to be strict like processProduct, this logic would change.
    // For now, assume we just want to normalize if it's a known alias.
    formattedData.status = statusValidation.normalizedValue; 
  }

  // Normalize and validate color (strict D-G from processProduct might apply or be different here)
  if (data.color !== undefined) {
    const colorValidation = validateDiamondColor(data.color);
    // Depending on context, might allow fancy colors here or have different validation.
    // Sticking to the D-G validation for consistency if this function is used by similar logic.
    formattedData.color = colorValidation.isValid ? colorValidation.normalizedValue : data.color; // Keep original if not D-G
  }

  // Normalize shape
  if (data.shape !== undefined) {
    formattedData.shape = normalizeShape(data.shape);
  }
  
  // Ensure numeric fields are numbers
  const numericFields: (keyof IProduct)[] = ['carat', 'price', 'pricePerCarat', 'discount', 'measurement1', 'measurement2', 'measurement3', 'ratio', 'tableSize', 'totalDepth', 'crownHeight', 'pavilionDepth'];
  for (const field of numericFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const val = parseFloat(String(data[field]));
      (formattedData as Record<string, unknown>)[field] = isNaN(val) ? DEFAULT_VALUES.NUMBER : val;
    } else if (data[field] === null && formattedData[field] !== undefined) {
      // If explicitly set to null, respect it, otherwise ensure it's not undefined if key exists
      (formattedData as Record<string, unknown>)[field] = null; 
    }
  }

  // Measurements: if individual m1,m2,m3 are provided and measurements string is not, construct it.
  // If 'measurements' string is provided, it takes precedence (parseMeasurements logic would be called by consumer if needed).
  if (formattedData.measurement1 && formattedData.measurement2 && formattedData.measurement3 && !formattedData.measurements) {
    formattedData.measurements = `${formattedData.measurement1}x${formattedData.measurement2}x${formattedData.measurement3}`;
  } else if (data.measurements) { // If raw measurements string provided
    const parsed = parseMeasurements(data.measurements);
    formattedData.measurement1 = parsed.measurement1;
    formattedData.measurement2 = parsed.measurement2;
    formattedData.measurement3 = parsed.measurement3;
    formattedData.measurements = parsed.raw || data.measurements; // Keep original if parsing failed to produce raw
  }

  // Calculate ratio if not provided but measurements are available
  if (!formattedData.ratio || formattedData.ratio === 0) {
    if (formattedData.measurement1 && formattedData.measurement2 && formattedData.measurement1 > 0 && formattedData.measurement2 > 0) {
      formattedData.ratio = parseFloat((formattedData.measurement1 / formattedData.measurement2).toFixed(2));
    }
  }

  // Calculate totalDepth if not provided but measurements and shape are available
  if (!formattedData.totalDepth || formattedData.totalDepth === 0) {
    if (formattedData.shape && formattedData.measurement1 && formattedData.measurement2 && formattedData.measurement3 && 
        formattedData.measurement1 > 0 && formattedData.measurement2 > 0 && formattedData.measurement3 > 0) {
      formattedData.totalDepth = calculateTotalDepthPercent(formattedData.shape, formattedData.measurement1, formattedData.measurement2, formattedData.measurement3);
    }
  }

  // Normalize string fields (uppercase, trim)
  const upperCaseFields: (keyof IProduct)[] = ['clarity', 'cut', 'polish', 'symmetry', 'fluorescence', 'girdle', 'culet'];
  for (const field of upperCaseFields) {
    if (data[field] !== undefined && typeof data[field] === 'string') {
      (formattedData as Record<string, unknown>)[field] = (data[field] as string).toUpperCase().trim();
    }
  }
  
  if (data.certificateInstitute !== undefined && typeof data.certificateInstitute === 'string') {
    formattedData.certificateInstitute = normalizeInstitute(data.certificateInstitute);
  }
  if (data.certificateNumber !== undefined && typeof data.certificateNumber === 'string') {
    formattedData.certificateNumber = data.certificateNumber.trim(); // JS version did not uppercase cert number
  }
  
  // Normalize location
  if (data.location !== undefined && typeof data.location === 'string') {
    const parsedLoc = parseLocationString(data.location);
    formattedData.location = parsedLoc.country;
  }

  // Calculate price/pricePerCarat if possible (similar to processProduct)
  if (formattedData.price !== undefined && formattedData.carat !== undefined && formattedData.carat > 0) {
    if (formattedData.pricePerCarat === undefined || formattedData.pricePerCarat === 0) { // Calculate PPC if not provided or zero
        formattedData.pricePerCarat = parseFloat((formattedData.price / formattedData.carat).toFixed(2));
    }
  } else if (formattedData.pricePerCarat !== undefined && formattedData.carat !== undefined && formattedData.carat > 0) {
    if (formattedData.price === undefined || formattedData.price === 0) { // Calculate Price if not provided or zero
        formattedData.price = parseFloat((formattedData.pricePerCarat * formattedData.carat).toFixed(2));
    }
  }
  // Ensure they are numbers and rounded if they exist
  if (formattedData.price !== undefined) formattedData.price = parseFloat(Number(formattedData.price).toFixed(2));
  if (formattedData.pricePerCarat !== undefined) formattedData.pricePerCarat = parseFloat(Number(formattedData.pricePerCarat).toFixed(2));

  // Timestamps
  formattedData.updatedAt = new Date(); 
  // createdAt should typically only be set on creation, not during general updates.
  // history might be appended to, not overwritten, depending on use case.

  // Remove fields that should not be directly updated or are derived
  // delete formattedData.id; // system-generated id, should not be changed by client usually
  // delete formattedData._id; // mongo id
  // delete formattedData.company; // company ref
  // delete formattedData.link; // derived

  // If cut is empty or invalid, remove it from formattedData
  if (!formattedData.cut) {
    delete formattedData.cut;
  }

  return formattedData;
};