import axios from 'axios';
import { logger } from './logger';
import * as fs from 'fs';

// Constants for paths and configuration
const SECRETS_DIR = process.env.SECRETS_DIR || '/run/secrets';
const BOT_TOKEN_SECRET = `${SECRETS_DIR}/system_monitoring_bot_token`;
const CHAT_ID_SECRET = `${SECRETS_DIR}/system_monitoring_chat_id`;
const TELEGRAM_API_TIMEOUT = 10000; // 10 seconds

export class TelegramNotifier {
  private botToken: string | null = null;
  private chatId: string | null = null;

  constructor() {
    this.loadSecrets();
  }

  private loadSecrets(): void {
    try {
      // Try to read from Docker secrets
      if (fs.existsSync(BOT_TOKEN_SECRET)) {
        this.botToken = fs.readFileSync(BOT_TOKEN_SECRET, 'utf8').trim();
      } else if (process.env.SYSTEM_MONITORING_BOT_TOKEN) {
        this.botToken = process.env.SYSTEM_MONITORING_BOT_TOKEN;
      }

      if (fs.existsSync(CHAT_ID_SECRET)) {
        this.chatId = fs.readFileSync(CHAT_ID_SECRET, 'utf8').trim();
      } else if (process.env.SYSTEM_MONITORING_CHAT_ID) {
        this.chatId = process.env.SYSTEM_MONITORING_CHAT_ID;
      }

      if (this.botToken && this.chatId) {
        logger.info('✅ Telegram credentials loaded successfully');
      } else {
        logger.warn('⚠️ Telegram credentials not fully available');
      }
    } catch (error) {
      logger.warn('⚠️ Could not load Telegram secrets', { error });
    }
  }

  async sendSuccess(params: { domain: string; duration: string; backupPath: string }): Promise<void> {
    if (!this.botToken || !this.chatId) {
      logger.warn('⚠️ Telegram credentials not available, skipping notification');
      return;
    }

    const message = `✅ SSL Certificate Renewal SUCCESS

Domain: ${params.domain}
Duration: ${params.duration}
Backup: ${params.backupPath}
Time: ${new Date().toISOString()}

All health checks passed.`;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML'
        },
        { timeout: TELEGRAM_API_TIMEOUT }
      );
      logger.info('✅ Success notification sent to Telegram');
    } catch (error) {
      logger.error('❌ Failed to send Telegram notification', { error });
      // Non-critical: don't throw, just log
    }
  }

  async sendFailure(params: { domain: string; error: string }): Promise<void> {
    if (!this.botToken || !this.chatId) {
      logger.warn('⚠️ Telegram credentials not available, skipping notification');
      return;
    }

    const message = `❌ SSL Certificate Renewal FAILED

Domain: ${params.domain}
Error: ${params.error}
Time: ${new Date().toISOString()}

Manual intervention required!`;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML'
        },
        { timeout: TELEGRAM_API_TIMEOUT }
      );
      logger.info('✅ Failure notification sent to Telegram');
    } catch (error) {
      logger.error('❌ Failed to send Telegram notification', { error });
      // Non-critical: don't throw, just log
    }
  }

  async sendRollback(params: { domain: string; backupUsed: string }): Promise<void> {
    if (!this.botToken || !this.chatId) {
      logger.warn('⚠️ Telegram credentials not available, skipping notification');
      return;
    }

    const message = `🔄 SSL Certificate ROLLBACK

Domain: ${params.domain}
Backup restored: ${params.backupUsed}
Time: ${new Date().toISOString()}

Service has been rolled back to previous certificate.`;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML'
        },
        { timeout: TELEGRAM_API_TIMEOUT }
      );
      logger.info('✅ Rollback notification sent to Telegram');
    } catch (error) {
      logger.error('❌ Failed to send Telegram notification', { error });
      // Non-critical: don't throw, just log
    }
  }
}


