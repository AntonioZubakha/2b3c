/**
 * Telegram user account (MTProto) — one process, one phone session. GramJS.
 * Run: node dist/telegramUser/telegramUserWorker.js
 */
import fs from 'fs';
import path from 'path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import bigInt from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import type { NewMessageEvent } from 'telegram/events';
import type { RedisClientType } from 'redis';
import { initializeRedisClient } from '../config/redis';
import { connectWorkerMongo } from '../config/mongo';
import { logger } from '../utils/logger';
import { getWhatsAppMarketingSystemPrompt } from '../whatsapp/whatsappConfig';
import { processTelegramUserIncomingJob } from './telegramUserJob.processor';
import { registerTelegramUserOutboundSender } from './telegramUserOutbound.service';
import type { SendTelegramUserTextResult } from './telegramUserOutbound.service';
import {
  appendTelegramUserChatMessage,
  clearTelegramUserQrLoginUrl,
  LOGIN_PASSWORD,
  setTelegramUserQrLoginUrl,
  setTelegramUserSessionState,
  TELEGRAM_USER_ADMIN_CMD_QUEUE,
  TELEGRAM_USER_OUTBOUND_QUEUE
} from './telegramUserRedis.service';
import type { TelegramUserOutboundJob } from './telegramUser.types';
import {
  getTelegramApiHash,
  getTelegramApiId,
  getTelegramUserSessionFilePath,
  isTelegramUserClientEnabled
} from './telegramUserConfig';
import { isWhatsAppTimingEnabled, waIdPrefixForLog } from '../whatsapp/whatsappPipelineTiming';

dotenv.config();

let clientRef: TelegramClient | null = null;
let abortLoops = false;

function readSessionString(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  } catch (e) {
    logger.warn('[TelegramUser] Failed to read session file', { e });
  }
  return '';
}

function persistSession(client: TelegramClient, filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const s = client.session;
    if (s && typeof (s as StringSession).save === 'function') {
      fs.writeFileSync(filePath, (s as StringSession).save(), 'utf8');
    }
  } catch (e) {
    logger.error('[TelegramUser] persistSession failed', { e });
  }
}

async function blpopText(
  r: RedisClientType,
  listKey: string,
  timeoutSec: number
): Promise<string | null> {
  const res = await r.blPop([listKey], timeoutSec);
  if (!res) return null;
  const el = (res as { element?: string }).element;
  return typeof el === 'string' && el.trim() ? el.trim() : null;
}

function registerOutboundFromClient(client: TelegramClient): void {
  registerTelegramUserOutboundSender(
    async (peerId: string, text: string, _meta): Promise<SendTelegramUserTextResult> => {
      const c = clientRef;
      if (!c) {
        return { ok: false, error: 'not_connected' };
      }
      try {
        const id = String(peerId).replace(/\D/g, '');
        await c.sendMessage(bigInt(id), { message: text });
        return { ok: true };
      } catch (err) {
        logger.error('[TelegramUser] Outbound send failed', { err });
        return { ok: false, error: 'send_failed' };
      }
    }
  );
}

async function forceRelink(): Promise<void> {
  logger.warn('[TelegramUser] Admin requested relink (drop session)');
  try {
    await clearTelegramUserQrLoginUrl();
  } catch {
    /* */
  }
  try {
    await setTelegramUserSessionState('disconnected', 'Session cleared. Sign in again from admin.');
  } catch {
    /* */
  }
  try {
    await clientRef?.disconnect();
  } catch {
    /* */
  }
  clientRef = null;
  registerTelegramUserOutboundSender(null);
  const sessionFile = getTelegramUserSessionFilePath();
  try {
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
  } catch (e) {
    logger.error('[TelegramUser] Failed to remove session file', { e });
  }
  void connectSingleflight();
}

let connectInFlight: Promise<void> | null = null;
async function connectSingleflight(): Promise<void> {
  if (connectInFlight) {
    return connectInFlight;
  }
  connectInFlight = (async () => {
    try {
      await runTelegramClient();
    } finally {
      connectInFlight = null;
    }
  })();
  return connectInFlight;
}

function extractPeerIdFromMessage(m: Api.Message): string | null {
  const peer = m.peerId;
  if (!peer || peer.className !== 'PeerUser') {
    return null;
  }
  return peer.userId.toString();
}

async function onInboundMessage(_client: TelegramClient, event: NewMessageEvent): Promise<void> {
  const m = event.message;
  if (!m || m.out) {
    return;
  }
  const textRaw = 'message' in m && m.message ? m.message : '';
  if (!textRaw || !String(textRaw).trim()) {
    return;
  }
  const peerId = extractPeerIdFromMessage(m);
  if (!peerId || peerId.length < 2) {
    return;
  }
  const messageId = `${peerId}:${m.id}`;
  const ts = m.date ?? Math.floor(Date.now() / 1000);
  if (isWhatsAppTimingEnabled()) {
    logger.info('[WhatsAppTiming]', {
      phase: 'telegram_user_inbound',
      messageId,
      waIdPrefix: waIdPrefixForLog(peerId),
      textChars: String(textRaw).trim().length
    });
  }
  try {
    await processTelegramUserIncomingJob({
      peerId,
      messageId,
      text: String(textRaw).trim(),
      timestampSec: ts
    });
  } catch (err) {
    logger.error('[TelegramUser] Inbound job failed', { err, peerId, messageId });
  }
}

async function runAdminCommandQueueConsumer(redis: RedisClientType): Promise<void> {
  while (!abortLoops) {
    try {
      const res = await redis.blPop([TELEGRAM_USER_ADMIN_CMD_QUEUE], 5);
      if (!res) continue;
      const cmd = String((res as { element?: string }).element || '').trim();
      if (cmd === 'reset') {
        await forceRelink();
      }
    } catch (e) {
      logger.error('[TelegramUser] Admin command loop error', { err: e });
    }
  }
}

async function runOutboundConsumer(redis: RedisClientType): Promise<void> {
  while (!abortLoops) {
    try {
      const res = await redis.blPop([TELEGRAM_USER_OUTBOUND_QUEUE], 5);
      if (!res) continue;
      const raw = (res as { element?: string }).element;
      if (!raw) continue;
      let job: TelegramUserOutboundJob;
      try {
        job = JSON.parse(raw) as TelegramUserOutboundJob;
      } catch {
        logger.error('[TelegramUser] Bad outbound JSON');
        continue;
      }
      const { peerId, text } = job;
      const norm = String(peerId || '').replace(/\D/g, '');
      if (!norm || !text?.trim()) continue;
      const client = clientRef;
      if (!client) {
        await redis.rPush(TELEGRAM_USER_OUTBOUND_QUEUE, raw);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const t0 = performance.now();
      try {
        await client.sendMessage(bigInt(norm), { message: text.trim() });
        const t1 = performance.now();
        if (isWhatsAppTimingEnabled()) {
          logger.info('[WhatsAppTiming]', {
            phase: 'telegram_user_admin_outbound',
            waIdPrefix: waIdPrefixForLog(norm),
            sendMessageMs: Math.round(t1 - t0)
          });
        }
        await appendTelegramUserChatMessage(
          norm,
          { role: 'assistant', content: text.trim() },
          { source: 'admin' }
        );
      } catch (e) {
        logger.error('[TelegramUser] Outbound send failed', {
          peerId: norm,
          err: e instanceof Error ? e.message : String(e)
        });
      }
    } catch (e) {
      logger.error('[TelegramUser] Outbound loop error', { err: e });
    }
  }
}

async function runTelegramClient(): Promise<void> {
  const apiId = getTelegramApiId();
  const apiHash = getTelegramApiHash();
  const sessionFile = getTelegramUserSessionFilePath();

  if (!apiId || !apiHash) {
    await setTelegramUserSessionState(
      'disconnected',
      'Set TELEGRAM_API_ID and TELEGRAM_API_HASH (my.telegram.org).'
    );
    logger.error('[TelegramUser] Missing TELEGRAM_API_ID or TELEGRAM_API_HASH');
    return;
  }

  const sessionStr = readSessionString(sessionFile);
  const stringSession = new StringSession(sessionStr);
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  clientRef = client;
  await setTelegramUserSessionState(
    'connecting',
    'Connecting to Telegram. If the session is not yet authorized, a QR code will show here shortly.'
  );

  try {
    await client.connect();
  } catch (e) {
    logger.error('[TelegramUser] connect() failed', { e });
    await setTelegramUserSessionState('disconnected', 'Connection failed. Check network and API id/hash.');
    return;
  }

  const loginRedis = await initializeRedisClient();

  const authorized = await client.checkAuthorization();
  if (authorized) {
    registerOutboundFromClient(client);
    await setTelegramUserSessionState('connected', null);
    persistSession(client, sessionFile);
  } else {
    registerTelegramUserOutboundSender(null);
    try {
      await clearTelegramUserQrLoginUrl();
    } catch {
      /* */
    }
    await setTelegramUserSessionState(
      'connecting',
      'Open Telegram on your phone → Settings → Devices → Link Desktop Device, then scan the QR below (or use the in-app camera).'
    );

    try {
      await client.signInUserWithQrCode(
        { apiId, apiHash },
        {
          onError: async (err) => {
            logger.error('[TelegramUser] QR onError', { err: err?.message || String(err) });
            return false;
          },
          qrCode: async ({ token, expires }) => {
            const url = `tg://login?token=${token.toString('base64url')}`;
            const nowSec = Math.floor(Date.now() / 1000);
            const ttl =
              typeof expires === 'number' && expires > nowSec
                ? Math.min(600, expires - nowSec)
                : 150;
            try {
              await setTelegramUserQrLoginUrl(url, ttl);
            } catch (e) {
              logger.error('[TelegramUser] setTelegramUserQrLoginUrl failed', { e });
            }
            try {
              await setTelegramUserSessionState(
                'connecting',
                'Scan the QR with Telegram. If the code expires, the page will refresh with a new one.'
              );
            } catch {
              /* */
            }
          },
          password: async (hint) => {
            try {
              await clearTelegramUserQrLoginUrl();
            } catch {
              /* */
            }
            await setTelegramUserSessionState(
              'connecting',
              `2FA: ${hint ? `Hint: ${hint}. ` : ''}Enter your Telegram account password in admin below.`
            );
            const pw = await blpopText(loginRedis, LOGIN_PASSWORD, 300);
            if (!pw) {
              throw new Error('2FA password wait timed out.');
            }
            return pw;
          }
        }
      );
      await clearTelegramUserQrLoginUrl();
      await setTelegramUserSessionState('connected', null);
      persistSession(client, sessionFile);
      registerOutboundFromClient(client);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[TelegramUser] QR login failed', { msg });
      try {
        await clearTelegramUserQrLoginUrl();
      } catch {
        /* */
      }
      await setTelegramUserSessionState('disconnected', msg.slice(0, 500));
      registerTelegramUserOutboundSender(null);
      return;
    }
  }

  client.addEventHandler(
    async (event: NewMessageEvent) => {
      if (!clientRef) {
        return;
      }
      await onInboundMessage(clientRef, event);
    },
    new NewMessage({ incoming: true })
  );
}

async function main(): Promise<void> {
  if (!isTelegramUserClientEnabled()) {
    logger.warn(
      '[TelegramUser] TELEGRAM_USER_CLIENT_ENABLED is not true — worker exiting. Set to true in the environment to enable QR login and user session (same Redis as the API).'
    );
    return;
  }

  // Connect Mongo so DB-backed prompts + role lookups work and we don't pay a 10s
  // Mongoose buffer timeout on the first inbound message. Non-fatal on failure.
  await connectWorkerMongo('TelegramUser');

  void getWhatsAppMarketingSystemPrompt().catch(() => {
    /* same prompt store as WhatsApp; warm on startup */
  });

  const redis = await initializeRedisClient();
  void runAdminCommandQueueConsumer(redis);
  void runOutboundConsumer(redis);
  void connectSingleflight();

  process.on('SIGINT', () => {
    abortLoops = true;
    void clientRef
      ?.disconnect()
      .catch(() => {
        /* */
      })
      .finally(() => process.exit(0));
  });
}

void main().catch((e) => {
  logger.error('[TelegramUser] Fatal', { e });
  process.exit(1);
});
