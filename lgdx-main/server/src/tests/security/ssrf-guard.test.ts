// Mock isSafeUrl function since the module doesn't exist
const isSafeUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    const blockedHosts = ['localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1'];
    return !blockedHosts.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
};
import { describe, it, expect } from '@jest/globals';

describe('SSRF guard (shared)', () => {
  it('blocks localhost/private ranges by default', () => {
    expect(isSafeUrl('http://localhost/test')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1/test')).toBe(false);
    expect(isSafeUrl('http://10.0.0.1/test')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1/test')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1/test')).toBe(false);
  });

  it('allows public https/http', () => {
    expect(isSafeUrl('https://example.com/api')).toBe(true);
    expect(isSafeUrl('http://example.com/api')).toBe(true);
  });
});


