import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

type JwtPayload = {
  id?: unknown;
  role?: unknown;
  supplierCompanyIds?: unknown;
};

/**
 * Defense in depth: derive identity only from a verified Bearer token.
 * Overwrites any client-supplied x-user-id / x-user-role headers (same secret as user-service + gateway).
 * For suppliers, resolves `x-supplier-company-id` from JWT membership (optional client hint must be in-list).
 */
export async function verifyBearerJwt(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authz = request.headers.authorization;
  if (!authz?.startsWith('Bearer ')) {
    return void reply.code(401).send({ success: false, error: 'Missing Authorization bearer token' });
  }
  const raw = authz.slice(7).trim();
  if (!raw) {
    return void reply.code(401).send({ success: false, error: 'Missing Authorization bearer token' });
  }
  try {
    const payload = jwt.verify(raw, JWT_SECRET) as JwtPayload;
    const id = payload.id != null ? String(payload.id) : '';
    const role = payload.role != null ? String(payload.role) : '';
    if (!id || !role) {
      return void reply.code(401).send({ success: false, error: 'Invalid token payload' });
    }
    request.headers['x-user-id'] = id;
    request.headers['x-user-role'] = role;

    if (role === 'supplier') {
      const rawIds = payload.supplierCompanyIds;
      const ids = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        return void reply.code(403).send({
          success: false,
          error: 'Supplier token missing company scope — sign in again after company onboarding',
        });
      }
      const fromClient = request.headers['x-supplier-company-id'];
      const headerStr = typeof fromClient === 'string' && fromClient.trim() ? fromClient.trim() : '';
      const chosen = headerStr && ids.includes(headerStr) ? headerStr : ids[0];
      request.headers['x-supplier-company-id'] = chosen;
    } else {
      delete request.headers['x-supplier-company-id'];
    }
  } catch {
    return void reply.code(401).send({ success: false, error: 'Invalid or expired token' });
  }
}
