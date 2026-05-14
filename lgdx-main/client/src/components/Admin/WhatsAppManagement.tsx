import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import type { I18nContextType } from '../../i18n/types';
import api from '../../api';
import styles from './WhatsAppManagement.module.css';
import Modal from '../common/Modal/Modal';

type WhatsAppChannel = 'cloud' | 'baileys';
type GlobalAutoReplyMode = 'off' | WhatsAppChannel;

interface WaChatRowAggregated {
  waId: string;
  lastMessageAt: number;
  messageCount: number;
  hasCloud: boolean;
  hasBaileys: boolean;
  aiPausedCloud: boolean;
  aiPausedBaileys: boolean;
  resolvedPhone?: string | null;
  userInfo?: {
    firstName: string;
    lastName: string;
    companyName: string | null;
  } | null;
}

interface WaMessage {
  role: 'user' | 'assistant';
  content: string;
  t: number;
  source?: 'llm' | 'admin';
  transport: WhatsAppChannel;
}

interface BaileysStatus {
  status: 'connecting' | 'connected' | 'disconnected' | null;
  qr: string | null;
}

type NotificationState = {
  isOpen: boolean;
  title: string;
  message: string;
};

type UserSearchRow = {
  userId: string;
  waId: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
};

const POLL_MS = 6000;

function formatWhatsAppPeerLabel(row: WaChatRowAggregated | string, t: I18nContextType['t']): string {
  const waId = typeof row === 'string' ? row : row.waId;
  const userInfo = typeof row === 'string' ? null : row.userInfo;
  const resolvedPhone = typeof row === 'string' ? null : row.resolvedPhone;
  
  if (userInfo) {
    const name = `${userInfo.firstName} ${userInfo.lastName}`.trim();
    if (userInfo.companyName) {
      return `${name} (${userInfo.companyName})`;
    }
    return name;
  }
  
  if (resolvedPhone) {
    return `+${resolvedPhone}`;
  }

  if (waId.startsWith('lid_')) {
    return t('admin.whatsappPeerHiddenLid', { defaultValue: 'Hidden Number (LID)' });
  }
  const digits = waId.replace(/\D/g, '');
  return digits ? `+${digits}` : waId;
}

function allChannelsPaused(row: WaChatRowAggregated): boolean {
  return (!row.hasCloud || row.aiPausedCloud) && (!row.hasBaileys || row.aiPausedBaileys);
}

const WhatsAppManagement: React.FC = () => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const canAccess = isLgdealSupervisor;

  const [chats, setChats] = useState<WaChatRowAggregated[]>([]);
  const [selected, setSelected] = useState<WaChatRowAggregated | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendChannel, setSendChannel] = useState<WhatsAppChannel>('cloud');
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiPausedLocal, setAiPausedLocal] = useState(false);
  const [globalAutoReplyMode, setGlobalAutoReplyMode] = useState<GlobalAutoReplyMode>('cloud');
  const [baileysStatus, setBaileysStatus] = useState<BaileysStatus | null>(null);
  const [notification, setNotification] = useState<NotificationState>({ isOpen: false, title: '', message: '' });

  const [lastChatsOkAt, setLastChatsOkAt] = useState<number | null>(null);
  const [lastStatusOkAt, setLastStatusOkAt] = useState<number | null>(null);
  const [lastModeOkAt, setLastModeOkAt] = useState<number | null>(null);

  const [chatsFailStreak, setChatsFailStreak] = useState(0);
  const [statusFailStreak, setStatusFailStreak] = useState(0);
  const [modeFailStreak, setModeFailStreak] = useState(0);

  const [baileysDisconnectRequestedAt, setBaileysDisconnectRequestedAt] = useState<number | null>(null);
  const [baileysAwaitHintShown, setBaileysAwaitHintShown] = useState(false);
  const baileysEventsRef = useRef<EventSource | null>(null);
  const selectedRef = useRef<WaChatRowAggregated | null>(null);
  selectedRef.current = selected;

  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [initCompany, setInitCompany] = useState('');
  const [initQuery, setInitQuery] = useState('');
  const [initLoading, setInitLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initResults, setInitResults] = useState<UserSearchRow[]>([]);

  const notify = useCallback((title: string, message: string) => {
    setNotification({ isOpen: true, title, message });
  }, []);

  const fetchChats = useCallback(async (opts?: { userInitiated?: boolean }) => {
    try {
      setLoading(true);
      const res = await api.get('/admin/whatsapp/chats', {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { _t: Date.now() }
      });
      if (res.data?.success && res.data?.data?.chats) {
        setChats(res.data.data.chats as WaChatRowAggregated[]);
        setLastChatsOkAt(Date.now());
        setChatsFailStreak(0);
      }
    } catch (err) {
      setChatsFailStreak((s) => Math.min(99, s + 1));
      if (opts?.userInitiated) {
        const msg =
          (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t('common.unknownError', { defaultValue: 'Unknown error' });
        notify(t('common.error'), t('admin.whatsappRefreshFailed', { defaultValue: 'Failed to refresh chats' }) + `: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  const fetchGlobalAutoReplyMode = useCallback(async (opts?: { userInitiated?: boolean }) => {
    try {
      const res = await api.get('/admin/whatsapp/auto-reply-mode', {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { _t: Date.now() }
      });
      const mode = (res.data?.data as { mode?: GlobalAutoReplyMode })?.mode;
      if (mode === 'off' || mode === 'cloud' || mode === 'baileys') {
        setGlobalAutoReplyMode(mode);
        setLastModeOkAt(Date.now());
        setModeFailStreak(0);
      }
    } catch (err) {
      setModeFailStreak((s) => Math.min(99, s + 1));
      if (opts?.userInitiated) {
        const msg =
          (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t('common.unknownError', { defaultValue: 'Unknown error' });
        notify(t('common.error'), t('admin.whatsappGlobalModeUpdateFailed', { defaultValue: 'Failed to update global auto-reply mode' }) + `: ${msg}`);
      }
    }
  }, [notify, t]);

  const fetchBaileysStatus = useCallback(async (opts?: { userInitiated?: boolean }) => {
    try {
      const res = await api.get('/admin/whatsapp/baileys/status', {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { _t: Date.now() }
      });
      if (res.data?.success && res.data?.data) {
        setBaileysStatus(res.data.data as BaileysStatus);
        setLastStatusOkAt(Date.now());
        setStatusFailStreak(0);
      }
    } catch (err) {
      setBaileysStatus(null);
      setStatusFailStreak((s) => Math.min(99, s + 1));
      if (opts?.userInitiated) {
        const msg =
          (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t('common.unknownError', { defaultValue: 'Unknown error' });
        notify(t('common.error'), t('admin.whatsappBaileysStatusFailed', { defaultValue: 'Failed to load Baileys status' }) + `: ${msg}`);
      }
    }
  }, [notify, t]);

  const disconnectBaileys = useCallback(async () => {
    try {
      await api.post('/admin/whatsapp/baileys/disconnect', {});
      const now = Date.now();
      setBaileysDisconnectRequestedAt(now);
      setBaileysAwaitHintShown(false);
      // Give worker a moment to recycle and then refresh.
      setTimeout(() => void fetchBaileysStatus({ userInitiated: true }), 800);
      notify(
        t('common.success'),
        t('admin.whatsappBaileysDisconnectQueued', { defaultValue: 'Disconnect requested. Waiting for a new QR or reconnection…' })
      );
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('common.unknownError', { defaultValue: 'Unknown error' });
      notify(t('common.error'), t('admin.whatsappBaileysDisconnectFailed', { defaultValue: 'Failed to request disconnect' }) + `: ${msg}`);
    }
  }, [fetchBaileysStatus, notify, t]);

  const fetchMessages = useCallback(async (waId: string) => {
    try {
      setMessagesLoading(true);
      const res = await api.get(`/admin/whatsapp/chats/merged/${encodeURIComponent(waId)}/messages`, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { _t: Date.now() }
      });
      if (res.data?.success && res.data?.data?.messages) {
        setMessages(res.data.data.messages as WaMessage[]);
        const d = res.data.data as { aiPausedCloud?: boolean; aiPausedBaileys?: boolean; };
        const row = selectedRef.current;
        const norm = waId.replace(/\D/g, '') || waId;
        if (row && row.waId === norm) {
          const sync = { ...row, aiPausedCloud: Boolean(d.aiPausedCloud), aiPausedBaileys: Boolean(d.aiPausedBaileys) };
          setAiPausedLocal(allChannelsPaused(sync));
        }
      }
    } catch {
      // silent
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const searchUsers = useCallback(async (company: string, q: string) => {
    try {
      setInitLoading(true);
      setInitError(null);
      const res = await api.get('/admin/whatsapp/users/search', {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { company: company.trim() || undefined, q: q.trim() || undefined, limit: 25, _t: Date.now() }
      });
      if (res.data?.success && res.data?.data?.users) {
        setInitResults(res.data.data.users as UserSearchRow[]);
      } else {
        setInitResults([]);
      }
    } catch (e) {
      setInitResults([]);
      setInitError(
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error ||
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t('common.unknownError', { defaultValue: 'Unknown error' })
      );
    } finally {
      setInitLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isInitiateModalOpen) return;
    const id = window.setTimeout(() => {
      void searchUsers(initCompany, initQuery);
    }, 250);
    return () => window.clearTimeout(id);
  }, [isInitiateModalOpen, initCompany, initQuery, searchUsers]);

  const openInitiateModal = () => {
    setIsInitiateModalOpen(true);
    setInitError(null);
    setInitResults([]);
    setInitCompany('');
    setInitQuery('');
  };

  const closeInitiateModal = () => {
    setIsInitiateModalOpen(false);
  };

  useEffect(() => {
    if (!canAccess) return;
    fetchChats();
    fetchBaileysStatus();
    void fetchGlobalAutoReplyMode();
    const id = window.setInterval(() => fetchChats(), POLL_MS);
    const id2 = window.setInterval(() => fetchBaileysStatus(), POLL_MS);
    const id3 = window.setInterval(() => fetchGlobalAutoReplyMode(), POLL_MS);
    return () => {
      window.clearInterval(id);
      window.clearInterval(id2);
      window.clearInterval(id3);
    };
  }, [canAccess, fetchChats, fetchBaileysStatus, fetchGlobalAutoReplyMode]);

  useEffect(() => {
    if (!canAccess || typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/admin/whatsapp/baileys/events', { withCredentials: true });
    baileysEventsRef.current = es;

    const onState = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as BaileysStatus;
        if (!payload || !('status' in payload)) return;
        setBaileysStatus(payload);
        setLastStatusOkAt(Date.now());
        setStatusFailStreak(0);
      } catch {
        // ignore malformed events
      }
    };

    const onError = () => {
      setStatusFailStreak((s) => Math.min(99, s + 1));
    };

    es.addEventListener('state', onState as EventListener);
    es.onerror = onError;

    return () => {
      es.removeEventListener('state', onState as EventListener);
      es.close();
      if (baileysEventsRef.current === es) {
        baileysEventsRef.current = null;
      }
    };
  }, [canAccess]);

  useEffect(() => {
    if (!selected || !canAccess) return;
    void fetchMessages(selected.waId);
    const id = window.setInterval(() => fetchMessages(selected.waId), POLL_MS);
    return () => window.clearInterval(id);
  }, [selected, canAccess, fetchMessages]);

  const handleSelect = (row: WaChatRowAggregated) => {
    if (selected?.waId !== row.waId) {
      setMessages([]);
    }
    setSelected(row);
    setAiPausedLocal(allChannelsPaused(row));
    setSendError(null);
    if (row.hasCloud && !row.hasBaileys) setSendChannel('cloud');
    else if (!row.hasCloud && row.hasBaileys) setSendChannel('baileys');
    else setSendChannel('cloud');
  };

  const handleBackToList = () => {
    setSelected(null);
    setMessages([]);
    setSendError(null);
  };

  const handlePickUser = async (u: UserSearchRow) => {
    const waId = (u.waId || '').trim();
    if (waId.length < 4) return;

    // Ensure the bot is allowed to respond when the user replies.
    try {
      await api.put(`/admin/whatsapp/chats/merged/${encodeURIComponent(waId)}/ai-paused`, { paused: false });
    } catch {
      // best-effort
    }

    const existing = chats.find((c) => c.waId === waId);
    if (existing) {
      handleSelect(existing);
      closeInitiateModal();
      return;
    }

    const preferredChannel: WhatsAppChannel = globalAutoReplyMode === 'baileys' ? 'baileys' : 'cloud';
    const row: WaChatRowAggregated = {
      waId,
      lastMessageAt: 0,
      messageCount: 0,
      hasCloud: preferredChannel === 'cloud',
      hasBaileys: preferredChannel === 'baileys',
      aiPausedCloud: false,
      aiPausedBaileys: false,
      resolvedPhone: waId.replace(/\D/g, '') || null,
      userInfo: {
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        companyName: u.companyName ?? null
      }
    };
    setChats((prev) => [row, ...prev]);
    handleSelect(row);
    setSendChannel(preferredChannel);
    closeInitiateModal();

    await fetchMessages(waId);
  };

  const handleSend = async () => {
    if (!selected || !newMessage.trim()) return;
    setSendError(null);
    try {
      const res = await api.post('/admin/whatsapp/send', {
        channel: sendChannel,
        waId: selected.waId,
        text: newMessage.trim()
      });
      if (res.data?.success) {
        setNewMessage('');
        await fetchMessages(selected.waId);
        await fetchChats();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; hint?: string } } })?.response?.data?.error ||
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const hint = (err as { response?: { data?: { hint?: string } } })?.response?.data?.hint;
      setSendError([msg, hint].filter(Boolean).join(' — ') || t('admin.whatsappSendFailed'));
    }
  };

  const setGlobalMode = async (mode: GlobalAutoReplyMode) => {
    const prev = globalAutoReplyMode;
    setGlobalAutoReplyMode(mode);
    try {
      await api.put('/admin/whatsapp/auto-reply-mode', { mode });
      setLastModeOkAt(Date.now());
      setModeFailStreak(0);
    } catch {
      setGlobalAutoReplyMode(prev);
      setModeFailStreak((s) => Math.min(99, s + 1));
      notify(t('common.error'), t('admin.whatsappGlobalModeUpdateFailed', { defaultValue: 'Failed to update global auto-reply mode' }));
    }
  };

  const toggleAiPaused = async () => {
    if (!selected) return;
    const next = !aiPausedLocal;
    setAiPausedLocal(next);
    try {
      await api.put(`/admin/whatsapp/chats/merged/${encodeURIComponent(selected.waId)}/ai-paused`, { paused: next });
      await fetchChats();
      await fetchMessages(selected.waId);
    } catch {
      setAiPausedLocal(!next);
    }
  };

  const formatTime = (ts: number) => {
    try { return new Date(ts).toLocaleString(); } catch { return '—'; }
  };

  const formatLastOk = (ts: number | null) => (ts ? formatTime(ts) : '—');

  const pollHealthText = useMemo(() => {
    const bad =
      (statusFailStreak >= 3 ? 'status' : null) ||
      (chatsFailStreak >= 3 ? 'chats' : null) ||
      (modeFailStreak >= 3 ? 'mode' : null);
    if (!bad) return '';
    if (bad === 'status') return t('admin.whatsappPollStatusDegraded', { defaultValue: 'Status updates are failing. Check server/worker connectivity.' });
    if (bad === 'chats') return t('admin.whatsappPollChatsDegraded', { defaultValue: 'Chat list updates are failing. Check server connectivity.' });
    return t('admin.whatsappPollModeDegraded', { defaultValue: 'Auto-reply mode updates are failing. Check server connectivity.' });
  }, [statusFailStreak, chatsFailStreak, modeFailStreak, t]);

  const baileysAwait = useMemo(() => {
    if (!baileysDisconnectRequestedAt) return { active: false, seconds: 0, showHint: false };
    const now = Date.now();
    const seconds = Math.max(0, Math.floor((now - baileysDisconnectRequestedAt) / 1000));

    const resolved =
      (baileysStatus?.status === 'connected') ||
      (baileysStatus?.status === 'connecting' && Boolean(baileysStatus.qr));
    if (resolved) return { active: false, seconds: 0, showHint: false };

    return { active: true, seconds, showHint: seconds >= 20 };
  }, [baileysDisconnectRequestedAt, baileysStatus?.status, baileysStatus?.qr]);

  useEffect(() => {
    if (!baileysDisconnectRequestedAt) return;
    if (!baileysAwait.active) {
      setBaileysDisconnectRequestedAt(null);
      setBaileysAwaitHintShown(false);
      return;
    }
    if (baileysAwait.showHint && !baileysAwaitHintShown) {
      setBaileysAwaitHintShown(true);
    }
  }, [baileysDisconnectRequestedAt, baileysAwait.active, baileysAwait.showHint, baileysAwaitHintShown]);

  const sendHintForSelection = useMemo(() => {
    if (!selected) return '';
    if (selected.hasCloud && selected.hasBaileys) return t('admin.whatsappSendHintHybrid');
    if (selected.hasBaileys && !selected.hasCloud) return t('admin.whatsappSendHintBaileys');
    return t('admin.whatsappSendHintCloud');
  }, [selected, t]);

  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    const el = messagesListRef.current;
    if (!el) return;
    if (messages.length !== prevMsgCountRef.current || messages.length === 0) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, selected?.waId]);

  const channelLabel = (c: WhatsAppChannel) =>
    c === 'baileys' ? t('admin.whatsappChannelBaileys') : t('admin.whatsappChannelCloud');

  const filtered = chats.filter((c) => {
    if (!searchTerm.trim()) return true;
    return c.waId.includes(searchTerm.replace(/\D/g, ''));
  });

  // Force <img> to refresh when QR changes (otherwise browser may keep showing an expired QR).
  const qrImgSrc = baileysStatus?.qr
    ? `/api/admin/whatsapp/baileys/qr.png?_t=${encodeURIComponent(baileysStatus.qr.slice(0, 24))}`
    : '/api/admin/whatsapp/baileys/qr.png';

  if (!canAccess) {
    return (
      <div className={styles.stateBox}>
        <i className="fas fa-lock" />
        <h3>{t('admin.accessDenied')}</h3>
        <p>{t('admin.noPermissionChatManagement')}</p>
      </div>
    );
  }

  const baileysPillClass =
    !baileysStatus?.status
      ? styles.pillNeutral
      : baileysStatus.status === 'connected'
        ? styles.pillOk
        : baileysStatus.status === 'connecting'
          ? styles.pillWarn
          : styles.pillBad;

  return (
    <div className={styles.container} data-has-selected={selected ? 'true' : 'false'}>
      <div className={styles.topSection}>
        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.headerTitle}>{t('admin.whatsappManagementTitle')}</h2>
            <p className={styles.subtitle}>{t('admin.whatsappAggregatedHint')}</p>
            <p className={styles.metaLine}>
              {t('admin.whatsappLastUpdate', { defaultValue: 'Last update' })}:&nbsp;
              {t('admin.whatsappLastUpdateChats', { defaultValue: 'Chats' })} {formatLastOk(lastChatsOkAt)} •&nbsp;
              {t('admin.whatsappLastUpdateStatus', { defaultValue: 'Status' })} {formatLastOk(lastStatusOkAt)} •&nbsp;
              {t('admin.whatsappLastUpdateMode', { defaultValue: 'Mode' })} {formatLastOk(lastModeOkAt)}
            </p>
            {pollHealthText ? <p className={styles.pollWarning}>{pollHealthText}</p> : null}
          </div>
          <div className={styles.headerControls}>
            <button
              type="button"
              onClick={openInitiateModal}
              className={styles.initiateBtn}
              title={t('admin.whatsappInitiateDialog')}
            >
              <i className="fas fa-paper-plane" />
              <span>{t('admin.whatsappInitiateDialog')}</span>
            </button>
            <div className={styles.searchWrap}>
              <i className={`fas fa-search ${styles.searchIcon}`} />
              <input
                type="text"
                placeholder={t('admin.whatsappSearchPlaceholder')}
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
              title="Refresh"
              aria-label="Refresh"
            >
              <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={styles.settingsGrid}>
          <section className={`${styles.settingCard} ${styles.glassPanel}`} aria-labelledby="wa-global-mode-title">
            <h4 id="wa-global-mode-title" className={styles.cardTitle}>
              {t('admin.whatsappGlobalAutoReply')}
            </h4>
            <p className={styles.cardHint}>{t('admin.whatsappGlobalAutoReplyHint')}</p>
            <div className={styles.segmentedControl} role="radiogroup" aria-label={t('admin.whatsappGlobalAutoReply')}>
              {(['off', 'cloud', 'baileys'] as const).map((m) => (
                <label key={m} className={styles.segment}>
                  <input
                    type="radio"
                    name="wa-global-auto-reply"
                    checked={globalAutoReplyMode === m}
                    onChange={() => void setGlobalMode(m)}
                  />
                  <span>
                    {m === 'off' && t('admin.whatsappAutoReplyOff')}
                    {m === 'cloud' && t('admin.whatsappAutoReplyCloudOnly')}
                    {m === 'baileys' && t('admin.whatsappAutoReplyBaileysOnly')}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className={`${styles.settingCard} ${styles.glassPanel}`} aria-labelledby="wa-baileys-title">
            <div className={styles.statusWrap}>
              <h4 id="wa-baileys-title" className={styles.cardTitle}>
                {t('admin.whatsappBaileysSection')}
              </h4>
              <div className={styles.statusActions}>
                <button
                  type="button"
                  className={styles.baileysDisconnectBtn}
                  onClick={() => void disconnectBaileys()}
                  title={t('admin.whatsappBaileysDisconnect')}
                >
                  {t('admin.whatsappBaileysDisconnect')}
                </button>
                <span className={`${styles.statusPill} ${baileysPillClass}`}>
                {baileysStatus?.status === 'connected' && t('admin.whatsappBaileysConnected')}
                {baileysStatus?.status === 'connecting' && t('admin.whatsappBaileysConnecting')}
                {baileysStatus?.status === 'disconnected' && t('admin.whatsappBaileysDisconnected')}
                {!baileysStatus?.status && (t('admin.whatsappBaileysStatusUnknown') === 'admin.whatsappBaileysStatusUnknown' ? 'Unknown' : t('admin.whatsappBaileysStatusUnknown'))}
                </span>
              </div>
            </div>
            {baileysAwait.active ? (
              <div className={styles.awaitRow} role="status" aria-live="polite">
                <i className={`fas fa-spinner fa-spin ${styles.awaitIcon}`} aria-hidden />
                <div className={styles.awaitText}>
                  <div className={styles.awaitTitle}>
                    {t('admin.whatsappBaileysAwaiting', { defaultValue: 'Waiting for QR / reconnection' })} ({baileysAwait.seconds}s)
                  </div>
                  {baileysAwaitHintShown ? (
                    <div className={styles.awaitHint}>
                      {t('admin.whatsappBaileysAwaitHint', { defaultValue: 'If QR does not appear, check that the Baileys worker is running and Redis is reachable.' })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {baileysStatus?.qr ? (
              <div className={styles.qrBox}>
                <img src={qrImgSrc} alt="WhatsApp QR" />
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <Modal
        isOpen={isInitiateModalOpen}
        onClose={closeInitiateModal}
        title={t('admin.whatsappInitiateDialog')}
        size="lg"
        className={styles.waModal}
      >
        <div className={styles.modalFieldRow}>
          <div>
            <label className={styles.modalLabel}>{t('admin.whatsappInitiateCompanyLabel')}</label>
            <input
              className={styles.modalInput}
              value={initCompany}
              onChange={(e) => setInitCompany(e.target.value)}
              placeholder={t('admin.whatsappFilterCompany')}
              type="text"
            />
          </div>
          <div>
            <label className={styles.modalLabel}>{t('admin.whatsappInitiateUserLabel')}</label>
            <input
              className={styles.modalInput}
              value={initQuery}
              onChange={(e) => setInitQuery(e.target.value)}
              placeholder={t('admin.whatsappFilterUser')}
              type="text"
            />
          </div>
        </div>

        <div className={styles.resultsBox}>
          <div className={styles.resultsHeader}>
            {initLoading
              ? t('common.loading')
              : initError
                ? initError
                : t('admin.whatsappPickUserHint')}
          </div>
          <div className={styles.resultsList}>
            {!initLoading && initResults.length === 0 ? (
              <div className={styles.resultEmpty}>{t('admin.whatsappNoUsersFound')}</div>
            ) : (
              initResults.map((u) => {
                const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.phone || u.waId;
                const sub = [u.companyName || null, u.email || null, u.phone || null].filter(Boolean).join(' • ');
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

      {/* Notification Modal (project-wide admin pattern) */}
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
            {t('admin.whatsappChatsCount', { count: filtered.length })}
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
                  key={row.waId}
                  className={`${styles.chatItem} ${selected?.waId === row.waId ? styles.chatItemActive : ''}`}
                  onClick={() => handleSelect(row)}
                >
                  <div className={styles.chatRowMain}>
                    <div>
                      <h4 className={styles.chatTitle}>{formatWhatsAppPeerLabel(row, t)}</h4>
                      <p className={styles.msgCount}>{t('admin.whatsappMessagesCount', { count: row.messageCount })}</p>
                    </div>
                  </div>
                  <div className={styles.chatBadges}>
                    {row.hasCloud && <span className={styles.badge}>{t('admin.whatsappChannelCloud')}</span>}
                    {row.hasBaileys && <span className={styles.badge}>{t('admin.whatsappChannelBaileys')}</span>}
                    <span className={`${styles.badge} ${allChannelsPaused(row) ? styles.badgeAiOff : styles.badgeAiOn}`}>
                      {allChannelsPaused(row) ? t('admin.whatsappChatAutoReplyOff') : t('admin.whatsappChatAutoReplyOn')}
                    </span>
                  </div>
                  <div className={styles.chatRowBottom}>
                    {formatTime(row.lastMessageAt)}
                  </div>
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
                    aria-label={t('common.back', { defaultValue: 'Back' })}
                    title={t('common.back', { defaultValue: 'Back' })}
                  >
                    <i className="fas fa-arrow-left" />
                  </button>
                  <div>
                    <h3 className={styles.chatAreaTitle}>{formatWhatsAppPeerLabel(selected, t)}</h3>
                    <p className={styles.chatAreaSubtitle}>{sendHintForSelection}</p>
                  </div>
                </div>
                <div className={styles.toggleWrap}>
                  <label className={styles.toggleLabel}>
                    <input className={styles.toggleInput} type="checkbox" checked={!aiPausedLocal} onChange={() => void toggleAiPaused()} />
                    <div className={styles.toggleSwitch} />
                    <span>{t('admin.whatsappChatAutoReply')}</span>
                  </label>
                  <span className={styles.toggleHint}>{t('admin.whatsappChatAutoReplyHint')}</span>
                </div>
              </div>

              <div ref={messagesListRef} className={styles.messagesList}>
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
                        key={`${m.transport}-${m.t}-${idx}`}
                        className={`${styles.messageRow} ${m.role === 'user' ? styles.msgUser : styles.msgSupport}`}
                      >
                        <div className={styles.bubble}>
                          <div className={styles.bubbleHeader}>
                            <span className={styles.bubbleTransport}>{channelLabel(m.transport)}</span>
                            {m.role === 'assistant' && (
                              <span className={`${styles.bubbleSource} ${m.source === 'admin' ? styles.bubbleSourceAdmin : styles.bubbleSourceBot}`}>
                                {m.source === 'admin' ? t('admin.whatsappOperator') : t('admin.whatsappBot')}
                              </span>
                            )}
                            {m.role === 'user' && (
                              <span className={`${styles.bubbleSource} ${styles.bubbleSourceUser}`}>
                                {t('admin.whatsappUser')}
                              </span>
                            )}
                          </div>
                          <p className={styles.bubbleText}>{m.content}</p>
                          <span className={styles.bubbleTime}>{formatTime(m.t)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className={styles.composerWrap}>
                {selected.hasCloud && selected.hasBaileys && (
                  <div className={styles.sendViaRow}>
                    <span>{t('admin.whatsappSendVia')}</span>
                    <select
                      value={sendChannel}
                      onChange={(e) => setSendChannel(e.target.value as WhatsAppChannel)}
                    >
                      <option value="cloud">{t('admin.whatsappChannelCloud')}</option>
                      <option value="baileys">{t('admin.whatsappChannelBaileys')}</option>
                    </select>
                  </div>
                )}
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
                    placeholder={t('admin.whatsappReplyPlaceholder')}
                    className={styles.textArea}
                    rows={1}
                    aria-label={t('admin.typeYourMessage')}
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
              <i className={`fab fa-whatsapp ${styles.stateIcon}`} />
              <h3 className={styles.stateTitle}>{t('admin.whatsappSelectChat')}</h3>
              <p>{t('admin.whatsappSelectChatHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppManagement;
