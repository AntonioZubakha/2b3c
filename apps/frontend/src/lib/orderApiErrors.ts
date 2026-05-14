import type { TFunction } from 'i18next';
import { ApiHttpError } from './api';

export type OrderKycBlockKind = 'kyc_required' | 'kyc_unavailable';

export function orderKycBlockKind(err: unknown): OrderKycBlockKind | null {
  if (err instanceof ApiHttpError) {
    if (err.code === 'kyc_required') return 'kyc_required';
    if (err.code === 'kyc_unavailable') return 'kyc_unavailable';
  }
  return null;
}

/** User-facing string for order-service failures (checkout, payment intent, etc.). */
export function userVisibleOrderError(t: TFunction, err: unknown, fallbackKey = 'common.somethingWrong'): string {
  const kyc = orderKycBlockKind(err);
  if (kyc === 'kyc_required') return t('checkout.kycRequiredBody');
  if (kyc === 'kyc_unavailable') return t('checkout.kycUnavailableBody');
  if (err instanceof Error && err.message) return err.message;
  return t(fallbackKey);
}
