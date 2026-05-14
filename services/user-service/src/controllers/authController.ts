import { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Company from '../models/Company.js';
import CompanyMember from '../models/CompanyMember.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SupplierCategory, UserRole } from '@stonee/shared-types';
import {
  ensureLegacySupplierCompany,
  listSupplierCompanyIds,
  listSupplierCompanySummaries,
} from '../services/supplierCompanyService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const STAFF_INVITE_CODE = process.env.STAFF_INVITE_CODE || '';
const KYC_ENFORCE_MIN_USD = Number.parseFloat(process.env.STONEE_KYC_ENFORCE_MIN_USD || '0');

const STAFF_ROLES: UserRole[] = ['stonee_admin', 'stonee_supervisor', 'stonee_manager'];

const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'lab_grown_diamond',
  'natural_diamond',
  'colored_stone',
  'precious_metal',
  'mounting',
  'finished_jewelry',
  'general',
];

type JwtBody = {
  id: string;
  role: string;
  supplierCompanyIds?: string[];
};

function signToken(body: JwtBody): string {
  return jwt.sign(body, JWT_SECRET, { expiresIn: '7d' });
}

export const register = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const {
      email,
      password,
      role,
      name,
      supplierCategory,
      companyName,
      staffInviteCode,
    } = request.body as {
      email: string;
      password: string;
      role: UserRole;
      name?: string;
      supplierCategory?: SupplierCategory;
      companyName?: string;
      staffInviteCode?: string;
    };
    if (!email || !password || !role) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    if (STAFF_ROLES.includes(role as UserRole)) {
      if (!STAFF_INVITE_CODE || staffInviteCode !== STAFF_INVITE_CODE) {
        return reply.status(403).send({
          error: 'Staff accounts require a valid staff invitation code (STAFF_INVITE_CODE on server).',
        });
      }
    }

    if (role === 'supplier') {
      const cn = typeof companyName === 'string' ? companyName.trim() : '';
      if (cn.length < 2) {
        return reply.status(400).send({ error: 'companyName is required for supplier accounts (min 2 characters)' });
      }
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return reply.status(409).send({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (role === 'supplier') {
      const cn = (companyName as string).trim();
      const cat =
        supplierCategory && SUPPLIER_CATEGORIES.includes(supplierCategory) ? supplierCategory : 'general';

      const session = await mongoose.startSession();
      type CreatedUser = {
        _id: mongoose.Types.ObjectId;
        email: string;
        role: string;
        name?: string;
        supplierCategory?: SupplierCategory;
        kycStatus?: string;
      };
      type CreatedCompany = { _id: mongoose.Types.ObjectId; name: string };

      let bundle: { user: CreatedUser; company: CreatedCompany } | null = null;
      try {
        bundle = await session.withTransaction(async () => {
          const dupCompany = await Company.findOne({ name: cn }).session(session);
          if (dupCompany) {
            throw Object.assign(new Error('Company name already taken'), { code: 'COMPANY_DUP' });
          }

          const companiesCreated = (await Company.create([{ name: cn, supplierCategory: cat, status: 'active' }], {
            session,
          })) as unknown as CreatedCompany[];
          const company = companiesCreated[0];
          if (!company) throw new Error('Company create failed');

          const usersCreated = (await User.create(
            [
              {
                email: email.trim().toLowerCase(),
                passwordHash,
                role: 'supplier',
                name,
                supplierCategory: cat,
                kycStatus: 'not_required',
              },
            ],
            { session },
          )) as unknown as CreatedUser[];
          const user = usersCreated[0];
          if (!user) throw new Error('User create failed');

          await CompanyMember.create([{ company: company._id, user: user._id, role: 'owner' }], { session });

          return { user, company };
        });
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === 'COMPANY_DUP') {
          return reply.status(409).send({ error: 'Company name already taken' });
        }
        if ((e as { code?: number }).code === 11000) {
          return reply.status(409).send({ error: 'Company name already taken' });
        }
        request.log.error({ err: e }, 'Supplier registration transaction failed');
        return reply.status(500).send({ error: 'Registration failed' });
      } finally {
        await session.endSession();
      }

      if (!bundle) {
        return reply.status(500).send({ error: 'Registration failed' });
      }
      const { user: userOut, company: companyOut } = bundle;

      return reply.status(201).send({
        id: userOut._id,
        email: userOut.email,
        role: userOut.role,
        name: userOut.name,
        supplierCategory: userOut.supplierCategory,
        kycStatus: userOut.kycStatus ?? 'not_required',
        company: { id: companyOut._id.toString(), name: companyOut.name },
        supplierCompanies: [
          { id: companyOut._id.toString(), name: companyOut.name, role: 'owner' as const, supplierCategory: cat },
        ],
      });
    }

    const doc: Record<string, unknown> = {
      email: email.trim().toLowerCase(),
      passwordHash,
      role,
      name,
    };
    if (role === 'buyer') {
      doc.kycStatus = KYC_ENFORCE_MIN_USD > 0 ? 'pending' : 'not_required';
    } else {
      doc.kycStatus = 'not_required';
    }

    const user = await User.create(doc);
    return reply.status(201).send({
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      supplierCategory: user.supplierCategory,
      kycStatus: user.kycStatus ?? 'not_required',
    });
  } catch (err) {
    request.log.error({ err }, 'Registration failed (outer catch)');
    return reply.status(500).send({ error: 'Registration failed' });
  }
};

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    let supplierCompanyIds: string[] | undefined;
    let supplierCompanies: Awaited<ReturnType<typeof listSupplierCompanySummaries>> | undefined;

    if (user.role === 'supplier') {
      await ensureLegacySupplierCompany(
        user._id,
        user.supplierCategory as SupplierCategory | undefined,
        user.email,
        user.name ?? undefined,
      );
      supplierCompanyIds = await listSupplierCompanyIds(user._id);
      supplierCompanies = await listSupplierCompanySummaries(user._id);
    }

    const jwtBody: JwtBody = {
      id: user._id.toString(),
      role: user.role,
      ...(supplierCompanyIds && supplierCompanyIds.length > 0 ? { supplierCompanyIds } : {}),
    };
    const token = signToken(jwtBody);

    return reply.send({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        supplierCategory: user.supplierCategory,
        kycStatus: user.kycStatus ?? 'not_required',
        ...(supplierCompanies ? { supplierCompanies } : {}),
      },
    });
  } catch (err) {
    return reply.status(500).send({ error: 'Login failed' });
  }
};

/** Dev / staging only: mark buyer KYC verified (until Sumsub integration). */
export const selfVerifyKyc = async (request: FastifyRequest, reply: FastifyReply) => {
  if (process.env.STONEE_ALLOW_KYC_SELF_VERIFY !== 'true') {
    return reply.status(403).send({ error: 'KYC self-verify is disabled' });
  }
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing Bearer token' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: string };
    const user = await User.findById(payload.id);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    if (user.role !== 'buyer') {
      return reply.status(403).send({ error: 'Only buyer accounts use KYC self-verify' });
    }
    user.kycStatus = 'verified';
    await user.save();
    return { success: true, data: { kycStatus: user.kycStatus } };
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
};
