import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IMarketPriceSettings extends Document {
  /** Economic: INR/USD rate impact (primary cost driver). */
  coeffInr: number;
  coeffGold: number;
  coeffOil: number;
  /** Weights for internal market price (weighted median by group). */
  weightPriceDecreased: number;
  weightPriceIncreased: number;
  weightNewProducts: number;
  weightDisappeared: number;
  weightUnchanged: number;
  /** Adaptive median: fraction to KEEP (1 - exclude expensive). Small sample ≤15. */
  medianSmallKeepPct: number;
  /** Medium sample 16–50. */
  medianMediumKeepPct: number;
  /** Large 51–100: exclude expensive / cheap fractions. */
  medianLargeExpensiveExcludePct: number;
  medianLargeCheapExcludePct: number;
  /** Very large >100. */
  medianVeryLargeExpensiveExcludePct: number;
  medianVeryLargeCheapExcludePct: number;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  reason: string;
  createdAt: Date;
}

export interface IMarketPriceSettingsModel extends Model<IMarketPriceSettings> {
  getCurrentSettings(): Promise<IMarketPriceSettings>;
  updateSettings(data: Partial<IMarketPriceSettings>, userId: mongoose.Types.ObjectId, reason: string): Promise<IMarketPriceSettings>;
}

const defaults = {
  coeffInr: 0.4,
  coeffGold: 0.06,
  coeffOil: 0.07,
  weightPriceDecreased: 1.05,
  weightPriceIncreased: 1.05,
  weightNewProducts: 1.15,
  weightDisappeared: 1.25,
  weightUnchanged: 0.9,
  medianSmallKeepPct: 0.7,       // exclude 30% expensive
  medianMediumKeepPct: 0.5,      // exclude 50%
  medianLargeExpensiveExcludePct: 0.65,
  medianLargeCheapExcludePct: 0.03,
  medianVeryLargeExpensiveExcludePct: 0.75,
  medianVeryLargeCheapExcludePct: 0.05,
};

const MarketPriceSettingsSchema = new Schema<IMarketPriceSettings>({
  coeffInr: { type: Number, required: true, min: 0, max: 1, default: defaults.coeffInr },
  coeffGold: { type: Number, required: true, min: 0, max: 0.2, default: defaults.coeffGold },
  coeffOil: { type: Number, required: true, min: 0, max: 0.2, default: defaults.coeffOil },
  weightPriceDecreased: { type: Number, required: true, min: 0.5, max: 2, default: defaults.weightPriceDecreased },
  weightPriceIncreased: { type: Number, required: true, min: 0.5, max: 2, default: defaults.weightPriceIncreased },
  weightNewProducts: { type: Number, required: true, min: 0.5, max: 2, default: defaults.weightNewProducts },
  weightDisappeared: { type: Number, required: true, min: 0.5, max: 2, default: defaults.weightDisappeared },
  weightUnchanged: { type: Number, required: true, min: 0.5, max: 2, default: defaults.weightUnchanged },
  medianSmallKeepPct: { type: Number, required: true, min: 0.5, max: 1, default: defaults.medianSmallKeepPct },
  medianMediumKeepPct: { type: Number, required: true, min: 0.2, max: 0.8, default: defaults.medianMediumKeepPct },
  medianLargeExpensiveExcludePct: { type: Number, required: true, min: 0.3, max: 0.9, default: defaults.medianLargeExpensiveExcludePct },
  medianLargeCheapExcludePct: { type: Number, required: true, min: 0, max: 0.1, default: defaults.medianLargeCheapExcludePct },
  medianVeryLargeExpensiveExcludePct: { type: Number, required: true, min: 0.5, max: 0.95, default: defaults.medianVeryLargeExpensiveExcludePct },
  medianVeryLargeCheapExcludePct: { type: Number, required: true, min: 0, max: 0.1, default: defaults.medianVeryLargeCheapExcludePct },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: Date, required: true, default: Date.now },
}, { collection: 'marketpricesettings' });

MarketPriceSettingsSchema.statics.getCurrentSettings = async function () {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  if (settings) return settings;
  const doc = new this({
    ...defaults,
    reason: 'Default market price settings created',
  });
  return await doc.save();
};

MarketPriceSettingsSchema.statics.updateSettings = async function (
  data: Partial<IMarketPriceSettings>,
  userId: mongoose.Types.ObjectId,
  reason: string
) {
  const Model = this as unknown as IMarketPriceSettingsModel;
  const current = await Model.getCurrentSettings();
  const currentPlain = current.toObject();
  const payload: Partial<IMarketPriceSettings> = {
    ...defaults,
    coeffInr: currentPlain.coeffInr,
    coeffGold: currentPlain.coeffGold,
    coeffOil: currentPlain.coeffOil,
    weightPriceDecreased: currentPlain.weightPriceDecreased,
    weightPriceIncreased: currentPlain.weightPriceIncreased,
    weightNewProducts: currentPlain.weightNewProducts,
    weightDisappeared: currentPlain.weightDisappeared,
    weightUnchanged: currentPlain.weightUnchanged,
    medianSmallKeepPct: currentPlain.medianSmallKeepPct,
    medianMediumKeepPct: currentPlain.medianMediumKeepPct,
    medianLargeExpensiveExcludePct: currentPlain.medianLargeExpensiveExcludePct,
    medianLargeCheapExcludePct: currentPlain.medianLargeCheapExcludePct,
    medianVeryLargeExpensiveExcludePct: currentPlain.medianVeryLargeExpensiveExcludePct,
    medianVeryLargeCheapExcludePct: currentPlain.medianVeryLargeCheapExcludePct,
    ...data,
    updatedBy: userId,
    updatedAt: new Date(),
    reason: reason || 'Market price settings updated',
  } as any;
  const settings = new Model(payload);
  return await settings.save();
};

export const MarketPriceSettings = mongoose.model<IMarketPriceSettings, IMarketPriceSettingsModel>(
  'MarketPriceSettings',
  MarketPriceSettingsSchema
);
export default MarketPriceSettings;
