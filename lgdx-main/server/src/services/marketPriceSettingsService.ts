import { Types } from 'mongoose';
import MarketPriceSettings, { IMarketPriceSettings } from '../models/MarketPriceSettings';
import { logger } from '../utils/logger';

export interface MarketPriceSettingsResponse extends Omit<IMarketPriceSettings, 'updatedBy' | 'toObject'> {
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | undefined;
}

export default class MarketPriceSettingsService {
  static async getCurrentSettings(): Promise<MarketPriceSettingsResponse> {
    const settings = await MarketPriceSettings.getCurrentSettings();
    let userInfo: MarketPriceSettingsResponse['updatedBy'];
    if (settings.updatedBy) {
      const User = require('../models/User').default;
      const user = await User.findById(settings.updatedBy).select('firstName lastName email');
      if (user) {
        userInfo = {
          _id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        };
      }
    }
    const plain = settings.toObject();
    return { ...plain, updatedBy: userInfo } as MarketPriceSettingsResponse;
  }

  static async updateSettings(
    data: Partial<IMarketPriceSettings>,
    userId: Types.ObjectId,
    reason: string
  ): Promise<MarketPriceSettingsResponse> {
    await MarketPriceSettings.updateSettings(data, userId, reason);
    logger.info('[MarketPriceSettingsService] settings updated', { userId: userId.toString(), reason });
    return await this.getCurrentSettings();
  }
}
