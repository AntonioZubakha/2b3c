/**
 * Utility functions for handling fluorescence values
 */

/**
 * Formats fluorescence value for display
 * @param value - The fluorescence value to format
 * @returns Formatted fluorescence value
 */
export const formatFluorescenceValue = (value: string | undefined): string => {
  if (!value) return 'N/A';
  
  // Replace NONE with NO for better display
  if (value.toUpperCase() === 'NONE') {
    return 'NO';
  }
  
  return value;
};
