import mongoose, { Schema } from 'mongoose';

export type FeedSyncStatus = 'running' | 'ok' | 'error';

export interface IFeedSyncState {
  source: string;
  lastStartedAt?: Date;
  lastFinishedAt?: Date;
  lastStatus: FeedSyncStatus;
  lastRecordCount: number;
  lastPages: number;
  lastError?: string;
  lastRequestUrlMasked?: string;
}

const FeedSyncStateSchema = new Schema<IFeedSyncState>(
  {
    source: { type: String, required: true, unique: true },
    lastStartedAt: { type: Date },
    lastFinishedAt: { type: Date },
    lastStatus: { type: String, enum: ['running', 'ok', 'error'], default: 'ok' },
    lastRecordCount: { type: Number, default: 0 },
    lastPages: { type: Number, default: 0 },
    lastError: { type: String },
    lastRequestUrlMasked: { type: String },
  },
  { timestamps: true },
);

const FeedSyncStateModel =
  (mongoose.models.FeedSyncState as mongoose.Model<IFeedSyncState>) ||
  mongoose.model<IFeedSyncState>('FeedSyncState', FeedSyncStateSchema);

export default FeedSyncStateModel;
