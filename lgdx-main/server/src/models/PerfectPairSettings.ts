import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPerfectPairStageConfig {
  caratTolerancePct: number; // e.g., 1, 2, 3, 5
  clarityStepsAllowed: number; // 0..2
  cutMaxDowngrade: number; // 0..2
  polishMaxDowngrade: number; // 0..2
  symmetryMaxDowngrade: number; // 0..2
  maxCandidatesPerStage: number; // e.g., 50
}

export interface IPerfectPairWeightsConfig {
  carat: number;
  clarity: number;
  cut: number;
  polish: number;
  symmetry: number;
  bonusFullGia: number;
  pricePenaltyK: number; // 6..8 typical
}

export interface IPerfectPairSettings extends Document {
  enableProgressiveRelaxation: boolean;
  maxStage: number; // 1..4
  stages: IPerfectPairStageConfig[];
  weights: IPerfectPairWeightsConfig;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  reason: string;
  createdAt: Date;
}

export interface IPerfectPairSettingsModel extends Model<IPerfectPairSettings> {
  getCurrentSettings(): Promise<IPerfectPairSettings>;
  updateSettings(data: Partial<IPerfectPairSettings>, userId: mongoose.Types.ObjectId, reason: string): Promise<IPerfectPairSettings>;
}

const StageSchema = new Schema<IPerfectPairStageConfig>({
  caratTolerancePct: { type: Number, required: true, min: 0, max: 5 },
  clarityStepsAllowed: { type: Number, required: true, min: 0, max: 2 },
  cutMaxDowngrade: { type: Number, required: true, min: 0, max: 2 },
  polishMaxDowngrade: { type: Number, required: true, min: 0, max: 2 },
  symmetryMaxDowngrade: { type: Number, required: true, min: 0, max: 2 },
  maxCandidatesPerStage: { type: Number, required: true, min: 1, max: 200 }
}, { _id: false });

const WeightsSchema = new Schema<IPerfectPairWeightsConfig>({
  carat: { type: Number, required: true, min: 0, max: 100 },
  clarity: { type: Number, required: true, min: 0, max: 100 },
  cut: { type: Number, required: true, min: 0, max: 100 },
  polish: { type: Number, required: true, min: 0, max: 100 },
  symmetry: { type: Number, required: true, min: 0, max: 100 },
  bonusFullGia: { type: Number, required: true, min: 0, max: 100 },
  pricePenaltyK: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const PerfectPairSettingsSchema = new Schema<IPerfectPairSettings>({
  enableProgressiveRelaxation: { type: Boolean, required: true, default: true },
  maxStage: { type: Number, required: true, min: 1, max: 4, default: 4 },
  stages: { type: [StageSchema], required: true },
  weights: { type: WeightsSchema, required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: Date, required: true, default: Date.now }
});

PerfectPairSettingsSchema.statics.getCurrentSettings = async function () {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  if (settings) return settings;
  const defaults: IPerfectPairSettings = new this({
    enableProgressiveRelaxation: true,
    maxStage: 4,
    stages: [
      { caratTolerancePct: 1, clarityStepsAllowed: 0, cutMaxDowngrade: 0, polishMaxDowngrade: 0, symmetryMaxDowngrade: 0, maxCandidatesPerStage: 50 },
      { caratTolerancePct: 2, clarityStepsAllowed: 1, cutMaxDowngrade: 1, polishMaxDowngrade: 1, symmetryMaxDowngrade: 1, maxCandidatesPerStage: 50 },
      { caratTolerancePct: 3, clarityStepsAllowed: 2, cutMaxDowngrade: 2, polishMaxDowngrade: 1, symmetryMaxDowngrade: 1, maxCandidatesPerStage: 50 },
      { caratTolerancePct: 5, clarityStepsAllowed: 2, cutMaxDowngrade: 2, polishMaxDowngrade: 2, symmetryMaxDowngrade: 2, maxCandidatesPerStage: 50 }
    ],
    weights: { carat: 35, clarity: 20, cut: 15, polish: 10, symmetry: 10, bonusFullGia: 10, pricePenaltyK: 7 },
    reason: 'Default Perfect Pair settings created'
  });
  return await defaults.save();
};

PerfectPairSettingsSchema.statics.updateSettings = async function (
  data: Partial<IPerfectPairSettings>, userId: mongoose.Types.ObjectId, reason: string
) {
  const payload: Partial<IPerfectPairSettings> = {
    ...data,
    updatedBy: userId,
    updatedAt: new Date(),
    reason: reason || 'Perfect Pair settings updated'
  } as any;
  const settings = new this(payload);
  return await settings.save();
};

export const PerfectPairSettings = mongoose.model<IPerfectPairSettings, IPerfectPairSettingsModel>('PerfectPairSettings', PerfectPairSettingsSchema);
export default PerfectPairSettings;


