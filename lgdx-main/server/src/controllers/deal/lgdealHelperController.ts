import { Request, Response } from 'express';
import User from '../../models/User';
import Company from '../../models/Company';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHelpers';
import { 
  UnauthorizedError, 
  ForbiddenError,
  asyncHandler 
} from '../../middleware/errorHandler';
import marketplaceConfig from '../../config/marketplace';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
  };
}

/**
 * Get list of LGDEAL managers for assignment
 * GET /api/deal/lgdeal/managers
 * Only accessible by LGDEAL supervisors
 */
export const getLgdealManagers = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { isLgdealSupervisor } = req.user;

  // Only LGDEAL supervisors can access this endpoint
  if (!isLgdealSupervisor) {
    throw new ForbiddenError('Only LGDEAL supervisors can access this endpoint');
  }

  logger.debug('[getLgdealManagers] Fetching LGDEAL managers', { userId: req.user.userId });

  try {
    // Find LGDEAL company
    const lgdealCompany = await Company.findOne({ 
      name: marketplaceConfig.managementCompany.name 
    });

    if (!lgdealCompany) {
      logger.error('[getLgdealManagers] LGDEAL company not found');
      res.json({
        success: true,
        managers: []
      });
      return;
    }

    // Find all active managers in LGDEAL company
    const managers = await User.find({
      company: lgdealCompany._id,
      role: 'manager',
      isActive: true
    })
      .select('_id firstName lastName email')
      .sort({ firstName: 1, lastName: 1 });

    logger.info('[getLgdealManagers] Found managers', { count: managers.length });

    res.json({
      success: true,
      managers: managers.map(m => ({
        _id: m._id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        fullName: `${m.firstName} ${m.lastName}`
      }))
    });
  } catch (error) {
    logger.error('[getLgdealManagers] Error fetching managers', {
      error: getErrorMessage(error)
    });
    throw error;
  }
});

/**
 * Get list of LGDEAL logists for assignment
 * GET /api/deal/lgdeal/logists
 * Only accessible by LGDEAL managers and supervisors
 */
export const getLgdealLogists = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId, role, companyId, isLgdealSupervisor } = req.user;

  logger.debug('[getLgdealLogists] Fetching LGDEAL logists', { userId, role });

  try {
    // Find LGDEAL company
    const lgdealCompany = await Company.findOne({ 
      name: marketplaceConfig.managementCompany.name 
    });

    if (!lgdealCompany) {
      logger.error('[getLgdealLogists] LGDEAL company not found');
      res.json({
        success: true,
        logists: []
      });
      return;
    }

    // Check if user is LGDEAL manager or supervisor
    const isLgdealManager = role === 'manager' && companyId === lgdealCompany._id.toString();
    
    if (!isLgdealSupervisor && !isLgdealManager) {
      throw new ForbiddenError('Only LGDEAL managers and supervisors can access this endpoint');
    }

    // Find all active logists in LGDEAL company
    const logists = await User.find({
      company: lgdealCompany._id,
      role: 'logist',
      isActive: true
    })
      .select('_id firstName lastName email')
      .sort({ firstName: 1, lastName: 1 });

    logger.info('[getLgdealLogists] Found logists', { count: logists.length });

    res.json({
      success: true,
      logists: logists.map(l => ({
        _id: l._id,
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email,
        fullName: `${l.firstName} ${l.lastName}`
      }))
    });
  } catch (error) {
    logger.error('[getLgdealLogists] Error fetching logists', {
      error: getErrorMessage(error)
    });
    throw error;
  }
});

/**
 * Get count of managers in LGDEAL company
 * GET /api/deal/lgdeal/managers/count
 * Used to determine if reassignment UI should be shown
 * Only accessible by LGDEAL supervisors
 */
export const getLgdealManagersCount = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { isLgdealSupervisor } = req.user;

  if (!isLgdealSupervisor) {
    throw new ForbiddenError('Only LGDEAL supervisors can access this endpoint');
  }

  try {
    const lgdealCompany = await Company.findOne({ 
      name: marketplaceConfig.managementCompany.name 
    });

    if (!lgdealCompany) {
      res.json({ success: true, count: 0 });
      return;
    }

    const count = await User.countDocuments({
      company: lgdealCompany._id,
      role: 'manager',
      isActive: true
    });

    logger.debug('[getLgdealManagersCount] Manager count', { count });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    logger.error('[getLgdealManagersCount] Error counting managers', {
      error: getErrorMessage(error)
    });
    throw error;
  }
});
