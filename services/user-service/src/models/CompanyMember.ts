import mongoose, { Document, Schema, Types } from 'mongoose';
import type { SupplierCompanyMemberRole } from '@stonee/shared-types';

export interface ICompanyMember extends Document {
  _id: Types.ObjectId;
  company: Types.ObjectId;
  user: Types.ObjectId;
  role: SupplierCompanyMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyMemberSchema = new Schema<ICompanyMember>(
  {
    company: { type: Schema.Types.ObjectId, ref: 'SupplierCompany', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['owner', 'member'], required: true },
  },
  { timestamps: true, collection: 'supplier_company_members' },
);

CompanyMemberSchema.index({ company: 1, user: 1 }, { unique: true });

export default mongoose.model<ICompanyMember>('SupplierCompanyMember', CompanyMemberSchema);
