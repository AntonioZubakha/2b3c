import type { DiamondShape, JewelryCategory, SettingStyle, SettingType } from '@stonee/shared-types';

/**
 * Visual asset fallbacks. Used when the backend returns an empty `images[]` —
 * we still want the UI to feel curated, so we pick a sensible image per
 * category/style/shape instead of a generic broken-image icon.
 *
 * All paths point at /apps/frontend/public/assets and are served as-is by Vite.
 */

const RING_POOL = [
  '/assets/ring_solitaire.png',
  '/assets/ring_halo.png',
  '/assets/ring_infinity.png',
  '/assets/solitaire_engagement_ring_platinum_1776706103840.png',
  '/assets/halo_engagement_ring_gold_yellow_1776706171719.png',
  '/assets/infinity_band_rose_gold_1776705924364.png',
];

const EARRING_POOL = [
  '/assets/earrings.png',
  '/assets/diamond_stud_earrings_gold_1776705736225.png',
];

const NECKLACE_POOL = [
  '/assets/pendant.png',
  '/assets/solitaire_pendant_platinum_1776705664650.png',
];

const BRACELET_POOL = [
  '/assets/media__1776705146363.png',
  '/assets/media__1776705391630.png',
];

const STYLE_HINT: Partial<Record<SettingStyle, string>> = {
  Solitaire: '/assets/ring_solitaire.png',
  Halo: '/assets/ring_halo.png',
  'Pavé': '/assets/infinity_band_rose_gold_1776705924364.png',
  'Side-stone': '/assets/ring_infinity.png',
  'Three-stone': '/assets/halo_engagement_ring_gold_yellow_1776706171719.png',
};

const SETTING_TYPE_HINT: Partial<Record<SettingType, string>> = {
  Tennis: '/assets/media__1776705146363.png',
  Channel: '/assets/media__1776705391630.png',
  Invisible: '/assets/media__1776867024380.png',
};

const stableIndex = (key: string, mod: number) => {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 100000;
  return Math.abs(h) % Math.max(1, mod);
};

const pool = (category: JewelryCategory | undefined): string[] => {
  switch (category) {
    case 'Earrings':
      return EARRING_POOL;
    case 'Necklace':
      return NECKLACE_POOL;
    case 'Bracelet':
      return BRACELET_POOL;
    case 'Ring':
    default:
      return RING_POOL;
  }
};

export const resolveSettingImage = (input: {
  images?: string[];
  category?: JewelryCategory;
  style?: SettingStyle;
  settingType?: SettingType;
  key?: string;
}): string => {
  const first = input.images?.[0];
  if (first) return first;
  if (input.settingType && SETTING_TYPE_HINT[input.settingType])
    return SETTING_TYPE_HINT[input.settingType] as string;
  if (input.style && STYLE_HINT[input.style]) return STYLE_HINT[input.style] as string;
  const list = pool(input.category);
  return list[stableIndex(input.key ?? '', list.length)] ?? list[0];
};

export const resolveJewelryImage = (input: {
  images?: string[];
  category?: JewelryCategory;
  key?: string;
}): string => {
  const first = input.images?.[0];
  if (first) return first;
  const list = pool(input.category);
  return list[stableIndex(input.key ?? '', list.length)] ?? list[0];
};

/** First catalog image URL from the API (no local mock fallbacks). */
export function pickDiamondCatalogImage(images?: string[]): string | undefined {
  for (const raw of images ?? []) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (s) return s;
  }
  return undefined;
}

/** @deprecated Prefer `<DiamondCatalogMedia />` (image + video). Kept for JSON-LD / rare string-only call sites. */
export const resolveDiamondImage = (input: {
  images?: string[];
  shape?: DiamondShape;
  key?: string;
}): string | undefined => pickDiamondCatalogImage(input.images);
