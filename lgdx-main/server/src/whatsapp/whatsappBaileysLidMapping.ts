import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { initializeRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import {
  remoteJidToStableWaId,
  stableWaIdFromBaileysMessageKey,
  waIdToBaileysJid,
} from './whatsappWaId.utils';

const REDIS_PREFIX = 'whatsapp:baileys:lid_pn:';
const TTL_SEC = 60 * 24 * 3600;

/** In-process cache: avoid Redis GET on every outbound when mapping is warm (same process as Baileys). */
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_MAX_KEYS = 3000;
const lidPnMemory = new Map<string, { pn: string; exp: number }>();

function memoryLidPnGet(digits: string): string | null {
  const row = lidPnMemory.get(digits);
  if (!row) return null;
  if (row.exp < Date.now()) {
    lidPnMemory.delete(digits);
    return null;
  }
  return row.pn;
}

function memoryLidPnSet(digits: string, pn: string): void {
  while (lidPnMemory.size >= MEMORY_MAX_KEYS) {
    const first = lidPnMemory.keys().next().value;
    if (first === undefined) break;
    lidPnMemory.delete(first);
  }
  lidPnMemory.set(digits, { pn, exp: Date.now() + MEMORY_TTL_MS });
}

function lidDigitsFromJid(jid: string): string | null {
  const u = jidNormalizedUser(jid) || jid;
  if (!u.endsWith('@lid')) return null;
  const user = u.split('@')[0] || '';
  const digits = user.replace(/\D/g, '');
  return digits || null;
}

/**
 * WhatsApp links LID (@lid) to a phone JID (@s.whatsapp.net). We learn this from
 * `chats.phoneNumberShare` and use the phone JID for outbound — replies to raw @lid
 * often do not reach the user's app reliably.
 */
export async function rememberLidToPhoneJid(lidJid: string, phoneJid: string): Promise<void> {
  const digits = lidDigitsFromJid(lidJid);
  if (!digits) return;
  const pn = jidNormalizedUser(phoneJid) || phoneJid;
  const r = await initializeRedisClient();
  await r.set(`${REDIS_PREFIX}${digits}`, pn, { EX: TTL_SEC });
  memoryLidPnSet(digits, pn);
}

/**
 * Stable waId for Redis + LLM: same bucket as "Send message" to E.164 waId, even when
 * the inbound event uses `@lid` (and optional `remoteJidAlt` PN).
 */
export async function resolveInboundBaileysWaId(key: {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
}): Promise<string> {
  const remote = key.remoteJid?.trim();
  const alt = key.remoteJidAlt?.trim();
  if (remote && alt) {
    const rNorm = jidNormalizedUser(remote) || remote;
    const aNorm = jidNormalizedUser(alt) || alt;
    if (rNorm.endsWith('@lid') && aNorm.endsWith('@s.whatsapp.net')) {
      await rememberLidToPhoneJid(rNorm, aNorm);
    } else if (aNorm.endsWith('@lid') && rNorm.endsWith('@s.whatsapp.net')) {
      await rememberLidToPhoneJid(aNorm, rNorm);
    }
  }

  let waId = stableWaIdFromBaileysMessageKey(key);
  if (!waId.startsWith('lid_')) {
    return waId;
  }

  if (!remote) {
    return waId;
  }

  const u = jidNormalizedUser(remote) || remote;
  if (!u.endsWith('@lid')) {
    return waId;
  }

  const digits = lidDigitsFromJid(u);
  if (!digits) {
    return waId;
  }

  const mem = memoryLidPnGet(digits);
  if (mem?.length) {
    return remoteJidToStableWaId(mem);
  }

  const r = await initializeRedisClient();
  const pn = await r.get(`${REDIS_PREFIX}${digits}`);
  if (pn?.length) {
    memoryLidPnSet(digits, pn);
    return remoteJidToStableWaId(pn);
  }

  return waId;
}

/**
 * Prefer cached phone JID when the peer is @lid; otherwise use baileysRemoteJid or waId.
 */
export async function resolveOutboundJid(baileysRemoteJid: string | undefined, waId: string): Promise<string> {
  const base =
    baileysRemoteJid && baileysRemoteJid.trim().length > 0
      ? baileysRemoteJid.trim()
      : waIdToBaileysJid(waId);
  const norm = jidNormalizedUser(base) || base;
  if (!norm.endsWith('@lid')) return norm;

  const digits = lidDigitsFromJid(norm);
  if (!digits) return norm;

  const mem = memoryLidPnGet(digits);
  if (mem?.length) {
    return mem;
  }

  const r = await initializeRedisClient();
  const pn = await r.get(`${REDIS_PREFIX}${digits}`);
  if (pn?.length) {
    memoryLidPnSet(digits, pn);
    return pn;
  }
  logger.warn(
    '[WhatsAppBaileys] No LID→phone mapping in Redis; sending to @lid (peer may not see the message until mapping exists)'
  );
  return norm;
}
