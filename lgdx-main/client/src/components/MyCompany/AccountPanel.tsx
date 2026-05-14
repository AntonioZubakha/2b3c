import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { AuthContextType } from '../../types';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import api from '../../api';
import styles from './AccountPanel.module.css';

type ChannelKey = 'email' | 'telegram' | 'whatsapp';

const AccountPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user, loadUser } = useAuth() as AuthContextType;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  // Manual fallback shown after "Link Telegram" — works even when Telegram
  // Desktop swallows the ?start= deep-link parameter for already-opened chats.
  const [linkFallback, setLinkFallback] = useState<{ command: string; botUsername: string } | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  // Per-channel notification toggles. Local state mirrors the server, with
  // optimistic updates and a small status message.
  const [prefs, setPrefs] = useState<Record<ChannelKey, boolean>>({
    email: true,
    telegram: true,
    whatsapp: false
  });
  const [prefsSavingChannel, setPrefsSavingChannel] = useState<ChannelKey | null>(null);
  const [prefsStatus, setPrefsStatus] = useState<string | null>(null);

  // Tracks whether we should keep checking the server for a fresh telegramId
  // after the user clicked "Link Telegram". We stop as soon as the link is
  // detected, the user unlinks, or a generous timeout elapses.
  const linkPollDeadlineRef = useRef<number>(0);
  const linkPollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setEmail(user.email ?? '');
      setPhone(user.phone ?? '');
      setPrefs({
        email: user.notificationPrefs?.email ?? true,
        telegram: user.notificationPrefs?.telegram ?? true,
        whatsapp: user.notificationPrefs?.whatsapp ?? false
      });
    }
  }, [user]);

  // As soon as the server reports a linked Telegram, dismiss the fallback panel
  // and stop polling. Avoids a stale "open Telegram and start" hint sticking
  // around on screen after the bot already replied "✅ Linked!".
  useEffect(() => {
    if (user?.telegramId) {
      setLinkFallback(null);
      setLinkMessage(null);
      linkPollDeadlineRef.current = 0;
      if (linkPollTimerRef.current !== null) {
        window.clearTimeout(linkPollTimerRef.current);
        linkPollTimerRef.current = null;
      }
    }
  }, [user?.telegramId]);

  // While a link request is pending, refresh the user record whenever the
  // browser tab regains focus — this catches the moment the user switches
  // back from Telegram, so the UI flips to "Linked" without a manual reload.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() > linkPollDeadlineRef.current) return;
      void loadUser();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadUser]);

  useEffect(() => {
    return () => {
      if (linkPollTimerRef.current !== null) {
        window.clearTimeout(linkPollTimerRef.current);
      }
    };
  }, []);

  const telegramLinked = Boolean(user?.telegramId);
  const phoneAvailable = Boolean((user?.phone ?? '').trim());

  // Telegram channel can only be ON if the user has actually linked the bot.
  // We guard the UI rather than relying on the server to silently drop sends.
  const channels = useMemo(
    () => [
      {
        key: 'email' as const,
        label: t('account.notifChannelEmail'),
        hint: t('account.notifChannelEmailHint'),
        disabled: false,
        disabledHint: null as string | null
      },
      {
        key: 'telegram' as const,
        label: t('account.notifChannelTelegram'),
        hint: t('account.notifChannelTelegramHint'),
        disabled: !telegramLinked,
        disabledHint: telegramLinked ? null : t('account.notifChannelTelegramDisabledHint')
      },
      {
        key: 'whatsapp' as const,
        label: t('account.notifChannelWhatsApp'),
        hint: t('account.notifChannelWhatsAppHint'),
        disabled: !phoneAvailable,
        disabledHint: phoneAvailable ? null : t('account.notifChannelWhatsAppDisabledHint')
      }
    ],
    [telegramLinked, phoneAvailable, t]
  );

  const handleSaveProfile = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await api.put('/auth/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
      });
      setProfileSuccess(t('account.profileUpdated'));
      await loadUser();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setProfileError(msg || t('account.profileUpdateFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLinkTelegram = async (): Promise<void> => {
    setLinkLoading(true);
    setLinkMessage(null);
    setLinkError(null);
    setCopyConfirmed(false);
    try {
      const res = await api.post<{
        success: boolean;
        linkUrl?: string;
        startCommand?: string;
        botUsername?: string;
        message?: string;
      }>('/auth/me/telegram-link-request');
      if (res.data.success && res.data.linkUrl) {
        window.open(res.data.linkUrl, '_blank', 'noopener,noreferrer');
        setLinkMessage(t('account.openTelegramAndStart'));
        if (res.data.startCommand && res.data.botUsername) {
          setLinkFallback({ command: res.data.startCommand, botUsername: res.data.botUsername });
        }
        // Poll for up to 5 minutes so the UI flips to "linked" as soon as the
        // user completes the bot flow — even if they linger in Telegram first.
        // The visibilitychange listener above will also force-refresh the
        // moment they switch back to this tab, so 99% of the time the UI
        // updates instantly without waiting for the next tick.
        linkPollDeadlineRef.current = Date.now() + 5 * 60 * 1000;
        if (linkPollTimerRef.current !== null) {
          window.clearTimeout(linkPollTimerRef.current);
        }
        const tick = async (): Promise<void> => {
          await loadUser();
          // Stop polling immediately if the link succeeded — the effect
          // watching `user.telegramId` will clean up state. Otherwise keep
          // ticking until the deadline.
          if (Date.now() < linkPollDeadlineRef.current) {
            linkPollTimerRef.current = window.setTimeout(() => { void tick(); }, 3000);
          } else {
            linkPollTimerRef.current = null;
          }
        };
        linkPollTimerRef.current = window.setTimeout(() => { void tick(); }, 2500);
      } else {
        setLinkError(res.data.message || t('account.linkTelegramFailed'));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string }; status?: number } })?.response?.data?.message;
      setLinkError(msg || t('account.linkTelegramFailed'));
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopyStartCommand = async (): Promise<void> => {
    if (!linkFallback) return;
    try {
      await navigator.clipboard.writeText(linkFallback.command);
      setCopyConfirmed(true);
      setTimeout(() => setCopyConfirmed(false), 2500);
    } catch {
      // Clipboard API not available — user can still select the text manually.
      setCopyConfirmed(false);
    }
  };

  const handleUnlinkTelegram = async (): Promise<void> => {
    setUnlinkLoading(true);
    setLinkMessage(null);
    setLinkError(null);
    setLinkFallback(null);
    try {
      await api.post('/auth/me/telegram-unlink');
      await loadUser();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setLinkError(msg || t('account.unlinkTelegramFailed'));
    } finally {
      setUnlinkLoading(false);
    }
  };

  const handleTogglePref = async (key: ChannelKey, nextValue: boolean): Promise<void> => {
    // Optimistic flip — revert on server error.
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: nextValue }));
    setPrefsSavingChannel(key);
    setPrefsStatus(null);
    try {
      const res = await api.put<{
        success: boolean;
        notificationPrefs: Record<ChannelKey, boolean>;
      }>('/auth/me/notification-prefs', { [key]: nextValue });
      if (res.data?.notificationPrefs) {
        setPrefs(res.data.notificationPrefs);
      }
      setPrefsStatus(t('account.notifSaved'));
    } catch (err: unknown) {
      setPrefs((p) => ({ ...p, [key]: prev }));
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPrefsStatus(msg || t('account.notifSaveFailed'));
    } finally {
      setPrefsSavingChannel(null);
    }
  };

  if (!user) return null;

  return (
    <div className={styles.panel}>
      <h4 className={styles.sectionTitle}>{t('account.yourAccount')}</h4>

      <form onSubmit={handleSaveProfile} className={styles.profileForm}>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="account-firstName">{t('account.firstName')}</label>
            <Input
              id="account-firstName"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={profileSaving}
              placeholder={t('account.firstNamePlaceholder')}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="account-lastName">{t('account.lastName')}</label>
            <Input
              id="account-lastName"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={profileSaving}
              placeholder={t('account.lastNamePlaceholder')}
            />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="account-email">{t('account.email')}</label>
          <Input
            id="account-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={profileSaving}
            placeholder={t('account.emailPlaceholder')}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="account-phone">{t('account.phone')}</label>
          <Input
            id="account-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={profileSaving}
            placeholder={t('account.phonePlaceholder')}
          />
        </div>
        {profileError && <p className={styles.error}>{profileError}</p>}
        {profileSuccess && <p className={styles.success}>{profileSuccess}</p>}
        <div className={styles.formActions}>
          <Button type="submit" loading={profileSaving} disabled={profileSaving} size="lg">
            {t('account.saveProfile')}
          </Button>
        </div>
      </form>

      <h5 className={styles.subSectionTitle}>{t('account.telegram')}</h5>
      {telegramLinked ? (
        <div className={styles.telegramLinkedRow}>
          <p className={styles.telegramLinked}>{t('account.telegramLinked')}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleUnlinkTelegram}
            loading={unlinkLoading}
            disabled={unlinkLoading}
          >
            {t('account.unlinkTelegram')}
          </Button>
          {linkError && <p className={styles.error}>{linkError}</p>}
        </div>
      ) : (
        <div className={styles.telegramActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleLinkTelegram}
            loading={linkLoading}
            disabled={linkLoading}
          >
            {t('account.linkTelegram')}
          </Button>
          {linkMessage && <p className={styles.message}>{linkMessage}</p>}
          {linkFallback && (
            <div className={styles.linkFallback}>
              <p className={styles.fallbackTitle}>{t('account.linkTelegramFallbackTitle')}</p>
              <p className={styles.fallbackHint}>
                {t('account.linkTelegramFallbackHint', { bot: `@${linkFallback.botUsername}` })}
              </p>
              <div className={styles.commandRow}>
                <code className={styles.commandCode}>{linkFallback.command}</code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyStartCommand}
                >
                  {copyConfirmed ? t('account.copied') : t('account.copy')}
                </Button>
              </div>
            </div>
          )}
          {linkError && <p className={styles.error}>{linkError}</p>}
        </div>
      )}

      <h5 className={styles.subSectionTitle}>{t('account.notifPrefsTitle')}</h5>
      <p className={styles.label}>{t('account.notifPrefsDescription')}</p>
      <div className={styles.notifPrefs}>
        {channels.map((ch) => {
          const checkboxId = `notif-pref-${ch.key}`;
          const checked = prefs[ch.key];
          const saving = prefsSavingChannel === ch.key;
          return (
            <div key={ch.key} className={styles.prefRow}>
              <input
                id={checkboxId}
                type="checkbox"
                className={styles.prefCheckbox}
                checked={checked && !ch.disabled}
                disabled={ch.disabled || saving}
                onChange={(e) => handleTogglePref(ch.key, e.target.checked)}
              />
              <div className={styles.prefBody}>
                <label htmlFor={checkboxId} className={styles.prefLabel}>{ch.label}</label>
                <span className={styles.prefHint}>{ch.hint}</span>
                {ch.disabledHint && (
                  <span className={`${styles.prefHint} ${styles.prefDisabledHint}`}>{ch.disabledHint}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.prefStatus}>{prefsStatus}</div>
    </div>
  );
};

export default AccountPanel;
