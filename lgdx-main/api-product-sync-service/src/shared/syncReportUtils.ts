import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { ProductProcessingStats } from './productUtils';
import { ReportProductData, generateProductReportXlsx } from './reportUtils';
import { SyncReports } from './telegramBot';
import { logger } from './logger';

const MAX_ITEMS_FOR_XLSX_REPORT = 10000;

export async function generateSyncReports(
  companyInfo: { id: string; name: string },
  stats: ProductProcessingStats,
  allProcessedProductsDetailed: ReportProductData[],
): Promise<SyncReports> {
    let xlsxReportPath: string | null = null;
    let csvReportPath: string | null = null;
    const reportNotes: string[] = [];
  
    // User is hardcoded as system in the original logic
    const user = { _id: new mongoose.Types.ObjectId('000000000000000000000000'), email: 'system@example.com' };

    if (allProcessedProductsDetailed.length > 0) {
        try {
            if (allProcessedProductsDetailed.length > MAX_ITEMS_FOR_XLSX_REPORT) {
                const reportableItems = allProcessedProductsDetailed.slice(0, MAX_ITEMS_FOR_XLSX_REPORT);
                const note = `📄 Note: XLSX report contains the first ${MAX_ITEMS_FOR_XLSX_REPORT} items due to large volume (${allProcessedProductsDetailed.length} total). Full statistics are in the Telegram message.`;
                reportNotes.push(note);
        
                xlsxReportPath = await generateProductReportXlsx(
                    { _id: new mongoose.Types.ObjectId(companyInfo.id), name: companyInfo.name },
                    user,
                    stats,
                    reportableItems,
                    stats.errors || []
                );
            } else {
                xlsxReportPath = await generateProductReportXlsx(
                    { _id: new mongoose.Types.ObjectId(companyInfo.id), name: companyInfo.name },
                    user,
                    stats,
                    allProcessedProductsDetailed,
                    stats.errors || []
                );
            }
        } catch (xlsxError: unknown) {
            const errorMessage = xlsxError instanceof Error ? xlsxError.message : String(xlsxError);
            logger.error('[generateSyncReports] Failed to generate XLSX report', { companyId: companyInfo.id, companyName: companyInfo.name, error: errorMessage });
        }
    }
  
    try {
        if (allProcessedProductsDetailed.length > 0) {
            const csvFileName = `sync_report_csv_${companyInfo.id}_${Date.now()}.csv`;
            const reportsDir = path.join(process.cwd(), 'reports');
            await fs.promises.mkdir(reportsDir, { recursive: true });
            csvReportPath = path.join(reportsDir, csvFileName);
            
            const fileStream = fs.createWriteStream(csvReportPath, { encoding: 'utf8' });

            await new Promise((resolve, reject) => {
                fileStream.on('error', reject);
                fileStream.on('finish', resolve);

                fileStream.write('Status,Reason,SystemID,RawData\n');

                for (const item of allProcessedProductsDetailed) {
                    const status = item.status || '';
                    const reason = item.reason || '';
                    const systemId = item.systemId || '';
                    const rawDataString = (item.sourceProduct && typeof item.sourceProduct === 'object')
                        ? JSON.stringify(item.sourceProduct).replace(/"/g, '""')
                        : 'Invalid source product data';
                    
                    const canWrite = fileStream.write(`"${status}","${reason}","${systemId}","${rawDataString}"\n`);

                    if (!canWrite) {
                        fileStream.once('drain', () => {
                            // The stream is drained, continue writing.
                        });
                    }
                }
                
                fileStream.end();
            });
        }
    } catch (reportError: unknown) {
        const errorMessage = reportError instanceof Error ? reportError.message : String(reportError);
        logger.error('[generateSyncReports] Failed to generate CSV report', { companyId: companyInfo.id, companyName: companyInfo.name, error: errorMessage });
    }
  
    return {
        xlsx: xlsxReportPath,
        csv: csvReportPath
    };
} 