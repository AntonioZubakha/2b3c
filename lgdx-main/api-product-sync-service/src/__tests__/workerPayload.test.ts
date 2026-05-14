import { describe, it, expect } from '@jest/globals';
import { parseApiSyncTaskPayload } from '../shared/apiSyncPayload';

describe('parseApiSyncTaskPayload', () => {
  const validId = '507f1f77bcf86cd799439011';

  it('accepts valid payloads', () => {
    expect(
      parseApiSyncTaskPayload({
        configId: validId,
        companyId: validId,
        companyName: 'Acme',
      }),
    ).toEqual({
      configId: validId,
      companyId: validId,
      companyName: 'Acme',
    });
  });

  it('defaults company name when missing', () => {
    expect(
      parseApiSyncTaskPayload({
        configId: validId,
        companyId: validId,
      })?.companyName,
    ).toBe('Unknown');
  });

  it('rejects invalid ObjectId strings', () => {
    expect(parseApiSyncTaskPayload({ configId: 'short', companyId: validId })).toBeNull();
    expect(parseApiSyncTaskPayload({ configId: validId, companyId: 'not-hex' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseApiSyncTaskPayload(null)).toBeNull();
    expect(parseApiSyncTaskPayload('x')).toBeNull();
  });
});
