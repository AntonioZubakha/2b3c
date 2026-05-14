import type { FastifyBaseLogger } from 'fastify';
import axios from 'axios';
import { isStoneeStaffRole, isSupplierRole, type KycStatus, type UserRole } from '@stonee/shared-types';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3000';
const INTERNAL = process.env.STONEE_INTERNAL_SECRET || '';
const KYC_MIN_USD = Number.parseFloat(process.env.STONEE_KYC_ENFORCE_MIN_USD || '0');

type KycPayload = { role: UserRole; kycStatus: KycStatus };

export async function fetchUserKyc(log: FastifyBaseLogger, userId: string): Promise<KycPayload | null> {
  if (!INTERNAL) {
    log.warn('STONEE_INTERNAL_SECRET unset — skipping KYC fetch');
    return null;
  }
  try {
    const res = await axios.get<{ role: UserRole; kycStatus: KycStatus }>(
      `${USER_SERVICE_URL}/internal/kyc/${encodeURIComponent(userId)}`,
      { headers: { 'x-stonee-internal': INTERNAL }, timeout: 8_000 }
    );
    return res.data;
  } catch (err) {
    log.error({ err, userId }, 'KYC lookup failed');
    return null;
  }
}

/**
 * When STONEE_KYC_ENFORCE_MIN_USD > 0, block buyers with orders >= threshold unless verified.
 * Staff/supplier always pass. If user-service unreachable and secret set — fail closed (503).
 */
export async function assertKycForHighTicketOrder(
  log: FastifyBaseLogger,
  userId: string,
  orderTotalUsd: number
): Promise<void> {
  if (KYC_MIN_USD <= 0 || orderTotalUsd < KYC_MIN_USD) return;
  if (!INTERNAL) {
    log.warn({ userId, orderTotalUsd }, 'KYC min set but STONEE_INTERNAL_SECRET missing — allow checkout (misconfig)');
    return;
  }

  const kyc = await fetchUserKyc(log, userId);
  if (!kyc) {
    const err = new Error('KYC service unavailable') as Error & { statusCode?: number; code?: string };
    err.statusCode = 503;
    err.code = 'kyc_unavailable';
    throw err;
  }

  if (isStoneeStaffRole(kyc.role) || isSupplierRole(kyc.role)) return;

  if (kyc.kycStatus === 'verified') return;

  const err = new Error('KYC verification required before checkout for this order amount.') as Error & {
    statusCode?: number;
    code?: string;
  };
  err.statusCode = 403;
  err.code = 'kyc_required';
  throw err;
}
