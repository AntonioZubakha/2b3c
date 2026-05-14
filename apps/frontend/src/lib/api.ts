/**
 * All browser HTTP calls use these paths on the same origin.
 * Dev: Vite proxies `/api` → API gateway. Prod: terminate TLS and proxy `/api` the same way.
 */
export const GATEWAY = {
  catalog: '/api/catalog',
  jewelry: '/api/jewelry',
  search: '/api/search',
  supplier: '/api/supplier',
  user: '/api/user',
  pricing: '/api/pricing',
  order: '/api/order',
  /** Style-matched jewelry for diamond PDP (public GET). */
  recommendations: '/api/recommendations',
} as const;

export type ApiOk<T> = { success: true; data: T };
export type ApiFail = { success: false; error?: string };
export type ApiResponse<T> = ApiOk<T> | ApiFail;

/** Thrown by {@link apiJson} on non-OK responses; includes HTTP status and optional `code` from JSON body. */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

export const apiFetch = async (url: string, options: RequestInit & { timeoutMs?: number } = {}) => {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = options;
  const token = localStorage.getItem('token');
  const supplierCompanyId = localStorage.getItem('supplierCompanyId');
  const baseHeaders: Record<string, string> = {
    ...(typeof rest.headers === 'object' && rest.headers !== null && !Array.isArray(rest.headers)
      ? (rest.headers as Record<string, string>)
      : {}),
  };
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }
  if (supplierCompanyId) {
    baseHeaders['x-supplier-company-id'] = supplierCompanyId;
  }
  const headers = baseHeaders;

  const controller = new AbortController();
  const tid = window.setTimeout(() => controller.abort(), timeoutMs);

  // Allow the caller to also cancel
  callerSignal?.addEventListener('abort', () => controller.abort());

  try {
    return await fetch(url, { ...rest, headers, signal: controller.signal });
  } finally {
    window.clearTimeout(tid);
  }
};

export const apiJson = async <T>(url: string, options: RequestInit = {}) => {
  const res = await apiFetch(url, options);
  const contentType = res.headers.get('content-type') || '';

  let body: unknown = null;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    const status = res.status;
    let message = `HTTP ${status}`;
    let code: string | undefined;
    if (typeof body === 'object' && body && 'error' in body) {
      const b = body as { error?: unknown; code?: string };
      if (typeof b.error === 'string') message = b.error;
      if (typeof b.code === 'string') code = b.code;
    }
    throw new ApiHttpError(message, status, code);
  }

  return body as ApiResponse<T>;
};
