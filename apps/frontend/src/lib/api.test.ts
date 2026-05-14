import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiHttpError, apiFetch, apiJson } from './api';

describe('ApiHttpError', () => {
  it('carries status and optional code', () => {
    const e = new ApiHttpError('nope', 403, 'kyc_required');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiHttpError');
    expect(e.message).toBe('nope');
    expect(e.status).toBe(403);
    expect(e.code).toBe('kyc_required');
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('adds Authorization when token is in localStorage', async () => {
    localStorage.setItem('token', 'abc');
    await apiFetch('/api/x');
    expect(fetch).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
      }),
    );
  });

  it('forwards caller AbortSignal to fetch (combined with internal timeout controller)', async () => {
    const ac = new AbortController();
    let received: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        received = init?.signal ?? undefined;
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }),
    );
    await apiFetch('/api/ok', { signal: ac.signal });
    expect(received).toBeDefined();
    expect(received!.aborted).toBe(false);
  });
});

describe('apiJson', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: { id: '1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const body = await apiJson<{ id: string }>('/api/y');
    expect(body.success).toBe(true);
    if (body.success) expect(body.data.id).toBe('1');
  });

  it('throws ApiHttpError with message and code from JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Verify first', code: 'kyc_required' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    try {
      await apiJson('/api/z');
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiHttpError);
      const err = e as ApiHttpError;
      expect(err.status).toBe(403);
      expect(err.message).toBe('Verify first');
      expect(err.code).toBe('kyc_required');
    }
  });
});
