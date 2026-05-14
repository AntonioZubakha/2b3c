import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  getConstantsSettings,
  updateConstantsSettings,
  ConstantsSettingsResponse,
} from '../../api/constantsSettingsApi';
import styles from './SystemSettings.module.css';

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={styles.reasonInput}
    />
  );
}

const ConstantsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ConstantsSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getConstantsSettings();
        setSettings(data);
      } catch (e) {
        setError(t('admin.constantsLoadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const handleSave = async () => {
    if (!settings) return;
    if (!reason.trim()) {
      setError(t('admin.constantsReasonRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateConstantsSettings({
        minSupplierPrice: settings.minSupplierPrice,
        measurementRatioGeometryTolerancePct: settings.measurementRatioGeometryTolerancePct,
        alternativesCaratTolerance: settings.alternativesCaratTolerance,
        reason,
      });
      setSuccess(t('admin.constantsSaveSuccess'));
      setReason('');
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(t('admin.constantsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{t('admin.constantsLoading')}</p>
      </div>
    );
  if (!settings)
    return (
      <div className={styles.errorContainer}>
        <p>{t('admin.constantsNoData')}</p>
      </div>
    );

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>{t('admin.constantsTitle')}</h2>
        <p>{t('admin.constantsDescription')}</p>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon}>⚠️</span>
          {error}
          <button onClick={() => setError(null)} className={styles.closeButton} type="button">
            ×
          </button>
        </div>
      )}
      {success && (
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✅</span>
          {success}
          <button onClick={() => setSuccess(null)} className={styles.closeButton} type="button">
            ×
          </button>
        </div>
      )}

      <div className={styles.settingsSection}>
        <h3>{t('admin.constantsMarketplace')}</h3>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.constantsMinSupplierPrice')}</label>
            <span className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9 }}>{t('admin.constantsMinSupplierPriceHint')}</span>
          </div>
          <div className={styles.settingControls}>
            <NumberInput
              value={settings.minSupplierPrice}
              min={0}
              max={100000}
              onChange={(v) => setSettings({ ...settings, minSupplierPrice: Math.max(0, v) })}
            />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.constantsMatching')}</h3>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.constantsMeasurementTolerance')}</label>
            <span className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9 }}>{t('admin.constantsMeasurementToleranceHint')}</span>
          </div>
          <div className={styles.settingControls}>
            <NumberInput
              value={Number((settings.measurementRatioGeometryTolerancePct * 100).toFixed(2))}
              min={0.1}
              max={50}
              step={0.1}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  measurementRatioGeometryTolerancePct: Math.max(0.001, Math.min(0.5, v / 100)),
                })
              }
            />
            <span> %</span>
          </div>
        </div>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.constantsAlternativesCaratTolerance')}</label>
            <span className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9 }}>{t('admin.constantsAlternativesCaratToleranceHint')}</span>
          </div>
          <div className={styles.settingControls}>
            <NumberInput
              value={settings.alternativesCaratTolerance}
              min={0.001}
              max={0.5}
              step={0.01}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  alternativesCaratTolerance: Math.max(0.001, Math.min(0.5, v)),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.settingItem}>
          <div className={styles.settingControls}>
            <input
              type="text"
              placeholder={t('admin.constantsReasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.reasonInput}
              disabled={saving}
            />
            <button
              onClick={handleSave}
              disabled={saving || !reason.trim()}
              className={styles.toggleButton}
              type="button"
            >
              {saving ? t('admin.constantsSaving') : t('admin.constantsSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstantsSettings;
