import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import api from '../../api';
import { logger } from '../../utils/logger';
import styles from './ChatManagement.module.css';

interface ChatSession {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    companyName?: string;
  } | null;
  /** Guest (unauthenticated) chat session created via /chat/guest/session */
  isGuest?: boolean;
  guestId?: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    pageUrl?: string;
  };
  status: 'active' | 'waiting' | 'closed';
  /** When true and global AI is on, AI may reply in this chat */
  aiEnabled?: boolean;
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject?: string;
  tags: string[];
  lastMessageAt?: string;
  createdAt: string;
  closedAt?: string;
  unreadCount?: number;
}

interface ChatMessage {
  _id: string;
  text: string;
  sender: 'user' | 'support';
  senderId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  timestamp: string;
  isRead: boolean;
}

const ChatManagement: React.FC = () => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const canAccessChatManagement = isLgdealSupervisor;
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [aiSettings, setAiSettings] = useState<{ globalEnabled: boolean; aiConfigured: boolean }>({ globalEnabled: false, aiConfigured: false });
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('page', currentPage.toString());
      params.append('limit', '20');
      // Cache-bust to avoid stale admin chat lists
      params.append('_t', Date.now().toString());

      const response = await api.get(`/chat/sessions?${params}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (response.data.success) {
        setSessions(response.data.data.sessions);
        setTotalPages(response.data.data.pagination.pages);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage]);

  const fetchMessages = useCallback(async (sessionId: string) => {
    try {
      setMessagesLoading(true);
      const response = await api.get(`/chat/messages/${sessionId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        params: {
          _t: Date.now(),
        },
      });
      if (response.data.success) {
        setMessages(response.data.data);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let shouldReconnect = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    
    const connectWebSocket = () => {
      // Don't reconnect if component is unmounting
      if (!shouldReconnect) return;

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;

        // Close existing connection if any
        if (wsRef.current) {
          if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
            wsRef.current.close();
          }
          wsRef.current = null;
        }

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          logger.debug('[ChatWS] Connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'session_joined') {
              logger.debug('[ChatWS] Joined session', { sessionId: data.sessionId });
            } else if (data.type === 'message' && data.message) {
              logger.debug('[ChatWS] New message received');
              // Add new message to current session if it matches the selected session
              if (selectedSession && data.message.sessionId === selectedSession._id) {
                setMessages(prev => [...prev, {
                  _id: data.message.id,
                  text: data.message.text,
                  sender: data.message.sender,
                  senderId: data.message.senderInfo,
                  timestamp: data.message.timestamp,
                  isRead: false
                }]);
              }
              
              // Always refresh sessions list to update unread counts and lastMessageAt
              fetchSessions();
            }
          } catch (error) {
            logger.error(
              '[ChatWS] Message parse error',
              error instanceof Error ? error : new Error(String(error))
            );
          }
        };

        wsRef.current.onclose = (event) => {
          logger.debug('[ChatWS] Disconnected', {
            code: event.code,
            reason: event.reason,
            shouldReconnect,
          });
          // Only reconnect if component is still mounted
          if (shouldReconnect) {
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };

        wsRef.current.onerror = () => {
          logger.warn('[ChatWS] WebSocket error');
        };
      } catch (error) {
        logger.error(
          '[ChatWS] Connection failed',
          error instanceof Error ? error : new Error(String(error))
        );
        // Retry connection if component is still mounted
        if (shouldReconnect) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      }
    };

    connectWebSocket();

    return () => {
      // Prevent reconnection attempts
      shouldReconnect = false;
      
      // Clear any pending reconnection
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      // Leave current session before closing
      if (selectedSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'leave_session',
          sessionId: selectedSession._id
        }));
      }
      
      // Close WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedSession, fetchSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchAiSettings = useCallback(async () => {
    try {
      const res = await api.get('/chat/ai-settings');
      if (res.data?.success && res.data?.data) {
        setAiSettings({ globalEnabled: res.data.data.globalEnabled, aiConfigured: res.data.data.aiConfigured ?? false });
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (canAccessChatManagement) fetchAiSettings();
  }, [canAccessChatManagement, fetchAiSettings]);

  const setAiGlobalEnabled = useCallback(async (globalEnabled: boolean) => {
    setAiSettingsLoading(true);
    try {
      const res = await api.put('/chat/ai-settings', { globalEnabled });
      if (res.data?.success && res.data?.data) {
        setAiSettings(prev => ({ ...prev, globalEnabled: res.data.data.globalEnabled }));
      }
    } catch {
      // Silent fail
    } finally {
      setAiSettingsLoading(false);
    }
  }, []);

  const setSessionAiEnabled = useCallback(async (sessionId: string, aiEnabled: boolean) => {
    try {
      await api.put(`/chat/session/${sessionId}/ai`, { aiEnabled });
      setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, aiEnabled } : s));
      if (selectedSession?._id === sessionId) {
        setSelectedSession(prev => prev ? { ...prev, aiEnabled } : null);
      }
    } catch {
      // Silent fail
    }
  }, [selectedSession?._id]);

  // Join new sessions when they appear
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessions.length > 0) {
      sessions.forEach(session => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'join_session',
            sessionId: session._id
          }));
        }
      });
    }
  }, [sessions]);

  const handleSessionSelect = (session: ChatSession) => {
    // Leave previous session if any
    if (selectedSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_session',
        sessionId: selectedSession._id
      }));
    }
    
    setSelectedSession(session);
    fetchMessages(session._id);
    
    // Join the session via WebSocket for real-time updates
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'join_session',
        sessionId: session._id
      }));
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSession || !newMessage.trim()) return;

    try {
      const response = await api.post('/chat/send', {
        sessionId: selectedSession._id,
        text: newMessage.trim(),
        messageType: 'text'
      });

      if (response.data.success) {
        setNewMessage('');
        // Refresh messages
        fetchMessages(selectedSession._id);
        // Refresh sessions to update lastMessageAt
        fetchSessions();
      }
    } catch (error) {
      // Silent fail
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm(t('admin.closeSessionConfirm'))) return;

    try {
      const response = await api.put(`/chat/close/${sessionId}`);
      if (response.data.success) {
        fetchSessions();
        if (selectedSession?._id === sessionId) {
          setSelectedSession(null);
          setMessages([]);
        }
      }
    } catch (error) {
      // Silent fail
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'var(--color-success)';
      case 'waiting': return 'var(--color-warning)';
      case 'closed': return 'var(--color-text-secondary)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'var(--color-danger)';
      case 'high': return 'var(--color-warning)';
      case 'medium': return 'var(--color-info)';
      case 'low': return 'var(--color-success)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return t('admin.invalidDate');
      }
      return date.toLocaleString();
    } catch (error) {
      return t('admin.invalidDate');
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    if (session.userId) {
      return (
        session.userId.firstName?.toLowerCase().includes(q) ||
        session.userId.lastName?.toLowerCase().includes(q) ||
        session.userId.email?.toLowerCase().includes(q) ||
        (session.userId.companyName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (session.isGuest) {
      return (
        (session.guestId?.toLowerCase().includes(q) ?? false) ||
        (session.metadata?.ipAddress?.toLowerCase().includes(q) ?? false) ||
        (session.metadata?.pageUrl?.toLowerCase().includes(q) ?? false) ||
        'guest'.includes(q)
      );
    }
    return false;
  });

  // Check if user has admin access (align with API: isLgdealSupervisor)
  if (!canAccessChatManagement) {
    return (
      <div className={styles.accessDenied}>
        <h2>{t('admin.accessDenied')}</h2>
        <p>{t('admin.noPermissionChatManagement')}</p>
      </div>
    );
  }

  return (
    <div className={styles.chatManagement}>
      <div className={styles.header}>
        <h2>{t('admin.chatManagementTitle')}</h2>
        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder={t('admin.searchUsers')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
            <i className="fas fa-search"></i>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.statusFilter}
          >
            <option value="">{t('admin.allStatus')}</option>
            <option value="active">{t('admin.activeStatus')}</option>
            <option value="waiting">{t('admin.waitingStatus')}</option>
            <option value="closed">{t('admin.closedStatus')}</option>
          </select>
          <label className={styles.aiToggleRow}>
            <span className={styles.aiToggleLabel}>AI support</span>
            <input
              type="checkbox"
              checked={aiSettings.globalEnabled}
              disabled={!aiSettings.aiConfigured || aiSettingsLoading}
              onChange={(e) => setAiGlobalEnabled(e.target.checked)}
              title={aiSettings.aiConfigured ? (aiSettings.globalEnabled ? 'Disable AI globally' : 'Enable AI globally') : 'Configure OPENAI_API_KEY on server'}
            />
            {!aiSettings.aiConfigured && <span className={styles.aiBadge} title="OPENAI_API_KEY not set">not configured</span>}
          </label>
        </div>
      </div>

      <div className={styles.content}>
        {/* Sessions List */}
        <div className={styles.sessionsPanel}>
          <div className={styles.sessionsHeader}>
            <h3>{t('admin.chatSessionsCount', { count: filteredSessions.length })}</h3>
            <button 
              onClick={fetchSessions}
              className={styles.refreshButton}
              disabled={loading}
            >
              <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
            </button>
          </div>

          <div className={styles.sessionsList}>
            {loading ? (
              <div className={styles.loading}>{t('admin.loadingSessions')}</div>
            ) : filteredSessions.length === 0 ? (
              <div className={styles.emptyState}>{t('admin.noChatSessions')}</div>
            ) : (
              filteredSessions.map((session) => {
                const isGuest = !session.userId && session.isGuest;
                const guestShortId = session.guestId ? session.guestId.slice(0, 8) : '';
                const guestIp = session.metadata?.ipAddress ?? '';
                return (
                <div
                  key={session._id}
                  className={`${styles.sessionItem} ${selectedSession?._id === session._id ? styles.selected : ''}`}
                  onClick={() => handleSessionSelect(session)}
                >
                  <div className={styles.sessionHeader}>
                    <div className={styles.userInfo}>
                      {isGuest ? (
                        <>
                          <h4>Guest {guestShortId && `· ${guestShortId}`}</h4>
                          {guestIp && <p>IP: {guestIp}</p>}
                        </>
                      ) : session.userId ? (
                        <>
                          <h4>{session.userId.firstName} {session.userId.lastName}</h4>
                          <p>{session.userId.email}</p>
                          {session.userId.companyName && (
                            <p className={styles.companyName}>{session.userId.companyName}</p>
                          )}
                        </>
                      ) : (
                        <h4>Unknown</h4>
                      )}
                    </div>
                    <div className={styles.sessionMeta}>
                      <span 
                        className={styles.status}
                        style={{ color: getStatusColor(session.status) }}
                      >
                        {session.status}
                      </span>
                      <span 
                        className={styles.priority}
                        style={{ color: getPriorityColor(session.priority) }}
                      >
                        {session.priority}
                      </span>
                    </div>
                  </div>
                  
                  <div className={styles.sessionFooter}>
                    <span className={styles.lastMessage}>
                      {session.lastMessageAt ? formatTime(session.lastMessageAt) : t('admin.noMessagesText')}
                    </span>
                    {session.unreadCount && session.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>
                        {session.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              ); })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={styles.pageButton}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={styles.pageButton}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        <div className={styles.chatPanel}>
          {selectedSession ? (
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatUserInfo}>
                  {selectedSession.userId ? (
                    <>
                      <h3>{selectedSession.userId.firstName} {selectedSession.userId.lastName}</h3>
                      <p>{selectedSession.userId.email}</p>
                      {selectedSession.userId.companyName && (
                        <p className={styles.companyName}>{selectedSession.userId.companyName}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <h3>Guest{selectedSession.guestId ? ` · ${selectedSession.guestId.slice(0, 8)}` : ''}</h3>
                      {selectedSession.metadata?.ipAddress && (
                        <p>IP: {selectedSession.metadata.ipAddress}</p>
                      )}
                      {selectedSession.metadata?.pageUrl && (
                        <p className={styles.companyName}>{selectedSession.metadata.pageUrl}</p>
                      )}
                    </>
                  )}
                </div>
                <div className={styles.chatActions}>
                  {aiSettings.globalEnabled && selectedSession.status !== 'closed' && (
                    <label className={styles.aiToggleRow}>
                      <span className={styles.aiToggleLabel}>AI in this chat</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedSession.aiEnabled)}
                        onChange={(e) => setSessionAiEnabled(selectedSession._id, e.target.checked)}
                      />
                    </label>
                  )}
                  <span 
                    className={styles.status}
                    style={{ color: getStatusColor(selectedSession.status) }}
                  >
                    {selectedSession.status}
                  </span>
                  {selectedSession.status !== 'closed' && (
                    <button
                      onClick={() => handleCloseSession(selectedSession._id)}
                      className={styles.closeButton}
                    >
                      Close Session
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.messagesContainer}>
                {messagesLoading ? (
                  <div className={styles.loading}>{t('admin.loadingMessages')}</div>
                ) : messages.length === 0 ? (
                  <div className={styles.emptyState}>{t('admin.noMessages')}</div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message._id}
                      className={`${styles.message} ${message.sender === 'user' ? styles.user : styles.support}`}
                    >
                      <div className={styles.messageBubble}>
                        <p className={styles.messageText}>{message.text}</p>
                        <span className={styles.messageTime}>
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedSession.status !== 'closed' && (
                <div className={styles.messageInput}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t('admin.typeYourMessage')}
                    className={styles.textInput}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className={styles.sendButton}
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noSelection}>
              <i className="fas fa-comments"></i>
              <h3>{t('admin.selectChatSession')}</h3>
              <p>{t('admin.chooseSessionFromList')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatManagement;
