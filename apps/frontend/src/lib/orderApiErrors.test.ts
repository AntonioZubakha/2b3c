import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { ApiHttpError } from './api';
import { orderKycBlockKind, userVisibleOrderError } from './orderApiErrors';

const t = ((key: string) => `i18n:${key}`) as TFunction;

describe('orderKycBlockKind', () => {
  it('detects kyc_required from ApiHttpError', () => {
    expect(orderKycBlockKind(new ApiHttpError('x', 403, 'kyc_required'))).toBe('kyc_required');
  });

  it('detects kyc_unavailable', () => {
    expect(orderKycBlockKind(new ApiHttpError('x', 503, 'kyc_unavailable'))).toBe('kyc_unavailable');
  });

  it('returns null for unrelated errors', () => {
    expect(orderKycBlockKind(new Error('network'))).toBeNull();
    expect(orderKycBlockKind(new ApiHttpError('x', 400))).toBeNull();
  });
});

describe('userVisibleOrderError', () => {
  it('maps KYC errors to checkout i18n keys', () => {
    expect(userVisibleOrderError(t, new ApiHttpError('x', 403, 'kyc_required'))).toBe('i18n:checkout.kycRequiredBody');
    expect(userVisibleOrderError(t, new ApiHttpError('x', 503, 'kyc_unavailable'))).toBe(
      'i18n:checkout.kycUnavailableBody',
    );
  });

  it('uses Error.message when present', () => {
    expect(userVisibleOrderError(t, new Error('Bad cart'))).toBe('Bad cart');
  });

  it('uses fallback i18n key', () => {
    expect(userVisibleOrderError(t, 404)).toBe('i18n:common.somethingWrong');
  });
});
