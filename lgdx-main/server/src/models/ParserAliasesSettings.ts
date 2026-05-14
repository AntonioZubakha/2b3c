import mongoose, { Document, Model, Schema } from "mongoose";

export interface IParserAliasesSettings extends Document {
  scope: "global";
  aliases: Map<string, string[]>;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  reason: string;
  createdAt: Date;
}

export interface IParserAliasesSettingsModel
  extends Model<IParserAliasesSettings> {
  getCurrentSettings(): Promise<IParserAliasesSettings>;
  updateSettings(
    aliases: Record<string, string[]>,
    userId: mongoose.Types.ObjectId,
    reason: string,
  ): Promise<IParserAliasesSettings>;
}

const ParserAliasesSettingsSchema = new Schema<
  IParserAliasesSettings,
  IParserAliasesSettingsModel
>({
  scope: {
    type: String,
    enum: ["global"],
    default: "global",
    unique: true,
    index: true,
  },
  aliases: {
    type: Map,
    of: [{ type: String, trim: true }],
    default: {},
  },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: Date, required: true, default: Date.now },
});

ParserAliasesSettingsSchema.statics.getCurrentSettings = async function () {
  const existing = await this.findOne({ scope: "global" });
  if (existing) return existing;
  const defaults = new this({
    scope: "global",
    aliases: {},
    reason: "Default parser aliases settings created",
  });
  return defaults.save();
};

ParserAliasesSettingsSchema.statics.updateSettings = async function (
  aliases: Record<string, string[]>,
  userId: mongoose.Types.ObjectId,
  reason: string,
) {
  const existing = await this.findOne({ scope: "global" });
  if (existing) {
    existing.aliases = aliases as unknown as Map<string, string[]>;
    existing.updatedBy = userId;
    existing.updatedAt = new Date();
    existing.reason = reason || "Parser aliases updated";
    await existing.save();
    return existing;
  }

  const created = new this({
    scope: "global",
    aliases,
    updatedBy: userId,
    updatedAt: new Date(),
    reason: reason || "Parser aliases updated",
  });
  return created.save();
};

const ParserAliasesSettings = mongoose.model<
  IParserAliasesSettings,
  IParserAliasesSettingsModel
>("ParserAliasesSettings", ParserAliasesSettingsSchema);

export default ParserAliasesSettings;
