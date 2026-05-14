# FTP Product Sync Service - Документация

## 📋 Обзор

**FTP Product Sync Service** - это микросервис для автоматической синхронизации продуктов через FTP-протокол. Сервис позволяет поставщикам загружать файлы с товарами на FTP-сервер, которые затем автоматически обрабатываются и интегрируются в основную систему LGDX.

## 🏗️ Архитектура

### Основные компоненты:

1. **FTP Server** - Безопасный FTP-сервер с аутентификацией по компаниям
2. **File Watcher** - Мониторинг загруженных файлов и автоматическая обработка
3. **Rate Limiter** - Ограничение количества загрузок (1 раз в 12 часов) ⭐ NEW
4. **Telegram Notifier** - Уведомления о превышении лимитов и ошибках ⭐ NEW
5. **Metrics System** - Сбор статистики использования
6. **Health Check** - Мониторинг состояния сервиса
7. **Database Integration** - Интеграция с MongoDB для управления компаниями
8. **Queue Integration** - Интеграция с RabbitMQ для обработки файлов
9. **Redis Integration** - Хранение счетчиков rate limiting ⭐ NEW

### Схема работы:
```
[Поставщик] → [FTP Client] → [FTP Server] → [File Watcher] → [RabbitMQ] → [File Import Service] → [MongoDB]
```

## 🔧 Конфигурация

### Переменные окружения:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/lgdx_dev
MONGODB_URI_FILE=/run/secrets/mongodb_uri

# RabbitMQ  
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_URL_FILE=/run/secrets/rabbitmq_url

# Redis (для Rate Limiting) ⭐ NEW
REDIS_URL=redis://localhost:6379
REDIS_URL_FILE=/run/secrets/redis_url

# FTP Configuration
FTP_PORT=21
FTP_HOST=0.0.0.0
FTP_PASV_URL=49.13.160.126  # Prod PASV IP
FTP_PASV_PORT_MIN=10000
FTP_PASV_PORT_MAX=10100
FTP_DATA_PATH=/app/ftp-data
FTP_MAX_FILE_SIZE_MB=50
FTP_ALLOWED_FILE_TYPES=xlsx,xls,csv
FTP_MAX_CONNECTIONS=50  # Увеличено с 30
FTP_CONNECTION_TIMEOUT=300000
FTP_IDLE_TIMEOUT=900000
FTP_FORCE_PASSIVE=true
FTP_PASSIVE_MODE=true
FTP_UPLOAD_DAILY_LIMIT=1
FTP_UPLOAD_RATE_LIMIT_WINDOW=43200
FTP_DEFAULT_QUOTA_MB=1000
FTP_MAX_QUOTA_MB=5000

# Rate Limiting ⭐ NEW
FTP_UPLOAD_DAILY_LIMIT=1          # Максимум 1 загрузка в окне
FTP_UPLOAD_RATE_LIMIT_WINDOW=43200 # Окно: 12 часов (секунды)

# Health Check
HEALTH_PORT=3000

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_TOKEN_FILE=/run/secrets/telegram_bot_token
STOCK_TELEGRAM_BOT_TOKEN=your_stock_bot_token
STOCK_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/stock_telegram_bot_token
STOCK_TELEGRAM_CHAT_ID=your_chat_id
STOCK_TELEGRAM_CHAT_ID_FILE=/run/secrets/stock_telegram_chat_id

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

## 🚀 Запуск

### Development:
```bash
cd ftp-product-sync-service
npm install
npm run dev
```

### Production:
```bash
npm run build
npm start
```

### Docker:
```bash
docker build -t lgdx-ftp-sync-service .
docker run --env-file .env -v ftp_data:/app/ftp-data -p 21:21 -p 10000-10100:10000-10100 lgdx-ftp-sync-service
```

### Docker Compose:
```bash
# Development
docker-compose -f docker-compose.dev.yml up ftp-product-sync-service-dev

# Production Local
docker stack deploy -c docker-compose.prod.local.yml lgdx

# Production Secure
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx
```

### Docker Swarm (Production):
```bash
# Deploy stack
docker stack deploy -c docker-compose.prod.local.yml lgdx

# Update service
docker service update --force lgdx_ftp-product-sync-service

# View logs
docker service logs lgdx_ftp-product-sync-service
```

## 📁 Структура файлов

```
ftp-product-sync-service/
├── src/
│   ├── index.ts                     # Главная точка входа
│   ├── healthCheck.ts               # Health check сервер
│   ├── models/
│   │   ├── Company.ts               # Модель компании с FTP конфигурацией
│   │   └── FtpSession.ts            # Модель FTP сессий
│   ├── services/
│   │   ├── ftpServer.ts             # FTP сервер
│   │   ├── fileWatcher.ts           # Мониторинг файлов
│   │   ├── metrics.ts               # Система метрик
│   │   ├── rateLimiter.ts           # Rate limiting (Redis) ⭐ NEW
│   │   └── telegramNotifier.ts      # Telegram уведомления ⭐ NEW
│   ├── shared/
│   │   ├── config.ts                # Конфигурация
│   │   ├── database.ts              # Подключение к MongoDB
│   │   ├── logger.ts                # Логирование
│   │   ├── rabbitmq.ts              # Подключение к RabbitMQ
│   │   └── redis.ts                 # Подключение к Redis ⭐ NEW
│   ├── utils/
│   │   └── gracefulShutdown.ts      # Graceful shutdown
│   └── __tests__/                   # Тесты
├── package.json
├── tsconfig.json
└── Dockerfile
```

## 🔐 Безопасность

### Аутентификация:
- **Уникальные учетные данные** для каждой компании
- **Хеширование паролей** с использованием bcrypt (12 раундов)
- **Временные токены** для доступа

### Ограничения доступа:
- **IP Whitelisting** - доступ только с разрешенных IP
- **Файловые квоты** - ограничение размера загружаемых файлов  
- **Типы файлов** - только xlsx, xls, csv
- **Изоляция данных** - каждая компания видит только свои файлы

### Контроль операций:
- **Запрет удаления** файлов через FTP
- **Запрет создания** директорий
- **Только загрузка** файлов разрешена

## 🛡️ Rate Limiting (⭐ NEW)

### Описание:
Для защиты от перегрузки очереди RabbitMQ и ресурсов сервера, FTP сервис ограничивает количество загрузок файлов на компанию.

### Конфигурация:
```bash
FTP_UPLOAD_DAILY_LIMIT=1           # Максимум 1 загрузка в окне
FTP_UPLOAD_RATE_LIMIT_WINDOW=43200 # Окно: 12 часов (секунды)
```

**Эффект:** Каждая компания может загружать файлы **раз в 12 часов**.  
**Результат:** 2 обновления в сутки через равные промежутки (например, 00:15 и 12:15).

### Поведение:

#### ✅ Нормальная загрузка (1-я в окне):
```
1. Файл загружен
2. Rate limit: 1/1 per 12h (OK) → Обработка
3. Файл отправлен в очередь
```

#### ⚠️ Превышение лимита (2-я загрузка в том же окне):
```
1. Файл загружен
2. Rate limit: 2/1 per 12h (EXCEEDED)
3. Telegram уведомление отправлено
4. Файл СОХРАНЕН (не удален)
5. Обработка отложена до сброса счетчика
```

### Telegram уведомление:
```
⚠️ FTP Upload Rate Limit Exceeded

Company: UNIQUE GROWN DIAMOND INC.
File: lgdealweb.csv

Current uploads: 2/1 per 12 hours
Limit reset: 2025-11-28 12:00 UTC

_The file will be processed after the limit resets._
```

### Мониторинг лимитов:
```bash
# Подключение к Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Проверить текущий счетчик для компании
GET ftp:rate_limit:691354d390a81324b6435957

# Проверить TTL (время до сброса в секундах)
TTL ftp:rate_limit:691354d390a81324b6435957

# Сбросить лимит вручную (админ операция)
DEL ftp:rate_limit:691354d390a81324b6435957
```

### Подробная документация:
См. [24_FTP_Rate_Limiting.md](./24_FTP_Rate_Limiting.md) для детальной информации.

---

## 📊 Мониторинг

### Health Check Endpoints:

```bash
# Общее состояние сервиса
GET http://localhost:3000/health

# Простые метрики
GET http://localhost:3000/metrics

# Готовность к работе (для Kubernetes)
GET http://localhost:3000/ready

# Проверка жизнеспособности (для Kubernetes)
GET http://localhost:3000/live
```

### Пример ответа `/health`:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "mongodb": "connected",
    "rabbitmq": "connected",
    "ftpServer": "running"
  },
  "version": "1.0.0"
}
```

### Логирование:
- **Структурированные логи** с использованием Pino
- **Уровни логирования**: error, warn, info, debug
- **Контекстная информация**: companyId, IP, fileName
- **Ротация логов** для production

## 🔄 Процесс обработки файлов

### 1. Загрузка файла через FTP:
```bash
# Пример FTP подключения
ftp lgdeal.com
# Вводим логин: company_12345678_abc123_def456
# Вводим пароль: generatedPassword123
# Загружаем файл:
put products.xlsx
```

### 2. Автоматическая обработка:

#### a) File Watcher обнаруживает новый файл:
```typescript
// Путь файла: /app/ftp-data/{companyId}/files/products.xlsx
// Извлекается companyId из пути
const companyId = extractCompanyId('/app/ftp-data/691354d390a81324b6435957/files/products.xlsx');
// Результат: '691354d390a81324b6435957'
```

#### b) Проверка Rate Limit (⭐ NEW):
```typescript
// Проверяется лимит загрузок (1 раз в 12 часов по умолчанию)
const rateLimitResult = await rateLimiter.checkAndIncrement(companyId, companyName);

if (!rateLimitResult.allowed) {
  // Превышен лимит
  logger.warn(`Rate limit exceeded: ${rateLimitResult.currentCount}/1 per 12h`);
  
  // Отправка уведомления в Telegram
  await telegramNotifier.sendRateLimitExceeded(
    companyName,
    fileName,
    rateLimitResult.currentCount,
    rateLimitResult.resetAt
  );
  
  // Файл НЕ удаляется, остается для обработки после сброса лимита
  return;
}
```

#### c) Валидация файла:
```typescript
// Проверяется:
// - Тип файла (xlsx, xls, csv)
// - Размер файла (до 50MB по умолчанию)  
// - Права доступа
const validation = await validateFile(filePath);
if (!validation.isValid) {
  // Файл перемещается в /app/{companyId}/failed/
  await moveToFailedDirectory(filePath, validation.reason);
}
```

#### d) Отправка в очередь обработки:
```typescript
const payload = {
  filePath: '/app/ftp-data/691354d390a81324b6435957/files/products.xlsx',
  companyDoc: companyObject,
  companyName: 'UNIQUE GROWN DIAMOND INC.',
  originalFileName: 'products.xlsx',
  uploadMode: 'replace', // или 'add' (append устарел, нормализуется в add)
  source: 'ftp',
  uploadedAt: '2025-11-27T10:30:00.000Z',
  fileSize: 5503281
};

await sendToQueue('file_upload_tasks', payload);
```

### 2.1) Актуальная логика `replace` в File Import Service (обновлено)

После последних фиксов `replace` работает в режиме **update/create + selective delete**, а не "delete-all + recreate":

1. **Create vs Update**
   - Для каждого сертификата проверяется существующий продукт текущей компании.
   - Если продукт уже есть у этой компании -> `Updated`.
   - Если продукта не было -> `Created`.

2. **Delete only missing (после импорта)**
   - В `replace` режиме больше **нет предварительного массового удаления** всего стока компании.
   - После обработки файла удаляются только товары компании, которых нет в текущем импорте.
   - Продукты в сделках (`onDeal=true`) и проданные (`sold=true`) не удаляются.

3. **Cross-company price rule**
   - Если тот же камень (по certificate number) уже есть у другого поставщика по более низкой (или равной) цене, текущая запись идет в `Skipped`.
   - Если у текущей компании цена стала ниже конкурента, запись обновляется/сохраняется (не скипается).

4. **Sold blacklist**
   - Сертификаты со статусом `Sold` продолжают исключаться из переимпорта (`Skipped`).

5. **Duplicate rows in source**
   - Дубликаты внутри одного файла дедуплицируются до обработки и учитываются в `Skipped`.

### 2.2) Интерпретация счетчиков в Telegram (обновлено)

В успешной отбивке синка значения трактуются так:

- **Created** - только новые продукты, которых ранее не было у поставщика.
- **Updated** - продукты поставщика, которые уже существовали и пришли снова (с изменениями или без), включая допустимые замены.
- **Skipped** - пропуски по бизнес-правилам (Sold blacklist, cheaper-at-other-supplier, invalid data, onDeal/sold protection и т.д.).
- **Deleted products** - товары, которые были в предыдущем стоке поставщика, но отсутствуют в текущем файле (и не защищены `onDeal/sold`).

> Поле в уведомлении переименовано с `Stale products removed` на `Deleted products`.

### 3. Структура директорий (⭐ UPDATED):
```
/app/ftp-data/
├── 691354d390a81324b6435957/       # ID компании (UNIQUE GROWN DIAMOND INC.)
│   └── files/                      # Директория для загрузки файлов
│       ├── lgdealweb.csv           # Загруженный файл
│       └── products.xlsx           # Другой файл
├── 6913552790a81324b6435997/       # Другая компания (KYRAH STAR)
│   └── files/
│       └── LGDEALNET.csv
└── 681f811cc81c0d72e7d5bf9e/       # Третья компания (Veer Krupa)
    └── files/
        └── stock.xlsx

# Примечание: Файлы удаляются автоматически после успешной обработки
# При превышении rate limit файлы сохраняются для повторной обработки
```

## 🎛️ Управление через Admin Panel

### Создание FTP доступа для компании:

1. **Вход в админ-панель**: `/admin` → вкладка "FTP Management"

2. **Выбор компании** из списка

3. **Создание доступа**:
   ```typescript
   // Генерируется уникальный username:
   // company_{companyId_last8}_{timestamp36}_{random6}
   const username = 'company_12345678_abc123_def456';
   
   // Генерируется безопасный пароль:
   const password = 'a1b2c3d4e5f6g7h8'; // 16 символов UUID без дефисов
   ```

4. **Настройка параметров**:
   - Максимальное количество одновременных подключений (1-10)
   - IP whitelist (можно оставить пустым для доступа с любых IP)
   - Квота загрузки в MB (50-5000)
   - Автоматическая обработка файлов (включена по умолчанию)
   - Удаление файлов после обработки (выключено по умолчанию)
   - Уведомления о загрузке (включены по умолчанию)
   - Максимальный размер файла (1-200 MB)
   - Режим обработки: 'replace' (замена) или 'append' (добавление)

### Информация для поставщика:

После создания доступа поставщик получает:
```
FTP Server: lgdeal.com
Port: 21
Username: company_12345678_abc123_def456  
Password: a1b2c3d4e5f6g7h8
Supported files: .xlsx, .xls, .csv
Max file size: 50 MB
```

## 📈 Метрики и статистика

### Метрики сервиса:
```typescript
interface FtpMetrics {
  connections: {
    total: number;      // Общее количество подключений
    active: number;     // Активные подключения
  };
  uploads: {
    total: number;      // Общее количество загрузок
    totalBytes: number; // Общий объем данных
    totalMB: number;    // Общий объем в MB
  };
  errors: {
    total: number;      // Общее количество ошибок
  };
  timestamp: string;    // Время сбора метрик
}
```

### Статистика по компаниям:
```typescript
// В модели Company автоматически ведется статистика:
{
  ftpConfig: {
    connectionCount: 156,                    // Количество подключений
    totalUploadsCount: 89,                   // Количество загрузок
    totalBytesUploaded: 45678912,           // Загружено байт
    lastConnectionAt: "2024-01-15T10:30:00.000Z"
  }
}
```

## 🧪 Тестирование

### Запуск тестов:
```bash
# Все тесты
npm test

# Тесты в watch режиме
npm run test:watch

# Покрытие кода
npm run test:coverage
```

### Основные тест-кейсы:

1. **Аутентификация FTP**:
   - Успешный логин с правильными данными
   - Отказ при неправильном пароле
   - Проверка IP whitelist
   - Ограничение количества подключений

2. **Мониторинг файлов**:
   - Обнаружение новых файлов
   - Валидация типов и размеров
   - Отправка в очередь обработки
   - Обработка ошибок

3. **Интеграция**:
   - Подключение к MongoDB
   - Подключение к RabbitMQ
   - Health check endpoints

## 🐛 Troubleshooting

### Частые проблемы:

#### 1. FTP подключение не работает:
```bash
# Проверить статус сервиса
curl http://localhost:3002/health

# Проверить логи
docker service logs lgdx_ftp-product-sync-service

# Проверить порты
netstat -tlnp | grep :21
netstat -tlnp | grep :10000-10100
```

#### 2. Файлы не обрабатываются:
```bash
# Проверить RabbitMQ
curl http://localhost:15672/api/queues # (если включен management)

# Проверить права доступа к директории
docker exec -it $(docker ps -q -f name=ftp-service) ls -la /app/

# Проверить логи file watcher
docker service logs lgdx_ftp-product-sync-service | grep "FileWatcher"
```

#### 3. Ошибки аутентификации:
```bash
# Проверить данные компании в MongoDB
docker exec -it $(docker ps -q -f name=mongodb) mongosh --username admin --password $(cat /run/secrets/mongodb_password) --authenticationDatabase admin lgdx --eval "db.companies.findOne({'ftpConfig.username': 'company_12345678_abc123_def456'})"

# Проверить хеш пароля
# (пароль должен быть захеширован с bcrypt)
```

#### 4. Проблемы с PASV режимом:
```bash
# Убедиться что FTP_PASV_URL доступен клиенту
ping lgdeal.com

# Проверить что порты 10000-10100 открыты
nmap -p 10000-10100 lgdeal.com
```

#### 5. Проблемы с Rate Limiting (⭐ NEW):
```bash
# Проверить статус Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli PING

# Проверить счетчик для компании
docker exec -it $(docker ps -q -f name=redis) redis-cli GET ftp:rate_limit:COMPANY_ID

# Проверить логи rate limiter
docker logs $(docker ps -q -f name=ftp-service) 2>&1 | grep RateLimiter

# Проверить Telegram уведомления
docker logs $(docker ps -q -f name=ftp-service) 2>&1 | grep "Rate limit exceeded"

# Сбросить лимит (если нужно)
docker exec -it $(docker ps -q -f name=redis) redis-cli DEL ftp:rate_limit:COMPANY_ID
```

## 🔄 Обновления и миграции

### Обновление сервиса:
```bash
# 1. Пересобрать образ
docker build -t lgdx-ftp-sync-service:latest ./ftp-product-sync-service

# 2. Обновить сервис с принудительным перезапуском
docker service update --force lgdx_ftp-product-sync-service

# 3. Проверить статус
docker service ps lgdx_ftp-product-sync-service
```

### Миграция данных:
```bash
# Бэкап FTP данных
docker run --rm -v ftp_data:/data -v $(pwd):/backup alpine tar -czf /backup/ftp-data-backup.tar.gz -C /data .

# Восстановление FTP данных  
docker run --rm -v ftp_data:/data -v $(pwd):/backup alpine tar -xzf /backup/ftp-data-backup.tar.gz -C /data
```

## 🔧 Текущая конфигурация (Production Secure) ⭐ UPDATED

### Docker Service:
```yaml
ftp-service:
  image: lgdx-ftp-sync-service:latest
  ports:
    - "21:21"           # FTP control port
    - "10000-10100:10000-10100"  # FTP passive data ports
  environment:
    NODE_ENV: production
    FTP_DATA_PATH: "/app/ftp-data"
    FTP_MAX_FILE_SIZE_MB: "50"
    FTP_ALLOWED_FILE_TYPES: "xlsx,xls,csv"
    FTP_MAX_CONNECTIONS: "50"    # Увеличено с 30
    FTP_PASV_URL: "49.13.160.126" # Прямой IP
    
    # Rate Limiting ⭐ NEW
    FTP_UPLOAD_DAILY_LIMIT: "1"
    FTP_UPLOAD_RATE_LIMIT_WINDOW: "43200"  # 12 hours
    
    # Secrets (Docker Swarm)
    MONGODB_URI_FILE: /run/secrets/mongodb_uri
    RABBITMQ_URL_FILE: /run/secrets/rabbitmq_url
    REDIS_URL_FILE: /run/secrets/redis_url  # ⭐ NEW
    STOCK_TELEGRAM_BOT_TOKEN_FILE: /run/secrets/stock_telegram_bot_token
    STOCK_TELEGRAM_CHAT_ID_FILE: /run/secrets/stock_telegram_chat_id
  volumes:
    - ftp_data:/app/ftp-data
  secrets:
    - mongodb_uri
    - rabbitmq_url
    - redis_url  # ⭐ NEW
    - stock_telegram_bot_token
    - stock_telegram_chat_id
```

### Ключевые особенности (⭐ UPDATED):
- **Изолированные директории** для каждой компании (`/app/ftp-data/{companyId}/files/`)
- **Rate Limiting** - максимум 1 загрузка в 12 часов (2 в сутки при использовании обоих окон) ⭐ NEW
- **Мониторинг пути** `/app/ftp-data` для обнаружения файлов
- **Интеграция с File Import Service** через RabbitMQ очередь `file_upload_tasks`
- **Telegram уведомления** о превышении лимитов и ошибках ⭐ NEW
- **Redis-based счетчики** для отслеживания загрузок ⭐ NEW
- **Fail-open стратегия** - при ошибках Redis разрешаем загрузку ⭐ NEW

## 📞 Поддержка

### Логи для диагностики:
```bash
# Логи сервиса
docker service logs lgdx_ftp-product-sync-service

# Логи с фильтрацией
docker service logs lgdx极_ftp-product-sync-service 2>&1 | grep ERROR

# Логи в реальном времени
docker service logs -f lgdx_ftp-product-sync-service
```

### Ключевые метрики для мониторинга:
- Доступность FTP-сервера (port 21)
- Количество активных подключений
- Размер очереди file_upload_tasks в RabbitMQ
- Доступность MongoDB и RabbitMQ
- Использование дискового пространства /app/ftp-data

---

## 📋 Заключение

FTP Product Sync Service обеспечивает надежную и безопасную загрузку файлов продуктов через FTP-протокол с автоматической обработкой. Сервис интегрирован в экосистему LGDX и поддерживает масштабирование для множества поставщиков.

**Текущее состояние (обновлено 27 ноября 2025)**:
- ✅ Сервис полностью функционален в production окружении
- ✅ Интегрирован с File Import Service через RabbitMQ
- ✅ Автоматическая генерация отчетов по обработке файлов
- ✅ Rate Limiting (1 загрузка / 12 часов) для защиты от перегрузки ⭐ NEW
- ✅ Redis-based счетчики с fail-open стратегией ⭐ NEW
- ✅ Telegram уведомления о превышении лимитов ⭐ NEW
- ✅ Обработано >26,000 продуктов от UNIQUE и KYRAH STAR за 27.11.2025

### Связанная документация:
- [24_FTP_Rate_Limiting.md](./24_FTP_Rate_Limiting.md) - Детали rate limiting
- [06_SSL_Certificate_Management.md](./06_SSL_Certificate_Management.md) - SSL сертификаты
- [19_Monitoring_Quick_Start.md](./19_Monitoring_Quick_Start.md) - Мониторинг

Для дополнительной информации обращайтесь к команде разработки LGDX.

---

**Последнее обновление**: 27 ноября 2025  
**Версия**: 2.0.0 (с Rate Limiting)
