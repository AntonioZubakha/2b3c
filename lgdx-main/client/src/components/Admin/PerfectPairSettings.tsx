import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { 
  getPerfectPairSettings, 
  updatePerfectPairSettings, 
  PerfectPairSettingsResponse, 
  PerfectPairStageConfig, 
  PerfectPairWeightsConfig 
} from '../../api/perfectPairSettingsApi';
import styles from './SystemSettings.module.css';

function NumberInput({ value, onChange, min, max, step = 1, disabled = false }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
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

const PerfectPairSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PerfectPairSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getPerfectPairSettings();
        setSettings(data);
      } catch (e) {
        setError(t('admin.perfectPairLoadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const updateStage = (idx: number, patch: Partial<PerfectPairStageConfig>) => {
    if (!settings) return;
    const stages = settings.stages.map((s, i) => i === idx ? { ...s, ...patch } : s);
    setSettings({ ...settings, stages });
  };

  const updateWeights = (patch: Partial<PerfectPairWeightsConfig>) => {
    if (!settings) return;
    setSettings({ ...settings, weights: { ...settings.weights, ...patch } });
  };

  const handleSave = async () => {
    if (!settings) return;
    if (!reason.trim()) { setError(t('admin.perfectPairReasonRequired')); return; }
    try {
      setSaving(true);
      setError(null);
      await updatePerfectPairSettings({
        enableProgressiveRelaxation: settings.enableProgressiveRelaxation,
        maxStage: settings.maxStage,
        stages: settings.stages,
        weights: settings.weights,
        reason
      });
      setSuccess(t('admin.perfectPairSaveSuccess'));
      setReason('');
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(t('admin.perfectPairSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loadingContainer}><div className={styles.spinner}></div><p>{t('admin.perfectPairLoading')}</p></div>;
  if (!settings) return <div className={styles.errorContainer}><p>{t('admin.perfectPairNoData')}</p></div>;

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>{t('admin.perfectPairTitle')}</h2>
        <p>{t('admin.perfectPairDescription')}</p>
      </div>

      {error && (<div className={styles.errorMessage}><span className={styles.errorIcon}>⚠️</span>{error}<button onClick={() => setError(null)} className={styles.closeButton}>×</button></div>)}
      {success && (<div className={styles.successMessage}><span className={styles.successIcon}>✅</span>{success}<button onClick={() => setSuccess(null)} className={styles.closeButton}>×</button></div>)}

      <div className={styles.settingsSection}>
        <h3>{t('admin.perfectPairGeneral')}</h3>
        <div className={styles.settingItem}>
          <div className={styles.settingInfo}>
            <label className={styles.settingLabel}>{t('admin.perfectPairProgressiveRelaxation')}</label>
          </div>
          <div className={styles.settingControls}>
            <label className={styles.settingLabel}>
              <input type="checkbox" checked={settings.enableProgressiveRelaxation} onChange={(e) => setSettings({ ...settings, enableProgressiveRelaxation: e.target.checked })} />
              {t('admin.perfectPairEnable')}
            </label>
            <span className={styles.lastUpdated}>{t('admin.perfectPairMaxStage')}</span>
            <NumberInput value={settings.maxStage} min={1} max={4} onChange={(v) => setSettings({ ...settings, maxStage: Math.max(1, Math.min(4, v)) })} />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.perfectPairStages')}</h3>
        {settings.stages.map((stage, idx) => (
          <div key={idx} className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>{t('admin.perfectPairStage', { number: idx + 1 })}</label>
            </div>
            <div className={styles.settingControls}>
              <span>{t('admin.perfectPairCaratTolerance')}</span>
              <NumberInput value={stage.caratTolerancePct} min={0} max={5} step={0.5} onChange={(v) => updateStage(idx, { caratTolerancePct: v })} />
              <span>{t('admin.perfectPairClaritySteps')}</span>
              <NumberInput value={stage.clarityStepsAllowed} min={0} max={2} onChange={(v) => updateStage(idx, { clarityStepsAllowed: v })} />
              <span>{t('admin.perfectPairCutDowngrade')}</span>
              <NumberInput value={stage.cutMaxDowngrade} min={0} max={2} onChange={(v) => updateStage(idx, { cutMaxDowngrade: v })} />
              <span>{t('admin.perfectPairPolishDowngrade')}</span>
              <NumberInput value={stage.polishMaxDowngrade} min={0} max={2} onChange={(v) => updateStage(idx, { polishMaxDowngrade: v })} />
              <span>{t('admin.perfectPairSymmetryDowngrade')}</span>
              <NumberInput value={stage.symmetryMaxDowngrade} min={0} max={2} onChange={(v) => updateStage(idx, { symmetryMaxDowngrade: v })} />
              <span>{t('admin.perfectPairMaxCandidates')}</span>
              <NumberInput value={stage.maxCandidatesPerStage} min={1} max={200} onChange={(v) => updateStage(idx, { maxCandidatesPerStage: v })} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.perfectPairWeights')}</h3>
        <div className={styles.settingItem}>
          <div className={styles.settingControls}>
            <span>{t('admin.perfectPairWeightCarat')}</span>
            <NumberInput value={settings.weights.carat} min={0} max={100} onChange={(v) => updateWeights({ carat: v })} />
            <span>{t('admin.perfectPairWeightClarity')}</span>
            <NumberInput value={settings.weights.clarity} min={0} max={100} onChange={(v) => updateWeights({ clarity: v })} />
            <span>{t('admin.perfectPairWeightCut')}</span>
            <NumberInput value={settings.weights.cut} min={0} max={100} onChange={(v) => updateWeights({ cut: v })} />
            <span>{t('admin.perfectPairWeightPolish')}</span>
            <NumberInput value={settings.weights.polish} min={0} max={100} onChange={(v) => updateWeights({ polish: v })} />
            <span>{t('admin.perfectPairWeightSymmetry')}</span>
            <NumberInput value={settings.weights.symmetry} min={0} max={100} onChange={(v) => updateWeights({ symmetry: v })} />
            <span>{t('admin.perfectPairBonusFullGia')}</span>
            <NumberInput value={settings.weights.bonusFullGia} min={0} max={100} onChange={(v) => updateWeights({ bonusFullGia: v })} />
            <span>{t('admin.perfectPairPricePenaltyK')}</span>
            <NumberInput value={settings.weights.pricePenaltyK} min={0} max={100} onChange={(v) => updateWeights({ pricePenaltyK: v })} />
          </div>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.settingItem}>
          <div className={styles.settingControls}>
            <input
              type="text"
              placeholder={t('admin.perfectPairReasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.reasonInput}
              disabled={saving}
            />
            <button onClick={handleSave} disabled={saving || !reason.trim()} className={styles.toggleButton}>
              {saving ? t('admin.perfectPairSaving') : t('admin.perfectPairSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerfectPairSettings;


