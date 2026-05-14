import { Telegraf } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
  existsSync: (p: string) => boolean;
};
import { logger } from './logger';

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
let stockBot: Telegraf<any> | null = null;

if (stockBotToken && stockBotChatId) {
    stockBot = new Telegraf(stockBotToken);
    logger.info('[TelegramBot] Stock Update Bot initialized', { chatId: stockBotChatId });
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
    if (MOCK_BOT_ENABLED) {
        logger.info('[TelegramBot MOCK] Sending message', { chatId, message: text.substring(0, 100) });
        return;
    }
    if (!bot || !chatId) {
        logger.warn('[TelegramBot] SKIPPED (bot not initialized or no chat_id)', { message: text.substring(0, 100) });
        return;
    }
    try {
        await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
    } catch (error: any) {
        if (error.code === 429 && error.parameters?.retry_after) {
            const retryAfter = error.parameters.retry_after;
            logger.warn('[TelegramBot] Rate limited sending message. Retrying', { retryAfter });
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            logger.error('[TelegramBot] Failed to send message', { chatId, error: error.message });
        }
    }
};

const _sendTelegramDocument = async (bot: Telegraf | null, chatId: string | number | undefined, filePath: string, caption: string, options: TelegramSendOptions = {}): Promise<void> => {
    if (MOCK_BOT_ENABLED) {
        logger.info('[TelegramBot MOCK] Sending document', { chatId, filePath });
        return;
    }
    if (!bot || !chatId) {
        logger.warn('[TelegramBot] SKIPPED (bot not initialized or no chat_id)', { filePath });
        return;
    }
    if (!fs.existsSync(filePath)) {
        logger.error('[TelegramBot] File does not exist, cannot send', { filePath });
        await _sendTelegramMessage(bot, chatId, `File not found. Caption: ${caption}`, { parse_mode: 'HTML' });
        return;
    }
    try {
        await bot.telegram.sendDocument(chatId, { source: filePath }, { caption, parse_mode: options.parse_mode || 'HTML', ...options });
    } catch (error: any) {
        if (error.code === 429 && error.parameters?.retry_after) {
            const retryAfter = error.parameters.retry_after;
            logger.warn('[TelegramBot] Rate limited sending document. Retrying', { retryAfter });
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendDocument(chatId, { source: filePath }, { caption, parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            logger.error('[TelegramBot] Error sending document', { chatId, filePath, error: error.message });
            await _sendTelegramMessage(bot, chatId, `Failed to send document. Caption: ${caption}`, { parse_mode: 'HTML' });
        }
    }
};

// --- Functions for Stock Bot ---

export const sendSyncStartNotification = async (companyId: string, companyNameAndFile: string): Promise<void> => {
  const message = `⏳ Sync started for ${companyNameAndFile} (Company ID: ${companyId})`;
  await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
};

export const sendSyncProgressNotification = async (
  companyId: string, 
  companyName: string, 
  fileName: string, 
  progressMessage: string
): Promise<void> => {
  const message = `⚙️ Sync progress for ${companyName} - ${fileName}: ${progressMessage} (Company ID: ${companyId})`;
  await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
};

export const sendSyncErrorNotification = async (
  companyId: string, 
  companyName: string, 
  fileName: string, 
  errorMessage: string
): Promise<void> => {
  const message = `❌ ERROR during sync for ${companyName} - ${fileName}: ${errorMessage} (Company ID: ${companyId})`;
  await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
};

import { ProductProcessingStats } from './productUtils';

export type SyncSourceLabel = 'API' | 'FTP' | 'LEGACY FTP' | 'MANUAL';

/** Format duration seconds as "m:ss" */
function formatDuration(sec: number | string | undefined): string {
    const s = typeof sec === 'string' ? parseFloat(sec) : (sec ?? 0);
    const m = Math.floor(s / 60);
    const secPart = Math.floor(s % 60);
    return `${m}:${String(secPart).padStart(2, '0')}`;
}

function formatSyncSuccessMessage(
    companyId: string,
    companyName: string,
    syncSource: SyncSourceLabel,
    stats: Record<string, unknown>
): string {
    const totalSkipped = ((stats.skippedByBlacklist as number) || 0) +
        ((stats.skippedExistingOnDealOrSold as number) || 0) +
        ((stats.skippedInvalidStatus as number) || 0) +
        ((stats.skippedInvalidColor as number) || 0) +
        ((stats.apiErrors as number) || 0) +
        ((stats.skippedInvalidClarity as number) || 0) +
        ((stats.skippedInvalidPrice as number) || 0) +
        ((stats.skippedInvalidCarat as number) || 0) +
        ((stats.skippedMissingMedia as number) || 0) +
        ((stats.skippedByApiFilter as number) || 0) +
        ((stats.skippedMissingCertNumber as number) || 0) +
        ((stats.skippedNotLabGrown as number) || 0) +
        ((stats.skippedAnomalousPricePerCarat as number) || 0) +
        ((stats.skippedCheaperExistsOtherCompany as number) || 0) +
        ((stats.skippedByDuplicateInSource as number) || 0) +
        ((stats.skippedInvalidData as number) || 0);

    const created = (stats.created as number) || 0;
    const updated = ((stats.updated as number) || 0) + ((stats.replacedOtherCompanyProduct as number) || 0);

    let message = `✅ Sync successful for *${companyName}*\n`;
    message += `Type: ${syncSource}\n`;
    message += `Created: *${created}*\n`;
    message += `Updated: *${updated}*\n`;
    message += `Skipped: *${totalSkipped}*\n`;
    if (((stats.deletedStale as number) || 0) > 0) {
        message += `Deleted products: *${stats.deletedStale}*\n`;
    }
    message += `Time: ${formatDuration(stats.duration as number | string | undefined)}`;

    return message;
}

export interface SyncReports {
    xlsx: string | null;
    csv: string | null;
}

export async function sendSyncSuccessNotification(
    companyId: string,
    companyName: string,
    syncSource: SyncSourceLabel,
    stats: ProductProcessingStats,
    reports: SyncReports | null
): Promise<void> {
    const messageCaption = formatSyncSuccessMessage(companyId, companyName, syncSource, stats as unknown as Record<string, unknown>);

    if (reports && reports.xlsx) {
        await _sendTelegramDocument(stockBot, stockBotChatId, reports.xlsx, messageCaption, { parse_mode: 'HTML' });
    } else {
        await _sendTelegramMessage(stockBot, stockBotChatId, messageCaption, { parse_mode: 'HTML' });
    }
} 