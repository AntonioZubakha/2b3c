import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { ProductProcessingStats } from './productUtils';
import { logger } from './logger';
import { getErrorMessage } from './errorHelpers';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export interface SyncReports {
    xlsx: string | null;
    csv: string | null;
}

const MOCK_BOT_ENABLED = process.env.MOCK_TELEGRAM_BOT === 'true';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (e) {
            logger.error(`[TelegramBot] Failed to read ${envVar}_FILE:`, { error: e });
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
    logger.info(`[TelegramBot] Stock Update Bot initialized for chat ID: ${stockBotChatId}`);
} else {
    logger.info('[TelegramBot] Stock Update Bot not initialized (missing STOCK_TELEGRAM_BOT_TOKEN or STOCK_TELEGRAM_CHAT_ID)');
}

// --- Bot for Deal Events (from .env or secrets) ---
const dealEventBotToken = getSecretFromFile('TELEGRAM_BOT_TOKEN');
const dealEventChatId = getSecretFromFile('TELEGRAM_CHAT_ID');
let dealEventBot: Telegraf<any> | null = null;

if (dealEventBotToken && dealEventChatId) {
    dealEventBot = new Telegraf(dealEventBotToken);
    logger.info(`[TelegramBot] Deal Event Bot initialized for chat ID: ${dealEventChatId}`);
} else {
    logger.info('[TelegramBot] Deal Event Bot not initialized (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
}

// --- Logist chat (optional separate bot + chat for logistics) ---
const logistBotToken = getSecretFromFile('LOGIST_TELEGRAM_BOT_TOKEN');
const logistChatId = getSecretFromFile('LOGIST_TELEGRAM_CHAT_ID');
let logistBot: Telegraf<any> | null = null;
if (logistBotToken && logistChatId) {
    logistBot = new Telegraf(logistBotToken);
    logger.info(`[TelegramBot] Logist Bot initialized for chat ID: ${logistChatId}`);
} else if (logistChatId) {
    logger.info(`[TelegramBot] Logist notifications will use deal event bot, chat ID: ${logistChatId}`);
}

// --- Bot for Registration Notifications + user DMs (e.g. password reset). Same token: channel = REGISTRATION_TELEGRAM_CHAT_ID, user = user.telegramId ---
const registrationBotToken = getSecretFromFile('REGISTRATION_TELEGRAM_BOT_TOKEN');
const registrationBotChatId = getSecretFromFile('REGISTRATION_TELEGRAM_CHAT_ID');
let registrationBot: Telegraf<any> | null = null;

if (registrationBotToken) {
    registrationBot = new Telegraf(registrationBotToken);
    registrationBot.command('start', async (ctx) => {
        const text = ctx.message?.text ?? '';
        const payload = text.split(/\s/)[1];
        const chatId = String(ctx.from?.id ?? ctx.chat?.id ?? '');
        logger.info('[TelegramBot] Registration bot received /start', { payload: payload ?? '(none)', chatId });
        if (payload?.startsWith('link_')) {
            const token = payload.slice(5);
            try {
                const { userService } = await import('../services/userService');
                await userService.linkTelegram(token, chatId);
                await ctx.reply('✅ Linked! You will receive password reset links here when you request them.');
            } catch (e) {
                logger.error('[TelegramBot] linkTelegram failed', { error: e });
                await ctx.reply('❌ Link expired or invalid. Please request a new link from the website.');
            }
        } else {
            await ctx.reply(
                'To link your account:\n\n1. On the website go to My Company → My Account.\n2. Click "Link Telegram".\n3. When this chat opens again, tap the blue **Start** or **Open** button at the bottom of the chat (do not type /start in the message box).',
                { parse_mode: 'Markdown' }
            );
        }
    });
    registrationBot.launch().catch((err: unknown) => logger.error('[TelegramBot] Registration bot launch failed', { error: err }));
    logger.info(registrationBotChatId
        ? `[TelegramBot] Registration Bot initialized (channel: ${registrationBotChatId}, also used for password reset DMs)`
        : '[TelegramBot] Registration Bot initialized (token only; use for password reset DMs; set REGISTRATION_TELEGRAM_CHAT_ID for channel notifications)');
} else {
    logger.info('[TelegramBot] Registration Bot not initialized (missing REGISTRATION_TELEGRAM_BOT_TOKEN)');
}

// --- Generic Private Sender Functions ---

const _sendTelegramMessage = async (bot: Telegraf<any> | null, chatId: string | number | undefined, text: string, options: any = {}): Promise<void> => {
    if (MOCK_BOT_ENABLED) {
        logger.debug(`[TelegramBot MOCK] To: ${chatId}, Message: ${text}`);
        return;
    }
    if (!bot || !chatId) {
        logger.warn(`[TelegramBot] SKIPPED (bot not initialized or no chat_id): ${text.substring(0, 100)}...`);
        return;
    }
    try {
        await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error && typeof error.parameters === 'object' && error.parameters && 'retry_after' in error.parameters) {
            const retryAfter = (error.parameters as { retry_after: number }).retry_after;
            logger.warn(`[TelegramBot] Rate limited sending message. Retrying in ${retryAfter}s...`);
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendMessage(chatId, text, { parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            logger.error(`[TelegramBot] Failed to send message to chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};

const _sendTelegramDocument = async (bot: Telegraf<any> | null, chatId: string | number | undefined, filePath: string, caption: string, options: any = {}): Promise<void> => {
    if (MOCK_BOT_ENABLED) {
        logger.debug(`[TelegramBot MOCK] To: ${chatId}, File: ${filePath}`);
        return;
    }
    if (!bot || !chatId) {
        logger.warn(`[TelegramBot] SKIPPED (bot not initialized or no chat_id): Document ${filePath}`);
        return;
    }
    if (!fs.existsSync(filePath)) {
        logger.error(`[TelegramBot] File does not exist, cannot send: ${filePath}`);
        await _sendTelegramMessage(bot, chatId, `File not found. Caption: ${caption}`, { parse_mode: 'HTML' });
        return;
    }
    try {
        await bot.telegram.sendDocument(chatId, { source: filePath }, { caption, parse_mode: options.parse_mode || 'HTML', ...options });
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error && typeof error.parameters === 'object' && error.parameters && 'retry_after' in error.parameters) {
            const retryAfter = (error.parameters as { retry_after: number }).retry_after;
            logger.warn(`[TelegramBot] Rate limited sending document. Retrying in ${retryAfter}s...`);
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendDocument(chatId, { source: filePath }, { caption, parse_mode: options.parse_mode || 'HTML', ...options });
        } else {
            logger.error(`[TelegramBot] Error sending document to chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`);
            await _sendTelegramMessage(bot, chatId, `Failed to send document. Caption: ${caption}`, { parse_mode: 'HTML' });
        }
    }
};

const escapeHtmlForTelegram = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const _sendTelegramDocumentBuffer = async (
    bot: Telegraf<any> | null,
    chatId: string | number | undefined,
    buffer: Buffer,
    filename: string,
    caption: string,
    options: any = {}
): Promise<void> => {
    if (MOCK_BOT_ENABLED) {
        logger.debug(`[TelegramBot MOCK] To: ${chatId}, Buffer doc: ${filename}`);
        return;
    }
    if (!bot || !chatId) {
        logger.warn(`[TelegramBot] SKIPPED (bot not initialized or no chat_id): Document ${filename}`);
        return;
    }
    try {
        await bot.telegram.sendDocument(
            chatId,
            { source: buffer, filename },
            { caption, parse_mode: options.parse_mode || 'HTML', ...options }
        );
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 429 && 'parameters' in error && typeof error.parameters === 'object' && error.parameters && 'retry_after' in error.parameters) {
            const retryAfter = (error.parameters as { retry_after: number }).retry_after;
            logger.warn(`[TelegramBot] Rate limited sending document buffer. Retrying in ${retryAfter}s...`);
            await delay(retryAfter * 1000 + 500);
            await bot.telegram.sendDocument(
                chatId,
                { source: buffer, filename },
                { caption, parse_mode: options.parse_mode || 'HTML', ...options }
            );
        } else {
            logger.error(`[TelegramBot] Error sending buffer document to chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`);
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
    stats: ProductProcessingStats & { duration?: string | number }
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
    message += `Time: ${formatDuration(stats.duration)}`;

    return message;
}


export async function sendSyncSuccessNotification(
    companyId: string,
    companyName: string,
    syncSource: SyncSourceLabel,
    stats: ProductProcessingStats & { duration?: string | number },
    reports: SyncReports | null
): Promise<void> {
    const messageCaption = formatSyncSuccessMessage(companyId, companyName, syncSource, stats);

    if (reports && reports.xlsx) {
        await _sendTelegramDocument(stockBot, stockBotChatId, reports.xlsx, messageCaption, { parse_mode: 'HTML' });
    } else {
        await _sendTelegramMessage(stockBot, stockBotChatId, messageCaption, { parse_mode: 'HTML' });
    }
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

/** Supplier asks to configure FTP stock sync (stock Telegram channel). */
export const sendStockFtpSetupRequestNotification = async (params: {
    companyName: string;
    companyId: string;
    requesterEmail: string;
}): Promise<void> => {
    const text =
        `📬 <b>FTP sync setup request</b>\n\n` +
        `Company: <b>${escapeHtmlForTelegram(params.companyName)}</b>\n` +
        `Company ID: <code>${escapeHtmlForTelegram(params.companyId)}</code>\n` +
        `Requested by: ${escapeHtmlForTelegram(params.requesterEmail)}`;
    await _sendTelegramMessage(stockBot, stockBotChatId, text, { parse_mode: 'HTML' });
};

/** Supplier asks to configure API stock sync; optional config files go to the same stock channel. */
export const sendStockApiSetupRequestNotification = async (params: {
    companyName: string;
    companyId: string;
    requesterEmail: string;
    files: { buffer: Buffer; filename: string }[];
}): Promise<void> => {
    const text =
        `📬 <b>API sync setup request</b>\n\n` +
        `Company: <b>${escapeHtmlForTelegram(params.companyName)}</b>\n` +
        `Company ID: <code>${escapeHtmlForTelegram(params.companyId)}</code>\n` +
        `Requested by: ${escapeHtmlForTelegram(params.requesterEmail)}\n` +
        `Attachments: ${params.files.length}`;
    await _sendTelegramMessage(stockBot, stockBotChatId, text, { parse_mode: 'HTML' });
    for (const f of params.files) {
        const cap = `API config — ${escapeHtmlForTelegram(f.filename)}`;
        await _sendTelegramDocumentBuffer(stockBot, stockBotChatId, f.buffer, f.filename, cap);
    }
};

// --- Function for Logist Chat (LGDEAL logistics: ready for shipment, delivery confirmed) ---

export const sendLogistNotification = (message: string): void => {
    const bot = logistBot || (logistChatId ? dealEventBot : null);
    const chatId = logistChatId;
    if (bot && chatId) {
        bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch((err: unknown) => {
            logger.error(`[TelegramBot] Failed to send logist notification to chat ${chatId}: ${getErrorMessage(err)}`);
        });
    } else if (chatId) {
        logger.warn('[TelegramBot] Logist chat ID set but no bot available; skipping logist notification.');
    }
};

// --- Function for Deal Event Bot ---

export const sendDealEventNotification = (message: string) => {
    if (dealEventBot && dealEventChatId) {
        dealEventBot.telegram.sendMessage(dealEventChatId, message, { parse_mode: 'HTML' }).catch((err: unknown) => {
            logger.error(`[TelegramBot] Failed to send message to chat ${dealEventChatId}: ${getErrorMessage(err)}`);
        });
    } else {
        logger.warn('[TelegramBot] Deal event bot not initialized or chat ID not set.');
    }
};

// --- Function for Deal Status/Stage Changes ---

export interface DealChangeNotificationData {
    dealNumber: string;
    dealId: string;
    oldStatus?: string;
    newStatus?: string;
    oldStage?: string;
    newStage?: string;
    changedBy: string;
    changeType: 'status' | 'stage' | 'both';
    additionalInfo?: string;
    /** Seller company name (for deal channel readability) */
    sellerName?: string;
    /** Buyer company name (for deal channel readability) */
    buyerName?: string;
}

export const sendDealChangeNotification = (data: DealChangeNotificationData): void => {
    try {
        const { dealNumber, oldStatus, newStatus, oldStage, newStage, changedBy, changeType, additionalInfo, sellerName, buyerName } = data;
        const parts: string[] = [];
        parts.push(`🔄 <b>Deal #${dealNumber}</b>`);
        if (buyerName || sellerName) {
            parts.push(`Buyer: ${buyerName || '—'}\nSeller: ${sellerName || '—'}`);
        }
        if (changeType === 'status' || changeType === 'both') {
            const emoji = getStatusEmoji(newStatus);
            parts.push(`${emoji} Status: ${oldStatus || '—'} → ${newStatus}`);
        }
        if (changeType === 'stage' || changeType === 'both') {
            const emoji = getStageEmoji(newStage);
            parts.push(`${emoji} Stage: ${oldStage || '—'} → ${newStage}`);
        }
        parts.push(`By: ${changedBy}`);
        if (additionalInfo) parts.push(additionalInfo);
        sendDealEventNotification(parts.join('\n'));
    } catch (error) {
        logger.error(`[TelegramBot] Failed to send deal change notification:`, { error });
    }
};

// Helper functions for emojis
const getStatusEmoji = (status?: string): string => {
    const statusEmojis: { [key: string]: string } = {
        'pending': '⏳',
        'rejected': '❌',
        'cancelled': '🚫',
        'awaiting_invoice': '📄',
        'invoice_pending': '📋',
        'invoice_accepted': '✅',
        'awaiting_payment': '💳',
        'payment_pending': '⏳',
        'payment_received': '💰',
        'shipped': '📦',
        'delivery_confirmed': '✅',
        'completed': '🎉',
        'alternative_product_proposed': '🔄',
        'awaiting_shipping_documents': '📋',
        'shipping_documents_uploaded': '📄'
    };
    return statusEmojis[status || ''] || '📝';
};

const getStageEmoji = (stage?: string): string => {
    const stageEmojis: { [key: string]: string } = {
        'request': '📝',
        'payment_delivery': '💳',
        'completed': '🎉',
        'cancelled': '🚫'
    };
    return stageEmojis[stage || ''] || '📝';
};

// --- Functions for Registration Bot ---

export interface RegistrationNotificationData {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    companyName?: string;
    companyRole?: string;
    role: string;
    registrationDate: Date;
    ipAddress?: string;
    userAgent?: string;
}

export const sendRegistrationNotification = async (data: RegistrationNotificationData): Promise<void> => {
    const message = formatRegistrationMessage(data);
    await _sendTelegramMessage(registrationBot, registrationBotChatId, message, { parse_mode: 'HTML' });
};

function formatRegistrationMessage(data: RegistrationNotificationData): string {
    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    let message = `🆕 <b>New User Registration</b>\n\n`;
    message += `👤 <b>User:</b>\n`;
    message += `• Name: ${data.firstName} ${data.lastName}\n`;
    message += `• Email: ${data.email}\n`;
    message += `• Phone: ${data.phone}\n`;
    message += `• User Role: ${data.role}\n`;
    
    if (data.companyName) {
        message += `• Company: ${data.companyName}\n`;
        if (data.companyRole) {
            message += `• Company Role: ${data.companyRole}\n`;
        }
    }
    
    message += `\n📅 <b>Registration Time:</b> ${timestamp}\n`;
    
    if (data.ipAddress) {
        message += `🌐 <b>IP Address:</b> ${data.ipAddress}\n`;
    }
    
    if (data.userAgent) {
        const browser = extractBrowserInfo(data.userAgent);
        message += `🔍 <b>Browser:</b> ${browser}\n`;
    }
    
    return message;
}

function extractBrowserInfo(userAgent: string): string {
    // Simple browser information extraction
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown Browser';
}

export interface DemoRequestNotificationData {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company?: string;
    message?: string;
}

export const sendDemoRequestNotification = async (data: DemoRequestNotificationData): Promise<void> => {
    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    let message = `📋 <b>Request a Demo</b>\n\n`;
    message += `👤 <b>Contact:</b>\n`;
    message += `• Name: ${data.firstName} ${data.lastName}\n`;
    message += `• Email: ${data.email}\n`;
    message += `• Phone: ${data.phone}\n`;
    if (data.company) {
        message += `• Company: ${data.company}\n`;
    }
    if (data.message) {
        message += `\n💬 <b>Message:</b>\n${data.message}\n`;
    }
    message += `\n📅 <b>Time:</b> ${timestamp}\n`;

    await _sendTelegramMessage(registrationBot, registrationBotChatId, message, { parse_mode: 'HTML' });
};

/**
 * Sends password reset link to a user's Telegram (DM).
 * Uses the same Registration Bot (REGISTRATION_TELEGRAM_BOT_TOKEN). User must have started the bot (telegramId = their chat_id).
 */
export const sendPasswordResetToUser = async (telegramChatId: string, firstName: string, resetUrl: string): Promise<void> => {
    const message = `🔐 <b>Password Reset – LGDeal</b>\n\nHello ${firstName}!\n\nWe received a request to reset the password for your LGDeal account.\n\n👉 <a href="${resetUrl}">Reset password</a>\n\nThis link is valid for 1 hour.\nIf you didn't request this, please ignore this message.`;
    logger.info('[TelegramBot] Sending password reset DM', { chatId: telegramChatId });
    await _sendTelegramMessage(registrationBot, telegramChatId, message, { parse_mode: 'HTML' });
};

/**
 * Sends a deal event notification to a user's personal Telegram chat (DM).
 * Reuses the registration bot token — the same bot the user already linked
 * via "Link Telegram" in their account settings (chat_id stored in `user.telegramId`).
 *
 * Falls back silently if the bot is not configured or the user revoked access.
 */
export const sendDealEventToUserDM = async (
    telegramChatId: string,
    payload: { title: string; message: string; dealNumber?: string; actionUrl?: string }
): Promise<void> => {
    const escape = (s: string) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const dealRef = payload.dealNumber ? ` #${escape(payload.dealNumber)}` : '';
    const cta = payload.actionUrl
        ? `\n\n<a href="${payload.actionUrl}">Open deal${dealRef}</a>`
        : '';
    const text = `🔔 <b>${escape(payload.title)}</b>\n\n${escape(payload.message)}${cta}`;
    await _sendTelegramMessage(registrationBot, telegramChatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });
};
