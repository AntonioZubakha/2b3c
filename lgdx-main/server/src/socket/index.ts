import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Deal from '../models/Deal';
import User from '../models/User';
import Company from '../models/Company';
import marketplaceConfig from '../config/marketplace';
import { logger } from '../utils/logger';

// Interface for JWT payload
interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
  companyId?: string;
  isLgdealSupervisor?: boolean;
  iat?: number;
  exp?: number;
}

// Extend the Socket interface to store custom user data
interface CustomSocket extends Socket {
  userId?: string;
  dealId?: string;
  isAuthenticated?: boolean;
}

// JWT secret key - use value from environment variable or a temporary one for development
const getSecretFromFile = (envVar: string, defaultValue: string): string => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    try {
      return require('fs').readFileSync(filePath, 'utf8').trim();
    } catch (e) {
      logger.error(`Failed to read ${envVar}_FILE:`, { error: e });
    }
  }
  const value = process.env[envVar];
  if (process.env.NODE_ENV === 'production') {
    if (!value) {
      throw new Error(`[Security] Missing required secret ${envVar} for Socket.IO in production`);
    }
    return value;
  }
  return value || defaultValue;
};

const JWT_SECRET = getSecretFromFile('JWT_SECRET', 'lgdx_default_secret_dev_only');
const JWT_PREV_SECRET = (() => {
  try {
    const filePath = process.env['JWT_PREV_SECRET_FILE'];
    if (filePath) return require('fs').readFileSync(filePath, 'utf8').trim();
    return process.env['JWT_PREV_SECRET'] || '';
  } catch {
    return '';
  }
})();

// Localhost origin variants for prod-local (e.g. docker-compose.prod.local.yml with FRONTEND_BASE_URL=http://localhost)
const LOCALHOST_ORIGINS = [
  'http://localhost',
  'http://localhost:80',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1',
  'http://127.0.0.1:80',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

const isLocalhostUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url);

// Helper to resolve allowed origins per environment
const resolveAllowedOrigins = (): (string | RegExp)[] => {
  if (process.env.NODE_ENV === 'production') {
    const frontendBase = process.env.FRONTEND_BASE_URL;
    logger.info('[Socket.IO] Production CORS config', { frontendBase, nodeEnv: process.env.NODE_ENV });
    if (frontendBase && typeof frontendBase === 'string') {
      const origins: (string | RegExp)[] = [frontendBase, /^https?:\/\/([a-z0-9-]+\.)*lgdeal\.net$/i];
      if (isLocalhostUrl(frontendBase)) {
        origins.push(...LOCALHOST_ORIGINS);
      }
      return origins;
    }
    logger.warn('[Socket.IO] FRONTEND_BASE_URL not set, using domain pattern fallback');
    return [/^https?:\/\/([a-z0-9-]+\.)*lgdeal\.net$/i];
  }
  return ['http://localhost', 'http://localhost:3000', 'http://localhost:3001'];
};

// Initialize Socket.io
function initializeSocket(server: HttpServer) {
  const allowedOrigins = resolveAllowedOrigins();
  logger.info('[Socket.IO] Initializing with CORS origins', { origins: allowedOrigins });
  
  const io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true
  });
  
  logger.info('[Socket.IO] Server initialized on path /socket.io');
  const dealNamespace = io.of('/deal');

  if (process.env.NODE_ENV !== 'production' && !getSecretFromFile('JWT_SECRET', '')) {
    logger.warn('WARNING: JWT_SECRET not set. Using default secret for development only.');
  }

  // Helper to parse cookies from request headers
  const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
      return cookies;
    }, {} as Record<string, string>);
  };

  // Common auth middleware to verify user and optional deal access
  const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const customSocket = socket as CustomSocket;
      
      // Parse cookies from request headers
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      
      logger.info('[Socket.io Auth] Authentication attempt', {
        hasCookieHeader: !!cookieHeader,
        cookieNames: Object.keys(cookies),
        hasAuthToken: !!cookies.authToken
      });
      
      // Prefer auth payload or cookie. Disallow query token in production.
      const auth = socket.handshake.auth as { token?: string; dealId?: string } | undefined;
      const tokenFromAuth = auth?.token;
      const tokenFromCookie = cookies.authToken;
      const tokenFromQuery = socket.handshake.query.token as string | undefined;
      const token = tokenFromAuth || tokenFromCookie || (process.env.NODE_ENV !== 'production' ? tokenFromQuery : undefined);
      
      if (!token) {
        logger.warn('[Socket.io Auth] No auth token provided', {
          hasAuthObj: !!auth,
          hasCookieHeader: !!cookieHeader,
          queryKeys: Object.keys(socket.handshake.query)
        });
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify token with primary, then optional previous secret (rotation window)
      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      } catch (e) {
        if (JWT_PREV_SECRET) {
          decoded = jwt.verify(token, JWT_PREV_SECRET) as JwtPayload;
        } else {
          throw e;
        }
      }
      customSocket.userId = decoded.userId;
      
      // Get Deal ID from the request
      const dealId = auth?.dealId || (socket.handshake.query.dealId as string);
      if (dealId) {
        customSocket.dealId = dealId;
        
        // Check user's right to access the deal
        const deal = await Deal.findById(dealId);
        if (!deal) {
          return next(new Error('Deal not found'));
        }
        
        // Check if the user is a buyer, seller, or LGDEAL administrator
        const userIsBuyer = deal.buyerId && deal.buyerId.toString() === decoded.userId;
        const userIsSeller = deal.sellerId && deal.sellerId.toString() === decoded.userId;
        // Re-validate admin privileges from DB to avoid trusting token claim blindly
        let userIsLgdealAdmin = false;
        try {
          const userFromDb = await User.findById(decoded.userId).populate('company');
          userIsLgdealAdmin = !!userFromDb && (userFromDb.role === 'admin' || ((await import('../utils/userUtils')).isLgdealSupervisor(userFromDb)));
        } catch (e) {
          logger.warn('Socket admin role revalidation failed:', { error: e });
        }
        
        if (!userIsBuyer && !userIsSeller && !userIsLgdealAdmin) {
          logger.warn('[Socket.io Auth] User not authorized for deal', {
            userId: decoded.userId,
            dealId,
            userIsBuyer,
            userIsSeller,
            userIsLgdealAdmin
          });
          return next(new Error('Not authorized to access this deal'));
        }
      }
      
      logger.info('[Socket.io Auth] ✅ Authentication successful', {
        userId: decoded.userId,
        dealId: customSocket.dealId
      });
      next();
    } catch (error: any) {
      logger.error('Socket authentication error:', { error });
      next(new Error(`Authentication error: ${error.message}`));
    }
  };

  io.use(authMiddleware);
  dealNamespace.use(authMiddleware);

  // Allowed incoming events
  const allowedIncomingEvents = new Set(['subscribe_deal']);

  /**
   * Checks whether a user is authorised to receive real-time updates for a deal.
   * Covers all roles that can legitimately view a deal page:
   *   - buyer / seller (deal participants)
   *   - LGDEAL admin / supervisor
   *   - assigned manager or logist
   */
  const canSubscribeToDeal = async (
    userId: string,
    dealId: string
  ): Promise<boolean> => {
    const deal = await Deal.findById(dealId).select('buyerId sellerId assignedTo');
    if (!deal) return false;

    const isBuyer  = deal.buyerId  && deal.buyerId.toString()  === userId;
    const isSeller = deal.sellerId && deal.sellerId.toString() === userId;

    // Check admin / supervisor via DB (avoids trusting stale JWT claim)
    let isAdmin = false;
    try {
      const userFromDb = await User.findById(userId).populate('company');
      isAdmin = !!userFromDb && (
        userFromDb.role === 'admin' ||
        ((await import('../utils/userUtils')).isLgdealSupervisor(userFromDb))
      );
    } catch (e) {
      logger.warn('[Socket] Admin role revalidation failed', { error: e });
    }

    // Assigned manager or logist
    const assignedToId = deal.assignedTo
      ? ((deal.assignedTo as any)?._id ?? deal.assignedTo).toString()
      : null;
    const isAssigned = !!assignedToId && assignedToId === userId;

    return !!(isBuyer || isSeller || isAdmin || isAssigned);
  };

  /**
   * Handles the subscribe_deal event for a connected socket.
   * Validates deal access and joins the deal room.
   */
  const handleSubscribeDeal = async (
    socket: Socket,
    payload: { dealId: string },
    namespace = ''
  ) => {
    try {
      const dealId = payload?.dealId;
      if (!dealId || typeof dealId !== 'string') return;

      const userId = (socket as CustomSocket).userId;
      if (!userId) return;

      const allowed = await canSubscribeToDeal(userId, dealId);
      if (allowed) {
        socket.join(`deal:${dealId}`);
        logger.debug(`[Socket${namespace}] User ${userId} joined deal:${dealId}`);
      } else {
        logger.warn(`[Socket${namespace}] User ${userId} not authorised for deal ${dealId}`);
      }
    } catch (e) {
      logger.error(`[Socket${namespace}] subscribe_deal error`, { error: e });
    }
  };

  // ── Default namespace ────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const customSocket = socket as CustomSocket;
    logger.info(`[Socket] User ${customSocket.userId} connected`);

    // Join personal room so NotificationService can push to user:${userId}
    if (customSocket.userId) {
      socket.join(`user:${customSocket.userId}`);
    }

    // If dealId was passed in the handshake, subscribe immediately
    if (customSocket.dealId) {
      handleSubscribeToDealRoomOnConnect(socket, customSocket.dealId);
    }

    socket.on('subscribe_deal', (payload: { dealId: string }) =>
      handleSubscribeDeal(socket, payload)
    );

    socket.onAny((eventName) => {
      if (!allowedIncomingEvents.has(eventName)) {
        logger.warn('[Socket] Blocked unexpected event', { eventName });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket] User ${customSocket.userId} disconnected`);
    });
  });

  // ── /deal namespace ──────────────────────────────────────────────────────
  logger.info('[Socket.IO] Deal namespace /deal initialized');

  dealNamespace.on('connection', (socket: Socket) => {
    const customSocket = socket as CustomSocket;
    logger.info('[Socket /deal] New connection', { userId: customSocket.userId });

    if (customSocket.userId) {
      socket.join(`user:${customSocket.userId}`);
    }

    if (customSocket.dealId) {
      handleSubscribeToDealRoomOnConnect(socket, customSocket.dealId);
    }

    socket.on('subscribe_deal', (payload: { dealId: string }) =>
      handleSubscribeDeal(socket, payload, '/deal')
    );

    socket.onAny((eventName) => {
      if (!allowedIncomingEvents.has(eventName)) {
        logger.warn('[Socket /deal] Blocked unexpected event', { eventName });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket /deal] User ${customSocket.userId} disconnected`);
    });
  });

  /**
   * Verifies deal access then joins the deal room when a dealId is passed
   * directly in the handshake (rather than via subscribe_deal event).
   */
  async function handleSubscribeToDealRoomOnConnect(
    socket: Socket,
    dealId: string
  ) {
    const userId = (socket as CustomSocket).userId;
    if (!userId) return;
    try {
      const allowed = await canSubscribeToDeal(userId, dealId);
      if (allowed) {
        socket.join(`deal:${dealId}`);
        logger.debug(`[Socket] User ${userId} joined deal:${dealId} (handshake)`);
      }
    } catch (e) {
      logger.error('[Socket] Error joining deal room on connect', { error: e });
    }
  }

  /**
   * Emits `deal_updated` to every participant of a deal in real time.
   *
   * Strategy: emit to each participant's PERSONAL room (`user:<userId>`) instead
   * of relying solely on the opt-in `deal:<dealId>` room.  Personal rooms are
   * joined automatically on every connect/reconnect (no subscription handshake
   * needed), so this delivery path survives Docker restarts, nginx timeouts,
   * and polling reconnects without any client-side re-subscription.
   *
   * The `deal:<dealId>` room is still targeted as a belt-and-suspenders
   * fallback for any additional subscribers.
   *
   * Participants notified:
   *   • buyer (buyerId)
   *   • seller (sellerId)
   *   • assigned manager or logist (assignedTo)
   *   • all active LGDEAL admins and supervisors
   */
  const emitDealUpdate = async (dealId: string) => {
    try {
      // ── 1. Collect all participant user IDs ──────────────────────────────
      const dealMeta = await Deal.findById(dealId)
        .select('buyerId sellerId assignedTo')
        .lean();

      if (!dealMeta) {
        logger.warn(`[Socket.io] emitDealUpdate: deal ${dealId} not found`);
        return;
      }

      const participantIds = new Set<string>();

      if (dealMeta.buyerId)  participantIds.add(dealMeta.buyerId.toString());
      if (dealMeta.sellerId) participantIds.add(dealMeta.sellerId.toString());
      if (dealMeta.assignedTo) {
        const aId = ((dealMeta.assignedTo as any)?._id ?? dealMeta.assignedTo).toString();
        participantIds.add(aId);
      }

      // Always include active LGDEAL admins and supervisors
      try {
        const lgdealCompany = await Company.findOne({
          name: marketplaceConfig.managementCompany.name
        }).lean();
        if (lgdealCompany) {
          const staff = await User.find({
            company: lgdealCompany._id,
            role: { $in: ['admin', 'supervisor'] },
            isActive: true
          }).select('_id').lean();
          staff.forEach(u => participantIds.add(u._id.toString()));
        }
      } catch (e) {
        logger.warn('[Socket.io] emitDealUpdate: failed to fetch LGDEAL staff', { error: e });
      }

      // ── 2. Fetch fully-populated deal payload ─────────────────────────────
      const updatedDeal = await Deal.findById(dealId)
        .populate({ path: 'products.product', select: 'shape carat color clarity price' })
        .populate('buyerId',         'email firstName lastName')
        .populate('sellerId',        'email firstName lastName')
        .populate('buyerCompanyId',  'name')
        .populate('sellerCompanyId', 'name')
        .populate({ path: 'activityLog.performedBy',                     select: 'email firstName lastName' })
        .populate({ path: 'negotiationDetails.proposedTerms.proposedBy', select: 'email firstName lastName' });

      if (!updatedDeal) return;

      // ── 3. Emit to every participant's personal room ──────────────────────
      // Personal rooms are always active — no subscribe_deal handshake required.
      for (const userId of participantIds) {
        io.to(`user:${userId}`).emit('deal_updated', updatedDeal);
      }

      // ── 4. Also emit to the deal room (belt-and-suspenders) ───────────────
      const roomName = `deal:${dealId}`;
      io.to(roomName).emit('deal_updated', updatedDeal);

      logger.info(`[Socket.io] ✅ deal_updated emitted to ${participantIds.size} personal rooms + deal room`, {
        dealId,
        participantCount: participantIds.size
      });
    } catch (error) {
      logger.error(`[Socket.io] ❌ emitDealUpdate failed for dealId ${dealId}:`, { error });
    }
  };

  // Make io globally available for NotificationService and other services
  (global as typeof globalThis & { io: typeof io }).io = io;

  // Return an object with the socket and helper functions
  return {
    io,
    emitDealUpdate
  };
}

export default initializeSocket; 