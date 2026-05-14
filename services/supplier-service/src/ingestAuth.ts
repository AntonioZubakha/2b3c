import type { FastifyReply, FastifyRequest } from 'fastify';
import { canRunSupplierIngest, catalogSupplierIdForCompany, isSupplierRole } from '@stonee/shared-types';

const TOKEN = process.env.SUPPLIER_INGEST_TOKEN;

/**
 * Staff-only: staff-driven ingest with explicit supplierId, and Diamond Atelier bulk sync controls.
 * When SUPPLIER_INGEST_TOKEN is set, staff must also send x-stonee-ingest-token.
 */
export function assertStaffIngestAllowed(request: FastifyRequest, reply: FastifyReply): boolean {
  const role = request.headers['x-user-role'] as string | undefined;
  if (!canRunSupplierIngest(role)) {
    reply.code(403).send({
      success: false,
      error: 'Only Stonee operations staff may run this ingestion',
    });
    return false;
  }
  if (TOKEN) {
    const got = request.headers['x-stonee-ingest-token'];
    if (got !== TOKEN) {
      reply.code(401).send({ success: false, error: 'Invalid or missing x-stonee-ingest-token' });
      return false;
    }
  }
  return true;
}

/** Logged-in supplier: JWT verified; catalog owner is the supplier company (not the user). */
export function assertSupplierSelfIngest(request: FastifyRequest, reply: FastifyReply): boolean {
  const role = request.headers['x-user-role'] as string | undefined;
  if (!isSupplierRole(role)) {
    reply.code(403).send({
      success: false,
      error: 'This endpoint is for supplier accounts only',
    });
    return false;
  }
  const companyId = request.headers['x-supplier-company-id'] as string | undefined;
  if (!companyId || String(companyId).trim() === '') {
    reply.code(401).send({ success: false, error: 'Missing supplier company scope' });
    return false;
  }
  return true;
}

export function trustedSupplierCatalogId(request: FastifyRequest): string | null {
  const companyId = request.headers['x-supplier-company-id'] as string | undefined;
  if (!companyId) return null;
  return catalogSupplierIdForCompany(companyId);
}

/**
 * Supplier JWT is scoped to a company; only that env-bound company (or legacy user id) may use DA bulk sync UI/API.
 * Does not check role — call only after supplier auth or alongside assertSupplierSelfIngest.
 */
export function supplierMayUseDiamondAtelierEnvBinding(request: FastifyRequest): boolean {
  const userId = request.headers['x-user-id'] as string | undefined;
  const companyHeader = (request.headers['x-supplier-company-id'] as string | undefined)?.trim() || '';
  const allowedCompany = process.env.DIAMOND_ATELIER_SUPPLIER_COMPANY_ID?.trim() || '';
  const legacyUser = process.env.DIAMOND_ATELIER_SUPPLIER_USER_ID?.trim() || '';
  if (allowedCompany && companyHeader === allowedCompany) return true;
  if (legacyUser && userId === legacyUser) return true;
  return false;
}

/** Stonee staff (with optional ingest token) OR a supplier user acting for the configured DA company. */
export function assertDiamondAtelierSyncAllowed(request: FastifyRequest, reply: FastifyReply): boolean {
  const role = request.headers['x-user-role'] as string | undefined;

  if (canRunSupplierIngest(role)) {
    return assertStaffIngestAllowed(request, reply);
  }
  if (isSupplierRole(role)) {
    if (!assertSupplierSelfIngest(request, reply)) return false;
    if (supplierMayUseDiamondAtelierEnvBinding(request)) return true;
  }

  reply.code(403).send({
    success: false,
    error:
      'Not allowed to run Diamond Atelier sync (staff, or supplier for DIAMOND_ATELIER_SUPPLIER_COMPANY_ID / legacy user id)',
  });
  return false;
}
