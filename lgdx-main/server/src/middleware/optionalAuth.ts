import { Response, NextFunction, Request } from 'express';
import { verifyToken } from '../utils/userUtils'; // Placeholder for typed userUtils
import { logger } from '../utils/logger';

/**
 * Middleware for optional authentication.
 * Tries to authenticate the user by token, but does not block the request
 * if the token is not provided or is invalid.
 */
export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tokenFromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.authToken;
  const tokenFromHeader = req.header('x-auth-token');
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    if (decoded && typeof decoded === 'object' && 'userId' in decoded) {
      // Initialize req.user with decoded payload
      req.user = {
          userId: decoded.userId,
          role: decoded.role,
          isImpersonation: decoded.isImpersonation,
          originalUserId: decoded.originalUserId,
          company: decoded.company,
          companyId: decoded.companyId, // Include companyId from token
          isLgdealSupervisor: decoded.isLgdealSupervisor,
          isLgdealAdmin: decoded.isLgdealAdmin
      };
    } else {
      logger.debug('Optional auth: Invalid or incomplete token');
    }
  } catch (error) {
    // Log error but do not block the request for optional auth
    logger.error('Optional auth error during token verification:', { error });
  }
  
  next();
};

export default optionalAuthMiddleware; 