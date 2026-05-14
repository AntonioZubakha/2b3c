import express, { Express, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";
import fs from "fs";
import crypto from "crypto";
import compression from "compression";
import initializeSocket from "./socket";
import { initDealMonitorCron } from "./services/dealMonitorService";
import ChatWebSocketService from "./services/chatWebSocketService";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler";
import {
  initializeMessageBroker,
  closeMessageBroker,
} from "./services/messageBroker";
import healthRouter from "./routes/health";
import cspReportRouter from "./routes/csp";
import clientLogsRoutes from "./routes/clientLogs";
import systemHealthMonitor from "./services/systemHealthMonitor";
import { trackPageView } from "./middleware/analyticsMiddleware";
import csrfProtection from "./middleware/csrf";
// REMOVED: MarketAnalyticsScheduler - moved to analytics-service
// REMOVED: SmartAnalyticsScheduler - moved to analytics-service
import { logger } from "./utils/logger";
import { getErrorMessage } from "./utils/errorHelpers";
import {
  optimizeDatabaseIndexes,
  optimizeMongoDBSettings,
  analyzeQueryPerformance,
} from "./config/databaseOptimization";
import {
  performanceMiddleware,
  memoryMonitorMiddleware,
  databasePerformanceMiddleware,
} from "./middleware/performanceMiddleware";
import {
  initGracefulShutdown,
  registerCleanup,
} from "./utils/gracefulShutdown";
import { metricsMiddleware, metricsRouter } from "./utils/metrics";
import {
  isWhatsAppIntegrationEnabled,
  warmWhatsAppMarketingPromptAtStartup,
} from "./whatsapp/whatsappConfig";
import {
  warmMarketplaceAggregates,
  startMarketplaceAggregatesRefresher,
  stopMarketplaceAggregatesRefresher,
} from "./controllers/marketplaceController";
import cacheService from "./services/cacheService";

// Check if forced garbage collection is available
const hasGc = typeof global.gc === "function";
if (!hasGc) {
  logger.warn(
    "[index.ts] Forced garbage collection is not available. Run the application with the --expose-gc flag to enable this feature.",
  );
} else {
  logger.info(
    "[index.ts] Forced garbage collection is available and will be used automatically.",
  );
  // Automatic garbage collection every 10 minutes
  /*
  setInterval(() => {
    if (global.gc) {
      global.gc();
    }
  }, 10 * 60 * 1000);
  */
}

// Load environment variables
dotenv.config();

// Diagnostic log - REMOVED
// console.log('[index.ts] Loaded ADMIN_SECRET_KEY:', process.env.ADMIN_SECRET_KEY);
// console.log('[index.ts] Loaded JWT_SECRET:', process.env.JWT_SECRET);

const app: Express = express();

// Export app for testing
export default app;
// Remove Express signature header
app.disable("x-powered-by");

// Optional security middlewares (graceful if not installed)
const tryRequire = (mod: string): unknown => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(mod);
  } catch {
    logger.warn(`[Security] Optional module not installed: ${mod}`);
    return null;
  }
};

const helmet = tryRequire("helmet") as
  | ((
      options?: Record<string, unknown>,
    ) => (req: Request, res: Response, next: NextFunction) => void)
  | null;
const rateLimit = tryRequire("express-rate-limit") as
  | ((
      options: Record<string, unknown>,
    ) => (req: Request, res: Response, next: NextFunction) => void)
  | null;

// Resolve unified uploads root (shared volume) — default to /app/uploads
const uploadsRoot = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(process.cwd(), "uploads");
// Ensure upload directories exist
const invoiceDir = path.join(uploadsRoot, "invoices");
const shippingDir = path.join(uploadsRoot, "shipping");
const companyLogosDir = path.join(uploadsRoot, "company_logos");
const inventoryTempDir = path.join(uploadsRoot, "inventory_temp");
const marketNewsImagesDir = path.join(uploadsRoot, "market_news");

const ensureDir = (dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory: ${dirPath}`);
    }
    // Best-effort permission fix for local dev/Windows-Docker mounts
    try {
      fs.chmodSync(dirPath, 0o755);
    } catch {}
  } catch (e) {
    logger.warn(`Failed to ensure directory ${dirPath}:`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

// Create directories if they don't exist
ensureDir(uploadsRoot);
ensureDir(invoiceDir);
ensureDir(shippingDir);
ensureDir(companyLogosDir);
ensureDir(inventoryTempDir);
ensureDir(marketNewsImagesDir);

// Localhost origin variants for prod-local (e.g. docker-compose.prod.local.yml with FRONTEND_BASE_URL=http://localhost)
const LOCALHOST_ORIGINS = [
  "http://localhost",
  "http://localhost:80",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1",
  "http://127.0.0.1:80",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

const isLocalhostUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url);

// Canonical production origin regex.
// Covers apex + any subdomain for both `lgdeal.com` (canonical) and `lgdeal.net`
// (legacy / transition period). Keep both TLDs until the .net redirect has fully
// propagated and there is no more organic traffic on the old domain.
const PRODUCTION_ORIGIN_REGEX = /^https?:\/\/([a-z0-9-]+\.)*lgdeal\.(com|net)$/i;

// Resolve CORS origins per environment
const resolveCorsOrigins = (): (string | RegExp)[] => {
  if (process.env.NODE_ENV === "production") {
    const frontendBase = process.env.FRONTEND_BASE_URL;
    if (frontendBase && typeof frontendBase === "string") {
      const origins: (string | RegExp)[] = [
        frontendBase,
        PRODUCTION_ORIGIN_REGEX,
      ];
      // Prod-local: when frontend is localhost, allow all common localhost variants (API + Socket.IO from browser)
      if (isLocalhostUrl(frontendBase)) {
        origins.push(...LOCALHOST_ORIGINS);
      }
      return origins;
    }
    return [PRODUCTION_ORIGIN_REGEX];
  }
  return ["http://localhost:3000", "http://localhost:3001"];
};

// Middleware
if (helmet) {
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP middleware, handled below
    }),
  );
}
app.use(
  cors({
    origin: resolveCorsOrigins(),
    credentials: true, // Разрешить cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-auth-token",
      "x-csrf-token",
      "X-Requested-With",
    ],
  }),
);

// Performance monitoring middleware
app.use(metricsMiddleware);
app.use("/metrics", metricsRouter);
app.use(performanceMiddleware);
app.use(memoryMonitorMiddleware);
app.use(databasePerformanceMiddleware);

// Enable compression for all responses
app.use(
  compression({
    level: 6, // Compression level (1-9, 6 is good balance)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req: Request, res: Response) => {
      // Don't compress if client doesn't support it
      if (req.headers["x-no-compression"]) {
        return false;
      }
      // Use compression for JSON responses and text
      return compression.filter(req, res);
    },
  }),
);

// Parse request bodies with size limits (configurable via REQUEST_BODY_LIMIT, default 1mb)
const bodyLimit = process.env.REQUEST_BODY_LIMIT || "1mb";

// Stripe webhook MUST get raw body for signature verification (Stripe best practice)
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: bodyLimit }),
);
// WhatsApp Cloud API webhook — raw body for X-Hub-Signature-256
app.use(
  "/api/whatsapp/webhook",
  express.raw({ type: "application/json", limit: bodyLimit }),
);

// JSON body parser for all other routes (skip for webhook so raw body is preserved)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.path === "/api/stripe/webhook" ||
    req.path === "/api/whatsapp/webhook"
  )
    return next();
  express.json({ limit: bodyLimit })(req, res, next);
});

// Parse URL-encoded bodies (skip for webhook)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.path === "/api/stripe/webhook" ||
    req.path === "/api/whatsapp/webhook"
  )
    return next();
  express.urlencoded({ extended: false, limit: bodyLimit })(req, res, next);
});

// Block unexpected multipart on non-upload routes early
app.use((req: Request, res: Response, next: NextFunction): void => {
  const ct = req.headers["content-type"] || "";
  const isMultipart =
    typeof ct === "string" && ct.toLowerCase().startsWith("multipart/");
  if (
    isMultipart &&
    !req.path.startsWith("/api/company/logo") &&
    !req.path.startsWith("/api/inventory") &&
    !req.path.includes("/action/upload_invoice") &&
    !req.path.startsWith("/api/market-news/upload-image")
  ) {
    res.status(415).json({ message: "Unsupported Media Type" });
    return;
  }
  next();
});

// Parse Cookies
app.use(cookieParser());

// Serve uploaded files (can be disabled via PUBLIC_UPLOADS_ENABLED=false)
// __dirname будет указывать на server/dist/src (если outDir в tsconfig "./dist/src") или server/dist (если outDir "./dist")
// Предполагаем, что папка uploads находится на уровне server/uploads
const publicUploadsEnabled = process.env.PUBLIC_UPLOADS_ENABLED !== "false";
if (publicUploadsEnabled) {
  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "[Security] Public /uploads is ENABLED in production. Consider setting PUBLIC_UPLOADS_ENABLED=false",
    );
  }
  // Publicly expose ONLY non-sensitive assets. Never expose invoices/inventory temp.
  app.use("/uploads/company_logos", express.static(companyLogosDir));
  app.use("/uploads/market_news", express.static(marketNewsImagesDir));
}

// Analytics tracking middleware
app.use(trackPageView);

// Request logging (sanitized; disabled in production)
// CSRF protection for unsafe methods (double-submit cookie)
app.use(csrfProtection);
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== "production") {
    logger.info(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Note: Health check endpoints moved to dedicated '/health' router for better organization and production readiness

// Test route
app.get("/api/test", (req: Request, res: Response) => {
  res.json({
    message: "API is working",
  });
});

// MongoDB Connection
const connectDB = async (): Promise<void> => {
  try {
    // Get MongoDB URI from file or environment variable
    const getMongoUri = () => {
      if (process.env.MONGODB_URI_FILE) {
        try {
          const uriFromFile = require("fs")
            .readFileSync(process.env.MONGODB_URI_FILE, "utf8")
            .trim();
          logger.info("[Config] Using MongoDB URI from file");
          return uriFromFile;
        } catch (e) {
          logger.error("[Config] Failed to read MONGODB_URI_FILE:", {
            error: e,
          });
        }
      }

      // If using environment variables, construct URI properly
      if (process.env.MONGODB_URI) {
        logger.info("[Config] Using MongoDB URI from environment variable");
        return process.env.MONGODB_URI;
      }

      // Fallback to default
      logger.info("[Config] Using default MongoDB URI");
      return "mongodb://127.0.0.1:27018/lgdx";
    };

    const mongoURI = getMongoUri();
    logger.info("Attempting to connect to MongoDB");

    // Enable Mongoose debugging only in development
    if (process.env.NODE_ENV === "development") {
      mongoose.set("debug", true);
    }

    // Suppress Mongoose deprecation warning
    mongoose.set("strictQuery", false);

    // Оптимизируем настройки MongoDB
    optimizeMongoDBSettings();

    const options: mongoose.ConnectOptions = {
      // Connection Pool Settings - оптимизированы для производительности
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || "20"), // Увеличено до 20 соединений
      minPoolSize: 5, // Минимум 5 соединений всегда готовы
      serverSelectionTimeoutMS: 3000, // Уменьшено до 3 секунд
      socketTimeoutMS: 30000, // Уменьшено до 30 секунд

      // Reconnection Settings
      retryWrites: true,
      retryReads: true,

      // Connection Timeout
      connectTimeoutMS: parseInt(
        process.env.MONGODB_CONNECT_TIMEOUT || "10000",
      ),

      // Heartbeat Settings - оптимизированы
      heartbeatFrequencyMS: 5000, // Уменьшено до 5 секунд для быстрого обнаружения проблем

      // Write Concern - оптимизировано для скорости
      w: 1, // Изменено с 'majority' на 1 для быстрой записи
      wtimeoutMS: 5000, // Уменьшено до 5 секунд

      // Дополнительные оптимизации
      maxIdleTimeMS: 30000, // Закрывать неиспользуемые соединения через 30 секунд
      bufferCommands: false, // Отключить буферизацию команд
    };

    // Set strictPopulate to false to allow populating paths not explicitly in schema
    mongoose.set("strictPopulate", false);

    const conn = await mongoose.connect(mongoURI, options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    logger.info(`Connection readyState: ${mongoose.connection.readyState}`);

    // Оптимизируем индексы базы данных
    await optimizeDatabaseIndexes();

    // Анализируем производительность запросов
    await analyzeQueryPerformance();
  } catch (error: unknown) {
    logger.error(`Error connecting to MongoDB: ${getErrorMessage(error)}`);
    // Don't exit immediately, allow for retry
    setTimeout(() => {
      logger.warn("Attempting to reconnect to MongoDB...");
      connectDB();
    }, 5000);
  }
};

// Connect to database
connectDB();

// Handling database connection events
mongoose.connection.on("error", (err: Error) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB connection disconnected");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB connection reestablished");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  try {
    await systemHealthMonitor.stopMonitoring(); // Stop system health monitor
    await closeMessageBroker(); // Close message broker connections
    await mongoose.connection.close();
    logger.info("MongoDB connection closed through app termination");
    process.exit(0);
  } catch (error: unknown) {
    logger.error(`Error during shutdown: ${getErrorMessage(error)}`);
    process.exit(1);
  }
});

// Routes
// Маршруты
// Примечание: некоторые маршруты ещё не мигрированы на TypeScript,
// поэтому используем обычный require для совместимости
// const authRoutes = require('../routes/auth'); // Comment out old JS import
import authRoutes from "./routes/auth"; // Add new TS import
// const companyRoutes = require('../routes/company'); // Comment out old JS import
import companyRoutes from "./routes/company"; // Add new TS import
// const inventoryRoutes = require('../routes/inventory'); // Comment out old JS import
import inventoryRoutes from "./routes/inventory"; // Add new TS import
// const adminRoutes = require('../routes/admin'); // Comment out old JS import
import adminRoutes from "./routes/admin"; // Add new TS import
// const marketplaceRoutes = require('../routes/marketplaceExtra'); // Comment out old JS import
// import marketplaceExtraRoutes from './routes/marketplaceExtra'; // Add new TS import
// const cartRoutes = require('../routes/cart'); // Comment out old JS import
import cartRoutes from "./routes/cart"; // Add new TS import
// const dealRoutes = require('../routes/deal'); // Comment out old JS import
import dealRoutes from "./routes/deal"; // Add new TS import
// const companyApiRoutes = require('../routes/companyApi'); // Comment out old JS import
// import companyApiRoutes from './routes/companyApi'; // DEPRECATED: All company-api routes moved to admin.ts for consistency
// REMOVED: analyticsRoutes - moved to analytics-service
// REMOVED: categoryStatsRoutes - moved to market-price-calculator-service
import filesRoutes from "./routes/files";
import ftpAdminRoutes from "./routes/ftpAdmin"; // Import FTP admin routes
import chatRoutes from "./routes/chatRoutes"; // Import chat routes
import stripeRoutes from "./routes/stripe"; // Import Stripe routes
import userAnalyticsRoutes from "./routes/userAnalytics"; // Import user analytics routes
import sitemapRoutes from "./routes/sitemap"; // Import sitemap routes
import notificationRoutes from "./routes/notification"; // Import notification routes
import marketNewsRoutes from "./routes/marketNews"; // Market news (GET public, write supervisor)
import whatsappRoutes from "./whatsapp/whatsappRoutes";

// Импортируем маршруты, уже мигрированные на TypeScript,
// но используем require для совместимости
// const marketplaceRoutes = require('../routes/marketplace'); // Comment out old JS import
import marketplaceRoutes from "./routes/marketplace"; // Add new TS import

// Initialize schedulers
import "./scripts/syncScheduler";
import "./scripts/categoryStatsScheduler";

// Rate limit sensitive routes if express-rate-limit is available
let authLimiter:
  | ((req: Request, res: Response, next: NextFunction) => void)
  | null = null;
let adminLimiter:
  | ((req: Request, res: Response, next: NextFunction) => void)
  | null = null;
if (rateLimit) {
  authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // Весь префикс /api/auth (login, /me, refresh, …); 30 было мало при офисном NAT + отладке
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
  });
}

app.use("/api/auth", authLimiter || ((req, _res, next) => next()), authRoutes);
// FTP admin routes (CSRF exempted in middleware)
app.use(
  "/api/admin/ftp",
  adminLimiter || ((req, _res, next) => next()),
  ftpAdminRoutes,
);

app.use("/api/company", companyRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use(
  "/api/admin",
  adminLimiter || ((req, _res, next) => next()),
  adminRoutes,
);
app.use("/api/cart", cartRoutes);
app.use("/api/deal", adminLimiter || ((req, _res, next) => next()), dealRoutes);
// DEPRECATED: Company API routes moved to /api/admin/company-api for security and consistency
// app.use('/api/company-api', companyApiRoutes);
// User analytics routes (user activity, page views)
app.use(
  "/api/analytics",
  adminLimiter || ((req, _res, next) => next()),
  userAnalyticsRoutes,
);
// REMOVED: market analytics routes - moved to analytics-service
// REMOVED: category-stats routes - moved to market-price-calculator-service
app.use("/api/files", filesRoutes);
app.use("/api/chat", chatRoutes); // Add chat routes
app.use("/api/stripe", stripeRoutes); // Add Stripe routes
app.use("/api/notifications", notificationRoutes); // Add notification routes
app.use("/api/market-news", marketNewsRoutes);
app.use("/api/csp-report", cspReportRouter);
app.use("/api/client-logs", clientLogsRoutes);
app.use("/api/whatsapp", whatsappRoutes);

// Health check routes
app.use("/health", healthRouter);

// SEO routes (public, no auth required)
app.use("/", sitemapRoutes); // Sitemap at /sitemap.xml

app.use(notFoundHandler);
app.use(globalErrorHandler);

// Default route
app.get("/", (req: Request, res: Response) => {
  res.send("LGDX API is running");
});

// Start server
const PORT = process.env.PORT || 5000;
app.set("trust proxy", 1);
const startServer = async () => {
  try {
    await connectDB();
    await initializeMessageBroker(); // Initialize message broker
    await systemHealthMonitor.startMonitoring(); // Start system health monitor

    if (isWhatsAppIntegrationEnabled()) {
      warmWhatsAppMarketingPromptAtStartup();
    }

    // Явно инициализируем соединение с Redis: с `lazyConnect: true` первый вызов
    // кэша иначе проваливается через `if (!isConnected) return` из-за гонки
    // между установкой сокета и событием 'connect'.
    const redisReady = await cacheService.ensureReady();
    if (!redisReady) {
      logger.warn(
        "[Startup] Redis is not ready — caches will degrade to in-process memo only",
      );
    }

    // Прогреваем публичные маркетплейс-агрегаты ДО app.listen,
    // чтобы первый HTTP-запрос не попадал в холодный Mongo-compute.
    await warmMarketplaceAggregates();
    startMarketplaceAggregatesRefresher();

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      const { emitDealUpdate } = initializeSocket(server);
      // Make emitDealUpdate globally available
      (
        global as typeof globalThis & { emitDealUpdate: typeof emitDealUpdate }
      ).emitDealUpdate = emitDealUpdate;
      logger.info("Socket.io initialized with deal update emitter");
      initDealMonitorCron();

      // Initialize chat WebSocket service
      const chatWebSocketService = new ChatWebSocketService(server);
      // Make it globally available
      (
        global as typeof globalThis & {
          chatWebSocketService: typeof chatWebSocketService;
        }
      ).chatWebSocketService = chatWebSocketService;
      logger.info("Chat WebSocket service initialized");

      // REMOVED: Market analytics scheduler - moved to analytics-service

      // REMOVED: Smart analytics scheduler - moved to analytics-service
    });

    // Register cleanup functions for graceful shutdown
    registerCleanup(async () => {
      logger.info("[Shutdown] Closing HTTP server...");
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }, "HTTP Server");

    registerCleanup(async () => {
      logger.info("[Shutdown] Closing message broker...");
      await closeMessageBroker();
    }, "Message Broker (RabbitMQ)");

    registerCleanup(async () => {
      logger.info("[Shutdown] Closing MongoDB connection...");
      await mongoose.connection.close();
    }, "MongoDB Connection");

    registerCleanup(async () => {
      logger.info("[Shutdown] Stopping system health monitor...");
      await systemHealthMonitor.stopMonitoring();
    }, "System Health Monitor");

    registerCleanup(async () => {
      logger.info("[Shutdown] Stopping marketplace aggregates refresher...");
      stopMarketplaceAggregatesRefresher();
    }, "Marketplace Aggregates Refresher");

    // Initialize graceful shutdown handlers
    initGracefulShutdown();
    logger.info("[Startup] Graceful shutdown initialized");
  } catch (error: unknown) {
    logger.error(`Error starting server: ${getErrorMessage(error)}`);
    process.exit(1);
  }
};

startServer();
