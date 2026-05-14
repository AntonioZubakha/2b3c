import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const MOCK_BOT_ENABLED = process.env.MOCK_TELEGRAM_BOT === 'true';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[TelegramBot] Failed to read ${envVar}_FILE`, { error: e });
        }
    }
    return process.env[envVar];
};

// --- Bot for Stock Updates (from .env or secrets) ---
const stockBotToken = getSecretFromFile('STOCK_TELEGRAM_BOT_TOKEN');
const stockBotChatId = getSecretFromFile('STOCK_TELEGRAM_CHAT_ID');
let stockBot: Telegraf | null = null;

if (stockBotToken && stockBotChatId) {
    stockBot = new Telegraf(stockBotToken);
    logger.info(`[TelegramBot] Stock Update Bot initialized for chat ID: ${stockBotChatId}`);
} else {
    logger.info('[TelegramBot] Stock Update Bot not initialized (missing STOCK_TELEGRAM_BOT_TOKEN or STOCK_TELEGRAM_CHAT_ID)');
}

// --- Generic Private Sender Functions ---

interface TelegramSendOptions {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
}

const _sendTelegramMessage = async (bot: Telegraf | null, chatId: string | number | undefined, text: string, options: TelegramSendOptions = {}): Promise<void> => {
    logger.debug(`[TelegramBot DEBUG] Attempting to send message`, { hasBot: !!bot, chatId, mockEnabled: MOCK_BOT_ENABLED });

    if (MOCK_BOT_ENABLED) {
        logger.debug(`[TelegramBot MOCK] To: ${chatId}, Message: ${text}`);
        return;
    }
    if (!bot || !chatId) {
        logger.warn(`[TelegramBot] SKIPPED (bot not initialized or no chat_id): ${text.substring(0, 100)}...`);
        return;
    }
    try {
        logger.debug(`[TelegramBot] Sending message to chat ${chatId}...`);
        await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
        logger.debug(`[TelegramBot] Message sent successfully to chat ${chatId}`);
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error) {
            const rateLimitError = error as { parameters?: { retry_after?: number } };
            const retryAfter = rateLimitError.parameters?.retry_after ?? 5;
            logger.warn(`[TelegramBot] Rate limited sending message. Retrying in ${retryAfter}s...`);
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[TelegramBot] Failed to send message to chat ${chatId}`, { error: errorMessage });
        }
    }
};

// --- Functions for Analytics Service ---

export const sendAnalyticsStartNotification = async (serviceName: string): Promise<void> => {
    const message = `🚀 <b>Analytics Service Started</b>\n\n📊 Service: ${serviceName}\n⏰ Time: ${new Date().toISOString()}`;
    await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
};

export const sendAnalyticsCompleteNotification = async (serviceName: string, duration: number, success: boolean, message?: string): Promise<void> => {
    const status = success ? '✅' : '❌';
    const statusText = success ? 'COMPLETED' : 'FAILED';
    const durationText = `${Math.round(duration / 1000)}s`;

    let notificationMessage = `${status} <b>Analytics Service ${statusText}</b>\n\n`;
    notificationMessage += `📊 Service: ${serviceName}\n`;
    notificationMessage += `⏱️ Duration: ${durationText}\n`;
    notificationMessage += `⏰ Time: ${new Date().toISOString()}\n`;

    if (message) {
        notificationMessage += `📝 Details: ${message}`;
    }

    await _sendTelegramMessage(stockBot, stockBotChatId, notificationMessage, { parse_mode: 'HTML' });
};

export const sendAnalyticsErrorNotification = async (serviceName: string, error: string): Promise<void> => {
    const message = `❌ <b>Analytics Service Error</b>\n\n📊 Service: ${serviceName}\n🔥 Error: ${error}\n⏰ Time: ${new Date().toISOString()}`;
    await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
};
