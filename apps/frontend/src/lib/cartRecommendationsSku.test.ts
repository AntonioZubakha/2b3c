import { describe, it, expect } from 'vitest';
import { pickJewelryRecommendationSku } from './cartRecommendationsSku';

describe('pickJewelryRecommendationSku', () => {
  it('returns undefined when cart is empty or missing', () => {
    expect(pickJewelryRecommendationSku(undefined)).toBeUndefined();
    expect(pickJewelryRecommendationSku([])).toBeUndefined();
  });

  it('returns undefined for bespoke-only carts', () => {
    expect(pickJewelryRecommendationSku([{ type: 'bespoke', productId: 'BESPOKE-a-b' }])).toBeUndefined();
  });

  it('returns the first valid jewelry SKU after bespoke lines', () => {
    expect(
      pickJewelryRecommendationSku([
        { type: 'bespoke', productId: 'BESPOKE-x-y' },
        { type: 'jewelry', productId: 'JL-100' },
      ]),
    ).toBe('JL-100');
  });

  it('skips jewelry rows whose productId is a bespoke-style synthetic id', () => {
    expect(
      pickJewelryRecommendationSku([
        { type: 'jewelry', productId: 'BESPOKE-should-skip' },
        { type: 'jewelry', productId: 'SKU-REAL' },
      ]),
    ).toBe('SKU-REAL');
  });

  it('returns undefined when the only jewelry line has a BESPOKE-prefixed productId', () => {
    expect(pickJewelryRecommendationSku([{ type: 'jewelry', productId: 'BESPOKE-only' }])).toBeUndefined();
  });
});
