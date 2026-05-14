import mongoose, { Document, Schema } from 'mongoose';

export type BotPromptBotId = 'support' | 'whatsapp';

export interface IBotPromptSnapshot extends Document {
  bot: BotPromptBotId;
  /** Filename → markdown content (same keys as support-ai-docs / whatsapp-ai-docs) */
  files: Record<string, string>;
  updatedBy?: mongoose.Types.ObjectId;
  changeNote: string;
  updatedAt: Date;
}

const BotPromptSnapshotSchema = new Schema<IBotPromptSnapshot>(
  {
    bot: {
      type: String,
      enum: ['support', 'whatsapp'],
      required: true,
      index: true,
    },
    files: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    changeNote: {
      type: String,
      required: true,
      maxlength: 500,
      default: '',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    collection: 'botpromptsnapshots',
    timestamps: false,
  }
);

BotPromptSnapshotSchema.index({ bot: 1, updatedAt: -1 });

export default mongoose.model<IBotPromptSnapshot>('BotPromptSnapshot', BotPromptSnapshotSchema);
