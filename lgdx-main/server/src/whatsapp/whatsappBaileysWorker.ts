/**
 * Baileys (unofficial WhatsApp Web) — one process per deployment, one phone session.
 * Run: node dist/whatsapp/whatsappBaileysWorker.js
 */
import { performance } from 'node:perf_hooks';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pino from 'pino';
import {
  DisconnectReason,
  type BaileysEventMap,
  fetchLatestBaileysVersion,
  isJidGroup,
  isJidStatusBroadcast,
  isJidUser,
  isLidUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { initializeRedisClient } from '../config/redis';
import { connectWorkerMongo } from '../config/mongo';
import type { RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { processWhatsAppIncomingJob } from './whatsappJob.processor';
import { registerBaileysOutboundSender, registerBaileysReadMarker } from './whatsappOutbound.service';
import { WHATSAPP_CHANNEL_BAILEYS } from './whatsapp.types';
import {
  appendChatMessage,
  WHATSAPP_BAILEYS_OUTBOUND_QUEUE,
  WHATSAPP_BAILEYS_ADMIN_CMD_QUEUE,
  type BaileysAdminCommand,
  type BaileysOutboundJob,
  setBaileysSessionState,
  WHATSAPP_BAILEYS_ADMIN_CMD_CHANNEL,
} from './whatsappRedis.service';
import { warmWhatsAppMarketingPromptAtStartup } from './whatsappConfig';
import { resolveInboundBaileysWaId, rememberLidToPhoneJid, resolveOutboundJid } from './whatsappBaileysLidMapping';
import { isWhatsAppTimingEnabled, waIdPrefixForLog } from './whatsappPipelineTiming';

dotenv.config();


function getAuthDir(): string {
  const raw = process.env.WHATSAPP_BAILEYS_AUTH_DIR || path.join(process.cwd(), 'auth_baileys');
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function truthyEnv(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'yes';
}

function clearAuthDirContents(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function extractIncomingText(msg: WAMessage): string | undefined {
  const m = msg.message;
  if (!m) return undefined;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  return undefined;
}

function isDirectChat(jid: string | undefined | null): boolean {
  if (!jid) return false;
  if (isJidGroup(jid) || isJidStatusBroadcast(jid)) return false;
  return Boolean(isJidUser(jid) || isLidUser(jid));
}

type WASocket = ReturnType<typeof makeWASocket>;

let sockRef: WASocket | null = null;
let outboundAbort = false;
let connectInFlight: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;

function scheduleReconnect(reason: string, opts?: { immediate?: boolean }): void {
  if (reconnectTimer) return;
  const immediate = Boolean(opts?.immediate);
  const baseMs = 3000;
  const maxMs = 30000;
  const pow = Math.min(reconnectAttempt, 6);
  const exp = immediate ? 0 : Math.min(maxMs, baseMs * Math.pow(2, pow));
  const jitter = immediate ? 0 : Math.floor(Math.random() * 700);
  const delayMs = immediate ? 0 : exp + jitter;

  logger.warn('[WhatsAppBaileys] Scheduling reconnect', {
    reason,
    reconnectAttempt,
    delayMs
  });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectSingleflight().catch((err) => logger.error('[WhatsAppBaileys] Reconnect failed', { err }));
  }, delayMs);
}

async function connectSingleflight(): Promise<void> {
  if (connectInFlight) return connectInFlight;
  connectInFlight = (async () => {
    try {
      await connect();
    } finally {
      connectInFlight = null;
    }
  })();
  return connectInFlight;
}

async function forceRelink(): Promise<void> {
  logger.warn('[WhatsAppBaileys] Admin requested relink (reset session)');
  await setBaileysSessionState('disconnected', null);
  try {
    await sockRef?.logout();
  } catch (err) {
    logger.warn('[WhatsAppBaileys] logout failed (continuing)', { err });
  }
  sockRef = null;
  registerBaileysOutboundSender(null);
  registerBaileysReadMarker(null);
  try {
    clearAuthDirContents(getAuthDir());
  } catch (err) {
    logger.error('[WhatsAppBaileys] Failed to clear auth dir for relink', { err });
  }
  // Keep "disconnected" until QR is actually produced.
  reconnectAttempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  await connectSingleflight();
}

async function runAdminCommandQueueConsumer(redis: RedisClientType): Promise<void> {
  while (!outboundAbort) {
    try {
      const res = await redis.blPop([WHATSAPP_BAILEYS_ADMIN_CMD_QUEUE], 5);
      if (!res) continue;
      const cmd = String(res.element || '').trim() as BaileysAdminCommand;
      if (cmd === 'reset') {
        await forceRelink();
      }
    } catch (e) {
      logger.error('[WhatsAppBaileys] Admin command queue loop error', { err: e });
    }
  }
}

async function runOutboundConsumer(redis: RedisClientType): Promise<void> {
  while (!outboundAbort) {
    try {
      // RPUSH enqueue + BLPOP dequeue = FIFO (BRPOP would consume newest first).
      const res = await redis.blPop([WHATSAPP_BAILEYS_OUTBOUND_QUEUE], 5);
      if (!res) continue;
      const raw = res.element;
      let job: BaileysOutboundJob;
      try {
        job = JSON.parse(raw) as BaileysOutboundJob;
      } catch {
        logger.error('[WhatsAppBaileys] Bad outbound JSON');
        continue;
      }
      const { waId, text } = job;
      if (!waId || !text?.trim()) continue;
      const sock = sockRef;
      if (!sock) {
        logger.warn('[WhatsAppBaileys] Outbound requeued — socket not ready');
        // Keep FIFO semantics: enqueue tail (RPUSH) because consumer BLPOPs from head.
        await redis.rPush(WHATSAPP_BAILEYS_OUTBOUND_QUEUE, raw);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      try {
        const t0 = performance.now();
        const jid = await resolveOutboundJid(undefined, waId);
        const t1 = performance.now();
        await sock.sendMessage(jid, { text: text.trim() });
        const t2 = performance.now();
        if (isWhatsAppTimingEnabled()) {
          logger.info('[WhatsAppTiming]', {
            phase: 'baileys_manual_admin_outbound',
            waIdPrefix: waIdPrefixForLog(waId),
            resolveJidMs: Math.round(t1 - t0),
            sendMessageMs: Math.round(t2 - t1)
          });
        }
        await appendChatMessage(WHATSAPP_CHANNEL_BAILEYS, waId, { role: 'assistant', content: text.trim() }, {
          source: 'admin'
        });
      } catch (e) {
        logger.error('[WhatsAppBaileys] Outbound send failed', {
          waId,
          err: e instanceof Error ? e.message : String(e)
        });
      }
    } catch (e) {
      logger.error('[WhatsAppBaileys] Outbound loop error', { err: e });
    }
  }
}

async function connect(): Promise<void> {
  const authDir = getAuthDir();
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const silentLog = pino({ level: 'silent' });
  const sock = makeWASocket({
    version,
    // Baileys expects a slightly different pino Logger type than our dependency tree provides
    logger: silentLog as never,
    printQRInTerminal: true,
    fireInitQueries: truthyEnv(process.env.WHATSAPP_BAILEYS_FIRE_INIT_QUERIES),
    markOnlineOnConnect: truthyEnv(process.env.WHATSAPP_BAILEYS_MARK_ONLINE),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLog as never),
    },
  });

  sockRef = sock;

  registerBaileysOutboundSender(
    async (waId: string, text: string, baileysRemoteJid?: string, meta?: { messageId?: string }) => {
      const t0 = performance.now();
      let jid: string;
      try {
        jid = await resolveOutboundJid(baileysRemoteJid, waId);
      } catch (e) {
        logger.error('[WhatsAppBaileys] resolveOutboundJid failed', { err: e, waId });
        return { ok: false, error: 'resolve_jid_failed' };
      }
      const t1 = performance.now();
      try {
        await sock.sendMessage(jid, { text });
        const t2 = performance.now();
        if (isWhatsAppTimingEnabled()) {
          logger.info('[WhatsAppTiming]', {
            phase: 'baileys_bot_outbound_breakdown',
            messageId: meta?.messageId,
            waIdPrefix: waId.slice(0, 8),
            resolveJidMs: Math.round(t1 - t0),
            sendMessageMs: Math.round(t2 - t1),
            target: jid.endsWith('@lid') ? 'lid' : 'pn',
            textChars: text.length
          });
        }
        return { ok: true };
      } catch (err) {
        logger.error('[WhatsAppBaileys] sendWhatsAppOutbound failed', { err, waId, jid });
        return { ok: false, error: 'send_failed' };
      }
    }
  );

  registerBaileysReadMarker(async (messageId: string, baileysRemoteJid?: string) => {
    if (!baileysRemoteJid) return false;
    const t0 = performance.now();
    try {
      await sock.readMessages([{ remoteJid: baileysRemoteJid, id: messageId }]);
      if (isWhatsAppTimingEnabled()) {
        logger.info('[WhatsAppTiming]', {
          phase: 'baileys_mark_read',
          messageId,
          ms: Math.round(performance.now() - t0),
          ok: true
        });
      }
      return true;
    } catch (e) {
      if (isWhatsAppTimingEnabled()) {
        logger.info('[WhatsAppTiming]', {
          phase: 'baileys_mark_read',
          messageId,
          ms: Math.round(performance.now() - t0),
          ok: false
        });
      }
      logger.warn('[WhatsAppBaileys] Failed to mark read', { messageId, err: e });
      return false;
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('chats.phoneNumberShare', ({ lid, jid }: BaileysEventMap['chats.phoneNumberShare']) => {
    void rememberLidToPhoneJid(lid, jid).catch((err) =>
      logger.error('[WhatsAppBaileys] rememberLidToPhoneJid failed', { err })
    );
  });

  sock.ev.on('connection.update', (update: BaileysEventMap['connection.update']) => {
    const { connection, lastDisconnect, qr } = update;
    void (async () => {
      if (typeof qr === 'string' && qr.length > 0) {
        // UX contract: "connecting" is shown only when there is a QR to scan.
        await setBaileysSessionState('connecting', qr);
        logger.debug('[WhatsAppBaileys] QR updated (scan in admin)');
      }
      if (connection === 'close') {
        sockRef = null;
        registerBaileysOutboundSender(null);
        registerBaileysReadMarker(null);
        await setBaileysSessionState('disconnected', null);
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const wasLoggedOut = statusCode === DisconnectReason.loggedOut;
        logger.warn('[WhatsAppBaileys] Connection closed', { wasLoggedOut, statusCode });

        reconnectAttempt = Math.min(reconnectAttempt + 1, 50);

        if (wasLoggedOut) {
          // Device was unlinked (or session revoked) — auth state must be reset to generate a new QR.
          try {
            const dir = getAuthDir();
            clearAuthDirContents(dir);
          } catch (err) {
            logger.warn('[WhatsAppBaileys] Failed to clear auth dir after logout', { err });
          }
        }

        // Keep "disconnected" until a QR is actually produced (or until we open the connection).
        scheduleReconnect(wasLoggedOut ? 'logged_out' : 'connection_close');
      } else if (connection === 'open') {
        await setBaileysSessionState('connected', null);
        reconnectAttempt = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        logger.debug('[WhatsAppBaileys] Connected');
      }
    })();
  });

  sock.ev.on('messages.upsert', async ({ messages, type }: BaileysEventMap['messages.upsert']) => {
    if (type !== 'notify' && type !== 'append') return;

    const upsertReceivedAt = performance.now();
    if (isWhatsAppTimingEnabled()) {
      logger.info('[WhatsAppTiming]', {
        phase: 'baileys_messages_upsert_batch',
        upsertType: type,
        batchLen: messages.length
      });
    }

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const stub = (msg as WAMessage & { messageStubType?: number }).messageStubType;
      if (stub !== undefined && stub !== null) continue;
      const remote = msg.key.remoteJid;
      if (!remote || !isDirectChat(remote)) continue;
      if (remote.endsWith('@newsletter') || remote.includes('@broadcast')) continue;

      const text = extractIncomingText(msg);
      if (!text?.trim()) continue;

      let waId: string;
      try {
        waId = await resolveInboundBaileysWaId(msg.key);
      } catch (e) {
        logger.error('[WhatsAppBaileys] resolveInboundBaileysWaId failed', {
          err: e instanceof Error ? e.message : String(e)
        });
        continue;
      }
      if (waId.length < 4) continue;

      const baileysRemoteJid = jidNormalizedUser(remote) || remote;

      const messageId = msg.key.id || `${Date.now()}-${Math.random()}`;
      const ts = Math.floor(Date.now() / 1000);

      if (isWhatsAppTimingEnabled()) {
        logger.info('[WhatsAppTiming]', {
          phase: 'baileys_inbound_text_start_job',
          messageId,
          waIdPrefix: waIdPrefixForLog(waId),
          textChars: text.trim().length,
          msSinceUpsertBatch: Math.round(performance.now() - upsertReceivedAt)
        });
      }

      try {
        await processWhatsAppIncomingJob({
          channel: WHATSAPP_CHANNEL_BAILEYS,
          waId,
          messageId,
          text: text.trim(),
          timestampSec: ts,
          baileysRemoteJid,
        });
      } catch (err) {
        logger.error('[WhatsAppBaileys] Job failed', { err, waId, messageId });
      }
    }
  });
}

async function main(): Promise<void> {
  if (process.env.WHATSAPP_BAILEYS_ENABLED !== 'true') {
    logger.error('[WhatsAppBaileys] Set WHATSAPP_BAILEYS_ENABLED=true');
    process.exit(1);
  }

  // Connect Mongo before warming the prompt so DB-backed prompt + role lookups work
  // and we don't pay a 10s Mongoose buffer timeout on the first inbound message.
  // Non-fatal: if Mongo is unreachable, code paths fall back to disk/defaults.
  await connectWorkerMongo('WhatsAppBaileys');

  warmWhatsAppMarketingPromptAtStartup();

  // Default state on worker start: disconnected.
  // "connecting" is reserved for the QR-scanning phase only.
  await setBaileysSessionState('disconnected', null);
  const redis = await initializeRedisClient();
  const outboundRedis = redis.duplicate();
  await outboundRedis.connect();
  void runOutboundConsumer(outboundRedis);

  const adminCmdRedis = redis.duplicate();
  await adminCmdRedis.connect();
  void runAdminCommandQueueConsumer(adminCmdRedis);

  // Listen for admin commands (disconnect/relink).
  try {
    const sub = redis.duplicate();
    await sub.connect();
    await sub.subscribe(WHATSAPP_BAILEYS_ADMIN_CMD_CHANNEL, (msg) => {
      if (msg === 'reset') {
        void forceRelink().catch((err) => logger.error('[WhatsAppBaileys] forceRelink failed', { err }));
      }
    });
    logger.info('[WhatsAppBaileys] Subscribed to admin commands');
  } catch (err) {
    logger.error('[WhatsAppBaileys] Failed to subscribe to admin commands', { err });
  }

  await connectSingleflight().catch((err) => {
    logger.error('[WhatsAppBaileys] Initial connect failed', { err });
    reconnectAttempt = Math.min(reconnectAttempt + 1, 50);
    scheduleReconnect('initial_connect_failed', { immediate: false });
    process.exitCode = 1;
  });

  process.on('SIGINT', () => {
    outboundAbort = true;
    registerBaileysOutboundSender(null);
    registerBaileysReadMarker(null);
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('[WhatsAppBaileys] Fatal', { err });
  process.exit(1);
});
