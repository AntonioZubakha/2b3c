import { performance } from 'node:perf_hooks';
import { logger } from '../utils/logger';
import { getWhatsAppAccessToken, getWhatsAppGraphApiVersion, getWhatsAppPhoneNumberId } from './whatsappConfig';
import { isWhatsAppTimingEnabled, waIdPrefixForLog } from './whatsappPipelineTiming';

export interface SendTextResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a WhatsApp text message via Cloud API.
 */
export async function sendWhatsAppTextMessage(
  toWaId: string,
  body: string,
  meta?: { messageId?: string }
): Promise<SendTextResult> {
  const token = getWhatsAppAccessToken();
  const phoneId = getWhatsAppPhoneNumberId();
  const version = getWhatsAppGraphApiVersion();

  if (!token || !phoneId) {
    logger.error('[WhatsAppGraph] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return { ok: false, error: 'not_configured' };
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toWaId.replace(/\D/g, ''),
    type: 'text',
    text: { preview_url: true, body }
  };

  try {
    const t0 = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const t1 = performance.now();
    const text = await res.text();
    const t2 = performance.now();
    if (isWhatsAppTimingEnabled()) {
      logger.info('[WhatsAppTiming]', {
        phase: 'cloud_graph_send_http',
        inboundMessageId: meta?.messageId,
        waIdPrefix: waIdPrefixForLog(toWaId),
        fetchMs: Math.round(t1 - t0),
        readBodyMs: Math.round(t2 - t1),
        httpStatus: res.status
      });
    }
    if (!res.ok) {
      logger.error('[WhatsAppGraph] Send failed', { status: res.status, body: text.slice(0, 500) });
      return { ok: false, error: `http_${res.status}` };
    }

    let parsed: { messages?: { id?: string }[] } = {};
    try {
      parsed = JSON.parse(text) as { messages?: { id?: string }[] };
    } catch {
      /* ignore */
    }
    const messageId = parsed.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (err) {
    logger.error('[WhatsAppGraph] Send error', { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'network' };
  }
}

/**
 * Mark a WhatsApp message as read via Cloud API.
 */
export async function markWhatsAppMessageAsReadCloud(messageId: string): Promise<boolean> {
  const token = getWhatsAppAccessToken();
  const phoneId = getWhatsAppPhoneNumberId();
  const version = getWhatsAppGraphApiVersion();

  if (!token || !phoneId || !messageId) {
    return false;
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  };

  try {
    const t0 = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const t1 = performance.now();
    const bodyText = res.ok ? '' : await res.text();
    const t2 = performance.now();
    if (isWhatsAppTimingEnabled()) {
      logger.info('[WhatsAppTiming]', {
        phase: 'cloud_graph_mark_read_http',
        messageId,
        fetchMs: Math.round(t1 - t0),
        readBodyMs: res.ok ? 0 : Math.round(t2 - t1),
        httpStatus: res.status,
        ok: res.ok
      });
    }
    if (!res.ok) {
      logger.warn('[WhatsAppGraph] Mark read failed', { status: res.status, body: bodyText.slice(0, 300) });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[WhatsAppGraph] Mark read error', { err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
