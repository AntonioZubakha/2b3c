import mongoose, { Document, Schema } from 'mongoose';

export interface IChatAiSettings extends Document {
  _id: mongoose.Types.ObjectId;
  /** When true, AI can reply in sessions that have aiEnabled true */
  globalEnabled: boolean;
  updatedAt: Date;
}

const ChatAiSettingsSchema = new Schema<IChatAiSettings>(
  {
    globalEnabled: {
      type: Boolean,
      default: true,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'chataisettings'
  }
);

// Single document: use findOneAndUpdate with upsert
export default mongoose.model<IChatAiSettings>('ChatAiSettings', ChatAiSettingsSchema);
