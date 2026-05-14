import { describe, it, expect } from '@jest/globals';
import { parseFileUploadTaskPayload } from '../shared/fileUploadPayload';

describe('parseFileUploadTaskPayload', () => {
  const oid = '507f1f77bcf86cd799439011';

  it('accepts minimal valid payload', () => {
    const r = parseFileUploadTaskPayload({
      filePath: '/data/a.csv',
      companyDoc: { _id: oid, name: 'Acme' },
      companyName: 'Acme',
      originalFileName: 'a.csv',
      uploadMode: 'replace',
    });
    expect(r).not.toBeNull();
    expect(r?.companyId).toBe(oid);
    expect(r?.companyDocPlain._id).toBe(oid);
    expect(r?.companyDocPlain.name).toBe('Acme');
  });

  it('preserves extra companyDoc fields (FTP toObject)', () => {
    const r = parseFileUploadTaskPayload({
      filePath: '/app/ftp-data/x/f.csv',
      companyDoc: { _id: oid, name: 'Co', ftpConfig: { enabled: true } },
      companyName: 'Co',
      originalFileName: 'f.csv',
      uploadMode: 'replace',
      source: 'ftp',
    });
    expect((r?.companyDocPlain.ftpConfig as { enabled?: boolean })?.enabled).toBe(true);
    expect(r?.source).toBe('ftp');
  });

  it('rejects bad company id', () => {
    expect(
      parseFileUploadTaskPayload({
        filePath: '/x',
        companyDoc: { _id: 'bad', name: 'x' },
        originalFileName: 'a.csv',
        uploadMode: 'replace',
      }),
    ).toBeNull();
  });
});
