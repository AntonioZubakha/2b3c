/**
 * Outbound transactional WhatsApp notifications for app users (e.g. "you got a new deal").
 *
 * Channel selection:
 * - Baileys (preferred) — already wired up via Redis queue (`enqueueBaileysOutbound`)
 *   and consumed by the dedicated worker process. Free, no template approval.
 * - Cloud API — fallback if Baileys is disabled. Note: Meta requires pre-approved
 *   message templates for business-initiated outbound, so plain text may be
 *   rejected outside the 24h customer-service window. We attempt anyway and
 *   log on failure so ops can switch to Baileys.
 *
 * Phone normalization piggy-backs on `normalizeWaId` (digits-only E.164).
 */
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { normalizeWaId } from './whatsappWaId.utils';
import { isWhatsAppBaileysEnabled, isWhatsAppIntegrationEnabled } from './whatsappConfig';
import { enqueueBaileysOutbound } from './whatsappRedis.service';
import { sendWhatsAppTextMessage } from './whatsappGraph.service';

/** Strict E.164-ish: leading non-zero digit, 8-15 digits total. */
function isValidWaId(waId: string): boolean {
  return /^[1-9]\d{7,14}$/.test(waId);
}

function buildText(payload: {
  title: string;
  message: string;
  dealNumber?: string;
  actionUrl?: string;
}): string {
  const dealRef = payload.dealNumber ? ` #${payload.dealNumber}` : '';
  const cta = payload.actionUrl ? `\n\n${payload.actionUrl}` : '';
  return `*${payload.title}*${dealRef}\n\n${payload.message}${cta}`;
}

/**
 * Send a transactional WhatsApp notification to a user's phone.
 * Never throws. Returns true if the message was queued/sent, false otherwise.
 */
export async function sendDealEventViaWhatsApp(
  rawPhone: string,
  payload: { title: string; message: string; dealNumber?: string; actionUrl?: string }
): Promise<boolean> {
  try {
    const waId = normalizeWaId(rawPhone);
    if (!isValidWaId(waId)) {
      logger.debug('[WhatsAppTx] Skipped — invalid WA id', { waId });
      return false;
    }

    const text = buildText(payload);

    if (isWhatsAppBaileysEnabled()) {
      await enqueueBaileysOutbound({ waId, text });
      logger.info('[WhatsAppTx] Baileys outbound enqueued', { waId, dealNumber: payload.dealNumber });
      return true;
    }

    if (isWhatsAppIntegrationEnabled()) {
      const result = await sendWhatsAppTextMessage(waId, text);
      if (!result.ok) {
        logger.warn('[WhatsAppTx] Cloud send failed', {
          waId,
          dealNumber: payload.dealNumber,
          error: result.error
        });
        return false;
      }
      return true;
    }

    logger.debug('[WhatsAppTx] Skipped — no WhatsApp channel enabled');
    return false;
  } catch (err) {
    logger.warn('[WhatsAppTx] Unexpected failure', { error: getErrorMessage(err) });
    return false;
  }
}
