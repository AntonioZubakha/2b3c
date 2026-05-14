import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

const isUnsafeMethod = (method: string): boolean => {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
};

const EXEMPT_PATHS: RegExp[] = [
  /^\/api\/auth\/login/i,
  /^\/api\/auth\/register/i,
  /^\/api\/auth\/reset-password/i,
  /^\/api\/auth\/request-password-reset/i,
  /^\/api\/auth\/verify-email/i,
  /^\/api\/admin\/ftp/i, // FTP admin routes
  /^\/api\/stripe\/webhook/i,
  /^\/api\/whatsapp\/webhook/i,
  /^\/health/i
];

export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  
  // Only protect unsafe methods
  if (!isUnsafeMethod(req.method)) return next();

  // Skip if explicitly marked to skip CSRF
  if ((req as Request & { skipCsrf?: boolean }).skipCsrf) {
    return next();
  }

  // Skip exempted paths (login/register etc.)
  if (EXEMPT_PATHS.some((rx) => rx.test(req.originalUrl))) {
    return next();
  }

  // Transitional compatibility (development only): if legacy header token is present, skip CSRF check
  // In production, CSRF must be enforced when a session exists
  const legacyHeaderToken = req.header('x-auth-token');
  if (process.env.NODE_ENV !== 'production' && legacyHeaderToken) return next();

  // If session cookie exists, require matching CSRF token header
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const authCookie = cookies?.authToken;
  if (!authCookie) return next(); // no session — nothing to protect

  const csrfCookie = cookies?.csrfToken;
  const csrfHeader = req.header('x-csrf-token');

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ message: 'CSRF token missing or invalid' });
    return;
  }

  next();
};

export default csrfProtection;

