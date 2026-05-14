import type { WhatsAppChannel } from './whatsapp.types';
import { WHATSAPP_CHANNEL_CLOUD } from './whatsapp.types';
import { sendWhatsAppTextMessage, markWhatsAppMessageAsReadCloud, type SendTextResult } from './whatsappGraph.service';

export type BaileysOutboundMeta = { messageId?: string };

export type BaileysTextSender = (
  waId: string,
  text: string,
  baileysRemoteJid?: string,
  meta?: BaileysOutboundMeta
) => Promise<SendTextResult>;
export type BaileysReadMarker = (messageId: string, baileysRemoteJid?: string) => Promise<boolean>;

let baileysSender: BaileysTextSender | null = null;
let baileysReadMarker: BaileysReadMarker | null = null;

/**
 * Baileys worker registers this so processWhatsAppIncomingJob can send via the active socket.
 */
export function registerBaileysOutboundSender(sender: BaileysTextSender | null): void {
  baileysSender = sender;
}

/**
 * Route outbound text to Meta Graph (cloud) or Baileys socket (baileys process only).
 */
export async function sendWhatsAppOutbound(
  channel: WhatsAppChannel,
  waId: string,
  text: string,
  baileysRemoteJid?: string,
  meta?: BaileysOutboundMeta
): Promise<SendTextResult> {
  if (channel === WHATSAPP_CHANNEL_CLOUD) {
    return sendWhatsAppTextMessage(waId, text, meta);
  }
  if (!baileysSender) {
    return { ok: false, error: 'baileys_sender_not_registered' };
  }
  return baileysSender(waId, text, baileysRemoteJid, meta);
}

export function registerBaileysReadMarker(marker: BaileysReadMarker | null): void {
  baileysReadMarker = marker;
}

export async function markWhatsAppMessageAsRead(
  channel: WhatsAppChannel,
  messageId: string,
  baileysRemoteJid?: string
): Promise<boolean> {
  if (channel === WHATSAPP_CHANNEL_CLOUD) {
    return markWhatsAppMessageAsReadCloud(messageId);
  }
  if (!baileysReadMarker || !baileysRemoteJid) {
    return false;
  }
  return baileysReadMarker(messageId, baileysRemoteJid);
}
