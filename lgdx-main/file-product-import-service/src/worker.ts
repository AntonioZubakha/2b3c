/// <reference types="node" />
import mongoose from "mongoose";
import * as amqp from "amqplib";
import * as fs from "fs/promises";
import * as path from "path";
import csv from "csv-parser";
import * as os from "os";
// Node built-ins (value imports for environments where only types are resolved)
interface NodeWriteStream {
  write(chunk: string, cb?: (err?: Error) => void): void;
  end(cb?: (err?: Error) => void): void;
}
interface StreamChain {
  on(event: string, handler: (...args: unknown[]) => void): StreamChain;
}
interface NodeReadStream {
  pipe(dest: unknown): StreamChain;
  on(event: string, handler: (...args: unknown[]) => void): StreamChain;
  destroy(err?: Error): void;
}
const nodeFs = require("fs") as {
  createReadStream: (...a: unknown[]) => NodeReadStream;
  createWriteStream: (...a: unknown[]) => NodeWriteStream;
};
const createReadStream = nodeFs.createReadStream.bind(nodeFs) as (
  ...args: unknown[]
) => NodeReadStream;
const createWriteStream = nodeFs.createWriteStream.bind(nodeFs) as (
  ...args: unknown[]
) => NodeWriteStream;
import Product from "./models/Product";
import Company from "./models/Company";
import {
  sendSyncStartNotification,
  sendSyncSuccessNotification,
  sendSyncErrorNotification,
  sendSyncProgressNotification,
} from "./shared/telegramBot";
import { ProductProcessingStats } from "./shared/productUtils";
import {
  processProduct,
  RawProductData,
  COLUMN_MAPPINGS,
  getFieldValue,
  findMatchingField,
} from "./shared/productUtils";
import { generateSyncReport } from "./shared/reportUtils";
import { getMarketPriceCache } from "./shared/syncUtils";
import { getMarketPriceCacheStatus } from "./shared/marketPriceCacheClient";
import { refreshGlobalParserAliases } from "./shared/parserAliasesConfig";
import * as ExcelJS from "exceljs";
import { logger } from "./shared/logger";
import { getRedisLockManager } from "./shared/redisLock";
import { excelValueToImportString } from "./shared/excelCellValue";
import {
  shouldApplySupplierCsvPreclean,
  streamSupplierCsvPreclean,
} from "./csv/supplierCsvPreclean";

import { ICompany } from "./types";

const LOG_DETAILED_PRODUCTS = process.env.LOG_DETAILED_PRODUCTS === "true";
const GLOBAL_SYNC_LOCK_KEY =
  process.env.GLOBAL_SYNC_LOCK_KEY || "sync:lock:global";

class ResourceBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBusyError";
  }
}

export interface FileUploadTaskPayload {
  filePath: string;
  userId?: string; // Опционально для FTP
  companyDoc: Partial<ICompany> & { _id: mongoose.Types.ObjectId };
  companyName: string;
  originalFileName: string;
  /** 'append' is deprecated and normalized to 'add' at runtime */
  uploadMode: "replace" | "add" | "append";
  source?: "web" | "ftp" | "legacy_ftp"; // web = manual, ftp = ftp-product-sync, legacy_ftp = legacy-ftp-poller
  ftpSessionId?: string; // НОВОЕ: для FTP сессии
  uploadedAt?: string; // НОВОЕ: время загрузки
  fileSize?: number; // НОВОЕ: размер файла
}

// Global variables for connection management
// Note: Using 'any' for amqplib types due to library type limitations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;
let isProcessing = false;

const QUEUE_NAME = "file_upload_tasks";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27018/lgdx";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";

/**
 * Initialize connections to MongoDB and RabbitMQ
 */
async function initializeConnections(): Promise<void> {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    logger.info("[FileWorker] Connected to MongoDB");

    // Connect to RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Ensure queue exists
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Set prefetch to process one message at a time
    await channel.prefetch(1);

    logger.info(
      "[FileWorker] Connected to RabbitMQ and ready to process file upload tasks",
    );
  } catch (error) {
    logger.error(
      "[FileWorker] Failed to initialize connections: " +
        (error as Error)?.message,
    );
    throw error;
  }
}

/**
 * Start the worker to process file upload tasks
 */
export async function startWorker(): Promise<void> {
  try {
    await initializeConnections();

    if (!channel) {
      throw new Error("RabbitMQ channel not initialized");
    }

    logger.info("[FileWorker] Starting file import worker...");

    // Start consuming messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await channel.consume(QUEUE_NAME, async (msg: any) => {
      if (!msg) return;

      try {
        const payload: FileUploadTaskPayload = JSON.parse(
          msg.content.toString(),
        );
        logger.info(`[FileWorker] Received file upload task`);

        await processFileUploadTask(payload);

        // Acknowledge the message
        channel!.ack(msg);
        logger.info(
          `[FileWorker] File upload task completed for company: ${payload.companyName}`,
        );
      } catch (error) {
        logger.error(
          "[FileWorker] Error processing file upload task: " +
            (error as Error)?.message,
        );

        // Reject the message and don't requeue (to avoid infinite loops)
        channel!.nack(msg, false, false);
      }
    });

    logger.info(
      "[FileWorker] File import worker is running. Waiting for tasks...",
    );
  } catch (error) {
    logger.error(
      "[FileWorker] Failed to start worker: " + (error as Error)?.message,
    );
    process.exit(1);
  }
}

/**
 * Process a single file upload task
 */
export async function processFileUploadTask(
  payload: FileUploadTaskPayload,
): Promise<void> {
  await refreshGlobalParserAliases();
  const {
    filePath,
    userId,
    companyDoc,
    companyName,
    originalFileName,
    uploadMode: rawMode,
  } = payload;
  // Normalize legacy 'append' to 'add' (UI and API use only replace | add)
  const uploadMode: "replace" | "add" =
    (rawMode === "append" ? "add" : rawMode) || "replace";

  const redisLockManager = getRedisLockManager();

  // 🔒 GLOBAL LOCK: only one heavy job at a time across the whole system
  const globalLockValue = `file-sync-global-${companyDoc._id.toString()}-${Date.now()}`;
  const globalLockAcquired = await redisLockManager.acquireLock(
    GLOBAL_SYNC_LOCK_KEY,
    globalLockValue,
    300,
  );
  if (!globalLockAcquired) {
    const lockInfo = await redisLockManager.getLockInfo(GLOBAL_SYNC_LOCK_KEY);
    logger.warn(
      "[FileWorker] 🔒 Global sync lock busy — requeue later",
      lockInfo,
    );
    throw new ResourceBusyError("Global sync lock busy");
  }

  // 🔒 DISTRIBUTED LOCK: Try to acquire Redis lock for this company
  const companyId = companyDoc._id.toString();
  const lockKey = `sync:lock:${companyId}`;
  const lockValue = `file-sync-${companyId}-${Date.now()}`;

  const lockTtlSeconds = Number(
    process.env.FILE_IMPORT_LOCK_TTL_SECONDS || 2400,
  ); // 40 min default (was 600 = 10 min)
  const lockAcquired = await redisLockManager.acquireLock(
    lockKey,
    lockValue,
    lockTtlSeconds,
  );

  if (!lockAcquired) {
    // Check who owns the lock
    const lockInfo = await redisLockManager.getLockInfo(lockKey);
    logger.warn(
      `[FileWorker] 🔒 Company sync already in progress for ${companyName}`,
      lockInfo,
    );
    logger.warn("[FileWorker] File upload deferred due to company lock");
    await redisLockManager.releaseLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue);
    throw new ResourceBusyError("Company sync lock busy");
  }

  logger.info(`[FileWorker] 🔒 Acquired distributed lock for ${companyName}`);

  if (isProcessing) {
    logger.warn(
      "[FileWorker] Another file processing is already in progress, skipping...",
    );
    await redisLockManager.releaseLock(lockKey, lockValue);
    await redisLockManager.releaseLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue);
    return;
  }

  isProcessing = true;
  const syncStartTime = new Date();

  // Initialize statistics
  const stats: ProductProcessingStats = {
    totalUploaded: 0,
    processed: 0,
    created: 0,
    updated: 0,
    skippedByBlacklist: 0,
    skippedByDuplicateInSource: 0,
    skippedExistingOnDealOrSold: 0,
    skippedInvalidStatus: 0,
    skippedInvalidColor: 0,
    skippedInvalidClarity: 0,
    skippedInvalidPrice: 0,
    skippedInvalidCarat: 0,
    skippedMissingMedia: 0,
    skippedMissingCertNumber: 0,
    skippedNotLabGrown: 0,
    skippedAnomalousPricePerCarat: 0,
    apiErrors: 0,
    skippedByApiFilter: 0,
    replacedOtherCompanyProduct: 0,
    skippedCheaperExistsOtherCompany: 0,
    deletedStale: 0,
    skippedInvalidData: 0,
    errors: [],
  };

  // Массив для сбора детальной информации о продуктах
  type DetailedReport = {
    sourceProduct?: RawProductData;
    finalData?: Record<string, unknown>;
    status: string;
    reason?: string;
    systemId?: string;
  };

  const allProcessedProductsDetailed: DetailedReport[] = [];

  type ExistingProductCacheEntry = {
    _id: mongoose.Types.ObjectId;
    company: mongoose.Types.ObjectId;
    isOnDealOrSold?: boolean;
    onDeal?: boolean;
    sold?: boolean;
  };

  /** Process one chunk of raw products (used for chunked large XLSX). Mutates state.
   * When isLastChunk is false, details are not pushed (report is generated only for the last chunk). */
  // Per-chunk global existing map shared across chunks for cross-company price checks.
  // Keyed by normalised certificateNumber; holds the lowest-price entry across all companies.
  type ChunkGlobalEntry = {
    _id: mongoose.Types.ObjectId;
    company: mongoose.Types.ObjectId;
    price?: number;
    onDeal?: boolean;
    sold?: boolean;
  };

  async function processOneChunkOfProducts(
    chunkRawProducts: RawProductData[],
    isFirstChunk: boolean,
    isLastChunk: boolean,
    state: {
      seenCertificates: Set<string>;
      stats: ProductProcessingStats;
      allProcessedProductsDetailed: DetailedReport[];
      existingProductsMap: Map<string, ExistingProductCacheEntry>;
      globalExistingMap: Map<string, ChunkGlobalEntry>;
    },
    marketPriceCache: Map<string, number>,
    soldCertsSet: Set<string>,
  ): Promise<void> {
    const {
      seenCertificates,
      stats,
      allProcessedProductsDetailed: detailed,
      existingProductsMap,
      globalExistingMap,
    } = state;
    const filtered: RawProductData[] = [];
    for (const rawProduct of chunkRawProducts) {
      const certValue = getFieldValue(
        rawProduct,
        "certificateNumber",
        COLUMN_MAPPINGS.certificateNumber,
      );
      const certificateNumber = certValue
        ? String(certValue).trim().toUpperCase()
        : null;
      if (certificateNumber) {
        if (seenCertificates.has(certificateNumber)) {
          stats.skippedByDuplicateInSource =
            (stats.skippedByDuplicateInSource || 0) + 1;
          detailed.push({
            status: "Skipped",
            reason: "duplicate_certificate_in_source_file",
            sourceProduct: rawProduct,
          });
          continue;
        }
        seenCertificates.add(certificateNumber);
      }
      filtered.push(rawProduct);
    }
    const certificateList = filtered
      .map((p) => {
        const v = getFieldValue(
          p,
          "certificateNumber",
          COLUMN_MAPPINGS.certificateNumber,
        );
        return v ? String(v).trim().toUpperCase() : null;
      })
      .filter(Boolean) as string[];
    if (certificateList.length > 0) {
      // Query all companies so we can run cross-company price checks
      const existing = await Product.find({
        certificateNumber: { $in: certificateList }, // no company filter — global
      })
        .select("_id certificateNumber company price onDeal sold")
        .lean();
      for (const doc of existing) {
        if (!doc.certificateNumber) continue;
        const normalized = String(doc.certificateNumber).trim().toUpperCase();
        const ObjectIdCtor = mongoose.Types.ObjectId as unknown as new (
          id?: string,
        ) => mongoose.Types.ObjectId;
        const onDeal = Boolean((doc as { onDeal?: boolean }).onDeal);
        const sold = Boolean((doc as { sold?: boolean }).sold);
        const docPrice =
          typeof (doc as { price?: number }).price === "number"
            ? (doc as { price?: number }).price
            : undefined;
        const isSameCompany = String(doc.company) === companyDoc._id.toString();

        // Update global map with the cheapest entry
        const existingGlobal = globalExistingMap.get(normalized);
        if (
          !existingGlobal ||
          (docPrice !== undefined &&
            (existingGlobal.price === undefined ||
              docPrice < existingGlobal.price))
        ) {
          globalExistingMap.set(normalized, {
            _id: new ObjectIdCtor(String(doc._id)),
            company: new ObjectIdCtor(String(doc.company)),
            price: docPrice,
            onDeal,
            sold,
          });
        }

        // Build company-specific map for processProduct create/update detection
        if (isSameCompany) {
          const isOnDealOrSold = onDeal || sold;
          existingProductsMap.set(normalized, {
            _id: new ObjectIdCtor(String(doc._id)),
            company: new ObjectIdCtor(String(doc.company)),
            isOnDealOrSold,
            onDeal,
            sold,
          });
        }
      }
    }
    // No upfront deleteMany in replace mode — stale detection runs after all chunks complete.
    for (let i = 0; i < filtered.length; i++) {
      const rawProduct = filtered[i];
      const certValue = getFieldValue(
        rawProduct,
        "certificateNumber",
        COLUMN_MAPPINGS.certificateNumber,
      );
      const certNum = certValue ? String(certValue).trim().toUpperCase() : null;
      if (certNum && soldCertsSet.has(certNum)) {
        stats.skippedByBlacklist = (stats.skippedByBlacklist || 0) + 1;
        detailed.push({
          status: "Skipped",
          reason: "certificate_already_sold",
          sourceProduct: rawProduct,
        });
        stats.processed++;
        continue;
      }

      // Cross-company price check: prefer the cheaper source
      if (certNum) {
        const globalEntry = globalExistingMap.get(certNum);
        if (
          globalEntry &&
          globalEntry.company.toString() !== companyDoc._id.toString() &&
          !globalEntry.onDeal &&
          !globalEntry.sold
        ) {
          const priceRaw = getFieldValue(
            rawProduct,
            "price",
            COLUMN_MAPPINGS.price,
          );
          const incomingPrice =
            priceRaw !== null && priceRaw !== undefined
              ? parseFloat(String(priceRaw).replace(/,/g, ""))
              : NaN;
          const existingPrice = globalEntry.price ?? NaN;
          if (
            !isNaN(incomingPrice) &&
            !isNaN(existingPrice) &&
            incomingPrice >= existingPrice
          ) {
            stats.skippedCheaperExistsOtherCompany =
              (stats.skippedCheaperExistsOtherCompany || 0) + 1;
            detailed.push({
              status: "Skipped",
              reason: "cheaper_version_exists_for_other_company",
              sourceProduct: rawProduct,
            });
            stats.processed++;
            continue;
          }
        }
      }

      try {
        const result = await processProduct(
          rawProduct,
          companyDoc._id.toString(),
          stats,
          { marketPriceCache, existingProductsMap },
        );
        stats.processed++;
        if (isLastChunk)
          detailed.push({
            status: result.success
              ? result.action === "created"
                ? "Created"
                : "Updated"
              : "Skipped",
            reason: result.success ? undefined : result.reason,
            sourceProduct: rawProduct,
            systemId:
              result.success && result.data?._id
                ? result.data._id.toString()
                : undefined,
            finalData: result.success
              ? {
                  certificateNumber: (result.data as Record<string, unknown>)
                    ?.certificateNumber,
                  price: (result.data as Record<string, unknown>)?.price,
                  pricePerCarat: (result.data as Record<string, unknown>)
                    ?.pricePerCarat,
                  marketPrice: (result.data as Record<string, unknown>)
                    ?.marketPrice,
                  marketPricePerCarat: (result.data as Record<string, unknown>)
                    ?.marketPricePerCarat,
                  status: (result.data as Record<string, unknown>)?.status,
                }
              : undefined,
          });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        stats.skippedInvalidData = (stats.skippedInvalidData || 0) + 1;
        stats.errors.push({
          message: `Product ${i}: ${errorMessage}`,
          certificateNumber: String(rawProduct.certificateNumber || ""),
        });
        detailed.push({
          status: "Error",
          reason: errorMessage,
          sourceProduct: rawProduct,
        });
      }
    }
    stats.totalAfterDedup = (stats.totalAfterDedup || 0) + filtered.length;
    stats.prefetchedExisting = existingProductsMap.size;
  }

  // Heartbeat for locks (global + company) so they don't expire mid-import
  const LOCK_HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
  const heartbeat = setInterval(async () => {
    await redisLockManager.extendLock(
      GLOBAL_SYNC_LOCK_KEY,
      globalLockValue,
      5 * 60,
    );
    await redisLockManager.extendLock(lockKey, lockValue, lockTtlSeconds);
  }, LOCK_HEARTBEAT_INTERVAL);

  /** Temp file from supplier CSV preclean; cleaned on success or error */
  let supplierPrecleanTempPath: string | null = null;

  try {
    const source = payload.source || "web";
    const syncStartTime = Date.now();
    logger.info(
      `[FileWorker] Starting file processing for company: ${companyName} (File: ${originalFileName}, Source: ${source})`,
    );

    // Special handling for FTP files
    if (source === "ftp") {
      await handleFtpFileProcessing(payload);
    }

    // Send start notification with source information
    const notificationMessage =
      source === "ftp"
        ? `${companyName} - FTP File Import: ${originalFileName}`
        : source === "legacy_ftp"
          ? `${companyName} - Legacy FTP: ${originalFileName}`
          : `${companyName} - File Import: ${originalFileName}`;
    await sendSyncStartNotification(
      companyDoc._id.toString(),
      notificationMessage,
    );

    // Check if file exists - для FTP файлов путь уже правильный
    let actualFilePath = filePath;
    if (source === "ftp") {
      // filePath приходит как /app/ftp-data/{companyId}/{fileName} - уже правильный путь
      logger.info(`[FileWorker] FTP file path: ${filePath}`);
    }

    const fileExists = await checkFileExists(actualFilePath);
    if (!fileExists) {
      throw new Error(`File not found: ${actualFilePath}`);
    }

    if (shouldApplySupplierCsvPreclean(companyId, originalFileName)) {
      supplierPrecleanTempPath = path.join(
        os.tmpdir(),
        `lgdx-supplier-preclean-${companyId}-${Date.now()}.csv`,
      );
      logger.info(
        `[FileWorker] Streaming supplier CSV preclean for ${companyName} → ${supplierPrecleanTempPath}`,
      );
      try {
        const { rowsOut } = await streamSupplierCsvPreclean(
          actualFilePath,
          supplierPrecleanTempPath,
        );
        logger.info(
          `[FileWorker] Supplier CSV preclean finished (${rowsOut} rows after filters)`,
        );
        actualFilePath = supplierPrecleanTempPath;
      } catch (precleanErr) {
        await fs.unlink(supplierPrecleanTempPath).catch(() => {});
        supplierPrecleanTempPath = null;
        throw precleanErr;
      }
    }

    const MAX_IMPORT_BYTES = Number(
      process.env.MAX_IMPORT_BYTES || 50 * 1024 * 1024,
    );
    const fileStat = await fs.stat(actualFilePath);
    if (fileStat.size > MAX_IMPORT_BYTES) {
      throw new Error(
        `File size (${fileStat.size} bytes) exceeds allowed limit (${MAX_IMPORT_BYTES} bytes).`,
      );
    }

    const extension = path.extname(originalFileName).toLowerCase();
    const actualFormat =
      extension === ".xlsx" || extension === ".xls"
        ? await detectFileFormat(actualFilePath)
        : null;
    const isCsvContent =
      extension === ".csv" || actualFormat === "csv";
    const useChunkedXlsx =
      extension === ".xlsx" &&
      actualFormat === "xlsx" &&
      fileStat.size >= XLSX_STREAM_THRESHOLD_BYTES &&
      CHUNK_ROW_THRESHOLD > 0;
    const useChunkedCsv =
      isCsvContent &&
      fileStat.size >= XLSX_STREAM_THRESHOLD_BYTES &&
      CHUNK_ROW_THRESHOLD > 0;
    const useChunked = useChunkedXlsx || useChunkedCsv;
    let reportLastChunkOnly = false;

    if (useChunked) {
      reportLastChunkOnly = true;
      const tempDir = path.join(
        os.tmpdir(),
        `lgdx-chunks-${companyId}-${Date.now()}`,
      );
      let chunkPaths: string[];
      if (useChunkedCsv) {
        logger.info(
          `[FileWorker] Large CSV (${Math.round(fileStat.size / 1024 / 1024)}MB), processing in chunks of ${CHUNK_SIZE} rows`,
        );
        ({ paths: chunkPaths } = await streamCsvToChunkFiles(
          actualFilePath,
          CHUNK_SIZE,
          tempDir,
        ));
      } else {
        logger.info(
          `[FileWorker] Large XLSX (${Math.round(fileStat.size / 1024 / 1024)}MB), processing in chunks of ${CHUNK_SIZE} rows`,
        );
        ({ paths: chunkPaths } = await streamExcelToChunkFiles(
          actualFilePath,
          CHUNK_SIZE,
          tempDir,
        ));
      }
      stats.totalUploaded = 0;

      logger.info("[FileWorker] Loading market price cache...");
      const marketPriceCache = await getMarketPriceCache();
      const cacheStatus = getMarketPriceCacheStatus();
      logger.info("[FileWorker] Market price cache ready", {
        size: marketPriceCache.size,
        version: cacheStatus.version,
      });
      const soldCertDocs = await Product.find(
        { status: "Sold" },
        { certificateNumber: 1 },
      ).lean();
      const soldCertsSet = new Set(
        soldCertDocs
          .map((c) =>
            String(
              (c as { certificateNumber?: string }).certificateNumber || "",
            )
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      if (soldCertsSet.size > 0) {
        logger.info("[FileWorker] Loaded sold certificate numbers for filter", {
          count: soldCertsSet.size,
        });
      }

      const chunkState = {
        seenCertificates: new Set<string>(),
        stats,
        allProcessedProductsDetailed,
        existingProductsMap: new Map<string, ExistingProductCacheEntry>(),
        globalExistingMap: new Map<
          string,
          {
            _id: mongoose.Types.ObjectId;
            company: mongoose.Types.ObjectId;
            price?: number;
            onDeal?: boolean;
            sold?: boolean;
          }
        >(),
      };
      const redisLockManager = getRedisLockManager();
      for (let ci = 0; ci < chunkPaths.length; ci++) {
        const chunkRaw = await parseCsvFile(chunkPaths[ci]);
        stats.totalUploaded += chunkRaw.length;
        logger.info(
          `[FileWorker] Processing chunk ${ci + 1}/${chunkPaths.length} (${chunkRaw.length} rows)`,
        );
        await processOneChunkOfProducts(
          chunkRaw,
          ci === 0,
          ci === chunkPaths.length - 1,
          chunkState,
          marketPriceCache,
          soldCertsSet,
        );
        logger.info(
          `[FileWorker] Chunk ${ci + 1}/${chunkPaths.length} processing complete`,
        );
        await fs.unlink(chunkPaths[ci]).catch(() => {});
        if (ci < chunkPaths.length - 1) {
          await redisLockManager.extendLock(lockKey, lockValue, lockTtlSeconds);
        }
      }
      await fs.rm(tempDir, { recursive: true }).catch(() => {});

      // Replace mode: delete products that were in DB but absent from the file
      if (uploadMode === "replace") {
        const allCompanyProducts = await Product.find({
          company: companyDoc._id,
          onDeal: { $ne: true },
          sold: { $ne: true },
        })
          .select("_id certificateNumber")
          .lean();

        const staleIds: mongoose.Types.ObjectId[] = [];
        for (const prod of allCompanyProducts) {
          if (!prod.certificateNumber) continue;
          const norm = String(prod.certificateNumber).trim().toUpperCase();
          if (!chunkState.seenCertificates.has(norm)) {
            staleIds.push(prod._id as mongoose.Types.ObjectId);
          }
        }

        if (staleIds.length > 0) {
          const STALE_BATCH = 500;
          let totalDeleted = 0;
          for (let bi = 0; bi < staleIds.length; bi += STALE_BATCH) {
            const batch = staleIds.slice(bi, bi + STALE_BATCH);
            const delResult = await Product.deleteMany({ _id: { $in: batch } });
            totalDeleted += delResult.deletedCount || 0;
          }
          stats.deletedStale = totalDeleted;
          logger.info(
            `[FileWorker] Replace mode (chunked): deleted ${totalDeleted} stale products for ${companyName}`,
          );
        }
      }
    } else {
      // Parse file based on extension (non-chunked path)
      const rawProducts = await parseFile(actualFilePath, originalFileName);
      stats.totalUploaded = rawProducts.length;

      const seenCertificates = new Set<string>();
      const filteredRawProducts: RawProductData[] = [];

      for (const rawProduct of rawProducts) {
        const certificateValue = getFieldValue(
          rawProduct,
          "certificateNumber",
          COLUMN_MAPPINGS.certificateNumber,
        );
        const certificateNumber = certificateValue
          ? String(certificateValue).trim().toUpperCase()
          : null;

        if (certificateNumber) {
          if (seenCertificates.has(certificateNumber)) {
            stats.skippedByDuplicateInSource =
              (stats.skippedByDuplicateInSource || 0) + 1;
            allProcessedProductsDetailed.push({
              status: "Skipped",
              reason: "duplicate_certificate_in_source_file",
              sourceProduct: rawProduct,
            });
            continue;
          }
          seenCertificates.add(certificateNumber);
        }

        filteredRawProducts.push(rawProduct);
      }

      const certificateList = Array.from(seenCertificates);

      // Fetch existing products across ALL companies so we can:
      //  a) tell create vs update for this company's own products
      //  b) apply cross-company cheaper-price skip logic
      const existingProductsRaw =
        certificateList.length > 0
          ? await Product.find({
              certificateNumber: { $in: certificateList }, // no company filter — global
            })
              .select("_id certificateNumber company price onDeal sold")
              .lean()
          : [];

      // Global map (lowest-price entry across all companies) — for cross-company check
      type GlobalExistingEntry = {
        _id: mongoose.Types.ObjectId;
        company: mongoose.Types.ObjectId;
        price?: number;
        onDeal?: boolean;
        sold?: boolean;
      };
      const globalExistingMap = new Map<string, GlobalExistingEntry>();

      // Company-specific map — for processProduct to detect create vs update
      type ExistingProductCacheEntry = {
        _id: mongoose.Types.ObjectId;
        company: mongoose.Types.ObjectId;
        isOnDealOrSold?: boolean;
        onDeal?: boolean;
        sold?: boolean;
      };
      const existingProductsMap = new Map<string, ExistingProductCacheEntry>();

      for (const doc of existingProductsRaw) {
        if (!doc.certificateNumber) continue;
        const normalized = String(doc.certificateNumber).trim().toUpperCase();
        const ObjectIdCtor = mongoose.Types.ObjectId as unknown as new (
          id?: string,
        ) => mongoose.Types.ObjectId;
        const onDeal = Boolean((doc as { onDeal?: boolean }).onDeal);
        const sold = Boolean((doc as { sold?: boolean }).sold);
        const docPrice =
          typeof (doc as { price?: number }).price === "number"
            ? (doc as { price?: number }).price
            : undefined;
        const isSameCompany = String(doc.company) === companyDoc._id.toString();

        // Build global map — keep the entry with the lowest price
        const existingGlobal = globalExistingMap.get(normalized);
        if (
          !existingGlobal ||
          (docPrice !== undefined &&
            (existingGlobal.price === undefined ||
              docPrice < existingGlobal.price))
        ) {
          globalExistingMap.set(normalized, {
            _id: new ObjectIdCtor(String(doc._id)),
            company: new ObjectIdCtor(String(doc.company)),
            price: docPrice,
            onDeal,
            sold,
          });
        }

        // Build company-specific map for processProduct
        if (isSameCompany) {
          const isOnDealOrSold = onDeal || sold;
          existingProductsMap.set(normalized, {
            _id: new ObjectIdCtor(String(doc._id)),
            company: new ObjectIdCtor(String(doc.company)),
            isOnDealOrSold,
            onDeal,
            sold,
          });
        }
      }

      stats.totalAfterDedup = filteredRawProducts.length;
      stats.prefetchedExisting = existingProductsMap.size;

      if (stats.skippedByDuplicateInSource) {
        logger.info(
          "[FileWorker] Deduplicated duplicate entries from source file",
          {
            skippedByDuplicateInSource: stats.skippedByDuplicateInSource,
            remaining: filteredRawProducts.length,
          },
        );
      }

      if (existingProductsMap.size > 0) {
        logger.info("[FileWorker] Prefetched existing products for import", {
          existing: existingProductsMap.size,
        });
      }

      // Load market price cache for product processing
      logger.info("[FileWorker] Loading market price cache...");
      const marketPriceCache = await getMarketPriceCache();
      const cacheStatus = getMarketPriceCacheStatus();
      logger.info("[FileWorker] Market price cache ready", {
        size: marketPriceCache.size,
        version: cacheStatus.version,
        source: cacheStatus.lastSource,
        generatedAt: cacheStatus.generatedAt,
      });
      if (marketPriceCache.size === 0) {
        logger.warn("[FileWorker] Market price cache is empty after refresh");
      }

      // Load sold certificate numbers (skip re-import of sold stones)
      const soldCertDocs = await Product.find(
        { status: "Sold" },
        { certificateNumber: 1 },
      ).lean();
      const soldCertsSet = new Set(
        soldCertDocs
          .map((c) =>
            String(
              (c as { certificateNumber?: string }).certificateNumber || "",
            )
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      if (soldCertsSet.size > 0) {
        logger.info("[FileWorker] Loaded sold certificate numbers for filter", {
          count: soldCertsSet.size,
        });
      }

      // In replace mode we no longer bulk-delete upfront — that destroyed the create/update
      // distinction and caused everything to be re-created from scratch.
      // Stale products (present in DB but absent from the incoming file) are deleted AFTER
      // all products have been processed, using the seenCertificates set as the reference.
      const isReplaceMode = uploadMode === "replace";

      // Process each product
      for (let i = 0; i < filteredRawProducts.length; i++) {
        const rawProduct = filteredRawProducts[i];
        const certValue = getFieldValue(
          rawProduct,
          "certificateNumber",
          COLUMN_MAPPINGS.certificateNumber,
        );
        const certNum = certValue
          ? String(certValue).trim().toUpperCase()
          : null;
        if (certNum && soldCertsSet.has(certNum)) {
          stats.skippedByBlacklist = (stats.skippedByBlacklist || 0) + 1;
          allProcessedProductsDetailed.push({
            status: "Skipped",
            reason: "certificate_already_sold",
            sourceProduct: rawProduct,
          });
          stats.processed++;
          continue;
        }

        // Cross-company price check: if another supplier already lists this cert at a
        // lower-or-equal price (and it is not tied to a deal/sold), skip this supplier's
        // version — we keep the cheaper source.
        if (certNum) {
          const globalEntry = globalExistingMap.get(certNum);
          if (
            globalEntry &&
            globalEntry.company.toString() !== companyDoc._id.toString() &&
            !globalEntry.onDeal &&
            !globalEntry.sold
          ) {
            const priceRaw = getFieldValue(
              rawProduct,
              "price",
              COLUMN_MAPPINGS.price,
            );
            const incomingPrice =
              priceRaw !== null && priceRaw !== undefined
                ? parseFloat(String(priceRaw).replace(/,/g, ""))
                : NaN;
            const existingPrice = globalEntry.price ?? NaN;
            if (
              !isNaN(incomingPrice) &&
              !isNaN(existingPrice) &&
              incomingPrice >= existingPrice
            ) {
              stats.skippedCheaperExistsOtherCompany =
                (stats.skippedCheaperExistsOtherCompany || 0) + 1;
              allProcessedProductsDetailed.push({
                status: "Skipped",
                reason: "cheaper_version_exists_for_other_company",
                sourceProduct: rawProduct,
              });
              stats.processed++;
              continue;
            }
          }
        }

        // Логируем продукт перед валидацией
        if (LOG_DETAILED_PRODUCTS) {
          logger.debug(`[FileImport] Product ${i} before validation`);
          logger.debug(`[FileImport] Product ${i} keys`);
        }

        try {
          const result = await processProduct(
            rawProduct,
            companyDoc._id.toString(),
            stats,
            { marketPriceCache, existingProductsMap },
          );
          stats.processed++;

          // Собираем детальную информацию о продукте для отчета
          const productDetail: DetailedReport = {
            status: result.success
              ? result.action === "created"
                ? "Created"
                : "Updated"
              : "Skipped",
            reason: result.success ? undefined : result.reason,
            sourceProduct: rawProduct,
            systemId:
              result.success && result.data?._id
                ? result.data._id.toString()
                : undefined,
            finalData: result.success
              ? {
                  certificateNumber: (result.data as Record<string, unknown>)
                    ?.certificateNumber,
                  price: (result.data as Record<string, unknown>)?.price,
                  pricePerCarat: (result.data as Record<string, unknown>)
                    ?.pricePerCarat,
                  marketPrice: (result.data as Record<string, unknown>)
                    ?.marketPrice,
                  marketPricePerCarat: (result.data as Record<string, unknown>)
                    ?.marketPricePerCarat,
                  status: (result.data as Record<string, unknown>)?.status,
                }
              : undefined,
          };
          allProcessedProductsDetailed.push(productDetail);

          if (!result.success && LOG_DETAILED_PRODUCTS) {
            logger.debug(`[FileImport] Product ${i} skipped: ${result.reason}`);
          }
        } catch (error: unknown) {
          // Логируем ошибку валидации/сохранения
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `[FileImport] Product ${i} validation/saving error: ${errorMessage}`,
          );
          logger.error(`[FileImport] Product ${i} full error`);
          logger.error(`[FileImport] Product ${i} data`);
          stats.skippedInvalidData = (stats.skippedInvalidData || 0) + 1;
          stats.errors.push({
            message: `Product ${i}: ${errorMessage}`,
            certificateNumber: String(rawProduct.certificateNumber || ""),
          });

          // Добавляем информацию об ошибке в детальный отчет
          allProcessedProductsDetailed.push({
            status: "Error",
            reason: errorMessage,
            sourceProduct: rawProduct,
            systemId: undefined,
            finalData: undefined,
          });
        }
      }

      // Replace mode: detect and delete products that were in DB but absent from this file
      if (isReplaceMode) {
        const allCompanyProducts = await Product.find({
          company: companyDoc._id,
          onDeal: { $ne: true },
          sold: { $ne: true },
        })
          .select("_id certificateNumber")
          .lean();

        const staleIds: mongoose.Types.ObjectId[] = [];
        for (const prod of allCompanyProducts) {
          if (!prod.certificateNumber) continue;
          const norm = String(prod.certificateNumber).trim().toUpperCase();
          if (!seenCertificates.has(norm)) {
            staleIds.push(prod._id as mongoose.Types.ObjectId);
          }
        }

        if (staleIds.length > 0) {
          const STALE_BATCH = 500;
          let totalDeleted = 0;
          for (let bi = 0; bi < staleIds.length; bi += STALE_BATCH) {
            const batch = staleIds.slice(bi, bi + STALE_BATCH);
            const delResult = await Product.deleteMany({ _id: { $in: batch } });
            totalDeleted += delResult.deletedCount || 0;
          }
          stats.deletedStale = totalDeleted;
          logger.info(
            `[FileWorker] Replace mode: deleted ${totalDeleted} stale products for ${companyName}`,
          );
        }
      }
    } // end else (non-chunked path)

    const syncEndTime = new Date();
    (stats as unknown as Record<string, unknown>).duration = (
      (syncEndTime.getTime() - syncStartTime) /
      1000
    ).toFixed(2);

    // Generate report (can be slow for 400k+ rows)
    const REPORT_DETAIL_LIMIT = Number(
      process.env.FILE_IMPORT_REPORT_DETAIL_LIMIT || 10000,
    );
    const detailsForReport = (() => {
      const rows = allProcessedProductsDetailed;
      const limit = REPORT_DETAIL_LIMIT;
      if (rows.length <= limit) return rows;

      const priorityIndices: number[] = [];
      const successIndices: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const st = rows[i].status;
        if (st === "Skipped" || st === "Error") priorityIndices.push(i);
        else successIndices.push(i);
      }

      if (priorityIndices.length >= limit) {
        const chosen = priorityIndices.slice(-limit);
        return chosen.map((idx) => rows[idx]);
      }

      const needSuccess = limit - priorityIndices.length;
      const tailSuccess = successIndices.slice(-needSuccess);
      const chosenSorted = [...priorityIndices, ...tailSuccess].sort(
        (a, b) => a - b,
      );
      return chosenSorted.map((idx) => rows[idx]);
    })();

    const detailCount = detailsForReport.length;
    logger.info(
      `[FileWorker] Generating sync report (${detailCount} rows, limit=${REPORT_DETAIL_LIMIT}, richer-details=on)...`,
    );
    const reportPaths = await generateSyncReport(
      companyName,
      userId || "FTP-User", // Используем дефолтное значение для FTP
      stats,
      detailsForReport, // chunked: только последний чанк; иначе лимит: Skipped/Error в приоритете
      stats.errors || [],
      reportLastChunkOnly ? { lastChunkOnly: true } : undefined,
    );

    const syncSourceLabel =
      source === "legacy_ftp"
        ? "LEGACY FTP"
        : source === "ftp"
          ? "FTP"
          : "MANUAL";

    // Send success notification (before file cleanup so user is notified even if unlink fails)
    await sendSyncSuccessNotification(
      companyDoc._id.toString(),
      companyName,
      syncSourceLabel,
      stats,
      reportPaths,
    );

    // Clean up processed file(s) only after report and notification succeeded
    try {
      await fs.unlink(actualFilePath);
      logger.info(`[FileWorker] Cleaned up uploaded file: ${actualFilePath}`);
      if (supplierPrecleanTempPath && filePath !== actualFilePath) {
        await fs.unlink(filePath);
        logger.info(
          `[FileWorker] Removed original file after preclean: ${filePath}`,
        );
      }
    } catch (cleanupError) {
      logger.warn(`[FileWorker] Failed to clean up file: ${cleanupError}`);
    }

    // Update Company.lastSync so admin "Suppliers stock" shows last sync date (web + FTP)
    try {
      await Company.findByIdAndUpdate(companyDoc._id, {
        $set: { lastSync: syncEndTime },
      });
      logger.info(`[FileWorker] Updated Company.lastSync for ${companyName}`);
    } catch (updateErr) {
      logger.warn(
        `[FileWorker] Failed to update Company.lastSync: ${(updateErr as Error)?.message}`,
      );
    }

    logger.info("[FileWorker] Processing summary", {
      processed: stats.processed,
      created: stats.created,
      updated: stats.updated,
      skippedByDuplicateInSource: stats.skippedByDuplicateInSource,
      skippedExistingOnDealOrSold: stats.skippedExistingOnDealOrSold,
      totalAfterDedup: stats.totalAfterDedup,
      prefetchedExisting: stats.prefetchedExisting,
    });

    logger.info(
      `[FileWorker] File processing completed successfully for ${companyName}`,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[FileWorker] File processing failed for ${companyName}: ${errorMessage}`,
    );

    if (supplierPrecleanTempPath) {
      await fs.unlink(supplierPrecleanTempPath).catch(() => {});
      supplierPrecleanTempPath = null;
    }

    // Send error notification
    await sendSyncErrorNotification(
      companyDoc._id.toString(),
      companyName,
      `File Import: ${originalFileName}`,
      errorMessage,
    );

    stats.errors.push({ message: errorMessage });

    // Still update Company.lastSync (last attempt time) so admin sees activity
    try {
      await Company.findByIdAndUpdate(companyDoc._id, {
        $set: { lastSync: new Date() },
      });
    } catch (updateErr) {
      logger.warn(
        `[FileWorker] Failed to update Company.lastSync on error: ${(updateErr as Error)?.message}`,
      );
    }
  } finally {
    clearInterval(heartbeat);
    // 🔓 ALWAYS release distributed lock
    await redisLockManager.releaseLock(lockKey, lockValue);
    await redisLockManager.releaseLock(GLOBAL_SYNC_LOCK_KEY, globalLockValue);
    logger.info(`[FileWorker] 🔓 Released distributed lock for ${companyName}`);

    isProcessing = false;
  }
}

/**
 * Check if file exists
 */
async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Node Buffer (runtime value) for signature detection */
const NodeBuffer = (
  globalThis as unknown as {
    Buffer: {
      from(arr: number[]): Uint8Array;
      alloc(size: number): Uint8Array;
    };
  }
).Buffer;
/** Signature: ZIP (xlsx) starts with PK */
const XLSX_SIGNATURE = NodeBuffer.from([0x50, 0x4b]);
/** Signature: OLE Compound Document (legacy .xls) */
const XLS_OLE_SIGNATURE = NodeBuffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/**
 * Detect actual file format by reading first bytes (do not trust extension).
 * Many suppliers use .xls extension for CSV/text files.
 */
async function detectFileFormat(
  filePath: string,
): Promise<"xlsx" | "xls" | "csv"> {
  const fd = await fs.open(filePath, "r");
  try {
    const buf = NodeBuffer.alloc(8);
    const { bytesRead } = await fd.read(buf, 0, 8, 0);
    await fd.close();
    if (bytesRead < 2) return "csv";
    const head = buf.subarray(0, bytesRead);
    if (head[0] === XLSX_SIGNATURE[0] && head[1] === XLSX_SIGNATURE[1])
      return "xlsx";
    if (
      bytesRead >= 4 &&
      head[0] === XLS_OLE_SIGNATURE[0] &&
      head[1] === XLS_OLE_SIGNATURE[1] &&
      head[2] === XLS_OLE_SIGNATURE[2] &&
      head[3] === XLS_OLE_SIGNATURE[3]
    )
      return "xls";
    return "csv";
  } catch (e) {
    await fd.close().catch(() => {});
    return "csv";
  }
}

/**
 * Threshold (bytes) above which true XLSX is read via streaming/chunked path.
 * Same byte threshold enables CSV chunking for `.csv` and CSV-shaped `.xls`/`.xlsx`.
 * Default 30MB.
 */
const XLSX_STREAM_THRESHOLD_BYTES =
  Number(process.env.XLSX_STREAM_THRESHOLD_MB || "30") * 1024 * 1024;

/** When > 0, large XLSX/CSV may be split into chunk files (`FILE_IMPORT_CHUNK_SIZE` rows each). 0 = disabled. */
const CHUNK_ROW_THRESHOLD = Number(
  process.env.FILE_IMPORT_CHUNK_ROW_THRESHOLD || "100000",
);
/** Rows per chunk file when using chunked processing. */
const CHUNK_SIZE = Number(process.env.FILE_IMPORT_CHUNK_SIZE || "50000");

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return /[,"\r\n]/.test(s) ? `"${s}"` : s;
}

/**
 * Parse file based on extension, with fallback: .xls/.xlsx detected as text are parsed as CSV.
 * `.txt` is treated like CSV (legacy FTP vendors often use .txt for comma/tab-separated feeds).
 * For large .xlsx files uses streaming to avoid exceljs memory/zip issues.
 */
async function parseFile(
  filePath: string,
  originalFileName: string,
): Promise<RawProductData[]> {
  const extension = path.extname(originalFileName).toLowerCase();
  logger.info(`[FileWorker] Parsing file with extension: ${extension}`);

  if (extension === ".xlsx" || extension === ".xls") {
    const actualFormat = await detectFileFormat(filePath);
    if (actualFormat === "csv") {
      logger.info(
        `[FileWorker] File has .xls/.xlsx extension but content is text/CSV; parsing as CSV`,
      );
      return await parseCsvFile(filePath);
    }
    if (actualFormat === "xls") {
      return await parseExcelFile(filePath);
    }
    const stat = await fs.stat(filePath).catch(() => null);
    const useStreaming = stat && stat.size >= XLSX_STREAM_THRESHOLD_BYTES;
    if (useStreaming) {
      logger.info(
        `[FileWorker] Large XLSX (${Math.round(stat!.size / 1024 / 1024)}MB), using streaming parser`,
      );
      return await parseExcelFileStreaming(filePath);
    }
    return await parseExcelFile(filePath);
  }
  if (extension === ".csv" || extension === ".txt") {
    if (extension === ".txt") {
      logger.info(
        `[FileWorker] .txt extension — parsing as CSV (legacy / flat-text inventory feeds)`,
      );
    }
    return await parseCsvFile(filePath);
  }
  throw new Error(`Unsupported file format: ${extension}`);
}

/** Visit every column up to the row's max column so mid-row empty cells keep index alignment with headers. */
const EXCEL_EACH_CELL_OPTS = { includeEmpty: true };

/**
 * Placeholder for untitled header cells. Must not collide with COLUMN_MAPPINGS / findMatchingField.
 * Preserves one array slot per physical column (do not filter() empty headers out).
 */
const EMPTY_EXCEL_HEADER_PREFIX = "__LGDX_EMPTY_HEADER_COL_";

function mapExcelHeaderRowToFieldNames(rawHeaderCells: unknown[]): string[] {
  return rawHeaderCells.map((h, colIdx) => {
    if (h == null || h === "" || String(h).trim() === "") {
      return `${EMPTY_EXCEL_HEADER_PREFIX}${colIdx}`;
    }
    const headerStr = String(h).toLowerCase().trim();
    const mappedField = findMatchingField(headerStr);
    return mappedField || headerStr;
  });
}

function isSyntheticEmptyExcelHeader(header: string): boolean {
  return header.startsWith(EMPTY_EXCEL_HEADER_PREFIX);
}

function assignProductFromExcelRow(
  headers: string[],
  row: unknown[],
  product: RawProductData,
): void {
  headers.forEach((header, index) => {
    if (isSyntheticEmptyExcelHeader(header)) return;
    if (index >= row.length) return;
    const cellValue = row[index];
    const trimmed =
      cellValue == null
        ? ""
        : String(cellValue as string | number | boolean).trim();
    if (trimmed) {
      product[header] = trimmed;
    } else {
      product[header] = null;
    }
  });
}

/**
 * Parse Excel file with improved data handling and validation
 */
async function parseExcelFile(filePath: string): Promise<RawProductData[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    if (workbook.worksheets.length === 0) {
      throw new Error("Excel file contains no sheets");
    }

    // Do not rely on worksheet id = 1; some files have first sheet with a different id.
    const worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);

    if (!worksheet) {
      throw new Error("Cannot read the first sheet of the Excel file");
    }

    const jsonData: unknown[][] = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData: unknown[] = [];
      row.eachCell(EXCEL_EACH_CELL_OPTS, (cell, colNumber) => {
        rowData[colNumber - 1] = excelValueToImportString(
          cell.value,
          cell,
        ) as unknown;
      });
      jsonData.push(rowData);
    });

    if (jsonData.length === 0) {
      throw new Error("Excel file is empty");
    }

    if (jsonData.length < 2) {
      throw new Error(
        "Excel file must contain at least headers and one data row",
      );
    }

    // First row as headers — keep one slot per column (empty title → synthetic key) so data rows align by index.
    const headers = mapExcelHeaderRowToFieldNames(jsonData[0] as unknown[]);

    if (
      headers.length === 0 ||
      headers.every((h) => isSyntheticEmptyExcelHeader(h))
    ) {
      throw new Error("Excel file has no valid headers");
    }

    const products: RawProductData[] = [];
    const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS || 20000);

    // Process data rows
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[];

      // Skip completely empty rows
      if (
        !row ||
        row.every((cell) => cell === null || cell === undefined || cell === "")
      ) {
        continue;
      }

      if (products.length >= MAX_ROWS) {
        throw new Error(
          `Row limit exceeded (${MAX_ROWS}). Aborting to prevent oversized import.`,
        );
      }
      const product: RawProductData = {};
      assignProductFromExcelRow(headers, row, product);

      // Only add product if it has at least some data
      if (
        Object.values(product).some((value) => value !== null && value !== "")
      ) {
        products.push(product);
      }
    }

    logger.info(
      `[FileWorker] Parsed ${products.length} products from Excel file (${headers.length} columns)`,
    );
    return products;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[FileWorker] Error parsing Excel file:", errorMessage);
    throw new Error(`Excel parsing failed: ${errorMessage}`);
  }
}

/**
 * Parse large XLSX file via streaming (row-by-row) to avoid "Invalid string length" and zip buffer issues.
 * Uses ExcelJS.stream.xlsx.WorkbookReader; only first sheet is read.
 */
async function parseExcelFileStreaming(
  filePath: string,
): Promise<RawProductData[]> {
  const WorkbookReader = (
    ExcelJS as unknown as {
      stream: {
        xlsx: {
          WorkbookReader: new (
            input: string,
            options?: { hyperlinks?: string },
          ) => AsyncIterable<{
            read(): Promise<void>;
            eachCell: (
              opts: { includeEmpty?: boolean },
              cb: (
                cell: {
                  value: unknown;
                  text?: string;
                  hyperlink?: unknown;
                },
                colNumber: number,
              ) => void,
            ) => void;
            [Symbol.asyncIterator](): AsyncIterator<unknown>;
          }>;
        };
      };
    }
  ).stream.xlsx.WorkbookReader;
  const workbookReader = new WorkbookReader(filePath, {
    hyperlinks: "cache",
  });
  let headers: string[] = [];
  const products: RawProductData[] = [];
  const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS || 20000);
  let rowIndex = 0;
  let firstSheetProcessed = false;

  try {
    for await (const worksheetReader of workbookReader) {
      if (firstSheetProcessed) {
        for await (const _ of worksheetReader) {
          /* drain rest of workbook so stream closes */
        }
        continue;
      }
      firstSheetProcessed = true;
      rowIndex = 0;
      for await (const row of worksheetReader) {
        const rowData: unknown[] = [];
        (
          row as {
            eachCell: (
              opts: { includeEmpty?: boolean },
              cb: (
                cell: { value: unknown; text?: string; hyperlink?: unknown },
                colNumber: number,
              ) => void,
            ) => void;
          }
        ).eachCell(EXCEL_EACH_CELL_OPTS, (
          cell: { value: unknown; text?: string; hyperlink?: unknown },
          colNumber: number,
        ) => {
          rowData[colNumber - 1] = excelValueToImportString(
            cell.value,
            cell,
          ) as unknown;
        });
        if (rowIndex === 0) {
          headers = mapExcelHeaderRowToFieldNames(rowData as unknown[]);
          if (
            headers.length === 0 ||
            headers.every((h) => isSyntheticEmptyExcelHeader(h))
          ) {
            throw new Error("Excel file has no valid headers");
          }
          rowIndex++;
          continue;
        }
        rowIndex++;
        if (
          !rowData ||
          rowData.every(
            (cell) => cell === null || cell === undefined || cell === "",
          )
        )
          continue;
        if (products.length >= MAX_ROWS) {
          throw new Error(
            `Row limit exceeded (${MAX_ROWS}). Aborting to prevent oversized import.`,
          );
        }
        const product: RawProductData = {};
        assignProductFromExcelRow(headers, rowData, product);
        if (
          Object.values(product).some((value) => value !== null && value !== "")
        ) {
          products.push(product);
        }
      }
    }
    if (headers.length === 0) {
      throw new Error("Excel file contains no sheets or is empty");
    }
    logger.info(
      `[FileWorker] Parsed ${products.length} products from Excel file (streaming, ${headers.length} columns)`,
    );
    return products;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      "[FileWorker] Error parsing Excel file (streaming):",
      errorMessage,
    );
    throw new Error(`Excel parsing failed: ${errorMessage}`);
  }
}

/**
 * Stream large XLSX to temp CSV chunk files (ExCut-style). Returns paths to chunk files.
 * Caller must unlink them after processing.
 */
async function streamExcelToChunkFiles(
  filePath: string,
  chunkSize: number,
  tempDir: string,
): Promise<{ paths: string[]; headers: string[] }> {
  const WorkbookReader = (
    ExcelJS as unknown as {
      stream: {
        xlsx: {
          WorkbookReader: new (
            input: string,
            options?: { hyperlinks?: string },
          ) => AsyncIterable<{
            eachCell: (
              opts: { includeEmpty?: boolean },
              cb: (
                cell: { value: unknown; text?: string; hyperlink?: unknown },
                colNumber: number,
              ) => void,
            ) => void;
            [Symbol.asyncIterator](): AsyncIterator<unknown>;
          }>;
        };
      };
    }
  ).stream.xlsx.WorkbookReader;
  const workbookReader = new WorkbookReader(filePath, {
    hyperlinks: "cache",
  });
  let headers: string[] = [];
  const chunkPaths: string[] = [];
  let rowIndex = 0;
  let firstSheetProcessed = false;
  let buffer: RawProductData[] = [];
  let chunkIndex = 0;

  const flushBuffer = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex + 1}.csv`);
    chunkIndex++;
    const stream = createWriteStream(chunkPath, { encoding: "utf8" });
    const headerLine = headers.map((h) => escapeCsvField(h)).join(",") + "\n";
    stream.write(headerLine);
    for (const row of buffer) {
      const line =
        headers
          .map((h) => escapeCsvField(row[h] == null ? null : String(row[h])))
          .join(",") + "\n";
      stream.write(line);
    }
    await new Promise<void>((resolve, reject) =>
      stream.end((err: Error | undefined) => (err ? reject(err) : resolve())),
    );
    chunkPaths.push(chunkPath);
    buffer = [];
  };

  try {
    await fs.mkdir(tempDir, { recursive: true });
    for await (const worksheetReader of workbookReader) {
      if (firstSheetProcessed) {
        for await (const _ of worksheetReader) {
          /* drain */
        }
        continue;
      }
      firstSheetProcessed = true;
      rowIndex = 0;
      for await (const row of worksheetReader) {
        const rowData: unknown[] = [];
        (
          row as {
            eachCell: (
              opts: { includeEmpty?: boolean },
              cb: (
                cell: { value: unknown; text?: string; hyperlink?: unknown },
                colNumber: number,
              ) => void,
            ) => void;
          }
        ).eachCell(EXCEL_EACH_CELL_OPTS, (
          cell: { value: unknown; text?: string; hyperlink?: unknown },
          colNumber: number,
        ) => {
          rowData[colNumber - 1] = excelValueToImportString(
            cell.value,
            cell,
          ) as unknown;
        });
        if (rowIndex === 0) {
          headers = mapExcelHeaderRowToFieldNames(rowData as unknown[]);
          if (
            headers.length === 0 ||
            headers.every((h) => isSyntheticEmptyExcelHeader(h))
          )
            throw new Error("Excel file has no valid headers");
          rowIndex++;
          continue;
        }
        rowIndex++;
        if (
          !rowData ||
          rowData.every(
            (cell) => cell === null || cell === undefined || cell === "",
          )
        )
          continue;
        const product: RawProductData = {};
        assignProductFromExcelRow(headers, rowData, product);
        if (
          Object.values(product).some((value) => value !== null && value !== "")
        ) {
          buffer.push(product);
          if (buffer.length >= chunkSize) await flushBuffer();
        }
      }
    }
    if (headers.length === 0)
      throw new Error("Excel file contains no sheets or is empty");
    await flushBuffer();
    logger.info(
      `[FileWorker] Split XLSX into ${chunkPaths.length} chunk files (${chunkSize} rows per chunk)`,
    );
    return { paths: chunkPaths, headers };
  } catch (error: unknown) {
    for (const p of chunkPaths) await fs.unlink(p).catch(() => {});
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[FileWorker] Error streaming XLSX to chunks:", errorMessage);
    throw new Error(`Excel chunking failed: ${errorMessage}`);
  }
}

/**
 * Stream a large source CSV into temp chunk CSV files (same shape as XLSX chunks: header + ≤chunkSize data rows).
 * Uses the same header mapping as {@link parseCsvFile}. Caller deletes chunk files after processing.
 */
async function streamCsvToChunkFiles(
  filePath: string,
  chunkSize: number,
  tempDir: string,
): Promise<{ paths: string[] }> {
  const chunkPaths: string[] = [];
  let headers: string[] | null = null;
  let buffer: RawProductData[] = [];
  let chunkIndex = 0;

  const flushBuffer = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex + 1}.csv`);
    chunkIndex++;
    const ws = createWriteStream(chunkPath, { encoding: "utf8" });
    const headerLine = headers!.map((h) => escapeCsvField(h)).join(",") + "\n";
    ws.write(headerLine);
    for (const row of buffer) {
      const line =
        headers!
          .map((h) => escapeCsvField(row[h] == null ? null : String(row[h])))
          .join(",") + "\n";
      ws.write(line);
    }
    await new Promise<void>((resolve, reject) =>
      ws.end((err: Error | undefined) => (err ? reject(err) : resolve())),
    );
    chunkPaths.push(chunkPath);
    buffer = [];
  };

  try {
    await fs.mkdir(tempDir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(filePath);
      const parser = csv({
        mapHeaders: ({ header }) => {
          const withoutBom = (header || "").replace(/^\uFEFF/, "");
          const normalizedHeader = withoutBom.toLowerCase().trim();
          const mappedField = findMatchingField(normalizedHeader);
          return mappedField || normalizedHeader;
        },
      });
      input.pipe(parser);

      let chain: Promise<void> = Promise.resolve();
      let settled = false;

      const enqueue = (fn: () => Promise<void>): void => {
        chain = chain.then(fn);
      };

      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        input.destroy();
        reject(err);
      };

      parser.on("data", (row: Record<string, unknown>) => {
        parser.pause();
        enqueue(async () => {
          try {
            const cleanedRow: RawProductData = {};
            Object.keys(row).forEach((key) => {
              const value = row[key]?.toString().trim();
              cleanedRow[key] = value === "" ? null : value;
            });
            if (!headers) {
              headers = Object.keys(cleanedRow);
              if (headers.length === 0) {
                return;
              }
            }
            const nonEmpty = Object.values(cleanedRow).some(
              (v) => v !== null && v !== "",
            );
            if (!nonEmpty) {
              return;
            }
            buffer.push(cleanedRow);
            if (buffer.length >= chunkSize) {
              await flushBuffer();
            }
          } catch (e) {
            fail(e instanceof Error ? e : new Error(String(e)));
          } finally {
            if (!settled) {
              parser.resume();
            }
          }
        });
      });

      parser.on("end", () => {
        enqueue(async () => {
          try {
            await flushBuffer();
            if (!headers || chunkPaths.length === 0) {
              throw new Error("CSV contains no data rows");
            }
            logger.info(
              `[FileWorker] Split CSV into ${chunkPaths.length} chunk files (${chunkSize} rows per chunk)`,
            );
          } catch (e) {
            throw e instanceof Error ? e : new Error(String(e));
          }
        });
        void chain
          .then(() => {
            if (!settled) {
              settled = true;
              resolve();
            }
          })
          .catch((e) => fail(e instanceof Error ? e : new Error(String(e))));
      });

      parser.on("error", (err: unknown) =>
        fail(err instanceof Error ? err : new Error(String(err))),
      );
      input.on("error", (err: unknown) =>
        fail(err instanceof Error ? err : new Error(String(err))),
      );
    });

    return { paths: chunkPaths };
  } catch (error: unknown) {
    for (const p of chunkPaths) await fs.unlink(p).catch(() => {});
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[FileWorker] Error streaming CSV to chunks:", errorMessage);
    throw new Error(`CSV chunking failed: ${errorMessage}`);
  }
}

/**
 * Parse CSV file with proper handling of quotes, commas and data types
 */
async function parseCsvFile(filePath: string): Promise<RawProductData[]> {
  return new Promise((resolve, reject) => {
    const products: RawProductData[] = [];
    const stream = createReadStream(filePath);
    const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS || 20000);
    const MAX_BYTES = Number(process.env.MAX_IMPORT_BYTES || 50 * 1024 * 1024);
    let seenBytes = 0;

    stream
      .pipe(
        csv({
          mapHeaders: ({ header }) => {
            const withoutBom = (header || "").replace(/^\uFEFF/, "");
            const normalizedHeader = withoutBom.toLowerCase().trim();
            const mappedField = findMatchingField(normalizedHeader);
            return mappedField || normalizedHeader;
          },
        }),
      )
      .on("data", ((row: Record<string, unknown>) => {
        // track raw throughput; bail if file looks suspiciously huge
        const chunkSize = JSON.stringify(row).length;
        seenBytes += chunkSize;
        if (seenBytes > MAX_BYTES) {
          stream.destroy(
            new Error(`CSV exceeds allowed size (${MAX_BYTES} bytes).`),
          );
          return;
        }
        // Clean up the data and convert empty strings to null
        const cleanedRow: RawProductData = {};
        Object.keys(row).forEach((key) => {
          const value = row[key]?.toString().trim();
          cleanedRow[key] = value === "" ? null : value;
        });

        // Логируем первые несколько строк для диагностики
        if (products.length < 3) {
          if (LOG_DETAILED_PRODUCTS) {
            logger.debug(
              `[DEBUG][CSVParser] Row ${products.length + 1}: ${JSON.stringify(cleanedRow)}`,
            );
            logger.debug(
              `[DEBUG][CSVParser] Row ${products.length + 1} keys: ${Object.keys(cleanedRow).join(",")}`,
            );
          }
        }

        if (products.length >= MAX_ROWS) {
          stream.destroy(new Error(`CSV row limit exceeded (${MAX_ROWS}).`));
          return;
        }
        products.push(cleanedRow);
      }) as (...args: unknown[]) => void)
      .on("end", () => {
        logger.info(
          `[FileWorker] Parsed ${products.length} products from CSV file`,
        );
        if (LOG_DETAILED_PRODUCTS) {
          logger.debug(
            `[CSVParser] All headers found: ${products.length > 0 ? Object.keys(products[0]).join(",") : "No products"}`,
          );
        }
        resolve(products);
      })
      .on("error", ((error: Error) => {
        logger.error("[FileWorker] Error parsing CSV file:", error);
        reject(error);
      }) as (...args: unknown[]) => void);
  });
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(): Promise<void> {
  logger.info("[FileWorker] Shutting down gracefully...");

  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    await mongoose.disconnect();

    logger.info("[FileWorker] Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error(
      "[FileWorker] Error during shutdown: " + (error as Error)?.message,
    );
    process.exit(1);
  }
}

// Handle shutdown signals
/**
 * Специальная обработка для FTP файлов
 */
async function handleFtpFileProcessing(
  payload: FileUploadTaskPayload,
): Promise<void> {
  try {
    const { companyDoc, originalFileName, source, fileSize, uploadedAt } =
      payload;

    logger.info(
      `[FileWorker] Handling FTP file processing for ${originalFileName}`,
    );

    // Логирование FTP активности
    await logFtpActivity(payload);

    // Уведомление о начале обработки FTP файла
    if (
      process.env.STOCK_TELEGRAM_BOT_TOKEN &&
      process.env.STOCK_TELEGRAM_CHAT_ID
    ) {
      const message =
        `📁 FTP File Processing Started\n` +
        `Company: ${companyDoc.name}\n` +
        `File: ${originalFileName}\n` +
        `Size: ${fileSize ? Math.round(fileSize / 1024) : "Unknown"} KB\n` +
        `Time: ${uploadedAt || new Date().toISOString()}`;

      // Здесь можно добавить отправку в Telegram (если нужно)
      logger.info(`[FileWorker] FTP processing notification: ${message}`);
    }

    // Обновление статистики FTP сессии (если есть sessionId)
    if (payload.ftpSessionId) {
      // Можно добавить обновление статистики FTP сессии
      logger.info(`[FileWorker] FTP Session ID: ${payload.ftpSessionId}`);
    }
  } catch (error) {
    logger.error("[FileWorker] Error in FTP file processing:", error);
    // Не прерываем основной процесс обработки файла
  }
}

/**
 * Логирование активности FTP
 */
async function logFtpActivity(payload: FileUploadTaskPayload): Promise<void> {
  try {
    const { companyDoc, originalFileName, source, fileSize, uploadedAt } =
      payload;

    const logEntry = {
      timestamp: uploadedAt || new Date().toISOString(),
      companyId: companyDoc._id,
      companyName: companyDoc.name,
      fileName: originalFileName,
      fileSize: fileSize || 0,
      source: source || "unknown",
      status: "processing_started",
    };

    logger.info("[FileWorker] FTP Activity logged", logEntry);

    // Здесь можно добавить сохранение в специальную коллекцию для аудита FTP активности
    // const FtpAuditLog = mongoose.model('FtpAuditLog', ftpAuditSchema);
    // await FtpAuditLog.create(logEntry);
  } catch (error) {
    logger.error("[FileWorker] Error logging FTP activity:", error);
  }
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start the worker if this file is run directly
if (require.main === module) {
  startWorker().catch((error) => {
    logger.error("[FileWorker] Failed to start:", error);
    process.exit(1);
  });
}
