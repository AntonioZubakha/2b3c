import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IConstantsSettings extends Document {
  /** Minimum supplier price (products below are hidden in catalog). Overrides env MIN_SUPPLIER_PRICE when set. */
  minSupplierPrice: number;
  /** Allowed variance for measurements/ratio/geometry when matching pair or alternatives (e.g. 0.025 = 2.5%). */
  measurementRatioGeometryTolerancePct: number;
  /** Carat tolerance (±) when finding alternative products in deals (e.g. 0.03). */
  alternativesCaratTolerance: number;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  reason: string;
  createdAt: Date;
}

export interface IConstantsSettingsModel extends Model<IConstantsSettings> {
  getCurrentSettings(): Promise<IConstantsSettings>;
  updateSettings(data: Partial<IConstantsSettings>, userId: mongoose.Types.ObjectId, reason: string): Promise<IConstantsSettings>;
}

const ConstantsSettingsSchema = new Schema<IConstantsSettings>({
  minSupplierPrice: { type: Number, required: true, min: 0, default: 15 },
  measurementRatioGeometryTolerancePct: { type: Number, required: true, min: 0.001, max: 0.5, default: 0.025 },
  alternativesCaratTolerance: { type: Number, required: true, min: 0.001, max: 0.5, default: 0.03 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: Date, required: true, default: Date.now }
});

ConstantsSettingsSchema.statics.getCurrentSettings = async function () {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  if (settings) return settings;
  const defaults = new this({
    minSupplierPrice: Number(process.env.MIN_SUPPLIER_PRICE) || 15,
    measurementRatioGeometryTolerancePct: 0.025,
    alternativesCaratTolerance: 0.03,
    reason: 'Default constants created'
  });
  return await defaults.save();
};

ConstantsSettingsSchema.statics.updateSettings = async function (
  data: Partial<IConstantsSettings>,
  userId: mongoose.Types.ObjectId,
  reason: string
) {
  const payload: Partial<IConstantsSettings> = {
    ...data,
    updatedBy: userId,
    updatedAt: new Date(),
    reason: reason || 'Constants updated'
  } as any;
  const settings = new this(payload);
  return await settings.save();
};

export const ConstantsSettings = mongoose.model<IConstantsSettings, IConstantsSettingsModel>('ConstantsSettings', ConstantsSettingsSchema);
export default ConstantsSettings;
