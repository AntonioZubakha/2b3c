import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { ICompany, IUser } from '../types'; // Corrected import path
import { ProductProcessingStats } from './productUtils'; // Import ProductProcessingStats
import { logger } from './logger';
import { getErrorMessage } from './errorHelpers';

function sanitizeExcelCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;

  // Prevent Excel formula injection in exported reports:
  // values starting with =, +, -, @ can be interpreted as formulas in some contexts.
  // Prefix with apostrophe so Excel treats it as literal text.
  const trimmed = value.trimStart();
  if (/^[=\-+@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

// Interface for detailed product processing information used in the report
export interface ReportProductData {
  status: 'Created' | 'Updated' | 'Skipped' | string; // Allow other strings for flexibility if source changes
  reason?: string;
  sourceProduct?: { [key: string]: any }; // The original product data from the source
  systemId?: string; // System ID if created/updated
  finalData?: { [key: string]: any }; // Processed data, if available
  // Allow any other properties that might be passed
  [key: string]: any;
}

/**
 * Generates an XLSX report for product processing.
 * @param company The company object or ID.
 * @param user The user object or ID who initiated the sync (currently unused in report generation itself).
 * @param stats The processing statistics (currently unused in this report's sheet, but available).
 * @param allProcessedProductsDetailed Array of detailed processed product data.
 * @param errors Array of errors encountered during processing (currently unused in this report's sheet).
 * @returns Promise resolving to the path of the generated report file or null.
 */
export const generateProductReportXlsx = async (
  company: Pick<ICompany, 'name' | '_id'> | string,
  user: Pick<IUser, 'email' | '_id'> | string,
  stats: ProductProcessingStats,
  allProcessedProductsDetailed: ReportProductData[],
  errors: any[]
): Promise<string | null> => {
  try {
    const reportDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const identifier = typeof company === 'string' ? company : company.name;
    const safeIdentifier = identifier.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `product_import_report_${safeIdentifier}_${timestamp}.xlsx`;
    const filePath = path.join(reportDir, fileName);

    const reportDataForSheet = allProcessedProductsDetailed.map(item => {
      const row: { [key: string]: any } = {};
      const source = item.sourceProduct || {};

      if (item.status === 'Created' || item.status === 'Updated') {
        row['Processing Status'] = '✓ IMPORTED';
      } else {
        let statusValue = '✗ SKIPPED';
        if (item.reason) {
          statusValue += `, ${item.reason}`;
        }
        row['Processing Status'] = statusValue;
      }

      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          row[key] = sanitizeExcelCellValue(source[key]);
        }
      }
      
      if ((item.status === 'Created' || item.status === 'Updated') && item.systemId) {
        row['System Product ID'] = item.systemId;
      }

      return row;
    });

    if (reportDataForSheet.length === 0) {
      reportDataForSheet.push({ "Info": "No products processed or available for this report." });
    }
    
    // Create workbook and worksheet using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Report');
    
    // Add headers
    if (reportDataForSheet.length > 0) {
      const headers = Object.keys(reportDataForSheet[0]);
      worksheet.addRow(headers);
      
      // Style the header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' } // Blue header background
      };
      headerRow.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: false
      };
      
      // Set header row height
      headerRow.height = 20;
    }
    
    // Add data rows
    reportDataForSheet.forEach((row, rowIndex) => {
      const values = Object.values(row);
      const dataRow = worksheet.addRow(values);
      
      // Alternate row colors for better readability
      if (rowIndex % 2 === 0) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' } // Light gray for even rows
        };
      }
      
      // Set row height
      dataRow.height = 18;
      
      // Set alignment for all cells in the row
      dataRow.eachCell((cell) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
          wrapText: false
        };
      });
    });
    
    // Set default row height to normal (not expanded)
    worksheet.properties.defaultRowHeight = 15;
    
    // Calculate and set optimal column widths based on content
    if (reportDataForSheet.length > 0) {
      const headers = Object.keys(reportDataForSheet[0]);
      
      headers.forEach((header, index) => {
        const column = worksheet.getColumn(index + 1);
        
        // Calculate optimal width based on header and content
        let maxWidth = header.length;
        
        // Check content in all rows for this column
        reportDataForSheet.forEach(row => {
          const cellValue = row[header];
          if (cellValue !== null && cellValue !== undefined) {
            const cellString = String(cellValue);
            const cellLength = cellString.length;
            
            // Account for special characters and long strings
            let adjustedLength = cellLength;
            
            // If it's a long string, add some extra space
            if (cellLength > 30) {
              adjustedLength = Math.min(cellLength, 45); // Cap at 45 characters
            }
            
            // If it contains special characters or seems like an ID, give more space
            if (cellString.includes('_') || cellString.includes('-') || cellString.includes('ID')) {
              adjustedLength += 3;
            }
            
            maxWidth = Math.max(maxWidth, adjustedLength);
          }
        });
        
        // Set reasonable bounds for column width (min 15, max 60)
        const optimalWidth = Math.max(15, Math.min(60, maxWidth + 3));
        column.width = optimalWidth;
        
        // Set column properties for better display
        column.alignment = { 
          vertical: 'middle',
          horizontal: 'left',
          wrapText: false // Disable text wrapping
        };
        
        // Force column to be visible
        column.hidden = false;
      });
    }
    
    // Freeze the header row for better navigation
    worksheet.views = [
      {
        state: 'frozen',
        xSplit: 0,
        ySplit: 1
      }
    ];
    
    // Save the workbook
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  } catch (error: unknown) {
    logger.error(`[Report Generation Error] Failed to create XLSX report: ${getErrorMessage(error)}`, { error });
    return null;
  }
}; 