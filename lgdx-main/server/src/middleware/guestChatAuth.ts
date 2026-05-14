import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { chatSystemWarn } from '../utils/chatSystemLogger';

export interface GuestChatPayload {
  guestId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      guest?: GuestChatPayload;
    }
  }
}

const GUEST_CHAT_TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'guestChatToken';

export function getJwtSecret(): string | null {
  let secret = process.env.JWT_SECRET ?? null;
  if (!secret && process.env.JWT_SECRET_FILE) {
    try {
      secret = fs.readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim();
    } catch {
      return null;
    }
  }
  return secret;
}

export function signGuestChatToken(guestId: string, sessionId: string): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  return jwt.sign(
    { guestId, sessionId } as GuestChatPayload,
    secret,
    { expiresIn: GUEST_CHAT_TOKEN_EXPIRY }
  );
}

/**
 * Middleware: require valid guest chat token (cookie or Authorization Bearer).
 * Sets req.guest = { guestId, sessionId }.
 */
export const guestChatAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const secret = getJwtSecret();
  if (!secret) {
    chatSystemWarn('guest.auth.no_jwt_secret', { channel: 'guest_http', path: req.path });
    res.status(503).json({ success: false, message: 'Service unavailable' });
    return;
  }

  let token: string | undefined;
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  const authHeader = req.header('Authorization');
  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    chatSystemWarn('guest.auth.missing_token', { channel: 'guest_http', path: req.path, ip: req.ip });
    res.status(401).json({ success: false, message: 'Guest chat token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as GuestChatPayload;
    if (!decoded.guestId || !decoded.sessionId) {
      chatSystemWarn('guest.auth.invalid_payload', { channel: 'guest_http', path: req.path });
      res.status(401).json({ success: false, message: 'Invalid guest token' });
      return;
    }
    req.guest = { guestId: decoded.guestId, sessionId: decoded.sessionId };
    next();
  } catch {
    chatSystemWarn('guest.auth.verify_failed', { channel: 'guest_http', path: req.path });
    res.status(401).json({ success: false, message: 'Invalid or expired guest token' });
  }
};

export { COOKIE_NAME };
