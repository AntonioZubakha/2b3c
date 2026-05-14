/**
 * Date utility functions for analytics service
 */

export class DateUtils {
  /**
   * Calculate date range for analytics periods
   * Fixed to prevent date overflow issues
   */
  static getDateRange(period: 'day' | 'week' | 'month'): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    endDate.setUTCHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    
    switch (period) {
      case 'day':
        startDate.setUTCDate(endDate.getUTCDate() - 1);
        break;
      case 'week':
        startDate.setUTCDate(endDate.getUTCDate() - 7);
        break;
      case 'month':
        // Use proper month calculation to avoid date overflow
        const currentMonth = endDate.getUTCMonth();
        const currentYear = endDate.getUTCFullYear();
        startDate.setUTCFullYear(currentYear, currentMonth - 1, endDate.getUTCDate());
        // If we went to previous month, adjust to last day of that month
        if (startDate.getUTCMonth() !== currentMonth - 1) {
          startDate.setUTCDate(0); // Last day of previous month
        }
        break;
    }

    return { startDate, endDate };
  }

  /**
   * Calculate date range for custom period
   */
  static getCustomDateRange(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setUTCHours(23, 59, 59, 999);
    
    const adjustedStartDate = new Date(startDate);
    adjustedStartDate.setUTCHours(0, 0, 0, 0);

    return { startDate: adjustedStartDate, endDate: adjustedEndDate };
  }

  /**
   * Get date string in YYYY-MM-DD format
   */
  static getDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate days between two dates
   */
  static getDaysBetween(startDate: Date, endDate: Date): number {
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }
}
