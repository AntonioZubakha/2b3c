import { performance } from 'node:perf_hooks';
import type { RedisClientType } from 'redis';
import { initializeRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import type { WhatsAppIncomingMessagePayload } from './whatsapp.types';
import { WHATSAPP_CHANNEL_BAILEYS, WHATSAPP_CHANNEL_CLOUD } from './whatsapp.types';
import {
  appendChatMessage,
  getRecentChatTurns,
  getWhatsAppReplyGuards
} from './whatsappRedis.service';
import { generateWhatsAppMarketingReply } from './whatsappMarketingLlm.service';
import { sendWhatsAppOutbound, markWhatsAppMessageAsRead } from './whatsappOutbound.service';
import { createWhatsAppPipelineTimer } from './whatsappPipelineTiming';

const LOCK_PREFIX = 'whatsapp:reply-lock:';
const HISTORY_FOR_LLM = 24;
const LOCK_TTL_SEC = 300;

let redisSingleton: Promise<RedisClientType> | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (!redisSingleton) {
    redisSingleton = initializeRedisClient();
  }
  return redisSingleton;
}

/**
 * Process one incoming WhatsApp text message: lock → LLM → send → persist history.
 */
export async function processWhatsAppIncomingJob(payload: WhatsAppIncomingMessagePayload): Promise<void> {
  const channel = payload.channel ?? WHATSAPP_CHANNEL_CLOUD;
  const { waId, messageId, text, baileysRemoteJid } = payload;
  const timer = createWhatsAppPipelineTimer(messageId, channel, waId);
  timer.phase('job_enter', {
    textChars: text.length,
    hasBaileysJid: Boolean(baileysRemoteJid),
    enqueuedAtMs: payload.enqueuedAtMs
  });

  const lockKey = `${LOCK_PREFIX}${channel}:${messageId}`;

  const redis = await getRedis();
  timer.phase('redis_client_ready');

  const gotLock = await redis.set(lockKey, '1', { NX: true, EX: LOCK_TTL_SEC });
  timer.phase('lock_settled', { gotLock });
  if (!gotLock) {
    timer.phase('job_end_duplicate_skip', { totalMs: timer.totalMs() });
    logger.debug('[WhatsAppJob] Skip duplicate / concurrent job', { messageId });
    return;
  }

  // Persist the inbound user message FIRST so the admin WhatsApp tab always shows
  // what was received, even if the LLM call or outbound send fails downstream.
  // Without this, a Mongo/LLM/network blip silently drops messages from the operator's view.
  try {
    await appendChatMessage(channel, waId, { role: 'user', content: text });
    timer.phase('redis_append_user_early');
  } catch (e) {
    logger.error('[WhatsAppJob] Failed to persist inbound user message early', {
      channel,
      waId,
      messageId,
      err: e instanceof Error ? e.message : String(e)
    });
    // If we cannot even write to Redis, abort: locking + further work would also fail.
    try {
      await redis.del(lockKey);
    } catch {
      /* ignore */
    }
    throw e;
  }

  try {
    const { globalMode, paused } = await getWhatsAppReplyGuards(channel, waId);
    const globalAllowsThisChannel =
      globalMode !== 'off' &&
      ((channel === WHATSAPP_CHANNEL_CLOUD && globalMode === 'cloud') ||
        (channel === WHATSAPP_CHANNEL_BAILEYS && globalMode === 'baileys'));

    timer.phase('redis_guards', { globalMode, globalAllowsThisChannel, paused });

    if (!globalAllowsThisChannel || paused) {
      timer.phase('job_end_stored_no_auto_reply', { totalMs: timer.totalMs() });
      logger.debug('[WhatsAppJob] Inbound stored only (no auto-reply)', {
        channel,
        waId,
        messageId,
        globalMode,
        globalAllowsThisChannel,
        paused
      });
      return;
    }

    const tMr0 = performance.now();
    await markWhatsAppMessageAsRead(channel, messageId, baileysRemoteJid).catch((e) => {
      logger.warn('[WhatsAppJob] Failed to mark read automatically', { messageId, err: e });
    });
    timer.phase('mark_read_finished', { markReadMs: Math.round(performance.now() - tMr0) });

    const prior = await getRecentChatTurns(channel, waId, HISTORY_FOR_LLM);
    timer.phase('history_loaded', {
      turnCount: prior.length,
      historyCharsApprox: prior.reduce((a, t) => a + (t.content?.length ?? 0), 0)
    });

    const reply = await generateWhatsAppMarketingReply(prior, text, channel, waId, timer);

    const usedLlmText = Boolean(reply?.trim());
    const outbound =
      reply?.trim() ||
      (detectRu(text)
        ? 'Спасибо за сообщение! Узнайте актуальные предложения и условия на https://lgdeal.com — мы ждём вас на маркетплейсе.'
        : 'Thanks for your message! See current offers at https://lgdeal.com — we look forward to seeing you on the marketplace.');

    timer.phase('reply_finalized', {
      usedLlmText,
      fallbackTemplate: !usedLlmText,
      outboundChars: outbound.length
    });

    const sendResult = await sendWhatsAppOutbound(channel, waId, outbound, baileysRemoteJid, { messageId });
    timer.phase('outbound_returned', { ok: sendResult.ok, error: sendResult.error });

    if (!sendResult.ok) {
      throw new Error(sendResult.error || 'send_failed');
    }

    // User message was already persisted at the start of this job; only append the assistant reply here.
    const tA1 = performance.now();
    await appendChatMessage(channel, waId, { role: 'assistant', content: outbound }, { source: 'llm' });
    timer.phase('redis_append_assistant', { appendMs: Math.round(performance.now() - tA1) });

    timer.phase('job_complete', { totalMs: timer.totalMs() });
    logger.debug('[WhatsAppJob] Handled message', { channel, waId, messageId });
  } catch (err) {
    timer.phase('job_failed', {
      err: err instanceof Error ? err.message : String(err),
      totalMs: timer.totalMs()
    });
    logger.error('[WhatsAppJob] Failed', {
      messageId,
      err: err instanceof Error ? err.message : String(err)
    });
    try {
      await redis.del(lockKey);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function detectRu(s: string): boolean {
  return /[а-яё]/i.test(s);
}
