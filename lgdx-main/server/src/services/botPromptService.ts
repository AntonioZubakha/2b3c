import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import BotPromptSnapshot, { BotPromptBotId, IBotPromptSnapshot } from '../models/BotPromptSnapshot';
import { logger } from '../utils/logger';
import {
  filterKnowledgeBaseForWhatsAppMarkdown,
  loadWhatsAppMarketingDocsPrompt,
  clearWhatsAppDocsCache,
} from '../whatsapp/whatsappDocsLoader';

/** Ordered concat for Support AI (matches chatAiService former file order). */
export const SUPPORT_PROMPT_FILE_ORDER = [
  '00_README.md',
  '01_Project_Overview.md',
  '02_Where_To_Fill_And_View.md',
  '03_User_Flows_And_FAQ.md',
  '04_Safe_Behavior_Rules.md',
  '05_Support_Agent_Prompt.md',
  '06_LabGrown_Product_Knowledge.md',
] as const;

const WHATSAPP_FRAGMENT_FILES = [
  '01_Marketing_Role_And_Goals.md',
  '02_Tone_And_Format.md',
  '03_CTA_And_Links.md',
  '04_Safe_Behavior_Rules.md',
] as const;

const KNOWLEDGE_BASE_FILE = 'LGDEAL_AI_Knowledge_Base_EN.md';

const MAX_CHARS_PER_FILE = 200_000;
const MAX_TOTAL_CHARS_PER_BOT = 800_000;

const SUPPORT_SET = new Set<string>(SUPPORT_PROMPT_FILE_ORDER);
const WHATSAPP_SET = new Set<string>([KNOWLEDGE_BASE_FILE, ...WHATSAPP_FRAGMENT_FILES]);

const DOCS_DIR_SUPPORT =
  process.env.SUPPORT_AI_DOCS_PATH ||
  (fs.existsSync(path.join(process.cwd(), 'support-ai-docs'))
    ? path.join(process.cwd(), 'support-ai-docs')
    : path.join(process.cwd(), '..', 'support-ai-docs'));

function resolveWhatsAppDir(): string {
  if (process.env.WHATSAPP_AI_DOCS_PATH) {
    return path.resolve(process.env.WHATSAPP_AI_DOCS_PATH);
  }
  const cwd = process.cwd();
  const nextToCwd = path.join(cwd, 'whatsapp-ai-docs');
  if (fs.existsSync(nextToCwd)) return nextToCwd;
  return path.join(cwd, '..', 'whatsapp-ai-docs');
}

function loadSupportDocsFromDisk(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const file of SUPPORT_PROMPT_FILE_ORDER) {
      const fp = path.join(DOCS_DIR_SUPPORT, file);
      if (fs.existsSync(fp)) {
        out[file] = fs.readFileSync(fp, 'utf8');
      }
    }
  } catch (e) {
    logger.error('[BotPrompts] Failed to read support-ai-docs from disk', { error: e });
  }
  return out;
}

function loadWhatsAppDocsFromDisk(): Record<string, string> {
  const dir = resolveWhatsAppDir();
  const out: Record<string, string> = {};
  try {
    const keys = [KNOWLEDGE_BASE_FILE, ...WHATSAPP_FRAGMENT_FILES];
    for (const file of keys) {
      const fp = path.join(dir, file);
      if (fs.existsSync(fp)) {
        out[file] = fs.readFileSync(fp, 'utf8');
      }
    }
  } catch (e) {
    logger.error('[BotPrompts] Failed to read whatsapp-ai-docs from disk', { error: e });
  }
  return out;
}

function validateFiles(bot: BotPromptBotId, files: Record<string, string>): void {
  if (!files || Object.keys(files).length === 0) {
    throw new Error('At least one file must be provided');
  }
  const allowed = bot === 'support' ? SUPPORT_SET : WHATSAPP_SET;
  let total = 0;
  for (const [name, content] of Object.entries(files)) {
    if (!allowed.has(name)) {
      throw new Error(`Invalid filename for ${bot}: ${name}`);
    }
    if (typeof content !== 'string') {
      throw new Error(`Invalid content for ${name}`);
    }
    if (content.length > MAX_CHARS_PER_FILE) {
      throw new Error(`File ${name} exceeds max length (${MAX_CHARS_PER_FILE})`);
    }
    total += content.length;
  }
  if (total > MAX_TOTAL_CHARS_PER_BOT) {
    throw new Error(`Total content exceeds max (${MAX_TOTAL_CHARS_PER_BOT} characters)`);
  }
}

export function concatSupportFiles(files: Record<string, string>): string {
  const parts: string[] = [];
  for (const file of SUPPORT_PROMPT_FILE_ORDER) {
    const c = files[file];
    if (c) parts.push(c);
  }
  return parts.join('\n\n---\n\n');
}

const MAX_WHATSAPP_DOCS_CHARS = 48_000;

/** Same selection logic as loadWhatsAppMarketingDocsPrompt, but from an in-memory record. */
export function buildWhatsAppPromptFromFilesRecord(files: Record<string, string>): string {
  let combined = '';
  const kbRaw = files[KNOWLEDGE_BASE_FILE];
  if (kbRaw) {
    const filtered = filterKnowledgeBaseForWhatsAppMarkdown(kbRaw);
    if (filtered.length >= 800) {
      combined = filtered;
      logger.debug('[BotPrompts] WhatsApp prompt from DB KB', { chars: filtered.length });
    }
  }
  if (!combined) {
    const parts: string[] = [];
    for (const file of WHATSAPP_FRAGMENT_FILES) {
      if (files[file]) parts.push(files[file]);
    }
    combined = parts.join('\n\n---\n\n').trim();
  }
  if (combined.length > MAX_WHATSAPP_DOCS_CHARS) {
    combined =
      combined.slice(0, MAX_WHATSAPP_DOCS_CHARS) +
      '\n\n[... whatsapp prompt truncated at ' +
      MAX_WHATSAPP_DOCS_CHARS +
      ' characters ...]';
  }
  return combined;
}

async function getLatestSnapshotDoc(
  bot: BotPromptBotId
): Promise<IBotPromptSnapshot | null> {
  const doc = await BotPromptSnapshot.findOne({ bot }).sort({ updatedAt: -1 }).lean();
  return doc as IBotPromptSnapshot | null;
}

export type BotPromptSource = 'database' | 'filesystem';

export interface EffectivePromptPayload {
  bot: BotPromptBotId;
  /** Suggested tab order for the editor (matches former .md filenames). */
  fileOrder: string[];
  files: Record<string, string>;
  source: BotPromptSource;
  /** Present when source is database: id of the latest snapshot row (for UI: disable Restore on current). */
  currentSnapshotId?: string;
  updatedAt?: Date;
  updatedBy?: { _id: string; firstName: string; lastName: string; email: string };
  changeNote?: string;
}

async function populateUser(
  userId?: mongoose.Types.ObjectId
): Promise<EffectivePromptPayload['updatedBy']> {
  if (!userId) return undefined;
  const User = require('../models/User').default;
  const u = await User.findById(userId).select('firstName lastName email').lean();
  if (!u) return undefined;
  return {
    _id: u._id.toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
  };
}

/**
 * Effective files for admin UI and export: DB snapshot if any; otherwise disk.
 */
export async function getEffectivePromptPayload(bot: BotPromptBotId): Promise<EffectivePromptPayload> {
  const snap = await getLatestSnapshotDoc(bot);
  if (snap && snap.files && Object.keys(snap.files as Record<string, string>).length > 0) {
    return {
      bot,
      fileOrder:
        bot === 'support'
          ? [...SUPPORT_PROMPT_FILE_ORDER]
          : [KNOWLEDGE_BASE_FILE, ...WHATSAPP_FRAGMENT_FILES],
      files: snap.files as Record<string, string>,
      source: 'database',
      currentSnapshotId: snap._id.toString(),
      updatedAt: snap.updatedAt,
      updatedBy: await populateUser(snap.updatedBy),
      changeNote: snap.changeNote,
    };
  }
  const files = bot === 'support' ? loadSupportDocsFromDisk() : loadWhatsAppDocsFromDisk();
  return {
    bot,
    fileOrder:
      bot === 'support'
        ? [...SUPPORT_PROMPT_FILE_ORDER]
        : [KNOWLEDGE_BASE_FILE, ...WHATSAPP_FRAGMENT_FILES],
    files,
    source: 'filesystem',
  };
}

export interface BotPromptHistoryMeta {
  _id: string;
  bot: BotPromptBotId;
  updatedAt: Date;
  changeNote: string;
  updatedBy?: EffectivePromptPayload['updatedBy'];
  fileKeys: string[];
  totalChars: number;
}

export async function getHistory(bot: BotPromptBotId, limit: number): Promise<BotPromptHistoryMeta[]> {
  const rows = await BotPromptSnapshot.find({ bot })
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();

  const out: BotPromptHistoryMeta[] = [];
  for (const row of rows) {
    const files = (row.files || {}) as Record<string, string>;
    const fileKeys = Object.keys(files);
    let totalChars = 0;
    for (const k of fileKeys) totalChars += (files[k] || '').length;
    out.push({
      _id: row._id.toString(),
      bot: row.bot as BotPromptBotId,
      updatedAt: row.updatedAt,
      changeNote: row.changeNote || '',
      updatedBy: await populateUser(row.updatedBy),
      fileKeys,
      totalChars,
    });
  }
  return out;
}

export async function getSnapshotById(id: string): Promise<EffectivePromptPayload | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const snap = await BotPromptSnapshot.findById(id).lean();
  if (!snap) return null;
  const b = snap.bot as BotPromptBotId;
  return {
    bot: b,
    fileOrder:
      b === 'support'
        ? [...SUPPORT_PROMPT_FILE_ORDER]
        : [KNOWLEDGE_BASE_FILE, ...WHATSAPP_FRAGMENT_FILES],
    files: snap.files as Record<string, string>,
    source: 'database',
    updatedAt: snap.updatedAt,
    updatedBy: await populateUser(snap.updatedBy),
    changeNote: snap.changeNote,
  };
}

export async function savePrompts(
  bot: BotPromptBotId,
  files: Record<string, string>,
  userId: mongoose.Types.ObjectId,
  changeNote: string
): Promise<EffectivePromptPayload> {
  validateFiles(bot, files);
  await new BotPromptSnapshot({
    bot,
    files,
    updatedBy: userId,
    changeNote: changeNote.trim().slice(0, 500) || 'Update',
    updatedAt: new Date(),
  }).save();

  clearSupportPromptCache();
  clearWhatsAppDocsCache();

  logger.info('[BotPrompts] Saved snapshot', { bot, userId: userId.toString() });
  return getEffectivePromptPayload(bot);
}

/** Restore: copy historical snapshot to a new snapshot row. */
export async function restoreSnapshot(
  snapshotId: string,
  userId: mongoose.Types.ObjectId,
  changeNote: string
): Promise<EffectivePromptPayload | null> {
  const prev = await BotPromptSnapshot.findById(snapshotId).lean();
  if (!prev) return null;
  const files = prev.files as Record<string, string>;
  return savePrompts(prev.bot as BotPromptBotId, files, userId, changeNote || `Restore ${snapshotId}`);
}

// --- Runtime resolution for AI services (DB → filesystem fallback) ---

let supportPromptCache: { content: string; expires: number } | null = null;
const SUPPORT_CACHE_TTL_MS = 60_000;

export function clearSupportPromptCache(): void {
  supportPromptCache = null;
}

export async function getSupportDocumentationForAi(): Promise<string> {
  const now = Date.now();
  if (supportPromptCache && supportPromptCache.expires > now) {
    return supportPromptCache.content;
  }

  const snap = await getLatestSnapshotDoc('support');
  let content: string;
  if (snap?.files && Object.keys(snap.files as object).length > 0) {
    content = concatSupportFiles(snap.files as Record<string, string>);
  } else {
    const disk = loadSupportDocsFromDisk();
    content = concatSupportFiles(disk);
  }

  if (!content.trim()) {
    content =
      'You are a support assistant for LGDEAL. Answer only from the provided documentation. If unsure, ask the user to contact support.';
  }

  supportPromptCache = { content, expires: now + SUPPORT_CACHE_TTL_MS };
  return content;
}

/**
 * Resolve the WhatsApp marketing system prompt: latest DB snapshot if available,
 * otherwise the on-disk `whatsapp-ai-docs` bundle. Wrapped in try/catch so that a
 * MongoDB outage (or worker started without a Mongo connection) cannot break the
 * inbound message pipeline — workers must still be able to ingest and store
 * incoming user messages even when the DB-backed prompt is unreachable.
 */
export async function getWhatsAppMarketingPromptResolved(): Promise<string> {
  try {
    const snap = await getLatestSnapshotDoc('whatsapp');
    if (snap?.files && Object.keys(snap.files as object).length > 0) {
      return buildWhatsAppPromptFromFilesRecord(snap.files as Record<string, string>);
    }
  } catch (err) {
    logger.warn('[BotPrompts] WhatsApp prompt DB lookup failed; using disk fallback', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
  return loadWhatsAppMarketingDocsPrompt();
}
