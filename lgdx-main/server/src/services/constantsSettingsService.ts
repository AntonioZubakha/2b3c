import { Types } from 'mongoose';
import ConstantsSettings, { IConstantsSettings } from '../models/ConstantsSettings';
import { logger } from '../utils/logger';

export interface ConstantsSettingsResponse extends Omit<IConstantsSettings, 'updatedBy' | 'toObject'> {
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | undefined;
}

let cached: ConstantsSettingsResponse | null = null;

export class ConstantsSettingsService {
  static async getCurrentSettings(): Promise<ConstantsSettingsResponse> {
    const settings = await ConstantsSettings.getCurrentSettings();
    let userInfo = undefined as ConstantsSettingsResponse['updatedBy'];
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
    const plain = settings.toObject();
    const result = { ...plain, updatedBy: userInfo } as ConstantsSettingsResponse;
    cached = result;
    return result;
  }

  /** Returns cached settings if available (for use in hot paths). Call getCurrentSettings() at least once to populate. */
  static getCached(): ConstantsSettingsResponse | null {
    return cached;
  }

  static async getSettingsOrCached(): Promise<ConstantsSettingsResponse> {
    if (cached) return cached;
    return await this.getCurrentSettings();
  }

  static async updateSettings(
    data: Partial<IConstantsSettings>,
    userId: Types.ObjectId,
    reason: string
  ): Promise<ConstantsSettingsResponse> {
    try {
      await ConstantsSettings.updateSettings(data, userId, reason);
      logger.info('[ConstantsSettingsService] settings updated', { userId: userId.toString(), reason });
      cached = null;
      return await this.getCurrentSettings();
    } catch (e) {
      logger.error('[ConstantsSettingsService] update failed', { error: e });
      throw new Error('Failed to update constants settings');
    }
  }
}

export default ConstantsSettingsService;
