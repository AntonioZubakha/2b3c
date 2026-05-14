import jwt from 'jsonwebtoken';
import marketplaceConfig from '../config/marketplace';
import { IUser } from '../types';
import { logger } from './logger';

/**
 * Decoded token interface
 */
interface DecodedToken {
  userId: string;
  role: string;
  isLgdealSupervisor?: boolean;
  isImpersonation?: boolean;
  [key: string]: any;
}

/**
 * Check if user is a LGDeal INC supervisor (derived from company + role, no stored flag).
 * True when: company is LGDeal INC and role is 'supervisor' or 'admin'.
 */
const isLgdealSupervisor = (user: IUser): boolean => {
  if (!user || !user.company) return false;

  const companyName = typeof user.company === 'object' && user.company !== null && 'name' in user.company
    ? (user.company as { name?: string }).name
    : null;

  if (!companyName || companyName !== marketplaceConfig.managementCompany.name) return false;

  return user.role === 'supervisor' || user.role === 'admin';
};

/**
 * Любой пользователь компании LGDeal INC (admin / supervisor / manager / logist).
 * Для внутренних сценариев каталога (например, позиции без listing-photo).
 */
const isLgdealIncStaffUser = (user: IUser): boolean => {
  if (!user || !user.company) return false;
  const companyName =
    typeof user.company === 'object' && user.company !== null && 'name' in user.company
      ? (user.company as { name?: string }).name
      : null;
  return companyName === marketplaceConfig.managementCompany.name;
};

/**
 * Verify and decode JWT token
 */
const getSecretFromFile = (envVar: string, defaultValue: string = 'secret'): string => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return require('fs').readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error(`Failed to read ${envVar}_FILE:`, { error: e });
    }
  }
  const value = process.env[envVar];
  // In production, do not allow falling back to a default secret
  if (process.env.NODE_ENV === 'production') {
    if (!value) {
      throw new Error(`[Security] Missing required secret ${envVar} in production`);
    }
    return value;
  }
  // In non-production, allow explicit default for developer convenience
  return value || defaultValue;
};

const verifyToken = (token: string, secret?: string): DecodedToken | null => {
  try {
    // Primary secret
    const primary = secret || getSecretFromFile('JWT_SECRET');
    return jwt.verify(token, primary) as DecodedToken;
  } catch (errPrimary) {
    try {
      // Optional previous secret for rotation grace period
      const prevFile = process.env['JWT_PREV_SECRET_FILE'];
      const prev = prevFile
        ? require('fs').readFileSync(prevFile, 'utf8').trim()
        : (process.env['JWT_PREV_SECRET'] || '');
      if (!prev) return null;
      return jwt.verify(token, prev) as DecodedToken;
    } catch (errPrev) {
      return null;
    }
  }
};

export {
  isLgdealSupervisor,
  isLgdealIncStaffUser,
  verifyToken,
  DecodedToken
}; 