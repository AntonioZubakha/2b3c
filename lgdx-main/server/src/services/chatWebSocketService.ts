import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import ChatSession from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import User from '../models/User';
import { isLgdealSupervisor } from '../utils/userUtils';
import { logger } from '../utils/logger';
import { chatSystemInfo, chatSystemWarn, chatSystemError } from '../utils/chatSystemLogger';
import { sendChatChannelMessage } from './telegramService';
import { trySendAiReply } from './chatAiService';

const AI_REPLY_DELAY_MIN_MS = 2000;
const AI_REPLY_DELAY_MAX_MS = 7000;
const DEMO_URL = 'https://lgdeal.com/#schedule-demo';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
  isLgdealSupervisor?: boolean;
  sessionId?: string;
  isAlive?: boolean;
  isAuthenticated?: boolean;
}

// JWT Payload interface
interface JwtPayloadType {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

// WebSocket message interface (renamed to avoid conflict with ChatMessage model)
interface WebSocketChatMessage {
  type: 'message' | 'typing' | 'auth' | 'join_session' | 'leave_session';
  message?: {
    sessionId?: string;
    text?: string;
    messageType?: string;
    attachments?: unknown[];
    [key: string]: unknown;
  };
  sessionId?: string;
  token?: string;
  isTyping?: boolean;
}

function getRandomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ChatWebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private sessionClients: Map<string, Set<string>> = new Map(); // sessionId -> Set of userIds

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/chat/ws'
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  public handleUpgrade(req: any, res: any) {
    this.wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws: AuthenticatedWebSocket) => {
      this.wss.emit('connection', ws, req);
    });
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (ws: AuthenticatedWebSocket, req: any) => {
      logger.info('[WebSocket] New connection attempt');
  
      
      // Authenticate user using cookies from request headers
      try {
        await this.authenticateFromCookies(ws, req);
        logger.info('[WebSocket] Authentication successful');
      } catch (error) {
        logger.error('WebSocket authentication failed:', error);
        ws.close(1008, 'Authentication failed');
        return;
      }
      
      ws.isAlive = true;
      
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data: any) => {
        try {
          const message: WebSocketChatMessage = JSON.parse(data.toString());
          logger.info('[WebSocket] Message received:', { type: message.type, userId: ws.userId });
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Error handling WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error: unknown) => {
        logger.error('WebSocket error:', error);
        this.handleDisconnect(ws);
      });
    });

    logger.info('Chat WebSocket server started');
  }

  private async handleMessage(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    // Check if user is authenticated (should be done during connection)
    if (!ws.isAuthenticated || !ws.userId) {
      this.sendError(ws, 'User not authenticated');
      return;
    }

    switch (message.type) {
      case 'join_session':
        await this.handleJoinSession(ws, message);
        break;
      case 'leave_session':
        await this.handleLeaveSession(ws, message);
        break;
      case 'message':
        await this.handleChatMessage(ws, message);
        break;
      case 'typing':
        await this.handleTyping(ws, message);
        break;
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  private async authenticateFromCookies(ws: AuthenticatedWebSocket, req: any) {
    
    
    const cookies = req.headers.cookie;
    if (!cookies) {
      logger.error('No cookies found in request');
      throw new Error('No cookies found');
    }


    // Parse cookies
    const cookieMap = new Map();
    cookies.split(';').forEach((cookie: string) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookieMap.set(name, value);
      }
    });

    const authToken = cookieMap.get('authToken');
    if (!authToken) {
      logger.error('No authToken cookie found');
      throw new Error('No authToken cookie found');
    }


    // Get JWT secret from environment or file
    let jwtSecret = process.env.JWT_SECRET;

    
    if (!jwtSecret && process.env.JWT_SECRET_FILE) {
      try {
        jwtSecret = require('fs').readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim();

      } catch (error) {
        logger.error('Failed to read JWT_SECRET_FILE:', error);
      }
    }
    
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not defined');
      throw new Error('Server configuration error');
    }
    
    const decoded = jwt.verify(authToken, jwtSecret) as JwtPayloadType;
    
    // Support = company (LGDeal INC) + role (supervisor|admin) only — isLgdealSupervisor(user), not DB flag
    const user = await User.findById(decoded.userId).select('_id role company').populate('company');
    if (!user) {
      throw new Error('User not found');
    }

    // Set user info on WebSocket
    ws.userId = user._id.toString();
    ws.userRole = user.role;
    ws.isLgdealSupervisor = isLgdealSupervisor(user);
    ws.isAuthenticated = true;



    // Add user to clients map
    this.clients.set(ws.userId, ws);
    
    logger.info(`[WebSocket] User ${ws.userId} connected successfully (role: ${ws.userRole}, isLgdealSupervisor: ${ws.isLgdealSupervisor})`);


    // Automatically join user's active session
    await this.autoJoinActiveSession(ws);
    
    
  }

  private async handleAuth(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    try {
      if (!message.token) {
        this.sendError(ws, 'No token provided');
        return;
      }

      // Get JWT secret from environment or file
      let jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret && process.env.NODE_ENV === 'development') {
        logger.debug('JWT_SECRET from env:', jwtSecret ? 'set' : 'not set');
      }
      
      if (!jwtSecret && process.env.JWT_SECRET_FILE) {
        try {
          jwtSecret = require('fs').readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim();
  
        } catch (error) {
          logger.error('Failed to read JWT_SECRET_FILE:', error);
        }
      }
      
      if (!jwtSecret) {
        logger.error('JWT_SECRET is not defined');
        this.sendError(ws, 'Server configuration error');
        return;
      }
      
      const decoded = jwt.verify(message.token, jwtSecret) as JwtPayloadType;
      
      // Support = company (LGDeal INC) + role (supervisor|admin) only — isLgdealSupervisor(user), not DB flag
      const user = await User.findById(decoded.userId).select('_id role company').populate('company');
      if (!user) {
        this.sendError(ws, 'User not found');
        return;
      }

      ws.userId = decoded.userId;
      ws.userRole = user.role;
      ws.isLgdealSupervisor = isLgdealSupervisor(user);
      
      this.clients.set(decoded.userId, ws);
      
      // Automatically join user's active session
      await this.autoJoinActiveSession(ws);
      

      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'auth_success',
          userId: decoded.userId
        }));
      }
    } catch (error) {
      logger.error('Auth error:', error);
      this.sendError(ws, 'Authentication failed');
    }
  }

  private async autoJoinActiveSession(ws: AuthenticatedWebSocket) {
    if (!ws.userId) return;

    try {
      // For support users, join ALL active sessions
      if (ws.isLgdealSupervisor) {
        const sessions = await ChatSession.find({
          status: { $in: ['active', 'waiting'] }
        });

        for (const session of sessions) {
          // Add to session clients
          if (!this.sessionClients.has(session._id.toString())) {
            this.sessionClients.set(session._id.toString(), new Set());
          }
          this.sessionClients.get(session._id.toString())!.add(ws.userId);
        }
        

      } else {
        // For regular users, find their own active session
        const session = await ChatSession.findOne({
          userId: new mongoose.Types.ObjectId(ws.userId),
          status: { $in: ['active', 'waiting'] }
        });

        if (session) {
          ws.sessionId = session._id.toString();
          
          // Add to session clients
          if (!this.sessionClients.has(session._id.toString())) {
            this.sessionClients.set(session._id.toString(), new Set());
          }
          this.sessionClients.get(session._id.toString())!.add(ws.userId);
          
    
        }
      }
    } catch (error) {
      logger.error('Error auto-joining session:', error);
    }
  }

  private async handleJoinSession(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    if (!ws.userId || !message.sessionId) {
      this.sendError(ws, 'Not authenticated or missing session ID');
      return;
    }

    try {
      // Verify user has access to this session
      const session = await ChatSession.findById(message.sessionId);
      if (!session) {
        this.sendError(ws, 'Session not found');
        return;
      }

      const isOwner = session.userId != null && session.userId.toString() === ws.userId;
      const isSupport = ws.isLgdealSupervisor;

      if (!isOwner && !isSupport) {
        this.sendError(ws, 'Access denied');
        return;
      }

      ws.sessionId = message.sessionId;

      // Add to session clients (idempotent: same user can join same session multiple times, e.g. reconnect or tab switch)
      if (!this.sessionClients.has(message.sessionId)) {
        this.sessionClients.set(message.sessionId, new Set());
      }
      const sessionUserIds = this.sessionClients.get(message.sessionId)!;
      const alreadyInSession = sessionUserIds.has(ws.userId);
      sessionUserIds.add(ws.userId);

      if (!alreadyInSession) {
        logger.info(`User ${ws.userId} joined session ${message.sessionId}`);
      }
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'session_joined',
          sessionId: message.sessionId
        }));
      }
    } catch (error) {
      logger.error('Join session error:', error);
      this.sendError(ws, 'Failed to join session');
    }
  }

  private async handleLeaveSession(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    if (!ws.userId || !ws.sessionId) return;

    const sessionClients = this.sessionClients.get(ws.sessionId);
    if (sessionClients) {
      sessionClients.delete(ws.userId);
      if (sessionClients.size === 0) {
        this.sessionClients.delete(ws.sessionId);
      }
    }

    ws.sessionId = undefined;

  }

  private async handleChatMessage(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    

    if (!ws.userId || !message.message || !message.message.sessionId) {
      this.sendError(ws, 'Missing required data');
      return;
    }

    try {
      // Verify session access
      const session = await ChatSession.findById(message.message.sessionId);
      if (!session) {
        this.sendError(ws, 'Session not found');
        return;
      }

      const isOwner = session.userId != null && session.userId.toString() === ws.userId;
      const isSupport = ws.isLgdealSupervisor;

      if (!isOwner && !isSupport) {
        chatSystemWarn('websocket.send.access_denied', {
          channel: 'websocket',
          sessionId: message.message.sessionId,
          userId: ws.userId
        });
        this.sendError(ws, 'Access denied');
        return;
      }

      chatSystemInfo('websocket.send.accepted', {
        channel: 'websocket',
        sessionId: message.message.sessionId,
        userId: ws.userId,
        sender: isSupport ? 'support' : 'user',
        isGuest: Boolean(session.isGuest),
        sessionAiEnabled: session.aiEnabled === true,
        textLen: String(message.message.text || '').length
      });

      // Create message in database
      const chatMessage = new ChatMessage({
        sessionId: new mongoose.Types.ObjectId(message.message.sessionId),
        sender: isSupport ? 'support' : 'user',
        senderId: new mongoose.Types.ObjectId(ws.userId),
        text: message.message.text,
        messageType: message.message.messageType || 'text',
        attachments: message.message.attachments,
        metadata: {
          deliveryStatus: 'sent'
        }
      });

      await chatMessage.save();
      await chatMessage.populate('senderId', 'firstName lastName email');

      chatSystemInfo('websocket.send.message_persisted', {
        channel: 'websocket',
        sessionId: message.message.sessionId,
        messageId: chatMessage._id?.toString?.()
      });

      // Update session
      session.lastMessageAt = new Date();
      if (session.status === 'waiting' && isSupport) {
        session.status = 'active';
        session.assignedTo = new mongoose.Types.ObjectId(ws.userId);
      }
      await session.save();

      // Ensure user is in session clients
      if (!this.sessionClients.has(message.message.sessionId)) {
        this.sessionClients.set(message.message.sessionId, new Set());
      }
      this.sessionClients.get(message.message.sessionId)!.add(ws.userId);

      // Broadcast message to all clients in this session
      // НЕ исключаем отправителя - поддержка должна получить сообщения от пользователя!
      this.broadcastToSession(message.message.sessionId, {
        type: 'message',
        message: {
          id: chatMessage._id,
          text: chatMessage.text,
          sender: chatMessage.sender,
          timestamp: chatMessage.createdAt.toISOString(),
          senderInfo: chatMessage.senderId,
          sessionId: message.message.sessionId
        }
      }, undefined); // НЕ исключаем никого - все должны получить сообщение

      // Duplicate message to chat channel
      try {
        // Get populated data for chat channel
        const populatedSession = await ChatSession.findById(session._id).populate({
          path: 'userId',
          select: 'firstName lastName email',
          populate: {
            path: 'company',
            select: 'name'
          }
        });
        const populatedMessage = await ChatMessage.findById(chatMessage._id).populate('senderId', 'firstName lastName email');
        
        if (populatedSession && populatedMessage) {
          const userId = populatedSession.userId;
          const senderId = populatedMessage.senderId;
          
          // Type guards for populated fields
          const isPopulatedUser = typeof userId === 'object' && userId && 'firstName' in userId && 'email' in userId;
          const isSenderPopulated = typeof senderId === 'object' && senderId && 'firstName' in senderId && 'lastName' in senderId;
          
          let companyName = 'Unknown Company';
          if (isPopulatedUser && 'company' in userId) {
            const userCompany = (userId as { company?: unknown }).company;
            if (typeof userCompany === 'object' && userCompany && 'name' in userCompany) {
              companyName = (userCompany as { name: string }).name || 'Unknown Company';
            }
          }
          
          const userInfo = {
            firstName: isPopulatedUser && 'firstName' in userId ? (userId.firstName as string || 'Unknown') : 'Unknown',
            lastName: isPopulatedUser && 'lastName' in userId ? (userId.lastName as string || 'User') : 'User',
            email: isPopulatedUser && 'email' in userId ? (userId.email as string || 'unknown@example.com') : 'unknown@example.com',
            companyName
          };
          
          const senderName = isSenderPopulated 
            ? `${senderId.firstName as string} ${senderId.lastName as string}`
            : undefined;
          
          await sendChatChannelMessage(
            userInfo,
            chatMessage.text,
            session._id.toString(),
            isSupport ? 'support' : 'user',
            isSupport ? senderName : undefined
          );
        }
      } catch (error) {
        logger.error('Failed to send message to chat channel:', error);
      }

      // When user sent the message, try AI reply if global and session AI are enabled
      if (!isSupport && message.message?.sessionId) {
        const sessionId = typeof message.message.sessionId === 'string'
          ? message.message.sessionId
          : String((message.message.sessionId as any)?.toString?.() ?? message.message.sessionId ?? '');
        const userText = message.message.text ?? '';
        const aiContext = {
          demoUrl: DEMO_URL,
          shouldSuggestDemoOnReplyIndex: getRandomIntInclusive(2, 3)
        };
        const wsAiDelay = getRandomIntInclusive(AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
        chatSystemInfo('websocket.send.ai_scheduled', {
          channel: 'ai',
          sessionId,
          userId: ws.userId,
          delayMs: wsAiDelay
        });
        // Show typing indicator immediately so user sees Gleady is responding
        this.broadcastToSession(sessionId, { type: 'typing', isTyping: true });
        sleep(wsAiDelay)
          .then(() => trySendAiReply(sessionId, userText, aiContext))
          .then(async (aiResult) => {
            // Always stop typing indicator, whether or not AI produced a reply
            this.broadcastToSession(sessionId, { type: 'typing', isTyping: false });
            if (!aiResult) {
              chatSystemWarn('websocket.send.ai_no_reply', { channel: 'ai', sessionId, userId: ws.userId });
              return;
            }
            this.broadcastToSession(sessionId, {
              type: 'message',
              message: {
                id: aiResult.message._id,
                text: aiResult.message.text,
                sender: 'support',
                timestamp: (aiResult.message as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
                senderInfo: null,
                sessionId
              }
            });
            const session = aiResult.session as { userId?: { firstName?: string; lastName?: string; email?: string; company?: { name?: string } }; _id?: { toString: () => string } };
            const userId = session?.userId;
            const isPopulatedUser = typeof userId === 'object' && userId && 'firstName' in userId && 'email' in userId;
            let companyName = 'Unknown Company';
            if (isPopulatedUser && userId && 'company' in userId) {
              const userCompany = userId.company;
              if (typeof userCompany === 'object' && userCompany && 'name' in userCompany) {
                companyName = userCompany.name || 'Unknown Company';
              }
            }
            const userInfo = {
              firstName: isPopulatedUser && userId && 'firstName' in userId ? (userId.firstName as string || 'Unknown') : 'Unknown',
              lastName: isPopulatedUser && userId && 'lastName' in userId ? (userId.lastName as string || 'User') : 'User',
              email: isPopulatedUser && userId && 'email' in userId ? (userId.email as string || 'unknown@example.com') : 'unknown@example.com',
              companyName
            };
            await sendChatChannelMessage(
              userInfo,
              aiResult.message.text,
              sessionId,
              'support',
              'Gleady'
            );
          })
          .catch((err) => {
            this.broadcastToSession(sessionId, { type: 'typing', isTyping: false });
            chatSystemError('websocket.send.ai_pipeline_failed', { channel: 'ai', sessionId, userId: ws.userId }, err);
          });
      }
    } catch (error) {
      chatSystemError(
        'websocket.send.failed',
        { channel: 'websocket', userId: ws.userId, sessionId: message.message?.sessionId },
        error
      );
      this.sendError(ws, 'Failed to send message');
    }
  }

  private async handleTyping(ws: AuthenticatedWebSocket, message: WebSocketChatMessage) {
    if (!ws.userId || !ws.sessionId) return;

    // Broadcast typing indicator to other clients in the session
    this.broadcastToSession(ws.sessionId, {
      type: 'typing',
      isTyping: message.isTyping,
      userId: ws.userId
    }, ws.userId);
  }

  public broadcastToSession(sessionId: string, data: any, excludeUserId?: string): number {
    const sessionClients = this.sessionClients.get(sessionId);
    if (!sessionClients) {
      logger.info('[WebSocket] No clients in session:', sessionId);
      return 0;
    }
    logger.info('[WebSocket] Broadcasting to session:', { sessionId, userIds: Array.from(sessionClients), excludeUserId });

    let sentCount = 0;
    
    sessionClients.forEach(userId => {
      if (userId === excludeUserId) {
        logger.info(`[WebSocket] Excluding user ${userId} from broadcast`);
        return;
      }
      
      const client = this.clients.get(userId);
      
      if (client && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(data));
          sentCount++;
          logger.info(`[WebSocket] Message sent to user ${userId} (${data.type})`);
        } catch (error) {
          logger.error(`Failed to send message to user ${userId}:`, error);
        }
      } else {
        logger.warn(`[WebSocket] Client not available for user ${userId} (readyState: ${client?.readyState})`);
        // Remove disconnected client from session
        if (client && client.readyState !== WebSocket.OPEN) {
          sessionClients.delete(userId);
          this.clients.delete(userId);
          logger.info(`[WebSocket] Removed disconnected client for user ${userId}`);
        }
      }
    });
    
    logger.info(`[WebSocket] Broadcast completed: ${sentCount} messages sent`);
    return sentCount;
  }

  private handleDisconnect(ws: AuthenticatedWebSocket) {
    if (ws.userId) {
      logger.info(`[WebSocket] User ${ws.userId} disconnected`);
      this.clients.delete(ws.userId);

      // Remove user from every session they were in (support can be in many sessions)
      const emptySessionIds: string[] = [];
      this.sessionClients.forEach((set, sessionId) => {
        if (set.has(ws.userId!)) {
          set.delete(ws.userId!);
          if (set.size === 0) {
            emptySessionIds.push(sessionId);
          }
        }
      });
      emptySessionIds.forEach((id) => {
        this.sessionClients.delete(id);
        logger.info(`[WebSocket] Session ${id} has no more clients`);
      });
    }
  }

  private sendError(ws: AuthenticatedWebSocket, message: string) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message
      }));
    }
  }

  private startHeartbeat() {
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (!ws.isAlive) {
          this.handleDisconnect(ws);
          ws.terminate();
          return;
        }
        
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  // Public method to send message to specific user
  public sendToUser(userId: string, data: any) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }

  // Public method to broadcast to all support staff
  public broadcastToSupport(data: any) {
    this.clients.forEach((client, userId) => {
      if (client.isLgdealSupervisor) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      }
    });
  }

  // Get connected clients count
  public getConnectedCount(): number {
    return this.clients.size;
  }

  // Get active sessions count
  public getActiveSessionsCount(): number {
    return this.sessionClients.size;
  }
}

export default ChatWebSocketService;
