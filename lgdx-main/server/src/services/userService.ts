import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User, { IUserDocument } from '../models/User';
import Company, { ICompanyDocument } from '../models/Company';
import marketplaceConfig from '../config/marketplace';
import { Types } from 'mongoose';
import { emailService } from './emailService';
import { smsService } from './smsService';
import { sendRegistrationNotification, RegistrationNotificationData } from '../utils/telegramBot';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { validatePhoneToE164 } from '../utils/phoneValidation';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../middleware/errorHandler';

// DTOs
export interface CreateUserDto {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    companyName?: string;
    companyRole?: 'seller' | 'buyer';
}

export interface LoginDto {
    /** Email or phone number (international format, e.g. +1234567890) */
    login: string;
    password: string;
}

export interface UserDto {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: 'admin' | 'supervisor' | 'manager' | 'logist';
    isActive: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    company?: {
        id: string;
        name: string;
        description?: string;
        status?: string;
    };
    isLgdealSupervisor?: boolean;
    /** Компания LGDeal INC — любая роль */
    isLgdealIncStaff?: boolean;
    createdAt?: Date;
    lastLogin?: Date;
    telegramId?: string;
    notificationPrefs?: {
        email?: boolean;
        telegram?: boolean;
        whatsapp?: boolean;
    };
}

export interface AuthResultDto {
    token: string;
    user: UserDto;
}

export interface JwtPayload {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
    isImpersonation?: boolean;
    originalUserId?: string;
    jti?: string;
}

// Валидация паролей
export interface PasswordValidationResult {
    isValid: boolean;
    errors: string[];
}

export class UserService {
    private readonly getSecretFromFile = (envVar: string, defaultValue: string = ''): string => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return require('fs').readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error(`Failed to read ${envVar}_FILE:`, { error: e });
    }
  }
  return process.env[envVar] || defaultValue;
};

private readonly JWT_SECRET = this.getSecretFromFile('JWT_SECRET');
private readonly ADMIN_SECRET_KEY = this.getSecretFromFile('ADMIN_SECRET_KEY');

    constructor() {
        const isProd = process.env.NODE_ENV === 'production';

        if (isProd) {
            // In production, secrets must be present; never fall back.
            if (!this.JWT_SECRET || this.JWT_SECRET.trim().length < 16) {
                throw new Error('Missing/weak JWT_SECRET. Set JWT_SECRET (or JWT_SECRET_FILE) to a strong value.');
            }
            // If create-admin is enabled, ADMIN_SECRET_KEY must be strong.
            const createAdminEnabled = process.env.AUTH_CREATE_ADMIN_ENABLED === 'true';
            if (createAdminEnabled) {
                if (!this.ADMIN_SECRET_KEY || this.ADMIN_SECRET_KEY.trim().length < 16) {
                    throw new Error('Missing/weak ADMIN_SECRET_KEY while AUTH_CREATE_ADMIN_ENABLED=true.');
                }
            }
        } else {
            if (!this.JWT_SECRET) {
                logger.warn('[Security] JWT_SECRET is not set. Dev-only behavior; do not run production like this.');
            }
            if (!this.ADMIN_SECRET_KEY) {
                logger.warn('[Security] ADMIN_SECRET_KEY is not set. /api/auth/create-admin will be disabled.');
            }
        }
    }

    /**
     * Валидирует пароль
     */
    validatePassword(password: string): PasswordValidationResult {
        const errors: string[] = [];
        
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }
        
        if (!/(?=.*[a-z])/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        
        if (!/(?=.*[A-Z])/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        
        if (!/(?=.*\d)/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Проверяет, существует ли email
     */
    async emailExists(email: string): Promise<boolean> {
        const user = await User.findOne({ email }).lean();
        return !!user;
    }

    /**
     * Создает админа
     */
    async createAdmin(userData: CreateUserDto & { adminKey: string }): Promise<AuthResultDto> {
        const { email, password, firstName, lastName, adminKey } = userData;

        const isProd = process.env.NODE_ENV === 'production';
        const createAdminEnabled = process.env.AUTH_CREATE_ADMIN_ENABLED === 'true';
        // Create-admin should be explicitly enabled (especially in prod).
        if (isProd && !createAdminEnabled) {
            throw new Error('Create-admin is disabled');
        }
        if (!this.ADMIN_SECRET_KEY || this.ADMIN_SECRET_KEY.trim().length < 16) {
            throw new Error('Create-admin is not configured');
        }

        // Constant-time compare to avoid timing leaks
        const a = Buffer.from(String(adminKey ?? ''), 'utf8');
        const b = Buffer.from(String(this.ADMIN_SECRET_KEY), 'utf8');
        const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!ok) throw new Error('Invalid admin key');

        // Проверка существования пользователя
        if (await this.emailExists(email)) {
            throw new Error('User already exists');
        }

        // Валидация пароля
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.isValid) {
            throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        // Создание пользователя
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            phone: userData.phone,
            role: 'admin',
            isActive: true
        });

        const savedUser = await user.save();
        const token = this.generateToken({
            userId: savedUser._id.toString(),
            role: 'admin'
        });

        return {
            token,
            user: this.mapUserToDto(savedUser)
        };
    }



    /**
     * Нормализация телефона для логина (E.164), с запасным вариантом для старых записей.
     */
    private normalizePhoneForLookup(val: string): string {
        const r = validatePhoneToE164(val.trim());
        if (r.ok) return r.e164;
        const trimmed = val.trim();
        if (!trimmed.startsWith('+') && /^[1-9]/.test(trimmed)) {
            return '+' + trimmed.replace(/\D/g, '');
        }
        return trimmed;
    }

    /**
     * Авторизует пользователя по email или по телефону + пароль
     */
    async loginUser(credentials: LoginDto): Promise<AuthResultDto> {
        const { login, password } = credentials;

        if (process.env.NODE_ENV !== 'production') {
            logger.debug('UserService login attempt (credentials redacted)');
        }

        const isEmail = login.includes('@');
        const filter = isEmail
            ? { email: login.toLowerCase() }
            : { phone: this.normalizePhoneForLookup(login) };

        const user = await User.findOne(filter)
            .select('+password +legacyPasswordSalt')
            .populate('company');

        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`User found: ${user ? 'YES' : 'NO'}`);
        }

        if (!user || !user.password) {
            logger.info('User not found or no password');
            throw new UnauthorizedError('Invalid credentials');
        }

        // Проверка пароля: мигрированные пользователи — bcrypt(plainPassword + '_' + salt), остальные — bcrypt(plainPassword)
        let isPasswordValid: boolean;
        if (user.legacyPasswordSalt) {
            const toHash = `${password}_${user.legacyPasswordSalt}`;
            isPasswordValid = await bcrypt.compare(toHash, user.password);
        } else {
            isPasswordValid = await bcrypt.compare(password, user.password);
        }
        
        if (!isPasswordValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        // При первом успешном логине мигрированного пользователя переводим пароль в новый формат (без соли)
        if (user.legacyPasswordSalt) {
            user.password = await bcrypt.hash(password, 12);
            user.legacyPasswordSalt = undefined;
        }

        // Проверка активности
        if (!user.isActive) {
            throw new ForbiddenError('User account is not active. Please contact support.');
        }

        // Обновление времени входа
        user.lastLogin = new Date();
        await user.save();

        // Генерация токена (company может быть ObjectId если ref битый — не бросать в mapUserToDto как документ)
        const company = this.asPopulatedCompany(user.company);
        if (!company && user.company != null) {
            logger.warn('[UserService] Login: user.company is set but not a populated Company doc (missing/broken ref?)', {
                userId: user._id.toString(),
                email: user.email
            });
        }
        const isLgdealSupervisor = this.isLgdealSupervisor(user, company);

        const token = this.generateToken({
            userId: user._id.toString(),
            role: user.role,
            companyId: company?._id?.toString(),
            isLgdealSupervisor
        });

        return {
            token,
            user: this.mapUserToDto(user, company)
        };
    }

    /**
     * Gets user data by ID
     */
    async getUserById(userId: string): Promise<UserDto | null> {
        const user = await User.findById(userId)
            .populate('company')
            .lean();

        if (!user) return null;

        return this.mapUserToDto(user as IUserDocument, user.company as ICompanyDocument);
    }

    /**
     * Updates current user's profile (firstName, lastName, email, phone, optional newPassword).
     */
    async updateUserProfile(
        userId: string,
        data: { firstName: string; lastName: string; email: string; phone?: string; newPassword?: string }
    ): Promise<UserDto> {
        const user = await User.findById(userId).select('+legacyPasswordSalt');
        if (!user) throw new Error('User not found');

        if (data.email !== user.email) {
            const existing = await User.findOne({ email: data.email, _id: { $ne: userId } });
            if (existing) throw new Error('Email is already taken by another user');
        }
        if (data.phone && data.phone !== user.phone) {
            const existing = await User.findOne({ phone: data.phone, _id: { $ne: userId } });
            if (existing) throw new Error('Phone is already taken by another user');
        }

        user.firstName = data.firstName;
        user.lastName = data.lastName;
        user.email = data.email.toLowerCase();
        if (data.phone !== undefined) user.phone = data.phone;

        if (data.newPassword) {
            const passwordValidation = this.validatePassword(data.newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
            }
            user.password = await bcrypt.hash(data.newPassword, 12);
            user.legacyPasswordSalt = undefined;
        }

        await user.save();
        const company = user.company ? await Company.findById(user.company) : undefined;
        return this.mapUserToDto(user as IUserDocument, company as ICompanyDocument | undefined);
    }

    /**
     * Changes user password
     */
    async changePassword(userId: string, newPassword: string): Promise<void> {
        const passwordValidation = this.validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await User.findByIdAndUpdate(userId, {
            $set: { password: hashedPassword },
            $unset: { legacyPasswordSalt: 1 }
        });
    }

    /**
     * Activates user
     */
    async activateUser(userIdToActivate: string, performedByUserId: string): Promise<UserDto> {
        const performedByUser = await User.findById(performedByUserId);
        if (!performedByUser || performedByUser.role !== 'supervisor') {
            throw new Error('Only supervisors can activate users');
        }

        const userToActivate = await User.findById(userIdToActivate);
        if (!userToActivate) {
            throw new Error('User to activate not found');
        }

        // Check that users are from the same company
        const performedByCompanyId = performedByUser.company?.toString();
        const userToActivateCompanyId = userToActivate.company?.toString();

        if (!performedByCompanyId || performedByCompanyId !== userToActivateCompanyId) {
            throw new Error('You can only activate users from your own company');
        }

        // Activate user
        userToActivate.isActive = true;
        await userToActivate.save();

        // Update in company
        const company = await Company.findById(performedByCompanyId);
        if (company && company.users) {
            const userInCompany = company.users.find(u => u.user?.toString() === userIdToActivate);
            if (userInCompany) {
                userInCompany.isActive = true;
                await company.save();
            }
        }

        return this.mapUserToDto(userToActivate);
    }

    /**
     * Changes user role
     */
    async changeUserRole(
        userIdToUpdate: string,
        newRole: 'admin' | 'supervisor' | 'manager' | 'logist',
        performedByUserId: string
    ): Promise<UserDto> {
        if (!['admin', 'supervisor', 'manager', 'logist'].includes(newRole)) {
            throw new Error('Invalid role. Must be admin, supervisor, manager, or logist');
        }

        const performedByUser = await User.findById(performedByUserId);
        if (!performedByUser || performedByUser.role !== 'supervisor') {
            throw new Error('Only supervisors can change user roles');
        }

        const userToUpdate = await User.findById(userIdToUpdate);
        if (!userToUpdate) {
            throw new Error('User to update not found');
        }

        // Company check
        const performedByCompanyId = performedByUser.company?.toString();
        const userToUpdateCompanyId = userToUpdate.company?.toString();

        if (!performedByCompanyId || performedByCompanyId !== userToUpdateCompanyId) {
            throw new Error('You can only update users from your own company');
        }

        // Check if role 'logist' is only for LGDeal INC company
        if (newRole === 'logist') {
            const currentUserCompany = await Company.findById(performedByCompanyId);
            if (!currentUserCompany || currentUserCompany.name !== marketplaceConfig.managementCompany.name) {
                throw new Error('Role "logist" is only available for LGDeal INC company');
            }
        }

        // Check that at least one supervisor remains
        if (userToUpdate.role === 'supervisor' && newRole === 'manager') {
            const company = await Company.findById(performedByCompanyId).lean();
            if (company && company.users) {
                const supervisorsCount = company.users.filter((u: any) => 
                    u.role === 'supervisor' && 
                    u.isActive === true && 
                    u.user?.toString() !== userIdToUpdate
                ).length;
                
                if (supervisorsCount === 0) {
                    throw new Error('Cannot change role. Company must have at least one supervisor.');
                }
            }
        }

        // Update role
        userToUpdate.role = newRole;
        await userToUpdate.save();

        // Update in company
        const company = await Company.findById(performedByCompanyId);
        if (company && company.users) {
            const userInCompany = company.users.find((u: any) => u.user?.toString() === userIdToUpdate);
            if (userInCompany) {
                userInCompany.role = newRole;
                await company.save();
            }
        }

        return this.mapUserToDto(userToUpdate);
    }

    /**
     * Creates authorization token
     */
    private generateToken(payload: JwtPayload): string {
        const jti = crypto.randomBytes(16).toString('hex');
        const tokenPayload: JwtPayload = { ...payload, jti };
        return jwt.sign(tokenPayload, this.JWT_SECRET, { expiresIn: '1d' });
    }

    /**
     * Checks if user is LGDEAL supervisor (derived from company + role, no stored flag).
     */
    private isLgdealSupervisor(user: IUserDocument, company?: ICompanyDocument): boolean {
        if (!company || company.name !== marketplaceConfig.managementCompany.name) return false;
        return user.role === 'supervisor' || user.role === 'admin';
    }

    /**
     * После populate('company') в поле может быть полноценный документ, null или сырой ObjectId.
     * Сырой ObjectId нельзя передавать в mapUserToDto как компанию: у него нет .name / вложенного ._id.
     */
    private asPopulatedCompany(raw: unknown): ICompanyDocument | undefined {
        if (raw == null || typeof raw !== 'object') return undefined;
        if (raw instanceof Types.ObjectId) return undefined;
        const r = raw as { _id?: unknown; name?: unknown };
        if (r._id == null || typeof r.name !== 'string') return undefined;
        return raw as ICompanyDocument;
    }

    /** Любой пользователь компании LGDeal INC (внутренний персонал). */
    private isLgdealIncStaff(user: IUserDocument, company?: ICompanyDocument | undefined): boolean {
        const c = company ?? this.asPopulatedCompany(user.company);
        return c?.name === marketplaceConfig.managementCompany.name;
    }

    /**
     * Maps user to DTO
     */
    private mapUserToDto(user: IUserDocument, company?: ICompanyDocument | unknown): UserDto {
        const c =
            company !== undefined
                ? this.asPopulatedCompany(company)
                : this.asPopulatedCompany(user.company);
        return {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
            emailVerified: user.emailVerified,
            phoneVerified: user.phoneVerified,
            company: c
                ? {
                      id: c._id.toString(),
                      name: c.name,
                      description: c.description,
                      status: c.status
                  }
                : undefined,
            isLgdealSupervisor: this.isLgdealSupervisor(user, c),
            isLgdealIncStaff: this.isLgdealIncStaff(user, c),
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            telegramId: user.telegramId,
            notificationPrefs: {
                email: user.notificationPrefs?.email ?? true,
                telegram: user.notificationPrefs?.telegram ?? true,
                whatsapp: user.notificationPrefs?.whatsapp ?? false
            }
        };
    }

    /**
     * Creates an impersonation session for an admin/supervisor.
     * @param impersonatorId The ID of the admin/supervisor initiating the impersonation.
     * @param targetUserId The ID of the user to be impersonated.
     * @returns An AuthResultDto containing the impersonation token and target user's data.
     */
    async impersonateUser(impersonatorId: string, targetUserId: string): Promise<AuthResultDto> {
        // Find the impersonator to ensure they are an admin/supervisor
        const impersonator = await User.findById(impersonatorId).populate('company');
        if (!impersonator) {
            throw new NotFoundError('Impersonator user not found.');
        }

        const impersonatorCompany = this.asPopulatedCompany(impersonator.company);
        const impersonatorIsSupervisor = this.isLgdealSupervisor(impersonator, impersonatorCompany);
        if (impersonator.role !== 'admin' && !impersonatorIsSupervisor) {
            throw new ForbiddenError('Only admins or LGDEAL supervisors can impersonate users.');
        }

        // Find the target user
        const targetUser = await User.findById(targetUserId).populate('company');
        if (!targetUser) {
            throw new NotFoundError('Target user for impersonation not found.');
        }

        // Prevent impersonating another admin
        if (targetUser.role === 'admin') {
            throw new ForbiddenError('Cannot impersonate another admin.');
        }
        // Prevent impersonating an LGDEAL supervisor from another context (allow same-company supervisor)
        const targetCompany = this.asPopulatedCompany(targetUser.company);
        const targetIsSupervisor = this.isLgdealSupervisor(targetUser, targetCompany);
        const impersonatorCompanyId = impersonatorCompany?._id?.toString();
        const targetCompanyId = targetCompany?._id?.toString();
        const sameCompany = impersonatorCompanyId && targetCompanyId && impersonatorCompanyId === targetCompanyId;
        if (targetIsSupervisor && !sameCompany) {
            throw new ForbiddenError('Cannot impersonate another admin or supervisor.');
        }
        
        // Generate a special token for impersonation
        const token = this.generateToken({
            userId: targetUser._id.toString(),
            role: targetUser.role,
            companyId: targetCompany?._id?.toString(),
            isLgdealSupervisor: false, // The impersonated user is never a supervisor in this context
            isImpersonation: true,
            originalUserId: impersonator._id.toString()
        });
        
        return {
            token,
            user: this.mapUserToDto(targetUser, targetCompany)
        };
    }

    /**
     * Generates cryptographically secure token
     */
    private generateSecureToken(): string {
        return crypto.randomBytes(32).toString('hex');
}

    /**
     * Issues a fresh auth token for the given user id and returns user DTO
     */
    async issueTokenForUserId(userId: string): Promise<AuthResultDto> {
        const user = await User.findById(userId).populate('company');
        if (!user) {
            throw new Error('User not found');
        }
        const company = this.asPopulatedCompany(user.company);
        const isLgdealSupervisor = this.isLgdealSupervisor(user, company);
        const token = this.generateToken({
            userId: user._id.toString(),
            role: user.role,
            companyId: company?._id?.toString(),
            isLgdealSupervisor
        });
        return {
            token,
            user: this.mapUserToDto(user, company)
        };
    }

    /**
     * Verifies user email
     */
    async verifyEmail(token: string): Promise<UserDto> {
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() }
        });

        if (!user) {
            throw new Error('Invalid or expired verification token');
        }

        // Verify email and clear token
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        
        // Activate user if not already active
        if (!user.isActive) {
            user.isActive = true;
        }

        await user.save();

        // Update status in company
        if (user.company) {
            const company = await Company.findById(user.company);
            if (company && company.users) {
                const userInCompany = company.users.find(u => u.user?.toString() === user._id.toString());
                if (userInCompany) {
                    userInCompany.isActive = true;
                    await company.save();
                }
            }
        }

        return this.mapUserToDto(user);
    }

    /**
     * Verifies user phone number with improved validation
     */
    async verifyPhone(phone: string, code: string): Promise<UserDto> {
        try {
            // Validate input
            if (!phone || !code) {
                throw new Error('Phone number and verification code are required');
            }

            if (code.length !== 4 || !/^\d{4}$/.test(code)) {
                throw new Error('Invalid verification code format. Please enter a 4-digit code');
            }

            // Normalize phone to E.164 for consistent lookup
            const normalizedPhone = this.normalizePhoneForLookup(phone);

            // Check verification code via Twilio Verify
            const verificationResult = await smsService.checkVerificationCode(normalizedPhone, code);
            if (!verificationResult.success) {
                throw new Error(verificationResult.message);
            }

            // Find user with this phone number
            const user = await User.findOne({ phone: normalizedPhone });
            if (!user) {
                throw new Error('User with this phone number not found');
            }

            // Verify phone and clear verification data
            user.phoneVerified = true;
            user.phoneVerificationCode = undefined;
            user.phoneVerificationExpires = undefined;
            user.phoneVerificationToken = undefined;
            
            // Activate user if not already active
            if (!user.isActive) {
                user.isActive = true;
            }

            await user.save();

            // Update status in company
            if (user.company) {
                const company = await Company.findById(user.company);
                if (company && company.users) {
                    const userInCompany = company.users.find(u => u.user?.toString() === user._id.toString());
                    if (userInCompany) {
                        userInCompany.isActive = true;
                        await company.save();
                    }
                }
            }

            logger.info(`[UserService] Phone number ${normalizedPhone} verified successfully for user ${user.email}`);
            return this.mapUserToDto(user);
        } catch (error: unknown) {
            logger.error('[UserService] Error verifying phone:', { error });
            throw error;
        }
    }

    /**
     * Sends phone verification code with improved error handling
     */
    async sendPhoneVerificationCode(phone: string): Promise<{ success: boolean; message: string; code?: string }> {
        try {
            // Normalize phone to E.164 for consistent lookup and SMS sending
            const normalizedPhone = this.normalizePhoneForLookup(phone);

            // Check if phone number is already verified
            const existingUser = await User.findOne({ phone: normalizedPhone, phoneVerified: true });
            if (existingUser) {
                return {
                    success: false,
                    message: 'Phone number is already verified by another user'
                };
            }

            // Send SMS verification code
            const result = await smsService.sendVerificationCode(normalizedPhone);
            if (!result.success) {
                return {
                    success: false,
                    message: result.message
                };
            }

            // Find user with this phone number
            const user = await User.findOne({ phone: normalizedPhone });
            if (!user) {
                return {
                    success: false,
                    message: 'User with this phone number not found'
                };
            }

            // Update phoneVerificationExpires to track when code was sent (for cooldown)
            // Set expires to 10 minutes from now (same as registration)
            user.phoneVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            // For Twilio Verify, we don't need to store the code locally
            // Twilio handles the verification process
            logger.info(`[UserService] Phone verification code sent to ${normalizedPhone}`);

            return {
                success: true,
                message: result.message,
                code: result.code
            };
        } catch (error: unknown) {
            logger.error('[UserService] Error sending phone verification:', { error });
            return {
                success: false,
                message: 'Failed to send verification code. Please try again later.'
            };
        }
    }

    /**
     * Resends phone verification code with improved error handling
     */
    async resendPhoneVerificationCode(phone: string): Promise<{ success: boolean; message: string; code?: string }> {
        try {
            // Normalize phone to E.164 for consistent lookup
            const normalizedPhone = this.normalizePhoneForLookup(phone);

            const user = await User.findOne({ phone: normalizedPhone });
            if (!user) {
                return {
                    success: false,
                    message: 'User with this phone number not found'
                };
            }

            if (user.phoneVerified) {
                return {
                    success: false,
                    message: 'Phone number is already verified'
                };
            }

            // Check cooldown: code was sent less than 2 minutes ago
            // phoneVerificationExpires is set to 10 minutes from when code was sent
            // So if expires > (now + 8 minutes), code was sent less than 2 minutes ago
            if (user.phoneVerificationExpires) {
                const codeSentTime = new Date(user.phoneVerificationExpires.getTime() - 10 * 60 * 1000);
                const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                
                if (codeSentTime > twoMinutesAgo) {
                    const secondsRemaining = Math.ceil((codeSentTime.getTime() + 2 * 60 * 1000 - Date.now()) / 1000);
                    return {
                        success: false,
                        message: `Please wait at least 2 minutes before requesting a new code. ${secondsRemaining > 0 ? `Try again in ${Math.ceil(secondsRemaining / 60)} minute(s).` : ''}`
                    };
                }
            }

            return await this.sendPhoneVerificationCode(normalizedPhone);
        } catch (error: unknown) {
            logger.error('[UserService] Error resending phone verification:', { error });
            return {
                success: false,
                message: 'Failed to resend verification code. Please try again later.'
            };
        }
    }

    /**
     * Checks if phone number exists
     */
    async phoneExists(phone: string): Promise<boolean> {
        // Normalize phone to E.164 for consistent lookup
        const normalizedPhone = this.normalizePhoneForLookup(phone);
        const user = await User.findOne({ phone: normalizedPhone }).lean();
        return !!user;
    }

    /**
     * Resends verification email
     */
    async resendVerificationEmail(email: string): Promise<void> {
        const user = await User.findOne({ email });
        if (!user) {
            throw new Error('User not found');
        }

        if (user.emailVerified) {
            throw new Error('Email is already verified');
        }

        // Generate new token
        const verificationToken = this.generateSecureToken();
        user.emailVerificationToken = verificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await user.save();

        // Send email
        if (emailService.isAvailable()) {
            await emailService.sendVerificationEmail(user.email, user.firstName, verificationToken);
        } else {
            logger.warn('[UserService] Email service not available, skipping verification email');
        }
    }

    /**
     * Requests password reset. Finds user by email or phone; sends link by email or SMS.
     * Never throws: always returns so the API can respond 200 and not reveal whether the account exists.
     */
    async requestPasswordReset(emailOrPhone: string, delivery: 'email' | 'sms'): Promise<void> {
        try {
            const trimmed = (emailOrPhone || '').trim();
            if (!trimmed) return;

            const isEmail = trimmed.includes('@');
            const filter = isEmail
                ? { email: trimmed.toLowerCase() }
                : { phone: this.normalizePhoneForLookup(trimmed) };
            const user = await User.findOne(filter);
            if (!user) {
                return;
            }

            const resetToken = this.generateSecureToken();
            user.passwordResetToken = resetToken;
            user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            const resetUrl = `${process.env.FRONTEND_BASE_URL || ''}/reset-password?token=${resetToken}`;

            if (delivery === 'email') {
                if (emailService.isAvailable()) {
                    await emailService.sendPasswordResetEmail(user.email, user.firstName, resetToken);
                } else {
                    logger.warn('[UserService] Email service not available, skipping password reset email');
                }
                return;
            }

            if (user.phone && smsService.isAvailable()) {
                await smsService.sendPasswordResetSms(user.phone, resetUrl);
            } else if (!user.phone) {
                logger.warn('[UserService] User has no phone, cannot send password reset SMS');
            } else {
                logger.warn('[UserService] SMS service not available, skipping password reset SMS');
            }
        } catch (err) {
            logger.error('[UserService] requestPasswordReset failed', { error: getErrorMessage(err), delivery });
            // Do not rethrow: API must always return 200 with generic message
        }
    }

    /**
     * Generates a one-time link token for "Link Telegram" flow. Token valid 15 minutes.
     *
     * IMPORTANT: Telegram caps the `?start=PAYLOAD` deep-link parameter at 64 chars
     * (https://core.telegram.org/bots/features#deep-linking). Anything longer is
     * silently dropped and the bot receives a bare `/start`. Our prefix `link_`
     * eats 5 chars, so the token itself must be <= 59 chars. We use 16 random
     * bytes → 32 hex chars (128 bits of entropy, plenty for a 15-min one-time
     * single-use token), giving a final payload of 37 chars.
     */
    async requestTelegramLink(userId: string): Promise<string> {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        const token = crypto.randomBytes(16).toString('hex');
        user.telegramLinkToken = token;
        user.telegramLinkTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
        return token;
    }

    /**
     * Removes the linked Telegram chat_id for a user.
     * Best-effort: idempotent if the user has no link.
     */
    async unlinkTelegram(userId: string): Promise<void> {
        await User.findByIdAndUpdate(userId, {
            $unset: {
                telegramId: '',
                telegramLinkToken: '',
                telegramLinkTokenExpires: ''
            }
        });
        logger.info('[UserService] Telegram unlinked', { userId });
    }

    /**
     * Updates per-channel notification preferences for the current user.
     * Only the three documented channels are accepted; unknown keys are ignored.
     */
    async updateNotificationPrefs(
        userId: string,
        prefs: { email?: boolean; telegram?: boolean; whatsapp?: boolean }
    ): Promise<{ email: boolean; telegram: boolean; whatsapp: boolean }> {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const current = user.notificationPrefs || {};
        const next = {
            email: typeof prefs.email === 'boolean' ? prefs.email : current.email ?? true,
            telegram: typeof prefs.telegram === 'boolean' ? prefs.telegram : current.telegram ?? true,
            whatsapp: typeof prefs.whatsapp === 'boolean' ? prefs.whatsapp : current.whatsapp ?? false
        };
        user.notificationPrefs = next;
        await user.save();

        logger.info('[UserService] Notification prefs updated', { userId, prefs: next });
        return next;
    }

    /**
     * Links Telegram chat_id to user by one-time token (called when user starts the bot with link_XXX).
     */
    async linkTelegram(linkToken: string, telegramChatId: string): Promise<void> {
        const user = await User.findOne({
            telegramLinkToken: linkToken,
            telegramLinkTokenExpires: { $gt: new Date() }
        });
        if (!user) throw new Error('Invalid or expired link');
        user.telegramId = telegramChatId;
        user.telegramLinkToken = undefined;
        user.telegramLinkTokenExpires = undefined;
        await user.save();
        logger.info('[UserService] Telegram linked successfully', { userId: user._id?.toString(), telegramId: telegramChatId });
    }

    /**
     * Resets password using token
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: new Date() }
        }).select('+legacyPasswordSalt');

        if (!user) {
            throw new ValidationError('Invalid or expired reset token');
        }

        // Validate new password
        const passwordValidation = this.validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            throw new ValidationError(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update password and clear token
        user.password = hashedPassword;
        user.legacyPasswordSalt = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();
    }

    /**
     * Updated registration method with email verification
     */
    async registerUser(userData: CreateUserDto): Promise<AuthResultDto> {
        logger.debug('[UserService] registerUser started with data:', { 
            email: userData.email, 
            phone: userData.phone, 
            companyName: userData.companyName 
        });

        const { email, password, firstName, lastName, phone, companyName } = userData;

        try {
            logger.debug('[UserService] Step 1: Validating email existence...');
            // Validations
            if (await this.emailExists(email)) {
                logger.debug('[UserService] ERROR: Email already exists');
                throw new ConflictError('User with this email already exists');
            }

            logger.debug('[UserService] Step 2: Validating phone existence...');
            if (await this.phoneExists(phone)) {
                logger.debug('[UserService] ERROR: Phone already exists');
                throw new ConflictError('User with this phone number already exists');
            }

            logger.debug('[UserService] Step 3: Validating password...');
            const passwordValidation = this.validatePassword(password);
            if (!passwordValidation.isValid) {
                logger.debug('[UserService] ERROR: Password validation failed:', passwordValidation.errors);
                throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
            }

            logger.debug('[UserService] Step 4: Processing company...');
            // Company processing
            let company: ICompanyDocument | null = null;
            let isFirstUser = false;
            const lgdealCompanyName = marketplaceConfig?.managementCompany?.name;
            const isLgdealCompany = companyName === lgdealCompanyName;

            logger.debug('[UserService] LGDEAL company name:', lgdealCompanyName);
            logger.debug('[UserService] Is LGDEAL company:', isLgdealCompany);

            if (companyName) {
                logger.debug('[UserService] Looking for company:', companyName);
                company = await Company.findOne({ name: companyName });
                
                if (!company) {
                    logger.debug('[UserService] Creating new company...');
                    const newCompany = new Company({
                        name: companyName,
                        description: `${companyName} organization`,
                        status: isLgdealCompany ? 'active' : 'pending_review',
                        roles: userData.companyRole ? [userData.companyRole] : ['seller']
                    });
                    company = await newCompany.save();
                    logger.debug('[UserService] New company created:', company._id);
                    isFirstUser = true;
                } else {
                    logger.debug('[UserService] Found existing company:', company._id);
                }
            }

            logger.debug('[UserService] Step 5: Determining user role and activity...');
            // Check if this is the first user in the company
            let isFirstUserInCompany = isFirstUser;
            if (!isFirstUser && company) {
                // Check if company has any active users
                const existingActiveUsers = company.users?.filter(u => u.isActive) || [];
                isFirstUserInCompany = existingActiveUsers.length === 0;
            }
            
            logger.debug('[UserService] Is first user in company:', isFirstUserInCompany);
            
            // Role determination
            let userRole: 'admin' | 'supervisor' | 'manager' = 'manager';
            let userIsActive = false;

            if (isFirstUserInCompany) {
                userRole = 'supervisor';
                userIsActive = true; // First user in any company is active
            } else if (isLgdealCompany) {
                userRole = 'manager'; // LGDEAL users are managers by default, not supervisors
                userIsActive = false; 
            }
            
            logger.debug('[UserService] User role determined:', userRole);
            logger.debug('[UserService] User isActive:', userIsActive);

            logger.debug('[UserService] Step 6: Generating verification tokens...');
            // Generate verification tokens for ALL users (including LGDEAL)
            const emailVerificationToken = this.generateSecureToken();
            const phoneVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            logger.debug('[UserService] Step 7: Hashing password...');
            // Create user
            const hashedPassword = await bcrypt.hash(password, 12);

            logger.debug('[UserService] Step 8: Creating user object...');
            
            const user = new User({
                email,
                password: hashedPassword,
                firstName,
                lastName,
                phone,
                company: company?._id,
                role: userRole,
                isActive: userIsActive, // First user is active, others need activation
                emailVerified: false, // ALL users must verify email
                phoneVerified: false, // ALL users must verify phone
                emailVerificationToken: emailVerificationToken,
                emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
                phoneVerificationCode: phoneVerificationCode,
                phoneVerificationExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
                cart: { items: [], updatedAt: new Date() }
            });

            logger.debug('[UserService] Step 9: Saving user...');
            const savedUser = await user.save();
            logger.debug('[UserService] User saved successfully:', savedUser._id);

            logger.debug('[UserService] Step 10: Adding user to company...');
            // Add to company
            if (company) {
                if (!company.users) company.users = [];
                company.users.push({
                    user: savedUser._id,
                    role: userRole,
                    isActive: savedUser.isActive
                });
                await company.save();
                logger.debug('[UserService] User added to company successfully');
            }

            logger.debug('[UserService] Step 11: Sending verification for ALL users...');
            // Send verification emails and SMS for ALL users (including LGDEAL)
            logger.debug('[UserService] Sending verification notifications...');
            
            // Send email verification
            if (emailService.isAvailable()) {
                try {
                    await emailService.sendVerificationEmail(savedUser.email, savedUser.firstName, emailVerificationToken);
                    logger.debug('[UserService] Verification email sent successfully');
                } catch (error) {
                    logger.error('[UserService] Failed to send verification email:', { error });
                    if (process.env.NODE_ENV !== 'production') logger.info('[UserService] Email verification token available in dev (not logged for security)');
                }
            } else {
                if (process.env.NODE_ENV !== 'production') logger.info('[UserService] Email service not available; verification token generated (not logged for security)');
            }

            // Send SMS verification
            if (smsService.isAvailable()) {
                try {
                    await smsService.sendVerificationCode(phone);
                    logger.debug('[UserService] SMS verification sent successfully');
                } catch (error) {
                    logger.error('[UserService] Failed to send SMS verification:', { error });
                    if (process.env.NODE_ENV !== 'production') logger.info('[UserService] SMS verification code available in dev (not logged for security)');
                }
            } else {
                if (process.env.NODE_ENV !== 'production') logger.info('[UserService] SMS service not available; verification code generated (not logged for security)');
            }

            logger.debug('[UserService] Step 12: Sending Telegram notification...');
            // Send Telegram notification about new registration
            try {
                const notificationData: RegistrationNotificationData = {
                    email: savedUser.email,
                    firstName: savedUser.firstName,
                    lastName: savedUser.lastName,
                    phone: savedUser.phone || '',
                    companyName: company?.name || undefined,
                    companyRole: company?.roles?.[0] || undefined,
                    role: userRole,
                    registrationDate: savedUser.createdAt || new Date()
                };
                
                await sendRegistrationNotification(notificationData);
                logger.debug('[UserService] Telegram notification sent successfully');
            } catch (error) {
                logger.error('[UserService] Failed to send Telegram notification:', { error });
                // Don't fail registration if Telegram notification fails
            }

            logger.debug('[UserService] Step 13: Generating JWT token...');
            // Generate token
            const token = this.generateToken({
                userId: savedUser._id.toString(),
                role: userRole,
                companyId: company?._id?.toString(),
                isLgdealSupervisor: this.isLgdealSupervisor(savedUser, company || undefined)
            });

            logger.info('[UserService] Step 14: Registration completed successfully');
            return {
                token,
                user: this.mapUserToDto(savedUser, company || undefined)
            };

        } catch (error: unknown) {
            logger.error('[UserService] Registration failed with error:', getErrorMessage(error));
            if (error && typeof error === 'object' && 'stack' in error) {
                logger.error('[UserService] Error stack:', error.stack);
            }
            throw error;
        }
    }

    /**
     * Generates a 4-digit phone verification code
     */
    private generatePhoneVerificationCode(): string {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }
}

// Export service instance
export const userService = new UserService(); 