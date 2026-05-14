import { describe, it, expect } from '@jest/globals';
import { isSafeUrl } from '../shared/security';

describe('security (SSRF guard)', () => {
  it('allows normal https URLs', () => {
    expect(isSafeUrl('https://example.com/api')).toBe(true);
    expect(isSafeUrl('http://supplier.example.org/v1')).toBe(true);
  });

  it('blocks non-http(s) protocols', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('ftp://example.com/')).toBe(false);
  });

  it('blocks localhost and private ranges', () => {
    expect(isSafeUrl('http://localhost:8080/')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1/')).toBe(false);
    expect(isSafeUrl('http://10.0.0.1/')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1/')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1/')).toBe(false);
  });

  it('blocks link-local and CGNAT literals', () => {
    expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeUrl('http://100.64.0.1/')).toBe(false);
    expect(isSafeUrl('http://0.0.0.0/')).toBe(false);
  });
});
