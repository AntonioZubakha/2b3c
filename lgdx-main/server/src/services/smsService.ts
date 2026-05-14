import twilio from 'twilio';
import crypto from 'crypto';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return require('fs').readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[SmsService] Failed to read ${envVar}_FILE:`, { error: e });
        }
    }
    return process.env[envVar];
};

// Twilio configuration
const TWILIO_ACCOUNT_SID = getSecretFromFile('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = getSecretFromFile('TWILIO_AUTH_TOKEN');
const TWILIO_VERIFY_SERVICE_SID = getSecretFromFile('TWILIO_VERIFY_SERVICE_SID');
const TWILIO_PHONE_NUMBER = getSecretFromFile('TWILIO_PHONE_NUMBER');

// Environment detection
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const IS_LOCALHOST = process.env.FRONTEND_BASE_URL?.includes('localhost') || 
                    process.env.FRONTEND_BASE_URL?.includes('127.0.0.1') ||
                    !process.env.FRONTEND_BASE_URL;

// Development fallback configuration
const SMS_VERIFICATION_CODE_LENGTH = 4;
const SMS_CODE_EXPIRY_MINUTES = 10;

// Rate limiting configuration
const MAX_SMS_PER_DAY = 5;
const MAX_VERIFICATION_ATTEMPTS_PER_HOUR = 3;

export interface SmsVerificationResult {
  success: boolean;
  message: string;
  code?: string; // Only returned in development
}

export interface SmsRateLimitInfo {
  canSend: boolean;
  remainingAttempts: number;
  resetTime?: Date;
}

// In-memory storage for rate limiting (in production, use Redis)
const smsRateLimitMap = new Map<string, { count: number; lastReset: Date; attempts: number; lastAttemptReset: Date }>();

export class SmsService {
  private client: twilio.Twilio | null = null;

  constructor() {
    logger.info('[SmsService] Initializing Twilio service...');
    logger.debug(`[SmsService] TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET'}`);
    logger.debug(`[SmsService] TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET'}`);
    logger.debug(`[SmsService] TWILIO_VERIFY_SERVICE_SID: ${TWILIO_VERIFY_SERVICE_SID ? 'SET' : 'NOT SET'}`);
    this.initializeTwilio();
  }

  /**
   * Initialize Twilio client if credentials are available
   */
  private initializeTwilio(): void {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID) {
      try {
        this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        logger.info('[SmsService] Twilio Verify client initialized successfully');
      } catch (error) {
        logger.error('[SmsService] Failed to initialize Twilio client:', { error });
        this.client = null;
      }
    } else {
      logger.warn('[SmsService] Twilio Verify credentials not found. Running in development mode.');
      this.client = null;
    }
  }

  /**
   * Generate a cryptographically secure verification code
   */
  private generateVerificationCode(): string {
    const bytes = crypto.randomBytes(SMS_VERIFICATION_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < SMS_VERIFICATION_CODE_LENGTH; i++) {
      code += (bytes[i] % 10).toString();
    }
    return code;
  }

  /**
   * Check rate limiting for SMS sending
   */
  private checkSmsRateLimit(phoneNumber: string): SmsRateLimitInfo {
    const now = new Date();
    const key = `sms_${phoneNumber}`;
    const attemptKey = `attempts_${phoneNumber}`;
    
    let rateLimit = smsRateLimitMap.get(key);
    let attemptLimit = smsRateLimitMap.get(attemptKey);

    // Initialize rate limit tracking
    if (!rateLimit) {
      rateLimit = { count: 0, lastReset: now, attempts: 0, lastAttemptReset: now };
      smsRateLimitMap.set(key, rateLimit);
    }

    if (!attemptLimit) {
      attemptLimit = { count: 0, lastReset: now, attempts: 0, lastAttemptReset: now };
      smsRateLimitMap.set(attemptKey, attemptLimit);
    }

    // Reset daily count if 24 hours have passed
    const dayInMs = 24 * 60 * 60 * 1000;
    if (now.getTime() - rateLimit.lastReset.getTime() > dayInMs) {
      rateLimit.count = 0;
      rateLimit.lastReset = now;
    }

    // Reset hourly attempts if 1 hour has passed
    const hourInMs = 60 * 60 * 1000;
    if (now.getTime() - attemptLimit.lastAttemptReset.getTime() > hourInMs) {
      attemptLimit.attempts = 0;
      attemptLimit.lastAttemptReset = now;
    }

    const canSend = rateLimit.count < MAX_SMS_PER_DAY && attemptLimit.attempts < MAX_VERIFICATION_ATTEMPTS_PER_HOUR;
    const remainingAttempts = Math.max(0, MAX_SMS_PER_DAY - rateLimit.count);

    return {
      canSend,
      remainingAttempts,
      resetTime: new Date(rateLimit.lastReset.getTime() + dayInMs)
    };
  }

  /**
   * Update rate limiting counters
   */
  private updateRateLimit(phoneNumber: string): void {
    const key = `sms_${phoneNumber}`;
    const attemptKey = `attempts_${phoneNumber}`;
    
    let rateLimit = smsRateLimitMap.get(key);
    let attemptLimit = smsRateLimitMap.get(attemptKey);

    if (rateLimit) {
      rateLimit.count++;
    }
    if (attemptLimit) {
      attemptLimit.attempts++;
    }
  }

  /**
   * Send verification code via Twilio Verify
   */
  async sendVerificationCode(phoneNumber: string): Promise<SmsVerificationResult> {
    try {
      // Validate phone number format
      if (!this.isValidPhoneNumber(phoneNumber)) {
        return {
          success: false,
          message: 'Invalid phone number format. Please use international format (e.g., +1234567890)'
        };
      }

      // Check rate limiting
      const rateLimitInfo = this.checkSmsRateLimit(phoneNumber);
      if (!rateLimitInfo.canSend) {
        return {
          success: false,
          message: `Verification rate limit exceeded. You can send ${rateLimitInfo.remainingAttempts} more verifications today.`
        };
      }

      // Send verification via Twilio Verify
      if (this.client && TWILIO_VERIFY_SERVICE_SID && !config.smsService.developmentMode) {
        // Production: Send via Twilio Verify (4-digit code configured in Twilio Console)
        const verification = await this.client.verify.v2
          .services(TWILIO_VERIFY_SERVICE_SID)
          .verifications.create({
            to: phoneNumber,
            channel: 'sms'
          });
        
        logger.info(`[SmsService] Verification sent to ${phoneNumber} via Twilio Verify (SID: ${verification.sid}) - 4-digit code`);
        
        // Update rate limiting
        this.updateRateLimit(phoneNumber);

        return {
          success: true,
          message: `Verification code sent to ${phoneNumber}`,
          code: undefined // Twilio Verify doesn't return the code
        };
      } else {
        // Development: Generate and log the 4-digit code
        const verificationCode = this.generateVerificationCode();
        logger.info(`[SmsService] 🧪 DEVELOPMENT MODE - SMS Verification Code for ${phoneNumber}:`);
        logger.debug(`[SmsService] 📱 Code: ${verificationCode} (4 digits)`);
        logger.debug(`[SmsService] ⏰ Expires in: ${SMS_CODE_EXPIRY_MINUTES} minutes`);
        logger.debug(`[SmsService] 🔗 Use this code to verify your phone number`);
        
        // Update rate limiting
        this.updateRateLimit(phoneNumber);

        return {
          success: true,
          message: `Verification code sent to ${phoneNumber} (development mode - check console for code)`,
          code: verificationCode
        };
      }

    } catch (error: unknown) {
      logger.error(`[SmsService] Error sending verification to ${phoneNumber}:`, { error });
      
      return {
        success: false,
        message: getErrorMessage(error, 'Failed to send verification code')
      };
    }
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic international phone number validation
    // Matches: +[country code][number] (e.g., +1234567890, +380501234567)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  /**
   * Check if SMS service is available
   */
  isAvailable(): boolean {
    return config.smsService.enabled || config.smsService.developmentMode;
  }

  /**
   * Send password reset link via SMS (Twilio Messages API).
   * Uses TWILIO_PHONE_NUMBER as sender. In development without Twilio, logs the link.
   */
  async sendPasswordResetSms(phoneNumber: string, resetUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isValidPhoneNumber(phoneNumber)) {
        return { success: false, message: 'Invalid phone number format' };
      }

      const body = `LGDeal: Reset your password - ${resetUrl} (valid 1 hour)`;

      if (this.client && TWILIO_PHONE_NUMBER && !config.smsService.developmentMode) {
        await this.client.messages.create({
          from: TWILIO_PHONE_NUMBER,
          to: phoneNumber,
          body
        });
        logger.info(`[SmsService] Password reset SMS sent to ${phoneNumber}`);
        return { success: true, message: 'SMS sent' };
      }

      // Development: log instead of sending
      logger.info(`[SmsService] [DEV] Password reset link for ${phoneNumber}: ${resetUrl}`);
      return { success: true, message: 'SMS sent (development)' };
    } catch (error: unknown) {
      logger.error(`[SmsService] Error sending password reset SMS to ${phoneNumber}:`, { error });
      return {
        success: false,
        message: getErrorMessage(error, 'Failed to send SMS')
      };
    }
  }

  /**
   * Check verification code via Twilio Verify
   */
  async checkVerificationCode(phoneNumber: string, code: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isValidPhoneNumber(phoneNumber)) {
        return {
          success: false,
          message: 'Invalid phone number format'
        };
      }

      if (this.client && TWILIO_VERIFY_SERVICE_SID && !config.smsService.developmentMode) {
        // Production: Check via Twilio Verify
        const verificationCheck = await this.client.verify.v2
          .services(TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks.create({
            to: phoneNumber,
            code: code
          });

        logger.info(`[SmsService] Verification check for ${phoneNumber}: ${verificationCheck.status}`);

        if (verificationCheck.status === 'approved') {
          return {
            success: true,
            message: 'Verification code is valid'
          };
        } else {
          return {
            success: false,
            message: 'Invalid verification code'
          };
        }
      } else {
        // Development: Check against generated code (this is simplified)
        logger.debug(`[SmsService] DEVELOPMENT MODE - Checking code: ${code} for ${phoneNumber}`);
        // In development, we'd need to store the code temporarily
        // For now, just return success for any 4-digit code
        if (code.length === 4 && /^\d{4}$/.test(code)) {
          return {
            success: true,
            message: 'Verification code is valid (development mode)'
          };
        } else {
          return {
            success: false,
            message: 'Invalid verification code format'
          };
        }
      }
    } catch (error: unknown) {
      logger.error(`[SmsService] Error checking verification code for ${phoneNumber}:`, { error });
      return {
        success: false,
        message: getErrorMessage(error, 'Failed to check verification code')
      };
    }
  }

  /**
   * Get service status for health checks
   */
  getStatus(): {
    available: boolean;
    provider: string;
    developmentMode: boolean;
  } {
    return {
      available: this.isAvailable(),
      provider: this.client ? 'twilio-verify' : 'development',
      developmentMode: config.smsService.developmentMode
    };
  }
}

// Export singleton instance
export const smsService = new SmsService(); 