import mongoose, { Document, Schema } from 'mongoose';
import { IUser, KycStatus, UserRole } from '@stonee/shared-types';

const KYC_STATUS_VALUES: KycStatus[] = ['not_required', 'pending', 'verified', 'rejected'];

export interface IUserDocument extends Omit<IUser, 'id'>, Document {}

const ROLE_VALUES: UserRole[] = [
  'buyer',
  'supplier',
  'stonee',
  'stonee_admin',
  'stonee_supervisor',
  'stonee_manager',
];

const SUPPLIER_CATEGORY_VALUES = [
  'lab_grown_diamond',
  'natural_diamond',
  'colored_stone',
  'precious_metal',
  'mounting',
  'finished_jewelry',
  'general',
] as const;

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLE_VALUES, required: true },
    name: { type: String },
    supplierCategory: {
      type: String,
      enum: SUPPLIER_CATEGORY_VALUES,
      required: false,
    },
    kycStatus: {
      type: String,
      enum: KYC_STATUS_VALUES,
      default: 'not_required',
    },
  },
  { timestamps: true }
);

const User = mongoose.model<IUserDocument>('User', UserSchema);
export default User;
