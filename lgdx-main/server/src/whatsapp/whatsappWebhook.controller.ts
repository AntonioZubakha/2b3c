import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  getWhatsAppVerifyToken,
  isWhatsAppIntegrationEnabled
} from './whatsappConfig';
import { verifyMetaWebhookSignature } from './whatsappSignature';
import type { WhatsAppWebhookBody } from './whatsapp.types';
import { WHATSAPP_CHANNEL_CLOUD } from './whatsapp.types';
import { publishWhatsAppIncomingTask } from '../services/messageBroker';
import { processWhatsAppIncomingJob } from './whatsappJob.processor';

const ARE_MICROSERVICES_LIVE = process.env.ARE_MICROSERVICES_LIVE === 'true';

function disabled(res: Response): void {
  res.status(503).json({ message: 'WhatsApp integration disabled' });
}

/**
 * GET — Meta webhook verification.
 */
export function whatsAppWebhookVerify(req: Request, res: Response): void {
  if (!isWhatsAppIntegrationEnabled()) {
    disabled(res);
    return;
  }

  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;
  const expected = getWhatsAppVerifyToken();

  if (mode === 'subscribe' && token && expected && token === expected && challenge) {
    logger.debug('[WhatsApp] Webhook verified');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('[WhatsApp] Webhook verification failed', { mode, hasToken: !!token });
  res.status(403).json({ message: 'Verification failed' });
}

/**
 * POST — inbound notifications; must respond quickly with 200.
 */
export function whatsAppWebhookPost(req: Request, res: Response): void {
  if (!isWhatsAppIntegrationEnabled()) {
    disabled(res);
    return;
  }

  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw)) {
    logger.error('[WhatsApp] Expected raw body buffer');
    res.status(400).json({ message: 'Invalid body' });
    return;
  }

  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (!verifyMetaWebhookSignature(raw, sig)) {
    logger.warn('[WhatsApp] Invalid webhook signature');
    res.status(403).json({ message: 'Invalid signature' });
    return;
  }

  let body: WhatsAppWebhookBody;
  try {
    body = JSON.parse(raw.toString('utf8')) as WhatsAppWebhookBody;
  } catch {
    res.status(400).json({ message: 'Invalid JSON' });
    return;
  }

  res.status(200).json({ ok: true });

  void processWebhookBody(body).catch((err) => {
    logger.error('[WhatsApp] Post-process error', { err });
  });
}

async function processWebhookBody(body: WhatsAppWebhookBody): Promise<void> {
  if (body.object !== 'whatsapp_business_account') {
    return;
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value?.messages?.length) {
        continue;
      }

      for (const msg of value.messages) {
        const from = msg.from;
        const id = msg.id;
        if (!from || !id) continue;

        if (msg.type !== 'text' || !msg.text?.body) {
          logger.debug('[WhatsApp] Ignoring non-text message', { type: msg.type, id });
          continue;
        }

        const textBody = msg.text.body.trim();
        if (!textBody) {
          continue;
        }

        const ts = parseInt(msg.timestamp, 10) || Math.floor(Date.now() / 1000);
        const payload = {
          channel: WHATSAPP_CHANNEL_CLOUD,
          waId: from,
          messageId: id,
          text: textBody,
          timestampSec: ts
        };

        if (!ARE_MICROSERVICES_LIVE) {
          setImmediate(() => {
            processWhatsAppIncomingJob(payload).catch((err) =>
              logger.error('[WhatsApp] Inline job failed', { err })
            );
          });
        } else {
          await publishWhatsAppIncomingTask(payload);
        }
      }
    }
  }
}
