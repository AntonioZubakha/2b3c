/** Inbound / Redis identity for a private Telegram user (numeric id as string). */
export type TelegramUserPeerId = string;

export type TelegramUserGlobalAutoReplyMode = 'off' | 'user';

export type TelegramUserConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type TelegramUserIncomingPayload = {
  peerId: TelegramUserPeerId;
  messageId: string;
  text: string;
  timestampSec: number;
};

export type TelegramUserOutboundJob = {
  peerId: TelegramUserPeerId;
  text: string;
  enqueuedAt: number;
};

export type TelegramUserAdminCommand = 'reset';
