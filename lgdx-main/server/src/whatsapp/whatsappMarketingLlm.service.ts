import fs from 'fs';
import { performance } from 'node:perf_hooks';
import { logger } from '../utils/logger';
import {
  getWhatsAppMarketingSystemPrompt,
  getWhatsAppOpenRouterModelForChannel,
  getTelegramUserOpenRouterModel
} from './whatsappConfig';
import type { WhatsAppChannel } from './whatsapp.types';
import type { ChatTurn } from './whatsappRedis.service';
import type { WhatsAppPipelineTimer } from './whatsappPipelineTiming';
import {
  buildAudiencePromptSectionForRole,
  getCompanyPlatformRoleByWaId,
  getCompanyPlatformRoleByTelegramId,
  type CompanyPlatformRole
} from '../utils/companyPlatformRole';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Slightly generous for natural WhatsApp length (multiple short lines + soft CTA). */
const MAX_TOKENS = 640;
const TEMPERATURE = 0.65;

/** Avoid replying as if the customer were the business (e.g. after operator sent from phone). */
const ROLE_DISAMBIGUATION = `
Roles in the transcript: "user" = the external customer messaging the business. "assistant" = your business (bot or human staff).
Always answer the customer’s latest "user" message. Do not address the customer as if they were your support agent or company representative; do not reuse staff signatures or “I am Anton” style lines toward the customer.`;

function getOpenRouterApiKey(): string | null {
  const filePath = process.env.OPENROUTER_API_KEY_FILE;
  if (filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error('[WhatsAppLLM] Failed to read OPENROUTER_API_KEY_FILE:', e);
      return null;
    }
  }
  return process.env.OPENROUTER_API_KEY || null;
}

/**
 * Same marketing system prompt, docs, and audience rules as WhatsApp (Cloud/Baileys) — for Telegram user (MTProto) bot.
 */
export async function generateMarketingReplyWithWhatsAppSystemPrompt(
  history: ChatTurn[],
  latestUserText: string,
  model: string,
  getPlatformRole: () => Promise<CompanyPlatformRole | undefined>,
  timer: WhatsAppPipelineTimer | null | undefined,
  logTag: string
): Promise<string | null> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    logger.error(`${logTag} OPENROUTER_API_KEY not configured`);
    return null;
  }

  const tBuild0 = performance.now();
  const companyRole = await getPlatformRole();
  const audienceBlock = buildAudiencePromptSectionForRole(companyRole, 'whatsapp');
  const system = `${(await getWhatsAppMarketingSystemPrompt()).trim()}${audienceBlock}\n${ROLE_DISAMBIGUATION.trim()}`;
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: system }
  ];

  for (const t of history) {
    if (!t.content?.trim()) continue;
    messages.push({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.content.trim()
    });
  }

  messages.push({ role: 'user', content: latestUserText.trim() });

  const systemChars = system.length;
  const approxPayloadChars = JSON.stringify(messages).length;
  timer?.phase('llm_messages_built', {
    model,
    historyTurns: history.length,
    apiMessageCount: messages.length,
    systemChars,
    approxPayloadChars,
    buildSyncMs: Math.round(performance.now() - tBuild0)
  });

  try {
    const tFetch0 = performance.now();
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE
      })
    });
    const tFetch1 = performance.now();
    timer?.phase('llm_openrouter_headers', {
      model,
      httpStatus: res.status,
      fetchUntilHeadersMs: Math.round(tFetch1 - tFetch0)
    });

    if (!res.ok) {
      const body = await res.text();
      timer?.phase('llm_openrouter_error_body', {
        model,
        readErrorBodyMs: Math.round(performance.now() - tFetch1)
      });
      logger.warn(`${logTag} OpenRouter failed`, { status: res.status, body: body.slice(0, 400) });
      return null;
    }

    const tJson0 = performance.now();
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const tJson1 = performance.now();
    const text = data.choices?.[0]?.message?.content?.trim();
    const u = data.usage;
    timer?.phase('llm_openrouter_done', {
      model,
      jsonParseMs: Math.round(tJson1 - tJson0),
      totalHttpMs: Math.round(tJson1 - tFetch0),
      replyChars: text?.length ?? 0,
      promptTokens: typeof u?.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
      completionTokens: typeof u?.completion_tokens === 'number' ? u.completion_tokens : undefined,
      totalTokens: typeof u?.total_tokens === 'number' ? u.total_tokens : undefined
    });
    return text || null;
  } catch (err) {
    timer?.phase('llm_openrouter_throw', {
      err: err instanceof Error ? err.message : String(err)
    });
    logger.error(`${logTag} OpenRouter request error:`, err);
    return null;
  }
}

/**
 * Marketing / negotiation replies for WhatsApp — separate from web chat AI.
 */
export async function generateWhatsAppMarketingReply(
  history: ChatTurn[],
  latestUserText: string,
  channel: WhatsAppChannel,
  waId: string,
  timer?: WhatsAppPipelineTimer | null
): Promise<string | null> {
  const model = getWhatsAppOpenRouterModelForChannel(channel);
  return generateMarketingReplyWithWhatsAppSystemPrompt(
    history,
    latestUserText,
    model,
    () => getCompanyPlatformRoleByWaId(waId),
    timer,
    '[WhatsAppLLM]'
  );
}

/**
 * Same prompt stack as {@link generateWhatsAppMarketingReply}; peer id = Telegram user id (string).
 */
export async function generateTelegramUserMarketingReply(
  history: ChatTurn[],
  latestUserText: string,
  telegramPeerId: string,
  timer?: WhatsAppPipelineTimer | null
): Promise<string | null> {
  const model = getTelegramUserOpenRouterModel();
  return generateMarketingReplyWithWhatsAppSystemPrompt(
    history,
    latestUserText,
    model,
    () => getCompanyPlatformRoleByTelegramId(telegramPeerId),
    timer,
    '[TelegramUserLLM]'
  );
}
