import { Request, Response } from 'express';
import { notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { 
  NotFoundError, 
  UnauthorizedError, 
  ValidationError,
  asyncHandler 
} from '../middleware/errorHandler';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    companyId?: string;
    isLgdealSupervisor?: boolean;
  };
}

/**
 * Get user's notifications with pagination
 * GET /api/notifications
 */
export const getNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = parseInt(req.query.skip as string) || 0;

  logger.debug('[getNotifications] Fetching notifications', { userId, limit, skip });

  const result = await notificationService.getUserNotifications(userId, limit, skip);

  res.json({
    success: true,
    ...result
  });
});

/**
 * Get unread notifications
 * GET /api/notifications/unread
 */
export const getUnreadNotifications = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;

  logger.debug('[getUnreadNotifications] Fetching unread notifications', { userId });

  const notifications = await notificationService.getUnreadNotifications(userId);

  res.json({
    success: true,
    notifications,
    count: notifications.length
  });
});

/**
 * Get unread count
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;

  const count = await notificationService.getUnreadCount(userId);

  res.json({
    success: true,
    count
  });
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
export const markNotificationAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Notification ID is required');
  }

  logger.debug('[markNotificationAsRead] Marking notification as read', { userId, notificationId: id });

  const success = await notificationService.markAsRead(id, userId);

  if (!success) {
    throw new NotFoundError('Notification not found or already marked as read');
  }

  res.json({
    success: true,
    message: 'Notification marked as read'
  });
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllNotificationsAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;

  logger.debug('[markAllNotificationsAsRead] Marking all notifications as read', { userId });

  const count = await notificationService.markAllAsRead(userId);

  res.json({
    success: true,
    message: `${count} notification(s) marked as read`,
    count
  });
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
export const deleteNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('User not authenticated');
  }

  const { userId } = req.user;
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Notification ID is required');
  }

  logger.debug('[deleteNotification] Deleting notification', { userId, notificationId: id });

  const success = await notificationService.deleteNotification(id, userId);

  if (!success) {
    throw new NotFoundError('Notification not found');
  }

  res.json({
    success: true,
    message: 'Notification deleted'
  });
});
