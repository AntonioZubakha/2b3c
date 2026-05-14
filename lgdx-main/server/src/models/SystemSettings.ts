import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISystemSettings extends Document {
  registrationsEnabled: boolean;
  /** Single IPs or CIDR ranges; registration attempts from these addresses are rejected */
  registrationIpBlacklist: string[];
  /** ISO 3166-1 alpha-2; registration rejected if phone number maps to one of these */
  registrationBlockedCountryCodes: string[];
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  reason: string;
  createdAt: Date;
}

export interface ISystemSettingsModel extends Model<ISystemSettings> {
  getCurrentSettings(): Promise<ISystemSettings>;
  toggleRegistrations(
    enabled: boolean,
    userId: mongoose.Types.ObjectId,
    reason: string,
    overrides?: { registrationIpBlacklist?: string[]; registrationBlockedCountryCodes?: string[] }
  ): Promise<ISystemSettings>;
}

const SystemSettingsSchema = new Schema<ISystemSettings>({
  registrationsEnabled: {
    type: Boolean,
    default: true,
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  registrationIpBlacklist: {
    type: [String],
    default: () => []
  },
  registrationBlockedCountryCodes: {
    type: [String],
    default: () => []
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  }
});

// Индексы для быстрого поиска
SystemSettingsSchema.index({ registrationsEnabled: 1 });
SystemSettingsSchema.index({ updatedAt: -1 });

// Виртуальное поле для статуса
SystemSettingsSchema.virtual('status').get(function() {
  return this.registrationsEnabled ? 'enabled' : 'disabled';
});

// Метод для получения текущих настроек
SystemSettingsSchema.statics.getCurrentSettings = async function() {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  if (!settings) {
    // Создаем настройки по умолчанию если их нет
    const defaultSettings = new this({
      registrationsEnabled: true,
      registrationIpBlacklist: [],
      registrationBlockedCountryCodes: [],
      updatedBy: undefined, // Не устанавливаем пользователя для дефолтных настроек
      reason: 'Default settings created'
    });
    return await defaultSettings.save();
  }
  return settings;
};

// Метод для переключения регистраций (новая запись в истории; копирует списки с предыдущей)
SystemSettingsSchema.statics.toggleRegistrations = async function(
  enabled: boolean,
  userId: mongoose.Types.ObjectId,
  reason: string,
  overrides?: { registrationIpBlacklist?: string[]; registrationBlockedCountryCodes?: string[] }
) {
  const prev = await this.findOne().sort({ updatedAt: -1 });
  const registrationIpBlacklist =
    overrides?.registrationIpBlacklist ?? prev?.registrationIpBlacklist ?? [];
  const registrationBlockedCountryCodes =
    overrides?.registrationBlockedCountryCodes ?? prev?.registrationBlockedCountryCodes ?? [];
  const settings = new this({
    registrationsEnabled: enabled,
    updatedBy: userId,
    reason: reason || `Registrations ${enabled ? 'enabled' : 'disabled'}`,
    registrationIpBlacklist,
    registrationBlockedCountryCodes
  });
  return await settings.save();
};

export const SystemSettings = mongoose.model<ISystemSettings, ISystemSettingsModel>('SystemSettings', SystemSettingsSchema);
export default SystemSettings;
