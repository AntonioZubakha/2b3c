import type { RedisClientType } from 'redis';
import { initializeRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import type { WhatsAppChannel, WhatsAppGlobalAutoReplyMode } from './whatsapp.types';
import { WHATSAPP_CHANNEL_BAILEYS, WHATSAPP_CHANNEL_CLOUD } from './whatsapp.types';
import { normalizeWaId } from './whatsappWaId.utils';

const CHAT_PREFIX = 'whatsapp:chat:';
const AI_PAUSED_PREFIX = 'whatsapp:ai_paused:';
const GLOBAL_AUTO_REPLY_MODE_KEY = 'whatsapp:global_auto_reply_mode';
const MAX_MESSAGES = 40;

/** Short TTL: fewer Redis round-trips under burst traffic; invalidated when admin changes mode/pause. */
const REPLY_GUARDS_TTL_MS = 3000;
const REPLY_GUARDS_CACHE_MAX = 600;
const replyGuardsCache = new Map<
  string,
  { globalMode: WhatsAppGlobalAutoReplyMode; paused: boolean; exp: number }
>();

function parseGlobalAutoReplyModeValue(v: string | undefined | null): WhatsAppGlobalAutoReplyMode {
  if (v === 'off' || v === 'cloud' || v === 'baileys') return v;
  return WHATSAPP_CHANNEL_CLOUD;
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

export function invalidateWhatsAppReplyGuardsCache(): void {
  replyGuardsCache.clear();
}

async function migrateCloudLegacyAiPausedKey(r: RedisClientType, waIdNorm: string): Promise<void> {
  const k = aiPausedKey(WHATSAPP_CHANNEL_CLOUD, waIdNorm);
  const legacy = legacyAiPausedKey(waIdNorm);
  try {
    await r.rename(legacy, k);
  } catch {
    await r.set(k, '1', { EX: 30 * 24 * 3600 });
    await r.del(legacy);
  }
}

/**
 * Single Redis round-trip (MGET) + short in-process cache. Use on the inbound auto-reply hot path.
 */
export async function getWhatsAppReplyGuards(
  channel: WhatsAppChannel,
  waId: string
): Promise<{ globalMode: WhatsAppGlobalAutoReplyMode; paused: boolean }> {
  const norm = normalizeWaId(waId);
  const cacheKey = `${channel}:${norm}`;
  const now = Date.now();
  const hit = replyGuardsCache.get(cacheKey);
  if (hit && hit.exp > now) {
    return { globalMode: hit.globalMode, paused: hit.paused };
  }

  const r = await redis();
  const pausedKey = aiPausedKey(channel, norm);
  const keys =
    channel === WHATSAPP_CHANNEL_CLOUD
      ? [GLOBAL_AUTO_REPLY_MODE_KEY, pausedKey, legacyAiPausedKey(norm)]
      : [GLOBAL_AUTO_REPLY_MODE_KEY, pausedKey];

  const vals = await r.mGet(keys);
  const globalMode = parseGlobalAutoReplyModeValue(vals[0]);
  let paused = vals[1] === '1';

  if (channel === WHATSAPP_CHANNEL_CLOUD && !paused && vals[2] === '1') {
    await migrateCloudLegacyAiPausedKey(r, norm);
    paused = true;
  }

  replyGuardsCache.set(cacheKey, {
    globalMode,
    paused,
    exp: now + REPLY_GUARDS_TTL_MS
  });
  pruneReplyGuardsCache();

  return { globalMode, paused };
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Stored for assistant lines: who produced the reply (bot vs operator). */
export type ChatMessageSource = 'llm' | 'admin';

export type ChatTurnForAdmin = ChatTurn & {
  t: number;
  source?: ChatMessageSource;
};

function chatKey(channel: WhatsAppChannel, waId: string): string {
  return `${CHAT_PREFIX}${channel}:${normalizeWaId(waId)}`;
}

function aiPausedKey(channel: WhatsAppChannel, waId: string): string {
  return `${AI_PAUSED_PREFIX}${channel}:${normalizeWaId(waId)}`;
}

/** Legacy (pre-channel) keys — treated as cloud. */
function legacyChatKey(waId: string): string {
  return `${CHAT_PREFIX}${normalizeWaId(waId)}`;
}

function legacyAiPausedKey(waId: string): string {
  return `${AI_PAUSED_PREFIX}${normalizeWaId(waId)}`;
}

let clientPromise: Promise<RedisClientType> | null = null;

async function redis(): Promise<RedisClientType> {
  if (!clientPromise) {
    clientPromise = initializeRedisClient();
  }
  return clientPromise;
}

/**
 * If key is legacy `whatsapp:chat:{waId}`, migrate to `whatsapp:chat:cloud:{waId}`.
 * Returns the canonical key to use.
 */
async function resolveChatKey(r: RedisClientType, channel: WhatsAppChannel, waId: string): Promise<string> {
  const canonical = chatKey(channel, waId);
  if (channel !== WHATSAPP_CHANNEL_CLOUD) {
    return canonical;
  }
  const legacy = legacyChatKey(waId);
  const existsLegacy = await r.exists(legacy);
  if (!existsLegacy) {
    return canonical;
  }
  const existsNew = await r.exists(canonical);
  if (!existsNew) {
    try {
      await r.rename(legacy, canonical);
      logger.debug('[WhatsAppRedis] Migrated legacy chat key to cloud', { waId });
    } catch (e) {
      logger.warn('[WhatsAppRedis] rename legacy chat failed', { err: e });
    }
    return canonical;
  }
  const cardOld = await r.zCard(legacy);
  if (cardOld > 0) {
    const members = await r.zRangeWithScores(legacy, 0, -1);
    for (const m of members) {
      await r.zAdd(canonical, [{ score: m.score, value: m.value }]);
    }
    await r.del(legacy);
    logger.debug('[WhatsAppRedis] Merged legacy chat into cloud key', { waId });
  } else {
    await r.del(legacy);
  }
  return canonical;
}

export type AppendChatMessageOptions = {
  /** Only used when role is assistant (LLM vs operator). */
  source?: ChatMessageSource;
};

/**
 * Append a message to the sorted-set history (score = time for ordering).
 */
export async function appendChatMessage(
  channel: WhatsAppChannel,
  waId: string,
  turn: ChatTurn,
  options?: AppendChatMessageOptions
): Promise<void> {
  const r = await redis();
  const key = await resolveChatKey(r, channel, waId);
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

/**
 * Last N chat turns for LLM (oldest → newest).
 */
export async function getRecentChatTurns(
  channel: WhatsAppChannel,
  waId: string,
  limit: number
): Promise<ChatTurn[]> {
  if (limit <= 0) return [];
  const r = await redis();
  const key = await resolveChatKey(r, channel, waId);
  const capped = Math.min(limit, 100);
  /** One round-trip: last N members by rank (scores are chronological). */
  const raw = await r.zRange(key, -capped, -1);
  const out: ChatTurn[] = [];
  for (const row of raw) {
    try {
      const p = JSON.parse(row) as ChatTurn & { t?: number; source?: ChatMessageSource };
      out.push({ role: p.role, content: p.content });
    } catch {
      logger.warn('[WhatsAppRedis] Bad chat member JSON', { row: row.slice(0, 80) });
    }
  }
  return out;
}

/**
 * Full history with timestamps for admin UI (oldest → newest).
 */
export async function getChatHistoryForAdmin(
  channel: WhatsAppChannel,
  waId: string
): Promise<ChatTurnForAdmin[]> {
  const r = await redis();
  const key = await resolveChatKey(r, channel, waId);
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
      logger.warn('[WhatsAppRedis] Bad chat member JSON (admin)', { row: row.slice(0, 80) });
    }
  }
  return out;
}

export type WhatsAppChatListItem = {
  channel: WhatsAppChannel;
  waId: string;
  lastMessageAt: number;
  messageCount: number;
  aiPaused: boolean;
};

/** One row per phone: combined Cloud + Baileys threads in admin UI. */
export type WhatsAppChatAggregatedItem = {
  waId: string;
  lastMessageAt: number;
  messageCount: number;
  hasCloud: boolean;
  hasBaileys: boolean;
  aiPausedCloud: boolean;
  aiPausedBaileys: boolean;
  resolvedPhone?: string | null;
  userInfo?: {
    firstName: string;
    lastName: string;
    companyName: string | null;
  } | null;
};

export type ChatTurnForAdminMerged = ChatTurnForAdmin & {
  transport: WhatsAppChannel;
};

function parseChatRedisKey(key: string): { channel: WhatsAppChannel; waId: string } | null {
  if (!key.startsWith(CHAT_PREFIX)) return null;
  const rest = key.slice(CHAT_PREFIX.length);
  const firstSep = rest.indexOf(':');
  if (firstSep === -1) {
    return { channel: WHATSAPP_CHANNEL_CLOUD, waId: rest };
  }
  const maybeChannel = rest.slice(0, firstSep);
  const waId = rest.slice(firstSep + 1);
  if (maybeChannel === 'cloud' || maybeChannel === 'baileys') {
    return { channel: maybeChannel, waId };
  }
  return null;
}

/**
 * Discover chat keys via SCAN (legacy + channel-prefixed).
 */
export async function listWhatsAppChats(): Promise<WhatsAppChatListItem[]> {
  const r = await redis();
  const seen = new Set<string>();
  const out: WhatsAppChatListItem[] = [];

  for await (const key of r.scanIterator({ MATCH: `${CHAT_PREFIX}*`, COUNT: 200 })) {
    if (typeof key !== 'string' || !key.startsWith(CHAT_PREFIX)) continue;

    const parsed = parseChatRedisKey(key);
    if (!parsed) continue;

    const { channel, waId } = parsed;
    if (!waId) continue;

    const dedupe = `${channel}:${waId}`;
    if (seen.has(dedupe)) continue;

    let effectiveKey = key;
    if (channel === WHATSAPP_CHANNEL_CLOUD && !key.includes(':cloud:')) {
      effectiveKey = await resolveChatKey(r, WHATSAPP_CHANNEL_CLOUD, waId);
    }

    const messageCount = await r.zCard(effectiveKey);
    if (messageCount === 0) continue;

    seen.add(dedupe);

    const last = await r.zRangeWithScores(effectiveKey, -1, -1);
    const lastScore = last[0]?.score ?? 0;
    const aiPaused = await isAiPausedForChat(channel, waId);
    out.push({
      channel,
      waId,
      lastMessageAt: lastScore,
      messageCount,
      aiPaused
    });
  }

  out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return out;
}

/**
 * Group per-channel chat rows by normalized waId (single entry per phone in admin list).
 */
export async function listWhatsAppChatsAggregated(): Promise<WhatsAppChatAggregatedItem[]> {
  const flat = await listWhatsAppChats();
  const byWa = new Map<
    string,
    { cloud?: WhatsAppChatListItem; baileys?: WhatsAppChatListItem }
  >();

  for (const row of flat) {
    const n = normalizeWaId(row.waId);
    const cur = byWa.get(n) || {};
    if (row.channel === WHATSAPP_CHANNEL_CLOUD) {
      cur.cloud = row;
    } else {
      cur.baileys = row;
    }
    byWa.set(n, cur);
  }

  const out: WhatsAppChatAggregatedItem[] = [];
  for (const [waId, x] of byWa) {
    const hasCloud = Boolean(x.cloud);
    const hasBaileys = Boolean(x.baileys);
    const lastMessageAt = Math.max(x.cloud?.lastMessageAt ?? 0, x.baileys?.lastMessageAt ?? 0);
    const messageCount = (x.cloud?.messageCount ?? 0) + (x.baileys?.messageCount ?? 0);
    out.push({
      waId,
      lastMessageAt,
      messageCount,
      hasCloud,
      hasBaileys,
      aiPausedCloud: x.cloud?.aiPaused ?? false,
      aiPausedBaileys: x.baileys?.aiPaused ?? false
    });
  }

  out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return out;
}

/**
 * Single timeline: messages from cloud and baileys Redis zsets, sorted by `t`.
 */
export async function getMergedChatHistoryForAdmin(waId: string): Promise<ChatTurnForAdminMerged[]> {
  const norm = normalizeWaId(waId);
  const cloud = await getChatHistoryForAdmin(WHATSAPP_CHANNEL_CLOUD, norm);
  const baileys = await getChatHistoryForAdmin(WHATSAPP_CHANNEL_BAILEYS, norm);

  const merged: ChatTurnForAdminMerged[] = [
    ...cloud.map((m) => ({ ...m, transport: WHATSAPP_CHANNEL_CLOUD })),
    ...baileys.map((m) => ({ ...m, transport: WHATSAPP_CHANNEL_BAILEYS }))
  ];

  merged.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (a.transport !== b.transport) {
      return a.transport === WHATSAPP_CHANNEL_CLOUD ? -1 : 1;
    }
    return 0;
  });

  return merged;
}

/** Apply pause flag to both transports for this number (admin unified toggle). */
export async function setAiPausedBothChannels(waId: string, paused: boolean): Promise<void> {
  const norm = normalizeWaId(waId);
  await setAiPausedForChat(WHATSAPP_CHANNEL_CLOUD, norm, paused);
  await setAiPausedForChat(WHATSAPP_CHANNEL_BAILEYS, norm, paused);
}

/**
 * Which transport may run LLM auto-reply (mutually exclusive). Default cloud when unset.
 */
export async function getGlobalAutoReplyMode(): Promise<WhatsAppGlobalAutoReplyMode> {
  const r = await redis();
  const v = await r.get(GLOBAL_AUTO_REPLY_MODE_KEY);
  return parseGlobalAutoReplyModeValue(v);
}

export async function setGlobalAutoReplyMode(mode: WhatsAppGlobalAutoReplyMode): Promise<void> {
  const r = await redis();
  await r.set(GLOBAL_AUTO_REPLY_MODE_KEY, mode);
  invalidateWhatsAppReplyGuardsCache();
}

export async function isAiPausedForChat(channel: WhatsAppChannel, waId: string): Promise<boolean> {
  const r = await redis();
  const k = aiPausedKey(channel, waId);
  let v = await r.get(k);
  if (v === '1') return true;
  if (channel === WHATSAPP_CHANNEL_CLOUD) {
    const legacy = legacyAiPausedKey(waId);
    v = await r.get(legacy);
    if (v === '1') {
      try {
        await r.rename(legacy, k);
      } catch {
        await r.set(k, '1', { EX: 30 * 24 * 3600 });
        await r.del(legacy);
      }
      return true;
    }
  }
  return false;
}

/**
 * When true, the worker skips LLM auto-replies for this chat (operator handles).
 */
export async function setAiPausedForChat(channel: WhatsAppChannel, waId: string, paused: boolean): Promise<void> {
  const r = await redis();
  const k = aiPausedKey(channel, waId);
  if (paused) {
    await r.set(k, '1', { EX: 30 * 24 * 3600 });
  } else {
    await r.del(k);
    if (channel === WHATSAPP_CHANNEL_CLOUD) {
      await r.del(legacyAiPausedKey(waId));
    }
  }
  invalidateWhatsAppReplyGuardsCache();
}

/** Redis list for admin-initiated Baileys outbound (worker consumes). */
export const WHATSAPP_BAILEYS_OUTBOUND_QUEUE = 'whatsapp:baileys:outbound';

export type BaileysOutboundJob = {
  waId: string;
  text: string;
  enqueuedAt: number;
};

/**
 * Enqueue a manual reply for the Baileys worker (RPUSH JSON; worker uses BLPOP — FIFO).
 */
export async function enqueueBaileysOutbound(job: Omit<BaileysOutboundJob, 'enqueuedAt'>): Promise<void> {
  const r = await redis();
  const payload: BaileysOutboundJob = { ...job, enqueuedAt: Date.now() };
  await r.rPush(WHATSAPP_BAILEYS_OUTBOUND_QUEUE, JSON.stringify(payload));
}

/** Baileys session state for admin UI (written by worker). */
export const WHATSAPP_BAILEYS_STATUS_KEY = 'whatsapp:baileys:connection';
export const WHATSAPP_BAILEYS_QR_KEY = 'whatsapp:baileys:qr';

export type BaileysConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export async function setBaileysSessionState(status: BaileysConnectionStatus, qr: string | null): Promise<void> {
  const r = await redis();
  await r.set(WHATSAPP_BAILEYS_STATUS_KEY, status, { EX: 3600 });
  if (qr) {
    await r.set(WHATSAPP_BAILEYS_QR_KEY, qr, { EX: 600 });
  } else {
    await r.del(WHATSAPP_BAILEYS_QR_KEY);
  }
}

/** Redis PubSub channel for admin -> Baileys worker commands. */
export const WHATSAPP_BAILEYS_ADMIN_CMD_CHANNEL = 'whatsapp:baileys:admin_cmd';
export const WHATSAPP_BAILEYS_ADMIN_CMD_QUEUE = 'whatsapp:baileys:admin_cmd_queue';

export type BaileysAdminCommand = 'reset';

export async function publishBaileysAdminCommand(cmd: BaileysAdminCommand): Promise<void> {
  const r = await redis();
  await r.publish(WHATSAPP_BAILEYS_ADMIN_CMD_CHANNEL, cmd);
}

/**
 * Durable command enqueue for Baileys worker admin actions.
 * Unlike PubSub, queued commands survive worker restarts.
 */
export async function enqueueBaileysAdminCommand(cmd: BaileysAdminCommand): Promise<void> {
  const r = await redis();
  await r.rPush(WHATSAPP_BAILEYS_ADMIN_CMD_QUEUE, cmd);
}

export async function getBaileysSessionState(): Promise<{
  status: BaileysConnectionStatus | null;
  qr: string | null;
}> {
  const r = await redis();
  const statusRaw = await r.get(WHATSAPP_BAILEYS_STATUS_KEY);
  const qr = await r.get(WHATSAPP_BAILEYS_QR_KEY);
  const status =
    statusRaw === 'connecting' || statusRaw === 'connected' || statusRaw === 'disconnected'
      ? statusRaw
      : null;
  return { status, qr };
}
