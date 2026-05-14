import { logger } from '../utils/logger';
import SystemSettings, { ISystemSettings } from '../models/SystemSettings';
import { Types } from 'mongoose';
import { isSupportedCountry } from 'libphonenumber-js';

export interface SystemSettingsUpdateDto {
  registrationsEnabled: boolean;
  reason: string;
  registrationIpBlacklist?: string[];
  registrationBlockedCountryCodes?: string[];
}

export interface SystemSettingsResponse {
  registrationsEnabled: boolean;
  registrationIpBlacklist: string[];
  registrationBlockedCountryCodes: string[];
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  updatedAt: Date;
  reason: string;
  status: 'enabled' | 'disabled';
}

function normalizeIpEntries(ips: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of ips) {
    const t = s.trim();
    if (t.length > 0 && t.length <= 200 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (out.length >= 500) break;
  }
  return out;
}

function normalizeCountryCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    const u = c.trim().toUpperCase();
    if (u.length === 2 && isSupportedCountry(u) && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
    if (out.length >= 300) break;
  }
  return out;
}

export class SystemSettingsService {
  /**
   * Получить текущие системные настройки
   */
  static async getCurrentSettings(): Promise<SystemSettingsResponse> {
    try {
      const settings = await SystemSettings.getCurrentSettings();

      // Если updatedBy не установлен (для дефолтных настроек), возвращаем без пользователя
      let userInfo = undefined;
      if (settings.updatedBy) {
        const User = require('../models/User').default;
        const user = await User.findById(settings.updatedBy).select('firstName lastName email');
        if (user) {
          userInfo = {
            _id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          };
        }
      }

      return {
        registrationsEnabled: settings.registrationsEnabled,
        registrationIpBlacklist: settings.registrationIpBlacklist ?? [],
        registrationBlockedCountryCodes: settings.registrationBlockedCountryCodes ?? [],
        updatedBy: userInfo,
        updatedAt: settings.updatedAt,
        reason: settings.reason,
        status: settings.registrationsEnabled ? 'enabled' : 'disabled'
      };
    } catch (error) {
      logger.error('[SystemSettingsService] Error getting current settings:', error);
      throw new Error('Failed to get system settings');
    }
  }

  /**
   * Обновить системные настройки
   */
  static async updateSettings(
    updateData: SystemSettingsUpdateDto,
    userId: Types.ObjectId
  ): Promise<SystemSettingsResponse> {
    try {
      const prev = await SystemSettings.findOne().sort({ updatedAt: -1 });
      const registrationIpBlacklist = normalizeIpEntries(
        updateData.registrationIpBlacklist ?? prev?.registrationIpBlacklist ?? []
      );
      const registrationBlockedCountryCodes = normalizeCountryCodes(
        updateData.registrationBlockedCountryCodes ?? prev?.registrationBlockedCountryCodes ?? []
      );

      await new SystemSettings({
        registrationsEnabled: updateData.registrationsEnabled,
        updatedBy: userId,
        reason: updateData.reason,
        registrationIpBlacklist,
        registrationBlockedCountryCodes
      }).save();

      logger.info('[SystemSettingsService] System settings updated', {
        registrationsEnabled: updateData.registrationsEnabled,
        updatedBy: userId.toString(),
        reason: updateData.reason,
        timestamp: new Date().toISOString()
      });

      return await this.getCurrentSettings();
    } catch (error) {
      logger.error('[SystemSettingsService] Error updating system settings:', error);
      throw new Error('Failed to update system settings');
    }
  }

  /**
   * Переключить статус регистраций
   */
  static async toggleRegistrations(
    enabled: boolean,
    userId: Types.ObjectId,
    reason: string,
    overrides?: { registrationIpBlacklist?: string[]; registrationBlockedCountryCodes?: string[] }
  ): Promise<SystemSettingsResponse> {
    const prev = await SystemSettings.findOne().sort({ updatedAt: -1 });
    const registrationIpBlacklist = normalizeIpEntries(
      overrides?.registrationIpBlacklist ?? prev?.registrationIpBlacklist ?? []
    );
    const registrationBlockedCountryCodes = normalizeCountryCodes(
      overrides?.registrationBlockedCountryCodes ?? prev?.registrationBlockedCountryCodes ?? []
    );
    await SystemSettings.toggleRegistrations(enabled, userId, reason, {
      registrationIpBlacklist,
      registrationBlockedCountryCodes
    });
    return await this.getCurrentSettings();
  }

  /**
   * Проверить, включены ли регистрации
   */
  static async areRegistrationsEnabled(): Promise<boolean> {
    try {
      const settings = await SystemSettings.getCurrentSettings();
      return settings.registrationsEnabled;
    } catch (error) {
      logger.error('[SystemSettingsService] Error checking registration status:', error);
      // В случае ошибки разрешаем регистрации по умолчанию
      return true;
    }
  }

  /**
   * Получить историю изменений настроек
   */
  static async getSettingsHistory(limit: number = 10): Promise<ISystemSettings[]> {
    try {
      return await SystemSettings.find()
        .sort({ updatedAt: -1 })
        .limit(limit)
        .populate('updatedBy', 'firstName lastName email');
    } catch (error) {
      logger.error('[SystemSettingsService] Error getting settings history:', error);
      throw new Error('Failed to get settings history');
    }
  }
}

export default SystemSettingsService;
