import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  getMarketPriceSettings,
  updateMarketPriceSettings,
  MarketPriceSettingsResponse,
} from '../../api/marketPriceSettingsApi';
import styles from './SystemSettings.module.css';

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.01,
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

const MarketPriceSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MarketPriceSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getMarketPriceSettings();
        setSettings(data);
      } catch {
        setError(t('admin.marketPriceSettingsLoadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const handleSave = async () => {
    if (!settings) return;
    if (!reason.trim()) {
      setError(t('admin.marketPriceSettingsReasonRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateMarketPriceSettings({
        coeffInr: settings.coeffInr,
        coeffGold: settings.coeffGold,
        coeffOil: settings.coeffOil,
        weightPriceDecreased: settings.weightPriceDecreased,
        weightPriceIncreased: settings.weightPriceIncreased,
        weightNewProducts: settings.weightNewProducts,
        weightDisappeared: settings.weightDisappeared,
        weightUnchanged: settings.weightUnchanged,
        medianSmallKeepPct: settings.medianSmallKeepPct,
        medianMediumKeepPct: settings.medianMediumKeepPct,
        medianLargeExpensiveExcludePct: settings.medianLargeExpensiveExcludePct,
        medianLargeCheapExcludePct: settings.medianLargeCheapExcludePct,
        medianVeryLargeExpensiveExcludePct: settings.medianVeryLargeExpensiveExcludePct,
        medianVeryLargeCheapExcludePct: settings.medianVeryLargeCheapExcludePct,
        reason,
      });
      setSuccess(t('admin.marketPriceSettingsSaveSuccess'));
      setReason('');
      setTimeout(() => setSuccess(null), 2500);
    } catch {
      setError(t('admin.marketPriceSettingsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{t('admin.marketPriceSettingsLoading')}</p>
      </div>
    );
  if (!settings)
    return (
      <div className={styles.errorContainer}>
        <p>{t('admin.marketPriceSettingsNoData')}</p>
      </div>
    );

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>{t('admin.marketPriceSettingsTitle')}</h2>
        <p>{t('admin.marketPriceSettingsDescription')}</p>
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
        <h3>{t('admin.marketPriceSettingsEconomic')}</h3>
        <p className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9, marginBottom: '0.5rem' }}>
          {t('admin.marketPriceSettingsEconomicHint')}
        </p>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.marketPriceSettingsCoeffInr')}</label>
          </div>
          <div className={styles.settingControls}>
            <NumberInput value={settings.coeffInr} min={0} max={1} step={0.01} onChange={(v) => setSettings({ ...settings, coeffInr: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.marketPriceSettingsCoeffGold')}</label>
          </div>
          <div className={styles.settingControls}>
            <NumberInput value={settings.coeffGold} min={0} max={0.2} step={0.01} onChange={(v) => setSettings({ ...settings, coeffGold: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.marketPriceSettingsCoeffOil')}</label>
          </div>
          <div className={styles.settingControls}>
            <NumberInput value={settings.coeffOil} min={0} max={0.2} step={0.01} onChange={(v) => setSettings({ ...settings, coeffOil: v })} />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.marketPriceSettingsWeights')}</h3>
        <p className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9, marginBottom: '0.5rem' }}>
          {t('admin.marketPriceSettingsWeightsHint')}
        </p>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsWeightDecreased')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.weightPriceDecreased} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ ...settings, weightPriceDecreased: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsWeightIncreased')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.weightPriceIncreased} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ ...settings, weightPriceIncreased: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsWeightNew')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.weightNewProducts} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ ...settings, weightNewProducts: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsWeightDisappeared')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.weightDisappeared} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ ...settings, weightDisappeared: v })} />
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsWeightUnchanged')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.weightUnchanged} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ ...settings, weightUnchanged: v })} />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.marketPriceSettingsMedian')}</h3>
        <p className={styles.settingLabel} style={{ fontWeight: 'normal', opacity: 0.9, marginBottom: '0.5rem' }}>
          {t('admin.marketPriceSettingsMedianHint')}
        </p>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsMedianSmallKeep')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.medianSmallKeepPct} min={0.5} max={1} step={0.05} onChange={(v) => setSettings({ ...settings, medianSmallKeepPct: v })} />
            <span> (≤15)</span>
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsMedianMediumKeep')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.medianMediumKeepPct} min={0.2} max={0.8} step={0.05} onChange={(v) => setSettings({ ...settings, medianMediumKeepPct: v })} />
            <span> (16–50)</span>
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsMedianLargeExp')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.medianLargeExpensiveExcludePct} min={0.3} max={0.9} step={0.05} onChange={(v) => setSettings({ ...settings, medianLargeExpensiveExcludePct: v })} />
            <span> + </span>
            <NumberInput value={settings.medianLargeCheapExcludePct} min={0} max={0.1} step={0.01} onChange={(v) => setSettings({ ...settings, medianLargeCheapExcludePct: v })} />
            <span> (51–100)</span>
          </div>
        </div>
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>{t('admin.marketPriceSettingsMedianVeryLargeExp')}</label>
          <div className={styles.settingControls}>
            <NumberInput value={settings.medianVeryLargeExpensiveExcludePct} min={0.5} max={0.95} step={0.05} onChange={(v) => setSettings({ ...settings, medianVeryLargeExpensiveExcludePct: v })} />
            <span> + </span>
            <NumberInput value={settings.medianVeryLargeCheapExcludePct} min={0} max={0.1} step={0.01} onChange={(v) => setSettings({ ...settings, medianVeryLargeCheapExcludePct: v })} />
            <span> (&gt;100)</span>
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.settingItem}>
          <div className={styles.settingControls}>
            <input
              type="text"
              placeholder={t('admin.marketPriceSettingsReasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.reasonInput}
              disabled={saving}
            />
            <button onClick={handleSave} disabled={saving || !reason.trim()} className={styles.toggleButton} type="button">
              {saving ? t('admin.marketPriceSettingsSaving') : t('admin.marketPriceSettingsSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketPriceSettings;
