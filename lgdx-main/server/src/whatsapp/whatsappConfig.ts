import fs from 'fs';
import { DEFAULT_WHATSAPP_MARKETING_SYSTEM_PROMPT } from '../config/whatsappMarketingPrompt';
import type { WhatsAppChannel } from './whatsapp.types';
import { WHATSAPP_CHANNEL_BAILEYS } from './whatsapp.types';
import { getWhatsAppMarketingPromptResolved } from '../services/botPromptService';

function readSecretFile(envName: string): string | undefined {
  const filePath = process.env[`${envName}_FILE`];
  if (!filePath) return undefined;
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return undefined;
  }
}

export function isWhatsAppIntegrationEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === 'true';
}

/** Baileys worker + admin outbound queue (unofficial client). */
export function isWhatsAppBaileysEnabled(): boolean {
  return process.env.WHATSAPP_BAILEYS_ENABLED === 'true';
}

export function getWhatsAppVerifyToken(): string | undefined {
  return readSecretFile('WHATSAPP_VERIFY_TOKEN') || process.env.WHATSAPP_VERIFY_TOKEN;
}

export function getWhatsAppAccessToken(): string | undefined {
  return readSecretFile('WHATSAPP_ACCESS_TOKEN') || process.env.WHATSAPP_ACCESS_TOKEN;
}

export function getWhatsAppPhoneNumberId(): string | undefined {
  return readSecretFile('WHATSAPP_PHONE_NUMBER_ID') || process.env.WHATSAPP_PHONE_NUMBER_ID;
}

export function getWhatsAppAppSecret(): string | undefined {
  return readSecretFile('WHATSAPP_APP_SECRET') || process.env.WHATSAPP_APP_SECRET;
}

export function getWhatsAppGraphApiVersion(): string {
  return process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
}

/**
 * Priority: file env → WHATSAPP_SYSTEM_PROMPT env → DB snapshot / `whatsapp-ai-docs` → code fallback.
 */
export async function getWhatsAppMarketingSystemPrompt(): Promise<string> {
  const fromFile = process.env.WHATSAPP_SYSTEM_PROMPT_FILE;
  if (fromFile) {
    try {
      return fs.readFileSync(fromFile, 'utf8').trim();
    } catch {
      /* fall through */
    }
  }
  if (process.env.WHATSAPP_SYSTEM_PROMPT && process.env.WHATSAPP_SYSTEM_PROMPT.trim()) {
    return process.env.WHATSAPP_SYSTEM_PROMPT.trim();
  }

  const fromDocs = await getWhatsAppMarketingPromptResolved();
  if (fromDocs) {
    return fromDocs;
  }

  return DEFAULT_WHATSAPP_MARKETING_SYSTEM_PROMPT;
}

/**
 * Load marketing prompt + docs into memory once (Baileys worker startup) so the first
 * inbound message does not pay disk I/O on the hot path.
 */
export function warmWhatsAppMarketingPromptAtStartup(): void {
  void getWhatsAppMarketingSystemPrompt().catch(() => {
    /* non-fatal */
  });
}

export function getWhatsAppOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL_WHATSAPP || process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
}

export function getWhatsAppOpenRouterModelForChannel(channel: WhatsAppChannel): string {
  if (channel === WHATSAPP_CHANNEL_BAILEYS && process.env.OPENROUTER_MODEL_WHATSAPP_BAILEYS?.trim()) {
    return process.env.OPENROUTER_MODEL_WHATSAPP_BAILEYS.trim();
  }
  return getWhatsAppOpenRouterModel();
}

/** Telegram user (MTProto) marketing bot — defaults to same model as WhatsApp Cloud. */
export function getTelegramUserOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL_TELEGRAM_USER?.trim() || getWhatsAppOpenRouterModel();
}
