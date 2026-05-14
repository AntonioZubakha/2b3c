import mongoose from 'mongoose';
import { performance } from 'perf_hooks';
import Product from '../models/Product';
import * as productUtils from './productUtils';
import { sendSyncProgressNotification } from './telegramBot';
import { logger } from './logger';
import {
  importDuplicatesCounter,
} from '../metrics';
import {
  ensureFreshMarketPriceCache,
  getSharedMarketPriceCache,
  getMarketPriceCacheStatus,
} from './marketPriceCacheClient';

const MAX_ITEMS_FOR_DETAILED_REPORT = 50000; // Увеличиваем для генерации полноценных отчетов

/**
 * Get market price cache for product processing with memory-efficient streaming
 */
async function getMarketPriceCache(): Promise<Map<string, number>> {
  await ensureFreshMarketPriceCache();
  const sharedCache = getSharedMarketPriceCache();
  return new Map(sharedCache);
}

interface SyncOptions {
  preDeleteStale?: boolean;
  companyName?: string;
  allowMissingMedia?: boolean;
  useUpsertStrategy?: boolean;
  /**
   * When true, Steps 2a/2b (sold-cert DB query + in-memory filter) are skipped
   * because the caller (syncLogic.ts) already pre-filtered sold products via
   * getCachedSoldCertificates().  Avoids a redundant DB round-trip and, for large
   * datasets like Excellent Corporation (340 K products), saves ~39 seconds of
   * in-memory filtering per sync run.
   */
  skipSoldCertsCheck?: boolean;
}

/**
 * Helper function to create an upsert operation for a product
 */
function createUpsertOperation(processedProduct: productUtils.ProcessedProductData, companyIdAsObjectId: mongoose.Types.ObjectId) {
  if (!processedProduct.certificateNumber) {
    throw new Error('Certificate number is required for upsert operation');
  }

  // Include certificateInstitute in the filter so that GIA 123 and IGI 123 are
  // treated as distinct stones (matching the unique index definition).
  const filter: Record<string, unknown> = { certificateNumber: processedProduct.certificateNumber };
  if (processedProduct.certificateInstitute) {
    filter.certificateInstitute = processedProduct.certificateInstitute;
  }

  return {
    updateOne: {
      filter,
      update: { 
        $set: { ...processedProduct, company: companyIdAsObjectId, updatedAt: new Date(), sku: processedProduct.sku || require('uuid').v4() },
        $setOnInsert: { _id: new mongoose.Types.ObjectId(), createdAt: new Date() }
      },
      upsert: true
    }
  };
}

interface DetailedProductReport {
  sourceProduct?: productUtils.RawProductData;
  finalData?: productUtils.ProcessedProductData;
  status: 'Created' | 'Updated' | 'Skipped';
  reason?: string;
  systemId?: string;
  details?: string;
}

/**
 * Handles the core logic of processing and synchronizing products from an API response.
 * Copied from server/src/utils/syncUtils.ts
 */
export async function handleProductSync(
  apiProducts: productUtils.RawProductData[],
  companyId: string,
  stats: productUtils.ProductProcessingStats,
  allProcessedProductsDetailed: DetailedProductReport[],
  options: SyncOptions = {}
): Promise<void> {
  // Use local performance timers — console.time uses global string labels that
  // collide when two syncs run concurrently, producing "Label already exists" /
  // "No such label" warnings and scrambled timing output.
  const tTotal = performance.now();

  const {
    preDeleteStale = false,
    allowMissingMedia = false,
    useUpsertStrategy = true,
    skipSoldCertsCheck = false,
  } = options;
  
  logger.info('[handleProductSync] Loading market price cache...');
  const marketPriceCache = await getMarketPriceCache();
  const cacheStatus = getMarketPriceCacheStatus();
  logger.info('[handleProductSync] Market price cache ready', {
    size: marketPriceCache.size,
    version: cacheStatus.version,
    source: cacheStatus.lastSource,
    generatedAt: cacheStatus.generatedAt,
  });

  if (marketPriceCache.size === 0) {
    logger.warn('[handleProductSync] Market price cache is empty after refresh');
  }
  
  const operations: Array<{
    updateOne?: { filter: Record<string, unknown>; update: { $set: unknown; $setOnInsert: unknown }; upsert: boolean };
    deleteOne?: { filter: { _id: mongoose.Types.ObjectId } };
  }> = [];
  const companyIdAsObjectId = new mongoose.Types.ObjectId(companyId);

  // 1. De-duplicate products from the source based on certificate number and price
  let tStep = performance.now();
  const uniqueProductsFromSource = new Map<string, productUtils.RawProductData>();
  let duplicateRowsCount = 0; // only rows with same cert 2+ times; excludes no-cert skips

  for (const product of apiProducts) {
    const certNumValue = productUtils.getFieldValue(product, 'certificateNumber');
    const certNum = certNumValue ? String(certNumValue).trim().toUpperCase() : null;

    if (!certNum) {
      stats.skippedMissingCertNumber = (stats.skippedMissingCertNumber || 0) + 1;
      if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
        allProcessedProductsDetailed.push({ sourceProduct: product, status: 'Skipped', reason: 'missing_certificate_number' });
      }
      continue;
    }

    const existing = uniqueProductsFromSource.get(certNum);
    if (existing) {
      duplicateRowsCount++;
      const existingPrice = productUtils.getFieldValue(existing, 'price');
      const currentPrice = productUtils.getFieldValue(product, 'price');
      if (typeof currentPrice === 'number' && (typeof existingPrice !== 'number' || currentPrice < existingPrice)) {
        uniqueProductsFromSource.set(certNum, product);
      }
      if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
        allProcessedProductsDetailed.push({ sourceProduct: product, status: 'Skipped', reason: 'duplicate_in_source' });
      }
    } else {
      uniqueProductsFromSource.set(certNum, product);
    }
  }
  stats.skippedByDuplicateInSource = duplicateRowsCount;
  logger.info(`[handleProductSync] Step 1: De-duplicate source: ${(performance.now() - tStep).toFixed(1)}ms`);

  const productsToProcess = Array.from(uniqueProductsFromSource.values());

  // Steps 2a/2b: sold-cert filter.
  // Skipped when the caller (syncLogic.ts) has already pre-filtered via
  // getCachedSoldCertificates() — avoids a redundant DB query and, for large
  // datasets, saves significant in-memory filtering time.
  let nonBlacklistedProducts: productUtils.RawProductData[];

  if (skipSoldCertsCheck) {
    nonBlacklistedProducts = productsToProcess;
    logger.debug('[handleProductSync] Skipping Step 2a/2b — sold-cert check already done upstream');
  } else {
    tStep = performance.now();
    const soldCertsSet = new Set(
      (await Product.find({ status: 'Sold' }, { certificateNumber: 1 }).lean())
        .map(c => String((c as { certificateNumber?: string }).certificateNumber || '').trim().toUpperCase())
        .filter(Boolean)
    );
    logger.info(`[handleProductSync] Step 2a: Fetch sold product certificate numbers: ${(performance.now() - tStep).toFixed(1)}ms`);

    tStep = performance.now();
    nonBlacklistedProducts = productsToProcess.filter(p => {
      const certNumValue = productUtils.getFieldValue(p, 'certificateNumber');
      const certNum = certNumValue ? String(certNumValue).trim().toUpperCase() : null;
      if (certNum && soldCertsSet.has(certNum)) {
        stats.skippedByBlacklist++;
        if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
          allProcessedProductsDetailed.push({
            sourceProduct: p,
            status: 'Skipped',
            reason: 'certificate_already_sold',
          });
        }
        return false;
      }
      return true;
    });
    logger.info(`[handleProductSync] Step 2b: Filter sold certs in-memory: ${(performance.now() - tStep).toFixed(1)}ms`);
  }

  // 3. Fetch all existing products from the database that match the certificate numbers
  tStep = performance.now();
  const finalCertificateNumbers = nonBlacklistedProducts
    .map(p => {
        const certNumValue = productUtils.getFieldValue(p, 'certificateNumber');
        return certNumValue ? String(certNumValue).trim().toUpperCase() : null;
    })
    .filter((cn): cn is string => !!cn);

  logger.info(`[handleProductSync] Checking ${finalCertificateNumbers.length} certificate numbers for existing products`);

  interface ExistingProductDoc {
    _id: mongoose.Types.ObjectId;
    certificateNumber?: string;
    certificateInstitute?: string;
    company: mongoose.Types.ObjectId;
    price?: number;
    onDeal?: boolean;
    sold?: boolean;
  }

  const existingProducts = await Product.find({ certificateNumber: { $in: finalCertificateNumbers } })
    .select('_id certificateNumber certificateInstitute company price onDeal sold')
    .lean();
  const existingProductsMap = new Map<string, ExistingProductDoc>();
  let existingCount = 0;
  for (const doc of existingProducts) {
      if(doc.certificateNumber && doc._id && doc.company) {
        const certInst = doc.certificateInstitute ? String(doc.certificateInstitute).trim().toUpperCase() : '';
        const typedDoc: ExistingProductDoc = {
          _id: new mongoose.Types.ObjectId(String(doc._id)),
          certificateNumber: String(doc.certificateNumber),
          certificateInstitute: certInst || undefined,
          company: new mongoose.Types.ObjectId(String(doc.company)),
          price: typeof doc.price === 'number' ? doc.price : undefined,
          onDeal: typeof doc.onDeal === 'boolean' ? doc.onDeal : undefined,
          sold: typeof doc.sold === 'boolean' ? doc.sold : undefined,
        };
        // Key: certificateNumber|certificateInstitute — mirrors the unique index
        const mapKey = `${String(doc.certificateNumber).trim().toUpperCase()}|${certInst}`;
        existingProductsMap.set(mapKey, typedDoc);
        existingCount++;
      }
  }
  logger.info(`[handleProductSync] Found ${existingCount} existing products in database — Step 3: ${(performance.now() - tStep).toFixed(1)}ms`);

  // 4. Identify stale products from the current company for potential deletion
  tStep = performance.now();
  if (preDeleteStale) {
    const sourceCertNumbers = new Set(finalCertificateNumbers);
    const companyProducts = await Product.find({ company: companyIdAsObjectId })
      .select('_id certificateNumber onDeal sold')
      .lean<{ _id: mongoose.Types.ObjectId; certificateNumber?: string; onDeal?: boolean; sold?: boolean }[]>();
    
    for (const prod of companyProducts) {
      if (prod.onDeal || prod.sold) continue;
      if (prod.certificateNumber && prod._id && !sourceCertNumbers.has(String(prod.certificateNumber).trim().toUpperCase())) {
        operations.push({ deleteOne: { filter: { _id: new mongoose.Types.ObjectId(String(prod._id)) } } });
        stats.deletedStale++;
      }
    }
  }
  logger.info(`[handleProductSync] Step 4: Identify stale products: ${(performance.now() - tStep).toFixed(1)}ms`);

  // 5. Main processing loop with batch processing for better performance
  tStep = performance.now();
  const PROCESSING_BATCH_SIZE = 500; // Уменьшаем размер батча для стабильности
  const totalProducts = nonBlacklistedProducts.length;
  
  logger.info(`[handleProductSync] Processing ${totalProducts} products in batches of ${PROCESSING_BATCH_SIZE}`);

  for (let batchStart = 0; batchStart < totalProducts; batchStart += PROCESSING_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PROCESSING_BATCH_SIZE, totalProducts);
    const currentBatch = nonBlacklistedProducts.slice(batchStart, batchEnd);

    // Логируем только каждый 10-й батч для сокращения вывода
    if ((Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1) % 10 === 1) {
      logger.info(`[handleProductSync] Processing batch ${Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1}/${Math.ceil(totalProducts / PROCESSING_BATCH_SIZE)}`, { productsInBatch: currentBatch.length });
    }
    
    // Process batch with Promise.all for parallel processing
    const batchPromises = currentBatch.map(async (rawProduct) => {
      stats.processed++;
      const certNumValue = productUtils.getFieldValue(rawProduct, 'certificateNumber');
      const certificateNumber = certNumValue ? String(certNumValue).trim().toUpperCase() : null;

      if (!certificateNumber) {
        return null;
      }

      const { data: processedProduct, reason } = await productUtils.processProduct(
          rawProduct, companyId, stats, { allowMissingMedia, marketPriceCache }
      );
      
      return { rawProduct, processedProduct, reason, certificateNumber };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Process batch results
    for (const result of batchResults) {
      if (!result || !result.processedProduct) {
        if (result && result.rawProduct) {
          if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
            allProcessedProductsDetailed.push({ 
              sourceProduct: result.rawProduct, 
              status: 'Skipped', 
              reason: result.reason || 'processing_error' 
            });
          }
        }
        continue;
      }
      
      const { rawProduct, processedProduct, certificateNumber } = result;

      // Use cert+lab as the lookup key — matches the unique index definition
      const certInst = processedProduct.certificateInstitute
        ? String(processedProduct.certificateInstitute).trim().toUpperCase()
        : '';
      const existingProduct = existingProductsMap.get(`${certificateNumber}|${certInst}`);

    if (existingProduct) {
      if (existingProduct.onDeal || existingProduct.sold) {
        stats.skippedExistingOnDealOrSold++;
        if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
          allProcessedProductsDetailed.push({
              sourceProduct: rawProduct, status: 'Skipped', reason: 'existing_on_deal_or_sold',
              systemId: existingProduct._id.toString(),
          });
        }
        continue;
      }
      
      const isSameCompany = existingProduct.company.toString() === companyId;

      if (isSameCompany) {
        stats.updated++;
        operations.push(createUpsertOperation(processedProduct, companyIdAsObjectId));
        if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
          allProcessedProductsDetailed.push({
            sourceProduct: rawProduct, finalData: processedProduct, status: 'Updated',
            systemId: existingProduct._id.toString(),
          });
        }
      } else {
        const newPrice = processedProduct.price ?? Infinity;
        const existingPrice = existingProduct.price ?? Infinity;

        if (newPrice < existingPrice) {
          stats.replacedOtherCompanyProduct++;
          operations.push(createUpsertOperation(processedProduct, companyIdAsObjectId));
          if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
            allProcessedProductsDetailed.push({
              sourceProduct: rawProduct, finalData: processedProduct, status: 'Updated',
              reason: 'replaced_other_company_product_due_to_lower_price',
              systemId: existingProduct._id.toString(),
            });
          }
        } else {
          stats.skippedCheaperExistsOtherCompany++;
          if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
            allProcessedProductsDetailed.push({
              sourceProduct: rawProduct, finalData: processedProduct, status: 'Skipped',
              reason: 'cheaper_version_exists_for_other_company',
              details: `Their price: ${existingPrice}, Your price: ${newPrice}`
            });
          }
        }
      }
    } else {
      stats.created++;
      operations.push(createUpsertOperation(processedProduct, companyIdAsObjectId));
      if (allProcessedProductsDetailed.length < MAX_ITEMS_FOR_DETAILED_REPORT) {
        allProcessedProductsDetailed.push({
          sourceProduct: rawProduct,
          finalData: processedProduct,
          status: 'Created',
        });
      }
      }
    }
    
    // Более агрессивная очистка памяти после каждого батча (логируем только каждый 20-й батч)
    if (global.gc) {
      try {
        global.gc();
        if ((Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1) % 20 === 1) {
          logger.debug(`[handleProductSync] Garbage collection after batch ${Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1}`);
        }
      } catch (gcError) {
        if ((Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1) % 20 === 1) {
          logger.warn(`[handleProductSync] GC error after batch ${Math.floor(batchStart / PROCESSING_BATCH_SIZE) + 1}`, { error: gcError });
        }
      }
    }

    // Small pause between batches to reduce load
    if (batchStart + PROCESSING_BATCH_SIZE < totalProducts) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  logger.info(`[handleProductSync] Step 5: Process and build operations: ${(performance.now() - tStep).toFixed(1)}ms`);

  // 5.5. Validate operations for duplicate certificate numbers
  const validatedOperations = [];
  const processedCertNumbers = new Set<string>();
  
  for (const operation of operations) {
    if (operation.updateOne && operation.updateOne.upsert) {
      const updateDoc = operation.updateOne.update as { $set?: Record<string, unknown> };
      const certNum = updateDoc.$set?.certificateNumber;
      if (certNum && typeof certNum === 'string' && processedCertNumbers.has(certNum)) {
        logger.warn(`[handleProductSync] Skipping duplicate upsert operation for certificate: ${certNum}`);
        continue;
      }
      if (certNum && typeof certNum === 'string') processedCertNumbers.add(certNum);
    }
    validatedOperations.push(operation);
  }
  
  if (validatedOperations.length !== operations.length) {
    logger.info(`[handleProductSync] Filtered ${operations.length - validatedOperations.length} duplicate operations`);
  }

  const operationTypes = {
    updateOne: validatedOperations.filter(op => op.updateOne).length,
    deleteOne: validatedOperations.filter(op => op.deleteOne).length
  };
  logger.info(`[handleProductSync] Operations to execute`, { upserts: operationTypes.updateOne, deletes: operationTypes.deleteOne });

  // 6. Execute database operations with batch processing
  tStep = performance.now();
  if (validatedOperations.length > 0) {
    const BATCH_SIZE = 100;
    const batches = [];
    
    for (let i = 0; i < validatedOperations.length; i += BATCH_SIZE) {
      batches.push(validatedOperations.slice(i, i + BATCH_SIZE));
    }
    
    logger.info(`[handleProductSync] Processing ${validatedOperations.length} operations in ${batches.length} batches`);

    let totalModified = 0, totalDeleted = 0;
    let errorCount = 0;

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        // Логируем только каждый 20-й батч операций для сокращения вывода
        if ((batchIndex + 1) % 20 === 1) {
          logger.info(`[handleProductSync] Processing batch ${batchIndex + 1}/${batches.length}`, { operationsInBatch: batch.length });
        }

        try {
          const result = await Product.bulkWrite(batch as never, {
            ordered: false,
            maxTimeMS: 90000,
            writeConcern: { w: 'majority', wtimeout: 90000 }
          });

          totalModified += result.modifiedCount + result.upsertedCount;
          totalDeleted += result.deletedCount;

          // Логируем результаты только для каждого 20-го батча
          if ((batchIndex + 1) % 20 === 1) {
            logger.info(`[handleProductSync] Batch ${batchIndex + 1} completed`, {
              upserted: result.upsertedCount,
              modified: result.modifiedCount,
              deleted: result.deletedCount
            });
          }

        } catch (batchError: unknown) {
          errorCount++;
          const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
          logger.error(`[handleProductSync] Batch ${batchIndex + 1} error`, { error: errorMessage });

          if (batchError && typeof batchError === 'object' && 'result' in batchError) {
            const errorWithResult = batchError as { result?: { result?: { nUpserted?: number; nModified?: number; nRemoved?: number } } };
            if (errorWithResult.result?.result) {
              const { nUpserted, nModified, nRemoved } = errorWithResult.result.result;
              totalModified += (nUpserted || 0) + (nModified || 0);
              totalDeleted += nRemoved || 0;

              if ((batchIndex + 1) % 20 === 1) {
                logger.info(`[handleProductSync] Batch ${batchIndex + 1} partial success`, {
                  upserted: nUpserted,
                  modified: nModified,
                  deleted: nRemoved,
                });
              }
            }
          }

          if (batchError && typeof batchError === 'object' && 'writeErrors' in batchError && Array.isArray((batchError as { writeErrors?: unknown[] }).writeErrors)) {
            const writeErrors = (batchError as { writeErrors: Array<{ code?: number; err?: { code?: number } }> }).writeErrors;
            const duplicateErrors = writeErrors.reduce((count, writeError) => {
              const code = writeError?.code ?? writeError?.err?.code;
              return code === 11000 ? count + 1 : count;
            }, 0);

            if (duplicateErrors > 0) {
              importDuplicatesCounter.inc({ stage: 'bulk_write' }, duplicateErrors);
              logger.warn('[handleProductSync] Duplicate key conflicts detected during bulk write', {
                batch: batchIndex + 1,
                duplicateErrors,
              });
            }

            if ((batchIndex + 1) % 20 === 1) {
              logger.warn(`[handleProductSync] Batch ${batchIndex + 1} had write errors`, {
                writeErrors: writeErrors.length,
                duplicateErrors,
              });
            }
          }
        }
        
        // Принудительная сборка мусора каждые 100 батчей (сократили частоту в 2 раза)
        if (batchIndex % 100 === 0 && global.gc) {
          try {
            global.gc();
            if ((batchIndex + 1) % 200 === 1) { // Логируем только каждый 200-й батч
              logger.debug(`[handleProductSync] Forced garbage collection after batch ${batchIndex + 1}`);
            }
          } catch (gcError) {
            if ((batchIndex + 1) % 200 === 1) {
              logger.warn(`[handleProductSync] GC error after batch ${batchIndex + 1}`, { error: gcError });
            }
          }
        }
        
        // Небольшая пауза между батчами для снижения нагрузки
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Уменьшаем паузу с 100ms до 50ms
        }
      }
      
      if (errorCount > 0) {
        logger.info(`[handleProductSync] All batches completed`, {
          totalUpsertedModified: totalModified,
          totalDeleted,
          errorCount
        });
      } else {
        logger.info(`[handleProductSync] All batches completed`, {
          totalUpsertedModified: totalModified,
          totalDeleted
        });
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[handleProductSync] Bulk write error', { error: errorMessage });

      if (error && typeof error === 'object' && 'writeErrors' in error && Array.isArray((error as { writeErrors?: Array<{ code?: number; err?: { code?: number } }> }).writeErrors)) {
        const writeErrors = (error as { writeErrors: Array<{ code?: number; err?: { code?: number } }> }).writeErrors;
        const duplicateErrors = writeErrors.reduce((count, writeError) => {
          const code = writeError?.code ?? writeError?.err?.code;
          return code === 11000 ? count + 1 : count;
        }, 0);
        if (duplicateErrors > 0) {
          importDuplicatesCounter.inc({ stage: 'bulk_write' }, duplicateErrors);
          logger.warn('[handleProductSync] Duplicate key conflicts detected in final bulk write error', {
            duplicateErrors,
          });
        }
      }

      if (error && typeof error === 'object' && 'result' in error) {
        const errorWithResult = error as { result?: { result?: { nUpserted?: number; nModified?: number; nRemoved?: number } }; writeErrors?: Array<{ err?: { code?: string | number } }> };
        if (errorWithResult.result?.result) {
          const { nUpserted, nModified, nRemoved } = errorWithResult.result.result;
          logger.info('[handleProductSync] Partial bulk write success', {
            upserted: nUpserted || 0,
            modified: nModified,
            deleted: nRemoved,
          });
          
          if (errorWithResult.writeErrors && Array.isArray(errorWithResult.writeErrors)) {
            const errorTypes = new Map<string | number, number>();
            errorWithResult.writeErrors.forEach((writeError) => {
              const code = writeError.err?.code ?? 'unknown';
              errorTypes.set(code, (errorTypes.get(code) || 0) + 1);
            });
            
            for (const [code, count] of errorTypes) {
              logger.warn('[handleProductSync] Bulk write error code occurrences', { code, count });
            }
            
            const reportNotes = Array.isArray(stats.reportNotes) ? stats.reportNotes : [];
            stats.reportNotes = [...reportNotes, 
              `Bulk write completed with errors: ${errorWithResult.writeErrors.length} failed operations`,
              `Partial success: ${nModified} modified, ${nRemoved} deleted`
            ];
          }
        }
      } else {
        const reportNotes = Array.isArray(stats.reportNotes) ? stats.reportNotes : [];
        stats.reportNotes = [...reportNotes, `Bulk write failed completely: ${errorMessage}`];
      }
    }
    
    // ФИНАЛЬНАЯ ОЧИСТКА ПАМЯТИ
    // Очищаем все ссылки на большие массивы
    batches.length = 0;
    validatedOperations.length = 0;
    operations.length = 0;

    // Очищаем дополнительные структуры данных
    nonBlacklistedProducts.length = 0;
    finalCertificateNumbers.length = 0;
    existingProductsMap.clear();

    // Принудительная сборка мусора в конце
    if (global.gc) {
      try {
        global.gc();
        logger.debug(`[handleProductSync] Final garbage collection completed`);
      } catch (gcError) {
        logger.warn(`[handleProductSync] Final GC error`, { error: gcError });
      }
    }

    // Дополнительная сборка мусора через небольшой интервал
    setTimeout(() => {
      if (global.gc) {
        try {
          global.gc();
          logger.debug(`[handleProductSync] Additional garbage collection after delay`);
        } catch (gcError) {
          logger.warn(`[handleProductSync] Additional GC error`, { error: gcError });
        }
      }
    }, 1000);
  }
  logger.info(`[handleProductSync] Step 6: Execute bulk write: ${(performance.now() - tStep).toFixed(1)}ms`);
  logger.info(`[handleProductSync] Total Execution Time: ${(performance.now() - tTotal).toFixed(1)}ms`);
} 