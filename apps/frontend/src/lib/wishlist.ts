/** Client-side wishlist (saved pieces), separate from cart. Synced via `localStorage` + `stonee-wishlist` event. */

export const WISHLIST_STORAGE_KEY = 'stonee_wishlist_v1';
export const WISHLIST_CHANGED_EVENT = 'stonee-wishlist';

export type WishlistDiamond = {
  kind: 'diamond';
  /** Mongo `_id` for `/diamond/:id` */
  catalogId: string;
  sku: string;
  price: number;
  shape: string;
  carat: number;
  color?: string;
  clarity?: string;
  /** Persisted from catalog for thumbnails without refetch */
  images?: string[];
  videoUrl?: string;
  addedAt: number;
};

export type WishlistEntry = WishlistDiamond;

function stableDiamondId(catalogId: string): string {
  return `diamond:${catalogId}`;
}

export function readWishlist(): WishlistEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is WishlistDiamond =>
        x &&
        typeof x === 'object' &&
        (x as WishlistDiamond).kind === 'diamond' &&
        typeof (x as WishlistDiamond).catalogId === 'string' &&
        typeof (x as WishlistDiamond).sku === 'string',
    );
  } catch {
    return [];
  }
}

function writeWishlist(entries: WishlistEntry[]): void {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(WISHLIST_CHANGED_EVENT));
}

export function wishlistCount(): number {
  return readWishlist().length;
}

export function isDiamondInWishlist(catalogId: string): boolean {
  const id = stableDiamondId(catalogId);
  return readWishlist().some(e => stableDiamondId(e.catalogId) === id);
}

export function toggleDiamondWishlist(entry: Omit<WishlistDiamond, 'addedAt'>): boolean {
  const id = stableDiamondId(entry.catalogId);
  const list = readWishlist();
  const idx = list.findIndex(e => stableDiamondId(e.catalogId) === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeWishlist(list);
    return false;
  }
  list.unshift({ ...entry, addedAt: Date.now() });
  writeWishlist(list);
  return true;
}

export function removeFromWishlist(catalogId: string): void {
  const id = stableDiamondId(catalogId);
  writeWishlist(readWishlist().filter(e => stableDiamondId(e.catalogId) !== id));
}

export function subscribeWishlist(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(WISHLIST_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(WISHLIST_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
