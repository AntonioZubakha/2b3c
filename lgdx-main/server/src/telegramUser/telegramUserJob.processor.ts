import { performance } from 'node:perf_hooks';
import type { RedisClientType } from 'redis';
import { initializeRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { generateTelegramUserMarketingReply } from '../whatsapp/whatsappMarketingLlm.service';
import type { ChatTurn } from '../whatsapp/whatsappRedis.service';
import { createWhatsAppPipelineTimer } from '../whatsapp/whatsappPipelineTiming';
import {
  appendTelegramUserChatMessage,
  getRecentTelegramUserChatTurns,
  getTelegramUserReplyGuards
} from './telegramUserRedis.service';
import { sendTelegramUserOutbound } from './telegramUserOutbound.service';

const LOCK_PREFIX = 'telegram:user:reply-lock:';
const HISTORY_FOR_LLM = 24;
const LOCK_TTL_SEC = 300;

let redisSingleton: Promise<RedisClientType> | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (!redisSingleton) {
    redisSingleton = initializeRedisClient();
  }
  return redisSingleton;
}

export async function processTelegramUserIncomingJob(payload: {
  peerId: string;
  messageId: string;
  text: string;
  timestampSec: number;
  enqueuedAtMs?: number;
}): Promise<void> {
  const { peerId, messageId, text } = payload;
  const timer = createWhatsAppPipelineTimer(messageId, 'telegram_user', peerId);
  timer.phase('job_enter', { textChars: text.length, enqueuedAtMs: payload.enqueuedAtMs });

  const lockKey = `${LOCK_PREFIX}${messageId}`;

  const redis = await getRedis();
  timer.phase('redis_client_ready');

  const gotLock = await redis.set(lockKey, '1', { NX: true, EX: LOCK_TTL_SEC });
  timer.phase('lock_settled', { gotLock });
  if (!gotLock) {
    timer.phase('job_end_duplicate_skip', { totalMs: timer.totalMs() });
    logger.debug('[TelegramUserJob] Skip duplicate / concurrent job', { messageId });
    return;
  }

  // Persist the inbound user message FIRST so the admin chat tab always shows
  // what was received, even if the LLM call or outbound send fails downstream.
  try {
    await appendTelegramUserChatMessage(peerId, { role: 'user', content: text });
    timer.phase('redis_append_user_early');
  } catch (e) {
    logger.error('[TelegramUserJob] Failed to persist inbound user message early', {
      peerId,
      messageId,
      err: e instanceof Error ? e.message : String(e)
    });
    try {
      await redis.del(lockKey);
    } catch {
      /* ignore */
    }
    throw e;
  }

  try {
    const { globalMode, paused } = await getTelegramUserReplyGuards(peerId);
    const globalAllows = globalMode === 'user';
    timer.phase('redis_guards', { globalMode, globalAllows, paused });

    if (!globalAllows || paused) {
      timer.phase('job_end_stored_no_auto_reply', { totalMs: timer.totalMs() });
      logger.debug('[TelegramUserJob] Inbound stored only (no auto-reply)', {
        peerId,
        messageId,
        globalMode,
        globalAllows,
        paused
      });
      return;
    }

    const prior: ChatTurn[] = await getRecentTelegramUserChatTurns(
      peerId,
      HISTORY_FOR_LLM
    );
    timer.phase('history_loaded', { turnCount: prior.length });

    const reply = await generateTelegramUserMarketingReply(prior, text, peerId, timer);
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

    const sendResult = await sendTelegramUserOutbound(peerId, outbound, { messageId });
    timer.phase('outbound_returned', {
      ok: sendResult.ok,
      error: sendResult.ok === false ? sendResult.error : undefined
    });

    if (sendResult.ok === false) {
      throw new Error(sendResult.error || 'send_failed');
    }

    // User message was already persisted at the start of this job; only append the assistant reply here.
    const tA1 = performance.now();
    await appendTelegramUserChatMessage(
      peerId,
      { role: 'assistant', content: outbound },
      { source: 'llm' }
    );
    timer.phase('redis_append_assistant', { appendMs: Math.round(performance.now() - tA1) });

    timer.phase('job_complete', { totalMs: timer.totalMs() });
  } catch (err) {
    timer.phase('job_failed', {
      err: err instanceof Error ? err.message : String(err),
      totalMs: timer.totalMs()
    });
    logger.error('[TelegramUserJob] Failed', { messageId, err });
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
