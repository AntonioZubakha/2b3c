import { Telegraf } from 'telegraf';
import fs from 'fs';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { chatSystemInfo, chatSystemWarn } from '../utils/chatSystemLogger';

// Helper function to read secrets from files or environment variables
const getSecretFromFile = (envVar: string): string | undefined => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error(`[TelegramService] Failed to read ${envVar}_FILE:`, { error: e });
    }
  }
  return process.env[envVar];
};

// System monitoring bot for chat notifications
const systemBotToken = getSecretFromFile('SYSTEM_MONITORING_BOT_TOKEN');
const systemBotChatId = getSecretFromFile('SYSTEM_MONITORING_CHAT_ID');
let systemBot: Telegraf<any> | null = null;

if (systemBotToken && systemBotChatId) {
  systemBot = new Telegraf(systemBotToken);
  logger.info(`[TelegramService] System Monitoring Bot initialized for chat ID: ${systemBotChatId}`);
} else {
  logger.info('[TelegramService] System Monitoring Bot not initialized (missing SYSTEM_MONITORING_BOT_TOKEN or SYSTEM_MONITORING_CHAT_ID)');
}

// Registration bot for user notifications
const registrationBotToken = getSecretFromFile('REGISTRATION_TELEGRAM_BOT_TOKEN');
const registrationBotChatId = getSecretFromFile('REGISTRATION_TELEGRAM_CHAT_ID');
let registrationBot: Telegraf<any> | null = null;

if (registrationBotToken && registrationBotChatId) {
  registrationBot = new Telegraf(registrationBotToken);
  logger.info(`[TelegramService] Registration Bot initialized for chat ID: ${registrationBotChatId}`);
} else {
  logger.info('[TelegramService] Registration Bot not initialized (missing REGISTRATION_TELEGRAM_BOT_TOKEN or REGISTRATION_TELEGRAM_CHAT_ID)');
}

// Chat channel bot for duplicating all chat messages
const chatBotToken = getSecretFromFile('CHAT_TELEGRAM_BOT_TOKEN');
const chatBotChatId = getSecretFromFile('CHAT_TELEGRAM_CHAT_ID');
let chatBot: Telegraf<any> | null = null;

if (chatBotToken && chatBotChatId) {
  chatBot = new Telegraf(chatBotToken);
  logger.info(`[TelegramService] Chat Channel Bot initialized for chat ID: ${chatBotChatId}`);
} else {
  logger.info('[TelegramService] Chat Channel Bot not initialized (missing CHAT_TELEGRAM_BOT_TOKEN or CHAT_TELEGRAM_CHAT_ID)');
}

export interface TelegramNotificationOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

/**
 * Send a Telegram notification to the specified bot
 * @param message - The message to send
 * @param botType - Type of bot to use ('system_monitoring' | 'registration')
 * @param options - Additional options for the message
 */
export async function sendTelegramNotification(
  message: string, 
  botType: 'system_monitoring' | 'registration' | 'chat_channel' = 'system_monitoring',
  options: TelegramNotificationOptions = {}
): Promise<boolean> {
  try {
    let bot: Telegraf<any> | null = null;
    let chatId: string | undefined;

    switch (botType) {
      case 'system_monitoring':
        bot = systemBot;
        chatId = systemBotChatId;
        break;
      case 'registration':
        bot = registrationBot;
        chatId = registrationBotChatId;
        break;
      case 'chat_channel':
        bot = chatBot;
        chatId = chatBotChatId;
        break;
      default:
        logger.error(`[TelegramService] Unknown bot type: ${botType}`);
        return false;
    }

    if (!bot || !chatId) {
      logger.warn(`[TelegramService] Bot or chat ID not available for type: ${botType}`);
      return false;
    }

    // Truncate message if too long (Telegram limit is 4096 characters)
    const truncatedMessage = message.length > 4000 ? message.substring(0, 4000) + '...' : message;

    await bot.telegram.sendMessage(chatId, truncatedMessage, {
      parse_mode: options.parseMode || 'HTML',
      disable_notification: options.disableNotification || false
    });

    logger.info(`[TelegramService] Message sent successfully to ${botType} bot`);
    return true;
  } catch (error: unknown) {
    logger.error(`[TelegramService] Failed to send message to ${botType} bot:`, {
      error: getErrorMessage(error),
      code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
      response: error && typeof error === 'object' && 'response' in error ? error.response : undefined
    });
    return false;
  }
}

/**
 * Send a formatted chat notification to support team
 * @param title - Notification title
 * @param details - Additional details
 * @param sessionId - Chat session ID
 * @param priority - Message priority
 */
export async function sendChatNotification(
  title: string,
  details: string,
  sessionId: string,
  priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
): Promise<boolean> {
  const priorityEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    urgent: '🔴'
  };

  const message = `${priorityEmoji[priority]} <b>${title}</b>\n\n` +
    `${details}\n\n` +
    `🔗 <b>Session ID:</b> <code>${sessionId}</code>\n` +
    `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

  return await sendTelegramNotification(message, 'system_monitoring', {
    parseMode: 'HTML',
    disableWebPagePreview: true
  });
}

/**
 * Send a new chat session notification
 * @param userInfo - User information
 * @param sessionId - Chat session ID
 * @param metadata - Session metadata
 */
export async function sendNewChatNotification(
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    companyName?: string;
  },
  sessionId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    pageUrl?: string;
  }
): Promise<boolean> {
  const message = `🆕 <b>New Chat Session Started</b>\n\n` +
    `👤 <b>User:</b> ${userInfo.firstName} ${userInfo.lastName}\n` +
    `📧 <b>Email:</b> ${userInfo.email}\n` +
    `🏢 <b>Company:</b> ${userInfo.companyName || 'N/A'}\n` +
    `🌐 <b>Page:</b> ${metadata?.pageUrl || 'Unknown'}\n` +
    `🔗 <b>Session ID:</b> <code>${sessionId}</code>\n` +
    `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

  const ok = await sendTelegramNotification(message, 'chat_channel', {
    parseMode: 'HTML',
    disableWebPagePreview: true
  });
  if (ok) {
    chatSystemInfo('telegram.new_chat.sent', { channel: 'telegram', sessionId });
  } else {
    chatSystemWarn('telegram.new_chat.not_sent', { channel: 'telegram', sessionId });
  }
  return ok;
}

/**
 * Send a new message notification
 * @param userInfo - User information
 * @param messageText - The message text
 * @param sessionId - Chat session ID
 * @param isFromUser - Whether the message is from user or support
 */
export async function sendMessageNotification(
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    companyName?: string;
  },
  messageText: string,
  sessionId: string,
  isFromUser: boolean = true
): Promise<boolean> {
  const emoji = isFromUser ? '💬' : '👨‍💼';
  const sender = isFromUser ? 'User' : 'Support';
  
  const truncatedMessage = messageText.length > 200 ? 
    messageText.substring(0, 200) + '...' : messageText;

  const message = `${emoji} <b>New Message from ${sender}</b>\n\n` +
    `👤 <b>User:</b> ${userInfo.firstName} ${userInfo.lastName}\n` +
    `📧 <b>Email:</b> ${userInfo.email}\n` +
    `🏢 <b>Company:</b> ${userInfo.companyName || 'N/A'}\n` +
    `💭 <b>Message:</b> ${truncatedMessage}\n` +
    `🔗 <b>Session ID:</b> <code>${sessionId}</code>\n` +
    `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

  return await sendTelegramNotification(message, 'chat_channel', {
    parseMode: 'HTML',
    disableWebPagePreview: true
  });
}

/**
 * Send a chat session status update
 * @param sessionId - Chat session ID
 * @param status - New status
 * @param assignedTo - Who it's assigned to (if any)
 */
export async function sendSessionStatusNotification(
  sessionId: string,
  status: 'active' | 'waiting' | 'closed',
  assignedTo?: string
): Promise<boolean> {
  const statusEmoji = {
    active: '✅',
    waiting: '⏳',
    closed: '🔒'
  };

  const statusText = {
    active: 'Active',
    waiting: 'Waiting',
    closed: 'Closed'
  };

  let message = `${statusEmoji[status]} <b>Chat Session ${statusText[status]}</b>\n\n` +
    `🔗 <b>Session ID:</b> <code>${sessionId}</code>\n`;

  if (assignedTo) {
    message += `👨‍💼 <b>Assigned to:</b> ${assignedTo}\n`;
  }

  message += `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

  return await sendTelegramNotification(message, 'chat_channel', {
    parseMode: 'HTML',
    disableWebPagePreview: true
  });
}

/**
 * Send a message to the chat channel (duplicate all chat messages)
 * @param userInfo - User information
 * @param messageText - The message text
 * @param sessionId - Chat session ID
 * @param sender - Who sent the message ('user' or 'support')
 * @param senderName - Name of the sender (for support messages)
 */
export async function sendChatChannelMessage(
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    companyName?: string;
  },
  messageText: string,
  sessionId: string,
  sender: 'user' | 'support',
  senderName?: string
): Promise<boolean> {
  const emoji = sender === 'user' ? '👤' : '👨‍💼';
  const senderLabel = sender === 'user' ? 'User' : (senderName || 'Support');
  
  const truncatedMessage = messageText.length > 300 ? 
    messageText.substring(0, 300) + '...' : messageText;

  let message = `${emoji} <b>${senderLabel}</b>\n\n`;
  
  if (sender === 'user') {
    message += `👤 <b>User:</b> ${userInfo.firstName} ${userInfo.lastName}\n`;
    message += `📧 <b>Email:</b> ${userInfo.email}\n`;
    message += `🏢 <b>Company:</b> ${userInfo.companyName || 'N/A'}\n`;
  } else {
    message += `👨‍💼 <b>Support Agent:</b> ${senderName || 'Support'}\n`;
    message += `👤 <b>To User:</b> ${userInfo.firstName} ${userInfo.lastName}\n`;
    message += `🏢 <b>User Company:</b> ${userInfo.companyName || 'N/A'}\n`;
  }
  
  message += `💭 <b>Message:</b> ${truncatedMessage}\n`;
  message += `🔗 <b>Session ID:</b> <code>${sessionId}</code>\n`;
  message += `⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

  chatSystemInfo('telegram.chat_channel.outbound', {
    channel: 'telegram',
    sessionId,
    sender,
    senderName: senderName || null,
    textLen: (messageText || '').length
  });
  const ok = await sendTelegramNotification(message, 'chat_channel', {
    parseMode: 'HTML',
    disableWebPagePreview: true
  });
  if (!ok) {
    chatSystemWarn('telegram.chat_channel.not_sent', { channel: 'telegram', sessionId, sender });
  }
  return ok;
}

export default {
  sendTelegramNotification,
  sendChatNotification,
  sendNewChatNotification,
  sendMessageNotification,
  sendSessionStatusNotification,
  sendChatChannelMessage
};
