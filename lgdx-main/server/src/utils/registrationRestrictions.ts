import type { Request } from 'express';
import ipRangeCheck = require('ip-range-check');
import { parsePhoneNumber } from 'libphonenumber-js/max';
import { logger } from './logger';

/**
 * Client IP: respects X-Forwarded-For when Express `trust proxy` is enabled.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '::1' ? '127.0.0.1' : ip;
}

/**
 * `ip-range-check`: true if client IP matches any CIDR or exact entry.
 */
export function isClientIpBlacklisted(clientIp: string, blacklist: string[]): boolean {
  const entries = blacklist.map((s) => s.trim()).filter(Boolean);
  if (!clientIp || entries.length === 0) return false;
  try {
    return ipRangeCheck(clientIp, entries);
  } catch (e) {
    logger.warn('[RegistrationRestrictions] ip-range-check failed', { clientIp, err: e });
    return entries.includes(clientIp);
  }
}

/**
 * Country calling code from E.164 (must be valid international number).
 */
export function getCountryIsoFromE164(e164: string): string | null {
  try {
    const pn = parsePhoneNumber(e164);
    return pn.country ?? null;
  } catch {
    return null;
  }
}

export function isCountryCodeBlocked(countryIso: string | null, blocked: string[]): boolean {
  if (!countryIso || blocked.length === 0) return false;
  const set = new Set(blocked.map((c) => c.trim().toUpperCase()).filter(Boolean));
  return set.has(countryIso.toUpperCase());
}
