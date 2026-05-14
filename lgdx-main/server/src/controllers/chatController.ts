import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChatSession from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import User from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  chatSystemInfo,
  chatSystemWarn,
  chatSystemError,
  chatSystemDebug
} from '../utils/chatSystemLogger';
import { sendNewChatNotification, sendChatChannelMessage } from '../services/telegramService';
import ChatAiSettings from '../models/ChatAiSettings';
import { trySendAiReply, isAiConfigured } from '../services/chatAiService';
import jwt from 'jsonwebtoken';
import { signGuestChatToken, getJwtSecret, COOKIE_NAME } from '../middleware/guestChatAuth';
// chatWebSocketService will be accessed from global

// ChatWebSocketService interface for type-safe global access
interface ChatWebSocketServiceType {
  broadcastToSession(sessionId: string, message: Record<string, unknown>): number;
}

// AuthenticatedRequest is now globally extended via types/index.ts
type AuthenticatedRequest = Request;

const ONBOARDING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const AI_REPLY_DELAY_MIN_MS = 2000;
const AI_REPLY_DELAY_MAX_MS = 7000;
const DEMO_URL = 'https://lgdeal.com/#schedule-demo';

function getRandomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOnboardingWelcomeText(firstName: string | undefined): string {
  const safeFirstName = typeof firstName === 'string'
    ? firstName.trim().replace(/\s+/g, ' ').slice(0, 40)
    : '';
  const greeting = safeFirstName ? `Greetings from lgdeal.com, ${safeFirstName}!` : 'Greetings from lgdeal.com!';
  return `${greeting}\nMy name is Gleady, I'm an account manager at LGDeal.\nYou've recently registered on our Lab-Grown Diamond Exchange Network.\nPlease let me know in case of any questions.`;
}

async function isNewUserWithin24h(userId: string): Promise<{ eligible: boolean; createdAt?: Date; firstName?: string }> {
  const userDoc = await User.findById(userId).select('createdAt firstName').lean();
  if (!userDoc?.createdAt) return { eligible: false };
  const eligible = Date.now() - userDoc.createdAt.getTime() <= ONBOARDING_WINDOW_MS;
  return { eligible, createdAt: userDoc.createdAt, firstName: userDoc.firstName };
}

async function ensureOnboardingWelcomeMessage(
  session: any,
  userFirstName?: string
): Promise<{ created: boolean }> {
  const hasWelcome = await ChatMessage.exists({
    sessionId: session._id,
    sender: 'support',
    'metadata.isOnboardingWelcome': true
  });

  if (hasWelcome) return { created: false };

  const welcomeText = buildOnboardingWelcomeText(userFirstName);

  const welcomeMessage = new ChatMessage({
    sessionId: new mongoose.Types.ObjectId(session._id),
    sender: 'support',
    senderId: undefined,
    text: welcomeText,
    messageType: 'text',
    metadata: {
      deliveryStatus: 'sent',
      isAi: false,
      isOnboardingWelcome: true
    }
  });

  await welcomeMessage.save();
  return { created: true };
}

async function getOrCreateSessionWithOnboarding(
  req: AuthenticatedRequest,
  userId: string
): Promise<{
  session: any;
  onboardingEligible: boolean;
  onboardingWelcomeCreated: boolean;
}> {
  // Determine onboarding eligibility (based on user registration time)
  const onboardingInfo = await isNewUserWithin24h(userId);
  const onboardingEligible = onboardingInfo.eligible;

  // Check for existing active session
  let session = await ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: { $in: ['active', 'waiting'] }
  }).populate({
    path: 'userId',
    select: 'firstName lastName email',
    populate: {
      path: 'company',
      select: 'name'
    }
  });

  let onboardingWelcomeCreated = false;

  if (!session) {
    // Create new session
    session = new ChatSession({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'waiting',
      priority: 'medium',
      metadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        referrer: req.get('Referer'),
        pageUrl: req.get('Origin')
      }
    });

    await session.save();
    await session.populate({
      path: 'userId',
      select: 'firstName lastName email',
      populate: {
        path: 'company',
        select: 'name'
      }
    });

    // Notify support team about new chat
    await notifyNewChat(session);
  }

  if (onboardingEligible) {
    const result = await ensureOnboardingWelcomeMessage(session, onboardingInfo.firstName);
    onboardingWelcomeCreated = result.created;
  }

  return { session, onboardingEligible, onboardingWelcomeCreated };
}

// Chat "support" access: derived from company + role only (LGDeal INC + role supervisor or admin).
// req.user.isLgdealSupervisor is set by auth middleware via userUtils.isLgdealSupervisor(userFromDb), not from DB flag.

// Create or get active chat session
export const createOrGetSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { session } = await getOrCreateSessionWithOnboarding(req, userId);
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Error creating/getting chat session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create chat session' 
    });
  }
});

// Create onboarding chat session and return whether frontend should auto-open the widget.
export const initOnboardingChat = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const onboardingInfo = await isNewUserWithin24h(userId);
    if (!onboardingInfo.eligible) {
      return res.json({
        success: true,
        data: { shouldAutoOpenChat: false }
      });
    }

    const { session, onboardingEligible, onboardingWelcomeCreated } = await getOrCreateSessionWithOnboarding(req, userId);
    return res.json({
      success: true,
      data: {
        shouldAutoOpenChat: onboardingEligible,
        sessionId: session._id.toString(),
        onboardingWelcomeCreated
      }
    });
  } catch (error) {
    logger.error('Error initializing onboarding chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize onboarding chat'
    });
  }
});

// Get messages for a session
export const getMessages = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // Verify user owns this session or is support staff
    const session = await ChatSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const sessionUserId = session.userId?.toString();
    const isOwner = sessionUserId === userId;
    // Support = company (LGDeal INC) + role (supervisor|admin), set by auth middleware — not DB flag
    const isSupport = req.user?.isLgdealSupervisor;

    if (!isOwner && !isSupport) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = await ChatMessage.find({ sessionId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'firstName lastName email')
      .limit(100); // Limit to last 100 messages

    // Convert dates to ISO strings for client compatibility
    const formattedMessages = messages.map(msg => ({
      ...msg.toObject(),
      timestamp: msg.createdAt.toISOString(),
      createdAt: msg.createdAt.toISOString()
    }));

    res.json({
      success: true,
      data: formattedMessages
    });
  } catch (error) {
    logger.error('Error getting messages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get messages' 
    });
  }
});

// Send a message
export const sendMessage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, text, messageType = 'text', attachments } = req.body;
  const userId = req.user?.userId;
  const sender = req.user?.isLgdealSupervisor ? 'support' : 'user';

  if (!userId || !sessionId || !text) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields' 
    });
  }

  try {
    // Verify session exists and user has access
    const session = await ChatSession.findById(sessionId);
    if (!session) {
      chatSystemWarn('user.send.session_not_found', { channel: 'user_http', sessionId, userId });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const isOwner = session.userId != null && session.userId.toString() === userId;
    const isSupport = req.user?.isLgdealSupervisor;

    if (!isOwner && !isSupport) {
      chatSystemWarn('user.send.access_denied', { channel: 'user_http', sessionId, userId, isSupport });
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    chatSystemInfo('user.send.accepted', {
      channel: 'user_http',
      sessionId,
      userId,
      sender,
      isGuest: Boolean(session.isGuest),
      sessionAiEnabled: session.aiEnabled === true,
      textLen: String(text).trim().length,
      aiConfigured: isAiConfigured()
    });

    // Create message
    const message = new ChatMessage({
      sessionId: new mongoose.Types.ObjectId(sessionId),
      sender,
      senderId: new mongoose.Types.ObjectId(userId),
      text: text.trim(),
      messageType,
      attachments,
      metadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        deliveryStatus: 'sent'
      }
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName email');

    // Update session status
    if (session.status === 'waiting' && sender === 'support') {
      session.status = 'active';
      session.assignedTo = new mongoose.Types.ObjectId(userId);
      await session.save();
    }

    // Notify the other party
    if (sender === 'user') {
      await notifySupportMessage(session, message);
      // AI reply when global and session AI are enabled (fire-and-forget, do not block response)
      const normalizedUserText = text.trim();
      const shouldSuggestDemoOnReplyIndex = getRandomIntInclusive(2, 3);
      const aiContext = {
        demoUrl: DEMO_URL,
        shouldSuggestDemoOnReplyIndex
      };

      const chatWsForTyping = (global as typeof globalThis & { chatWebSocketService?: ChatWebSocketServiceType }).chatWebSocketService;
      // Show typing indicator immediately
      if (chatWsForTyping) chatWsForTyping.broadcastToSession(sessionId, { type: 'typing', isTyping: true });
      const userAiDelayMs = getRandomIntInclusive(AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
      chatSystemInfo('user.send.ai_scheduled', { channel: 'ai', sessionId, userId, delayMs: userAiDelayMs });
      sleep(userAiDelayMs)
        .then(() => trySendAiReply(sessionId, normalizedUserText, aiContext))
        .then((aiResult) => {
          const chatWs = (global as typeof globalThis & { chatWebSocketService?: ChatWebSocketServiceType }).chatWebSocketService;
          // Always stop typing indicator
          if (chatWs) chatWs.broadcastToSession(sessionId, { type: 'typing', isTyping: false });
          if (!aiResult) {
            chatSystemWarn('user.send.ai_no_reply', { channel: 'ai', sessionId, userId });
            return;
          }
          // Single broadcast of the AI reply via notifyUserMessage — do NOT also emit
          // an inline `type: 'message'` here (that caused duplicate AI messages and a
          // double notification sound on the client).
          notifyUserMessage(aiResult.session, aiResult.message).catch((err) => logger.error('AI notifyUserMessage', err));
        })
        .catch((err) => {
          const chatWs = (global as typeof globalThis & { chatWebSocketService?: ChatWebSocketServiceType }).chatWebSocketService;
          if (chatWs) chatWs.broadcastToSession(sessionId, { type: 'typing', isTyping: false });
          chatSystemError('user.send.ai_pipeline_failed', { channel: 'ai', sessionId, userId }, err);
        });
    } else {
      await notifyUserMessage(session, message);
    }

    // Duplicate all messages to chat channel
    // Get populated session data
    const populatedSession = await ChatSession.findById(session._id).populate({
      path: 'userId',
      select: 'firstName lastName email',
      populate: {
        path: 'company',
        select: 'name'
      }
    }); // Populated session
    const populatedMessage = await ChatMessage.findById(message._id).populate('senderId', 'firstName lastName email');

    if (populatedSession && populatedMessage) {
      const userId = populatedSession.userId;
      const senderId = populatedMessage.senderId;
      const isGuest = (populatedSession as { isGuest?: boolean }).isGuest === true;
      const isPopulatedUser = !isGuest && typeof userId === 'object' && userId && 'firstName' in userId && 'lastName' in userId && 'email' in userId;

      let companyName = 'Unknown Company';
      if (isPopulatedUser && userId && 'company' in userId) {
        const userCompany = (userId as { company?: unknown }).company;
        if (typeof userCompany === 'object' && userCompany && 'name' in userCompany) {
          companyName = (userCompany as { name: string }).name || 'Unknown Company';
        }
      }

      const userInfo = isGuest
        ? { firstName: 'Guest', lastName: '', email: '', companyName: '—' }
        : {
            firstName: isPopulatedUser ? (userId as { firstName?: string }).firstName || 'Unknown' : 'Unknown',
            lastName: isPopulatedUser ? (userId as { lastName?: string }).lastName || 'User' : 'User',
            email: isPopulatedUser ? (userId as { email?: string }).email || 'unknown@example.com' : 'unknown@example.com',
            companyName
          };

      const tgOk = await sendChatChannelMessage(
        userInfo,
        message.text,
        session._id.toString(),
        sender,
        sender === 'support' && senderId && typeof senderId === 'object' && 'firstName' in senderId && 'lastName' in senderId ? `${senderId.firstName} ${senderId.lastName}` : undefined
      );
      if (!tgOk) {
        chatSystemWarn('user.send.telegram_not_sent', {
          channel: 'telegram',
          sessionId: session._id.toString(),
          sender,
          messageId: message._id?.toString?.()
        });
      }
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    chatSystemError('user.send.failed', { channel: 'user_http', sessionId, userId }, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message' 
    });
  }
});

// Mark messages as read
export const markAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const session = await ChatSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const isOwner = session.userId != null && session.userId.toString() === userId;
    const isSupport = req.user?.isLgdealSupervisor;

    if (!isOwner && !isSupport) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Mark messages as read
    const result = await ChatMessage.updateMany(
      { 
        sessionId: new mongoose.Types.ObjectId(sessionId),
        sender: 'support',
        'metadata.readBy': { $ne: new mongoose.Types.ObjectId(userId) }
      },
      { 
        $addToSet: { 'metadata.readBy': new mongoose.Types.ObjectId(userId) }
      }
    );

    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    logger.error('Error marking messages as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark messages as read' 
    });
  }
});

// Get unread message count
export const getUnreadCount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const count = await ChatMessage.countDocuments({
      sender: 'support',
      'metadata.readBy': { $ne: new mongoose.Types.ObjectId(userId) }
    });
    
    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Error getting unread count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get unread count' 
    });
  }
});

// Get all sessions (for support/admin)
export const getAllSessions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const isSupport = req.user?.isLgdealSupervisor;

  if (!userId || !isSupport) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }

    const sessions = await ChatSession.find(filter)
      .populate('userId', 'firstName lastName email companyName')
      .populate('assignedTo', 'firstName lastName email')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await ChatSession.countDocuments(filter);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error getting all sessions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get sessions' 
    });
  }
});

// Get AI support settings (global) — support only
export const getAiSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const isSupport = req.user?.isLgdealSupervisor;
  if (!isSupport) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const doc = await ChatAiSettings.findOne().lean();
  res.json({
    success: true,
    data: {
      globalEnabled: doc?.globalEnabled ?? true,
      aiConfigured: isAiConfigured()
    }
  });
});

// Update AI support settings (global) — support only
export const putAiSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const isSupport = req.user?.isLgdealSupervisor;
  if (!isSupport) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const { globalEnabled } = req.body;
  if (typeof globalEnabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'globalEnabled must be a boolean' });
  }
  const doc = await ChatAiSettings.findOneAndUpdate(
    {},
    { globalEnabled },
    { new: true, upsert: true }
  );
  res.json({ success: true, data: doc });
});

// Update session AI enabled flag — support only
export const putSessionAi = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const isSupport = req.user?.isLgdealSupervisor;
  if (!isSupport) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const { aiEnabled } = req.body;
  if (typeof aiEnabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'aiEnabled must be a boolean' });
  }
  const session = await ChatSession.findByIdAndUpdate(
    sessionId,
    { aiEnabled },
    { new: true }
  );
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  res.json({ success: true, data: session });
});

// Close a session
export const closeSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.user?.userId;
  const isSupport = req.user?.isLgdealSupervisor;

  if (!userId || !isSupport) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  try {
    const session = await ChatSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    session.status = 'closed';
    session.closedAt = new Date();
    await session.save();

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Error closing session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to close session' 
    });
  }
});

// Helper functions for notifications
async function notifyNewChat(session: { userId?: any; isGuest?: boolean; _id: any; metadata?: any }) {
  try {
    const sessionId = session._id?.toString?.() ?? String(session._id);
    chatSystemInfo('session.notify_new_chat.start', {
      channel: 'telegram',
      sessionId,
      isGuest: Boolean(session.isGuest)
    });
    const user = session.userId;
    if (user && typeof user === 'object') {
      await sendNewChatNotification(
        {
          firstName: user.firstName || 'Unknown',
          lastName: user.lastName || 'User',
          email: user.email || 'unknown@example.com',
          companyName: user.company?.name || 'Unknown Company'
        },
        session._id.toString(),
        session.metadata
      );
    } else if (session.isGuest) {
      await sendNewChatNotification(
        { firstName: 'Guest', lastName: '', email: '', companyName: '—' },
        session._id.toString(),
        session.metadata
      );
    } else {
      chatSystemWarn('session.notify_new_chat.skipped_no_recipient', {
        channel: 'telegram',
        sessionId,
        hasUserId: Boolean(session.userId)
      });
    }
    chatSystemInfo('session.notify_new_chat.done', { channel: 'telegram', sessionId });
  } catch (error) {
    chatSystemError(
      'session.notify_new_chat.failed',
      { channel: 'telegram', sessionId: session._id?.toString?.() },
      error
    );
  }
}

async function notifySupportMessage(session: { userId?: any; isGuest?: boolean; _id: any }, message: { text?: string; _id?: any; sender?: string; createdAt?: Date; senderId?: any }) {
  try {
    const sessionId = session._id.toString();
    const chatWebSocketService = (global as typeof globalThis & { chatWebSocketService?: { sendToSupport?: (data: unknown) => void } }).chatWebSocketService;
    if (chatWebSocketService) {
      (chatWebSocketService as ChatWebSocketServiceType).broadcastToSession(session._id.toString(), {
        type: 'message',
        message: {
          id: message._id?.toString() || '',
          text: message.text || '',
          sender: message.sender || 'user',
          timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
          senderId: message.senderId
        }
      });
      chatSystemInfo('support.ws_broadcast.user_message', {
        channel: 'session',
        sessionId,
        isGuest: Boolean(session.isGuest),
        messageId: message._id?.toString?.()
      });
    } else {
      chatSystemWarn('support.ws_broadcast.skipped_no_service', {
        channel: 'session',
        sessionId,
        isGuest: Boolean(session.isGuest)
      });
    }
    // Telegram: не дублируем — для пользовательских сообщений тот же канал уже получает
    // sendChatChannelMessage() в sendMessage / sendGuestMessage (формат 👤 User).
  } catch (error) {
    chatSystemError(
      'support.notify_support_message.failed',
      { channel: 'session', sessionId: session._id?.toString?.() },
      error
    );
  }
}

async function notifyUserMessage(session: { userId?: any; _id: any }, message: { text?: string; _id?: any; sender?: string; createdAt?: Date; senderId?: any }) {
  try {
    const sessionId = session._id.toString();
    // Send message through WebSocket to the user
    const chatWebSocketService = (global as typeof globalThis & { chatWebSocketService?: { sendToUser?: (userId: unknown, data: unknown) => void } }).chatWebSocketService;

    if (chatWebSocketService) {
      const sentCount = (chatWebSocketService as ChatWebSocketServiceType).broadcastToSession(session._id.toString(), {
        type: 'message',
        message: {
          id: message._id?.toString() || '',
          text: message.text || '',
          sender: message.sender || 'support',
          timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
          senderId: message.senderId
        }
      }); // Не исключаем пользователя - сообщение от поддержки должно дойти до пользователя!
      chatSystemInfo('user.ws_broadcast.support_message', {
        channel: 'session',
        sessionId,
        messageId: message._id?.toString?.(),
        deliveredToClients: sentCount
      });
    } else {
      chatSystemWarn('user.ws_broadcast.skipped_no_service', { channel: 'session', sessionId });
    }

  } catch (error) {
    chatSystemError('user.notify_user_message.failed', { channel: 'session', sessionId: session._id?.toString?.() }, error);
  }
}

// --- Guest chat (no login required, anti-spam limits) ---

const GUEST_MESSAGES_PER_10_MIN = 10;
const GUEST_MAX_MESSAGES_IN_SESSION = 50;

/** Create or get guest chat session. Rate-limited by IP. */
export const createOrGetGuestSession = asyncHandler(async (req: Request, res: Response) => {
  const crypto = await import('crypto');
  const guestId = crypto.randomUUID();

  try {
    // Reuse existing active guest session from cookie if valid
    const existingToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    if (existingToken) {
      const secret = getJwtSecret();
      if (secret) {
        try {
          const decoded = jwt.verify(existingToken, secret) as { guestId?: string; sessionId?: string };
          if (decoded?.guestId && decoded?.sessionId) {
            const session = await ChatSession.findOne({
              _id: new mongoose.Types.ObjectId(decoded.sessionId),
              guestId: decoded.guestId,
              status: { $in: ['active', 'waiting'] }
            });
            if (session) {
              chatSystemInfo('guest.session_reused', {
                channel: 'guest_http',
                sessionId: session._id.toString(),
                guestId: decoded.guestId
              });
              res.json({ success: true, data: session, token: existingToken });
              return;
            }
          }
        } catch {
          chatSystemDebug('guest.session_cookie_invalid', { channel: 'guest_http' });
          // invalid or expired token, create new session below
        }
      }
    }

    const session = new ChatSession({
      userId: null,
      guestId,
      isGuest: true,
      status: 'waiting',
      priority: 'medium',
      metadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip || req.socket?.remoteAddress,
        referrer: req.get('Referer'),
        pageUrl: req.get('Origin')
      }
    });
    await session.save();

    chatSystemInfo('guest.session_created', {
      channel: 'guest_http',
      sessionId: session._id.toString(),
      guestId,
      aiEnabled: session.aiEnabled,
      ip: req.ip || req.socket?.remoteAddress
    });

    const token = signGuestChatToken(guestId, session._id.toString());
    if (!token) {
      chatSystemError('guest.session_token_sign_failed', { channel: 'guest_http', sessionId: session._id.toString() });
      res.status(503).json({ success: false, message: 'Service unavailable' });
      return;
    }

    const maxAge = 7 * 24 * 60 * 60; // 7 days
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAge * 1000,
      path: '/'
    });

    res.json({
      success: true,
      data: session,
      token
    });

    await notifyNewChat(session);
  } catch (error) {
    chatSystemError('guest.session_create.failed', { channel: 'guest_http' }, error);
    res.status(500).json({ success: false, message: 'Failed to create guest session' });
  }
});

/** Get messages for a guest session. Requires valid guest token for this session. */
export const getGuestMessages = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const guest = req.guest!;

  if (guest.sessionId !== sessionId) {
    chatSystemWarn('guest.get_messages.token_session_mismatch', {
      channel: 'guest_http',
      paramSessionId: sessionId,
      tokenSessionId: guest.sessionId
    });
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const session = await ChatSession.findById(sessionId);
  if (!session || !session.isGuest || session.guestId !== guest.guestId) {
    chatSystemWarn('guest.get_messages.session_mismatch', {
      channel: 'guest_http',
      sessionId,
      guestId: guest.guestId
    });
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  const messages = await ChatMessage.find({ sessionId: new mongoose.Types.ObjectId(sessionId) })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  const formattedMessages = messages.map((msg: any) => ({
    ...msg,
    id: msg._id?.toString(),
    timestamp: msg.createdAt?.toISOString?.() ?? new Date().toISOString(),
    createdAt: msg.createdAt?.toISOString?.()
  }));

  chatSystemDebug('guest.get_messages', {
    channel: 'guest_http',
    sessionId,
    guestId: guest.guestId,
    count: formattedMessages.length
  });

  res.json({ success: true, data: formattedMessages });
});

/** Send a message as guest. Returns user message + AI reply (if any) so client can show without polling. */
export const sendGuestMessage = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, text } = req.body;
  const guest = req.guest!;

  chatSystemInfo('guest.send.request', {
    channel: 'guest_http',
    sessionId,
    guestId: guest.guestId,
    textLen: typeof text === 'string' ? text.trim().length : 0,
    aiConfigured: isAiConfigured(),
    ip: req.ip || req.socket?.remoteAddress
  });

  if (!text || typeof text !== 'string' || !text.trim()) {
    chatSystemWarn('guest.send.reject_no_text', { channel: 'guest_http', sessionId });
    return res.status(400).json({ success: false, message: 'Message text required' });
  }
  if (guest.sessionId !== sessionId) {
    chatSystemWarn('guest.send.reject_session_mismatch', {
      channel: 'guest_http',
      sessionId,
      tokenSessionId: guest.sessionId
    });
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const session = await ChatSession.findById(sessionId);
  if (!session || !session.isGuest || session.guestId !== guest.guestId) {
    chatSystemWarn('guest.send.session_not_found', { channel: 'guest_http', sessionId, guestId: guest.guestId });
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await ChatMessage.countDocuments({
    sessionId: new mongoose.Types.ObjectId(sessionId),
    createdAt: { $gte: tenMinAgo }
  });
  if (recentCount >= GUEST_MESSAGES_PER_10_MIN) {
    chatSystemWarn('guest.send.rate_limit_10min', { channel: 'guest_http', sessionId, recentCount });
    return res.status(429).json({
      success: false,
      message: 'Too many messages. Please wait a few minutes before sending more.'
    });
  }

  const totalInSession = await ChatMessage.countDocuments({ sessionId: new mongoose.Types.ObjectId(sessionId) });
  if (totalInSession >= GUEST_MAX_MESSAGES_IN_SESSION) {
    chatSystemWarn('guest.send.rate_limit_session', { channel: 'guest_http', sessionId, totalInSession });
    return res.status(429).json({
      success: false,
      message: 'Session message limit reached. Please start a new chat or log in for full support.'
    });
  }

  const message = new ChatMessage({
    sessionId: new mongoose.Types.ObjectId(sessionId),
    sender: 'user',
    senderId: undefined,
    text: text.trim().slice(0, 2000),
    messageType: 'text',
    metadata: { userAgent: req.get('User-Agent'), ipAddress: req.ip, deliveryStatus: 'sent' }
  });
  await message.save();

  session.lastMessageAt = new Date();
  await session.save();

  chatSystemInfo('guest.send.message_persisted', {
    channel: 'guest_http',
    sessionId,
    messageId: message._id?.toString(),
    sessionAiEnabled: session.aiEnabled === true
  });

  await notifySupportMessage(session, message);

  const guestUserInfo = { firstName: 'Guest', lastName: '', email: '', companyName: '—' };
  const tgUserOk = await sendChatChannelMessage(guestUserInfo, message.text, sessionId, 'user');
  if (!tgUserOk) {
    chatSystemWarn('guest.send.telegram_user_not_sent', { channel: 'telegram', sessionId, messageId: message._id?.toString() });
  }

  let aiReplyPayload: { id: string; text: string; timestamp: string } | null = null;
  try {
    const normalizedUserText = text.trim();
    const shouldSuggestDemoOnReplyIndex = getRandomIntInclusive(2, 3);
    const aiContext = {
      demoUrl: DEMO_URL,
      shouldSuggestDemoOnReplyIndex
    };
    const delayMs = getRandomIntInclusive(AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
    chatSystemInfo('guest.send.ai_wait', { channel: 'ai', sessionId, delayMs, sessionAiEnabled: session.aiEnabled });
    await sleep(delayMs);
    const aiResult = await trySendAiReply(sessionId, normalizedUserText, aiContext);
    if (aiResult?.message) {
      const msg = aiResult.message as { _id?: any; text?: string; createdAt?: Date };
      aiReplyPayload = {
        id: msg._id?.toString?.() ?? '',
        text: msg.text ?? '',
        timestamp: msg.createdAt?.toISOString?.() ?? new Date().toISOString()
      };
      const tgAiOk = await sendChatChannelMessage(guestUserInfo, msg.text ?? '', sessionId, 'support', 'Gleady');
      if (!tgAiOk) {
        chatSystemWarn('guest.send.telegram_ai_not_sent', { channel: 'telegram', sessionId, aiMessageId: msg._id?.toString?.() });
      }
      chatSystemInfo('guest.send.ai_reply_ok', {
        channel: 'ai',
        sessionId,
        aiMessageId: msg._id?.toString?.(),
        replyChars: (msg.text ?? '').length
      });
    } else {
      chatSystemWarn('guest.send.ai_no_reply', { channel: 'ai', sessionId });
    }
  } catch (err) {
    chatSystemError('guest.send.ai_pipeline_failed', { channel: 'ai', sessionId }, err);
  }

  res.json({
    success: true,
    data: {
      userMessage: {
        id: message._id?.toString(),
        text: message.text,
        sender: 'user',
        timestamp: message.createdAt?.toISOString?.()
      },
      aiReply: aiReplyPayload
    }
  });
});
