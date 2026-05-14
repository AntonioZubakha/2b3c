import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getWhatsAppAppSecret } from './whatsappConfig';

/**
 * Verify X-Hub-Signature-256 (Meta webhook HMAC-SHA256 of raw body).
 */
export function verifyMetaWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const appSecret = getWhatsAppAppSecret();
  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[WhatsApp] WHATSAPP_APP_SECRET not set in production — rejecting webhook');
      return false;
    }
    logger.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature verification (non-production)');
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = signatureHeader.slice('sha256='.length);
  const expected = Buffer.from(expectedHex, 'hex');
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const digest = hmac.digest();
  if (digest.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(digest, expected);
}
