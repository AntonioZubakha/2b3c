import mongoose, { Document, Model, Schema } from "mongoose";

export interface IParserAliasesSettings extends Document {
  scope: "global";
  aliases: Map<string, string[]>;
  updatedAt: Date;
}

interface IParserAliasesSettingsModel extends Model<IParserAliasesSettings> {}

const ParserAliasesSettingsSchema = new Schema<IParserAliasesSettings>({
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
  updatedAt: { type: Date, required: true, default: Date.now },
});

const ParserAliasesSettings = mongoose.model<
  IParserAliasesSettings,
  IParserAliasesSettingsModel
>("ParserAliasesSettings", ParserAliasesSettingsSchema);

export default ParserAliasesSettings;
