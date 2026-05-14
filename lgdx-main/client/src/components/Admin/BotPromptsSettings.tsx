import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import styles from './SystemSettings.module.css';
import {
  BotPromptBot,
  BotPromptEffectivePayload,
  BotPromptHistoryItem,
  getBotPromptHistory,
  getBotPrompts,
  restoreBotPromptSnapshot,
  saveBotPrompts,
} from '../../api/botPromptsApi';

const BotPromptsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [bot, setBot] = useState<BotPromptBot>('support');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payload, setPayload] = useState<BotPromptEffectivePayload | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [changeNote, setChangeNote] = useState('');
  const [history, setHistory] = useState<BotPromptHistoryItem[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [p, h] = await Promise.all([getBotPrompts(bot), getBotPromptHistory(bot, 25)]);
      setPayload(p);
      setFiles({ ...p.files });
      setHistory(h);
    } catch {
      setError(t('admin.botPromptsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [bot, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileContent = (name: string, value: string) => {
    setFiles((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!changeNote.trim()) {
      setError(t('admin.botPromptsReasonRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const updated = await saveBotPrompts(bot, { files, changeNote: changeNote.trim() });
      setPayload(updated);
      setFiles({ ...updated.files });
      setChangeNote('');
      setSuccess(t('admin.botPromptsSaved'));
      const h = await getBotPromptHistory(bot, 25);
      setHistory(h);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg || t('admin.botPromptsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ bot, exportedAt: new Date().toISOString(), files }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lgdeal-bot-prompts-${bot}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { files?: Record<string, string> };
        if (!data.files || typeof data.files !== 'object') {
          setError(t('admin.botPromptsImportInvalid'));
          return;
        }
        setFiles((prev) => ({ ...prev, ...data.files }));
        setSuccess(t('admin.botPromptsImportMerged'));
        setTimeout(() => setSuccess(null), 3000);
      } catch {
        setError(t('admin.botPromptsImportInvalid'));
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  const handleRestore = async (snapshotId: string) => {
    const note = window.prompt(t('admin.botPromptsRestorePrompt'));
    if (note === null) return;
    if (!note.trim()) {
      setError(t('admin.botPromptsReasonRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const updated = await restoreBotPromptSnapshot(bot, snapshotId, note.trim());
      setPayload(updated);
      setFiles({ ...updated.files });
      setSuccess(t('admin.botPromptsRestored'));
      await load();
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError(t('admin.botPromptsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !payload) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>{t('admin.botPromptsLoading')}</p>
      </div>
    );
  }

  const fileOrder = payload?.fileOrder ?? [];

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>{t('admin.botPromptsTitle')}</h2>
        <p>{t('admin.botPromptsDescription')}</p>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon}>⚠️</span>
          {error}
          <button type="button" className={styles.closeButton} onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {success && (
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✅</span>
          {success}
          <button type="button" className={styles.closeButton} onClick={() => setSuccess(null)}>
            ×
          </button>
        </div>
      )}

      <div className={styles.settingsSection}>
        <div className={styles.settingControls} style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className={styles.toggleHistoryButton}
            style={
              bot === 'support'
                ? { fontWeight: 700, borderColor: 'var(--color-brand-primary)', color: 'var(--color-text-primary)' }
                : undefined
            }
            onClick={() => setBot('support')}
          >
            {t('admin.botPromptsSupport')}
          </button>
          <button
            type="button"
            className={styles.toggleHistoryButton}
            style={
              bot === 'whatsapp'
                ? { fontWeight: 700, borderColor: 'var(--color-brand-primary)', color: 'var(--color-text-primary)' }
                : undefined
            }
            onClick={() => setBot('whatsapp')}
          >
            {t('admin.botPromptsWhatsapp')}
          </button>
        </div>
        {payload && (
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '12px' }}>
            <strong>{t('admin.botPromptsSource')}:</strong>{' '}
            {payload.source === 'database'
              ? t('admin.botPromptsSourceDatabase')
              : t('admin.botPromptsSourceFilesystem')}
            {payload.updatedAt && (
              <>
                {' '}
                · {new Date(payload.updatedAt).toLocaleString()}
                {payload.updatedBy &&
                  ` · ${payload.updatedBy.firstName} ${payload.updatedBy.lastName}`}
              </>
            )}
          </p>
        )}
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.botPromptsSections')}</h3>
        {fileOrder.map((filename) => (
          <div key={filename} style={{ marginBottom: '1.25rem' }}>
            <label className={styles.settingLabel} htmlFor={`prompt-${bot}-${filename}`}>
              {filename}
            </label>
            <textarea
              id={`prompt-${bot}-${filename}`}
              className={`${styles.reasonInput} ${styles.jsonEditorTextarea}`}
              rows={10}
              value={files[filename] ?? ''}
              onChange={(e) => handleFileContent(filename, e.target.value)}
              spellCheck={false}
              disabled={saving}
            />
          </div>
        ))}
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.settingControls} style={{ flexWrap: 'wrap' }}>
          <input
            type="text"
            className={styles.reasonInput}
            placeholder={t('admin.botPromptsChangeNotePlaceholder')}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            disabled={saving}
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => void handleSave()}
            disabled={saving || !changeNote.trim()}
          >
            {saving ? t('admin.botPromptsSaving') : t('admin.botPromptsSave')}
          </button>
          <button type="button" className={styles.toggleHistoryButton} onClick={handleExport}>
            {t('admin.botPromptsExport')}
          </button>
          <button
            type="button"
            className={styles.toggleHistoryButton}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('admin.botPromptsImport')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            type="button"
            className={styles.toggleHistoryButton}
            onClick={() => void load()}
            disabled={saving}
          >
            {t('admin.botPromptsReload')}
          </button>
        </div>
      </div>

      <div className={styles.settingsSection}>
        <h3>{t('admin.botPromptsHistory')}</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: '12px' }}>
          {t('admin.botPromptsHistoryHint')}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border-primary)' }}>
                <th style={{ padding: '8px' }}>{t('admin.botPromptsWhen')}</th>
                <th style={{ padding: '8px' }}>{t('admin.botPromptsNote')}</th>
                <th style={{ padding: '8px' }}>{t('admin.botPromptsChars')}</th>
                <th style={{ padding: '8px' }}>{t('admin.botPromptsUpdatedBy')}</th>
                <th style={{ padding: '8px' }} />
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const isCurrentLive =
                  payload?.source === 'database' &&
                  payload.currentSnapshotId &&
                  row._id === payload.currentSnapshotId;
                return (
                <tr key={row._id} style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    {new Date(row.updatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top', maxWidth: 280 }}>
                    {row.changeNote}
                  </td>
                  <td style={{ padding: '8px' }}>{row.totalChars}</td>
                  <td style={{ padding: '8px' }}>
                    {row.updatedBy ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}` : '—'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button
                      type="button"
                      className={styles.toggleHistoryButton}
                      onClick={() => void handleRestore(row._id)}
                      disabled={saving || Boolean(isCurrentLive)}
                      title={isCurrentLive ? String(t('admin.botPromptsHistoryHint')) : undefined}
                    >
                      {isCurrentLive ? t('admin.botPromptsRestoreCurrent') : t('admin.botPromptsRestore')}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BotPromptsSettings;
