import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { isLgdealSupervisor, isLgdealIncStaffUser, verifyToken } from '../utils/userUtils';
import { cacheService, CacheKeys } from '../utils/cacheService';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';

// Interface for decoded JWT token
interface DecodedToken {
  userId: string;
  role: string;
  jti?: string;
  isImpersonation?: boolean;
  originalUserId?: string;
  company?: string | Types.ObjectId;
  companyId?: string;
  isLgdealSupervisor?: boolean;
  isLgdealAdmin?: boolean;
  exp?: number;
}

/**
 * Resolve JWT for API auth: HttpOnly cookie (web), Bearer header (mobile / non-browser clients),
 * then legacy x-auth-token (non-production only).
 */
export function resolveJwtFromRequest(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const tokenFromCookie = cookies?.authToken as string | undefined;
  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  const authHeader = req.header('authorization');
  if (authHeader) {
    const match = /^Bearer\s+(\S+)/i.exec(authHeader.trim());
    if (match?.[1]) {
      return match[1];
    }
  }

  const legacyHeader = req.header('x-auth-token') as string | undefined;
  if (process.env.NODE_ENV !== 'production' && legacyHeader) {
    return legacyHeader;
  }

  return undefined;
}

/**
 * Authentication middleware for protected routes - allows unverified users with limited access
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = resolveJwtFromRequest(req);

    if (!token) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(token) as DecodedToken | null;
    if (!decoded || !decoded.userId) {
      res.status(401).json({ message: 'Token is not valid or userId is missing' });
      return;
    }

    // Revocation check by jti (if present)
    if (decoded.jti) {
      const revoked = await cacheService.exists(CacheKeys.JWT_REVOKED(decoded.jti));
      if (revoked) {
        res.status(401).json({ message: 'Token is revoked' });
        return;
      }
    }
    
    // Initialize req.user with decoded payload
    req.user = {
        userId: decoded.userId,
        role: decoded.role,
        isImpersonation: decoded.isImpersonation,
        originalUserId: decoded.originalUserId,
        // Initialize other properties as undefined or with defaults from decoded if available
        company: decoded.company,
        companyId: decoded.companyId, // Include companyId from token if present
        isLgdealSupervisor: decoded.isLgdealSupervisor,
        isLgdealAdmin: decoded.isLgdealAdmin,
        emailVerified: false // Will be updated from DB
    };
    
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Auth middleware - User ID: ${req.user.userId}, Role: ${req.user.role}`);
    }
    
    const userFromDb = await User.findById(req.user.userId).populate('company');
    
    if (!userFromDb) {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(`Auth middleware - User not found: ${req.user.userId}`);
      }
      res.status(401).json({ message: 'Account not activated or user not found' });
      return;
    }
    
    const hasLgdealSupervisorRole = isLgdealSupervisor(userFromDb);
    const isLgdealUser = hasLgdealSupervisorRole || userFromDb.role === 'admin';
    const isEmailVerified = userFromDb.emailVerified || isLgdealUser; // LGDEAL users are considered verified
    
    if (!userFromDb.isActive && !isLgdealUser) {
      logger.info(`Auth middleware - User not active: ${req.user.userId}`);
      res.status(401).json({ message: 'Account not activated. Please contact support.' });
      return;
    }
    
    // Allow unverified users to access limited functionality
    // Only block completely inactive accounts
    
    // Update req.user with details from DB and role checks
    if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
      req.user.company = userFromDb.company._id;
    } else {
      req.user.company = userFromDb.company;
    }
    // Set companyId from company object for compatibility with existing code
    if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
      req.user.companyId = userFromDb.company._id.toString();
    }
    const isAdmin = userFromDb.role === 'admin';
    req.user.isLgdealSupervisor = hasLgdealSupervisorRole || req.user.isLgdealSupervisor;
    // Treat full admins as LGDEAL admins; supervisors also count as LGDEAL admins.
    req.user.isLgdealAdmin = isAdmin || hasLgdealSupervisorRole || req.user.isLgdealAdmin;
    req.user.isLgdealIncStaff = isLgdealIncStaffUser(userFromDb);
    req.user.emailVerified = isEmailVerified; // Add email verification status to req.user
    
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Auth middleware - User company: ${typeof userFromDb.company === 'object' && 'name' in userFromDb.company ? userFromDb.company.name : 'none'}`);
      logger.debug(`Auth middleware - Email verified: ${isEmailVerified}`);
      if (req.user.isLgdealSupervisor) {
        logger.debug('Auth middleware - LGDEAL supervisor detected');
      }
      if (req.user.isImpersonation) {
        logger.warn(`Impersonation token detected for user ${req.user.userId} by ${req.user.originalUserId}`);
      }
    }

    next();
  } catch (err) {
    logger.error('Auth middleware error:', { err: err instanceof Error ? err.message : String(err) });
    // More specific error for JWT issues vs other issues could be useful here
    if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ message: 'Token is invalid' });
    } else {
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
  }
};

/**
 * Full access middleware - requires email verification for sensitive operations
 */
export const fullAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = resolveJwtFromRequest(req);

    if (!token) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const decoded = verifyToken(token) as {
      userId: string;
      role: string;
      jti?: string;
      isImpersonation?: boolean;
      originalUserId?: string;
      company?: string | { _id: string; name: string };
      companyId?: string;
      isLgdealSupervisor?: boolean;
      isLgdealAdmin?: boolean;
      [key: string]: unknown;
    } | null;
    if (!decoded || !decoded.userId) {
      res.status(401).json({ message: 'Token is not valid or userId is missing' });
      return;
    }

    // Revocation check by jti (if present)
    if (decoded.jti) {
      const revoked = await cacheService.exists(CacheKeys.JWT_REVOKED(decoded.jti));
      if (revoked) {
        res.status(401).json({ message: 'Token is revoked' });
        return;
      }
    }
    
    // Initialize req.user with decoded payload
    req.user = {
        userId: decoded.userId,
        role: decoded.role,
        isImpersonation: decoded.isImpersonation,
        originalUserId: decoded.originalUserId,
        company: decoded.company && typeof decoded.company === 'object' && '_id' in decoded.company ? decoded.company._id : decoded.company,
        companyId: decoded.companyId,
        isLgdealSupervisor: decoded.isLgdealSupervisor,
        isLgdealAdmin: decoded.isLgdealAdmin,
        emailVerified: false
    };

    const userFromDb = await User.findById(req.user!.userId).populate('company');

    if (!userFromDb) {
      res.status(401).json({ message: 'Account not activated or user not found' });
      return;
    }
    
    const hasLgdealSupervisorRole = isLgdealSupervisor(userFromDb);
    const isLgdealUser = hasLgdealSupervisorRole || userFromDb.role === 'admin';
    const isEmailVerified = userFromDb.emailVerified || isLgdealUser;
    
    if (!userFromDb.isActive && !isLgdealUser) {
      res.status(401).json({ message: 'Account not activated. Please contact support.' });
      return;
    }
    
    // Update req.user with details from DB
    if (req.user) {
      if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
        req.user.company = userFromDb.company._id;
      } else {
        req.user.company = userFromDb.company;
      }
      if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
        req.user.companyId = userFromDb.company._id.toString();
      }
      req.user.isLgdealSupervisor = hasLgdealSupervisorRole || (req.user.isLgdealSupervisor || false);
      req.user.isLgdealAdmin = hasLgdealSupervisorRole || (req.user.isLgdealAdmin || false);
      req.user.isLgdealIncStaff = isLgdealIncStaffUser(userFromDb);
      req.user.emailVerified = isEmailVerified;

      // Check if user is verified for full access
      if (!isEmailVerified) {
        logger.info(`Full access middleware - User email not verified: ${req.user!.userId}`);
        res.status(403).json({
          message: 'Email verification required for this action. Please check your email and verify your account.',
          requiresEmailVerification: true
        });
        return;
      }
    }

    next();
  } catch (err) {
    logger.error('Full access middleware error:', { err: err instanceof Error ? err.message : String(err) });
    if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ message: 'Token is invalid' });
    } else {
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
  }
};

export default authMiddleware;

// Middleware to check that user has admin role
const adminOnly = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin role required.' });
  }
};

// Middleware to check that user is LGDEAL supervisor
const lgdealSupervisorOnly = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user && req.user.isLgdealSupervisor) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. LGDEAL supervisor role required.' });
  }
};

// Middleware to allow either LGDEAL supervisor or admin
const lgdealSupervisorOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (
    req.user && (
      req.user.isLgdealSupervisor ||
      req.user.role === 'supervisor' ||
      req.user.role === 'admin'
    )
  ) {
    next();
    return;
  }
  res.status(403).json({ message: 'Access denied. LGDEAL supervisor or admin role required.' });
};

// Middleware to check that user is part of a company
const companyMemberOnly = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user && (req.user.company || req.user.companyId)) { // Check for either company or companyId
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Company membership required.' });
  }
};

/**
 * Optional authentication middleware - sets req.user if token exists, but doesn't block requests
 * Used for public routes that should work for both authenticated and unauthenticated users
 */
export const optionalAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = resolveJwtFromRequest(req);

    // If no token, continue without setting req.user
    if (!token) {
      next();
      return;
    }

    const decoded = verifyToken(token) as DecodedToken | null;
    if (!decoded || !decoded.userId) {
      // Invalid token, but continue without authentication
      next();
      return;
    }

    // Revocation check by jti (if present)
    if (decoded.jti) {
      const revoked = await cacheService.exists(CacheKeys.JWT_REVOKED(decoded.jti));
      if (revoked) {
        // Token revoked, but continue without authentication
        next();
        return;
      }
    }
    
    // Initialize req.user with decoded payload
    req.user = {
        userId: decoded.userId,
        role: decoded.role,
        isImpersonation: decoded.isImpersonation,
        originalUserId: decoded.originalUserId,
        company: decoded.company,
        companyId: decoded.companyId,
        isLgdealSupervisor: decoded.isLgdealSupervisor,
        isLgdealAdmin: decoded.isLgdealAdmin,
        emailVerified: false // Will be updated from DB
    };
    
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Optional auth middleware - User ID: ${req.user.userId}, Role: ${req.user.role}`);
    }
    
    const userFromDb = await User.findById(req.user.userId).populate('company');
    
    if (!userFromDb) {
      // User not found, but continue without authentication
      req.user = undefined;
      next();
      return;
    }
    
    const hasLgdealSupervisorRole = isLgdealSupervisor(userFromDb);
    const isLgdealUser = hasLgdealSupervisorRole || userFromDb.role === 'admin';
    const isEmailVerified = userFromDb.emailVerified || isLgdealUser;
    
    // Update req.user with details from DB and role checks
    if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
      req.user.company = userFromDb.company._id;
    } else {
      req.user.company = userFromDb.company;
    }
    if (userFromDb.company && typeof userFromDb.company === 'object' && '_id' in userFromDb.company) {
      req.user.companyId = userFromDb.company._id.toString();
    }
    req.user.isLgdealSupervisor = hasLgdealSupervisorRole || req.user.isLgdealSupervisor;
    req.user.isLgdealAdmin = hasLgdealSupervisorRole || req.user.isLgdealAdmin;
    req.user.isLgdealIncStaff = isLgdealIncStaffUser(userFromDb);
    req.user.emailVerified = isEmailVerified;
    
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Optional auth middleware - User company: ${typeof userFromDb.company === 'object' && 'name' in userFromDb.company ? userFromDb.company.name : 'none'}`);
      logger.debug(`Optional auth middleware - Email verified: ${isEmailVerified}`);
    }

    next();
  } catch (err) {
    // On error, continue without authentication (don't block the request)
    logger.debug('Optional auth middleware error (continuing without auth):', { err: err instanceof Error ? err.message : String(err) });
    req.user = undefined;
    next();
  }
};

export { adminOnly, lgdealSupervisorOnly, lgdealSupervisorOrAdmin, companyMemberOnly }; 