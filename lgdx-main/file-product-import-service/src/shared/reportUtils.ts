import * as ExcelJS from 'exceljs';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ProductProcessingStats } from './productUtils';

export interface ReportProductData {
  status: 'Created' | 'Updated' | 'Skipped' | string;
  reason?: string;
  sourceProduct?: { [key: string]: any };
  systemId?: string;
  finalData?: { [key: string]: any };
  [key: string]: any;
}

export interface ReportPaths {
  xlsx: string | null;
  csv: string | null;
}

export interface GenerateSyncReportOptions {
  /** When true, summary will note that details are for the last chunk only; stats remain for all chunks. */
  lastChunkOnly?: boolean;
}

/**
 * Generate sync report in XLSX and CSV formats
 */
export const generateSyncReport = async (
  company: string,
  user: string,
  stats: ProductProcessingStats,
  allProcessedProductsDetailed: ReportProductData[],
  errors: Array<{ message: string; certificateNumber?: string; stack?: string; [key: string]: unknown }>,
  options?: GenerateSyncReportOptions
): Promise<{ xlsx: string | null; csv: string | null }> => {
  try {
    const outputDir = path.join(process.cwd(), 'reports');
    fs.ensureDirSync(outputDir);

    const safeIdentifier = company.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `sync_report_${safeIdentifier}_${timestamp}`;
    
    const xlsxPath = path.join(outputDir, `${baseFilename}.xlsx`);
    const csvPath = path.join(outputDir, `${baseFilename}.csv`);

    // Calculate total skipped
    const totalSkipped = stats.skippedByBlacklist +
                        stats.skippedByDuplicateInSource +
                        stats.skippedExistingOnDealOrSold +
                        stats.skippedInvalidStatus +
                        stats.skippedInvalidColor +
                        stats.skippedInvalidClarity +
                        stats.skippedInvalidPrice +
                        stats.skippedInvalidCarat +
                        stats.skippedMissingMedia +
                        stats.skippedMissingCertNumber +
                        stats.skippedNotLabGrown +
                        stats.skippedAnomalousPricePerCarat +
                        stats.skippedByApiFilter +
                        stats.skippedCheaperExistsOtherCompany +
                        (stats.skippedInvalidData || 0);

    // Prepare report data
    const summary: Record<string, string | number> = {
      'Company': company,
      'User': user,
      'Total Uploaded': stats.totalUploaded || 0,
      'Processed': stats.processed || 0,
      'Created': stats.created || 0,
      'Updated': stats.updated || 0,
      'Total Skipped': totalSkipped,
      'Errors': errors.length,
      'Processing Date': new Date().toISOString()
    };
    if (options?.lastChunkOnly) {
      summary['Note'] = 'Details below: last chunk only. Statistics above: all chunks.';
    }
    const report = {
      summary,
      details: allProcessedProductsDetailed.map(item => ({
        'Status': item.status,
        'Reason': item.reason || '',
        'System ID': item.systemId || '',
        ...item.sourceProduct
      }))
    };

    // Generate XLSX report (Details sheet only; no Summary)
    const workbook = new ExcelJS.Workbook();
    const detailsSheet = workbook.addWorksheet('Details');
    const headers = report.details.length > 0
      ? Object.keys(report.details[0])
      : ['Status', 'Reason', 'System ID'];
    detailsSheet.addRow(headers);
    const detailsHeaderRow = detailsSheet.getRow(1);
    detailsHeaderRow.font = { bold: true, size: 12 };
    detailsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    detailsHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    detailsHeaderRow.height = 20;

    report.details.forEach((row, rowIndex) => {
      const values = Object.values(row);
      const dataRow = detailsSheet.addRow(values);
      if (rowIndex % 2 === 0) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
      dataRow.height = 18;
      dataRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      });
    });

    detailsSheet.properties.defaultRowHeight = 15;
    const maxWidthByHeader: Record<string, number> = {};
    for (const h of headers) maxWidthByHeader[h] = h.length;
    for (const row of report.details) {
      for (const header of headers) {
        const cellValue = (row as Record<string, unknown>)[header];
        if (cellValue != null) {
          let len = String(cellValue).length;
          if (len > 30) len = Math.min(len, 45);
          maxWidthByHeader[header] = Math.max(maxWidthByHeader[header], len);
        }
      }
    }
    for (let index = 0; index < headers.length; index++) {
      const column = detailsSheet.getColumn(index + 1);
      column.width = Math.max(15, Math.min(60, maxWidthByHeader[headers[index]] + 3));
      column.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    }

    // Freeze the header row for better navigation
    detailsSheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // Write XLSX file
    await workbook.xlsx.writeFile(xlsxPath);

    // Generate CSV report (simplified)
    const csvContent = [
      Object.keys(report.summary).join(','),
      Object.values(report.summary).join(','),
      '',
      'Details:',
      ...report.details.map(row => Object.values(row).join(','))
    ].join('\n');

    await fs.writeFile(csvPath, csvContent);

    console.log(`[generateSyncReport] Reports generated: ${xlsxPath}, ${csvPath}`);
    
    return {
      xlsx: xlsxPath,
      csv: csvPath
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[generateSyncReport] Failed to generate reports: ${errorMessage}`, error);
    return {
      xlsx: null,
      csv: null
    };
  }
};


