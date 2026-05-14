/**
 * Currency formatting utilities.
 * Project standard: space between currency symbol and number (e.g. "$ 91.57").
 */

const USD_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/**
 * Format a number as USD with space after the dollar sign.
 * Use in chart callbacks and places where useTranslation().formatCurrency is not available.
 */
export function formatUsd(value: number): string {
  const formatted = value.toLocaleString('en-US', USD_OPTIONS);
  return `$ ${formatted}`;
}

/**
 * Format with optional decimals (e.g. for per-carat or chart axes).
 */
export function formatUsdCompact(value: number, fractionDigits = 0): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `$ ${formatted}`;
}
