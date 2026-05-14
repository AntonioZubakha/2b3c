import { describe, it, expect } from '@jest/globals';
import { parseFtpUploadFileName } from '../services/ftpServer';

describe('parseFtpUploadFileName', () => {
  it('accepts plain filename (company root)', () => {
    expect(parseFtpUploadFileName('stock.xlsx')).toEqual({
      ok: true,
      safeName: 'stock.xlsx',
      storSubdir: '',
    });
  });

  it('accepts files/ prefix (common client STOR)', () => {
    expect(parseFtpUploadFileName('files/lgdealweb.csv')).toEqual({
      ok: true,
      safeName: 'lgdealweb.csv',
      storSubdir: 'files',
    });
  });

  it('accepts files\\ with Windows-style separator', () => {
    expect(parseFtpUploadFileName('files\\lgdealweb.csv')).toEqual({
      ok: true,
      safeName: 'lgdealweb.csv',
      storSubdir: 'files',
    });
  });

  it('rejects other two-segment paths (unknown subdir)', () => {
    const r = parseFtpUploadFileName('incoming/stock.xlsx');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('subdir_not_allowed');
      expect(r.rawArgument).toBe('incoming/stock.xlsx');
      expect(r.posixBasename).toBe('stock.xlsx');
    }
  });

  it('rejects absolute-style path', () => {
    const r = parseFtpUploadFileName('/stock.xlsx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_plain_filename');
  });

  it('rejects single segment with backslash in name (no directory split on client bug)', () => {
    const r = parseFtpUploadFileName('folder\\stock.xlsx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('subdir_not_allowed');
  });

  it('rejects traversal in basename', () => {
    const r = parseFtpUploadFileName('..x.xlsx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('illegal_basename_chars');
  });

  it('rejects deeper than files/name', () => {
    const r = parseFtpUploadFileName('files/sub/stock.xlsx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_plain_filename');
  });

  it('trims whitespace then accepts', () => {
    expect(parseFtpUploadFileName('  a.csv  ')).toEqual({
      ok: true,
      safeName: 'a.csv',
      storSubdir: '',
    });
  });

  it('rejects empty', () => {
    const r = parseFtpUploadFileName('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });
});
