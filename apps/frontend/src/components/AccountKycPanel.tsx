import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shield } from './icons';
import { apiJson, GATEWAY } from '../lib/api';
import type { AuthMeResponse, AuthMeUser } from '../lib/contracts';
import type { KycStatus } from '@stonee/shared-types';

export type AccountKycPanelVariant = 'sidebar' | 'standalone';

type Props = {
  variant?: AccountKycPanelVariant;
  className?: string;
};

const AccountKycPanel: React.FC<Props> = ({ variant = 'sidebar', className = '' }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<AuthMeUser | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [kycDevBusy, setKycDevBusy] = useState(false);
  const [kycDevHint, setKycDevHint] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setProfile(null);
      setProfileReady(true);
      return;
    }
    let cancelled = false;
    setProfileReady(false);
    (async () => {
      try {
        const json = (await apiJson(`${GATEWAY.user}/auth/me`)) as unknown as AuthMeResponse;
        if (!cancelled && json.success && json.user) setProfile(json.user);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vaultKycBodyKey = (): 'vault.kycNotRequired' | 'vault.kycNA' | 'vault.kycVerified' | 'vault.kycPending' | 'vault.kycRejected' => {
    if (!profile) return 'vault.kycNotRequired';
    if (profile.role !== 'buyer') return 'vault.kycNA';
    const s = profile.kycStatus ?? 'not_required';
    if (s === 'verified') return 'vault.kycVerified';
    if (s === 'pending') return 'vault.kycPending';
    if (s === 'rejected') return 'vault.kycRejected';
    return 'vault.kycNotRequired';
  };

  const handleDevKycSelfVerify = async () => {
    setKycDevHint(null);
    setKycDevBusy(true);
    try {
      const json = (await apiJson(`${GATEWAY.user}/auth/kyc/self-verify`, { method: 'POST' })) as {
        success?: boolean;
        data?: { kycStatus?: KycStatus };
      };
      if (json.success && json.data?.kycStatus) {
        setProfile(prev => (prev ? { ...prev, kycStatus: json.data!.kycStatus! } : prev));
        setKycDevHint(t('vault.kycDevDone'));
      }
    } catch (e) {
      setKycDevHint(e instanceof Error ? e.message : t('vault.kycDevFailed'));
    } finally {
      setKycDevBusy(false);
    }
  };

  if (!profileReady) {
    return variant === 'standalone' ? (
      <div className={`glass-card p-10 text-center text-ink-soft animate-pulse ${className}`}>{t('security.loading')}</div>
    ) : null;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    if (variant === 'sidebar') return null;
    return (
      <div className={`glass-card p-8 space-y-5 ${className}`}>
        <p className="text-sm text-ink-soft leading-relaxed">{t('security.signInPrompt')}</p>
        <Link
          to="/auth?redirect=/account/security"
          className="btn-primary inline-block text-center w-full py-4 text-xs font-medium uppercase tracking-[0.22em] no-underline"
        >
          {t('security.signInCta')}
        </Link>
      </div>
    );
  }

  if (!profile) {
    if (variant === 'sidebar') return null;
    return (
      <div className={`glass-card p-8 ${className}`}>
        <p className="text-sm text-ink-soft">{t('security.profileUnavailable')}</p>
      </div>
    );
  }

  return (
    <div className={`glass-card p-7 space-y-4 border border-cream-200 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="p-2.5 rounded-xl bg-blush-50 border border-blush-200 text-rose-gold-deep">
          <Shield size={18} />
        </span>
        <div>
          <h2 className="font-serif text-lg text-ink leading-tight">{t('vault.kycCardTitle')}</h2>
          <p className="text-[10px] text-ash uppercase tracking-[0.22em]">{t('vault.kycCardSubtitle')}</p>
        </div>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">{t(vaultKycBodyKey())}</p>
      {import.meta.env.DEV && profile.role === 'buyer' && profile.kycStatus !== 'verified' ? (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={kycDevBusy}
            onClick={() => void handleDevKycSelfVerify()}
            className="glass-button w-full py-3 text-[10px] font-medium uppercase tracking-[0.18em]"
          >
            {kycDevBusy ? t('vault.kycDevBusy') : t('vault.kycDevComplete')}
          </button>
          {kycDevHint ? <p className="text-[11px] text-ash">{kycDevHint}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default AccountKycPanel;
