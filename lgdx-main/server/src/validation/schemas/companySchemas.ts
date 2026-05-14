import { z } from 'zod';
import { 
    ObjectIdSchema,
    NonEmptyStringSchema, 
    OptionalNonEmptyStringSchema,
    EmailSchema,
    CompanyStatusSchema,
    ShippingAddressSchema,
    PaginationSchema,
    DateStringSchema
} from '../baseSchemas';

// ---- Company Address Schemas ----

export const CompanyAddressSchema = z.object({
    addressLine1: OptionalNonEmptyStringSchema,
    addressLine2: OptionalNonEmptyStringSchema,
    city: OptionalNonEmptyStringSchema,
    stateProvinceRegion: OptionalNonEmptyStringSchema,
    postalCode: OptionalNonEmptyStringSchema,
    country: OptionalNonEmptyStringSchema,
    // Legacy fields for compatibility
    address: OptionalNonEmptyStringSchema,
    region: OptionalNonEmptyStringSchema,
    zipCode: OptionalNonEmptyStringSchema
});

// ---- Company Details Schema ----

export const CompanyDetailsSchema = z.object({
    phone: OptionalNonEmptyStringSchema,
    website: z.string().url().optional(),
    address: OptionalNonEmptyStringSchema,
    city: OptionalNonEmptyStringSchema,
    country: OptionalNonEmptyStringSchema,
    zipCode: OptionalNonEmptyStringSchema,
    taxId: OptionalNonEmptyStringSchema,
    registrationNumber: OptionalNonEmptyStringSchema,
    
    // Company-specific fields
    email: z.string().email().optional(),
    companyCountry: OptionalNonEmptyStringSchema,
    technology: OptionalNonEmptyStringSchema,
    
    // Address objects
    shippingAddress: CompanyAddressSchema.optional(),
    legalAddress: CompanyAddressSchema.optional(),
    billingAddress: CompanyAddressSchema.optional(),
    actualAddress: CompanyAddressSchema.optional(),
    
    // Logo and media
    logoUrl: z.string().optional(),
    logo: z.object({
        url: z.string(),
        filename: NonEmptyStringSchema
    }).optional(),
    
    // Bank information
    bankInformation: z.object({
        accountName: OptionalNonEmptyStringSchema,
        bankName: OptionalNonEmptyStringSchema,
        accountNumber: OptionalNonEmptyStringSchema,
        routingNumber: OptionalNonEmptyStringSchema,
        swiftCode: OptionalNonEmptyStringSchema,
        bankAddress: OptionalNonEmptyStringSchema,
        correspondentBank: z.object({
            accountName: OptionalNonEmptyStringSchema,
            bankName: OptionalNonEmptyStringSchema,
            accountNumber: OptionalNonEmptyStringSchema,
            swiftCode: OptionalNonEmptyStringSchema,
            bankAddress: OptionalNonEmptyStringSchema
        }).optional()
    }).optional(),
    
    // Tax information
    taxInformation: z.object({
        taxId: OptionalNonEmptyStringSchema,
        vatNumber: OptionalNonEmptyStringSchema,
        worksWithVat: z.boolean().optional()
    }).optional(),
    
    // Documents
    documents: z.array(z.object({
        name: NonEmptyStringSchema,
        url: z.string(),
        uploadedAt: DateStringSchema
    })).optional()
});

// ---- Company Payment Settings Schema ----

export const CompanyPaymentSettingsSchema = z.object({
    stripeEnabled: z.boolean().optional()
});

// ---- Company User Schema ----

export const CompanyUserSchema = z.object({
    _id: ObjectIdSchema.optional(),
    user: ObjectIdSchema,
    role: z.enum(['admin', 'supervisor', 'manager', 'logist']),
    isActive: z.boolean()
});

// ---- Company Base Schema ----

export const CompanySchema = z.object({
    _id: ObjectIdSchema.optional(),
    name: NonEmptyStringSchema,
    description: OptionalNonEmptyStringSchema,
    details: CompanyDetailsSchema.optional(),
    primaryAdminId: ObjectIdSchema,
    status: CompanyStatusSchema,
    type: z.enum(['supplier', 'buyer', 'both']).optional(),
    invitedBy: ObjectIdSchema.optional(),
    approvedBy: ObjectIdSchema.optional(),
    approvedAt: DateStringSchema.optional(),
    notes: OptionalNonEmptyStringSchema,
    users: z.array(CompanyUserSchema).optional(),
    createdAt: DateStringSchema.optional(),
    updatedAt: DateStringSchema.optional()
});

// ---- Company Creation/Update Schemas ----

export const CreateCompanySchema = z.object({
    name: NonEmptyStringSchema,
    description: OptionalNonEmptyStringSchema,
    type: z.enum(['supplier', 'buyer', 'both']).default('both'),
    details: CompanyDetailsSchema.optional(),
    primaryAdminEmail: EmailSchema,
    primaryAdminFirstName: NonEmptyStringSchema,
    primaryAdminLastName: NonEmptyStringSchema,
    primaryAdminPassword: z.string().min(6)
});

export const UpdateCompanySchema = z.object({
    name: NonEmptyStringSchema.optional(),
    description: OptionalNonEmptyStringSchema,
    status: CompanyStatusSchema.optional(),
    type: z.enum(['supplier', 'buyer', 'both']).optional(),
    details: CompanyDetailsSchema.deepPartial().optional(),
    notes: OptionalNonEmptyStringSchema
});

export const UpdateCompanyDetailsSchema = CompanyDetailsSchema.deepPartial();

// Schema for updating company info via the frontend form
export const UpdateCompanyInfoSchema = z.object({
    name: NonEmptyStringSchema.optional(),
    description: OptionalNonEmptyStringSchema,
    details: CompanyDetailsSchema.deepPartial().optional(),
    paymentSettings: CompanyPaymentSettingsSchema.optional()
});

// ---- Company User Management Schemas ----

export const AddUserToCompanySchema = z.object({
    email: EmailSchema,
    firstName: NonEmptyStringSchema,
    lastName: NonEmptyStringSchema,
    role: z.enum(['supervisor', 'manager', 'logist']),
    password: z.string().min(6).optional(), // Optional if user exists
    sendInvitation: z.boolean().default(true)
});

export const UpdateCompanyUserSchema = z.object({
    role: z.enum(['supervisor', 'manager', 'logist']).optional(),
    isActive: z.boolean().optional()
});

// ---- Invitations ----

export const InviteMemberSchema = z.object({
    email: EmailSchema
});

export const InvitationIdParamsSchema = z.object({
    id: ObjectIdSchema
});

export const AcceptInvitationSchema = z.object({
    token: NonEmptyStringSchema,
    password: z.string().min(8),
    firstName: NonEmptyStringSchema,
    lastName: NonEmptyStringSchema,
    phone: NonEmptyStringSchema
});

export const RemoveUserFromCompanySchema = z.object({
    userId: ObjectIdSchema,
    reason: OptionalNonEmptyStringSchema
});

// ---- Company Search/Filter Schemas ----

export const CompanyFilterSchema = z.object({
    ...PaginationSchema.shape,
    search: z.string().optional(),
    status: CompanyStatusSchema.optional(),
    type: z.enum(['supplier', 'buyer', 'both']).optional(),
    hasActiveUsers: z.coerce.boolean().optional(),
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    approvedBy: ObjectIdSchema.optional()
});

// ---- Company Approval Schemas ----

export const ApproveCompanySchema = z.object({
    notes: OptionalNonEmptyStringSchema,
    approveUsers: z.boolean().default(true), // Also approve company users
    notifyUsers: z.boolean().default(true)
});

export const RejectCompanySchema = z.object({
    reason: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    notifyUsers: z.boolean().default(true)
});

export const SuspendCompanySchema = z.object({
    reason: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    suspendUsers: z.boolean().default(true),
    notifyUsers: z.boolean().default(true)
});

// ---- Company API Configuration Schemas ----

export const ApiConfigSchema = z.object({
    url: z.string().url(),
    requestType: z.enum(['get', 'post']),
    headers: z.record(z.any()).optional(),
    params: z.record(z.any()).optional(),
    baseBodyPayload: z.record(z.any()).optional(),
    dataKey: z.string().default('data'), // Allow empty string, default to 'data'
    /** Path in response to total count for pagination (e.g. data.totalCount) */
    totalCountPath: z.string().optional(),
    filter: z.record(z.any()).optional()
});

export const TokenAuthConfigSchema = z.object({
    enabled: z.boolean(),
    url: z.string().url().optional(),
    requestType: z.enum(['get', 'post']).optional(),
    params: z.record(z.any()).optional(),
    headers: z.record(z.any()).optional(),
    bodyPayload: z.record(z.any()).optional(),
    bodyEncodeType: z.enum(['json', 'form', 'string']).optional(),
    tokensPathInResponse: z.union([z.string(), z.record(z.string())]).optional(),
    tokenUsage: z.array(z.object({
        nameInResponse: OptionalNonEmptyStringSchema,
        placeholderName: OptionalNonEmptyStringSchema,
        placement: z.enum(['header', 'param', 'url_segment', 'body']),
        destinationName: OptionalNonEmptyStringSchema,
        bodyKeyPath: OptionalNonEmptyStringSchema,
        formatPrefix: z.string().optional(),
        formatSuffix: z.string().optional()
    })).optional()
}).refine((data) => {
    // If token auth is enabled, URL must be provided and valid
    if (data.enabled) {
        return data.url && data.url.length > 0;
    }
    return true;
}, {
    message: "URL is required when token authentication is enabled",
    path: ["url"]
});

export const SyncScheduleSchema = z.object({
    frequency: z.enum(['daily', 'hourly', 'manual']),
    timeOfDay: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')
});

export const CompanyApiConfigSchema = z.object({
    _id: ObjectIdSchema.optional(),
    company: ObjectIdSchema,
    isActive: z.boolean(),
    config: ApiConfigSchema,
    lastSync: DateStringSchema.nullable().optional(),
    syncStatus: z.enum(['idle', 'in_progress', 'success', 'error']),
    lastSyncError: z.string().nullable().optional(),
    syncSchedule: SyncScheduleSchema,
    tokenAuthConfig: TokenAuthConfigSchema.optional(),
    allowMissingMedia: z.boolean().optional(),
    createdAt: DateStringSchema.optional(),
    updatedAt: DateStringSchema.optional()
});

export const UpdateApiConfigSchema = z.object({
    config: ApiConfigSchema.partial().optional(),
    syncSchedule: SyncScheduleSchema.partial().optional(),
    tokenAuthConfig: TokenAuthConfigSchema.optional(),
    allowMissingMedia: z.boolean().optional(),
    isActive: z.boolean().optional()
});

// ---- Company Statistics Schemas ----

export const CompanyStatsQuerySchema = z.object({
    dateFrom: DateStringSchema.optional(),
    dateTo: DateStringSchema.optional(),
    includeProducts: z.boolean().default(true),
    includeDeals: z.boolean().default(true),
    includeUsers: z.boolean().default(false)
});

// ---- Command Execution Schemas ----

export const ExecuteCommandSchema = z.object({
    command: NonEmptyStringSchema
});

// ---- Type Exports ----

export type Company = z.infer<typeof CompanySchema>;
export type CompanyDetails = z.infer<typeof CompanyDetailsSchema>;
export type CompanyPaymentSettings = z.infer<typeof CompanyPaymentSettingsSchema>;
export type CompanyUser = z.infer<typeof CompanyUserSchema>;
export type CreateCompany = z.infer<typeof CreateCompanySchema>;
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>;
export type UpdateCompanyDetails = z.infer<typeof UpdateCompanyDetailsSchema>;
export type UpdateCompanyInfo = z.infer<typeof UpdateCompanyInfoSchema>;
export type AddUserToCompany = z.infer<typeof AddUserToCompanySchema>;
export type UpdateCompanyUser = z.infer<typeof UpdateCompanyUserSchema>;
export type RemoveUserFromCompany = z.infer<typeof RemoveUserFromCompanySchema>;
export type CompanyFilter = z.infer<typeof CompanyFilterSchema>;
export type ApproveCompany = z.infer<typeof ApproveCompanySchema>;
export type RejectCompany = z.infer<typeof RejectCompanySchema>;
export type SuspendCompany = z.infer<typeof SuspendCompanySchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type TokenAuthConfig = z.infer<typeof TokenAuthConfigSchema>;
export type SyncSchedule = z.infer<typeof SyncScheduleSchema>;
export type CompanyApiConfig = z.infer<typeof CompanyApiConfigSchema>;
export type UpdateApiConfig = z.infer<typeof UpdateApiConfigSchema>;
export type CompanyStatsQuery = z.infer<typeof CompanyStatsQuerySchema>;
export type ExecuteCommand = z.infer<typeof ExecuteCommandSchema>; 