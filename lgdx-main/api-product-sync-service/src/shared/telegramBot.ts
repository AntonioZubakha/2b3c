import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
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
let stockBot: Telegraf | null = null;

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
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error) {
            const rateLimitError = error as { parameters?: { retry_after?: number } };
            const retryAfter = rateLimitError.parameters?.retry_after ?? 5;
            logger.warn('[TelegramBot] Rate limited sending message. Retrying', { retryAfter });
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('[TelegramBot] Failed to send message', { chatId, error: errorMessage });
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
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error) {
            const rateLimitError = error as { parameters?: { retry_after?: number } };
            const retryAfter = rateLimitError.parameters?.retry_after ?? 5;
            logger.warn('[TelegramBot] Rate limited sending document. Retrying', { retryAfter });
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendDocument(chatId, { source: filePath }, { caption, parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('[TelegramBot] Error sending document', { chatId, filePath, error: errorMessage });
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

interface SyncStats {
    created?: number;
    updated?: number;
    replacedOtherCompanyProduct?: number;
    deletedStale?: number;
    totalFromApi?: number;
    totalUploaded?: number;
    skippedByBlacklist?: number;
    skippedExistingOnDealOrSold?: number;
    skippedInvalidStatus?: number;
    skippedInvalidColor?: number;
    skippedInvalidClarity?: number;
    skippedInvalidPrice?: number;
    skippedInvalidCarat?: number;
    skippedMissingMedia?: number;
    skippedByApiFilter?: number;
    skippedMissingCertNumber?: number;
    skippedNotLabGrown?: number;
    skippedAnomalousPricePerCarat?: number;
    skippedCheaperExistsOtherCompany?: number;
    skippedByDuplicateInSource?: number;
    apiErrors?: number;
    [key: string]: unknown;
}

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
    syncSource: 'API' | 'FTP' | 'LEGACY FTP' | 'MANUAL',
    stats: SyncStats
): string {
    const totalSkipped = (stats.skippedByBlacklist || 0) +
        (stats.skippedExistingOnDealOrSold || 0) +
        (stats.skippedInvalidStatus || 0) +
        (stats.skippedInvalidColor || 0) +
        (stats.apiErrors || 0) +
        (stats.skippedInvalidClarity || 0) +
        (stats.skippedInvalidPrice || 0) +
        (stats.skippedInvalidCarat || 0) +
        (stats.skippedMissingMedia || 0) +
        (stats.skippedByApiFilter || 0) +
        (stats.skippedMissingCertNumber || 0) +
        (stats.skippedNotLabGrown || 0) +
        (stats.skippedAnomalousPricePerCarat || 0) +
        (stats.skippedCheaperExistsOtherCompany || 0) +
        (stats.skippedByDuplicateInSource || 0);

    const created = stats.created || 0;
    const updated = (stats.updated || 0) + (stats.replacedOtherCompanyProduct || 0);

    let message = `✅ Sync successful for *${companyName}*\n`;
    message += `Type: ${syncSource}\n`;
    message += `Created: *${created}*\n`;
    message += `Updated: *${updated}*\n`;
    message += `Skipped: *${totalSkipped}*\n`;
    if ((stats.deletedStale || 0) > 0) {
        message += `Stale products removed: *${stats.deletedStale}*\n`;
    }
    message += `Time: ${formatDuration((stats as { duration?: string }).duration)}`;

    return message;
}

export interface SyncReports {
    xlsx: string | null;
    csv: string | null;
}

export async function sendSyncSuccessNotification(
    companyId: string,
    companyName: string,
    syncSource: 'API' | 'FTP' | 'LEGACY FTP' | 'MANUAL',
    stats: SyncStats,
    reports: SyncReports | null
): Promise<void> {
    logger.info('[TelegramBot] Sending success notification', { companyId, companyName });

    const messageCaption = formatSyncSuccessMessage(companyId, companyName, syncSource, stats);

    if (reports && reports.xlsx) {
        logger.info('[TelegramBot] Sending XLSX report', { companyId, companyName, reportPath: reports.xlsx });
        await _sendTelegramDocument(stockBot, stockBotChatId, reports.xlsx, messageCaption, { parse_mode: 'HTML' });
    } else {
        logger.info('[TelegramBot] Sending text message (no XLSX report available)', { companyId, companyName });
        await _sendTelegramMessage(stockBot, stockBotChatId, messageCaption, { parse_mode: 'HTML' });
    }

    logger.info('[TelegramBot] Success notification sent', { companyId, companyName });
}

// --- Queue Update Function (for Stock Bot) ---
interface QueueUpdateDetails {
  running: number;
  queued: number;
  companyId?: string;
  companyName?: string;
  action?: 'enqueued' | 'dequeued_and_running' | 'already_queued' | 'sync_completed' | 'sync_failed';
}

export const sendQueueUpdateNotification = async (details: QueueUpdateDetails): Promise<void> => {
  let message = '🔄 API Sync Queue Update:\n';
  message += `  Running: ${details.running}\n`;
  message += `  Queued: ${details.queued}\n`;

  if (details.companyName && details.companyId && details.action) {
    switch (details.action) {
      case 'enqueued':
        message += `\n➕ ${details.companyName} (ID: ${details.companyId}) was added to the queue.`;
        break;
      case 'dequeued_and_running':
        message += `\n▶️ ${details.companyName} (ID: ${details.companyId}) started processing.`;
        break;
      case 'already_queued':
        message += `\nℹ️ ${details.companyName} (ID: ${details.companyId}) is already in the queue.`;
        break;
    }
  }
  await _sendTelegramMessage(stockBot, stockBotChatId, message, { parse_mode: 'HTML' });
}; 