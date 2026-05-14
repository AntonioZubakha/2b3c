/**
 * RabbitMQ file_upload_tasks message validation (file-product-import-service).
 */

export interface FileUploadTaskPayloadValidated {
  filePath: string;
  userId: string;
  companyId: string;
  /** Original company subdocument (may include full Mongoose toObject() from FTP). _id normalized to string hex. */
  companyDocPlain: Record<string, unknown>;
  companyName: string;
  originalFileName: string;
  uploadMode: 'replace' | 'add';
  source?: 'web' | 'ftp' | 'legacy_ftp';
  ftpSessionId?: string;
  uploadedAt?: string;
  fileSize?: number;
}

function isValidMongoObjectIdString(s: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(s);
}

function objectIdToHexString(v: unknown): string | null {
  if (typeof v === 'string' && isValidMongoObjectIdString(v.trim())) return v.trim();
  if (v && typeof v === 'object' && v !== null && '$oid' in (v as Record<string, unknown>)) {
    const oid = (v as { $oid?: string }).$oid;
    if (typeof oid === 'string' && isValidMongoObjectIdString(oid)) return oid;
  }
  if (v && typeof (v as { toString?: () => string }).toString === 'function') {
    const s = String((v as { toString: () => string }).toString()).trim();
    if (isValidMongoObjectIdString(s)) return s;
  }
  return null;
}

function basenameSafe(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Validates JSON from queue. Returns null if invalid (caller should nack / drop).
 * Preserves all keys on `companyDoc` for compatibility with FTP `company.toObject()`.
 */
export function parseFileUploadTaskPayload(raw: unknown): FileUploadTaskPayloadValidated | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const filePath = o.filePath;
  if (typeof filePath !== 'string' || !filePath.trim()) return null;

  const companyDoc = o.companyDoc;
  if (!companyDoc || typeof companyDoc !== 'object' || Array.isArray(companyDoc)) return null;
  const cd = { ...(companyDoc as Record<string, unknown>) };
  const idStr = objectIdToHexString(cd._id);
  if (!idStr) return null;
  cd._id = idStr;

  const name = cd.name;
  const companyNameRaw = o.companyName;
  const companyName =
    typeof companyNameRaw === 'string' && companyNameRaw.trim()
      ? companyNameRaw.trim()
      : typeof name === 'string' && name.trim()
        ? name.trim()
        : 'Unknown';

  const originalFileName = o.originalFileName;
  const orig =
    typeof originalFileName === 'string' && originalFileName.trim()
      ? originalFileName.trim()
      : basenameSafe(filePath.trim());

  const uploadModeRaw = o.uploadMode;
  let uploadMode: 'replace' | 'add' = 'replace';
  if (uploadModeRaw === 'add' || uploadModeRaw === 'replace' || uploadModeRaw === 'append') {
    uploadMode = uploadModeRaw === 'append' ? 'add' : uploadModeRaw;
  }

  const userIdRaw = o.userId;
  const userId =
    typeof userIdRaw === 'string' && userIdRaw.trim() ? userIdRaw.trim() : 'system';

  const source = o.source;
  const src =
    source === 'web' || source === 'ftp' || source === 'legacy_ftp' ? source : undefined;

  const out: FileUploadTaskPayloadValidated = {
    filePath: filePath.trim(),
    userId,
    companyId: idStr,
    companyDocPlain: cd,
    companyName,
    originalFileName: orig,
    uploadMode,
  };

  if (src) out.source = src;
  if (typeof o.ftpSessionId === 'string') out.ftpSessionId = o.ftpSessionId;
  if (typeof o.uploadedAt === 'string') out.uploadedAt = o.uploadedAt;
  if (typeof o.fileSize === 'number' && Number.isFinite(o.fileSize)) out.fileSize = o.fileSize;

  return out;
}
