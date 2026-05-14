import { Response, NextFunction, Request } from "express";
import jwt from "jsonwebtoken"; // Needs types
import User from "../models/User"; // Placeholder
import { isLgdealSupervisor, verifyToken } from "../utils/userUtils"; // Placeholder
import { logger } from "../utils/logger";

// In-memory cache for admin/supervisor role checks to reduce DB load
type CachedAdminRole = {
  role: string;
  isLgdealSupervisor: boolean;
  isLgdealAdmin: boolean;
  companyId?: string;
  expiresAt: number;
};

const adminRoleCache: Map<string, CachedAdminRole> = new Map();
const ROLE_CACHE_TTL_MS: number = parseInt(
  process.env.ADMIN_ROLE_CACHE_TTL_MS || "45000",
  10,
); // default 45s

/**
 * Immediately evicts a user from the admin role cache.
 * Call this whenever a user's role is changed so the new role takes effect
 * on the next request instead of waiting for the TTL to expire.
 */
export const invalidateAdminRoleCache = (userId: string): void => {
  adminRoleCache.delete(userId);
};

export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Prefer HttpOnly cookie; in production ignore legacy x-auth-token header
    const tokenFromCookie = (
      req as Request & { cookies?: Record<string, string> }
    ).cookies?.authToken;
    const legacyHeader = req.header("x-auth-token");
    const token =
      tokenFromCookie ||
      (process.env.NODE_ENV !== "production" ? legacyHeader : undefined);

    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      res
        .status(401)
        .json({ message: "Token is not valid or userId is missing" });
      return;
    }

    // Initialize req.user if it doesn't exist (it should if AuthRequest is used correctly by previous middleware)
    if (!req.user) {
      req.user = { userId: decoded.userId, role: decoded.role };
    } else {
      // Ensure userId and role are from the token, even if req.user was populated by another middleware
      req.user.userId = decoded.userId;
      req.user.role = decoded.role;
    }
    req.user.isImpersonation = decoded.isImpersonation; // Carry over impersonation status
    req.user.originalUserId = decoded.originalUserId; // Carry over impersonation status

    // Try cache first
    const cacheKey = decoded.userId as string;
    const now = Date.now();
    const cached = adminRoleCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      // Apply cached privileges
      req.user.role = cached.role;
      req.user.companyId = cached.companyId;
      req.user.isLgdealAdmin = cached.isLgdealAdmin;
      req.user.isLgdealSupervisor = cached.isLgdealSupervisor;

      if (!cached.isLgdealAdmin && !cached.isLgdealSupervisor) {
        logger.warn(
          `[AdminAuth] Access denied for user ${cacheKey}: no admin privileges`,
        );
        res
          .status(403)
          .json({ message: "Access denied: Admin privileges required" });
        return;
      }

      next();
      return;
    }

    const userFromDb = await User.findById(decoded.userId).populate("company");
    if (!userFromDb) {
      logger.warn(`[AdminAuth] User not found in DB: ${decoded.userId}`);
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Always trust role from DB, not from token
    req.user.role = userFromDb.role;

    const isAdmin = userFromDb.role === "admin";
    const hasLgdealSupervisorRole = isLgdealSupervisor(userFromDb);

    if (!isAdmin && !hasLgdealSupervisorRole) {
      res
        .status(403)
        .json({ message: "Access denied: Admin privileges required" });
      return;
    }

    // Set derived flags and identifiers
    if (userFromDb.company && userFromDb.company._id) {
      req.user.companyId = userFromDb.company._id.toString();
    }
    req.user.isLgdealAdmin = isAdmin || hasLgdealSupervisorRole;
    req.user.isLgdealSupervisor = hasLgdealSupervisorRole;

    // Update cache
    adminRoleCache.set(cacheKey, {
      role: req.user.role,
      isLgdealSupervisor: hasLgdealSupervisorRole,
      isLgdealAdmin: req.user.isLgdealAdmin,
      companyId: req.user.companyId,
      expiresAt: now + ROLE_CACHE_TTL_MS,
    });

    if (process.env.NODE_ENV !== "production") {
      logger.info(
        `Admin access granted. isAdmin: ${isAdmin}, isLgdealSupervisor: ${hasLgdealSupervisorRole}`,
      );
    }

    next();
  } catch (err) {
    logger.error("Admin auth middleware error:", { error: err });
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: "Token is invalid" });
    } else {
      res
        .status(500)
        .json({ message: "Internal server error during admin authentication" });
    }
  }
};

/**
 * Restricts access to full admins only (role === 'admin').
 * Use after adminAuthMiddleware. Supervisors cannot access these routes.
 */
export const fullAdminOnly = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user && req.user.role === "admin") {
    next();
    return;
  }
  res.status(403).json({ message: "Access denied. Full admin role required." });
};

export default adminAuthMiddleware;
