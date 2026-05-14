import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

/**
 * Short fragments — used only when `LGDEAL_AI_Knowledge_Base_EN.md` is missing or empty.
 * When the knowledge base is present, it supersedes these (Part A already covers role/tone/CTA/safety).
 */
const WHATSAPP_DOCS_FALLBACK_FILES = [
  '01_Marketing_Role_And_Goals.md',
  '02_Tone_And_Format.md',
  '03_CTA_And_Links.md',
  '04_Safe_Behavior_Rules.md'
] as const;

const KNOWLEDGE_BASE_FILE = 'LGDEAL_AI_Knowledge_Base_EN.md';

/** After filtering, KB can be large; cap avoids runaway context cost. */
const MAX_DOCS_CHARS = 48000;

function resolveDocsDir(): string {
  if (process.env.WHATSAPP_AI_DOCS_PATH) {
    return path.resolve(process.env.WHATSAPP_AI_DOCS_PATH);
  }
  const cwd = process.cwd();
  const nextToCwd = path.join(cwd, 'whatsapp-ai-docs');
  if (fs.existsSync(nextToCwd)) {
    return nextToCwd;
  }
  return path.join(cwd, '..', 'whatsapp-ai-docs');
}

let cachedPromptFromDocs: string | null = null;

/**
 * Remove internal ops blurb and support-only sections that duplicate Part A / bloat tokens.
 * Keeps: Global rules, Parts A–D, G (WhatsApp marketing + platform + UI + FAQ + product).
 * Drops: Part E (support-safe, overlaps A.7), Part F (embedded support system prompt for web chat).
 */
export function filterKnowledgeBaseForWhatsAppMarkdown(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n');
  s = s.replace(/\*\*Deploy:\*\*[\s\S]*?(?=\n### |\n## Global rules)/, '');
  s = s.replace(/\n# Part E —[\s\S]*?(?=\n# Part F —)/, '\n');
  s = s.replace(/\n# Part F —[\s\S]*?(?=\n# Part G —)/, '\n');
  return s.trim();
}

function loadFallbackFragments(dir: string): string {
  const parts: string[] = [];
  try {
    for (const file of WHATSAPP_DOCS_FALLBACK_FILES) {
      const filePath = path.join(dir, file);
      if (fs.existsSync(filePath)) {
        parts.push(fs.readFileSync(filePath, 'utf8'));
      } else {
        logger.warn('[WhatsAppDocs] Missing file', { filePath });
      }
    }
  } catch (err) {
    logger.error('[WhatsAppDocs] Failed to read fallback docs:', err);
    return '';
  }
  return parts.join('\n\n---\n\n').trim();
}

/**
 * Load marketing system text from `LGDEAL_AI_Knowledge_Base_EN.md` when present (filtered),
 * else concatenate `01`–`04` fragments. Cached for process lifetime.
 */
export function loadWhatsAppMarketingDocsPrompt(): string {
  if (cachedPromptFromDocs !== null) {
    return cachedPromptFromDocs;
  }

  const dir = resolveDocsDir();
  const kbPath = path.join(dir, KNOWLEDGE_BASE_FILE);

  let combined = '';

  if (fs.existsSync(kbPath)) {
    try {
      const kbRaw = fs.readFileSync(kbPath, 'utf8');
      const filtered = filterKnowledgeBaseForWhatsAppMarkdown(kbRaw);
      if (filtered.length >= 800) {
        combined = filtered;
        logger.debug('[WhatsAppDocs] Using filtered knowledge base', {
          file: KNOWLEDGE_BASE_FILE,
          chars: filtered.length
        });
      }
    } catch (err) {
      logger.error('[WhatsAppDocs] Failed to read knowledge base:', err);
    }
  }

  if (!combined) {
    combined = loadFallbackFragments(dir);
    if (combined) {
      logger.debug('[WhatsAppDocs] Using fallback fragments (01–04)', { dir });
    }
  }

  if (combined.length > MAX_DOCS_CHARS) {
    combined =
      combined.slice(0, MAX_DOCS_CHARS) +
      '\n\n[... whatsapp-ai-docs truncated at ' +
      MAX_DOCS_CHARS +
      ' characters; see full LGDEAL_AI_Knowledge_Base_EN.md in repo ...]';
  }

  cachedPromptFromDocs = combined;
  return combined;
}

/** For tests / hot-reload experiments only */
export function clearWhatsAppDocsCache(): void {
  cachedPromptFromDocs = null;
}
