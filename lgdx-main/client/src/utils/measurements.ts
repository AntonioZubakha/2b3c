/**
 * Utility functions for handling diamond measurements
 */

/**
 * Safely converts a value to a number and formats it
 * @param val - The value to convert
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string or 'N/A' if invalid
 */
export const safeFormatNumber = (val: string | number | null | undefined, decimals = 2): string => {
  if (val === null || val === undefined || val === '') return 'N/A';
  
  const n = Number(val);
  if (isNaN(n)) return 'N/A';
  
  return n.toFixed(decimals);
};

/**
 * Formats diamond measurements into a readable string
 * @param measurement1 - First measurement
 * @param measurement2 - Second measurement  
 * @param measurement3 - Third measurement
 * @returns Formatted measurements string or null if any measurement is missing
 */
export const formatMeasurements = (
  measurement1: string | number | null | undefined,
  measurement2: string | number | null | undefined,
  measurement3: string | number | null | undefined
): string | null => {
  if (!measurement1 || !measurement2 || !measurement3) return null;
  
  const m1 = safeFormatNumber(measurement1);
  const m2 = safeFormatNumber(measurement2);
  const m3 = safeFormatNumber(measurement3);
  
  // Check if any measurement is N/A
  if (m1 === 'N/A' || m2 === 'N/A' || m3 === 'N/A') return null;
  
  return `${m1} x ${m2} x ${m3} mm`;
};
