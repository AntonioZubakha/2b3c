import { z } from 'zod';
import { 
    EmailSchema, 
    PasswordSchema, 
    NonEmptyStringSchema, 
    UserRoleSchema,
    PhoneSchema
} from '../baseSchemas';

// ---- Authentication Request Schemas ----

/** Login with email or phone + password */
export const LoginRequestSchema = z.object({
    login: z.string()
        .min(1, 'Email or phone is required')
        .max(255, 'Email or phone is too long')
        .transform((val) => val.trim()),
    password: PasswordSchema
});

export const RegisterRequestSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
    firstName: NonEmptyStringSchema,
    lastName: NonEmptyStringSchema,
    phone: PhoneSchema,
    companyName: NonEmptyStringSchema.optional(),
    companyRole: z.enum(['seller', 'buyer']).optional()
});

export const CreateAdminRequestSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
    firstName: NonEmptyStringSchema,
    lastName: NonEmptyStringSchema,
    phone: PhoneSchema,
    adminKey: NonEmptyStringSchema
});

export const ChangePasswordRequestSchema = z.object({
    newPassword: PasswordSchema,
    oldPassword: PasswordSchema.optional() // Optional for admin changes
});

export const UpdateUserDetailsSchema = z.object({
    firstName: NonEmptyStringSchema,
    lastName: NonEmptyStringSchema,
    email: EmailSchema,
    phone: PhoneSchema.optional(), // Добавляем поле телефона
    newPassword: PasswordSchema.optional() // Optional password change
});

// ---- Authentication Response Schemas ----

export const UserInfoSchema = z.object({
    id: z.string(),
    email: EmailSchema,
    firstName: z.string(),
    lastName: z.string(),
    role: UserRoleSchema,
    isActive: z.boolean(),
    isLgdealSupervisor: z.boolean().optional(),
    isLgdealIncStaff: z.boolean().optional(),
    company: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        status: z.string().optional()
    }).optional(),
    createdAt: z.date().optional(),
    lastLogin: z.date().optional()
});

export const AuthResponseSchema = z.object({
    token: z.string().optional(),
    user: UserInfoSchema.optional(),
    message: z.string().optional(),
    success: z.boolean().optional()
});

// ---- JWT Payload Schema ----

export const JwtPayloadSchema = z.object({
    userId: z.string(),
    email: EmailSchema.optional(),
    role: UserRoleSchema.optional(),
    companyId: z.string().optional(),
    isLgdealSupervisor: z.boolean().optional(),
    isImpersonation: z.boolean().optional(),
    originalUserId: z.string().optional(),
    iat: z.number().optional(),
    exp: z.number().optional()
});

// ---- Impersonation Schema ----

export const ImpersonateRequestSchema = z.object({
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
});

// ---- Phone Verification Schemas ----

export const VerifyPhoneSchema = z.object({
    phone: PhoneSchema,
    code: z.string()
        .length(4, 'Verification code must be 4 digits')
        .regex(/^\d{4}$/, 'Verification code must contain only digits')
});

export const ResendPhoneVerificationSchema = z.object({
    phone: PhoneSchema
});

export const RequestPhoneVerificationSchema = z.object({
    phone: PhoneSchema
});

// ---- Email Verification Schemas ----

export const VerifyEmailSchema = z.object({
    token: z.string().min(1, 'Verification token is required')
});

export const ResendVerificationSchema = z.object({
    email: EmailSchema
});

// ---- Password Reset Schemas ----

/** Email or phone (same as login identifier) */
export const EmailOrPhoneSchema = z.string()
    .min(1, 'Email or phone is required')
    .max(255, 'Email or phone is too long')
    .transform((val) => val.trim());

export const RequestPasswordResetSchema = z.object({
    emailOrPhone: EmailOrPhoneSchema,
    delivery: z.enum(['email', 'sms'], { required_error: 'Delivery method is required', invalid_type_error: 'Delivery must be email or sms' })
});

export const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: PasswordSchema
});

// ---- Notification Preferences ----

/**
 * Per-channel toggles for transactional deal notifications.
 * All fields are optional so the client can update a single channel.
 */
export const NotificationPrefsSchema = z.object({
    email: z.boolean().optional(),
    telegram: z.boolean().optional(),
    whatsapp: z.boolean().optional()
}).strict();

// ---- Type Exports ----

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type CreateAdminRequest = z.infer<typeof CreateAdminRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type UserInfo = z.infer<typeof UserInfoSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
export type ImpersonateRequest = z.infer<typeof ImpersonateRequestSchema>; 
export type VerifyEmail = z.infer<typeof VerifyEmailSchema>;
export type ResendVerification = z.infer<typeof ResendVerificationSchema>;
export type RequestPasswordReset = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

// Phone verification types
export type VerifyPhone = z.infer<typeof VerifyPhoneSchema>;
export type ResendPhoneVerification = z.infer<typeof ResendPhoneVerificationSchema>;
export type RequestPhoneVerification = z.infer<typeof RequestPhoneVerificationSchema>;
export type UpdateUserDetails = z.infer<typeof UpdateUserDetailsSchema>;
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;
