import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import SystemSettings from '../models/SystemSettings';
import {
  getClientIp,
  isClientIpBlacklisted,
  getCountryIsoFromE164,
  isCountryCodeBlocked
} from '../utils/registrationRestrictions';

declare module 'express-serve-static-core' {
  interface Locals {
    registrationPolicy?: { registrationBlockedCountryCodes: string[] };
  }
}

/**
 * Загружает политику регистрации: глобальное отключение и IP-блок.
 * Сохраняет список стран для проверки после валидации тела (телефон E.164).
 */
export const prepareRegistrationPolicy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const settings = await SystemSettings.getCurrentSettings();

    if (!settings.registrationsEnabled) {
      logger.warn('[RegistrationGuard] Registration attempt blocked - registrations disabled', {
        ip: getClientIp(req),
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      res.status(503).json({
        error: 'Service Unavailable',
        message: 'User registrations are currently disabled. Please try again later.',
        code: 'REGISTRATIONS_DISABLED',
        retryAfter: 3600
      });
      return;
    }

    const clientIp = getClientIp(req);
    if (isClientIpBlacklisted(clientIp, settings.registrationIpBlacklist || [])) {
      logger.warn('[RegistrationGuard] Registration attempt blocked - IP blacklist', {
        ip: clientIp,
        userAgent: req.get('User-Agent'),
        path: req.path,
        timestamp: new Date().toISOString()
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Registration is not available from your network.',
        code: 'REGISTRATION_IP_BLOCKED'
      });
      return;
    }

    res.locals.registrationPolicy = {
      registrationBlockedCountryCodes: settings.registrationBlockedCountryCodes || []
    };
    next();
  } catch (error) {
    logger.error('[RegistrationGuard] Error in prepareRegistrationPolicy:', error);
    logger.warn('[RegistrationGuard] Allowing registration due to error in policy check');
    next();
  }
};

/**
 * После валидации тела — блок по стране номера телефона.
 */
export const checkRegistrationCountryBlock = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const codes = res.locals.registrationPolicy?.registrationBlockedCountryCodes;
    if (!codes || codes.length === 0) {
      next();
      return;
    }

    const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
    if (!phone) {
      next();
      return;
    }

    const countryIso = getCountryIsoFromE164(phone);
    if (isCountryCodeBlocked(countryIso, codes)) {
      logger.warn('[RegistrationGuard] Registration attempt blocked - country blacklist', {
        ip: getClientIp(req),
        countryIso,
        timestamp: new Date().toISOString()
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Registration is not available for phone numbers from this region.',
        code: 'REGISTRATION_COUNTRY_BLOCKED'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('[RegistrationGuard] Error in checkRegistrationCountryBlock:', error);
    next();
  }
};

/**
 * Middleware для логирования попыток регистрации
 * Применяется только к маршрутам регистрации
 */
export const logRegistrationAttempt = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.path === '/register' || req.path === '/api/auth/register') {
    logger.info('[RegistrationGuard] Registration attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      email: req.body?.email,
      companyName: req.body?.companyName,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

/**
 * Middleware для логирования попыток логина
 * Отдельный middleware для мониторинга аутентификации
 */
export const logLoginAttempt = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.path === '/login' || req.path === '/api/auth/login') {
    logger.info('[AuthGuard] Login attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      email: req.body?.email,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

export default {
  prepareRegistrationPolicy,
  checkRegistrationCountryBlock,
  logRegistrationAttempt,
  logLoginAttempt
};
