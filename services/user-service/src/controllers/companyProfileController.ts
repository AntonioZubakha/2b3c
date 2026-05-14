import { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import CompanyMember from '../models/CompanyMember.js';
import { assertOwnerMembership } from '../services/supplierCompanyService.js';

function assertMember(userId: string, companyId: mongoose.Types.ObjectId) {
  return CompanyMember.findOne({ user: new mongoose.Types.ObjectId(userId), company: companyId }).lean();
}

export const getCompanyProfile = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.headers['x-user-id'] as string | undefined;
  const role = request.headers['x-user-role'] as string | undefined;
  if (!userId || role !== 'supplier') {
    return reply.status(401).send({ error: 'Supplier authentication required' });
  }
  const { companyId } = request.params as { companyId: string };
  if (!mongoose.isValidObjectId(companyId)) {
    return reply.status(400).send({ error: 'Invalid company id' });
  }
  const cid = new mongoose.Types.ObjectId(companyId);
  const m = await assertMember(userId, cid);
  if (!m) return reply.status(403).send({ error: 'Not a member of this company' });

  const doc = await Company.findById(cid).lean();
  if (!doc) return reply.status(404).send({ error: 'Company not found' });

  return {
    success: true,
    data: {
      id: String(doc._id),
      name: doc.name,
      supplierCategory: doc.supplierCategory,
      status: doc.status,
      contactEmail: doc.contactEmail ?? '',
      phone: doc.phone ?? '',
      description: doc.description ?? '',
      addressLine1: doc.addressLine1 ?? '',
      addressLine2: doc.addressLine2 ?? '',
      city: doc.city ?? '',
      country: doc.country ?? '',
      postalCode: doc.postalCode ?? '',
      role: m.role,
    },
  };
};

export const patchCompanyProfile = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.headers['x-user-id'] as string | undefined;
  const role = request.headers['x-user-role'] as string | undefined;
  if (!userId || role !== 'supplier') {
    return reply.status(401).send({ error: 'Supplier authentication required' });
  }
  const { companyId } = request.params as { companyId: string };
  if (!mongoose.isValidObjectId(companyId)) {
    return reply.status(400).send({ error: 'Invalid company id' });
  }
  const cid = new mongoose.Types.ObjectId(companyId);
  const ownerOk = await assertOwnerMembership(new mongoose.Types.ObjectId(userId), cid);
  if (!ownerOk) return reply.status(403).send({ error: 'Only the company owner can edit profile' });

  const body = request.body as Record<string, unknown>;
  const allowed = [
    'name',
    'contactEmail',
    'phone',
    'description',
    'addressLine1',
    'addressLine2',
    'city',
    'country',
    'postalCode',
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      if (k === 'name') {
        const n = String(body[k] ?? '').trim();
        if (n.length < 2) return reply.status(400).send({ error: 'name must be at least 2 characters' });
        update[k] = n;
      } else {
        update[k] = typeof body[k] === 'string' ? String(body[k]).trim().slice(0, 2000) : body[k];
      }
    }
  }
  if (Object.keys(update).length === 0) {
    return reply.status(400).send({ error: 'No valid fields to update' });
  }

  try {
    const doc = await Company.findByIdAndUpdate(cid, { $set: update }, { new: true }).lean();
    if (!doc) return reply.status(404).send({ error: 'Company not found' });
    return {
      success: true,
      data: {
        id: String(doc._id),
        name: doc.name,
        supplierCategory: doc.supplierCategory,
        status: doc.status,
        contactEmail: doc.contactEmail ?? '',
        phone: doc.phone ?? '',
        description: doc.description ?? '',
        addressLine1: doc.addressLine1 ?? '',
        addressLine2: doc.addressLine2 ?? '',
        city: doc.city ?? '',
        country: doc.country ?? '',
        postalCode: doc.postalCode ?? '',
      },
    };
  } catch (e: unknown) {
    if ((e as { code?: number }).code === 11000) {
      return reply.status(409).send({ error: 'Company name already taken' });
    }
    return reply.status(500).send({ error: 'Update failed' });
  }
};
