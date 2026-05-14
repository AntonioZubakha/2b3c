import express, { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { logger } from '../utils/logger';
import { asRateLimiter } from '../types/express-helpers';
import { prepareRegistrationPolicy, checkRegistrationCountryBlock, logRegistrationAttempt, logLoginAttempt } from '../middleware/registrationGuard';
import SystemSettingsService from '../services/systemSettingsService';
import { 
    LoginRequestSchema, 
    RegisterRequestSchema, 
    CreateAdminRequestSchema,
    ChangePasswordRequestSchema,
    UpdateUserDetailsSchema,
    VerifyEmailSchema,
    ResendVerificationSchema,
    RequestPasswordResetSchema,
    ResetPasswordSchema,
    VerifyPhoneSchema,
    ResendPhoneVerificationSchema,
    RequestPhoneVerificationSchema,
    NotificationPrefsSchema
} from '../validation/schemas/authSchemas';

const router: Router = express.Router();

// --- Security: brute-force protection ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25, // попытки входа на IP (не считаем успешные 2xx — см. skipSuccessfulRequests)
    standardHeaders: true,
    legacyHeaders: false,
    // Не наказываем пользователя за успешный вход; брутфорс ограничиваем по неуспешным ответам
    skipSuccessfulRequests: true,
});

const smsResendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5, // не более 5 попыток/час на IP
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting для регистрации - ПРИОРИТЕТ 1!
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час (увеличено с 15 минут для более мягкого лимита)
    max: 5, // максимум 5 регистраций с одного IP за час (увеличено с 3)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many registration attempts. Please try again later.',
    skipSuccessfulRequests: true, // не учитывать успешные регистрации (более удобно для пользователей)
    handler: (req, res) => {
        logger.warn('[RateLimit] Registration spam attempt blocked', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Too many registration attempts',
            message: 'Too many registration attempts. Please try again later.',
            retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
        });
    }
});

// Rate limiting для email верификации - ПРИОРИТЕТ 2!
const emailVerificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5, // максимум 5 попыток верификации email в час
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many email verification attempts. Please try again later.',
    handler: (req, res) => {
        logger.warn('[RateLimit] Email verification spam attempt blocked', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Too many email verification attempts',
            message: 'Too many email verification attempts. Please try again later.',
            retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
        });
    }
});

// Rate limiting для resend email - ПРИОРИТЕТ 3!
const emailResendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // максимум 3 повторных отправки email в час
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many email resend attempts. Please try again later.',
    handler: (req, res) => {
        logger.warn('[RateLimit] Email resend spam attempt blocked', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Too many email resend attempts',
            message: 'Too many email resend attempts. Please try again later.',
            retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
        });
    }
});

// Rate limiting для password reset - дополнительная защита!
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // максимум 3 запроса сброса пароля в час
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many password reset attempts. Please try again later.',
    handler: (req, res) => {
        logger.warn('[RateLimit] Password reset spam attempt blocked', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Too many password reset attempts',
            message: 'Too many password reset attempts. Please try again later.',
            retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
        });
    }
});

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', 
    registrationLimiter, // 🛡️ ЗАЩИТА ОТ СПАМА РЕГИСТРАЦИЙ!
    logRegistrationAttempt, // 📝 Логирование попыток регистрации
    prepareRegistrationPolicy, // 🚫 Регистрации включены + IP blacklist
    validate({ body: RegisterRequestSchema }),
    checkRegistrationCountryBlock, // 🌍 Country blacklist (по номеру телефона)
    authController.register
);

// @route   POST api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', 
    asRateLimiter(loginLimiter),
    logLoginAttempt, // 📝 Логирование попыток логина
    validate({ body: LoginRequestSchema }), 
    authController.login
);

// @route   POST api/auth/create-admin
// @desc    Create admin user (protected by secret key)
// @access  Public (but protected by secret key)
router.post('/create-admin', 
    asRateLimiter(rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false })),
    validate({ body: CreateAdminRequestSchema }), 
    authController.createAdmin
);

// @route   GET api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authMiddleware, authController.getMe);

// @route   POST api/auth/me/telegram-link-request
// @desc    Get one-time link to link Telegram account (for password reset etc.)
// @access  Private
router.post('/me/telegram-link-request', authMiddleware, authController.requestTelegramLink);

// @route   POST api/auth/me/telegram-unlink
// @desc    Remove the linked Telegram chat for the current user
// @access  Private
router.post('/me/telegram-unlink', authMiddleware, authController.unlinkTelegram);

// @route   PUT api/auth/me/notification-prefs
// @desc    Update per-channel notification preferences for the current user
// @access  Private
router.put(
    '/me/notification-prefs',
    authMiddleware,
    validate({ body: NotificationPrefsSchema }),
    authController.updateNotificationPrefs
);

// @route   PUT api/auth/me
// @desc    Update current user profile (firstName, lastName, email, phone, optional newPassword)
// @access  Private
router.put('/me', authMiddleware, validate({ body: UpdateUserDetailsSchema }), authController.updateMe);

// @route   POST api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', 
    authMiddleware, 
    validate({ body: ChangePasswordRequestSchema }), 
    authController.changePassword
);

// @route   POST api/auth/logout
// @desc    Logout user and clear cart
// @access  Private
router.post('/logout', authMiddleware, authController.logout);

// @route   POST api/auth/refresh
// @desc    Refresh session token (short-lived rotation)
// @access  Private
router.post('/refresh', authMiddleware, authController.refreshToken);

// ---- Email Verification Routes ----

// @route   POST api/auth/verify-email
// @desc    Verify email with token
// @access  Public
router.post('/verify-email', 
    emailVerificationLimiter, // 🛡️ ЗАЩИТА ОТ СПАМА EMAIL ВЕРИФИКАЦИИ!
    validate({ body: VerifyEmailSchema }), 
    authController.verifyEmail
);

// @route   POST api/auth/resend-verification
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification', 
    emailResendLimiter, // 🛡️ ЗАЩИТА ОТ СПАМА RESEND EMAIL!
    validate({ body: ResendVerificationSchema }), 
    authController.resendVerificationEmail
);

// TEMPORARY: Test endpoint to get verification token
// @route   GET api/auth/test-verification-token
// @desc    Get verification token for testing (remove in production)
// @access  Public
router.get('/test-verification-token', authController.getVerificationToken);

// @route   GET api/auth/registrations-enabled
// @desc    Check if user registrations are enabled (public endpoint)
// @access  Public
router.get('/registrations-enabled', async (req: Request, res: Response) => {
  try {
    const registrationsEnabled = await SystemSettingsService.areRegistrationsEnabled();
    res.json({ registrationsEnabled });
  } catch (error) {
    logger.error('[Auth] Error checking registration status:', error);
    // Default to enabled if there's an error
    res.json({ registrationsEnabled: true });
  }
});

// ---- Password Reset Routes ----

// @route   POST api/auth/request-password-reset
// @desc    Request password reset
// @access  Public
router.post('/request-password-reset', 
    passwordResetLimiter, // 🛡️ ЗАЩИТА ОТ СПАМА PASSWORD RESET!
    validate({ body: RequestPasswordResetSchema }), 
    authController.requestPasswordReset
);

// @route   POST api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', 
    validate({ body: ResetPasswordSchema }), 
    authController.resetPassword
);

// ---- Phone Verification Routes ----

// @route   POST api/auth/verify-phone
// @desc    Verify phone with SMS code
// @access  Public
router.post('/verify-phone', 
    validate({ body: VerifyPhoneSchema }), 
    authController.verifyPhone
);

// @route   POST api/auth/resend-phone-verification
// @desc    Resend phone verification SMS
// @access  Public
router.post('/resend-phone-verification', 
    asRateLimiter(smsResendLimiter),
    validate({ body: ResendPhoneVerificationSchema }), 
    authController.resendPhoneVerification
);

// @route   POST api/auth/request-phone-verification
// @desc    Request phone verification SMS
// @access  Public
router.post('/request-phone-verification', 
    asRateLimiter(smsResendLimiter),
    validate({ body: RequestPhoneVerificationSchema }), 
    authController.requestPhoneVerification
);

export default router; 