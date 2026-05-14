import express from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import { guestChatAuthMiddleware, COOKIE_NAME as GUEST_CHAT_COOKIE } from '../middleware/guestChatAuth';
import {
  createOrGetSession,
  getMessages,
  sendMessage,
  markAsRead,
  getUnreadCount,
  getAllSessions,
  closeSession,
  getAiSettings,
  putAiSettings,
  putSessionAi,
  createOrGetGuestSession,
  getGuestMessages,
  sendGuestMessage,
  initOnboardingChat
} from '../controllers/chatController';
import ChatWebSocketService from '../services/chatWebSocketService';

const router = express.Router();

// --- Guest chat (no auth, rate-limited to prevent spam) ---

/**
 * Returning clients send a `guestChatToken` cookie — that request just reuses
 * an existing session, so we skip the session-creation rate limit for them.
 * We still cap brand-new sessions per IP to prevent widget-open spam.
 */
const hasGuestCookie = (req: Request): boolean =>
  Boolean((req as Request & { cookies?: Record<string, string> }).cookies?.[GUEST_CHAT_COOKIE]);

const guestSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // up to 60 brand-new sessions per IP per hour (NAT-friendly for offices/mobile carriers)
  message: { success: false, message: 'Too many guest sessions. Try again later.' },
  standardHeaders: true,
  skip: (req) => hasGuestCookie(req),
  keyGenerator: (req) => (req.ip || req.socket?.remoteAddress || 'unknown')
});
const guestMessagesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  message: { success: false, message: 'Too many requests.' },
  standardHeaders: true,
  keyGenerator: (req) => (req.ip || req.socket?.remoteAddress || 'unknown')
});
const guestSendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 15,
  message: { success: false, message: 'Too many messages. Wait a moment.' },
  standardHeaders: true,
  keyGenerator: (req) => (req.ip || req.socket?.remoteAddress || 'unknown')
});

router.post('/guest/session', guestSessionLimiter, createOrGetGuestSession);
router.get('/guest/messages/:sessionId', guestMessagesLimiter, guestChatAuthMiddleware, getGuestMessages);
router.post('/guest/send', guestSendLimiter, guestChatAuthMiddleware, sendGuestMessage);

// --- Authenticated routes ---
// All routes below require authentication
router.use(authMiddleware);

// Onboarding: create welcome chat only for users registered < 24h
router.post('/onboarding/init', initOnboardingChat);

// Session management
router.post('/session', createOrGetSession);
router.get('/messages/:sessionId', getMessages);
router.post('/send', sendMessage);
router.put('/read/:sessionId', markAsRead);
router.get('/unread-count', getUnreadCount);

// Admin/Support routes
router.get('/sessions', getAllSessions);
router.put('/close/:sessionId', closeSession);
router.get('/ai-settings', getAiSettings);
router.put('/ai-settings', putAiSettings);
router.put('/session/:sessionId/ai', putSessionAi);

// WebSocket route - handle WebSocket upgrade
router.get('/ws', (req, res) => {
  // Check if this is a WebSocket upgrade request
  if (req.headers.upgrade === 'websocket') {
    // Let the WebSocket server handle the upgrade
    const chatWebSocketService = (global as typeof global & { chatWebSocketService?: any }).chatWebSocketService;
    if (chatWebSocketService) {
      chatWebSocketService.handleUpgrade(req, res);
    } else {
      res.status(503).json({ error: 'WebSocket service not available' });
    }
  } else {
    res.status(426).json({ error: 'Upgrade Required' });
  }
});

export default router;
