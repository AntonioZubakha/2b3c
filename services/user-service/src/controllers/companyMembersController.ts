import { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import CompanyMember from '../models/CompanyMember.js';
import {
  assertOwnerMembership,
  getCompanyCategory,
  listSupplierCompanySummaries,
} from '../services/supplierCompanyService.js';
import type { SupplierCategory } from '@stonee/shared-types';

/**
 * Owner adds another supplier user to the same company (B2B multi-user).
 * Expects gateway-injected `x-user-id` / `x-user-role` (same pattern as `/auth/me`).
 */
export const addCompanyMember = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.headers['x-user-id'] as string | undefined;
  const role = request.headers['x-user-role'] as string | undefined;
  if (!userId || role !== 'supplier') {
    return reply.status(401).send({ error: 'Supplier authentication required' });
  }

  const { companyId } = request.params as { companyId: string };
  if (!mongoose.isValidObjectId(companyId)) {
    return reply.status(400).send({ error: 'Invalid company id' });
  }
  const companyOid = new mongoose.Types.ObjectId(companyId);
  const ownerOid = new mongoose.Types.ObjectId(userId);

  const ok = await assertOwnerMembership(ownerOid, companyOid);
  if (!ok) {
    return reply.status(403).send({ error: 'Only the company owner can invite members' });
  }

  const { email, password, name } = request.body as { email?: string; password?: string; name?: string };
  if (!email || !password) {
    return reply.status(400).send({ error: 'email and password required' });
  }

  const emailNorm = email.trim().toLowerCase();
  const existing = await User.findOne({ email: emailNorm });
  if (existing) {
    return reply.status(409).send({ error: 'User with this email already exists' });
  }

  const category = (await getCompanyCategory(companyOid)) ?? 'general';
  const passwordHash = await bcrypt.hash(password, 10);

  let createdUser: InstanceType<typeof User> | null = null;
  try {
    createdUser = await User.create({
      email: emailNorm,
      passwordHash,
      role: 'supplier',
      name: name?.trim(),
      supplierCategory: category as SupplierCategory,
      kycStatus: 'not_required',
    });
    await CompanyMember.create({
      company: companyOid,
      user: createdUser._id,
      role: 'member',
    });
  } catch (err: unknown) {
    if (createdUser?._id) {
      await User.deleteOne({ _id: createdUser._id });
    }
    const e = err as { code?: number };
    if (e?.code === 11000) {
      return reply.status(409).send({ error: 'Duplicate key' });
    }
    return reply.status(500).send({ error: 'Failed to create member' });
  }

  const supplierCompanies = await listSupplierCompanySummaries(createdUser._id);
  return reply.status(201).send({
    success: true,
    id: createdUser._id,
    email: createdUser.email,
    role: 'supplier',
    name: createdUser.name,
    supplierCategory: category,
    supplierCompanies,
  });
};
