/**
 * Grade shortcuts mapping for diamond quality grades
 */
export const GRADE_SHORTCUTS = {
  EXCELLENT: 'EX',
  'VERY GOOD': 'VG',
  GOOD: 'G',
  FAIR: 'F',
} as const;

/**
 * Shortens grade values for better display
 * @param value - The grade value to shorten
 * @returns Shortened grade value or original value if not found
 */
export const shortenGradeValue = (value: string | undefined): string => {
  if (!value) return 'N/A';
  
  const gradeMap: { [key: string]: string } = GRADE_SHORTCUTS;
  return gradeMap[value.toUpperCase()] || value;
};
