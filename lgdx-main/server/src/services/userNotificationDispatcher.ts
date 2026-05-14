/**
 * Per-user fan-out for transactional notifications about deal events.
 *
 * Why a separate module?
 * - `notificationService.createNotification` already handles the "team" channels
 *   (in-app bell, websocket, shared LGDEAL Telegram chat). This module is
 *   strictly for **personal** channels of the recipient: email, personal
 *   Telegram DM, personal WhatsApp.
 * - Each channel runs in its own try/catch; failures never bubble up and
 *   never block the notification creation flow.
 * - Per-(user, deal, type) deduplication via Redis avoids flooding when
 *   multiple `createNotification` paths fan out for the same business event.
 */
import { Types } from 'mongoose';
import User from '../models/User';
import type { IUserDocument } from '../models/User';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';
import { getRedisClient } from '../config/redis';
import { emailService } from './emailService';
import { sendDealEventToUserDM } from '../utils/telegramBot';
import { sendDealEventViaWhatsApp } from '../whatsapp/whatsappTransactional.service';
import type { NotificationType, NotificationPriority } from '../models/Notification';

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
const DEDUP_TTL_SECONDS = 15 * 60;

export interface DealEventPayload {
  userId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  dealId?: string | Types.ObjectId;
  dealNumber?: string;
  priority?: NotificationPriority;
  actionUrl?: string;
}

interface ResolvedRecipient {
  user: IUserDocument;
  email: boolean;
  telegram: boolean;
  whatsapp: boolean;
}

/**
 * Skip duplicate fan-outs for the same (user, deal, type) within DEDUP_TTL_SECONDS.
 * Multiple call sites (e.g. notifyCounterparty + notifyAdminsAndSupervisors) may
 * legitimately produce the same logical event for the same recipient.
 */
async function shouldSkipDuplicate(payload: DealEventPayload): Promise<boolean> {
  try {
    const dealKey = payload.dealId ? String(payload.dealId) : (payload.dealNumber || 'no-deal');
    const key = `notif:dedup:${String(payload.userId)}:${dealKey}:${payload.type}`;
    const r = getRedisClient();
    // SET key 1 NX EX <ttl> — returns null if the key already existed.
    const set = await r.set(key, '1', { NX: true, EX: DEDUP_TTL_SECONDS });
    return set === null;
  } catch (err) {
    // Redis is best-effort here. If it's down, prefer to deliver (possible duplicate)
    // over silently dropping a real notification.
    logger.warn('[NotifDispatcher] Redis dedupe check failed, allowing send', {
      error: getErrorMessage(err)
    });
    return false;
  }
}

async function resolveRecipient(userId: string | Types.ObjectId): Promise<ResolvedRecipient | null> {
  const user = await User.findById(userId).select(
    '_id email firstName lastName phone telegramId notificationPrefs isActive'
  );
  if (!user || !user.isActive) return null;

  const prefs = user.notificationPrefs || {};
  return {
    user,
    email: prefs.email !== false && Boolean(user.email) && emailService.isAvailable(),
    telegram: prefs.telegram !== false && Boolean(user.telegramId),
    whatsapp: prefs.whatsapp === true && Boolean(user.phone)
  };
}

function buildActionUrl(payload: DealEventPayload): string | undefined {
  if (payload.actionUrl) {
    return payload.actionUrl.startsWith('http')
      ? payload.actionUrl
      : `${FRONTEND_BASE_URL}${payload.actionUrl}`;
  }
  if (payload.dealId) {
    return `${FRONTEND_BASE_URL}/deal/${String(payload.dealId)}`;
  }
  return undefined;
}

/**
 * Fan out a notification to the recipient's personal channels.
 * Safe to call from any context — never throws, never blocks.
 */
export async function dispatchUserChannels(payload: DealEventPayload): Promise<void> {
  try {
    if (!payload.userId) return;

    if (await shouldSkipDuplicate(payload)) {
      logger.debug('[NotifDispatcher] Duplicate skipped', {
        userId: String(payload.userId),
        type: payload.type,
        dealNumber: payload.dealNumber
      });
      return;
    }

    const recipient = await resolveRecipient(payload.userId);
    if (!recipient) return;

    const actionUrl = buildActionUrl(payload);
    const enriched = { ...payload, actionUrl };

    const tasks: Array<Promise<unknown>> = [];

    if (recipient.email) {
      tasks.push(
        emailService
          .sendDealEventEmail(recipient.user.email, recipient.user.firstName, enriched)
          .catch((err) =>
            logger.warn('[NotifDispatcher] Email send failed', {
              userId: String(payload.userId),
              type: payload.type,
              error: getErrorMessage(err)
            })
          )
      );
    }

    if (recipient.telegram && recipient.user.telegramId) {
      tasks.push(
        sendDealEventToUserDM(recipient.user.telegramId, enriched).catch((err) =>
          logger.warn('[NotifDispatcher] Telegram DM failed', {
            userId: String(payload.userId),
            type: payload.type,
            error: getErrorMessage(err)
          })
        )
      );
    }

    if (recipient.whatsapp && recipient.user.phone) {
      tasks.push(
        sendDealEventViaWhatsApp(recipient.user.phone, enriched).catch((err) =>
          logger.warn('[NotifDispatcher] WhatsApp send failed', {
            userId: String(payload.userId),
            type: payload.type,
            error: getErrorMessage(err)
          })
        )
      );
    }

    if (tasks.length === 0) {
      logger.debug('[NotifDispatcher] No personal channels enabled for recipient', {
        userId: String(payload.userId),
        type: payload.type
      });
      return;
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    logger.error('[NotifDispatcher] Unexpected dispatch failure', {
      error: getErrorMessage(err),
      userId: String(payload.userId),
      type: payload.type
    });
  }
}
