import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { asyncHandler } from '../types/express-helpers';
import { logger } from '../utils/logger';
import { isWhatsAppBaileysEnabled, isWhatsAppIntegrationEnabled } from '../whatsapp/whatsappConfig';
import { sendWhatsAppTextMessage } from '../whatsapp/whatsappGraph.service';
import {
  appendChatMessage,
  enqueueBaileysOutbound,
  enqueueBaileysAdminCommand,
  getBaileysSessionState,
  getChatHistoryForAdmin,
  getGlobalAutoReplyMode,
  getMergedChatHistoryForAdmin,
  isAiPausedForChat,
  listWhatsAppChatsAggregated,
  setAiPausedBothChannels,
  setAiPausedForChat,
  setGlobalAutoReplyMode
} from '../whatsapp/whatsappRedis.service';
import {
  parseWhatsAppChannel,
  parseWhatsAppGlobalAutoReplyMode,
  WHATSAPP_CHANNEL_BAILEYS,
  WHATSAPP_CHANNEL_CLOUD
} from '../whatsapp/whatsapp.types';
import type { WhatsAppChannel } from '../whatsapp/whatsapp.types';
import { normalizeWaId } from '../whatsapp/whatsappWaId.utils';
import User from '../models/User';
import Company from '../models/Company';
import { initializeRedisClient } from '../config/redis';
function requireChannel(param: string | undefined): WhatsAppChannel | null {
  return parseWhatsAppChannel(param);
}

type AdminWhatsAppUserSearchQuery = {
  company?: string;
  q?: string;
  limit?: number;
};

/**
 * GET /api/admin/whatsapp/users/search
 * Search platform users by company name and/or query (name/email/phone).
 */
export const getWhatsAppUsersSearch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { company, q, limit } =
    ((req as Request & { validatedQuery?: AdminWhatsAppUserSearchQuery }).validatedQuery as AdminWhatsAppUserSearchQuery) ??
    ({} as AdminWhatsAppUserSearchQuery);

  const companyTerm = typeof company === 'string' ? company.trim() : '';
  const queryTerm = typeof q === 'string' ? q.trim() : '';
  const max = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;

  const userFilter: Record<string, unknown> = {
    phone: { $exists: true, $nin: [null, ''] }
  };

  if (companyTerm) {
    const rx = new RegExp(companyTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const companies = await Company.find({ name: rx }).select('_id').limit(50).lean();
    const ids = companies.map((c) => c._id);
    userFilter.company = ids.length > 0 ? { $in: ids } : { $in: [] };
  }

  if (queryTerm) {
    const rx = new RegExp(queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    userFilter.$or = [
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { phone: rx }
    ];
  }

  const users = await User.find(userFilter)
    .populate('company', 'name')
    .select('firstName lastName email phone company')
    .sort({ updatedAt: -1 })
    .limit(max)
    .lean();

  const out = (users as Array<any>)
    .map((u) => {
      const phone = String(u.phone ?? '').trim();
      const waId = normalizeWaId(phone);
      if (!waId || waId.length < 4) return null;
      return {
        userId: String(u._id),
        waId,
        phone,
        email: String(u.email ?? ''),
        firstName: String(u.firstName ?? ''),
        lastName: String(u.lastName ?? ''),
        companyName: u.company?.name ? String(u.company.name) : null
      };
    })
    .filter(Boolean);

  res.json({ success: true, data: { users: out } });
});

/**
 * GET /api/admin/whatsapp/chats — one row per phone (Cloud + Baileys combined).
 */
export const getWhatsAppChats = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const chats = await listWhatsAppChatsAggregated();
  
  if (chats.length === 0) {
    res.json({ success: true, data: { chats } });
    return;
  }

  const r = await initializeRedisClient();
  
  const lidDigits: string[] = [];
  const lidToWaIdMap = new Map<string, string>();
  
  for (const c of chats) {
    if (c.waId.startsWith('lid_')) {
      const digits = c.waId.replace(/\D/g, '');
      if (digits) {
        lidDigits.push(digits);
        lidToWaIdMap.set(digits, c.waId);
      }
    }
  }

  const resolvedPhones = new Map<string, string>();
  if (lidDigits.length > 0) {
    const keys = lidDigits.map(d => `whatsapp:baileys:lid_pn:${d}`);
    try {
      const vals = await r.mGet(keys);
      vals.forEach((v, i) => {
        if (v) {
          const digits = lidDigits[i];
          const waId = lidToWaIdMap.get(digits)!;
          const phoneDigits = v.split('@')[0].replace(/\D/g, '');
          if (phoneDigits) {
            resolvedPhones.set(waId, phoneDigits);
          }
        }
      });
    } catch (e) {
      logger.warn('[AdminWhatsApp] Failed to mget LID mappings', { err: e });
    }
  }

  const phoneSearchSet = new Set<string>();
  for (const c of chats) {
    if (c.waId.startsWith('lid_')) {
      const p = resolvedPhones.get(c.waId);
      if (p) phoneSearchSet.add(p);
    } else {
      const p = c.waId.replace(/\D/g, '');
      if (p) phoneSearchSet.add(p);
    }
  }

  const phoneSearchArr = Array.from(phoneSearchSet);
  const userMap = new Map<string, any>();
  
  if (phoneSearchArr.length > 0) {
    const orClauses = phoneSearchArr.map(p => {
      // Создаем RegExp, который игнорирует любые нецифровые символы (пробелы, тире, скобки)
      const pattern = '^\\+?' + p.split('').join('\\D*') + '$';
      return { phone: { $regex: pattern } };
    });

    try {
      const users = await User.find({ $or: orClauses })
        .populate('company', 'name')
        .select('phone firstName lastName company')
        .lean();
        
      for (const u of users as any[]) {
        const cleanPhone = (u.phone || '').replace(/\D/g, '');
        if (cleanPhone) {
          userMap.set(cleanPhone, {
            firstName: u.firstName,
            lastName: u.lastName,
            companyName: u.company?.name || null
          });
        }
      }
    } catch (e) {
      logger.error('[AdminWhatsApp] Failed to fetch Users for chats', { err: e });
    }
  }

  const enriched = chats.map(c => {
    let cleanPhone = c.waId.replace(/\D/g, '');
    let resolvedPhone: string | undefined = undefined;

    if (c.waId.startsWith('lid_')) {
      const p = resolvedPhones.get(c.waId);
      if (p) {
        resolvedPhone = p;
        cleanPhone = p;
      } else {
        cleanPhone = '';
      }
    } else {
      resolvedPhone = cleanPhone;
    }

    const userInfo = cleanPhone ? userMap.get(cleanPhone) || null : null;

    return {
      ...c,
      resolvedPhone: resolvedPhone || null,
      userInfo
    };
  });

  res.json({ success: true, data: { chats: enriched } });
});

/**
 * GET /api/admin/whatsapp/auto-reply-mode — global: off | cloud | baileys (mutually exclusive).
 */
export const getWhatsAppAutoReplyMode = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const mode = await getGlobalAutoReplyMode();
  res.json({ success: true, data: { mode } });
});

/**
 * PUT /api/admin/whatsapp/auto-reply-mode
 */
export const putWhatsAppAutoReplyMode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const mode = parseWhatsAppGlobalAutoReplyMode(
    typeof req.body?.mode === 'string' ? req.body.mode : ''
  );
  if (!mode) {
    res.status(400).json({ success: false, error: 'Invalid mode' });
    return;
  }
  await setGlobalAutoReplyMode(mode);
  res.json({ success: true, data: { mode } });
});

/**
 * GET /api/admin/whatsapp/baileys/status
 */
export const getWhatsAppBaileysStatus = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const state = await getBaileysSessionState();
  res.json({ success: true, data: state });
});

/**
 * GET /api/admin/whatsapp/baileys/qr.png — PNG for current pairing QR (if any).
 */
export const getWhatsAppBaileysQrPng = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const { qr } = await getBaileysSessionState();
  if (!qr) {
    res.status(404).end();
    return;
  }
  try {
    const buf = await QRCode.toBuffer(qr, {
      errorCorrectionLevel: 'M',
      margin: 1,
      type: 'png',
      width: 280
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (e) {
    logger.error('[AdminWhatsApp] QR PNG failed', { e });
    res.status(500).end();
  }
});

/**
 * POST /api/admin/whatsapp/baileys/disconnect
 * Force Baileys worker to drop current session and generate a new QR (re-link another phone).
 */
export const postWhatsAppBaileysDisconnect = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  await enqueueBaileysAdminCommand('reset');
  res.json({ success: true });
});

/**
 * GET /api/admin/whatsapp/baileys/events
 * SSE stream for near-real-time Baileys status and QR updates.
 */
export const streamWhatsAppBaileysEvents = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let lastPayload = '';
  let closed = false;

  const sendState = async () => {
    const state = await getBaileysSessionState();
    const payload = JSON.stringify(state);
    if (payload === lastPayload) return;
    lastPayload = payload;
    res.write(`event: state\n`);
    res.write(`data: ${payload}\n\n`);
  };

  const stateInterval = setInterval(() => {
    void sendState().catch((e) => logger.warn('[AdminWhatsApp] SSE state push failed', { e }));
  }, 1500);
  const keepaliveInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  await sendState();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(stateInterval);
    clearInterval(keepaliveInterval);
    res.end();
  };

  _req.on('close', cleanup);
  _req.on('aborted', cleanup);
});

/**
 * GET /api/admin/whatsapp/chats/merged/:waId/messages — unified timeline, each message has `transport`.
 */
export const getWhatsAppMessagesMerged = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const waId = normalizeWaId(String(req.params.waId ?? ''));
  if (waId.length < 4) {
    res.status(400).json({ success: false, error: 'Invalid waId' });
    return;
  }
  const messages = await getMergedChatHistoryForAdmin(waId);
  const aiPausedCloud = await isAiPausedForChat(WHATSAPP_CHANNEL_CLOUD, waId);
  const aiPausedBaileys = await isAiPausedForChat(WHATSAPP_CHANNEL_BAILEYS, waId);
  res.json({
    success: true,
    data: { waId, messages, aiPausedCloud, aiPausedBaileys }
  });
});

/**
 * PUT /api/admin/whatsapp/chats/merged/:waId/ai-paused — same pause flag for cloud and baileys.
 */
export const putWhatsAppAiPausedMerged = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const waId = normalizeWaId(String(req.params.waId ?? ''));
  if (waId.length < 4) {
    res.status(400).json({ success: false, error: 'Invalid waId' });
    return;
  }
  const paused = Boolean(req.body?.paused);
  await setAiPausedBothChannels(waId, paused);
  res.json({
    success: true,
    data: { waId, paused, aiPausedCloud: paused, aiPausedBaileys: paused }
  });
});

/**
 * GET /api/admin/whatsapp/chats/:channel/:waId/messages
 */
export const getWhatsAppMessages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const channel = requireChannel(String(req.params.channel ?? ''));
  const waId = normalizeWaId(String(req.params.waId ?? ''));
  if (!channel || waId.length < 4) {
    res.status(400).json({ success: false, error: 'Invalid channel or waId' });
    return;
  }
  const messages = await getChatHistoryForAdmin(channel, waId);
  const aiPaused = await isAiPausedForChat(channel, waId);
  res.json({ success: true, data: { channel, waId, messages, aiPaused } });
});

/**
 * POST /api/admin/whatsapp/send
 */
export const postWhatsAppSend = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const channel = parseWhatsAppChannel(typeof req.body?.channel === 'string' ? req.body.channel : '') ?? WHATSAPP_CHANNEL_CLOUD;
  const waId = normalizeWaId(String(req.body?.waId ?? ''));
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (waId.length < 4 || !text) {
    res.status(400).json({ success: false, error: 'Invalid waId or text' });
    return;
  }

  if (channel === WHATSAPP_CHANNEL_BAILEYS) {
    if (!isWhatsAppBaileysEnabled()) {
      res.status(503).json({ success: false, error: 'WhatsApp Baileys integration disabled' });
      return;
    }
    await enqueueBaileysOutbound({ waId, text });
    res.json({ success: true, data: { queued: true } });
    return;
  }

  if (!isWhatsAppIntegrationEnabled()) {
    res.status(503).json({ success: false, error: 'WhatsApp integration disabled' });
    return;
  }

  const result = await sendWhatsAppTextMessage(waId, text);
  if (!result.ok) {
    logger.warn('[AdminWhatsApp] Send failed', { waId, error: result.error });
    const hint =
      result.error === 'http_400'
        ? 'Meta may reject messages outside the 24h customer care window; use an approved template for the first outbound message.'
        : undefined;
    res.status(502).json({
      success: false,
      error: result.error || 'send_failed',
      ...(hint ? { hint } : {})
    });
    return;
  }

  await appendChatMessage(WHATSAPP_CHANNEL_CLOUD, waId, { role: 'assistant', content: text }, { source: 'admin' });

  res.json({ success: true, data: { messageId: result.messageId } });
});

/**
 * PUT /api/admin/whatsapp/chats/:channel/:waId/ai-paused
 */
export const putWhatsAppAiPaused = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const channel = requireChannel(String(req.params.channel ?? ''));
  const waId = normalizeWaId(String(req.params.waId ?? ''));
  if (!channel || waId.length < 4) {
    res.status(400).json({ success: false, error: 'Invalid channel or waId' });
    return;
  }
  const paused = Boolean(req.body?.paused);
  await setAiPausedForChat(channel, waId, paused);
  res.json({ success: true, data: { channel, waId, paused } });
});
