import type { OrderItem } from './contracts';

/**
 * SKU for `/api/recommendations/match/:sku` — only a real ready-jewelry catalog SKU,
 * never bespoke synthetic `BESPOKE-…` ids or non-jewelry lines.
 */
export function pickJewelryRecommendationSku(
  items: Pick<OrderItem, 'type' | 'productId'>[] | undefined,
): string | undefined {
  if (!items?.length) return undefined;
  for (const it of items) {
    if (it.type !== 'jewelry' || !it.productId) continue;
    if (it.productId.startsWith('BESPOKE-')) continue;
    return it.productId;
  }
  return undefined;
}
