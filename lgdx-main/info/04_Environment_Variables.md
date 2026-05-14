# 🔧 04. Переменные окружения LGDX

## 📋 Обзор

Этот документ содержит полный справочник всех переменных окружения, используемых в проекте LGDX, их назначение, значения по умолчанию и требования к безопасности.

---

## 🎯 Категории переменных

### 1. **Основные настройки**
### 2. **База данных**
### 3. **Кэш и очереди**
### 4. **Аутентификация и безопасность**
### 5. **Внешние сервисы**
### 6. **Микросервисы**
### 7. **Мониторинг и логирование**

---

## 🔧 Основные настройки

### `NODE_ENV`
- **Описание**: Окружение приложения
- **Тип**: String
- **Значения**: `development` | `production` | `test`
- **По умолчанию**: `development`
- **Пример**: `NODE_ENV=production`

### `PORT`
- **Описание**: Порт для основного сервера
- **Тип**: Number
- **По умолчанию**: `5000`
- **Пример**: `PORT=5000`

### `HOST`
- **Описание**: Хост для привязки сервера
- **Тип**: String
- **По умолчанию**: `0.0.0.0`
- **Источник**: `server/src/config/environment.ts`

### `REQUEST_BODY_LIMIT`
- **Описание**: Лимит размера тела запроса (JSON/urlencoded)
- **Тип**: String
- **По умолчанию**: `1mb`
- **Пример**: `REQUEST_BODY_LIMIT=2mb`
- **Примечание**: Stripe webhook использует raw body с тем же лимитом

### `ARE_MICROSERVICES_LIVE`
- **Описание**: Включение подключения к RabbitMQ и фоновых воркеров
- **Тип**: String (строго `true` для включения)
- **По умолчанию**: не задано (микросервисы отключены)
- **Пример**: `ARE_MICROSERVICES_LIVE=true`
- **Источник**: `server/src/services/messageBroker.ts`, health `/health/queue`

### `FRONTEND_BASE_URL`
- **Описание**: Базовый URL фронтенда
- **Тип**: String
- **Development**: `http://localhost:3080` (по умолчанию в `docker-compose.dev.yml` через `CLIENT_PORT`)
- **Production**: `https://lgdeal.com`
- **Пример**: `FRONTEND_BASE_URL=https://lgdeal.com`

### `REACT_APP_API_URL`
- **Описание**: URL API для React приложения
- **Тип**: String
- **Development**: `'/api'` (рекомендуется: CRA proxy, same-origin)
- **Production**: `'/api'` (same-origin за Nginx)
- **Пример**: `REACT_APP_API_URL=/api`

---

## 🗄️ База данных

### `MONGODB_URI`
- **Описание**: URI подключения к MongoDB
- **Тип**: String
- **Development**: `mongodb://admin:password@mongodb:27017/lgdx_dev?authSource=admin`
- **Production**: `mongodb://admin:password@mongodb:27017/lgdx?authSource=admin`
- **Пример**: `MONGODB_URI=mongodb://admin:password@localhost:27017/lgdx?authSource=admin`

### `MONGODB_URI_FILE`
- **Описание**: Файл с URI MongoDB (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/mongodb_uri`
- **Использование**: Production с Docker Secrets

### `MONGODB_USER`
- **Описание**: Пользователь MongoDB
- **Тип**: String
- **По умолчанию**: `admin`
- **Пример**: `MONGODB_USER=admin`

### `MONGODB_PASSWORD`
- **Описание**: Пароль MongoDB
- **Тип**: String
- **Требования**: Минимум 12 символов
- **Пример**: `MONGODB_PASSWORD=SecurePassword123!`

---

## 🚀 Кэш и очереди

### `REDIS_URL`
- **Описание**: URL подключения к Redis
- **Тип**: String
- **Development**: `redis://redis:6379`
- **Production**: `redis://redis:6379`
- **Пример**: `REDIS_URL=redis://localhost:6379`

### `REDIS_URL_FILE`
- **Описание**: Файл с URL Redis (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/redis_url`

### `REDIS_PASSWORD`
- **Описание**: Пароль Redis
- **Тип**: String
- **Требования**: Минимум 8 символов
- **Пример**: `REDIS_PASSWORD=RedisPass123!`

### `RABBITMQ_URL`
- **Описание**: URL подключения к RabbitMQ
- **Тип**: String
- **Development**: `amqp://lgdx:lgdx2024@rabbitmq:5672`
- **Production**: `amqp://lgdx:password@rabbitmq:5672`
- **Пример**: `RABBITMQ_URL=amqp://lgdx:password@localhost:5672`

### `RABBITMQ_URL_FILE`
- **Описание**: Файл с URL RabbitMQ (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/rabbitmq_url`

### `RABBITMQ_USER`
- **Описание**: Пользователь RabbitMQ
- **Тип**: String
- **По умолчанию**: `lgdx`
- **Пример**: `RABBITMQ_USER=lgdx`

### `RABBITMQ_PASSWORD`
- **Описание**: Пароль RabbitMQ
- **Тип**: String
- **Требования**: Минимум 8 символов
- **Пример**: `RABBITMQ_PASSWORD=RabbitMQPass123!`

### `RABBITMQ_PASS`
- **Описание**: Альтернативное имя переменной пароля RabbitMQ, используемое в `server/src/services/messageBroker.ts` при сборке URL из частей (`RABBITMQ_USER` + `RABBITMQ_PASS` + `RABBITMQ_HOST` + `RABBITMQ_PORT`).
- **Тип**: String
- **Примечание**: Если задан `RABBITMQ_URL`/`RABBITMQ_URL_FILE`, то `RABBITMQ_PASS` не используется.
- **Источник**: `server/src/services/messageBroker.ts`

### `RABBITMQ_HOST`
- **Описание**: Хост RabbitMQ для сборки `RABBITMQ_URL`, если сам URL не задан.
- **Тип**: String
- **По умолчанию**: `rabbitmq`
- **Источник**: `server/src/services/messageBroker.ts`

### `RABBITMQ_PORT`
- **Описание**: Порт RabbitMQ для сборки `RABBITMQ_URL`, если сам URL не задан.
- **Тип**: String/Number
- **По умолчанию**: `5672`
- **Источник**: `server/src/services/messageBroker.ts`

---

## 🔐 Аутентификация и безопасность

### `JWT_SECRET`
- **Описание**: Секретный ключ для JWT токенов
- **Тип**: String
- **Требования**: Минимум 64 символа
- **Безопасность**: КРИТИЧЕСКИ ВАЖНО
- **Пример**: `JWT_SECRET=your-super-secret-jwt-key-at-least-64-characters-long`

### `JWT_SECRET_FILE`
- **Описание**: Файл с JWT секретом (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/jwt_secret`

### `JWT_PREV_SECRET` / `JWT_PREV_SECRET_FILE`
- **Описание**: Предыдущий JWT secret для окна ротации (используется Socket.IO при валидации токена: сначала `JWT_SECRET`, затем `JWT_PREV_SECRET`).
- **Тип**: String
- **Источник**: `server/src/socket/index.ts`

### `ADMIN_SECRET_KEY`
- **Описание**: Секретный ключ для админских операций
- **Тип**: String
- **Требования**: Минимум 32 символа
- **Безопасность**: КРИТИЧЕСКИ ВАЖНО
- **Пример**: `ADMIN_SECRET_KEY=admin-secret-key-32-chars-min`

### `ADMIN_SECRET_KEY_FILE`
- **Описание**: Файл с админским секретом (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/admin_secret_key`

### `ADMIN_ROLE_CACHE_TTL_MS`
- **Описание**: TTL in-memory кэша проверки admin/supervisor прав (уменьшает нагрузку на DB).
- **Тип**: Number (ms)
- **По умолчанию**: `45000`
- **Источник**: `server/src/middleware/adminAuth.ts`

### `COOKIE_SECURE`
- **Описание**: Использование secure cookies
- **Тип**: Boolean
- **Development**: `false`
- **Production**: `true`
- **Пример**: `COOKIE_SECURE=true`

### `CSP_ENFORCE`
- **Описание**: Включение Content Security Policy
- **Тип**: Boolean
- **Development**: `false`
- **Production**: `true`
- **Пример**: `CSP_ENFORCE=true`

---

## 📧 Email и SMS

### `SMTP_HOST`
- **Описание**: SMTP сервер для отправки email
- **Тип**: String
- **По умолчанию**: `smtp.gmail.com`
- **Пример**: `SMTP_HOST=smtp.gmail.com`

### `SMTP_PORT`
- **Описание**: Порт SMTP сервера
- **Тип**: Number
- **По умолчанию**: `587`
- **Пример**: `SMTP_PORT=587`

### `SMTP_USER`
- **Описание**: Пользователь SMTP
- **Тип**: String
- **Пример**: `SMTP_USER=info@lgdeal.com`

### `SMTP_PASS`
- **Описание**: Пароль SMTP
- **Тип**: String
- **Безопасность**: ВАЖНО
- **Пример**: `SMTP_PASS=your-email-password`

### `SMTP_PASS_FILE`
- **Описание**: Файл с паролем SMTP (Docker Secrets)
- **Тип**: String
- **По умолчанию**: `/run/secrets/smtp_pass`

### `SMTP_FROM`
- **Описание**: Email отправителя
- **Тип**: String
- **Пример**: `SMTP_FROM=info@lgdeal.com`

### `DEMO_REQUEST_EMAIL`
- **Описание**: Email получателя заявок “Request a Demo”. Если не задан — используется `SMTP_FROM`, затем `SMTP_USER`.
- **Тип**: String
- **Источник**: `server/src/services/emailService.ts`

### `TWILIO_ACCOUNT_SID`
- **Описание**: SID аккаунта Twilio
- **Тип**: String
- **Безопасность**: ВАЖНО
- **Пример**: `TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### `TWILIO_AUTH_TOKEN`
- **Описание**: Токен авторизации Twilio
- **Тип**: String
- **Безопасность**: КРИТИЧЕСКИ ВАЖНО
- **Пример**: `TWILIO_AUTH_TOKEN=your-twilio-auth-token`

### `TWILIO_VERIFY_SERVICE_SID`
- **Описание**: SID сервиса верификации Twilio
- **Тип**: String
- **Пример**: `TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### `TWILIO_PHONE_NUMBER` / `TWILIO_PHONE_NUMBER_FILE`
- **Описание**: Sender номер для отправки SMS через Twilio Messages API (используется для password reset SMS).
- **Тип**: String
- **Источник**: `server/src/services/smsService.ts`

### `PHONE_BLACKLIST_PREFIXES`
- **Описание**: Запрещённые префиксы номера в формате E.164, через запятую (без пробелов или с пробелами — обрезаются). Если нормализованный номер начина с одного из префиксов, валидация отклоняет его.
- **Тип**: String
- **Пример**: `PHONE_BLACKLIST_PREFIXES=+100,+888`
- **Источник**: `server/src/utils/phoneValidation.ts`

---

## 🤖 Telegram боты

### `TELEGRAM_BOT_TOKEN`
- **Описание**: Токен основного Telegram бота
- **Тип**: String
- **Безопасность**: ВАЖНО
- **Пример**: `TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### `TELEGRAM_CHAT_ID`
- **Описание**: ID чата для уведомлений
- **Тип**: String
- **Пример**: `TELEGRAM_CHAT_ID=-1001234567890`

### `STOCK_TELEGRAM_BOT_TOKEN`
- **Описание**: Токен бота для уведомлений о складе
- **Тип**: String
- **Пример**: `STOCK_TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### `STOCK_TELEGRAM_CHAT_ID`
- **Описание**: ID чата для уведомлений о складе
- **Тип**: String
- **Пример**: `STOCK_TELEGRAM_CHAT_ID=-1001234567890`

### `REGISTRATION_TELEGRAM_BOT_TOKEN`
- **Описание**: Токен бота для уведомлений о регистрации
- **Тип**: String
- **Пример**: `REGISTRATION_TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### `REGISTRATION_TELEGRAM_CHAT_ID`
- **Описание**: ID чата для уведомлений о регистрации
- **Тип**: String
- **Пример**: `REGISTRATION_TELEGRAM_CHAT_ID=-1001234567890`

### `SYSTEM_MONITORING_BOT_TOKEN`
- **Описание**: Токен бота для системного мониторинга
- **Тип**: String
- **Пример**: `SYSTEM_MONITORING_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### `SYSTEM_MONITORING_CHAT_ID`
- **Описание**: ID чата для системного мониторинга
- **Тип**: String
- **Пример**: `SYSTEM_MONITORING_CHAT_ID=-1001234567890`

### `CHAT_TELEGRAM_BOT_TOKEN`
- **Описание**: Токен бота для чата поддержки
- **Тип**: String
- **Пример**: `CHAT_TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### `CHAT_TELEGRAM_CHAT_ID`
- **Описание**: ID чата для чата поддержки
- **Тип**: String
- **Пример**: `CHAT_TELEGRAM_CHAT_ID=-1001234567890`

### `LOGIST_TELEGRAM_BOT_TOKEN` / `LOGIST_TELEGRAM_BOT_TOKEN_FILE`
- **Описание**: Отдельный бот для логистических уведомлений (опционально).
- **Тип**: String
- **Источник**: `server/src/utils/telegramBot.ts`

### `LOGIST_TELEGRAM_CHAT_ID` / `LOGIST_TELEGRAM_CHAT_ID_FILE`
- **Описание**: Chat ID для логистических уведомлений.
- **Тип**: String
- **Источник**: `server/src/utils/telegramBot.ts`

### `MOCK_TELEGRAM_BOT`
- **Описание**: Включает “mock” режим отправки Telegram сообщений (ничего не отправляет, только логирует).
- **Тип**: String (`true` для включения)
- **Источник**: `server/src/utils/telegramBot.ts`

---

## 🔌 Внешние API

### `OIL_PRICE_API`
- **Описание**: API ключ для получения цен на нефть
- **Тип**: String
- **Безопасность**: ВАЖНО
- **Пример**: `OIL_PRICE_API=your-oil-price-api-key`

### `GEMINI_API_KEY`
- **Описание**: API ключ для Gemini AI
- **Тип**: String
- **Безопасность**: ВАЖНО
- **Пример**: `GEMINI_API_KEY=your-gemini-api-key`

---

## 🏭 Микросервисы

### `API_SYNC_PREFETCH_COUNT`
- **Описание**: Количество предзагружаемых сообщений для API Sync
- **Тип**: Number
- **По умолчанию**: `2`
- **Пример**: `API_SYNC_PREFETCH_COUNT=2`

### `API_SYNC_RETRY_DELAY`
- **Описание**: Задержка между повторными попытками API Sync (мс)
- **Тип**: Number
- **По умолчанию**: `10000`
- **Пример**: `API_SYNC_RETRY_DELAY=10000`

### `API_SYNC_MAX_RETRIES`
- **Описание**: Максимальное количество повторных попыток API Sync
- **Тип**: Number
- **По умолчанию**: `3`
- **Пример**: `API_SYNC_MAX_RETRIES=3`

### `FILE_IMPORT_PREFETCH_COUNT`
- **Описание**: Количество предзагружаемых сообщений для File Import
- **Тип**: Number
- **По умолчанию**: `1`
- **Пример**: `FILE_IMPORT_PREFETCH_COUNT=1`

### `FILE_IMPORT_RETRY_DELAY`
- **Описание**: Задержка между повторными попытками File Import (мс)
- **Тип**: Number
- **По умолчанию**: `15000`
- **Пример**: `FILE_IMPORT_RETRY_DELAY=15000`

### `FILE_IMPORT_MAX_RETRIES`
- **Описание**: Максимальное количество повторных попыток File Import
- **Тип**: Number
- **По умолчанию**: `3`
- **Пример**: `FILE_IMPORT_MAX_RETRIES=3`

> ⚠️ **Важно (по коду):** `file-product-import-service` использует env имена `PREFETCH_COUNT` и `RETRY_DELAY` (а не `FILE_IMPORT_PREFETCH_COUNT`/`FILE_IMPORT_RETRY_DELAY`).  
> `FILE_IMPORT_*` переменные могут встречаться в `docker-compose*`, но фактический consumer читает другие имена.

### `PREFETCH_COUNT`
- **Описание**: Prefetch для consumer’а очереди `file_upload_tasks` в `file-product-import-service`.
- **Тип**: Number
- **По умолчанию**: `1`
- **Источник**: `file-product-import-service/src/index.ts`

### `RETRY_DELAY`
- **Описание**: Базовая задержка retry для обработки файлов (экспоненциальный backoff: `RETRY_DELAY * 2^retryCount`).
- **Тип**: Number (ms)
- **По умолчанию**: `15000`
- **Источник**: `file-product-import-service/src/index.ts`

### `FILE_IMPORT_CONSUMER_TIMEOUT_MS`
- **Описание**: Таймаут consumer ack (RabbitMQ `x-consumer-timeout`) для `file_upload_tasks`.
- **Тип**: Number (ms)
- **По умолчанию**: `2400000` (40 минут)
- **Источник**: `file-product-import-service/src/index.ts`

### `FILE_IMPORT_LOCK_TTL_SECONDS`
- **Описание**: TTL распределённого lock’а на компанию при импорте (Redis key `sync:lock:<companyId>`).
- **Тип**: Number (seconds)
- **По умолчанию**: `2400` (40 минут)
- **Источник**: `file-product-import-service/src/worker.ts`

### `FILE_IMPORT_CHUNK_ROW_THRESHOLD`
- **Описание**: Порог строк для включения chunked обработки больших XLSX (0 = выключено).
- **Тип**: Number
- **По умолчанию**: `100000`
- **Источник**: `file-product-import-service/src/worker.ts`

### `FILE_IMPORT_CHUNK_SIZE`
- **Описание**: Размер чанка строк при chunked обработке XLSX.
- **Тип**: Number
- **По умолчанию**: `50000`
- **Источник**: `file-product-import-service/src/worker.ts`

### `XLSX_STREAM_THRESHOLD_MB`
- **Описание**: XLSX размер (MB), начиная с которого используется streaming parser.
- **Тип**: Number
- **По умолчанию**: `30`
- **Источник**: `file-product-import-service/src/worker.ts`

### `METRICS_PORT`
- **Описание**: Порт metrics/health сервера в `file-product-import-service`.
- **Тип**: Number
- **По умолчанию**: `9101`
- **Источник**: `file-product-import-service/src/metrics.ts`

---

## 📁 Файлы и загрузки

### `MAX_FILE_SIZE`
- **Описание**: Максимальный размер загружаемого файла
- **Тип**: String
- **По умолчанию**: `50MB`
- **Пример**: `MAX_FILE_SIZE=50MB`

### `UPLOAD_PATH`
- **Описание**: Путь для сохранения загруженных файлов
- **Тип**: String
- **По умолчанию**: `./uploads`
- **Пример**: `UPLOAD_PATH=./uploads`

### `PUBLIC_UPLOADS_ENABLED`
- **Описание**: Разрешить публичный доступ к загруженным файлам
- **Тип**: Boolean
- **Development**: `true`
- **Production**: `false`
- **Пример**: `PUBLIC_UPLOADS_ENABLED=false`

### `MAX_IMPORT_ROWS`
- **Описание**: Максимальное количество строк для импорта
- **Тип**: Number
- **По умолчанию**: `20000` (см. `file-product-import-service/src/worker.ts`)
- **Пример**: `MAX_IMPORT_ROWS=20000`

### `MAX_IMPORT_BYTES`
- **Описание**: Максимальный размер файла для импорта (байты)
- **Тип**: Number
- **По умолчанию**: `52428800` (50MB, см. `file-product-import-service/src/worker.ts`)
- **Пример**: `MAX_IMPORT_BYTES=52428800`

### `INVITE_DENY_DOMAINS`
- **Описание**: Список доменов email, запрещённых для приглашений в компанию (через запятую)
- **Тип**: String
- **Пример**: `INVITE_DENY_DOMAINS=tempmail.com,throwaway.com`
- **Источник**: `server/src/controllers/companyController.ts`

### `MIN_SUPPLIER_PRICE`
- **Описание**: Минимальная цена поставщика (продукты ниже скрыты в каталоге). Может переопределяться настройкой в БД (ConstantsSettings).
- **Тип**: Number
- **По умолчанию**: `15`
- **Источник**: `server/src/utils/productUtils.ts`, `server/src/models/ConstantsSettings.ts`

### `FEATURE_ADMIN_COMMANDS`
- **Описание**: В production разрешить выполнение админских команд (например, по API)
- **Тип**: String (строго `true` для включения)
- **По умолчанию**: в production отключено
- **Источник**: `server/src/controllers/commandController.ts`

---

## 📊 Мониторинг и логирование

### `LOG_LEVEL`
- **Описание**: Уровень логирования
- **Тип**: String
- **Значения**: `error` | `warn` | `info` | `debug`
- **Development**: `debug`
- **Production**: `info`
- **Пример**: `LOG_LEVEL=info`

### `LOG_FORMAT`
- **Описание**: Формат логов
- **Тип**: String
- **Значения**: `json` | `text`
- **Development**: `text`
- **Production**: `json`
- **Пример**: `LOG_FORMAT=json`

### `GRAFANA_ADMIN_USER`
- **Описание**: Администратор Grafana
- **Тип**: String
- **По умолчанию**: `admin`
- **Рекомендации**: Переопределять в production, хранить в секретах/CI vars

### `GRAFANA_ADMIN_PASSWORD`
- **Описание**: Пароль администратора Grafana
- **Тип**: String
- **По умолчанию**: `admin` (только для локальных стендов)
- **Рекомендации**: Определять через секреты, минимальная длина 12 символов

---

## 🔧 FTP сервис

### `FTP_PORT`
- **Описание**: Порт FTP сервера
- **Тип**: Number
- **По умолчанию**: `21`
- **Пример**: `FTP_PORT=21`

### `FTP_HOST`
- **Описание**: Хост FTP сервера
- **Тип**: String
- **По умолчанию**: `0.0.0.0`
- **Пример**: `FTP_HOST=0.0.0.0`

### `FTP_PASV_URL`
- **Описание**: URL для PASV режима FTP
- **Тип**: String
- **Development**: `localhost`
- **Production**: `49.13.160.126`
- **Пример**: `FTP_PASV_URL=49.13.160.126`

### `FTP_PASV_PORT_MIN`
- **Описание**: Минимальный порт для PASV режима
- **Тип**: Number
- **По умолчанию**: `10000`
- **Пример**: `FTP_PASV_PORT_MIN=10000`

### `FTP_PASV_PORT_MAX`
- **Описание**: Максимальный порт для PASV режима
- **Тип**: Number
- **По умолчанию**: `10100`
- **Пример**: `FTP_PASV_PORT_MAX=10100`

### `FTP_DATA_PATH`
- **Описание**: Путь для данных FTP
- **Тип**: String
- **По умолчанию**: `/app/ftp-data`
- **Пример**: `FTP_DATA_PATH=/app/ftp-data`

### `FTP_MAX_FILE_SIZE_MB`
- **Описание**: Максимальный размер файла для FTP (MB)
- **Тип**: Number
- **По умолчанию**: `50`
- **Пример**: `FTP_MAX_FILE_SIZE_MB=50`

### `FTP_ALLOWED_FILE_TYPES`
- **Описание**: Разрешенные типы файлов для FTP
- **Тип**: String
- **По умолчанию**: `xlsx,xls,csv`
- **Пример**: `FTP_ALLOWED_FILE_TYPES=xlsx,xls,csv`

### `FTP_MAX_CONNECTIONS`
- **Описание**: Максимальное количество FTP подключений
- **Тип**: Number
- **По умолчанию**: `30`
- **Пример**: `FTP_MAX_CONNECTIONS=30`

### `HEALTH_PORT`
- **Описание**: Порт health endpoint’а FTP сервиса.
- **Тип**: Number
- **По умолчанию**: `3000`
- **Источник**: `ftp-product-sync-service/src/shared/config.ts`

### Legacy FTP (lgdeal.com, из gateway)
- **`LEGACY_POLLER_URL`** — URL сервиса legacy-ftp-poller (по умолчанию `http://legacy-ftp-poller:3001`). Источник: `server/src/controllers/ftpAdminController.ts`.
- **`LEGACY_FTP_CRYPTO_KEY`** / **`LEGACY_FTP_CRYPTO_KEY_FILE`** — ключ для расшифровки паролей legacy FTP (hex). Используется при переключении компании на legacy FTP.

---

## 🔄 API Product Sync сервис

### `SYNC_SCHEDULE`
- **Описание**: Расписание автоматической синхронизации продуктов (cron)
- **Тип**: String
- **По умолчанию**: `0 2 * * *` (ежедневно в 02:00 UTC)
- **Пример**: `SYNC_SCHEDULE=0 2 * * *`
- **Примечание**: Запускается в часы минимальной нагрузки

---

## 💎 Market Price Calculator сервис

### `CALCULATION_INTERVAL`
- **Описание**: Интервал расчета маркетпрайсов (cron выражение)
- **Тип**: String
- **По умолчанию**: `0 */3 * * *` (каждые 3 часа)
- **Пример**: `CALCULATION_INTERVAL=0 */3 * * *`

### `MAX_PROCESSING_TIME`
- **Описание**: Максимальное время обработки (миллисекунды)
- **Тип**: Number
- **По умолчанию**: `1800000` (30 минут)
- **Пример**: `MAX_PROCESSING_TIME=1800000`

### `COEFF_INR`
- **Описание**: Коэффициент влияния INR/USD на цены Lab-Grown Diamonds
- **Тип**: Number
- **По умолчанию**: `0.40` (оптимизировано для 80% затрат в INR)
- **Диапазон**: `0.0 - 1.0`
- **Пример**: `COEFF_INR=0.40`
- **Обоснование**: См. `info/27_Economic_Coefficients_Analysis.md`

### `COEFF_GOLD`
- **Описание**: Коэффициент влияния цены золота на рыночные цены
- **Тип**: Number
- **По умолчанию**: `0.06` (слабая психологическая корреляция)
- **Диапазон**: `0.0 - 1.0`
- **Пример**: `COEFF_GOLD=0.06`
- **Обоснование**: См. `info/27_Economic_Coefficients_Analysis.md`

### `COEFF_OIL`
- **Описание**: Коэффициент влияния цены нефти на рыночные цены
- **Тип**: Number
- **По умолчанию**: `0.07` (влияет только на логистику ~2-5%)
- **Диапазон**: `0.0 - 1.0`
- **Пример**: `COEFF_OIL=0.07`
- **Обоснование**: См. `info/27_Economic_Coefficients_Analysis.md`

### `OIL_PRICE_API_FILE` / `OIL_PRICE_API`
- **Описание**: API ключ для получения цен на нефть
- **Тип**: String (Secret)
- **Production**: Через Docker Secret (`/run/secrets/oil_price_api`)
- **Development**: Через переменную окружения
- **Пример**: `OIL_PRICE_API_FILE=/run/secrets/oil_price_api`

### `DB_CONNECTION_TIMEOUT`
- **Описание**: Таймаут подключения к MongoDB (миллисекунды)
- **Тип**: Number
- **По умолчанию**: `60000` (60 секунд)
- **Пример**: `DB_CONNECTION_TIMEOUT=60000`

### `DB_SOCKET_TIMEOUT`
- **Описание**: Таймаут сокета MongoDB (миллисекунды)
- **Тип**: Number
- **По умолчанию**: `90000` (90 секунд)
- **Пример**: `DB_SOCKET_TIMEOUT=90000`

---

## 📊 Analytics сервис

### `ANALYTICS_SCHEDULE`
- **Описание**: Расписание генерации аналитики (cron)
- **Тип**: String
- **По умолчанию**: `45 3 * * *` (ежедневно в 03:45 UTC)
- **Пример**: `ANALYTICS_SCHEDULE=45 3 * * *`
- **Примечание**: Запускается после market-price-calculator для актуальных данных

---

## 🔄 Backup сервис

### `BACKUP_SCHEDULE`
- **Описание**: Расписание бэкапов (cron)
- **Тип**: String
- **По умолчанию**: `0 3 * * *` (ежедневно в 3:00 UTC, после api-sync)
- **Пример**: `BACKUP_SCHEDULE=0 3 * * *`

### `RETENTION_COUNT`
- **Описание**: Количество хранимых бэкапов
- **Тип**: Number
- **По умолчанию**: `7`
- **Пример**: `RETENTION_COUNT=7`

### `BACKUP_PATH`
- **Описание**: Путь для сохранения бэкапов
- **Тип**: String
- **По умолчанию**: `/app/backups`
- **Пример**: `BACKUP_PATH=/app/backups`

---

## 🧪 Тестирование

### `TEST_TIMEOUT`
- **Описание**: Таймаут для тестов (мс)
- **Тип**: Number
- **По умолчанию**: `30000`
- **Пример**: `TEST_TIMEOUT=30000`

### `API_BASE_URL`
- **Описание**: Базовый URL API для тестов
- **Тип**: String
- **Development**: `http://localhost:5001/api`
- **Production**: `https://lgdeal.com/api`
- **Пример**: `API_BASE_URL=http://localhost:5001/api`

---

## 🔒 Безопасность переменных

### Критически важные (никогда не коммитить)
- `JWT_SECRET`
- `ADMIN_SECRET_KEY`
- `MONGODB_PASSWORD`
- `REDIS_PASSWORD`
- `RABBITMQ_PASSWORD`
- `SMTP_PASS`
- `TWILIO_AUTH_TOKEN`
- Все `*_BOT_TOKEN`
- `OIL_PRICE_API`
- `GEMINI_API_KEY`

### Важные (не коммитить в production)
- `MONGODB_URI`
- `REDIS_URL`
- `RABBITMQ_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_VERIFY_SERVICE_SID`

### Публичные (можно коммитить)
- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`
- `MAX_FILE_SIZE`
- `FTP_PORT`

---

## 📋 Файлы конфигурации

### Development (`.env`)
```bash
# Основные настройки
NODE_ENV=development
PORT=5001
FRONTEND_BASE_URL=http://localhost:3080
REACT_APP_API_URL=/api

# База данных
MONGODB_URI=mongodb://admin:password@mongodb:27017/lgdx_dev?authSource=admin
MONGODB_USER=admin
MONGODB_PASSWORD=password

# Кэш и очереди
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=redispassword
RABBITMQ_URL=amqp://lgdx:lgdx2024@rabbitmq:5672
RABBITMQ_USER=lgdx
RABBITMQ_PASSWORD=lgdx2024

# Безопасность
JWT_SECRET=dev-secret-key-64-characters-long-for-development-only
ADMIN_SECRET_KEY=admin-secret-key-32-chars-min
COOKIE_SECURE=false
CSP_ENFORCE=false

# Логирование
LOG_LEVEL=debug
LOG_FORMAT=text
```

### Production (Docker Secrets)
```bash
# Используются Docker Secrets
JWT_SECRET_FILE=/run/secrets/jwt_secret
ADMIN_SECRET_KEY_FILE=/run/secrets/admin_secret_key
MONGODB_URI_FILE=/run/secrets/mongodb_uri
REDIS_URL_FILE=/run/secrets/redis_url
RABBITMQ_URL_FILE=/run/secrets/rabbitmq_url
SMTP_PASS_FILE=/run/secrets/smtp_pass
TWILIO_AUTH_TOKEN_FILE=/run/secrets/twilio_auth_token
# ... и другие секреты
```

---

## 📚 Дополнительные ресурсы

- **Production & Deployment**: [03_Production_Deployment.md](03_Production_Deployment.md)
- **Quick Start**: [01_Quick_Start.md](01_Quick_Start.md)
- **Security**: [10_SECURITY.md](10_SECURITY.md)
- **Scripts**: [28_Scripts_and_Utilities.md](28_Scripts_and_Utilities.md)
- **Troubleshooting**: [07_Troubleshooting.md](07_Troubleshooting.md)

---

**🔧 Статус:** ПОЛНОСТЬЮ ДОКУМЕНТИРОВАНО  
**📊 Переменных:** 50+ переменных окружения  
**🔒 Безопасность:** Все секреты защищены Docker Secrets
