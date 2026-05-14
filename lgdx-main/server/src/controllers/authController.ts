import { Response, Request } from 'express';
import {
    UnauthorizedError,
    NotFoundError,
    asyncHandler
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { userService } from '../services/userService';
import { cacheService, CacheKeys } from '../utils/cacheService';
import { generateCsrfToken } from '../middleware/csrf';
import { ValidatedRequest } from '../middleware/validation';
import {
    LoginRequest,
    RegisterRequest,
    CreateAdminRequest,
    ChangePasswordRequest,
    UpdateUserDetails,
    VerifyEmail,
    ResendVerification,
    RequestPasswordReset,
    ResetPassword,
    VerifyPhone,
    ResendPhoneVerification,
    RequestPhoneVerification,
    NotificationPrefs,
    AuthResponse as ZodAuthResponse
} from '../validation/schemas/authSchemas';
import User from '../models/User';
import { resolveJwtFromRequest } from '../middleware/auth';
import { UserDto, JwtPayload, AuthenticatedUser } from '../types';

// ---- Type-safe Request Interfaces ----

type CreateAdminValidatedRequest = ValidatedRequest<CreateAdminRequest, {}, {}>;
type RegisterValidatedRequest = ValidatedRequest<RegisterRequest, {}, {}>;
type LoginValidatedRequest = ValidatedRequest<LoginRequest, {}, {}>;
type ChangePasswordValidatedRequest = ValidatedRequest<ChangePasswordRequest, {}, {}>;
type VerifyEmailValidatedRequest = ValidatedRequest<VerifyEmail, {}, {}>;
type ResendVerificationValidatedRequest = ValidatedRequest<ResendVerification, {}, {}>;
type RequestPasswordResetValidatedRequest = ValidatedRequest<RequestPasswordReset, {}, {}>;
type ResetPasswordValidatedRequest = ValidatedRequest<ResetPassword, {}, {}>;
type VerifyPhoneValidatedRequest = ValidatedRequest<VerifyPhone, {}, {}>;
type ResendPhoneVerificationValidatedRequest = ValidatedRequest<ResendPhoneVerification, {}, {}>;
type RequestPhoneVerificationValidatedRequest = ValidatedRequest<RequestPhoneVerification, {}, {}>;
type UpdateMeValidatedRequest = ValidatedRequest<UpdateUserDetails, {}, {}>;

interface AuthenticatedRequest extends ValidatedRequest<any, { userId?: string }, {}> {
    user?: {
        userId: string;
        role: 'admin' | 'supervisor' | 'manager' | 'logist';
        companyId?: string;
        isLgdealSupervisor?: boolean;
        isLgdealAdmin?: boolean;
        isImpersonation?: boolean;
        originalUserId?: string;
        emailVerified?: boolean;
        id?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        isActive?: boolean;
        company?: { id: string; name: string; status?: string; description?: string };
        createdAt?: Date;
        phone?: string;
        phoneVerified?: boolean;
        lastLogin?: Date;
    };
}

interface ImpersonateRequest extends AuthenticatedRequest {
    params: {
        userId: string;
    }
}

// ---- Controllers using Zod Validation ----

export const createAdmin = asyncHandler(
    async (req: CreateAdminValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        // Request body is already validated by Zod middleware
        const { email, password, firstName, lastName, phone, adminKey } = req.body;

        const result = await userService.createAdmin({ email, password, firstName, lastName, phone, adminKey });

        // Set HttpOnly auth cookie and CSRF cookie
        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        const csrf = generateCsrfToken();
        res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        // Non-HttpOnly marker for UI banner
        res.cookie('impersonation', '1', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });

        res.status(201).json({
            // Keep token in response temporarily for backward compatibility; client should ignore it
            token: result.token,
            user: result.user
        });
    }
);

export const register = asyncHandler(
    async (req: RegisterValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        // Request body is already validated by Zod middleware
        const { email, password, firstName, lastName, phone, companyName } = req.body;

        const result = await userService.registerUser({
            email,
            password,
            firstName,
            lastName,
            phone,
            companyName,
            companyRole: req.body.companyRole
        });

        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        const csrf = generateCsrfToken();
        res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });

        res.status(201).json({
            token: result.token,
            user: result.user
        });
    }
);

export const login = asyncHandler(
    async (req: LoginValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        // Request body is already validated by Zod middleware (login = email or phone)
        const { login, password } = req.body;

        if (process.env.NODE_ENV !== 'production') {
            logger.debug('Login attempt (credentials redacted)');
        }

        const result = await userService.loginUser({ login, password });

        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        const csrf = generateCsrfToken();
        res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });

        res.status(200).json({
            token: result.token,
            user: result.user
        });
    }
);

export const changePassword = asyncHandler(
    async (req: ChangePasswordValidatedRequest & AuthenticatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        // Request body is already validated by Zod middleware
        const { newPassword } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedError('User not authenticated');
        }

        await userService.changePassword(userId, newPassword);
        
        res.status(200).json({ message: 'Password changed successfully' });
    }
);

export const getMe = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedError('Not authenticated');
        }

        const user = await userService.getUserById(userId);
        
        if (!user) {
            throw new NotFoundError('User not found');
        }
        
        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        // Keep impersonation marker cookie in sync on every /me call
        if (req.user?.isImpersonation) {
            res.cookie('impersonation', '1', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        } else {
            res.clearCookie('impersonation', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        }

        const userData = user && typeof user === 'object' && 'toObject' in user && typeof user.toObject === 'function'
            ? user.toObject()
            : user;
        // Do not send one-time link tokens to client
        if (userData && typeof userData === 'object') {
            delete (userData as Record<string, unknown>).telegramLinkToken;
            delete (userData as Record<string, unknown>).telegramLinkTokenExpires;
        }
        res.status(200).json({
            ...userData,
            isImpersonation: req.user?.isImpersonation === true
        });
    }
);

function getRegistrationBotUsername(): string | undefined {
    const filePath = process.env.REGISTRATION_TELEGRAM_BOT_USERNAME_FILE;
    if (filePath) {
        try {
            return require('fs').readFileSync(filePath, 'utf8').trim();
        } catch {
            // ignore
        }
    }
    return process.env.REGISTRATION_TELEGRAM_BOT_USERNAME;
}

export const requestTelegramLink = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError('Not authenticated');

        const botUsername = getRegistrationBotUsername();
        if (!botUsername) {
            res.status(503).json({ success: false, message: 'Telegram link is not configured (set REGISTRATION_TELEGRAM_BOT_USERNAME or REGISTRATION_TELEGRAM_BOT_USERNAME_FILE)' });
            return;
        }

        const token = await userService.requestTelegramLink(userId);
        const cleanUsername = botUsername.replace(/^@/, '');
        const startPayload = `link_${token}`;
        // We return both URLs and the raw command so the client can offer a
        // manual fallback when Telegram Desktop swallows the ?start= payload
        // (it does that for chats that the user has already opened in the past).
        res.status(200).json({
            success: true,
            linkUrl: `https://t.me/${cleanUsername}?start=${startPayload}`,
            tgUrl: `tg://resolve?domain=${cleanUsername}&start=${startPayload}`,
            botUsername: cleanUsername,
            startCommand: `/start ${startPayload}`
        });
    }
);

export const unlinkTelegram = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError('Not authenticated');

        await userService.unlinkTelegram(userId);
        res.status(200).json({ success: true });
    }
);

type NotificationPrefsValidatedRequest = ValidatedRequest<NotificationPrefs, {}, {}>;

export const updateNotificationPrefs = asyncHandler(
    async (req: NotificationPrefsValidatedRequest & AuthenticatedRequest, res: Response): Promise<void> => {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError('Not authenticated');

        const next = await userService.updateNotificationPrefs(userId, req.body);
        res.status(200).json({ success: true, notificationPrefs: next });
    }
);

export const updateMe = asyncHandler(
    async (req: UpdateMeValidatedRequest & AuthenticatedRequest, res: Response): Promise<void> => {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError('Not authenticated');

        const { firstName, lastName, email, phone, newPassword } = req.body;
        const user = await userService.updateUserProfile(userId, {
            firstName,
            lastName,
            email,
            phone,
            newPassword
        });
        res.status(200).json({ message: 'Profile updated successfully', user });
    }
);

export const impersonateUser = asyncHandler(
    async (req: ImpersonateRequest, res: Response): Promise<void> => {
        const impersonatorId = req.user?.userId;
        const targetUserId = req.params.userId;

        if (!impersonatorId) {
            throw new UnauthorizedError('Not authenticated');
        }

        if (!targetUserId) {
            throw new Error('Target user ID is required for impersonation.');
        }

        const result = await userService.impersonateUser(impersonatorId, targetUserId);

        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        const csrf = generateCsrfToken();
        res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });

        res.status(200).json({
            token: result.token,
            user: result.user,
            isImpersonation: true
        });
    }
);

export const logout = asyncHandler(
    async (req: AuthenticatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        // If this was an impersonation session, switch back to original admin account
        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        // Best-effort revocation of current token (by jti if available)
        try {
            const token = resolveJwtFromRequest(req as Request);
            if (token) {
                const decoded = require('jsonwebtoken').decode(token) as JwtPayload | null;
                const jti = decoded?.jti;
                const exp = decoded?.exp;
                if (jti && exp) {
                    const ttlSeconds = Math.max(1, exp - Math.floor(Date.now() / 1000));
                    await cacheService.set(CacheKeys.JWT_REVOKED(jti), '1', ttlSeconds);
                }
            }
        } catch {}
        if (req.user?.isImpersonation && req.user?.originalUserId) {
            const result = await userService.issueTokenForUserId(req.user.originalUserId);
            const csrf = generateCsrfToken();
            res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
            res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
            res.clearCookie('impersonation', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
            res.status(200).json({ success: true, message: 'Returned to admin account', user: result.user });
            return;
        }
        // Regular logout: clear cookies
        res.clearCookie('authToken', { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.clearCookie('csrfToken', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.clearCookie('impersonation', { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        if (process.env.NODE_ENV !== 'production') {
            logger.info(`User logged out: ${req.user?.userId}`);
        }
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    }
);

// Issue a fresh JWT for current session (short-lived rotation)
export const refreshToken = asyncHandler(
    async (req: AuthenticatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new UnauthorizedError('Not authenticated');
        }
        const result = await userService.issueTokenForUserId(userId);
        const useSecureCookies = process.env.COOKIE_SECURE === 'true';
        const csrf = generateCsrfToken();
        res.cookie('authToken', result.token, { httpOnly: true, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.cookie('csrfToken', csrf, { httpOnly: false, secure: useSecureCookies, sameSite: 'lax', path: '/' });
        res.status(200).json({ token: result.token, user: result.user });
    }
);

// ---- Email Verification Controllers ----

export const verifyEmail = asyncHandler(
    async (req: VerifyEmailValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { token } = req.body;

        const user = await userService.verifyEmail(token);
        
        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            user: user
        });
    }
);

export const resendVerificationEmail = asyncHandler(
    async (req: ResendVerificationValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { email } = req.body;

        await userService.resendVerificationEmail(email);
        
        res.status(200).json({
            success: true,
            message: 'Verification email sent successfully'
        });
    }
);

// ---- Phone Verification Controllers ----

export const verifyPhone = asyncHandler(
    async (req: VerifyPhoneValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { phone, code } = req.body;

        const user = await userService.verifyPhone(phone, code);
        
        res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
            user: user
        });
    }
);

export const resendPhoneVerification = asyncHandler(
    async (req: ResendPhoneVerificationValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { phone } = req.body;

        const result = await userService.resendPhoneVerificationCode(phone);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    }
);

export const requestPhoneVerification = asyncHandler(
    async (req: RequestPhoneVerificationValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { phone } = req.body;

        const result = await userService.sendPhoneVerificationCode(phone);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    }
);

// DEVELOPMENT ONLY: Test endpoint to get verification token for testing
export const getVerificationToken = asyncHandler(
    async (req: ValidatedRequest<{ email: string }, {}, {}>, res: Response): Promise<void> => {
        // Only allow in development
        if (process.env.NODE_ENV === 'production') {
            res.status(404).json({ message: 'Endpoint not found' });
            return;
        }

        const { email } = req.query as { email: string };

        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.emailVerified) {
            res.status(400).json({ message: 'Email already verified' });
            return;
        }

        res.status(200).json({
            email: user.email,
            token: user.emailVerificationToken,
            expires: user.emailVerificationExpires,
            verificationUrl: `${process.env.FRONTEND_BASE_URL || 'http://localhost:3000'}/verify-email?token=${user.emailVerificationToken}`
        });
    }
);

// ---- Password Reset Controllers ----

export const requestPasswordReset = asyncHandler(
    async (req: RequestPasswordResetValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { emailOrPhone, delivery } = req.body;

        await userService.requestPasswordReset(emailOrPhone, delivery);
        
        res.status(200).json({
            success: true,
            message: 'If an account exists, we\'ve sent the reset link to your chosen delivery method.'
        });
    }
);

export const resetPassword = asyncHandler(
    async (req: ResetPasswordValidatedRequest, res: Response<ZodAuthResponse>): Promise<void> => {
        const { token, newPassword } = req.body;

        await userService.resetPassword(token, newPassword);
        
        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    }
);

// NOTE: This refactored controller with Zod demonstrates:
// 1. ✅ Full integration with Zod validation schemas
// 2. ✅ Type-safe ValidatedRequest types for each endpoint
// 3. ✅ Removal of ALL manual validation (30+ lines of code)
// 4. ✅ Runtime + compile-time type safety
// 5. ✅ Consistent response types through Zod schemas
// 6. ✅ Automatic clear validation error messages 