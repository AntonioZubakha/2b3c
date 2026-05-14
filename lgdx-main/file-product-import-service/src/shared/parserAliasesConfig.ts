import ParserAliasesSettings from "../models/ParserAliasesSettings";
import { logger } from "./logger";
import { applyGlobalParserAliases, getParserAliasConflicts } from "./productUtils";

type AliasesMap = Record<string, string[]>;

let lastLoadedAt = 0;
const CACHE_TTL_MS = Number(process.env.PARSER_ALIASES_CACHE_TTL_MS || 5 * 60 * 1000);

function normalizeAliases(raw: unknown): AliasesMap {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: AliasesMap = {};
  for (const [field, values] of Object.entries(input)) {
    const key = String(field || "").trim();
    if (!key || !Array.isArray(values)) continue;
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of values) {
      const alias = String(value ?? "").trim();
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

export async function refreshGlobalParserAliases(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastLoadedAt < CACHE_TTL_MS) return;
  try {
    const doc = await ParserAliasesSettings.findOne({ scope: "global" })
      .select("aliases updatedAt")
      .lean<{ aliases?: Map<string, string[]> | Record<string, unknown>; updatedAt?: Date } | null>();
    const aliasesObj =
      doc?.aliases instanceof Map
        ? Object.fromEntries(doc.aliases.entries())
        : (doc?.aliases as Record<string, unknown> | undefined);
    const aliases = normalizeAliases(aliasesObj || {});
    applyGlobalParserAliases(aliases);
    const conflicts = getParserAliasConflicts();
    if (Object.keys(conflicts).length > 0) {
      logger.warn("[ParserAliases] Alias conflicts detected", { conflicts });
    }
    logger.info("[ParserAliases] Loaded global parser aliases", {
      fields: Object.keys(aliases).length,
      updatedAt: doc?.updatedAt,
    });
    lastLoadedAt = now;
  } catch (error) {
    logger.warn("[ParserAliases] Failed to load global parser aliases, using fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    lastLoadedAt = now;
  }
}
