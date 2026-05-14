import { describe, it, expect } from 'vitest';
import { pickDiamondCatalogImage, resolveJewelryImage, resolveSettingImage } from './imageFallback';

describe('pickDiamondCatalogImage', () => {
  it('returns first non-empty trimmed string', () => {
    expect(pickDiamondCatalogImage(['  ', ' https://x/y.png ', 'z'])).toBe('https://x/y.png');
  });

  it('returns undefined for empty or missing', () => {
    expect(pickDiamondCatalogImage(undefined)).toBeUndefined();
    expect(pickDiamondCatalogImage([])).toBeUndefined();
    expect(pickDiamondCatalogImage(['', '  '])).toBeUndefined();
  });
});

describe('resolveJewelryImage', () => {
  it('prefers first API image', () => {
    expect(resolveJewelryImage({ images: ['https://cdn/a.png'], category: 'Ring', key: 'k' })).toBe('https://cdn/a.png');
  });

  it('falls back to stable pool pick by key', () => {
    const a = resolveJewelryImage({ category: 'Ring', key: 'sku-a' });
    const b = resolveJewelryImage({ category: 'Ring', key: 'sku-a' });
    const c = resolveJewelryImage({ category: 'Ring', key: 'other-sku' });
    expect(a).toMatch(/^\/assets\//);
    expect(a).toBe(b);
    expect(a === c).toBe(false);
  });
});

describe('resolveSettingImage', () => {
  it('uses style hint when no images', () => {
    const url = resolveSettingImage({ style: 'Solitaire', key: 'x' });
    expect(url).toContain('ring_solitaire');
  });
});
