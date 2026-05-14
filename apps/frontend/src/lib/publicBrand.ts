/** Public storefront brand (BRD-01). Repo/npm scope may remain Stonee. */
export const PUBLIC_BRAND_NAME = '2B3C';

/** True if title already names the public brand or legacy UI string (case-insensitive). */
export function titleContainsBrandOrLegacy(title: string): boolean {
  const s = title.toLowerCase();
  return s.includes('2b3c') || s.includes('stonee');
}

export function buildSeoFullTitle(title: string): string {
  if (titleContainsBrandOrLegacy(title)) return title;
  return `${title} · ${PUBLIC_BRAND_NAME}`;
}
