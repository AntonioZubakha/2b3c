import { describe, expect, it } from 'vitest';
import { buildSeoFullTitle, titleContainsBrandOrLegacy } from './publicBrand';

describe('titleContainsBrandOrLegacy', () => {
  it('detects 2B3C case-insensitively', () => {
    expect(titleContainsBrandOrLegacy('Hello 2b3c')).toBe(true);
    expect(titleContainsBrandOrLegacy('2B3C — Home')).toBe(true);
  });
  it('detects legacy Stonee', () => {
    expect(titleContainsBrandOrLegacy('Stonee · Diamond')).toBe(true);
    expect(titleContainsBrandOrLegacy('STONee')).toBe(true);
  });
  it('returns false for neutral titles', () => {
    expect(titleContainsBrandOrLegacy('Cart')).toBe(false);
    expect(titleContainsBrandOrLegacy('About us')).toBe(false);
  });
});

describe('buildSeoFullTitle', () => {
  it('does not duplicate suffix when brand present', () => {
    expect(buildSeoFullTitle('2B3C — Atelier')).toBe('2B3C — Atelier');
    expect(buildSeoFullTitle('Stonee legacy')).toBe('Stonee legacy');
  });
  it('appends brand for neutral titles', () => {
    expect(buildSeoFullTitle('Cart')).toBe('Cart · 2B3C');
  });
});
