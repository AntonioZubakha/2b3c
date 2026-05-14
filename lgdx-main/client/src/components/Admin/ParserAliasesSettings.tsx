import React, { useEffect, useMemo, useState } from "react";
import {
  getParserAliasesSettings,
  ParserAliasesMap,
  updateParserAliasesSettings,
} from "../../api/parserAliasesSettingsApi";
import styles from "./SystemSettings.module.css";

type ConflictMap = Record<string, string[]>;

const DEFAULT_JSON = JSON.stringify({}, null, 2);

function normalizeAliases(input: unknown): ParserAliasesMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: ParserAliasesMap = {};
  for (const [field, values] of Object.entries(input as Record<string, unknown>)) {
    const key = String(field || "").trim();
    if (!key || !Array.isArray(values)) continue;
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const raw of values) {
      const alias = String(raw || "").trim();
      if (!alias) continue;
      const dedupeKey = alias.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalized.push(alias);
    }
    if (normalized.length > 0) out[key] = normalized;
  }
  return out;
}

function detectConflicts(aliases: ParserAliasesMap): ConflictMap {
  const reverse = new Map<string, Set<string>>();
  for (const [field, values] of Object.entries(aliases)) {
    for (const alias of values) {
      const key = alias.trim().toLowerCase();
      if (!key) continue;
      const fields = reverse.get(key) || new Set<string>();
      fields.add(field);
      reverse.set(key, fields);
    }
  }
  const conflicts: ConflictMap = {};
  reverse.forEach((fields, alias) => {
    if (fields.size > 1) conflicts[alias] = Array.from(fields.values());
  });
  return conflicts;
}

const ParserAliasesSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jsonValue, setJsonValue] = useState(DEFAULT_JSON);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await getParserAliasesSettings();
        const normalized = normalizeAliases(response.aliases || {});
        setJsonValue(JSON.stringify(normalized, null, 2));
        setUpdatedAt(response.updatedAt || null);
      } catch (e) {
        setError("Failed to load global parser aliases.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const parsed = useMemo(() => {
    try {
      const raw = JSON.parse(jsonValue) as unknown;
      const aliases = normalizeAliases(raw);
      return { aliases, parseError: null as string | null };
    } catch (e) {
      return { aliases: {} as ParserAliasesMap, parseError: "JSON contains syntax errors." };
    }
  }, [jsonValue]);

  const conflicts = useMemo(() => {
    if (parsed.parseError) return {};
    return detectConflicts(parsed.aliases);
  }, [parsed]);

  const stats = useMemo(() => {
    if (parsed.parseError) return { fields: 0, aliases: 0 };
    const fields = Object.keys(parsed.aliases).length;
    const aliases = Object.values(parsed.aliases).reduce((sum, arr) => sum + arr.length, 0);
    return { fields, aliases };
  }, [parsed]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (parsed.parseError) {
      setError(parsed.parseError);
      return;
    }
    if (!reason.trim()) {
      setError("Please provide a reason for this change.");
      return;
    }
    try {
      setSaving(true);
      const updated = await updateParserAliasesSettings({
        aliases: parsed.aliases,
        reason: reason.trim(),
      });
      const normalized = normalizeAliases(updated.aliases || {});
      setJsonValue(JSON.stringify(normalized, null, 2));
      setUpdatedAt(updated.updatedAt || null);
      setReason("");
      setSuccess("Global parser aliases were saved.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError("Failed to save aliases. Please validate payload and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading parser aliases settings...</p>
      </div>
    );
  }

  return (
    <div className={styles.systemSettingsContainer}>
      <div className={styles.header}>
        <h2>Global Parser Aliases</h2>
        <p>
          These settings apply to all suppliers and are used by both services:
          file-import and api-sync.
        </p>
        {updatedAt && <p>Last updated: {new Date(updatedAt).toLocaleString()}</p>}
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
        <h3>Current configuration</h3>
        <p>Fields: {stats.fields} | Aliases: {stats.aliases}</p>
        <textarea
          className={`${styles.reasonInput} ${styles.jsonEditorTextarea}`}
          value={jsonValue}
          onChange={(e) => setJsonValue(e.target.value)}
          disabled={saving}
        />
        <p className={styles.jsonEditorHint}>
          Format: {"{ \"photo\": [\"diamondImages\"], \"video\": [\"diamondVideo\"] }"}
        </p>
      </div>

      <div className={styles.settingsSection}>
        <h3>Alias conflicts</h3>
        {Object.keys(conflicts).length === 0 ? (
          <p>No conflicts found.</p>
        ) : (
          <ul>
            {Object.entries(conflicts).map(([alias, fields]) => (
              <li key={alias}>
                <code>{alias}</code> is used in fields: {fields.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.settingsSection}>
        <div className={styles.settingControls}>
          <input
            type="text"
            className={styles.reasonInput}
            placeholder="Reason for change (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
          />
          <button
            className={styles.toggleButton}
            type="button"
            onClick={handleSave}
            disabled={saving || !!parsed.parseError || !reason.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParserAliasesSettings;
