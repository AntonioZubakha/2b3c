import mongoose, { Document, Schema, Types } from 'mongoose';
import type { SupplierCategory } from '@stonee/shared-types';

const SUPPLIER_CATEGORY_VALUES: SupplierCategory[] = [
  'lab_grown_diamond',
  'natural_diamond',
  'colored_stone',
  'precious_metal',
  'mounting',
  'finished_jewelry',
  'general',
];

export type SupplierCompanyStatus = 'active' | 'suspended';

export interface ICompany extends Document {
  _id: Types.ObjectId;
  name: string;
  supplierCategory: SupplierCategory;
  status: SupplierCompanyStatus;
  contactEmail?: string;
  phone?: string;
  description?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    supplierCategory: {
      type: String,
      enum: SUPPLIER_CATEGORY_VALUES,
      default: 'general',
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
    contactEmail: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'supplier_companies' },
);

export default mongoose.model<ICompany>('SupplierCompany', CompanySchema);
