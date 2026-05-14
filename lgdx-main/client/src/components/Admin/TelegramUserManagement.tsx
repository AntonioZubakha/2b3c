import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import type { I18nContextType } from '../../i18n/types';
import api from '../../api';
import styles from './WhatsAppManagement.module.css';
import Modal from '../common/Modal/Modal';

type GlobalAutoReplyMode = 'off' | 'user';

type TgChatRow = {
  peerId: string;
  lastMessageAt: number;
  messageCount: number;
  aiPaused: boolean;
  userInfo?: { firstName: string; lastName: string; companyName: string | null } | null;
};

type TgMessage = {
  role: 'user' | 'assistant';
  content: string;
  t: number;
  source?: 'llm' | 'admin';
};

type TgUserSearch = {
  userId: string;
  peerId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
};

type TgStatus = {
  status: 'connecting' | 'connected' | 'disconnected' | null;
  authHint: string | null;
  hasQr?: boolean;
};

const POLL_MS = 6000;

function formatPeerLabel(
  row: TgChatRow | string,
  t: I18nContextType['t']
): string {
  const peerId = typeof row === 'string' ? row : row.peerId;
  const userInfo = typeof row === 'string' ? null : row.userInfo;
  if (userInfo) {
    const name = `${userInfo.firstName} ${userInfo.lastName}`.trim();
    if (userInfo.companyName) {
      return `${name} (${userInfo.companyName})`;
    }
    return name;
  }
  return `${t('admin.telegramUserPeer')} ${peerId}`;
}

const TelegramUserManagement: React.FC = () => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const canAccess = isLgdealSupervisor;

  const [chats, setChats] = useState<TgChatRow[]>([]);
  const [selected, setSelected] = useState<TgChatRow | null>(null);
  const [messages, setMessages] = useState<TgMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiPausedLocal, setAiPausedLocal] = useState(false);
  const [globalAutoReplyMode, setGlobalAutoReplyMode] = useState<GlobalAutoReplyMode>('user');
  const [connection, setConnection] = useState<TgStatus | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [qrBust, setQrBust] = useState(0);

  const [notification, setNotification] = useState({ isOpen: false, title: '', message: '' });
  const [lastChatsOkAt, setLastChatsOkAt] = useState<number | null>(null);
  const [chatsFailStreak, setChatsFailStreak] = useState(0);

  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [initCompany, setInitCompany] = useState('');
  const [initQuery, setInitQuery] = useState('');
  const [initLoading, setInitLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initResults, setInitResults] = useState<TgUserSearch[]>([]);

  const eventsRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef(0);

  const notify = useCallback((title: string, message: string) => {
    setNotification({ isOpen: true, title, message });
  }, []);

  const fetchChats = useCallback(
    async (opts?: { userInitiated?: boolean }) => {
      try {
        setLoading(true);
        const res = await api.get('/admin/telegram-user/chats', {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          params: { _t: Date.now() }
        });
        if (res.data?.success && res.data?.data?.chats) {
          setChats(res.data.data.chats as TgChatRow[]);
          setLastChatsOkAt(Date.now());
          setChatsFailStreak(0);
        }
      } catch (err) {
        setChatsFailStreak((s) => Math.min(99, s + 1));
        if (opts?.userInitiated) {
          notify(
            t('common.error'),
            t('common.unknownError', { defaultValue: 'Unknown error' })
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [notify, t]
  );

  const fetchGlobalMode = useCallback(async () => {
    try {
      const res = await api.get('/admin/telegram-user/auto-reply-mode', { params: { _t: Date.now() } });
      const mode = (res.data?.data as { mode?: GlobalAutoReplyMode })?.mode;
      if (mode === 'off' || mode === 'user') {
        setGlobalAutoReplyMode(mode);
      }
    } catch {
      /* */
    }
  }, []);

  const fetchMessages = useCallback(
    async (peerId: string) => {
      if (!peerId) return;
      setMessagesLoading(true);
      setSendError(null);
      try {
        const res = await api.get(`/admin/telegram-user/chats/${encodeURIComponent(peerId)}/messages`, {
          params: { _t: Date.now() }
        });
        if (res.data?.success) {
          setMessages((res.data.data?.messages as TgMessage[]) || []);
          setAiPausedLocal(Boolean(res.data.data?.aiPaused));
        }
      } catch {
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    []
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/admin/telegram-user/status', { params: { _t: Date.now() } });
      if (res.data?.success && res.data.data) {
        setConnection(res.data.data as TgStatus);
      }
    } catch {
      setConnection(null);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void fetchChats();
    void fetchGlobalMode();
    void fetchStatus();
    const tmr = setInterval(() => {
      void fetchChats();
      void fetchGlobalMode();
      void fetchStatus();
    }, POLL_MS);
    return () => clearInterval(tmr);
  }, [canAccess, fetchChats, fetchGlobalMode, fetchStatus]);

  useEffect(() => {
    if (connection?.status !== 'connecting') return;
    const id = window.setInterval(() => {
      setQrBust((n) => n + 1);
    }, 2000);
    return () => window.clearInterval(id);
  }, [connection?.status]);

  useEffect(() => {
    if (!canAccess) return;
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/admin/telegram-user/events', { withCredentials: true });
    es.addEventListener('state', (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data) as TgStatus;
        setConnection(d);
      } catch {
        /* */
      }
    });
    es.onerror = () => {
      es.close();
    };
    eventsRef.current = es;
    return () => {
      es.close();
      eventsRef.current = null;
    };
  }, [canAccess]);

  const handleSelect = (row: TgChatRow) => {
    if (selected?.peerId !== row.peerId) {
      setMessages([]);
    }
    setSelected(row);
    setSendError(null);
    void fetchMessages(row.peerId);
  };

  const handleBackToList = () => {
    setSelected(null);
    setMessages([]);
    setSendError(null);
  };

  const openInitiateModal = () => {
    setIsInitiateModalOpen(true);
    setInitError(null);
  };
  const closeInitiateModal = () => {
    setIsInitiateModalOpen(false);
  };

  useEffect(() => {
    if (!isInitiateModalOpen) return;
    const q = {
      company: initCompany?.trim() || undefined,
      q: initQuery?.trim() || undefined,
      limit: 20
    };
    if (!q.company && !q.q) {
      setInitResults([]);
      return;
    }
    const tmr = setTimeout(() => {
      setInitLoading(true);
      setInitError(null);
      void api
        .get('/admin/telegram-user/users/search', { params: { ...q, _t: Date.now() } })
        .then((res) => {
          if (res.data?.success) {
            setInitResults((res.data.data?.users as TgUserSearch[]) || []);
          }
        })
        .catch((e) => {
          setInitError(String(e?.response?.data?.message || e?.message || 'err'));
        })
        .finally(() => setInitLoading(false));
    }, 300);
    return () => clearTimeout(tmr);
  }, [isInitiateModalOpen, initCompany, initQuery]);

  const handlePickUser = async (u: TgUserSearch) => {
    const peerId = (u.peerId || '').trim();
    if (peerId.length < 2) return;
    try {
      await api.put(`/admin/telegram-user/chats/${encodeURIComponent(peerId)}/ai-paused`, {
        paused: false
      });
    } catch {
      /* */
    }
    const existing = chats.find((c) => c.peerId === peerId);
    if (existing) {
      handleSelect(existing);
      closeInitiateModal();
      return;
    }
    const row: TgChatRow = {
      peerId,
      lastMessageAt: 0,
      messageCount: 0,
      aiPaused: false,
      userInfo: {
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        companyName: u.companyName
      }
    };
    setChats((prev) => [row, ...prev]);
    handleSelect(row);
    closeInitiateModal();
  };

  const handleSend = async () => {
    if (!selected || !newMessage.trim()) return;
    setSendError(null);
    try {
      const res = await api.post('/admin/telegram-user/send', {
        peerId: selected.peerId,
        text: newMessage.trim()
      });
      if (res.data?.success) {
        setNewMessage('');
        await fetchMessages(selected.peerId);
        await fetchChats();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '';
      setSendError(msg || t('admin.telegramUserSendFailed'));
    }
  };

  const setGlobalMode = async (mode: GlobalAutoReplyMode) => {
    const prev = globalAutoReplyMode;
    setGlobalAutoReplyMode(mode);
    try {
      await api.put('/admin/telegram-user/auto-reply-mode', { mode });
    } catch {
      setGlobalAutoReplyMode(prev);
    }
  };

  const toggleAiPaused = async () => {
    if (!selected) return;
    const next = !aiPausedLocal;
    setAiPausedLocal(next);
    try {
      await api.put(
        `/admin/telegram-user/chats/${encodeURIComponent(selected.peerId)}/ai-paused`,
        { paused: next }
      );
      await fetchChats();
      await fetchMessages(selected.peerId);
    } catch {
      setAiPausedLocal(!next);
    }
  };

  const disconnectTg = async () => {
    try {
      await api.post('/admin/telegram-user/disconnect', {});
    } catch {
      /* */
    }
  };

  const submitLoginPassword = () => {
    if (!loginPassword) return;
    void api.post('/admin/telegram-user/login/password', { password: loginPassword });
  };

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '—';
    }
  };

  const filtered = chats.filter((c) => {
    if (!searchTerm.trim()) return true;
    return c.peerId.includes(searchTerm.replace(/\D/g, '')) || c.peerId.includes(searchTerm.trim());
  });

  useEffect(() => {
    if (messages.length !== prevMsgCountRef.current || messages.length === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, selected?.peerId]);

  if (!canAccess) {
    return (
      <div className={styles.stateBox}>
        <i className="fas fa-lock" />
        <h3>{t('admin.accessDenied')}</h3>
        <p>{t('admin.noPermissionChatManagement')}</p>
      </div>
    );
  }

  const effStatus: 'connecting' | 'connected' | 'disconnected' | null | undefined =
    connection == null
      ? undefined
      : connection.status ?? (connection.hasQr ? 'connecting' : null);

  const connPillClass =
    effStatus == null
      ? styles.pillNeutral
      : effStatus === 'connected'
        ? styles.pillOk
        : effStatus === 'connecting'
          ? styles.pillWarn
          : styles.pillBad;

  const showQrPanel = effStatus === 'connecting';
  const showWorkerHint = canAccess && connection != null && effStatus == null && !connection.hasQr;

  return (
    <div className={styles.container} data-has-selected={selected ? 'true' : 'false'}>
      <div className={styles.topSection}>
        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.headerTitle}>{t('admin.telegramUserTitle')}</h2>
            <p className={styles.subtitle}>{t('admin.telegramUserSubtitle')}</p>
            {chatsFailStreak >= 3 ? (
              <p className={styles.pollWarning}>{t('admin.telegramUserPollDegraded')}</p>
            ) : null}
            <p className={styles.metaLine}>
              {t('admin.telegramUserLastUpdate')}: {t('admin.telegramUserLastUpdateChats')}.{' '}
              {lastChatsOkAt ? new Date(lastChatsOkAt).toLocaleString() : '—'}
            </p>
          </div>
          <div className={styles.headerControls}>
            <button type="button" onClick={openInitiateModal} className={styles.initiateBtn}>
              <i className="fas fa-paper-plane" />
              <span>{t('admin.telegramUserInitiateButton')}</span>
            </button>
            <div className={styles.searchWrap}>
              <i className={`fas fa-search ${styles.searchIcon}`} />
              <input
                type="text"
                placeholder={t('admin.telegramUserSearch')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchChats({ userInitiated: true })}
              className={styles.btnPrimary}
              disabled={loading}
            >
              <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className={styles.settingsGrid}>
          <section className={`${styles.settingCard} ${styles.glassPanel}`}>
            <h4 className={styles.cardTitle}>{t('admin.telegramUserGlobalTitle')}</h4>
            <p className={styles.cardHint}>{t('admin.telegramUserGlobalHint')}</p>
            <div className={styles.segmentedControl} role="radiogroup">
              {(['off', 'user'] as const).map((m) => (
                <label key={m} className={styles.segment}>
                  <input
                    type="radio"
                    name="tg-global-auto"
                    checked={globalAutoReplyMode === m}
                    onChange={() => void setGlobalMode(m)}
                  />
                  <span>
                    {m === 'off' && t('admin.telegramUserAutoReplyOff')}
                    {m === 'user' && t('admin.telegramUserAutoReplyOn')}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className={`${styles.settingCard} ${styles.glassPanel}`}>
            <div className={styles.statusWrap}>
              <h4 className={styles.cardTitle}>{t('admin.telegramUserConnection')}</h4>
              <div className={styles.statusActions}>
                <button
                  type="button"
                  className={styles.baileysDisconnectBtn}
                  onClick={() => void disconnectTg()}
                >
                  {t('admin.telegramUserDisconnect')}
                </button>
                <span className={`${styles.statusPill} ${connPillClass}`}>
                  {effStatus == null && t('admin.telegramUserStatusUnknown')}
                  {effStatus === 'connected' && t('admin.telegramUserStatusConnected')}
                  {effStatus === 'connecting' && t('admin.telegramUserStatusConnecting')}
                  {effStatus === 'disconnected' && t('admin.telegramUserStatusDisconnected')}
                </span>
              </div>
            </div>
            {showWorkerHint ? (
              <p className={styles.pollWarning} style={{ marginTop: 6 }}>
                {t('admin.telegramUserWorkerUnknownHint')}
              </p>
            ) : null}
            {connection?.authHint ? <p className={styles.subtitle}>{connection.authHint}</p> : null}
            {showQrPanel ? (
              <div className={styles.composerInputRow} style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: 8, gap: 8 }}>
                <p className={styles.cardHint} style={{ margin: 0 }}>
                  {t('admin.telegramUserQrHelp')}
                </p>
                <div className={styles.qrBox}>
                  <img
                    src={`/api/admin/telegram-user/qr.png?_t=${qrBust}`}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                    onLoad={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'visible';
                    }}
                  />
                </div>
                <p className={styles.cardHint} style={{ margin: 0 }}>
                  {t('admin.telegramUserTwoFaHint')}
                </p>
                <div className={styles.composerInputRow} style={{ flexWrap: 'wrap' }}>
                  <input
                    className={styles.textArea}
                    type="password"
                    style={{ minHeight: 36, flex: 1, minWidth: 120 }}
                    placeholder={t('admin.telegramUser2fa')}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                  <button type="button" className={styles.btnSend} onClick={submitLoginPassword}>
                    {t('admin.telegramUserSubmit2fa')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <Modal
        isOpen={isInitiateModalOpen}
        onClose={closeInitiateModal}
        title={t('admin.telegramUserInitiateDialog')}
        size="lg"
        className={styles.waModal}
      >
        <p className={styles.subtitle} style={{ marginBottom: 12 }}>
          {t('admin.telegramUserInitiateHint')}
        </p>
        <div className={styles.modalFieldRow}>
          <div>
            <label className={styles.modalLabel}>{t('admin.telegramUserInitiateCompanyLabel')}</label>
            <input
              className={styles.modalInput}
              value={initCompany}
              onChange={(e) => setInitCompany(e.target.value)}
              placeholder={t('admin.telegramUserFilterCompany')}
            />
          </div>
          <div>
            <label className={styles.modalLabel}>{t('admin.telegramUserInitiateUserLabel')}</label>
            <input
              className={styles.modalInput}
              value={initQuery}
              onChange={(e) => setInitQuery(e.target.value)}
              placeholder={t('admin.telegramUserFilterUser')}
            />
          </div>
        </div>
        <div className={styles.resultsBox}>
          <div className={styles.resultsHeader}>
            {initLoading
              ? t('common.loading')
              : initError
                ? initError
                : t('admin.telegramUserPickUserHint')}
          </div>
          <div className={styles.resultsList}>
            {!initLoading && initResults.length === 0 ? (
              <div className={styles.resultEmpty}>{t('admin.telegramUserNoUsersFound')}</div>
            ) : (
              initResults.map((u) => {
                const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.peerId;
                const sub = [u.companyName, u.email, u.peerId].filter(Boolean).join(' • ');
                return (
                  <button
                    type="button"
                    key={u.userId}
                    className={styles.resultRow}
                    onClick={() => void handlePickUser(u)}
                  >
                    <div className={styles.resultTitle}>{name}</div>
                    <div className={styles.resultSub}>{sub}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification((p) => ({ ...p, isOpen: false }))}
        title={notification.title}
        size="sm"
      >
        <p>{notification.message}</p>
      </Modal>

      <div className={styles.layout}>
        <div className={`${styles.sidebar} ${styles.glassPanel}`}>
          <div className={styles.sidebarHeader}>
            {t('admin.telegramUserChatsCount', { count: filtered.length })}
          </div>
          <div className={styles.sidebarList}>
            {loading && chats.length === 0 ? (
              <div className={styles.stateBox}>
                <i className="fas fa-spinner fa-spin" />
                <p>{t('admin.loadingSessions')}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.stateBox}>
                <i className="fas fa-inbox" />
                <p>{t('admin.noChatSessions')}</p>
              </div>
            ) : (
              filtered.map((row) => (
                <div
                  key={row.peerId}
                  className={`${styles.chatItem} ${
                    selected?.peerId === row.peerId ? styles.chatItemActive : ''
                  }`}
                  onClick={() => handleSelect(row)}
                >
                  <div className={styles.chatRowMain}>
                    <div>
                      <h4 className={styles.chatTitle}>{formatPeerLabel(row, t)}</h4>
                      <p className={styles.msgCount}>
                        {t('admin.telegramUserMessagesCount', { count: row.messageCount })}
                      </p>
                    </div>
                  </div>
                  <div className={styles.chatBadges}>
                    <span className={styles.badge}>{t('admin.telegramUserTransport')}</span>
                    <span
                      className={`${styles.badge} ${row.aiPaused ? styles.badgeAiOff : styles.badgeAiOn}`}
                    >
                      {row.aiPaused
                        ? t('admin.telegramUserChatAutoReplyOff')
                        : t('admin.telegramUserChatAutoReplyOn')}
                    </span>
                  </div>
                  <div className={styles.chatRowBottom}>{formatTime(row.lastMessageAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${styles.chatArea} ${styles.glassPanel}`}>
          {selected ? (
            <>
              <div className={styles.chatAreaHeader}>
                <div className={styles.chatAreaHeaderLeft}>
                  <button
                    type="button"
                    className={styles.mobileBackBtn}
                    onClick={handleBackToList}
                    aria-label="Back"
                  >
                    <i className="fas fa-arrow-left" />
                  </button>
                  <div>
                    <h3 className={styles.chatAreaTitle}>{formatPeerLabel(selected, t)}</h3>
                    <p className={styles.chatAreaSubtitle}>{t('admin.telegramUserSendHint')}</p>
                  </div>
                </div>
                <div className={styles.toggleWrap}>
                  <label className={styles.toggleLabel}>
                    <input
                      className={styles.toggleInput}
                      type="checkbox"
                      checked={!aiPausedLocal}
                      onChange={() => void toggleAiPaused()}
                    />
                    <div className={styles.toggleSwitch} />
                    <span>{t('admin.telegramUserChatAutoReply')}</span>
                  </label>
                </div>
              </div>

              <div className={styles.messagesList}>
                {messagesLoading && messages.length === 0 ? (
                  <div className={styles.stateBox}>
                    <i className="fas fa-spinner fa-spin" />
                    <p>{t('admin.loadingMessages')}</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className={styles.stateBox}>
                    <i className="fas fa-comment-dots" />
                    <p>{t('admin.noMessages')}</p>
                  </div>
                ) : (
                  <>
                    {messages.map((m, idx) => (
                      <div
                        key={`${m.t}-${idx}`}
                        className={`${styles.messageRow} ${
                          m.role === 'user' ? styles.msgUser : styles.msgSupport
                        }`}
                      >
                        <div className={styles.bubble}>
                          <div className={styles.bubbleHeader}>
                            <span className={styles.bubbleTransport}>{t('admin.telegramUserTransport')}</span>
                            {m.role === 'assistant' && (
                              <span
                                className={`${styles.bubbleSource} ${
                                  m.source === 'admin' ? styles.bubbleSourceAdmin : styles.bubbleSourceBot
                                }`}
                              >
                                {m.source === 'admin'
                                  ? t('admin.telegramUserOperator')
                                  : t('admin.telegramUserBot')}
                              </span>
                            )}
                            {m.role === 'user' && (
                              <span className={`${styles.bubbleSource} ${styles.bubbleSourceUser}`}>
                                {t('admin.telegramUserUserLabel')}
                              </span>
                            )}
                          </div>
                          <p className={styles.bubbleText}>{m.content}</p>
                          <span className={styles.bubbleTime}>{formatTime(m.t)}</span>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className={styles.composerWrap}>
                <div className={styles.composerInputRow}>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={t('admin.telegramUserReplyPlaceholder')}
                    className={styles.textArea}
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!newMessage.trim()}
                    className={styles.btnSend}
                  >
                    <i className="fas fa-paper-plane" />
                  </button>
                </div>
                {sendError && <p className={styles.sendError}>{sendError}</p>}
              </div>
            </>
          ) : (
            <div className={styles.stateBox}>
              <i className={`fab fa-telegram ${styles.stateIcon}`} />
              <h3 className={styles.stateTitle}>{t('admin.telegramUserSelectChat')}</h3>
              <p className={styles.subtitle} style={{ marginTop: 8 }}>
                {t('admin.telegramUserSelectChatHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelegramUserManagement;
