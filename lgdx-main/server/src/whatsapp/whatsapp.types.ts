/**
 * Meta WhatsApp Cloud API — minimal webhook shapes we use.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

/** Transport: official Cloud API vs Baileys (unofficial). */
export type WhatsAppChannel = 'cloud' | 'baileys';

export const WHATSAPP_CHANNEL_CLOUD: WhatsAppChannel = 'cloud';
export const WHATSAPP_CHANNEL_BAILEYS: WhatsAppChannel = 'baileys';

export function parseWhatsAppChannel(raw: string | undefined | null): WhatsAppChannel | null {
  if (raw === 'cloud' || raw === 'baileys') return raw;
  return null;
}

/** Exactly one transport may run marketing auto-reply at a time, or off. */
export type WhatsAppGlobalAutoReplyMode = 'off' | 'cloud' | 'baileys';

export function parseWhatsAppGlobalAutoReplyMode(raw: string | undefined | null): WhatsAppGlobalAutoReplyMode | null {
  if (raw === 'off' || raw === 'cloud' || raw === 'baileys') return raw;
  return null;
}

export interface WhatsAppTextBody {
  body: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: WhatsAppTextBody;
}

export interface WhatsAppIncomingMessagePayload {
  /** Which transport this message belongs to (separate Redis namespaces). Defaults to cloud. */
  channel?: WhatsAppChannel;
  waId: string;
  messageId: string;
  text: string;
  /** Unix seconds from Meta or local */
  timestampSec: number;
  /**
   * Baileys only: JID to use for sendMessage (same chat as inbound). Required for @lid chats —
   * rebuilding from waId digits would target the wrong @s.whatsapp.net peer.
   */
  baileysRemoteJid?: string;
  /** Set when published to RabbitMQ — used to measure queue wait in the Cloud worker. */
  enqueuedAtMs?: number;
}

export interface WhatsAppWebhookChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppIncomingMessage[];
  statuses?: unknown[];
}

export interface WhatsAppWebhookEntry {
  id?: string;
  changes?: Array<{
    field?: string;
    value?: WhatsAppWebhookChangeValue;
  }>;
}

export interface WhatsAppWebhookBody {
  object?: string;
  entry?: WhatsAppWebhookEntry[];
}
