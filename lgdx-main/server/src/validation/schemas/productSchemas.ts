import { z } from 'zod';
import { 
    ObjectIdSchema,
    NonEmptyStringSchema, 
    OptionalNonEmptyStringSchema,
    PriceSchema,
    CaratSchema,
    ProductStatusSchema,
    PaginationSchema,
    DateStringSchema
} from '../baseSchemas';

// ---- Product Base Schema ----

export const ProductSchema = z.object({
    _id: ObjectIdSchema.optional(),
    id: OptionalNonEmptyStringSchema,
    company: ObjectIdSchema.optional(),
    companyId: OptionalNonEmptyStringSchema,
    companyName: OptionalNonEmptyStringSchema,
    
    // Main identifiers
    stockNumber: OptionalNonEmptyStringSchema,
    certificateNumber: OptionalNonEmptyStringSchema,
    
    // Diamond characteristics
    shape: OptionalNonEmptyStringSchema,
    carat: CaratSchema.optional(),
    color: OptionalNonEmptyStringSchema,
    clarity: OptionalNonEmptyStringSchema,
    cut: OptionalNonEmptyStringSchema,
    polish: OptionalNonEmptyStringSchema,
    symmetry: OptionalNonEmptyStringSchema,
    fluorescence: OptionalNonEmptyStringSchema,
    
    // Certificate info
    certificateInstitute: OptionalNonEmptyStringSchema,
    
    // Pricing
    price: PriceSchema.optional(),
    marketPrice: PriceSchema.optional(),
    marketPricePerCarat: PriceSchema.optional(),
    pricePerCarat: PriceSchema.optional(),
    discount: z.number().optional(),
    
    // Measurements
    measurements: OptionalNonEmptyStringSchema,
    measurement1: z.number().positive().optional(),
    measurement2: z.number().positive().optional(),
    measurement3: z.number().positive().optional(),
    ratio: z.number().positive().optional(),
    
    // Diamond details
    tableSize: z.number().min(0).max(100).optional(),
    totalDepth: z.number().min(0).max(100).optional(),
    crownHeight: z.number().positive().optional(),
    pavilionDepth: z.number().positive().optional(),
    girdle: OptionalNonEmptyStringSchema,
    culet: OptionalNonEmptyStringSchema,
    
    // Status
    status: ProductStatusSchema.optional(),
    onDeal: z.boolean().optional(),
    sold: z.boolean().optional(),
    
    // Media
    photo: z.string().url().optional(),
    video: z.string().url().optional(),
    reportLink: z.string().url().optional(),
    image360: z.string().url().optional(),
    
    // Additional info
    location: OptionalNonEmptyStringSchema,
    technology: OptionalNonEmptyStringSchema,
    stoneType: OptionalNonEmptyStringSchema,
    overtone: OptionalNonEmptyStringSchema,
    intensity: OptionalNonEmptyStringSchema,
    description: OptionalNonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    comment: OptionalNonEmptyStringSchema,
    details: OptionalNonEmptyStringSchema,
    ha: OptionalNonEmptyStringSchema,
    lotNumber: OptionalNonEmptyStringSchema,
    additionalInfo: OptionalNonEmptyStringSchema,
    
    // Timestamps
    createdAt: DateStringSchema.optional(),
    updatedAt: DateStringSchema.optional(),
    lastSync: DateStringSchema.optional(),
    
    // Processing flags
    isNew: z.boolean().optional()
});

// ---- Product Search/Filter Schemas ----

export const ProductFilterSchema = z.object({
    ...PaginationSchema.shape,
    
    // Basic filters
    search: z.string().optional(),
    companyId: ObjectIdSchema.optional(),
    status: ProductStatusSchema.optional(),
    onDeal: z.coerce.boolean().optional(),
    
    // Diamond characteristics filters
    shape: z.string().optional(),
    color: z.string().optional(),
    clarity: z.string().optional(),
    cut: z.string().optional(),
    fluorescence: z.string().optional(),
    certificateInstitute: z.string().optional(),
    
    // Price range
    priceMin: z.coerce.number().positive().optional(),
    priceMax: z.coerce.number().positive().optional(),
    
    // Carat range
    caratMin: z.coerce.number().positive().optional(),
    caratMax: z.coerce.number().positive().optional(),
    
    // Weight range (legacy/alternative to carat)
    weight: z.string().optional(),
    
    // Date filters
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    
    // Advanced filters
    technology: z.string().optional(),
    location: z.string().optional(),
    hasMedia: z.coerce.boolean().optional(),
    hasCertificate: z.coerce.boolean().optional(),
    
    // Additional legacy parameters from marketplaceController
    symmetry: z.string().optional(),
    polish: z.string().optional(),
    lab: z.string().optional(), // Lab parameter for certificate institute filtering
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    len: z.string().optional(),
    l: z.string().optional(),
    wid: z.string().optional(),
    w: z.string().optional(),
    h: z.string().optional(),
    table: z.string().optional(),
    depth: z.string().optional(),
    ratio: z.string().optional(),
    girdle: z.string().optional(), // Girdle filter parameter
    fancyOnly: z.enum(['true', 'false']).optional(), // Fancy catalog – only honoured for LGDEAL supervisors
    intensity: z.string().optional(), // Fancy intensity (e.g. "Fancy vivid") – only when fancyOnly
    overtone: z.string().optional() // Fancy overtone (e.g. "Orangey Yellow") – only when fancyOnly
});

// ---- Product Upload/Import Schemas ----

export const ProductUploadSchema = z.object({
    file: z.object({
        filename: NonEmptyStringSchema,
        originalName: NonEmptyStringSchema,
        mimetype: z.enum(['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
        size: z.number().positive().max(50 * 1024 * 1024) // 50MB max
    }),
    uploadMode: z.enum(['replace', 'add']).default('replace'),
    validateOnly: z.boolean().default(false)
});

export const ProductBulkUpdateSchema = z.object({
    productIds: z.array(ObjectIdSchema).min(1, 'At least one product ID required'),
    updates: z.object({
        status: ProductStatusSchema.optional(),
        price: PriceSchema.optional(),
        marketPrice: PriceSchema.optional(),
        marketPricePerCarat: PriceSchema.optional(),
        discount: z.number().optional(),
        location: OptionalNonEmptyStringSchema,
        notes: OptionalNonEmptyStringSchema
    })
});



export const ProductCreateSchema = ProductSchema.extend({
    stockNumber: NonEmptyStringSchema, // Required for creation
    carat: CaratSchema, // Required for creation
    price: PriceSchema, // Required for creation
    shape: NonEmptyStringSchema, // Required for creation
    color: NonEmptyStringSchema, // Required for creation
    clarity: NonEmptyStringSchema // Required for creation
});

export const ProductUpdateSchema = ProductSchema.partial();

// ---- Cart Item Schemas ----

export const AddToCartSchema = z.object({
    productId: ObjectIdSchema,
    quantity: z.number().int().positive().default(1),
    price: PriceSchema.optional() // If provided, override product price
});

export const UpdateCartItemSchema = z.object({
    cartItemId: ObjectIdSchema,
    quantity: z.number().int().positive().optional(),
    price: PriceSchema.optional()
});

export const UpdateCartQuantitySchema = z.object({
    productId: ObjectIdSchema,
    newQuantity: z.number().int().positive(),
});

export const RemoveFromCartSchema = z.object({
    cartItemIds: z.array(ObjectIdSchema).min(1, 'At least one cart item ID required')
});

// ---- Product Statistics Schemas ----

export const ProductStatsQuerySchema = z.object({
    groupBy: z.enum(['shape', 'color', 'clarity', 'cut', 'company', 'status']).default('shape'),
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    companyId: ObjectIdSchema.optional()
});

// ---- Alternative Products Schema ----

export const FindAlternativesSchema = z.object({
    productId: ObjectIdSchema,
    limit: z.number().int().positive().max(20).default(5),
    caratTolerance: z.number().positive().max(1).default(0.1), // ±0.1 carat by default
    priceTolerance: z.number().positive().max(0.5).default(0.2), // ±20% price by default
    excludeCompanies: z.array(ObjectIdSchema).optional()
});

// ---- Perfect Pair Search Schema ----

export const FindPerfectPairSchema = z.object({
    referenceId: ObjectIdSchema, // Frontend sends referenceId for perfect pair
    shape: z.string().optional(),
    color: z.string().optional(),
    clarity: z.string().optional(),
    carat: z.coerce.number().positive().optional(),
    cut: z.string().optional(),
    polish: z.string().optional(),
    symmetry: z.string().optional()
});

// ---- Type Exports ----

export type Product = z.infer<typeof ProductSchema>;
export type ProductFilter = z.infer<typeof ProductFilterSchema>;
export type ProductUpload = z.infer<typeof ProductUploadSchema>;
export type ProductBulkUpdate = z.infer<typeof ProductBulkUpdateSchema>;
export type ProductCreate = z.infer<typeof ProductCreateSchema>;
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;
export type AddToCart = z.infer<typeof AddToCartSchema>;
export type UpdateCartItem = z.infer<typeof UpdateCartItemSchema>;
export type UpdateCartQuantity = z.infer<typeof UpdateCartQuantitySchema>;
export type RemoveFromCart = z.infer<typeof RemoveFromCartSchema>;
export type ProductStatsQuery = z.infer<typeof ProductStatsQuerySchema>;
export type FindAlternatives = z.infer<typeof FindAlternativesSchema>;
export type FindPerfectPair = z.infer<typeof FindPerfectPairSchema>; 