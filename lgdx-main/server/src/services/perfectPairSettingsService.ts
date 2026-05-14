import { Types } from 'mongoose';
import PerfectPairSettings, { IPerfectPairSettings } from '../models/PerfectPairSettings';
import { logger } from '../utils/logger';

export interface PerfectPairSettingsResponse extends Omit<IPerfectPairSettings, 'updatedBy' | 'toObject'> {
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | undefined;
}

export class PerfectPairSettingsService {
  static async getCurrentSettings(): Promise<PerfectPairSettingsResponse> {
    const settings = await PerfectPairSettings.getCurrentSettings();

    let userInfo = undefined as PerfectPairSettingsResponse['updatedBy'];
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
    return { ...plain, updatedBy: userInfo } as PerfectPairSettingsResponse;
  }

  static async updateSettings(
    data: Partial<IPerfectPairSettings>,
    userId: Types.ObjectId,
    reason: string
  ): Promise<PerfectPairSettingsResponse> {
    try {
      const updated = await PerfectPairSettings.updateSettings(data, userId, reason);
      logger.info('[PerfectPairSettingsService] settings updated', {
        userId: userId.toString(),
        reason,
        at: new Date().toISOString()
      });
      return await this.getCurrentSettings();
    } catch (e) {
      logger.error('[PerfectPairSettingsService] update failed', { error: e });
      throw new Error('Failed to update Perfect Pair settings');
    }
  }
}

export default PerfectPairSettingsService;


