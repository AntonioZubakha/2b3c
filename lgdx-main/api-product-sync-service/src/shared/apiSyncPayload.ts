/**
 * RabbitMQ api_sync_tasks message shape and validation (shared by worker and tests).
 */

export interface ApiSyncTaskPayload {
  configId: string;
  companyId: string;
  companyName: string;
}

function isValidMongoObjectIdString(s: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(s);
}

/** Validates queue JSON: required fields and 24-char hex ObjectIds (Mongoose _id format). */
export function parseApiSyncTaskPayload(raw: unknown): ApiSyncTaskPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const configId = o.configId;
  const companyId = o.companyId;
  if (typeof configId !== 'string' || typeof companyId !== 'string') return null;
  const cid = configId.trim();
  const coId = companyId.trim();
  if (!cid || !coId) return null;
  if (!isValidMongoObjectIdString(cid) || !isValidMongoObjectIdString(coId)) return null;
  const companyName = o.companyName;
  return {
    configId: cid,
    companyId: coId,
    companyName:
      typeof companyName === 'string' && companyName.trim() ? companyName.trim() : 'Unknown',
  };
}
