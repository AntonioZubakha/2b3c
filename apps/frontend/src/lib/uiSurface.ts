import { isStoneeStaffRole, isSupplierRole } from '@stonee/shared-types';

/** Controls nav + route chrome: buyer journey, supplier B2B workspace, or Stonee ops. */
export type UiSurface = 'buyer' | 'supplier' | 'staff';

const PREVIEW_KEY = 'stonee_staff_buyer_preview';

export function getUiSurface(): UiSurface {
  if (typeof window === 'undefined') return 'buyer';
  const role = localStorage.getItem('userRole') || '';
  /** Stale role without JWT would show supplier/staff chrome on `/auth` and broken deep links — treat as logged out. */
  if (!localStorage.getItem('token')) {
    return 'buyer';
  }
  if (isStoneeStaffRole(role)) {
    if (localStorage.getItem(PREVIEW_KEY) === '1') return 'buyer';
    return 'staff';
  }
  if (isSupplierRole(role)) return 'supplier';
  return 'buyer';
}

export function setStaffBuyerPreview(on: boolean): void {
  if (on) localStorage.setItem(PREVIEW_KEY, '1');
  else localStorage.removeItem(PREVIEW_KEY);
  window.dispatchEvent(new Event('storage'));
}

export function isStaffBuyerPreview(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(PREVIEW_KEY) === '1';
}
