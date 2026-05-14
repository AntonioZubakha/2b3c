import { z } from 'zod';
import { validatePhoneToE164 } from '../utils/phoneValidation';

// Base schemas for common validation patterns

// Email validation
export const EmailSchema = z.string()
  .email('Invalid email format')
  .min(1, 'Email is required')
  .max(255, 'Email is too long');

// Password validation
export const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number');

/**
 * E.164 via libphonenumber-js: must start with **+** and country code; spaces/dashes/parentheses stripped.
 */
export const PhoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .max(45, 'Phone number is too long')
  .transform((raw) => {
    const r = validatePhoneToE164(raw);
    if (!r.ok) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: r.message,
          path: []
        }
      ]);
    }
    return r.e164;
  });

// Non-empty string validation
export const NonEmptyStringSchema = z.string()
  .min(1, 'This field is required')
  .max(255, 'This field is too long');

// Optional non-empty string validation (allows empty string or undefined, but if provided and non-empty, must be valid)
export const OptionalNonEmptyStringSchema = z.union([
    z.literal('').transform(() => undefined),
    z.string().min(1, 'This field cannot be empty').max(255, 'This field is too long')
]).optional();

// ObjectId validation
export const ObjectIdSchema = z.string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// User role validation
export const UserRoleSchema = z.enum(['admin', 'supervisor', 'manager', 'logist']);

// Date validation
export const DateSchema = z.string()
  .datetime('Invalid date format')
  .or(z.date());

// Positive number validation
export const PositiveNumberSchema = z.number()
  .positive('Must be a positive number');

// Non-negative number validation
export const NonNegativeNumberSchema = z.number()
  .nonnegative('Must be a non-negative number');

// ---- Pagination Schemas ----

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// ---- Address Schemas ----

export const AddressSchema = z.object({
    address: NonEmptyStringSchema,
    city: NonEmptyStringSchema,
    region: OptionalNonEmptyStringSchema,
    zipCode: OptionalNonEmptyStringSchema,
    country: NonEmptyStringSchema
});

export const ShippingAddressSchema = z.object({
    recipientName: OptionalNonEmptyStringSchema,
    companyName: OptionalNonEmptyStringSchema,
    addressLine1: NonEmptyStringSchema,
    addressLine2: OptionalNonEmptyStringSchema,
    city: NonEmptyStringSchema,
    stateProvinceRegion: OptionalNonEmptyStringSchema,
    postalCode: OptionalNonEmptyStringSchema,
    country: NonEmptyStringSchema,
    phone: OptionalNonEmptyStringSchema,
    email: EmailSchema.optional()
});

// ---- Deal Type Schemas ----

export const DealStatusSchema = z.enum([
    'pending', 'rejected', 'cancelled',
    'awaiting_invoice', 'invoice_pending', 'awaiting_payment', 
    'alternative_product_proposed',
    'payment_received', 'shipped', 'completed',
    'shipping_documents_uploaded', 'delivery_confirmed', 
    'payment_pending', 'awaiting_shipping_documents', 'invoice_accepted',
    // LGDEAL Internal Workflow statuses
    'assigned_to_manager', 'quality_check_in_progress', 'quality_approved', 'quality_rejected', 'ready_for_shipping'
]);

export const DealStageSchema = z.enum([
    'request', 'payment_delivery', 'completed', 'cancelled'
]);

export const DealTypeSchema = z.enum([
    'buyer-to-lgdeal', 'lgdeal-to-seller'
]);

// ---- Product Status Schemas ----

export const ProductStatusSchema = z.enum([
    'Available', 'Sold', 'OnDeal', 'Incoming', 'Reserved'
]);

// ---- Company Status Schemas ----

export const CompanyStatusSchema = z.enum([
    'active', 'pending_review', 'suspended', 'inactive'
]);

// ---- Price and Numeric Schemas ----

export const PriceSchema = z.number()
    .positive('Price must be positive')
    .max(10000000, 'Price cannot exceed $10M');

export const CaratSchema = z.number()
    .positive('Carat must be positive')
    .max(100, 'Carat cannot exceed 100');

export const PercentageSchema = z.number()
    .min(0, 'Percentage cannot be negative')
    .max(100, 'Percentage cannot exceed 100');

// ---- Date Schemas ----

export const DateStringSchema = z.string().datetime({
    message: 'Invalid ISO date format'
}).or(z.date());

export const OptionalDateStringSchema = DateStringSchema.optional();

// ---- Simple Date Schema (YYYY-MM-DD format) ----
export const SimpleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Invalid date format. Expected YYYY-MM-DD'
}).transform(dateStr => {
    // Validate that it's a real date
    const date = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
    }
    return dateStr;
});

export const OptionalSimpleDateSchema = SimpleDateSchema.optional();

// ---- Flexible Date Schema (accepts both formats) ----
export const FlexibleDateSchema = z.union([
    SimpleDateSchema, // YYYY-MM-DD
    DateStringSchema  // Full ISO datetime
]);

export const OptionalFlexibleDateSchema = FlexibleDateSchema.optional();

// ---- File Upload Schemas ----

export const FileUploadSchema = z.object({
    filename: NonEmptyStringSchema,
    originalName: NonEmptyStringSchema,
    mimetype: NonEmptyStringSchema,
    size: z.number().positive(),
    url: z.string().url()
});

// ---- Common Response Schemas ----

export const SuccessResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.any().optional()
});

export const ErrorResponseSchema = z.object({
    success: z.literal(false),
    message: z.string(),
    error: z.string().optional(),
    details: z.any().optional()
});

// ---- ID Parameter Schemas ----

export const IdParamsSchema = z.object({
    id: ObjectIdSchema
});

export const UserIdParamsSchema = z.object({
    userId: ObjectIdSchema
});

export const DealIdParamsSchema = z.object({
    dealId: ObjectIdSchema
});

export const ProductIdParamsSchema = z.object({
    productId: ObjectIdSchema
});

export const CompanyIdParamsSchema = z.object({
    companyId: ObjectIdSchema
});

// ---- Export all schemas for easy access ----
export * from './schemas/authSchemas';
export * from './schemas/dealSchemas';
export * from './schemas/productSchemas';
export * from './schemas/companySchemas'; 