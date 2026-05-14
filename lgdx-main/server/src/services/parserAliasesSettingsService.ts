import { Types } from "mongoose";
import ParserAliasesSettings from "../models/ParserAliasesSettings";
import { logger } from "../utils/logger";

type AliasesMap = Record<string, string[]>;

export interface ParserAliasesSettingsResponse {
  scope: "global";
  aliases: AliasesMap;
  reason: string;
  updatedAt: Date;
  createdAt: Date;
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

function normalizeAliases(input: AliasesMap): AliasesMap {
  const out: AliasesMap = {};
  for (const [field, values] of Object.entries(input || {})) {
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
    if (normalized.length > 0) {
      out[key] = normalized;
    }
  }
  return out;
}

function detectConflicts(aliases: AliasesMap): Record<string, string[]> {
  const reverse = new Map<string, Set<string>>();
  for (const [field, values] of Object.entries(aliases)) {
    for (const alias of values) {
      const k = alias.trim().toLowerCase();
      if (!k) continue;
      const fields = reverse.get(k) || new Set<string>();
      fields.add(field);
      reverse.set(k, fields);
    }
  }
  const conflicts: Record<string, string[]> = {};
  for (const [alias, fields] of reverse.entries()) {
    if (fields.size > 1) conflicts[alias] = Array.from(fields.values());
  }
  return conflicts;
}

export class ParserAliasesSettingsService {
  static async getCurrentSettings(): Promise<ParserAliasesSettingsResponse> {
    const settings = await ParserAliasesSettings.getCurrentSettings();
    let userInfo: ParserAliasesSettingsResponse["updatedBy"] = undefined;
    if (settings.updatedBy) {
      const User = require("../models/User").default;
      const user = await User.findById(settings.updatedBy).select(
        "firstName lastName email",
      );
      if (user) {
        userInfo = {
          _id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        };
      }
    }
    const aliasesMap = settings.aliases
      ? (Object.fromEntries(settings.aliases.entries()) as AliasesMap)
      : {};
    return {
      scope: "global",
      aliases: normalizeAliases(aliasesMap),
      reason: settings.reason,
      updatedAt: settings.updatedAt,
      createdAt: settings.createdAt,
      updatedBy: userInfo,
    };
  }

  static async updateSettings(
    aliases: AliasesMap,
    userId: Types.ObjectId,
    reason: string,
  ): Promise<ParserAliasesSettingsResponse> {
    const normalized = normalizeAliases(aliases);
    const conflicts = detectConflicts(normalized);
    if (Object.keys(conflicts).length > 0) {
      logger.warn("[ParserAliasesSettings] Conflicting aliases detected", {
        conflicts,
      });
    }

    await ParserAliasesSettings.updateSettings(normalized, userId, reason);
    return this.getCurrentSettings();
  }
}

export default ParserAliasesSettingsService;
