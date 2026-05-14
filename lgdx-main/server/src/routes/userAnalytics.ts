import express, { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import User from '../models/User';
import Company from '../models/Company';
import Deal from '../models/Deal';
import { getAnalyticsData } from '../middleware/analyticsMiddleware';
import { logger } from '../utils/logger';

const router: Router = express.Router();

/**
 * @route   GET /api/analytics/user-activity
 * @desc    Get user activity statistics
 * @access  Admin only
 */
router.get('/user-activity', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total users
    const totalUsers = await User.countDocuments({});

    // Active users (users who logged in)
    const activeUsersToday = await User.countDocuments({
      lastLogin: { $gte: today }
    });

    const activeUsersThisWeek = await User.countDocuments({
      lastLogin: { $gte: weekAgo }
    });

    const activeUsersThisMonth = await User.countDocuments({
      lastLogin: { $gte: monthAgo }
    });

    // New registrations
    const newRegistrationsToday = await User.countDocuments({
      createdAt: { $gte: today }
    });

    const newRegistrationsThisWeek = await User.countDocuments({
      createdAt: { $gte: weekAgo }
    });

    const newRegistrationsThisMonth = await User.countDocuments({
      createdAt: { $gte: monthAgo }
    });

    // Company statistics
    const totalCompanies = await Company.countDocuments({});
    const newCompaniesThisMonth = await Company.countDocuments({
      createdAt: { $gte: monthAgo }
    });

    // Engagement: users with active deals
    const uniqueBuyerIds = await Deal.distinct('buyerId');
    const usersWithDeals = uniqueBuyerIds.length;
    const engagementRate = totalUsers > 0 
      ? Math.round((usersWithDeals / totalUsers) * 100) 
      : 0;

    const data = {
      totalUsers,
      activeUsers: {
        today: activeUsersToday,
        thisWeek: activeUsersThisWeek,
        thisMonth: activeUsersThisMonth
      },
      newRegistrations: {
        today: newRegistrationsToday,
        thisWeek: newRegistrationsThisWeek,
        thisMonth: newRegistrationsThisMonth
      },
      companies: {
        total: totalCompanies,
        newThisMonth: newCompaniesThisMonth
      },
      engagement: {
        usersWithDeals,
        engagementRate
      }
    };

    res.json({
      success: true,
      data
    });

  } catch (err) {
    logger.error('Error fetching user activity analytics:', { error: err });
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching user activity' 
    });
  }
});

/**
 * @route   GET /api/analytics/page-views
 * @desc    Get page view statistics from Redis
 * @access  Admin only
 */
router.get('/page-views', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const analyticsData = await getAnalyticsData(today);

    res.json({
      success: true,
      data: {
        totalViews: analyticsData.totalViews,
        uniqueVisitors: analyticsData.uniqueVisitors,
        pageViews: analyticsData.pageViews
      }
    });

  } catch (err) {
    logger.error('Error fetching page views analytics:', { error: err });
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching page views',
      data: {
        totalViews: 0,
        uniqueVisitors: 0,
        pageViews: []
      }
    });
  }
});

export default router;

