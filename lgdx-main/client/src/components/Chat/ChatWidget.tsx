import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import api from '../../api';
import styles from './ChatWidget.module.css';
import gleadAvatar from '../../assets/images/glead_ava.png';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface Message {
  id: string;
  _id?: string; // present when loaded from API (Mongoose)
  text: string;
  sender: 'user' | 'support';
  timestamp: string;
  isRead?: boolean;
  attachments?: Array<{
    type: 'image' | 'file';
    url: string;
    name: string;
  }>;
  metadata?: {
    isOnboardingWelcome?: boolean;
  };
}

interface ChatSession {
  _id: string;
  id?: string;
  userId?: string | null;
  status: 'active' | 'waiting' | 'closed';
  lastMessage?: Date;
  unreadCount?: number;
}

interface ChatWidgetProps {
  isOpen: boolean;
  onToggle: () => void;
}

type GuestMessageRow = {
  _id?: string;
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: string;
  timestamp?: string;
};

function mapGuestPollRow(row: unknown): Message {
  if (!row || typeof row !== 'object') {
    return { id: '', text: '', sender: 'user', timestamp: new Date().toISOString() };
  }
  const m = row as GuestMessageRow;
  const sender: Message['sender'] = m.sender === 'support' ? 'support' : 'user';
  return {
    id: m._id ?? m.id ?? '',
    text: m.text ?? '',
    sender,
    timestamp: m.createdAt ?? m.timestamp ?? new Date().toISOString(),
  };
}

const GUEST_POLL_INTERVAL_MS = 12000;
const GUEST_FAKE_TYPING_MIN_MS = 2000;

const ChatWidget: React.FC<ChatWidgetProps> = ({ isOpen, onToggle }) => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestInitError, setGuestInitError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<ChatSession | null>(null);
  const guestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guestTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestTypingMinUntilRef = useRef<number>(0);
  /** All message IDs we've already rendered (across REST + poll + optimistic). Prevents
   *  duplicate renders and duplicate notification sounds when the same message arrives
   *  both via the send response and via the background poll. */
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  const playNotificationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Helper: creates one oscillator with instant attack + bell-like decay
      const makePartial = (freq: number, volume: number, decay: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        // 4 ms linear attack (sharp strike) → exponential decay (bell ring-off)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        osc.start(now);
        osc.stop(now + decay);
        return osc;
      };

      // C6 (1047 Hz) fundamental + C7 (2094 Hz) octave harmonic → clean "ding"
      const fundamental = makePartial(1047, 0.15, 0.55);
      makePartial(2094, 0.055, 0.25);            // harmonic decays faster
      fundamental.onended = () => ctx.close();
    } catch {
      // Web Audio API not available — silent fail
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  sessionRef.current = session;

  // Initialize chat: logged-in → normal flow; guest → guest REST flow
  useEffect(() => {
    if (!isOpen) return;
    if (isAuthenticated && user) {
      setIsGuestMode(false);
      initializeChat();
    } else {
      setIsGuestMode(true);
      initializeGuestChat();
    }
  }, [isAuthenticated, user, isOpen]);

  // Guest fake typing cleanup when mode/toggle changes
  useEffect(() => {
    if (!isOpen || !isGuestMode) {
      if (guestTypingTimeoutRef.current) {
        clearTimeout(guestTypingTimeoutRef.current);
        guestTypingTimeoutRef.current = null;
      }
      guestTypingMinUntilRef.current = 0;
      setIsTyping(false);
    }
  }, [isOpen, isGuestMode]);

  // WebSocket only for logged-in users
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }
    return () => {
      disconnectWebSocket();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- connectWebSocket/disconnectWebSocket omitted: WS self-reconnects via onclose
  }, [isOpen, isAuthenticated]);

  // Guest: poll for new messages (support replies). We MERGE by message id instead of
  // replacing state wholesale — otherwise a poll firing mid-send can briefly replace
  // optimistic + AI-reply state with a smaller DB snapshot, causing messages to
  // "flash" (disappear and reappear) and fire the notification sound a second time.
  useEffect(() => {
    if (!isOpen || !isGuestMode || !session?._id) {
      if (guestPollRef.current) {
        clearInterval(guestPollRef.current);
        guestPollRef.current = null;
      }
      return;
    }
    const poll = () => {
      api.get(`/chat/guest/messages/${session._id}`)
        .then((res) => {
          if (!res.data?.success || !Array.isArray(res.data.data)) return;
          const list = (res.data.data as unknown[]).map(mapGuestPollRow);
          const unseen = list.filter((m) => m.id && !seenMessageIdsRef.current.has(m.id));
          if (unseen.length === 0) return;
          if (unseen.some((m) => m.sender === 'support')) {
            playNotificationSound();
          }
          for (const m of unseen) {
            if (m.id) seenMessageIdsRef.current.add(m.id);
          }
          setMessages((prev) => {
            // Drop any leftover optimistic temp-* items; real copies were appended above.
            const withoutTemp = prev.filter((m) => !m.id?.startsWith('temp-'));
            const existingIds = new Set(withoutTemp.map((m) => m.id));
            const toAppend = unseen.filter((m) => !existingIds.has(m.id));
            if (toAppend.length === 0 && withoutTemp.length === prev.length) return prev;
            return [...withoutTemp, ...toAppend];
          });
        })
        .catch(() => { /* ignore poll errors */ });
    };
    poll();
    guestPollRef.current = setInterval(poll, GUEST_POLL_INTERVAL_MS);
    return () => {
      if (guestPollRef.current) clearInterval(guestPollRef.current);
    };
  }, [isOpen, isGuestMode, session?._id, playNotificationSound]);

  // Auto-reconnect WebSocket on auth errors
  const handleAuthError = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      return;
    }
    
    disconnectWebSocket();
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (isOpen && isAuthenticated) {
        connectWebSocket();
      }
    }, 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- connectWebSocket intentionally omitted (same as main WS effect)
  }, [isOpen, isAuthenticated]);

  const initializeChat = async () => {
    try {
      setIsLoading(true);
      const response = await api.post('/chat/session');
      
      if (response.data.success) {
        const sessionData = response.data.data;
        setSession(sessionData);
        
        // Load message history
        const messagesResponse = await api.get(`/chat/messages/${sessionData._id}`);
        
        if (messagesResponse.data.success) {
          const messagesData = messagesResponse.data.data;
          const mapped = messagesData.map((msg: { _id: string; text: string; sender: string; timestamp?: string | Date }) => {
            let timestamp: string;
            try {
              if (typeof msg.timestamp === 'string') {
                const date = new Date(msg.timestamp);
                if (isNaN(date.getTime())) {
                  timestamp = new Date().toISOString();
                } else {
                  timestamp = msg.timestamp;
                }
              } else if (msg.timestamp instanceof Date) {
                timestamp = msg.timestamp.toISOString();
              } else {
                timestamp = new Date().toISOString();
              }
            } catch (error) {
              timestamp = new Date().toISOString();
            }
            const id = (msg as { _id?: string; id?: string })._id ?? (msg as { _id?: string; id?: string }).id;
            return { ...msg, id: id ?? '', timestamp };
          });
          seenMessageIdsRef.current = new Set(
            mapped.map((m: { id?: string }) => m.id).filter((x: string | undefined): x is string => Boolean(x))
          );
          setMessages(mapped);
        }

        // Join session over WebSocket so we receive support messages in real-time before sending our first message
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'join_session', sessionId: sessionData._id }));
        }
      }
    } catch (error) {
      // Silent fail - chat initialization error
    } finally {
      setIsLoading(false);
    }
  };

  const initializeGuestChat = async () => {
    try {
      setIsLoading(true);
      setGuestInitError(null);
      const response = await api.post('/chat/guest/session');
      if (response.data?.success && response.data?.data) {
        const sessionData = response.data.data;
        setSession({
          _id: sessionData._id,
          status: sessionData.status ?? 'waiting',
          userId: null,
          unreadCount: 0
        });
        setConnectionStatus('connected');
        const msgRes = await api.get(`/chat/guest/messages/${sessionData._id}`);
        if (msgRes.data?.success && Array.isArray(msgRes.data.data)) {
          const list = (msgRes.data.data as unknown[]).map(mapGuestPollRow);
          seenMessageIdsRef.current = new Set(list.map((m) => m.id).filter(Boolean) as string[]);
          setMessages(list);
        }
      }
    } catch (err) {
      setConnectionStatus('disconnected');
      const msg =
        isAxiosError(err) &&
        err.response?.data &&
        typeof err.response.data === 'object' &&
        err.response.data !== null &&
        'message' in err.response.data
          ? String((err.response.data as { message?: unknown }).message ?? '')
          : '';
      setGuestInitError(msg || t('chat.connectingToSupport'));
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect through Nginx proxy for WebSocket
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setConnectionStatus('connected');
      // Join session if we already have one (e.g. init finished before WS connected)
      if (sessionRef.current?._id && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'join_session', sessionId: sessionRef.current._id }));
      }
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'message': {
          const incomingId = data.message?.id ? String(data.message.id) : '';
          // Dedup: if we already rendered this message id (e.g. the server broadcast
          // it twice, or we already appended it from the REST response), skip it
          // entirely — don't append again and don't replay the notification sound.
          if (incomingId && seenMessageIdsRef.current.has(incomingId)) {
            break;
          }
          if (incomingId) seenMessageIdsRef.current.add(incomingId);
          if (data.message?.sender === 'support') {
            playNotificationSound();
          }
          setMessages(prev => {
            let timestamp: string;
            try {
              if (typeof data.message.timestamp === 'string') {
                const date = new Date(data.message.timestamp);
                if (isNaN(date.getTime())) {
                  timestamp = new Date().toISOString();
                } else {
                  timestamp = data.message.timestamp;
                }
              } else if (data.message.timestamp instanceof Date) {
                timestamp = data.message.timestamp.toISOString();
              } else {
                timestamp = new Date().toISOString();
              }
            } catch (error) {
              timestamp = new Date().toISOString();
            }
            return [...prev, { ...data.message, id: incomingId || data.message?.id, timestamp }];
          });
          break;
        }
        case 'typing':
          setIsTyping(data.isTyping);
          break;
        case 'session_update':
          setSession(data.session);
          break;
        case 'error':
          // If authentication failed, try to reconnect
          if (data.message.includes('Authentication failed') || data.message.includes('jwt expired') || data.message.includes('No token provided')) {
            handleAuthError();
          }
          break;
      }
    };

    wsRef.current.onclose = () => {
      setConnectionStatus('disconnected');
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (isOpen) {
          connectWebSocket();
        }
      }, 3000);
    };

    wsRef.current.onerror = () => {
      setConnectionStatus('disconnected');
    };
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const startGuestFakeTyping = useCallback(() => {
    if (!isGuestMode) return;
    if (guestTypingTimeoutRef.current) {
      clearTimeout(guestTypingTimeoutRef.current);
      guestTypingTimeoutRef.current = null;
    }
    // Record minimum display time so it looks natural, but do NOT auto-stop —
    // typing stays active until the API response arrives and
    // stopGuestFakeTypingWhenAllowed() is called.
    guestTypingMinUntilRef.current = Date.now() + GUEST_FAKE_TYPING_MIN_MS;
    setIsTyping(true);
  }, [isGuestMode]);

  const stopGuestFakeTypingWhenAllowed = useCallback(() => {
    if (!isGuestMode) return;
    const now = Date.now();
    const remaining = Math.max(0, guestTypingMinUntilRef.current - now);
    if (remaining === 0) {
      if (guestTypingTimeoutRef.current) {
        clearTimeout(guestTypingTimeoutRef.current);
        guestTypingTimeoutRef.current = null;
      }
      guestTypingMinUntilRef.current = 0;
      setIsTyping(false);
      return;
    }
    if (guestTypingTimeoutRef.current) return;
    guestTypingTimeoutRef.current = setTimeout(() => {
      guestTypingTimeoutRef.current = null;
      guestTypingMinUntilRef.current = 0;
      setIsTyping(false);
    }, remaining);
  }, [isGuestMode]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? newMessage).trim();
    if (!text || !session) return;

    setNewMessage('');

    if (isGuestMode) {
      try {
        setMessages((prev) => [
          ...prev,
          { id: `temp-${Date.now()}`, text, sender: 'user', timestamp: new Date().toISOString() }
        ]);
        startGuestFakeTyping();
        const res = await api.post('/chat/guest/send', { sessionId: session._id, text });
        if (res.data?.success && res.data?.data) {
          const { userMessage, aiReply } = res.data.data;
          const userMsgId = String(userMessage?.id ?? '');
          const aiMsgId = aiReply?.id ? String(aiReply.id) : '';
          // Remember these IDs BEFORE updating state so the next poll will not
          // treat the same messages as new and re-play the notification sound.
          if (userMsgId) seenMessageIdsRef.current.add(userMsgId);
          if (aiMsgId) seenMessageIdsRef.current.add(aiMsgId);
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => !m.id.startsWith('temp-'));
            const existingIds = new Set(withoutTemp.map((m) => m.id));
            const next: Message[] = [...withoutTemp];
            if (userMsgId && !existingIds.has(userMsgId)) {
              next.push({
                id: userMsgId,
                text: String(userMessage?.text ?? text),
                sender: 'user',
                timestamp: String(userMessage?.timestamp ?? new Date().toISOString())
              });
            }
            if (aiReply?.text && aiMsgId && !existingIds.has(aiMsgId)) {
              next.push({
                id: aiMsgId,
                text: String(aiReply.text),
                sender: 'support',
                timestamp: String(aiReply.timestamp ?? new Date().toISOString())
              });
              playNotificationSound();
            }
            return next;
          });
          stopGuestFakeTypingWhenAllowed();
        }
      } catch (err: unknown) {
        const msg =
          isAxiosError(err) &&
          err.response?.data &&
          typeof err.response.data === 'object' &&
          err.response.data !== null &&
          'message' in err.response.data
            ? String((err.response.data as { message?: unknown }).message ?? 'Failed to send')
            : 'Failed to send';
        const errMsg: Message = {
          id: `err-${Date.now()}`,
          text: String(msg),
          sender: 'support',
          timestamp: new Date().toISOString()
        };
        setMessages((prev) => [...prev.filter((m) => !m.id.startsWith('temp-')), errMsg]);
        stopGuestFakeTypingWhenAllowed();
      }
      inputRef.current?.focus();
      return;
    }

    if (!wsRef.current) return;
    const message: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    wsRef.current.send(JSON.stringify({
      type: 'message',
      message: { ...message, sessionId: session._id }
    }));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    // Send typing indicator
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'typing',
        isTyping: e.target.value.length > 0
      }));
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return t('chat.invalidDate');
      }
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (error) {
      return t('chat.invalidDate');
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'var(--color-success)';
      case 'connecting': return 'var(--color-warning)';
      case 'disconnected': return 'var(--color-success)'; // Always show green for support
      default: return 'var(--color-success)'; // Default to green
    }
  };

  const markdownComponents = useMemo(() => ({
    a: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    ),
  }), []);

  const renderMessageBody = (text: string) => (
    <div className={styles.messageMarkdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className={`${styles.chatWidget} ${isOpen ? styles.open : ''}`}>
      {/* Chat Header */}
      <div className={styles.chatHeader}>
        <div className={styles.headerInfo}>
          <div className={styles.supportAvatar}>
            <img
              src={gleadAvatar}
              alt="Gleady"
              className={styles.supportAvatarImage}
            />
          </div>
          <div className={styles.supportInfo}>
            <h3>Gleady</h3>
            <div className={styles.statusInfo}>
              <span 
                className={styles.statusDot}
                style={{ backgroundColor: getConnectionStatusColor() }}
              ></span>
              <span className={styles.statusText}>
                {connectionStatus === 'connected' ? t('chat.online') : 
                 connectionStatus === 'connecting' ? t('chat.connecting') : t('chat.online')}
              </span>
            </div>
          </div>
        </div>
        <button 
          className={styles.closeButton}
          onClick={onToggle}
          aria-label={t('chat.closeChat')}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* Messages Container */}
      <div className={styles.messagesContainer}>
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p>{t('chat.connectingToSupport')}</p>
          </div>
        ) : (
          <>
            {messages.length === 0 ? (
              <div className={styles.welcomeMessage}>
                <div className={styles.welcomeIcon}>
                  <i className="fas fa-comments"></i>
                </div>
                <h4>{t('chat.welcomeToSupportChat')}</h4>
                <p>{t('chat.howCanWeHelp')}</p>
              </div>
            ) : (
              messages.map((message) => (
                <div 
                  key={message.id ?? message._id ?? ''} 
                  className={`${styles.message} ${styles[message.sender]}`}
                >
                  {message.sender === 'support' ? (
                    <div className={styles.supportMessageRow}>
                      <img
                        src={gleadAvatar}
                        alt="Gleady"
                        className={styles.messageAvatar}
                      />
                      <div className={styles.supportMessageContent}>
                        <span className={styles.senderName}>Gleady</span>
                        <div className={styles.messageBubble}>
                          {renderMessageBody(message.text)}
                          <span className={styles.messageTime}>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.messageBubble}>
                      {renderMessageBody(message.text)}
                      <span className={styles.messageTime}>
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isTyping && (
              <div className={`${styles.message} ${styles.support}`}>
                <div className={styles.supportMessageRow}>
                  <img
                    src={gleadAvatar}
                    alt="Gleady"
                    className={styles.messageAvatar}
                  />
                  <div className={styles.supportMessageContent}>
                    <span className={styles.senderName}>Gleady</span>
                    <div className={styles.typingIndicator}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {guestInitError && isGuestMode && (
        <div className={styles.errorBanner ?? ''} role="alert" style={{ padding: '8px 12px', background: 'var(--color-warning-soft, #fff3cd)', color: 'var(--color-warning-strong, #8a6d3b)', fontSize: 12 }}>
          {guestInitError}
        </div>
      )}

      {/* Message Input */}
      <div className={styles.messageInput}>
        <div className={styles.inputContainer}>
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.typeYourMessage')}
            disabled={!session || connectionStatus !== 'connected'}
            className={styles.textInput}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!newMessage.trim() || !session || connectionStatus !== 'connected'}
            className={styles.sendButton}
            aria-label={t('chat.sendMessage')}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;
