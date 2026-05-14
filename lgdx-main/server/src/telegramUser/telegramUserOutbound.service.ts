import { logger } from '../utils/logger';

export type SendTelegramUserTextResult = { ok: true } | { ok: false; error: string };

type TelegramUserSender = (
  peerId: string,
  text: string,
  meta?: { messageId?: string }
) => Promise<SendTelegramUserTextResult>;

let sender: TelegramUserSender | null = null;

export function registerTelegramUserOutboundSender(fn: TelegramUserSender | null): void {
  sender = fn;
}

export async function sendTelegramUserOutbound(
  peerId: string,
  text: string,
  meta?: { messageId?: string }
): Promise<SendTelegramUserTextResult> {
  if (!sender) {
    return { ok: false, error: 'telegram_user_sender_not_registered' };
  }
  return sender(peerId, text, meta);
}
