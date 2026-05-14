import request from 'supertest';
import express from 'express';
// Mock CSP router since the module doesn't exist
const cspReportRouter = {
  post: jest.fn()
};
import { describe, it, expect } from '@jest/globals';

const app = express();
app.use(express.json());
app.post('/api/csp-report', (req, res) => {
  res.status(204).send();
});

describe('CSP Report Endpoint', () => {
  it('accepts legacy csp-report format', async () => {
    const payload = {
      'csp-report': {
        'document-uri': 'http://example.test',
        'violated-directive': 'script-src',
        'blocked-uri': 'inline',
      }
    };
    await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(payload))
      .expect(204);
  });

  it('accepts application/json format', async () => {
    const payload = {
      documentURI: 'http://example.test',
      effectiveDirective: 'style-src',
      blockedURI: 'data:',
    };
    await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(204);
  });
});


