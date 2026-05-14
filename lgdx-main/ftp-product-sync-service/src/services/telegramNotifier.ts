/**
 * Telegram уведомления для FTP сервиса
 */

import axios from 'axios';
import * as fs from 'fs';
import { logger } from '../shared/logger';

export class TelegramNotifier {
  private botToken: string | null = null;
  private chatId: string | null = null;
  private enabled = false;

  constructor() {
    this.loadCredentials();
  }

  private loadCredentials(): void {
    try {
      // Читаем из secrets файлов (Docker Swarm secrets)
      const botTokenPath = process.env.STOCK_TELEGRAM_BOT_TOKEN_FILE || '/run/secrets/stock_telegram_bot_token';
      const chatIdPath = process.env.STOCK_TELEGRAM_CHAT_ID_FILE || '/run/secrets/stock_telegram_chat_id';

      if (fs.existsSync(botTokenPath)) {
        this.botToken = fs.readFileSync(botTokenPath, 'utf8').trim();
      } else if (process.env.STOCK_TELEGRAM_BOT_TOKEN) {
        this.botToken = process.env.STOCK_TELEGRAM_BOT_TOKEN;
      }

      if (fs.existsSync(chatIdPath)) {
        this.chatId = fs.readFileSync(chatIdPath, 'utf8').trim();
      } else if (process.env.STOCK_TELEGRAM_CHAT_ID) {
        this.chatId = process.env.STOCK_TELEGRAM_CHAT_ID;
      }

      this.enabled = !!(this.botToken && this.chatId);

      if (this.enabled) {
        logger.info('[TelegramNotifier] Initialized successfully');
      } else {
        logger.warn('[TelegramNotifier] Not configured - notifications disabled');
      }
    } catch (error) {
      logger.error('[TelegramNotifier] Error loading credentials:', error);
      this.enabled = false;
    }
  }

  /**
   * Уведомление о превышении лимита загрузок — не отправляем в Telegram (только лог).
   */
  async sendRateLimitExceeded(
    companyName: string,
    fileName: string,
    currentCount: number,
    resetAt: Date
  ): Promise<void> {
    logger.info('[TelegramNotifier] Rate limit exceeded (TG notification disabled)', {
      companyName,
      fileName,
      currentCount,
      resetAt: resetAt.toISOString()
    });
  }

  /**
   * Отправляет сообщение в Telegram
   */
  private async sendMessage(message: string): Promise<void> {
    if (!this.enabled || !this.botToken || !this.chatId) {
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      
      await axios.post(
        url,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        },
        {
          timeout: 10000
        }
      );
    } catch (error) {
      logger.error('[TelegramNotifier] Error sending message to Telegram:', error);
      throw error;
    }
  }

  /**
   * Экранирует специальные символы для Telegram Markdown
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1');
  }
}

