import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import {
  getCurrentSettings, getSettingsHistory, SystemSettings as SystemSettingsType, SystemSettingsHistoryItem,
  toggleRegistrations, updateSettings,
} from '../../api/systemSettingsApi';
import styles from './SystemSettings.module.css';

function parseIpBlacklist(text: string): string[] {
  const parts = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

function parseCountryCodes(text: string): string[] {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^[A-Za-z]{2}$/.test(s));
  return Array.from(new Set(parts.map((c) => c.toUpperCase())));
}

const SystemSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SystemSettingsType | null>(null);
  const [history, setHistory] = useState<SystemSettingsHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  /** Причина только для сохранения IP/стран — не путать с полем над кнопкой вкл/выкл регистраций */
  const [restrictionReason, setRestrictionReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [ipBlacklistText, setIpBlacklistText] = useState('');
  const [countryCodesText, setCountryCodesText] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const currentSettings = await getCurrentSettings();
      setSettings(currentSettings);
      setIpBlacklistText((currentSettings.registrationIpBlacklist || []).join('\n'));
      setCountryCodesText((currentSettings.registrationBlockedCountryCodes || []).join(', '));
    } catch (err) {
      setError(t('admin.systemSettingsLoadErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadHistory = useCallback(async () => {
    try {
      const historyData = await getSettingsHistory(10);
      setHistory(historyData);
    } catch (err) {
      // Silent fail for history
    }
  }, []);

  // Загрузка настроек при монтировании компонента
  useEffect(() => {
    void loadSettings();
    void loadHistory();
  }, [loadSettings, loadHistory]);

  const handleToggleRegistrations = async () => {
    if (!reason.trim()) {
      setError(t('admin.systemSettingsReasonRequired'));
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      
      const newEnabled = !settings?.registrationsEnabled;
      
      const updatedSettings = await toggleRegistrations({
        enabled: newEnabled,
        reason,
        registrationIpBlacklist: parseIpBlacklist(ipBlacklistText),
        registrationBlockedCountryCodes: parseCountryCodes(countryCodesText),
      });

      setSettings(updatedSettings);
      setIpBlacklistText((updatedSettings.registrationIpBlacklist || []).join('\n'));
      setCountryCodesText((updatedSettings.registrationBlockedCountryCodes || []).join(', '));
      setReason('');
      setSuccess(newEnabled ? t('admin.systemSettingsRegistrationsEnabled') : t('admin.systemSettingsRegistrationsDisabled'));
      
      // Обновляем историю
      await loadHistory();
      
      // Очищаем сообщение об успехе через 3 секунды
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(t('admin.systemSettingsUpdateError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveRestrictions = async () => {
    if (!settings) return;
    if (!restrictionReason.trim()) {
      setError(t('admin.systemSettingsReasonRequired'));
      return;
    }

    try {
      setUpdating(true);
      setError(null);

      const updatedSettings = await updateSettings({
        registrationsEnabled: settings.registrationsEnabled,
        reason: restrictionReason,
        registrationIpBlacklist: parseIpBlacklist(ipBlacklistText),
        registrationBlockedCountryCodes: parseCountryCodes(countryCodesText),
      });

      setSettings(updatedSettings);
      setIpBlacklistText((updatedSettings.registrationIpBlacklist || []).join('\n'));
      setCountryCodesText((updatedSettings.registrationBlockedCountryCodes || []).join(', '));
      setRestrictionReason('');
      setSuccess(t('admin.systemSettingsRestrictionsSaved'));

      await loadHistory();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(t('admin.systemSettingsUpdateError'));
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{t('admin.systemSettingsLoading')}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={styles.errorContainer}>
        <p>{t('admin.systemSettingsLoadError')}</p>
        <button onClick={loadSettings} className={styles.retryButton}>
          {t('admin.systemSettingsRetry')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>{t('admin.systemSettingsTitle')}</h2>
        <p>{t('admin.systemSettingsDescription')}</p>
      </div>

      {/* Сообщения об ошибках и успехе */}
      {error && (
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon}>⚠️</span>
          {error}
          <button 
            onClick={() => setError(null)} 
            className={styles.closeButton}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✅</span>
          {success}
          <button 
            onClick={() => setSuccess(null)} 
            className={styles.closeButton}
          >
            ×
          </button>
        </div>
      )}

      {/* Основные настройки */}
      <div className={styles.settingsSection}>
        <h3>{t('admin.systemSettingsRegistration')}</h3>
        
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.systemSettingsUserRegistrations')}</label>
            <div className={styles.statusIndicator}>
              <span className={`${styles.status} ${styles[settings.status]}`}>
                {settings.status.toUpperCase()}
              </span>
              <span className={styles.lastUpdated}>
                {t('admin.systemSettingsLastUpdated', { date: formatDate(settings.updatedAt) })}
              </span>
            </div>
          </div>

          <p className={styles.toggleReasonHint}>{t('admin.systemSettingsReasonForToggleOnly')}</p>
          <div className={styles.settingControls}>
            <input
              type="text"
              placeholder={t('admin.systemSettingsReasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.reasonInput}
              disabled={updating}
            />
            
            <button
              onClick={handleToggleRegistrations}
              disabled={updating || !reason.trim()}
              className={`${styles.toggleButton} ${styles[settings.registrationsEnabled ? 'disable' : 'enable']}`}
            >
              {updating ? t('admin.systemSettingsUpdating') : 
               settings.registrationsEnabled ? t('admin.systemSettingsDisableRegistrations') : t('admin.systemSettingsEnableRegistrations')}
            </button>
          </div>
        </div>

        <div className={styles.restrictionBlock}>
          <h4 className={styles.restrictionTitle}>{t('admin.systemSettingsRegistrationRestrictions')}</h4>
          <p className={styles.restrictionHint}>{t('admin.systemSettingsRestrictionsIntro')}</p>
          <label className={styles.blocklistLabel}>{t('admin.systemSettingsIpBlacklistLabel')}</label>
          <textarea
            className={styles.blocklistTextarea}
            rows={5}
            value={ipBlacklistText}
            onChange={(e) => setIpBlacklistText(e.target.value)}
            disabled={updating}
            placeholder={t('admin.systemSettingsIpBlacklistPlaceholder')}
            spellCheck={false}
          />
          <p className={styles.restrictionHint}>{t('admin.systemSettingsIpBlacklistHint')}</p>

          <label className={styles.blocklistLabel}>{t('admin.systemSettingsCountryBlacklistLabel')}</label>
          <textarea
            className={styles.blocklistTextarea}
            rows={3}
            value={countryCodesText}
            onChange={(e) => setCountryCodesText(e.target.value)}
            disabled={updating}
            placeholder={t('admin.systemSettingsCountryBlacklistPlaceholder')}
            spellCheck={false}
          />
          <p className={styles.restrictionHint}>{t('admin.systemSettingsCountryBlacklistHint')}</p>

          <label className={styles.blocklistLabel} htmlFor="restriction-reason">
            {t('admin.systemSettingsRestrictionReasonLabel')}
          </label>
          <input
            id="restriction-reason"
            type="text"
            placeholder={t('admin.systemSettingsRestrictionReasonPlaceholder')}
            value={restrictionReason}
            onChange={(e) => setRestrictionReason(e.target.value)}
            className={styles.reasonInput}
            disabled={updating}
          />

          <button
            type="button"
            onClick={handleSaveRestrictions}
            disabled={updating || !restrictionReason.trim()}
            className={styles.saveRestrictionsButton}
          >
            {updating ? t('admin.systemSettingsUpdating') : t('admin.systemSettingsSaveRestrictions')}
          </button>
        </div>

        {/* Информация о последнем изменении */}
        {settings.updatedBy && (
          <div className={styles.lastChangeInfo}>
            <p>
              <strong>{t('admin.systemSettingsLastChangedBy')}</strong> {settings.updatedBy.firstName} {settings.updatedBy.lastName} ({settings.updatedBy.email})
            </p>
            <p>
              <strong>{t('admin.systemSettingsReason')}</strong> {settings.reason}
            </p>
          </div>
        )}
      </div>

      {/* История изменений */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h3>{t('admin.systemSettingsChangeHistory')}</h3>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={styles.toggleHistoryButton}
          >
            {showHistory ? t('admin.systemSettingsHideHistory') : t('admin.systemSettingsShowHistory')}
          </button>
        </div>

        {showHistory && (
          <div className={styles.historyList}>
            {history.length === 0 ? (
              <p className={styles.noHistory}>{t('admin.systemSettingsNoHistory')}</p>
            ) : (
              history.map((item) => (
                <div key={item._id} className={styles.historyItem}>
                  <div className={styles.historyStatus}>
                    <span className={`${styles.status} ${styles[item.registrationsEnabled ? 'enabled' : 'disabled']}`}>
                      {item.registrationsEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <div className={styles.historyDetails}>
                    <p className={styles.historyReason}>{item.reason}</p>
                    <p className={styles.historyMeta}>
                      {item.updatedBy ? 
                        t('admin.systemSettingsChangedBy', { name: `${item.updatedBy.firstName} ${item.updatedBy.lastName}` }) : 
                        t('admin.systemSettingsSystemChange')
                      } • {formatDate(item.updatedAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>


    </div>
  );
};

export default SystemSettings;
