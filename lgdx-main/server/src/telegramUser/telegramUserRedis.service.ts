import type { RedisClientType } from 'redis';
import { initializeRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import type {
  TelegramUserGlobalAutoReplyMode,
  TelegramUserOutboundJob
} from './telegramUser.types';
import type { ChatMessageSource, ChatTurn, ChatTurnForAdmin } from '../whatsapp/whatsappRedis.service';

const CHAT_PREFIX = 'telegram:user:chat:';
const AI_PAUSED_PREFIX = 'telegram:user:ai_paused:';
const GLOBAL_AUTO_REPLY_KEY = 'telegram:user:global_auto_reply_mode';
const MAX_MESSAGES = 40;
const REPLY_GUARDS_TTL_MS = 3000;
const REPLY_GUARDS_CACHE_MAX = 600;
const replyGuardsCache = new Map<
  string,
  { globalMode: TelegramUserGlobalAutoReplyMode; paused: boolean; exp: number }
>();

const TELEGRAM_USER_STATUS_KEY = 'telegram:user:status';
const TELEGRAM_USER_AUTH_HINT_KEY = 'telegram:user:auth_hint';
const TELEGRAM_USER_QR_LOGIN_URL_KEY = 'telegram:user:qr_login_url';

let clientPromise: Promise<RedisClientType> | null = null;

async function redis(): Promise<RedisClientType> {
  if (!clientPromise) {
    clientPromise = initializeRedisClient();
  }
  return clientPromise;
}

function pruneReplyGuardsCache(): void {
  const now = Date.now();
  for (const [k, row] of replyGuardsCache) {
    if (row.exp <= now) replyGuardsCache.delete(k);
  }
  while (replyGuardsCache.size > REPLY_GUARDS_CACHE_MAX) {
    const first = replyGuardsCache.keys().next().value;
    if (first === undefined) break;
    replyGuardsCache.delete(first);
  }
}

export function invalidateTelegramUserReplyGuardsCache(): void {
  replyGuardsCache.clear();
}

function parseGlobalMode(v: string | undefined | null): TelegramUserGlobalAutoReplyMode {
  if (v === 'off' || v === 'user') return v;
  return 'off';
}

/**
 * E.164-style normalization not applicable; keep digits-only Telegram user id.
 */
export function normalizeTelegramPeerId(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/^\d+$/.test(t)) return t;
  const d = t.replace(/\D/g, '');
  return d || '';
}

function chatKey(peerId: string): string {
  return `${CHAT_PREFIX}${normalizeTelegramPeerId(peerId)}`;
}

function aiPausedKey(peerId: string): string {
  return `${AI_PAUSED_PREFIX}${normalizeTelegramPeerId(peerId)}`;
}

/**
 * Inbound + outbound auto-reply: global "user" mode must be on and chat not paused.
 */
export async function getTelegramUserReplyGuards(
  peerId: string
): Promise<{ globalMode: TelegramUserGlobalAutoReplyMode; paused: boolean }> {
  const norm = normalizeTelegramPeerId(peerId);
  const now = Date.now();
  const hit = replyGuardsCache.get(norm);
  if (hit && hit.exp > now) {
    return { globalMode: hit.globalMode, paused: hit.paused };
  }

  const r = await redis();
  const vals = await r.mGet([GLOBAL_AUTO_REPLY_KEY, aiPausedKey(norm)]);
  const globalMode = parseGlobalMode(vals[0]);
  const paused = vals[1] === '1';

  replyGuardsCache.set(norm, {
    globalMode,
    paused,
    exp: now + REPLY_GUARDS_TTL_MS
  });
  pruneReplyGuardsCache();

  return { globalMode, paused };
}

export type AppendChatMessageOptions = {
  source?: ChatMessageSource;
};

export async function appendTelegramUserChatMessage(
  peerId: string,
  turn: ChatTurn,
  options?: AppendChatMessageOptions
): Promise<void> {
  const r = await redis();
  const key = chatKey(peerId);
  const score = Date.now();
  const payload: Record<string, unknown> = { ...turn, t: score };
  if (turn.role === 'assistant' && options?.source) {
    payload.source = options.source;
  }
  const member = JSON.stringify(payload);
  await r.zAdd(key, [{ score, value: member }]);
  await r.expire(key, 30 * 24 * 3600);

  const n = await r.zCard(key);
  if (n > MAX_MESSAGES) {
    const remove = n - MAX_MESSAGES;
    await r.zRemRangeByRank(key, 0, remove - 1);
  }
}

export async function getRecentTelegramUserChatTurns(
  peerId: string,
  limit: number
): Promise<ChatTurn[]> {
  if (limit <= 0) return [];
  const r = await redis();
  const key = chatKey(peerId);
  const capped = Math.min(limit, 100);
  const raw = await r.zRange(key, -capped, -1);
  const out: ChatTurn[] = [];
  for (const row of raw) {
    try {
      const p = JSON.parse(row) as ChatTurn & { t?: number; source?: ChatMessageSource };
      out.push({ role: p.role, content: p.content });
    } catch {
      logger.warn('[TelegramUserRedis] Bad chat member JSON', { row: row.slice(0, 80) });
    }
  }
  return out;
}

export async function getTelegramUserChatHistoryForAdmin(
  peerId: string
): Promise<ChatTurnForAdmin[]> {
  const r = await redis();
  const key = chatKey(peerId);
  const n = await r.zCard(key);
  if (n === 0) return [];
  const raw = await r.zRange(key, 0, -1);
  const out: ChatTurnForAdmin[] = [];
  for (const row of raw) {
    try {
      const p = JSON.parse(row) as ChatTurn & { t?: number; source?: ChatMessageSource };
      const t = typeof p.t === 'number' ? p.t : Date.now();
      const source = p.role === 'assistant' ? p.source ?? 'llm' : undefined;
      out.push({
        role: p.role,
        content: p.content,
        t,
        ...(source ? { source } : {})
      });
    } catch {
      logger.warn('[TelegramUserRedis] Bad chat member JSON (admin)', { row: row.slice(0, 80) });
    }
  }
  return out;
}

export type TelegramUserChatListItem = {
  peerId: string;
  lastMessageAt: number;
  messageCount: number;
  aiPaused: boolean;
};

export async function listTelegramUserChats(): Promise<TelegramUserChatListItem[]> {
  const r = await redis();
  const out: TelegramUserChatListItem[] = [];

  for await (const key of r.scanIterator({ MATCH: `${CHAT_PREFIX}*`, COUNT: 200 })) {
    if (typeof key !== 'string' || !key.startsWith(CHAT_PREFIX)) continue;
    const peerId = key.slice(CHAT_PREFIX.length);
    if (!peerId) continue;
    const messageCount = await r.zCard(key);
    if (messageCount === 0) continue;
    const last = await r.zRangeWithScores(key, -1, -1);
    const lastScore = last[0]?.score ?? 0;
    const aiPaused = await isAiPausedForTelegramUserChat(peerId);
    out.push({
      peerId,
      lastMessageAt: lastScore,
      messageCount,
      aiPaused
    });
  }

  out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return out;
}

export async function getGlobalTelegramUserAutoReplyMode(): Promise<TelegramUserGlobalAutoReplyMode> {
  const r = await redis();
  const v = await r.get(GLOBAL_AUTO_REPLY_KEY);
  return parseGlobalMode(v);
}

export async function setGlobalTelegramUserAutoReplyMode(
  mode: TelegramUserGlobalAutoReplyMode
): Promise<void> {
  const r = await redis();
  await r.set(GLOBAL_AUTO_REPLY_KEY, mode);
  invalidateTelegramUserReplyGuardsCache();
}

export async function isAiPausedForTelegramUserChat(peerId: string): Promise<boolean> {
  const r = await redis();
  const v = await r.get(aiPausedKey(peerId));
  return v === '1';
}

export async function setAiPausedForTelegramUserChat(
  peerId: string,
  paused: boolean
): Promise<void> {
  const r = await redis();
  const k = aiPausedKey(peerId);
  if (paused) {
    await r.set(k, '1', { EX: 30 * 24 * 3600 });
  } else {
    await r.del(k);
  }
  invalidateTelegramUserReplyGuardsCache();
}

export const TELEGRAM_USER_OUTBOUND_QUEUE = 'telegram:user:outbound';
export const TELEGRAM_USER_ADMIN_CMD_QUEUE = 'telegram:user:admin_cmd_queue';

export async function enqueueTelegramUserOutbound(
  job: Omit<TelegramUserOutboundJob, 'enqueuedAt'>
): Promise<void> {
  const r = await redis();
  const norm = normalizeTelegramPeerId(job.peerId);
  if (!norm || !job.text?.trim()) return;
  const payload: TelegramUserOutboundJob = {
    ...job,
    peerId: norm,
    text: job.text.trim(),
    enqueuedAt: Date.now()
  };
  await r.rPush(TELEGRAM_USER_OUTBOUND_QUEUE, JSON.stringify(payload));
}

export type TelegramUserStatusPayload = {
  status: 'connecting' | 'connected' | 'disconnected' | null;
  authHint: string | null;
};

export async function setTelegramUserSessionState(
  status: 'connecting' | 'connected' | 'disconnected',
  authHint: string | null
): Promise<void> {
  const r = await redis();
  await r.set(TELEGRAM_USER_STATUS_KEY, status, { EX: 3600 });
  if (authHint) {
    await r.set(TELEGRAM_USER_AUTH_HINT_KEY, authHint, { EX: 1200 });
  } else {
    await r.del(TELEGRAM_USER_AUTH_HINT_KEY);
  }
}

export async function getTelegramUserSessionState(): Promise<TelegramUserStatusPayload> {
  const r = await redis();
  const statusRaw = await r.get(TELEGRAM_USER_STATUS_KEY);
  const hint = await r.get(TELEGRAM_USER_AUTH_HINT_KEY);
  const status =
    statusRaw === 'connecting' || statusRaw === 'connected' || statusRaw === 'disconnected'
      ? statusRaw
      : null;
  return { status, authHint: hint };
}

/** `tg://login?token=...` for QR; worker refreshes while waiting for scan. */
export async function setTelegramUserQrLoginUrl(url: string, ttlSec: number): Promise<void> {
  const r = await redis();
  const t = Math.max(30, Math.min(600, Math.floor(ttlSec)));
  await r.set(TELEGRAM_USER_QR_LOGIN_URL_KEY, url, { EX: t });
}

export async function getTelegramUserQrLoginUrl(): Promise<string | null> {
  const r = await redis();
  const v = await r.get(TELEGRAM_USER_QR_LOGIN_URL_KEY);
  return v && v.trim() ? v.trim() : null;
}

export async function clearTelegramUserQrLoginUrl(): Promise<void> {
  const r = await redis();
  await r.del(TELEGRAM_USER_QR_LOGIN_URL_KEY);
}

const LOGIN_PHONE = 'telegram:user:login:phone';
const LOGIN_CODE = 'telegram:user:login:code';
const LOGIN_PASSWORD = 'telegram:user:login:password';

export { LOGIN_PHONE, LOGIN_CODE, LOGIN_PASSWORD };

export async function enqueueTelegramUserLoginPhone(phone: string): Promise<void> {
  const r = await redis();
  await r.rPush(LOGIN_PHONE, phone.trim());
}

export async function enqueueTelegramUserLoginCode(code: string): Promise<void> {
  const r = await redis();
  await r.rPush(LOGIN_CODE, code.trim());
}

export async function enqueueTelegramUserLoginPassword(password: string): Promise<void> {
  const r = await redis();
  await r.rPush(LOGIN_PASSWORD, password);
}

export async function enqueueTelegramUserAdminCommand(
  cmd: import('./telegramUser.types').TelegramUserAdminCommand
): Promise<void> {
  const r = await redis();
  await r.rPush(TELEGRAM_USER_ADMIN_CMD_QUEUE, cmd);
}
