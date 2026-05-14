import { isLidUser, jidNormalizedUser } from '@whiskeysockets/baileys';

/**
 * Canonical id for Redis keys and APIs.
 * - E.164-style chats: digits only (e.g. "254712345678").
 * - Baileys LID chats: "lid_" + numeric LID (not a phone number — do not show as +).
 */
export function normalizeWaId(raw: string): string {
  const t = raw.trim();
  if (/^lid_\d+$/.test(t)) return t;
  return t.replace(/\D/g, '') || t;
}

/**
 * Map inbound Baileys remote JID to a stable waId for storage and UI.
 */
export function remoteJidToStableWaId(remote: string): string {
  const u = jidNormalizedUser(remote) || remote;
  const user = u.split('@')[0] || '';
  const server = u.split('@')[1] || '';
  if (server === 'lid' || isLidUser(remote)) {
    const digits = user.replace(/\D/g, '');
    return digits ? `lid_${digits}` : `lid_${user}`;
  }
  const digits = user.replace(/\D/g, '');
  return digits || user;
}

/**
 * Prefer phone JID (`@s.whatsapp.net`) when Baileys uses LID as `remoteJid` and
 * attaches the PN on `remoteJidAlt` (v6.6+). Keeps one admin thread / Redis key for
 * outbound phone sends vs inbound @lid replies.
 */
export function stableWaIdFromBaileysMessageKey(key: {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
}): string {
  const remote = key.remoteJid?.trim() || '';
  if (!remote) return '';

  const alt = key.remoteJidAlt?.trim() || '';
  const candidates = [remote, alt].filter((x) => x.length > 0);

  for (const jid of candidates) {
    const u = jidNormalizedUser(jid) || jid;
    if (u.endsWith('@s.whatsapp.net')) {
      return remoteJidToStableWaId(u);
    }
  }

  return remoteJidToStableWaId(remote);
}

/** Target JID for Baileys sendMessage from a canonical waId. */
export function waIdToBaileysJid(waId: string): string {
  const t = waId.trim();
  if (t.startsWith('lid_')) {
    const d = t.slice(4).replace(/\D/g, '');
    return `${d}@lid`;
  }
  const d = t.replace(/\D/g, '');
  return `${d}@s.whatsapp.net`;
}
