import mongoose from 'mongoose';
import type { SupplierCategory } from '@stonee/shared-types';
import Company from '../models/Company.js';
import CompanyMember from '../models/CompanyMember.js';
import type { ISupplierCompanySummary } from '@stonee/shared-types';

const CATEGORIES: SupplierCategory[] = [
  'lab_grown_diamond',
  'natural_diamond',
  'colored_stone',
  'precious_metal',
  'mounting',
  'finished_jewelry',
  'general',
];

function normalizeCategory(raw: unknown): SupplierCategory {
  return typeof raw === 'string' && CATEGORIES.includes(raw as SupplierCategory)
    ? (raw as SupplierCategory)
    : 'general';
}

/**
 * Legacy suppliers (created before companies existed) get a one-off company on login.
 */
export async function ensureLegacySupplierCompany(
  userId: mongoose.Types.ObjectId,
  supplierCategory: SupplierCategory | undefined,
  email: string,
  name?: string,
): Promise<void> {
  const existing = await CompanyMember.findOne({ user: userId });
  if (existing) return;

  const base = (name || email.split('@')[0] || 'supplier')
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .trim()
    .slice(0, 60);
  const uniqueName = `${base || 'supplier'} — ${userId.toString()}`;

  const company = await Company.create({
    name: uniqueName,
    supplierCategory: normalizeCategory(supplierCategory),
    status: 'active',
  });
  await CompanyMember.create({
    company: company._id,
    user: userId,
    role: 'owner',
  });
}

export async function listSupplierCompanyIds(userId: mongoose.Types.ObjectId): Promise<string[]> {
  const rows = await CompanyMember.find({ user: userId }).select('company').lean();
  return rows.map(r => String(r.company));
}

export async function listSupplierCompanySummaries(
  userId: mongoose.Types.ObjectId,
): Promise<ISupplierCompanySummary[]> {
  const rows = await CompanyMember.find({ user: userId })
    .populate<{ company: { _id: mongoose.Types.ObjectId; name: string; supplierCategory?: SupplierCategory } }>(
      'company',
      'name supplierCategory',
    )
    .lean();
  const out: ISupplierCompanySummary[] = [];
  for (const r of rows) {
    const c = r.company;
    if (!c || typeof c !== 'object' || !('name' in c) || !c.name) continue;
    out.push({
      id: String(c._id),
      name: c.name,
      role: r.role,
      supplierCategory: c.supplierCategory,
    });
  }
  return out;
}

export async function assertOwnerMembership(
  userId: mongoose.Types.ObjectId,
  companyId: mongoose.Types.ObjectId,
): Promise<boolean> {
  const m = await CompanyMember.findOne({ user: userId, company: companyId, role: 'owner' });
  return Boolean(m);
}

export async function getCompanyCategory(companyId: mongoose.Types.ObjectId): Promise<SupplierCategory | undefined> {
  const c = await Company.findById(companyId).select('supplierCategory').lean();
  return c?.supplierCategory;
}
