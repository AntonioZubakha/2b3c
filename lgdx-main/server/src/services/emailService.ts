import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[EmailService] Failed to read ${envVar}_FILE:`, { error: e });
        }
    }
    return process.env[envVar];
};

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly FRONTEND_BASE_URL: string;

  constructor() {
    this.FRONTEND_BASE_URL = config.frontendBaseUrl;
    
    // Конфигурация SMTP с проверкой доступности
    if (config.emailService.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true для 465, false для других портов
        requireTLS: process.env.SMTP_SECURE !== 'true', // requireTLS для порта 587
        auth: {
          user: process.env.SMTP_USER,
          pass: getSecretFromFile('SMTP_PASS')
        }
      });

      // Проверка подключения
      this.verifyConnection();
    } else {
      logger.warn('[EmailService] Email service is disabled. Check environment configuration.');
      // Создаем dummy transporter для development
      this.transporter = nodemailer.createTransport({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: {
          user: 'dummy',
          pass: 'dummy'
        }
      });
    }
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('[EmailService] SMTP connection verified successfully');
    } catch (error) {
      logger.error('[EmailService] SMTP connection failed:', { error });
      // Не прерываем работу приложения, email функционал будет недоступен
    }
  }

  /**
   * Генерирует криптографически стойкий токен
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sends verification email with environment-aware configuration
   */
  async sendVerificationEmail(email: string, firstName: string, token: string): Promise<void> {
    const verificationUrl = `${this.FRONTEND_BASE_URL}/verify-email?token=${token}`;
    
    const template: EmailTemplate = {
      subject: config.isDevelopment ? '[DEV] Verify your email - LGDEAL' : 'Verify your email - LGDEAL',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Welcome to LGDEAL!</h2>
          ${config.isDevelopment ? '<div style="background-color: #f39c12; color: white; padding: 10px; margin: 10px 0; border-radius: 5px; text-align: center;"><strong>DEVELOPMENT ENVIRONMENT</strong></div>' : ''}
          <p>Hello ${firstName}!</p>
          <p>Thank you for registering with LGDEAL. To complete your registration, please verify your email address.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p>Or copy this link to your browser:</p>
          <p style="word-break: break-all; color: #7f8c8d;">${verificationUrl}</p>
          <p><strong>Note:</strong> This link is valid for 24 hours.</p>
          ${config.isDevelopment ? `<p style="background-color: #ecf0f1; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px;"><strong>Development Token:</strong> ${token}</p>` : ''}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px;">
            If you didn't register with LGDEAL, please ignore this email.
          </p>
        </div>
      `,
      text: `
        Welcome to LGDEAL!
        
        ${config.isDevelopment ? '[DEVELOPMENT ENVIRONMENT]\n' : ''}
        Hello ${firstName}!
        
        Thank you for registering with LGDEAL. To complete your registration, please verify your email address.
        
        Click this link: ${verificationUrl}
        
        Note: This link is valid for 24 hours.
        ${config.isDevelopment ? `\nDevelopment Token: ${token}` : ''}
        
        If you didn't register with LGDEAL, please ignore this email.
      `
    };

    await this.sendEmail(email, template);
  }

  /**
   * Sends password reset email
   */
  async sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${this.FRONTEND_BASE_URL}/reset-password?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Password Reset - LGDEAL',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Password Reset</h2>
          <p>Hello ${firstName}!</p>
          <p>We received a request to reset the password for your LGDEAL account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy this link to your browser:</p>
          <p style="word-break: break-all; color: #7f8c8d;">${resetUrl}</p>
          <p><strong>Note:</strong> This link is valid for 1 hour.</p>
          <p>If you didn't request a password reset, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px;">
            This is an automated email, please do not reply.
          </p>
        </div>
      `,
      text: `
        Password Reset - LGDEAL
        
        Hello ${firstName}!
        
        We received a request to reset the password for your LGDEAL account.
        
        Click this link: ${resetUrl}
        
        Note: This link is valid for 1 hour.
        
        If you didn't request a password reset, please ignore this email.
      `
    };

    await this.sendEmail(email, template);
  }

  /**
   * Sends new password email (for admin reset)
   */
  async sendNewPasswordEmail(email: string, firstName: string, newPassword: string): Promise<void> {
    const template: EmailTemplate = {
      subject: 'New Password - LGDEAL',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">New Password</h2>
          <p>Hello ${firstName}!</p>
          <p>An administrator has reset your password. Your new password is:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="font-family: monospace; font-size: 18px; margin: 0; text-align: center;">
              <strong>${newPassword}</strong>
            </p>
          </div>
          <p>We recommend changing this password after logging in.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px;">
            If you have any questions, please contact the administrator.
          </p>
        </div>
      `,
      text: `
        New Password - LGDEAL
        
        Hello ${firstName}!
        
        An administrator has reset your password. Your new password is: ${newPassword}
        
        We recommend changing this password after logging in.
      `
    };

    await this.sendEmail(email, template);
  }

  /**
   * Sends company invitation email
   */
  async sendInvitationEmail(params: { to: string; companyName: string; inviterName?: string; token: string }): Promise<void> {
    const { to, companyName, inviterName, token } = params;
    const acceptUrl = `${this.FRONTEND_BASE_URL}/accept-invite?token=${token}`;

    const template: EmailTemplate = {
      subject: `Invitation to join ${companyName} on LGDEAL`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">You're invited to LGDEAL</h2>
          <p>${inviterName ? `${inviterName} has` : 'You have'} invited you to join <strong>${companyName}</strong> on LGDEAL.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${acceptUrl}" style="background-color: #2e86de; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p>If the button does not work, open this link:</p>
          <p style="word-break: break-all; color: #7f8c8d;">${acceptUrl}</p>
          <p style="color: #7f8c8d; font-size: 12px;">If you did not expect this email, you can safely ignore it.</p>
        </div>
      `,
      text: `You're invited to join ${companyName} on LGDEAL. Accept: ${acceptUrl}`
    };

    await this.sendEmail(to, template);
  }

  /**
   * Sends demo request notification to configured email (DEMO_REQUEST_EMAIL or SMTP_FROM)
   */
  async sendDemoRequestEmail(data: { firstName: string; lastName: string; email: string; phone: string; company?: string; message?: string }): Promise<void> {
    const to = process.env.DEMO_REQUEST_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '';
    if (!to) {
      logger.warn('[EmailService] DEMO_REQUEST_EMAIL/SMTP_FROM not set, skipping demo request email');
      return;
    }

    const { firstName, lastName, email, phone, company, message } = data;
    const template: EmailTemplate = {
      subject: `[LGDeal] Demo Request from ${firstName} ${lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Request a Demo</h2>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          ${company ? `<p><strong>Company:</strong> ${company}</p>` : ''}
          ${message ? `<p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p>` : ''}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ecf0f1;">
          <p style="color: #7f8c8d; font-size: 12px;">Submitted at ${new Date().toISOString()}</p>
        </div>
      `,
      text: `Request a Demo\n\nName: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${phone}${company ? `\nCompany: ${company}` : ''}${message ? `\n\nMessage:\n${message}` : ''}\n\nSubmitted at ${new Date().toISOString()}`
    };

    await this.sendEmail(to, template);
  }

  /**
   * Sends a transactional notification about a deal event (new deal, status change, etc.)
   * to a single user. Subject + body are derived from the structured payload so the
   * caller does not have to format HTML/text twice.
   */
  async sendDealEventEmail(
    email: string,
    firstName: string,
    payload: { title: string; message: string; dealNumber?: string; actionUrl?: string }
  ): Promise<void> {
    const dealRef = payload.dealNumber ? ` #${payload.dealNumber}` : '';
    const subjectPrefix = config.isDevelopment ? '[DEV] ' : '';
    const safeMessage = escapeHtml(payload.message).replace(/\n/g, '<br>');
    const safeTitle = escapeHtml(payload.title);
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hello,';

    const ctaHtml = payload.actionUrl
      ? `
            <p style="margin: 28px 0 0;">
              <a href="${payload.actionUrl}" style="display:inline-block;padding:12px 24px;background:#2c7be5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
                Open deal${dealRef}
              </a>
            </p>`
      : '';

    const ctaText = payload.actionUrl ? `\n\nOpen deal: ${payload.actionUrl}` : '';

    const template: EmailTemplate = {
      subject: `${subjectPrefix}${payload.title}${dealRef} — LGDeal`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#1f2937;">
          <h2 style="color:#1f2937; margin: 0 0 16px;">${safeTitle}</h2>
          <p style="margin: 0 0 12px;">${greeting}</p>
          <p style="margin: 0 0 12px; line-height: 1.5;">${safeMessage}</p>
          ${ctaHtml}
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color:#6b7280; font-size: 12px; margin: 0;">
            You are receiving this because you have email notifications enabled in your LGDeal account.
            You can change this in <em>My Company → My Account</em>.
          </p>
        </div>
      `,
      text: `${payload.title}${dealRef}\n\n${greeting}\n\n${payload.message}${ctaText}\n\n— LGDeal\nManage notifications: ${this.FRONTEND_BASE_URL}/account`
    };

    await this.sendEmail(email, template);
  }

  /**
   * Общий метод отправки email
   */
  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    try {
      if (config.isDevelopment) {
        // Development mode: Log email content
        logger.info(`[EmailService] 🧪 DEVELOPMENT MODE - Email would be sent to ${to}:`);
        logger.debug(`[EmailService] 📧 Subject: ${template.subject}`);
        logger.debug(`[EmailService] 📝 Text: ${template.text}`);
        logger.debug(`[EmailService] 🔗 HTML Preview: ${template.html.substring(0, 200)}...`);
        logger.info(`[EmailService] ✅ Email logged (development mode)`);
        return;
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`[EmailService] Email sent successfully to ${to}: ${result.messageId}`);
    } catch (error) {
      logger.error(`[EmailService] Failed to send email to ${to}:`, { error });
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Проверяет доступность email сервиса
   */
  isAvailable(): boolean {
    return config.emailService.enabled;
  }
}

// Экспортируем singleton instance
export const emailService = new EmailService(); 