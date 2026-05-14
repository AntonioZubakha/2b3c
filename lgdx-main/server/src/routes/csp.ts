import express, { Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = express.Router();

// Accept both legacy report-uri format and modern Report-To format
const parseBody = express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'] as string[] });

router.post('/', parseBody, (req: Request, res: Response) => {
  try {
    const report = req.body;
    // Normalize legacy format {"csp-report": {...}}
    const payload = report && report['csp-report'] ? report['csp-report'] : report;

    // Avoid logging full URLs with potential tokens
    logger.warn('[CSP] Violation report received', {
      blockedURI: payload?.blockedURI || payload?.['blocked-uri'],
      documentURI: payload?.documentURI || payload?.['document-uri'],
      effectiveDirective: payload?.effectiveDirective || payload?.['effective-directive'],
      violatedDirective: payload?.violatedDirective || payload?.['violated-directive'],
      originalPolicy: undefined, // do not log full policy
      sourceFile: payload?.sourceFile || payload?.['source-file'],
      lineNumber: payload?.lineNumber || payload?.['line-number'],
      columnNumber: payload?.columnNumber || payload?.['column-number'],
      disposition: payload?.disposition,
    });
  } catch (e) {
    logger.error('[CSP] Failed to process report: ' + (e as Error)?.message);
  }
  res.status(204).end();
});

export default router;


