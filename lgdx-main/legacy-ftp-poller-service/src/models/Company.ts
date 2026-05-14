import mongoose, { Schema, Document } from 'mongoose';

export interface LegacyFtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  remoteDir: string;
  pollIntervalHours: number;
  lastPolledAt?: Date;
  lastFileEtag?: string;
  consecutiveErrors: number;
  lastError?: string;
}

export interface ICompany extends Document {
  name: string;
  status: string;
  apiConfig?: mongoose.Types.ObjectId;
  ftpConfig?: { enabled: boolean };
  legacyFtpConfig?: LegacyFtpConfig;
}

const CompanySchema = new Schema({
  name: String,
  status: String,
  apiConfig: { type: Schema.Types.ObjectId, ref: 'CompanyApiConfig' },
  ftpConfig: {
    enabled: { type: Boolean, default: false }
  },
  legacyFtpConfig: {
    enabled: { type: Boolean, default: false },
    host: String,
    port: { type: Number, default: 21 },
    username: String,
    encryptedPassword: String,
    remoteDir: { type: String, default: '/files' },
    pollIntervalHours: { type: Number, default: 12 },
    lastPolledAt: Date,
    lastFileEtag: String,
    consecutiveErrors: { type: Number, default: 0 },
    lastError: String
  }
}, {
  collection: 'companies',
  strict: false
});

CompanySchema.index({ 'legacyFtpConfig.enabled': 1 });

const Company = mongoose.model<ICompany>('Company', CompanySchema);
export default Company;
