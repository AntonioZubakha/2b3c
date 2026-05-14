import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

type ClientErrorPayload = {
  message?: string;
  stack?: string;
  where?: string;
  href?: string;
  userAgent?: string;
  extra?: unknown;
};

const router = Router();

// Intentionally public: used to capture client-side errors in Docker logs.
// Redaction is applied by logger.redact().
router.post('/error', (req: Request, res: Response) => {
  const body = (req.body || {}) as ClientErrorPayload;
  logger.error('[ClientError]', {
    message: body.message,
    where: body.where,
    href: body.href,
    userAgent: body.userAgent,
    stack: body.stack,
    extra: body.extra,
  });
  res.json({ ok: true });
});

export default router;

