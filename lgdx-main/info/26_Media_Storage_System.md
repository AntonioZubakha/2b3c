# Система хранения и обработки медиафайлов продуктов

**Версия**: 2.0 (Final, design)  
**Дата**: 2025-11-28  
**Статус**: ⚠️ План/дизайн, не развёрнуто в текущем стеке (prod сейчас хранит только ссылки `url`)

---

## 📋 Содержание

1. [Обзор и бизнес-обоснование](#обзор)
2. [Расчеты объемов и затрат](#расчеты)
3. [Архитектура системы](#архитектура)
4. [Технические требования](#требования)
5. [План внедрения (8 недель)](#план-внедрения)
6. [Конфигурация и интеграция](#конфигурация)
7. [Миграция данных](#миграция)
8. [Мониторинг и безопасность](#мониторинг)

---

## 🎯 Обзор и бизнес-обоснование {#обзор}

### Проблема

При работе с **100+ продавцами** и **350,000+ продуктов**, каждый продавец имеет разные особенности:
- Разные источники медиафайлов (CDN, собственные серверы)
- Разная стабильность ссылок (некоторые пропадают → потеря продаж)
- Разные требования к качеству и форматам
- Нет единого подхода к хранению

### Решение

**Гибкая система хранения медиафайлов** с настройками на уровне компании:
- 3 стратегии: `url` (только ссылки), `download` (скачать и хранить), `hybrid` (гибридный)
- Микросервисная архитектура (новый `media-processing-service`)
- Асинхронная обработка через RabbitMQ
- Оптимизация изображений (WebP, thumbnails)
- Координация с другими сервисами через ServiceCoordinator

### Финансовое обоснование

| Показатель | Значение |
|------------|----------|
| **Затраты на хранение** | $4-28/месяц (246-380 GB) |
| **Затраты на CDN** | $0-20/месяц (Cloudflare) |
| **ИТОГО месячные затраты** | $4-48/месяц |
| **Предотвращение потерь** | $500-1000/месяц |
| **ROI** | 1000-2000% |
| **Окупаемость** | 2-3 месяца |
| **Трудозатраты** | 8 недель × 2 dev |

---

## 📊 Расчеты объемов и затрат {#расчеты}

### Параметры

- **Количество продуктов**: 350,000+
- **Количество продавцов**: 100+
- **Типы медиафайлов**: photo, image360, video (только ссылки), reportLink (только ссылки)

### Средние размеры файлов (оптимизированные)

| Тип | Формат | Размер (необработанный) | Размер (WebP) | Примечание |
|-----|--------|------------------------|---------------|------------|
| Photo | JPEG → WebP | 300 KB | 210 KB | Full HD (1920×1080) |
| Image360 | JPEG → WebP | 2 MB (10-15 кадров) | 1.4 MB | Серия изображений |
| Video | URL only | 0 GB | 0 GB | Только ссылки |
| ReportLink | URL only | 0 GB | 0 GB | Ссылки на сертификаты |

### Сценарии покрытия

#### Реалистичный сценарий (recommended)
- 95% продуктов с photo (332,500)
- 40% продуктов с image360 (140,000)
- **БЕЗ оптимизации**: ~380 GB
- **С оптимизацией (WebP, medium)**: ~246 GB ✅

#### Максимальный сценарий
- 100% продуктов с photo и image360
- **БЕЗ оптимизации**: ~805 GB
- **С оптимизацией**: ~490 GB

### Рекомендуемый storage provider

**Cloudflare R2** (preferred):
- $0.015/GB/месяц
- 246 GB = ~$3.69/месяц
- 380 GB = ~$5.70/месяц
- **Бесплатный egress** (нет платы за трафик)

Альтернативы: AWS S3 ($0.023/GB), Google Cloud Storage ($0.020/GB)

### Стратегия экономии

1. **Начать с `url` стратегии** для всех компаний (0 затрат)
2. **Переходить на `download`** только для проблемных продавцов
3. **Использовать `hybrid`** для экономии места (проверка доступности + резерв)
4. **WebP вместо JPEG** (экономия ~30%)
5. **Адаптивные размеры** (thumbnail/medium/full)

---

## 🏗️ Архитектура системы {#архитектура}

### Компоненты

```
┌─────────────────────────────────────────────────────────┐
│              Media Processing Service                    │
│  (Новый микросервис для обработки медиафайлов)         │
├─────────────────────────────────────────────────────────┤
│  • Download & Optimization Worker (Sharp)               │
│  • Media Sync Scheduler                                 │
│  • URL Verification Service                             │
│  • Storage Manager (R2/S3/GCS)                         │
│  • Health Check Endpoint                                │
└─────────────────────────────────────────────────────────┘
              ↓                    ↓                    ↓
    ┌─────────────┐      ┌──────────────┐      ┌──────────┐
    │  RabbitMQ   │      │    Redis     │      │ MongoDB  │
    │  3 очереди  │      │ServiceCoord  │      │ Product  │
    │             │      │    Cache     │      │  Config  │
    └─────────────┘      └──────────────┘      └──────────┘
              ↓
    ┌─────────────────┐
    │  Cloudflare R2  │
    │   (Storage)     │
    └─────────────────┘
```

### RabbitMQ Queues

```typescript
// 3 очереди для обработки медиа
export const MEDIA_DOWNLOAD_QUEUE = 'media_download_tasks';      // Скачивание и оптимизация
export const MEDIA_SYNC_QUEUE = 'media_sync_tasks';              // Периодическая синхронизация
export const MEDIA_VERIFICATION_QUEUE = 'media_verification_tasks'; // Проверка URL
```

### Расписание сервисов (план)

> media-processing-service пока не развёрнут; текущее prod расписание без него.
```yaml
00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00  # market-price-calculator (каждые 3 часа)
01:30                                                     # ssl-renewal-service (понедельник)
02:00                                                     # api-sync-service (пик нагрузки)
03:00                                                     # backup-service (после api-sync)
03:45                                                     # analytics-service (после market-price)
```

### Стратегии хранения

#### 1. `url` - Только ссылки (как сейчас)
```json
{
  "photo": { "storage": "url" },
  "image360": { "storage": "url" },
  "video": { "storage": "url" }
}
```
- Храним только URL в БД
- Не скачиваем файлы
- **Когда использовать**: Стабильные CDN-ссылки от продавца
- **Затраты**: $0/месяц

#### 2. `download` - Скачивать и хранить
```json
{
  "photo": {
    "storage": "download",
    "optimization": {
      "enabled": true,
      "format": "webp",
      "quality": 85,
      "maxWidth": 1920,
      "generateThumbnails": true
    }
  }
}
```
- Скачиваем файлы при импорте
- Оптимизируем (WebP, thumbnails)
- Сохраняем в R2/S3
- **Когда использовать**: Нестабильные ссылки, нужна оптимизация
- **Затраты**: ~$0.50-1.00/месяц на 10,000 продуктов

#### 3. `hybrid` - Гибридный подход
```json
{
  "photo": {
    "storage": "hybrid",
    "sync": {
      "autoDownload": true,
      "checkInterval": 24  // часов
    }
  }
}
```
- Используем оригинальную ссылку
- Периодически проверяем доступность
- При недоступности → скачиваем
- **Когда использовать**: Ссылки обычно стабильны, но могут пропадать
- **Затраты**: ~$0.20-0.50/месяц

---

## 🔧 Технические требования {#требования}

### 1. Новые поля в Product модель

```typescript
// server/src/models/Product.ts
// server/src/types/index.ts

interface IProduct {
  // ... существующие поля ...
  
  // Media storage metadata
  photoOriginalUrl?: string;
  photoStorageType?: 'url' | 'downloaded';
  photoDownloadedAt?: Date;
  photoLastVerified?: Date;
  
  image360OriginalUrl?: string;
  image360StorageType?: 'url' | 'downloaded';
  image360DownloadedAt?: Date;
  image360LastVerified?: Date;
  
  videoLastVerified?: Date;
  
  mediaMetadata?: {
    photo?: {
      originalSize: number;
      optimizedSize: number;
      format: string;
      dimensions: { width: number; height: number };
    };
    image360?: {
      originalSize: number;
      optimizedSize: number;
      frameCount?: number;
    };
  };
}

// Индексы
ProductSchema.index({ photoStorageType: 1, photoLastVerified: 1 });
ProductSchema.index({ image360StorageType: 1, image360LastVerified: 1 });
ProductSchema.index({ company: 1, photoStorageType: 1 });
```

### 2. Новое поле mediaConfig в CompanyApiConfig

```typescript
// server/src/models/CompanyApiConfig.ts

interface ICompanyApiConfig {
  // ... существующие поля ...
  
  // DEPRECATED (заменяется на mediaConfig)
  allowMissingMedia?: boolean;
  
  // НОВОЕ: Гибкая конфигурация медиа
  mediaConfig?: {
    photo: {
      storage: 'url' | 'download' | 'hybrid';
      optimization?: {
        enabled: boolean;
        format: 'jpeg' | 'webp' | 'avif';
        quality: number; // 1-100
        maxWidth?: number;
        maxHeight?: number;
        generateThumbnails: boolean;
        thumbnailSize: number;
      };
      sync?: {
        autoDownload: boolean;
        retryFailed: boolean;
        maxRetries: number;
        checkInterval: number; // часов
        verifyUrl: boolean;
      };
    };
    image360: {
      storage: 'url' | 'download' | 'hybrid';
      optimization?: { /* аналогично photo */ };
      sync?: { /* аналогично photo */ };
    };
    video: {
      storage: 'url'; // Всегда только ссылки
      verifyUrl: boolean;
    };
    reportLink: {
      storage: 'url'; // Всегда только ссылки
      verifyUrl: boolean;
    };
    storage?: {
      provider: 's3' | 'r2' | 'gcs' | 'local';
      bucket?: string;
      region?: string;
      pathPrefix?: string;
    };
    cdn?: {
      provider: 'cloudflare' | 'aws' | 'google' | 'custom' | 'none';
      baseUrl?: string;
      customHeaders?: Record<string, string>;
    };
  };
}

// Default config
const defaultMediaConfig = {
  photo: { storage: 'url', optimization: { enabled: false }, sync: { ... } },
  image360: { storage: 'url', optimization: { enabled: false }, sync: { ... } },
  video: { storage: 'url', verifyUrl: true },
  reportLink: { storage: 'url', verifyUrl: false },
  storage: { provider: 'r2', bucket: 'lgdx-media', region: 'auto', pathPrefix: 'media' },
  cdn: { provider: 'cloudflare', baseUrl: '', customHeaders: {} }
};
```

### 3. Environment Variables

```bash
# Cloud Storage Configuration
MEDIA_STORAGE_PROVIDER=r2              # r2 | s3 | gcs | local
MEDIA_STORAGE_BUCKET=lgdx-media
MEDIA_STORAGE_REGION=auto
MEDIA_STORAGE_PATH_PREFIX=media

# Cloudflare R2 (recommended)
CLOUDFLARE_R2_ACCOUNT_ID_FILE=/run/secrets/r2_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID_FILE=/run/secrets/r2_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY_FILE=/run/secrets/r2_secret_access_key
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com

# CDN Configuration
MEDIA_CDN_PROVIDER=cloudflare
MEDIA_CDN_BASE_URL=https://media.lgdeal.com

# Media Processing
MEDIA_PROCESSING_ENABLED=true
MEDIA_OPTIMIZATION_ENABLED=true
MEDIA_DOWNLOAD_QUEUE=media_download_tasks
MEDIA_SYNC_QUEUE=media_sync_tasks
MEDIA_VERIFICATION_QUEUE=media_verification_tasks
MEDIA_PREFETCH_COUNT=2
MEDIA_SYNC_SCHEDULE=0 4 * * *          # 04:00 UTC (после backup)
MEDIA_VERIFICATION_SCHEDULE=0 */6 * * * # Каждые 6 часов

# Processing Limits
MEDIA_MAX_FILE_SIZE_MB=50
MEDIA_BATCH_SIZE=100
MEDIA_MAX_CONCURRENT_DOWNLOADS=5

# Optimization Settings
MEDIA_WEBP_QUALITY=85
MEDIA_JPEG_QUALITY=90
MEDIA_MAX_WIDTH=1920
MEDIA_MAX_HEIGHT=1080
MEDIA_THUMBNAIL_SIZE=300
```

### 4. Dependencies для media-processing-service

```json
{
  "name": "media-processing-service",
  "version": "1.0.0",
  "dependencies": {
    "sharp": "^0.33.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
    "amqplib": "^0.10.0",
    "mongodb": "^6.0.0",
    "redis": "^4.6.0",
    "express": "^4.18.0",
    "prom-client": "^15.0.0"
  }
}
```

---

## 📅 План внедрения (8 недель) {#план-внедрения}

### Week 1: Подготовка инфраструктуры

**Задачи**:
1. Добавить env переменные в `info/04_Environment_Variables.md`
2. Создать Docker Secrets для R2/S3
3. Обновить Product модель (добавить 12 полей)
4. Обновить CompanyApiConfig модель (добавить mediaConfig)
5. Создать миграционные скрипты
6. Обновить `info/10_SECURITY.md` (см. раздел "Безопасность")

**Результат**: Инфраструктура готова к разработке

---

### Week 2-3: Разработка media-processing-service

**Структура**:
```
media-processing-service/
├── src/
│   ├── index.ts                    # Entry point
│   ├── config/
│   │   ├── storage.ts              # R2/S3/GCS providers
│   │   └── mediaConfig.ts          # Default configs
│   ├── services/
│   │   ├── downloadService.ts      # Скачивание медиа
│   │   ├── optimizationService.ts  # Sharp оптимизация
│   │   ├── verificationService.ts  # Проверка URL
│   │   └── syncScheduler.ts        # Периодическая синхронизация
│   ├── workers/
│   │   ├── mediaDownloadWorker.ts  # RabbitMQ consumer
│   │   └── mediaSyncWorker.ts      # Фоновая синхронизация
│   ├── models/
│   │   └── MediaJob.ts             # Отслеживание задач
│   ├── shared/
│   │   ├── logger.ts
│   │   ├── rabbitmq.ts
│   │   ├── redis.ts
│   │   └── database.ts
│   ├── utils/
│   │   ├── imageProcessor.ts       # Sharp wrapper
│   │   └── serviceCoordinator.ts   # ServiceCoordinator
│   └── health.ts                   # Health check endpoint
├── Dockerfile
├── package.json
└── tsconfig.json
```

**Ключевые функции**:

```typescript
// workers/mediaDownloadWorker.ts
async function processMediaDownload(payload: MediaProcessingPayload): Promise<void> {
  const { productId, companyId, originalUrl, config } = payload;
  
  try {
    // 1. Скачать оригинал
    const originalBuffer = await downloadImageWithRetry(originalUrl, {
      maxRetries: config.sync?.maxRetries || 3,
      timeout: 30000
    });
    
    // 2. Оптимизировать (WebP, thumbnails)
    const { buffer, metadata } = await optimizeImage(originalBuffer, config.optimization);
    
    // 3. Сохранить в R2/S3
    const storageProvider = getStorageProvider(config.storage?.provider || 'r2');
    const cdnUrl = await storageProvider.upload(buffer, generateStoragePath(product, companyId));
    
    // 4. Обновить продукт в БД
    await Product.updateOne(
      { _id: productId },
      {
        $set: {
          photo: cdnUrl,
          photoStorageType: 'downloaded',
          photoDownloadedAt: new Date(),
          'mediaMetadata.photo': metadata
        }
      }
    );
    
    // 5. Метрики
    mediaMetrics.downloadsTotal.inc({ company: companyId, status: 'success' });
  } catch (error) {
    logger.error('Failed to download media', { productId, error });
    
    // Graceful degradation: fallback на URL
    await Product.updateOne(
      { _id: productId },
      { $set: { photoStorageType: 'url', photoLastVerified: new Date() } }
    );
    
    mediaMetrics.downloadsTotal.inc({ company: companyId, status: 'failed' });
  }
}
```

**Результат**: Готовый media-processing-service

---

### Week 3-4: Интеграция с существующими сервисами

**1. file-product-import-service/src/shared/productUtils.ts**

Добавить после строки 684 (после проверки missing media):

```typescript
// Асинхронная отправка в media processing queue
if (process.env.MEDIA_PROCESSING_ENABLED === 'true') {
  await sendProductToMediaQueue(product, companyId);
}

async function sendProductToMediaQueue(
  product: ProcessedProductData,
  companyId: string
): Promise<void> {
  try {
    const company = await CompanyApiConfig.findOne({ company: companyId })
      .select('mediaConfig')
      .lean();
    
    if (!company?.mediaConfig) return;
    
    const config = company.mediaConfig;
    
    // Photo
    if (product.photo && (config.photo.storage === 'download' || config.photo.storage === 'hybrid')) {
      await sendToQueue('media_download_tasks', {
        productId: product._id,
        companyId,
        mediaType: 'photo',
        originalUrl: product.photo,
        config: config.photo,
        priority: 5
      });
    }
    
    // Image360
    if (product.image360 && (config.image360.storage === 'download' || config.image360.storage === 'hybrid')) {
      await sendToQueue('media_download_tasks', {
        productId: product._id,
        companyId,
        mediaType: 'image360',
        originalUrl: product.image360,
        config: config.image360,
        priority: 5
      });
    }
  } catch (error) {
    // Не блокируем импорт при ошибках медиа
    logger.warn('[sendProductToMediaQueue] Failed', { error, productId: product._id });
  }
}
```

**2. api-product-sync-service/src/worker.ts**

Аналогичная интеграция (можно вынести в shared модуль).

**Результат**: Медиа обрабатывается асинхронно при импорте

---

### Week 4-5: Фоновая синхронизация

```typescript
// media-processing-service/src/services/syncScheduler.ts
export class MediaSyncScheduler {
  private coordinator: ServiceCoordinator;
  
  async scheduleSyncForCompany(companyId: string): Promise<void> {
    // Координация с другими сервисами
    await this.coordinator.waitForCompletion('backup', 3600000); // Ждем backup
    
    const company = await Company.findById(companyId);
    const config = company.apiConfig?.mediaConfig;
    
    if (!config) return;
    
    // Для hybrid стратегии - проверяем доступность URL
    if (config.photo.storage === 'hybrid') {
      await this.scheduleUrlVerification(companyId, 'photo', config.photo);
    }
  }
  
  async scheduleUrlVerification(companyId: string, mediaType: 'photo' | 'image360', config: any): Promise<void> {
    const batchSize = 100;
    let skip = 0;
    
    while (true) {
      const products = await Product.find({
        company: companyId,
        [`${mediaType}StorageType`]: 'url',
        [mediaType]: { $exists: true, $ne: '' }
      })
      .limit(batchSize)
      .skip(skip)
      .lean();
      
      if (products.length === 0) break;
      
      // Отправляем в очередь
      for (const product of products) {
        await sendToQueue(MEDIA_VERIFICATION_QUEUE, {
          productId: product._id,
          companyId,
          mediaType,
          url: product[mediaType],
          config
        });
      }
      
      skip += batchSize;
    }
  }
}
```

**Результат**: Фоновая синхронизация работает

---

### Week 5: Мониторинг и метрики

```typescript
// media-processing-service/src/metrics.ts
export const mediaMetrics = {
  downloadsTotal: new promClient.Counter({
    name: 'media_downloads_total',
    help: 'Total media downloads',
    labelNames: ['company', 'type', 'status']
  }),
  
  storageUsed: new promClient.Gauge({
    name: 'media_storage_bytes',
    help: 'Total storage used',
    labelNames: ['company', 'type']
  }),
  
  optimizationSavings: new promClient.Gauge({
    name: 'media_optimization_savings_percent',
    help: 'Storage savings from optimization',
    labelNames: ['company']
  }),
  
  storageCostEstimate: new promClient.Gauge({
    name: 'media_storage_cost_usd_monthly',
    help: 'Estimated monthly storage cost',
    labelNames: ['company', 'provider']
  })
};
```

**Grafana Dashboard**:
- Количество скачанных медиа по компаниям
- Использование storage
- Экономия от оптимизации
- Оценка стоимости
- Успешность проверки URL

**Результат**: Полный мониторинг

---

### Week 6: Тестирование

- Unit тесты (оптимизация, storage providers)
- Integration тесты (RabbitMQ, MongoDB, R2)
- Load тесты (1000 продуктов с медиа)
- Staging тестирование (реальные данные)

**Результат**: Система протестирована

---

### Week 7-8: Постепенное внедрение

**Feature Flags**:
```typescript
// server/src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  MEDIA_PROCESSING_ENABLED: process.env.MEDIA_PROCESSING_ENABLED === 'true'
};
```

**Фазы**:
1. **Week 7**: 5 тестовых компаний → Мониторинг 1 неделя
2. **Week 8**: 20 компаний → Проверка производительности
3. **Week 9**: Все компании → Полное внедрение

**Rollback Plan**:
- Отключить feature flag
- Остановить media-processing-service
- Вернуться к URL стратегии
- Существующие продукты продолжают работать

**Результат**: Система в production

---

## ⚙️ Конфигурация и интеграция {#конфигурация}

### Docker Compose конфигурация

**Файл**: `docker-compose.prod.secure.final.yml`

Добавить после `ftp-service` (строка ~574):

```yaml
  # Media Processing Service Production
  media-processing-service:
    image: lgdx-media-processing-service:latest
    user: "1001:1001"
    read_only: true
    tmpfs:
      - /tmp
    environment:
      NODE_ENV: production
      MONGODB_URI_FILE: /run/secrets/mongodb_uri
      RABBITMQ_URL_FILE: /run/secrets/rabbitmq_url
      REDIS_URL_FILE: /run/secrets/redis_url
      STOCK_TELEGRAM_BOT_TOKEN_FILE: /run/secrets/stock_telegram_bot_token
      STOCK_TELEGRAM_CHAT_ID_FILE: /run/secrets/stock_telegram_chat_id
      
      # Service Coordinator
      SERVICE_COORDINATOR_ENABLED: "true"
      
      # Media Processing
      MEDIA_PROCESSING_ENABLED: "true"
      MEDIA_OPTIMIZATION_ENABLED: "true"
      
      # Storage Provider (Cloudflare R2)
      MEDIA_STORAGE_PROVIDER: "r2"
      MEDIA_STORAGE_BUCKET: "lgdx-media"
      MEDIA_STORAGE_REGION: "auto"
      MEDIA_STORAGE_PATH_PREFIX: "media"
      
      # Cloudflare R2 Credentials
      CLOUDFLARE_R2_ACCOUNT_ID_FILE: /run/secrets/r2_account_id
      CLOUDFLARE_R2_ACCESS_KEY_ID_FILE: /run/secrets/r2_access_key_id
      CLOUDFLARE_R2_SECRET_ACCESS_KEY_FILE: /run/secrets/r2_secret_access_key
      CLOUDFLARE_R2_ENDPOINT: "https://<account-id>.r2.cloudflarestorage.com"
      
      # CDN Configuration
      MEDIA_CDN_PROVIDER: "cloudflare"
      MEDIA_CDN_BASE_URL: "https://media.lgdeal.com"
      
      # RabbitMQ Queues
      MEDIA_DOWNLOAD_QUEUE: "media_download_tasks"
      MEDIA_SYNC_QUEUE: "media_sync_tasks"
      MEDIA_VERIFICATION_QUEUE: "media_verification_tasks"
      MEDIA_PREFETCH_COUNT: "2"
      
      # Scheduling
      MEDIA_SYNC_SCHEDULE: "0 4 * * *"
      MEDIA_VERIFICATION_SCHEDULE: "0 */6 * * *"
      
      # Processing Limits
      MEDIA_MAX_FILE_SIZE_MB: "50"
      MEDIA_BATCH_SIZE: "100"
      MEDIA_MAX_CONCURRENT_DOWNLOADS: "5"
      
      # Optimization Settings
      MEDIA_WEBP_QUALITY: "85"
      MEDIA_JPEG_QUALITY: "90"
      MEDIA_MAX_WIDTH: "1920"
      MEDIA_MAX_HEIGHT: "1080"
      MEDIA_THUMBNAIL_SIZE: "300"
      
      LOG_LEVEL: "info"
      HEALTH_PORT: "3000"
      
    networks:
      - lgdx-network
    secrets:
      - mongodb_uri
      - rabbitmq_url
      - redis_url
      - stock_telegram_bot_token
      - stock_telegram_chat_id
      - r2_account_id
      - r2_access_key_id
      - r2_secret_access_key
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          memory: 2G        # Пик при обработке медиа
          cpus: '1.0'       # Достаточно для Sharp + загрузки
        reservations:
          memory: 512M      # МИНИМУМ в режиме ожидания (работает периодически)
          cpus: '0.2'       # МИНИМУМ в ожидании
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

# Добавить secrets
secrets:
  # ... существующие secrets ...
  r2_account_id:
    external: true
    name: r2_account_id
  r2_access_key_id:
    external: true
    name: r2_access_key_id
  r2_secret_access_key:
    external: true
    name: r2_secret_access_key
```

**Обновить комментарий расписания** (строка ~1056):

```yaml
# РАСПИСАНИЕ СЕРВИСОВ (с координацией через Service Coordinator):
# - 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00: market-price-calculator
# - 01:30: ssl-renewal-service (понедельник)
# - 02:00: api-sync-service (пик нагрузки)
# - 03:00: backup-service (после api-sync)
# - 03:45: analytics-service (после market-price)
# - 04:00: media-processing-service (фоновая синхронизация медиа) ← НОВОЕ
```

**Обновить расчет ресурсов** (строка ~1043):

```yaml
# RESERVATIONS (гарантированные ресурсы):
# - CPU: ~7.55 vCPU (94% от 8 vCPU) ✅ (+0.2 для media-processing)
# - Memory: ~7.8 GB (49% от 16 GB) ✅ (+0.5G для media-processing)

# LIMITS (максимальные при пиках):
# - CPU: ~12.5 vCPU (overcommit 56%) ⚠️ (+1.0 для media-processing)
# - Memory: ~16.3 GB (102% от 16 GB) ⚠️ (+2G для media-processing)

# ⚠️ ВАЖНО: media-processing-service работает в 04:00, когда api-sync уже закончил.
# Реальное пиковое использование памяти ~14-15GB (сервисы работают последовательно).
```

### Создание Docker Secrets

```bash
# Production сервер
echo "your_account_id" | docker secret create r2_account_id -
echo "your_access_key_id" | docker secret create r2_access_key_id -
echo "your_secret_access_key" | docker secret create r2_secret_access_key -
```

---

## 🔄 Миграция данных {#миграция}

### 1. Миграция CompanyApiConfig

**Файл**: `scripts/migrations/add-media-config.ts`

```typescript
import mongoose from 'mongoose';
import CompanyApiConfig from '../../server/src/models/CompanyApiConfig';
import { logger } from '../../server/src/utils/logger';

async function migrateCompanyMediaConfig() {
  logger.info('[Migration] Starting CompanyApiConfig media config migration');
  
  const configs = await CompanyApiConfig.find({ mediaConfig: { $exists: false } });
  logger.info(`[Migration] Found ${configs.length} configs to migrate`);
  
  let migrated = 0;
  for (const config of configs) {
    try {
      config.mediaConfig = {
        photo: { 
          storage: 'url',
          optimization: { enabled: false },
          sync: { autoDownload: false, retryFailed: true, maxRetries: 3, checkInterval: 168, verifyUrl: true }
        },
        image360: { 
          storage: 'url',
          optimization: { enabled: false },
          sync: { autoDownload: false, retryFailed: true, maxRetries: 3 }
        },
        video: { storage: 'url', verifyUrl: true },
        reportLink: { storage: 'url', verifyUrl: false },
        storage: { provider: 'r2', bucket: 'lgdx-media', region: 'auto', pathPrefix: 'media' },
        cdn: { provider: 'cloudflare', baseUrl: '', customHeaders: {} }
      };
      
      await config.save();
      migrated++;
      
      if (migrated % 10 === 0) {
        logger.info(`[Migration] Migrated ${migrated}/${configs.length}`);
      }
    } catch (error) {
      logger.error(`[Migration] Failed to migrate config ${config._id}`, { error });
    }
  }
  
  logger.info(`[Migration] Completed. Migrated ${migrated}/${configs.length}`);
}

mongoose.connect(process.env.MONGODB_URI!)
  .then(() => migrateCompanyMediaConfig())
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[Migration] Fatal error', { error });
    process.exit(1);
  });
```

**Запуск**:
```bash
ts-node scripts/migrations/add-media-config.ts
```

### 2. Миграция Product (350,000+ записей)

**Файл**: `scripts/migrations/migrate-product-media.ts`

```typescript
import mongoose from 'mongoose';
import Product from '../../server/src/models/Product';
import { logger } from '../../server/src/utils/logger';

async function migrateProductMedia() {
  logger.info('[Migration] Starting Product media fields migration');
  
  const batchSize = 1000;
  let skip = 0;
  let totalMigrated = 0;
  
  while (true) {
    const products = await Product.find({
      $or: [
        { photo: { $exists: true, $ne: '' }, photoOriginalUrl: { $exists: false } },
        { image360: { $exists: true, $ne: '' }, image360OriginalUrl: { $exists: false } }
      ]
    })
    .limit(batchSize)
    .skip(skip)
    .lean();
    
    if (products.length === 0) break;
    
    logger.info(`[Migration] Processing batch ${skip}-${skip + products.length}`);
    
    const bulkOps = products.map(product => {
      const update: any = {};
      
      if (product.photo && !product.photoOriginalUrl) {
        update.photoOriginalUrl = product.photo;
        update.photoStorageType = 'url';
      }
      
      if (product.image360 && !product.image360OriginalUrl) {
        update.image360OriginalUrl = product.image360;
        update.image360StorageType = 'url';
      }
      
      return {
        updateOne: {
          filter: { _id: product._id },
          update: { $set: update }
        }
      };
    });
    
    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
      totalMigrated += bulkOps.length;
    }
    
    skip += batchSize;
    logger.info(`[Migration] Total migrated: ${totalMigrated}`);
  }
  
  logger.info(`[Migration] Completed. Migrated ${totalMigrated} products`);
}

mongoose.connect(process.env.MONGODB_URI!)
  .then(() => migrateProductMedia())
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[Migration] Fatal error', { error });
    process.exit(1);
  });
```

**Запуск**:
```bash
ts-node scripts/migrations/migrate-product-media.ts
```

**Оценка времени**: ~5-10 минут для 350,000 продуктов (batch по 1000).

---

## 📊 Мониторинг и безопасность {#мониторинг}

### Prometheus Метрики

```typescript
// Автоматически экспортируются на /metrics
media_downloads_total{company="<id>",type="photo",status="success"}
media_downloads_total{company="<id>",type="photo",status="failed"}
media_storage_bytes{company="<id>",type="photo"}
media_optimization_savings_percent{company="<id>"}
media_storage_cost_usd_monthly{company="<id>",provider="r2"}
```

### Grafana Dashboard

**Панели**:
1. Total Media Downloaded (counter)
2. Storage Usage by Company (gauge, GB)
3. Optimization Savings (gauge, %)
4. Monthly Cost Estimate (gauge, USD)
5. Download Success Rate (percentage)
6. Top 10 Companies by Storage Usage

### Обновление SECURITY.md

**Добавить раздел**:

```markdown
## 🗄️ Cloud Storage Security

### Cloudflare R2 / AWS S3 / GCS

**Принципы**:
- ✅ IAM роли вместо ключей в коде
- ✅ Минимальные права доступа (least privilege)
- ✅ Ротация ключей каждые 90 дней
- ✅ Signed URLs для приватных медиа
- ✅ CORS политика только для lgdeal.com
- ✅ Versioning для критичных данных

**Credentials хранятся в Docker Secrets**:
```bash
docker secret create r2_access_key_id /path/to/r2_access_key_id
docker secret create r2_secret_access_key /path/to/r2_secret_access_key
```

**Валидация медиафайлов**:
- ✅ MIME type проверка (image/jpeg, image/png, image/webp)
- ✅ Размер файла (max 50MB)
- ✅ Расширение файла (jpg, jpeg, png, webp)
- ✅ Image dimensions (max 4000×4000)
- ⚠️ Вирусное сканирование (опционально, VirusTotal API)

**Rate Limiting**:
- ✅ Max 100 медиа-запросов/минуту на IP
- ✅ Max 10 скачиваний/секунду на компанию
- ✅ DDoS защита через Cloudflare

**CDN Security**:
- ✅ Signed URLs для приватных изображений
- ✅ Hotlink protection
- ✅ Cache-Control headers
- ✅ HTTPS only
```

---

## ✅ Чек-лист внедрения

### Pre-implementation
- [ ] Добавить env переменные в `info/04_Environment_Variables.md`
- [ ] Создать Docker Compose конфигурацию для media-processing-service
- [ ] Обновить Product модель (добавить 12 полей)
- [ ] Обновить CompanyApiConfig модель (добавить mediaConfig)
- [ ] Создать миграционные скрипты (2 файла)
- [ ] Обновить `info/10_SECURITY.md` (Cloud Storage Security)
- [ ] Создать Cloudflare R2 bucket
- [ ] Добавить Docker secrets в production

### Development
- [ ] Создать media-processing-service структуру
- [ ] Реализовать RabbitMQ consumers (3 очереди)
- [ ] Интегрировать Sharp для оптимизации
- [ ] Реализовать R2/S3/GCS провайдеры
- [ ] Добавить ServiceCoordinator интеграцию
- [ ] Написать unit тесты
- [ ] Написать integration тесты

### Integration
- [ ] Интегрировать с file-product-import-service
- [ ] Интегрировать с api-product-sync-service
- [ ] Протестировать на staging
- [ ] Load тестирование (1000 продуктов)
- [ ] Настроить Prometheus/Grafana метрики

### Deployment
- [ ] Feature flag включен на staging
- [ ] Миграция CompanyApiConfig (~100 записей)
- [ ] Миграция Product (~350,000 записей)
- [ ] Мониторинг работает (Grafana dashboard)
- [ ] Rollback план документирован
- [ ] Команда обучена

### Gradual Rollout
- [ ] **Phase 1**: 5 тестовых компаний (Week 7)
- [ ] **Phase 2**: 20 компаний (Week 8)
- [ ] **Phase 3**: Все компании (Week 9)

---

## 🎯 Критерии успеха

| Метрика | Целевое значение |
|---------|------------------|
| **Производительность** | 1000 медиафайлов < 10 минут |
| **Надежность** | 99.9% успешных загрузок |
| **Экономия** | 30%+ через оптимизацию |
| **Доступность** | 100% для пользователей |
| **Масштабируемость** | Поддержка 500,000+ продуктов |

---

## 📚 Дополнительные ресурсы

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [RabbitMQ Best Practices](https://www.rabbitmq.com/best-practices.html)
- [ServiceCoordinator Pattern](info/MICROSERVICES_IMPROVEMENTS_SUMMARY.md)

---

## 🚀 Деплой в production

**Порядок действий**:

```bash
# 1. Push code to git
git add .
git commit -m "feat: Media storage system"
git push origin main

# 2. На production сервере: Pull updates
cd /opt/lgdx
git pull origin main

# 3. Rebuild images
docker build -t lgdx-media-processing-service:latest ./media-processing-service

# 4. Создать secrets (если еще не создано)
echo "your_account_id" | docker secret create r2_account_id -
echo "your_access_key_id" | docker secret create r2_access_key_id -
echo "your_secret_access_key" | docker secret create r2_secret_access_key -

# 5. Deploy stack
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# 6. Проверить health
curl http://localhost:3000/health  # media-processing-service

# 7. Запустить миграции (в терминале на сервере)
docker exec -it $(docker ps -qf name=lgdx_lgdx-server) ts-node scripts/migrations/add-media-config.ts
docker exec -it $(docker ps -qf name=lgdx_lgdx-server) ts-node scripts/migrations/migrate-product-media.ts

# 8. Мониторинг
# Grafana: https://lgdeal.com/grafana/
# Проверить метрики: media_downloads_total, media_storage_bytes
```

---

**Версия**: 2.0 (Final)  
**Дата**: 2025-11-28  
**Автор**: AI Assistant  
**Статус**: ✅ Готово к внедрению

