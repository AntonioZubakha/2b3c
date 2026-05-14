import Notification, { INotification, NotificationType, NotificationPriority } from '../models/Notification';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { sendDealChangeNotification, sendDealEventNotification } from '../utils/telegramBot';
import { IUser } from '../types';
import User from '../models/User';
import Company from '../models/Company';
import marketplaceConfig from '../config/marketplace';
import { dispatchUserChannels } from './userNotificationDispatcher';

/**
 * Service for creating and managing notifications for LGDEAL Internal Workflow
 * Handles both in-app notifications (stored in DB) and Telegram notifications
 */
export class NotificationService {
  /**
   * Creates a new in-app notification and optionally sends Telegram notification
   * @param data Notification data
   * @param sendTelegram Whether to send Telegram notification (default: true)
   * @returns Created notification document
   */
  async createNotification(
    data: {
      userId: string | Types.ObjectId;
      type: NotificationType;
      title: string;
      message: string;
      dealId?: string | Types.ObjectId;
      dealNumber?: string;
      priority?: NotificationPriority;
      actionUrl?: string;
      actionLabel?: string;
      metadata?: Record<string, unknown>;
    },
    sendTelegram: boolean = true
  ): Promise<INotification> {
    try {
      // Create in-app notification
      const notification = await Notification.create({
        userId: new Types.ObjectId(data.userId as string),
        type: data.type,
        title: data.title,
        message: data.message,
        dealId: data.dealId ? new Types.ObjectId(data.dealId as string) : undefined,
        dealNumber: data.dealNumber,
        priority: data.priority || 'medium',
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        metadata: data.metadata,
        read: false,
        createdAt: new Date()
      });

      logger.info('[NotificationService] In-app notification created', {
        notificationId: notification._id,
        userId: data.userId,
        type: data.type,
        dealNumber: data.dealNumber
      });

      // Send Telegram notification to the shared LGDEAL deal-events chat (team visibility).
      if (sendTelegram && data.dealNumber) {
        this.sendTelegramNotification(data);
      }

      // Send WebSocket notification for real-time updates (powers the in-app bell).
      if ((global as typeof globalThis & { io?: any }).io) {
        const io = (global as typeof globalThis & { io: any }).io;
        io.to(`user:${data.userId}`).emit('new_notification', notification);
        logger.debug('[NotificationService] WebSocket notification sent', {
          userId: data.userId,
          notificationId: notification._id
        });
      }

      // Fan out to the recipient's personal channels (email / Telegram DM / WhatsApp)
      // honoring per-user prefs. Fire-and-forget — never block the caller.
      void dispatchUserChannels({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        dealId: data.dealId,
        dealNumber: data.dealNumber,
        priority: data.priority,
        actionUrl: data.actionUrl
      });

      return notification;
    } catch (error) {
      logger.error('[NotificationService] Failed to create notification', {
        error: getErrorMessage(error),
        data
      });
      throw error;
    }
  }

  /**
   * Sends Telegram notification using existing Deal Event Bot
   * @param data Notification data
   */
  private sendTelegramNotification(data: {
    type: NotificationType;
    title: string;
    message: string;
    dealNumber?: string;
    dealId?: string | Types.ObjectId;
  }): void {
    try {
      const emoji = this.getEmojiForType(data.type);
      let telegramMessage = `${emoji} <b>${data.title}</b>\n\n${data.message}`;
      if (data.dealNumber) {
        telegramMessage += `\n\nDeal #${data.dealNumber}`;
      }
      sendDealEventNotification(telegramMessage);

      logger.debug('[NotificationService] Telegram notification sent', {
        type: data.type,
        dealNumber: data.dealNumber
      });
    } catch (error) {
      logger.error('[NotificationService] Failed to send Telegram notification', {
        error: getErrorMessage(error),
        type: data.type
      });
      // Don't throw - Telegram failures shouldn't break the workflow
    }
  }

  /**
   * Gets emoji for notification type
   */
  private getEmojiForType(type: NotificationType): string {
    const emojiMap: Record<NotificationType, string> = {
      // LGDEAL Internal Workflow
      'deal_assigned': '📌',
      'deal_reassigned': '🔄',
      'quality_rejected': '❌',
      'alternative_auto_assigned': '🔁',
      'no_alternatives_available': '⚠️',
      'ready_for_shipping': '📦',
      'stone_received': '💎',
      'quality_approved': '✅',
      // Deal Flow Notifications
      'deal_created': '🆕',
      'request_approved': '✅',
      'request_rejected': '❌',
      'invoice_uploaded': '📄',
      'invoice_accepted': '✅',
      'invoice_rejected': '❌',
      'invoice_recalled': '↩️',
      'payment_confirmed': '💰',
      'order_shipped': '🚚',
      'delivery_confirmed': '✅',
      'alternative_proposed': '🔄',
      'quality_rejected_alternative_selected': '🔄',
      'alternative_accepted': '✅',
      'alternative_rejected': '❌',
      'deal_cancelled': '❌',
      'shipping_cost_updated': '📦',
      'import_tariff_updated': '📋'
    };
    return emojiMap[type] || '📬';
  }

  /**
   * Gets user's unread notifications
   */
  async getUnreadNotifications(userId: string | Types.ObjectId): Promise<INotification[]> {
    try {
      return await Notification.find({
        userId: new Types.ObjectId(userId as string),
        read: false
      })
        .sort({ createdAt: -1 })
        .limit(50);
    } catch (error) {
      logger.error('[NotificationService] Failed to get unread notifications', {
        error: getErrorMessage(error),
        userId
      });
      throw error;
    }
  }

  /**
   * Gets all user's notifications with pagination
   */
  async getUserNotifications(
    userId: string | Types.ObjectId,
    limit: number = 20,
    skip: number = 0
  ): Promise<{ notifications: INotification[]; total: number; unreadCount: number }> {
    try {
      const userIdObj = new Types.ObjectId(userId as string);

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find({ userId: userIdObj })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip),
        Notification.countDocuments({ userId: userIdObj }),
        Notification.countDocuments({ userId: userIdObj, read: false })
      ]);

      return { notifications, total, unreadCount };
    } catch (error) {
      logger.error('[NotificationService] Failed to get user notifications', {
        error: getErrorMessage(error),
        userId
      });
      throw error;
    }
  }

  /**
   * Marks notification as read
   */
  async markAsRead(notificationId: string | Types.ObjectId, userId: string | Types.ObjectId): Promise<boolean> {
    try {
      const result = await Notification.updateOne(
        {
          _id: new Types.ObjectId(notificationId as string),
          userId: new Types.ObjectId(userId as string)
        },
        {
          read: true,
          readAt: new Date()
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      logger.error('[NotificationService] Failed to mark notification as read', {
        error: getErrorMessage(error),
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Marks all user's notifications as read
   */
  async markAllAsRead(userId: string | Types.ObjectId): Promise<number> {
    try {
      const result = await Notification.updateMany(
        {
          userId: new Types.ObjectId(userId as string),
          read: false
        },
        {
          read: true,
          readAt: new Date()
        }
      );

      logger.info('[NotificationService] Marked all notifications as read', {
        userId,
        count: result.modifiedCount
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error('[NotificationService] Failed to mark all notifications as read', {
        error: getErrorMessage(error),
        userId
      });
      throw error;
    }
  }

  /**
   * Deletes a notification
   */
  async deleteNotification(notificationId: string | Types.ObjectId, userId: string | Types.ObjectId): Promise<boolean> {
    try {
      const result = await Notification.deleteOne({
        _id: new Types.ObjectId(notificationId as string),
        userId: new Types.ObjectId(userId as string)
      });

      return result.deletedCount > 0;
    } catch (error) {
      logger.error('[NotificationService] Failed to delete notification', {
        error: getErrorMessage(error),
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Gets unread count for user
   */
  async getUnreadCount(userId: string | Types.ObjectId): Promise<number> {
    try {
      return await Notification.countDocuments({
        userId: new Types.ObjectId(userId as string),
        read: false
      });
    } catch (error) {
      logger.error('[NotificationService] Failed to get unread count', {
        error: getErrorMessage(error),
        userId
      });
      return 0;
    }
  }

  /**
   * Notifies the counterparty in a deal (buyer or seller).
   * Determines who to notify based on the action and deal type.
   * Also fans out a copy to all active LGDEAL admins and supervisors.
   *
   * LGDEAL staff (managers, logists) acting on buyer-to-lgdeal / lgdeal-to-seller deals
   * have their own userId that does NOT match the deal's sellerId / buyerId.
   * The fix: for LGDEAL deal types, if the actor is not the "external" party, treat them
   * as LGDEAL staff and notify the external party.
   */
  async notifyCounterparty(
    deal: { 
      _id: Types.ObjectId | string;
      dealNumber: string;
      buyerId: Types.ObjectId | string | IUser;
      sellerId?: Types.ObjectId | string | IUser;
      dealType?: string;
    },
    actionPerformedBy: string | Types.ObjectId,
    notificationType: NotificationType,
    title: string,
    message: string,
    priority: NotificationPriority = 'medium'
  ): Promise<void> {
    try {
      const actionPerformedById = actionPerformedBy.toString();
      
      const extractId = (v: Types.ObjectId | string | IUser | undefined): string | undefined => {
        if (!v) return undefined;
        if (typeof v === 'object' && '_id' in v) return (v as IUser)._id?.toString() || String(v);
        if (typeof v === 'object' && 'toString' in v) return (v as Types.ObjectId).toString();
        return String(v);
      };

      const buyerIdStr = extractId(deal.buyerId);
      const sellerIdStr = extractId(deal.sellerId);
      
      logger.debug('[NotificationService] notifyCounterparty called', {
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        dealType: deal.dealType,
        actionPerformedById,
        buyerIdStr,
        sellerIdStr,
        notificationType
      });

      let recipientId: string | null = null;

      // buyer-to-lgdeal: external party = buyer, LGDEAL side = anyone who is not the buyer
      if (deal.dealType === 'buyer-to-lgdeal') {
        if (actionPerformedById === buyerIdStr && sellerIdStr) {
          // Buyer acted → notify LGDEAL (sellerId account)
          recipientId = sellerIdStr;
          logger.debug('[NotificationService] buyer-to-lgdeal: buyer acted → notifying LGDEAL (seller)');
        } else if (buyerIdStr && actionPerformedById !== buyerIdStr) {
          // Anyone on the LGDEAL side (supervisor, manager, logist) → notify buyer
          recipientId = buyerIdStr;
          logger.debug('[NotificationService] buyer-to-lgdeal: LGDEAL staff acted → notifying buyer');
        }
      }
      // lgdeal-to-seller: external party = seller, LGDEAL side = anyone who is not the seller
      else if (deal.dealType === 'lgdeal-to-seller') {
        if (actionPerformedById === sellerIdStr && buyerIdStr) {
          // Seller acted → notify LGDEAL (buyerId account)
          recipientId = buyerIdStr;
          logger.debug('[NotificationService] lgdeal-to-seller: seller acted → notifying LGDEAL (buyer)');
        } else if (sellerIdStr && actionPerformedById !== sellerIdStr) {
          // LGDEAL side acted → notify seller
          recipientId = sellerIdStr;
          logger.debug('[NotificationService] lgdeal-to-seller: LGDEAL staff acted → notifying seller');
        }
      }
      // Regular deal: buyer ↔ seller
      else {
        if (actionPerformedById === buyerIdStr && sellerIdStr) {
          recipientId = sellerIdStr;
          logger.debug('[NotificationService] Regular deal: buyer acted → notifying seller');
        } else if (actionPerformedById === sellerIdStr && buyerIdStr) {
          recipientId = buyerIdStr;
          logger.debug('[NotificationService] Regular deal: seller acted → notifying buyer');
        }
      }

      if (!recipientId) {
        logger.warn('[NotificationService] Could not determine counterparty to notify', {
          dealId: deal._id,
          dealNumber: deal.dealNumber,
          dealType: deal.dealType,
          buyerIdStr,
          sellerIdStr,
          actionPerformedById
        });
        return;
      }

      await this.createNotification({
        userId: recipientId,
        type: notificationType,
        title,
        message,
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        priority,
        actionUrl: `/deal/${deal._id}`,
        actionLabel: 'View Deal'
      });

      logger.info('[NotificationService] Counterparty notified', {
        dealId: deal._id,
        dealNumber: deal.dealNumber,
        recipientId,
        notificationType
      });

      // Fan out to admins and supervisors (they see everything)
      await this.notifyAdminsAndSupervisors(deal, notificationType, title, message, priority, actionPerformedById);

    } catch (error) {
      logger.error('[NotificationService] Failed to notify counterparty', {
        error: getErrorMessage(error),
        dealId: deal._id
      });
      // Don't throw - notification failures shouldn't break the workflow
    }
  }

  /**
   * Sends a copy of any deal notification to all active LGDEAL admins and supervisors.
   * Per business requirement: admins/supervisors see ALL deal notifications.
   * @param excludeUserId Actor's ID — skip if they are themselves an admin/supervisor (no self-notification)
   */
  async notifyAdminsAndSupervisors(
    deal: {
      _id: Types.ObjectId | string;
      dealNumber: string;
    },
    type: NotificationType,
    title: string,
    message: string,
    priority: NotificationPriority = 'medium',
    excludeUserId?: string
  ): Promise<void> {
    try {
      const lgdealCompany = await Company.findOne({ name: marketplaceConfig.managementCompany.name }).lean();
      if (!lgdealCompany) return;

      const staff = await User.find({
        company: lgdealCompany._id,
        role: { $in: ['admin', 'supervisor'] },
        isActive: true
      }).select('_id').lean();

      const targets = staff.filter(u => !excludeUserId || u._id.toString() !== excludeUserId);
      if (targets.length === 0) return;

      await Promise.allSettled(
        targets.map(u =>
          this.createNotification({
            userId: u._id,
            type,
            title,
            message,
            dealId: deal._id,
            dealNumber: deal.dealNumber,
            priority,
            actionUrl: `/deal/${deal._id}`,
            actionLabel: 'View Deal'
          }, false)
        )
      );

      logger.info('[NotificationService] Admins/supervisors notified', {
        dealNumber: deal.dealNumber,
        count: targets.length,
        type
      });
    } catch (error) {
      logger.error('[NotificationService] Failed to notify admins/supervisors', {
        error: getErrorMessage(error),
        dealId: deal._id
      });
      // Don't throw
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
