import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { asyncHandler } from '../types/express-helpers';
import { logger } from '../utils/logger';
import User from '../models/User';
import Company from '../models/Company';
import {
  enqueueTelegramUserAdminCommand,
  enqueueTelegramUserLoginCode,
  enqueueTelegramUserLoginPhone,
  enqueueTelegramUserLoginPassword,
  enqueueTelegramUserOutbound,
  getGlobalTelegramUserAutoReplyMode,
  getTelegramUserChatHistoryForAdmin,
  getTelegramUserSessionState,
  getTelegramUserQrLoginUrl,
  isAiPausedForTelegramUserChat,
  listTelegramUserChats,
  normalizeTelegramPeerId,
  setAiPausedForTelegramUserChat,
  setGlobalTelegramUserAutoReplyMode
} from '../telegramUser/telegramUserRedis.service';
import type { TelegramUserGlobalAutoReplyMode } from '../telegramUser/telegramUser.types';

type UsersSearchQuery = {
  company?: string;
  q?: string;
  limit?: number;
};

function parseGlobalMode(s: string | undefined): TelegramUserGlobalAutoReplyMode | null {
  if (s === 'off' || s === 'user') return s;
  return null;
}

/**
 * GET /api/admin/telegram-user/users/search — users with linked Telegram (telegramId set).
 */
export const getTelegramUserUsersSearch = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const vq = (req as Request & { validatedQuery?: UsersSearchQuery }).validatedQuery;
    const { company, q, limit } = (vq as UsersSearchQuery) ?? {
      company: req.query?.company,
      q: req.query?.q,
      limit: req.query?.limit
        ? parseInt(String(req.query.limit), 10)
        : undefined
    };

    const companyTerm = typeof company === 'string' ? company.trim() : '';
    const queryTerm = typeof q === 'string' ? q.trim() : '';
    const max =
      typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;

    const userFilter: Record<string, unknown> = {
      telegramId: { $exists: true, $nin: [null, ''] }
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
        { phone: rx },
        { telegramId: rx }
      ];
    }

    const users = await User.find(userFilter)
      .populate('company', 'name')
      .select('firstName lastName email phone company telegramId')
      .sort({ updatedAt: -1 })
      .limit(max)
      .lean();

    const out = (users as Array<Record<string, unknown>>)
      .map((u) => {
        const rawTg = u.telegramId != null ? String(u.telegramId).trim() : '';
        const peerId = rawTg.replace(/\D/g, '') || rawTg;
        if (peerId.length < 2) return null;
        return {
          userId: String(u._id),
          peerId: normalizeTelegramPeerId(peerId),
          email: String(u.email ?? ''),
          firstName: String(u.firstName ?? ''),
          lastName: String(u.lastName ?? ''),
          companyName: (u.company as { name?: string } | null)?.name
            ? String((u.company as { name: string }).name)
            : null
        };
      })
      .filter(Boolean);

    res.json({ success: true, data: { users: out } });
  }
);

/**
 * GET /api/admin/telegram-user/chats
 */
export const getTelegramUserChats = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const flat = await listTelegramUserChats();

  if (flat.length === 0) {
    res.json({ success: true, data: { chats: [] } });
    return;
  }

  const peerIds = flat.map((c) => c.peerId);
  const or = peerIds.map((pid) => ({ telegramId: String(pid) }));
  const userMap = new Map<string, { firstName: string; lastName: string; companyName: string | null }>();

  try {
    const users = await User.find({ $or: or })
      .populate('company', 'name')
      .select('telegramId firstName lastName company')
      .lean();
    for (const u of users as any[]) {
      const t = u.telegramId != null ? String(u.telegramId).replace(/\D/g, '') : '';
      if (t) {
        userMap.set(t, {
          firstName: u.firstName,
          lastName: u.lastName,
          companyName: u.company?.name || null
        });
      }
    }
  } catch (e) {
    logger.error('[AdminTelegramUser] User enrich failed', { e });
  }

  const enriched = flat.map((c) => {
    const ui = userMap.get(c.peerId.replace(/\D/g, ''));
    return {
      ...c,
      userInfo: ui
        ? {
            firstName: ui.firstName,
            lastName: ui.lastName,
            companyName: ui.companyName
          }
        : null
    };
  });

  res.json({ success: true, data: { chats: enriched } });
});

export const getTelegramUserAutoReplyMode = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const mode = await getGlobalTelegramUserAutoReplyMode();
    res.json({ success: true, data: { mode } });
  }
);

export const putTelegramUserAutoReplyMode = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const mode = parseGlobalMode(
      typeof req.body?.mode === 'string' ? req.body.mode : ''
    );
    if (!mode) {
      res.status(400).json({ success: false, error: 'Invalid mode' });
      return;
    }
    await setGlobalTelegramUserAutoReplyMode(mode);
    res.json({ success: true, data: { mode } });
  }
);

export const getTelegramUserStatus = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const st = await getTelegramUserSessionState();
  const hasQr = Boolean(await getTelegramUserQrLoginUrl());
  const status = st.status != null ? st.status : hasQr ? 'connecting' : null;
  res.json({ success: true, data: { ...st, status, hasQr } });
});

/**
 * GET /api/admin/telegram-user/qr.png — PNG for current Telegram login QR (GramJS), when worker is in QR step.
 */
export const getTelegramUserQrPng = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const url = await getTelegramUserQrLoginUrl();
  if (!url) {
    res.status(404).end();
    return;
  }
  try {
    const buf = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      type: 'png',
      width: 280
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (e) {
    logger.error('[AdminTelegramUser] QR PNG failed', { e });
    res.status(500).end();
  }
});

export const postTelegramUserDisconnect = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  await enqueueTelegramUserAdminCommand('reset');
  res.json({ success: true });
});

export const getTelegramUserMessages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const raw = String(req.params.peerId ?? '');
  const peerId = normalizeTelegramPeerId(raw);
  if (peerId.length < 2) {
    res.status(400).json({ success: false, error: 'Invalid peer' });
    return;
  }
  const messages = await getTelegramUserChatHistoryForAdmin(peerId);
  const aiPaused = await isAiPausedForTelegramUserChat(peerId);
  res.json({ success: true, data: { peerId, messages, aiPaused } });
});

export const postTelegramUserSend = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const peerId = normalizeTelegramPeerId(String(req.body?.peerId ?? ''));
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (peerId.length < 2 || !text) {
    res.status(400).json({ success: false, error: 'Invalid peer or text' });
    return;
  }
  await enqueueTelegramUserOutbound({ peerId, text });
  res.json({ success: true, data: { queued: true } });
});

export const putTelegramUserAiPaused = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const peerId = normalizeTelegramPeerId(String(req.params.peerId ?? ''));
  if (peerId.length < 2) {
    res.status(400).json({ success: false, error: 'Invalid peer' });
    return;
  }
  const paused = Boolean(req.body?.paused);
  await setAiPausedForTelegramUserChat(peerId, paused);
  res.json({ success: true, data: { peerId, paused } });
});

export const postTelegramUserLoginPhone = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone required' });
    return;
  }
  await enqueueTelegramUserLoginPhone(phone);
  res.json({ success: true, data: { queued: true } });
});

export const postTelegramUserLoginCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code) {
    res.status(400).json({ success: false, error: 'code required' });
    return;
  }
  await enqueueTelegramUserLoginCode(code);
  res.json({ success: true, data: { queued: true } });
});

export const postTelegramUserLoginPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ success: false, error: 'password required' });
    return;
  }
  await enqueueTelegramUserLoginPassword(password);
  res.json({ success: true, data: { queued: true } });
});

export const streamTelegramUserEvents = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let lastPayload = '';
  let closed = false;

  const sendState = async () => {
    const st = await getTelegramUserSessionState();
    const hasQr = Boolean(await getTelegramUserQrLoginUrl());
    const status = st.status != null ? st.status : hasQr ? 'connecting' : null;
    const state = { ...st, status, hasQr };
    const payload = JSON.stringify(state);
    if (payload === lastPayload) return;
    lastPayload = payload;
    res.write(`event: state\n`);
    res.write(`data: ${payload}\n\n`);
  };

  const stateInterval = setInterval(() => {
    void sendState().catch((e) => logger.warn('[AdminTelegramUser] SSE push failed', { e }));
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
