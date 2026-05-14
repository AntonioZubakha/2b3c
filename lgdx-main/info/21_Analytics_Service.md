# 📊 Analytics Service (REFACTORED)

## 🎯 Обзор

**Analytics Service** - это упрощенный и оптимизированный микросервис для генерации аналитических данных о рынке алмазов. Использует MongoDB Aggregation Pipeline для эффективной обработки данных и сохраняет результаты в базе данных для быстрого доступа.

## ✨ Возможности

### 📈 Аналитические данные
- **Market Overview**: Общая статистика рынка, распределение по формам, весу, ценовым сегментам
- **Demand Analysis**: Анализ спроса на основе исчезнувших продуктов (MongoDB Aggregation Pipeline)
- **Supply Insights**: Рекомендации по производству (заготовка для будущего развития)
- **Price Trends**: Динамика цен и новые поступления
- **Database Caching**: Сохранение результатов в MongoDB для быстрого доступа
- **Scheduled Updates**: Ежедневное обновление аналитики в 03:45 UTC

## 🏗️ Архитектура

### Общая схема системы (УПРОЩЕННАЯ)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Analytics     │    │  MongoDB         │    │   Frontend      │
│   Service       │───▶│  Aggregation     │───▶│   (React)       │
│   (9200)        │    │  Pipeline        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Database      │    │  Results Cache   │    │   Nginx         │
│   (MongoDB)     │◀───│  (MongoDB)       │    │   (Reverse      │
│                 │    │                  │    │   Proxy)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Структура микросервиса (УПРОЩЕННАЯ)
```
analytics-service/
├── src/
│   ├── controllers/
│   │   └── analyticsController.ts             # Единый упрощенный контроллер
│   ├── models/
│   │   ├── AnalyticsData.ts                   # Типы данных
│   │   ├── AnalyticsDataModel.ts              # MongoDB модель
│   │   ├── Product.ts                         # Модель продукта
│   │   └── ProductCategoryStats.ts            # Статистика категорий
│   ├── services/
│   │   ├── analyticsService.ts                # Основной сервис (оркестратор)
│   │   ├── marketAnalysisService.ts           # Единый сервис анализа (вся логика)
│   │   └── analyticsDataService.ts            # Работа с БД (сохранение/получение)
│   ├── scheduler/
│   │   └── analyticsScheduler.ts              # Планировщик (ежедневный пересчет)
│   ├── utils/
│   │   ├── constants.ts                       # Константы
│   │   ├── databaseIndexes.ts                 # Управление индексами
│   │   ├── dateUtils.ts                       # Утилиты дат
│   │   └── logger.ts                          # Логирование
│   ├── config/
│   │   └── database.ts                        # Конфигурация БД
│   └── index.ts                               # Главный файл приложения
├── Dockerfile
└── package.json
```

## 📊 Система категоризации форм

### Новые категории форм (2024)
Analytics Service использует обновленную систему категоризации форм бриллиантов:

**Основные формы:**
- `ROUND` - Круглая
- `OVAL` - Овальная  
- `PEAR` - Грушевидная
- `CUSHION` - Подушка
- `EMERALD` - Изумруд
- `RADIANT` - Радиант
- `PRINCESS` - Принцесса
- `MARQUISE` - Маркиз
- `HEART` - Сердце
- `ASSCHER` - Ашчер

**Специальная категория:**
- `FANCY` - Фенси (все остальные формы)

### Константы в `utils/constants.ts`
```typescript
export const MAIN_SHAPES = [
  'ROUND', 'OVAL', 'PEAR', 'CUSHION', 'EMERALD', 'RADIANT', 
  'PRINCESS', 'MARQUISE', 'HEART', 'ASSCHER',
  // Версии для совместимости (lowercase)
  'Round', 'Oval', 'Pear', 'Cushion', 'Emerald', 'Radiant',
  'Princess', 'Marquise', 'Heart', 'Asscher'
];
```

### Совместимость
- Поддерживаются как uppercase, так и lowercase версии названий форм
- Старые группировки (`SQUARE_RECTANGULAR`, `ELONGATED_DROPLET`) больше не используются
- Все редкие формы автоматически попадают в категорию `FANCY`

## 🔧 API Endpoints

### Аналитические данные
- `GET /analytics/day` - Аналитика за день
- `GET /analytics/week` - Аналитика за неделю  
- `GET /analytics/month` - Аналитика за месяц
- `GET /analytics/:period` - Универсальный endpoint для всех периодов (`day|week|month`)

### Дополнительные аналитические маршруты (актуально по `analytics-service/src/index.ts`)
- `GET /analytics/compare` - сравнение категорий
- `GET /analytics/compare-categories` - сравнение двух категорий
- `GET /analytics/price-trends` - тренды цен за период
- `GET /analytics/supply-opportunities` - “возможности” по supply
- `GET /analytics/category-options` - доступные опции категорий (для UI фильтров)

### Category stats (статистика по категориям)
- `GET /category-stats` — список категорий и статистика
- `GET /category-stats/chart/:shape/:weight/:clarity/:color` — данные для графика по категории

### Управление данными
- `POST /analytics/recalculate` — пересчёт всех данных и сохранение в БД

### Системные
- `GET /health` — проверка состояния сервиса (память, БД)
- `GET /metrics` — Prometheus метрики

## 🚀 Запуск

### Development
```bash
cd analytics-service
npm install
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker
```bash
# Сборка образа
docker build -t lgdx-analytics-service:latest .

# Запуск в development
docker-compose -f docker-compose.dev.yml up analytics-service-dev

# Запуск в production (локально, НЕ Swarm)
docker-compose -f docker-compose.prod.local.yml up analytics-service
```

### Docker Swarm (Production)
```bash
# Deploy stack
docker stack deploy -c docker-compose.prod.local.yml lgdx

# Update service
docker service update --force lgdx_analytics-service

# View logs
docker service logs lgdx_analytics-service
```

## 🔧 Конфигурация

### Переменные окружения
```bash
# MongoDB
MONGODB_URI_FILE=/run/secrets/mongodb_uri

# Server Configuration
PORT=9200
BACKEND_HOST=lgdx-server
BACKEND_PORT=5000

# Logging
LOG_LEVEL=info
NODE_ENV=production

# Redis cache
REDIS_URL_FILE=/run/secrets/redis_url

# Telegram (stock notifications)
STOCK_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/stock_telegram_bot_token
STOCK_TELEGRAM_CHAT_ID_FILE=/run/secrets/stock_telegram_chat_id

# Schedule
ANALYTICS_SCHEDULE="45 3 * * *"
```

Важно:

- По умолчанию, если `ANALYTICS_SCHEDULE` не задан, используется `0 0 * * *` (00:00 UTC) — см. `analytics-service/src/scheduler/analyticsScheduler.ts`.

### Docker Service Configuration
```yaml
analytics-service:
  image: lgdx-analytics-service:latest
  environment:
    NODE_ENV: production
    MONGODB_URI_FILE: /run/secrets/mongodb_uri
    REDIS_URL_FILE: /run/secrets/redis_url
    STOCK_TELEGRAM_BOT_TOKEN_FILE: /run/secrets/stock_telegram_bot_token
    STOCK_TELEGRAM_CHAT_ID_FILE: /run/secrets/stock_telegram_chat_id
    BACKEND_HOST: lgdx-server
    BACKEND_PORT: "5000"
    LOG_LEVEL: "info"
    ANALYTICS_SCHEDULE: "45 3 * * *"
  volumes:
    - ./analytics-service/logs:/app/logs
  networks:
    - lgdx-network
  secrets:
    - mongodb_uri
    - redis_url
    - stock_telegram_bot_token
    - stock_telegram_chat_id
  depends_on:
    - mongodb
```

## 📊 Источники данных

### Коллекция `products`
Содержит информацию о каждом алмазе:
- `certificateNumber` - номер сертификата
- `carat` - вес в каратах
- `shape` - форма (ROUND, OVAL, PEAR, CUSHION, EMERALD, RADIANT, PRINCESS, MARQUISE, HEART, ASSCHER, FANCY)
- `clarity` - чистота (IF, VVS1, VVS2, VS1, VS2)
- `color` - цвет (D, E, F, G)
- `price` - цена
- `pricePerCarat` - цена за карат
- `marketPrice` - рыночная цена
- `marketPricePerCarat` - рыночная цена за карат
- `status` - статус (available, sold, etc.)
- `onDeal` - в сделке ли
- `sold` - продан ли
- `createdAt` - дата создания
- `updatedAt` - дата обновления

### Коллекция `productcategorystats`
Содержит ежедневную статистику по категориям:
- `shape`, `weight`, `clarity`, `color` - категории
- `count` - количество продуктов в категории
- `avgPricePerCarat` - средняя цена за карат
- `medianPricePerCarat` - медианная цена за карат
- `marketPricePerCarat` - рыночная цена за карат
- `newProductsToday` - новых продуктов сегодня
- `disappearedProductsSinceYesterday` - исчезнувших продуктов
- `priceIncreasedCount`, `priceDecreasedCount`, `priceUnchangedCount` - изменения цен
- `productDetails` - детали продуктов с сертификатами и ценами

## 🧠 Database Caching System

### Принцип работы
1. **Ежедневно в 03:45 UTC** - автоматический расчет аналитики (после завершения market-price-calculator)
2. **Сохранение в БД** - результаты сохраняются в MongoDB для быстрого доступа
3. **Быстрое получение** - данные из БД за <200ms
4. **Автоматическое обновление** - без ручного вмешательства

### Frontend Integration

#### MarketOverviewTabs.tsx
- **Файл**: `client/src/components/MarketOverview/MarketOverviewTabs.tsx`
- **Функциональность**:
  - 5 вкладок: Overview, Demand Analysis, Supply Insights, Price Trends, Market News
  - Переключение периодов (Day/Week/Month) для Demand Analysis
  - Быстрое получение данных из БД
  - Админские функции (Recalculate Market)

#### API Endpoints
- **Health Check**: `GET /health` - состояние сервиса
- **Analytics**: `GET /analytics/:period` - данные за период (day/week/month)
- **Legacy Support**: `GET /analytics/day|week|month` - прямая поддержка периодов
- **Recalculate**: `POST /analytics/recalculate` - принудительный пересчет

#### API Client
- **Файл**: `client/src/api/analyticsApi.ts`
- **Методы**:
  - `get(period)` - получение данных за период
  - `post('/recalculate')` - пересчет данных

### Nginx Configuration
- **Файл**: `nginx/nginx.production.final.conf`
- **Эндпоинт**: `/analytics` (без обязательного trailing slash)
- **Проксирование**: `analytics-service:9200`
- **Также**: `nginx.production.final.conf` проксирует `GET /api/category-stats*` на analytics-service (а `/api/category-stats/calculate` — на market-price-calculator)

## 🔄 Интеграция

### Database Integration
- Прямая работа с MongoDB через Mongoose
- Оптимизированные индексы для быстрых запросов
- Сохранение результатов аналитики в БД

### Frontend Integration
- Отдельный API клиент: `analyticsApi`
- Поддержка всех периодов (day/week/month)
- Совместимость с существующими компонентами

### Backend Integration
- Использование общих моделей данных (Product, ProductCategoryStats)
- Независимая работа без зависимости от основного сервера

## 📈 Метрики и мониторинг

### Health Check
```bash
# Проверка состояния сервиса
curl http://localhost:9200/health
```

### Логирование
- **Структурированные логи** с использованием Winston
- **Уровни логирования**: error, warn, info, debug
- **Контекстная информация**: period, processingTime, memoryUsage
- **Ротация логов** для production

### Метрики производительности
- **Время генерации**: < 30 секунд
- **Использование памяти**: мониторинг в реальном времени
- **Частота**: Ежедневно в 03:45 UTC (45 3 * * *)
- **Периоды**: day, week, month

## 🧪 Тестирование

### Запуск тестов
```bash
# Все тесты
npm test

# Тесты в watch режиме
npm run test:watch

# Покрытие кода
npm run test:coverage
```

### Основные тест-кейсы
1. **API Endpoints**:
   - Успешное получение аналитики
   - Обработка ошибок
   - Валидация параметров

2. **Database Operations**:
   - Сохранение данных в БД
   - Получение данных из БД
   - MongoDB Aggregation Pipeline
   - Автоматическое обновление

3. **Интеграция**:
   - Подключение к MongoDB
   - Health check endpoints
   - Планировщик задач

## 🐛 Troubleshooting

### Частые проблемы

#### 1. Сервис не запускается
```bash
# Проверить статус сервиса
curl http://localhost:9200/health

# Проверить логи
docker service logs lgdx_analytics-service

# Проверить подключение к MongoDB
docker exec -it $(docker ps -q -f name=analytics-service) node -e "console.log(process.env.MONGODB_URI)"
```

#### 2. Данные не генерируются
```bash
# Проверить подключение к MongoDB
docker exec -it $(docker ps -q -f name=mongodb) mongosh --eval "db.products.countDocuments()"

# Проверить логи генерации
docker service logs lgdx_analytics-service | grep "Generating analytics"

# Принудительно пересчитать данные
curl -X POST http://localhost:9200/analytics/recalculate
```

#### 3. Проблемы с данными
```bash
# Проверить подключение к MongoDB
docker exec -it $(docker ps -q -f name=mongodb) mongosh --eval "db.analyticsdata.countDocuments()"

# Принудительно пересчитать данные
curl -X POST http://localhost:9200/analytics/recalculate

# Проверить логи генерации
docker service logs lgdx_analytics-service | grep "Generating analytics"
```

#### 4. Frontend не получает данные
```bash
# Проверить nginx
docker service logs lgdx_nginx --tail 20

# Проверить, что analytics-service жив (напрямую по опубликованному порту)
curl http://localhost:9200/health
```

## 🔄 Обновления и миграции

### Обновление сервиса
```bash
# 1. Пересобрать образ
docker build -t lgdx-analytics-service:latest ./analytics-service

# 2. Обновить сервис с принудительным перезапуском
docker service update --force lgdx_analytics-service

# 3. Проверить статус
docker service ps lgdx_analytics-service
```

### Миграция данных
```bash
# Бэкап аналитических данных
docker exec -it $(docker ps -q -f name=mongodb) mongodump --db lgdx --collection analyticsdata --out /backup

# Восстановление аналитических данных
docker exec -it $(docker ps -q -f name=mongodb) mongorestore --db lgdx /backup/lgdx
```

## 📚 API Reference

### GET /analytics/day
Получить аналитику за день.

**Ответ**:
```json
{
  "success": true,
  "data": {
    "marketOverview": {
      "totalProducts": 15000,
      "shapeStats": [...],
      "weightStats": [...],
      "priceSegments": [...]
    },
    "demandAnalysis": {
      "totalDisappeared": 65,
      "totalReappeared": 15003,
      "salesConfidence": 0.004,
      "topDemandCategories": [...],
      "demandByShape": [...],
      "demandByWeight": [...],
      "demandByClarity": [...],
      "demandByColor": [...]
    },
    "priceTrends": {
      "newArrivals": {
        "last24h": 150,
        "last72h": 450
      },
      "priceDynamics": [...]
    }
  }
}
```

### POST /analytics/recalculate
Запустить пересчет всех данных.

**Ответ**:
```json
{
  "success": true,
  "message": "Analytics recalculation completed successfully",
  "results": [
    {
      "period": "day",
      "success": true,
      "message": "Day analytics updated"
    },
    {
      "period": "week", 
      "success": true,
      "message": "Week analytics updated"
    },
    {
      "period": "month",
      "success": true,
      "message": "Month analytics updated"
    }
  ],
  "duration": "2.5s"
}
```

### GET /health
Проверить здоровье сервиса.

**Ответ**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "memory": {
    "used": "45.2MB",
    "total": "67.8MB",
    "external": "12.3MB"
  },
  "database": {
    "isConnected": true,
    "readyState": 1,
    "host": "localhost",
    "port": 27017,
    "name": "lgdx"
  },
  "uptime": 3600
}
```

## 🎯 Результат

### Автоматическая система:
- ✅ **Ежедневно в 03:45 UTC** - автоматический расчет аналитики (cron: `45 3 * * *`, в production может ждать завершения market-price-calculator через ServiceCoordinator)
- ✅ **Быстрое отображение** - данные из БД за <200ms
- ✅ **Автоматическое обновление** - без ручного вмешательства
- ✅ **Надежность** - обработка ошибок и восстановление

### Пользовательский опыт:
- ✅ **Быстрое переключение** между Day/Week/Month
- ✅ **Актуальные данные** - обновляются автоматически
- ✅ **Никаких ошибок** - стабильная работа системы
- ✅ **Быстрый отклик** - все данные из БД
- ✅ **Красивый интерфейс** - современный дизайн с анимациями

## 📞 Поддержка

### Логи для диагностики
```bash
# Логи сервиса
docker service logs lgdx_analytics-service

# Логи с фильтрацией
docker service logs lgdx_analytics-service 2>&1 | grep ERROR

# Логи в реальном времени
docker service logs -f lgdx_analytics-service
```

### Ключевые метрики для мониторинга
- Доступность сервиса (port 9200)
- Время генерации аналитики
- Использование памяти и CPU
- Ошибки подключения к MongoDB
- Статус планировщика задач

---

## 📋 Заключение

Analytics Service (REFACTORED) обеспечивает упрощенную и эффективную аналитику для платформы LGDX. Сервис использует MongoDB Aggregation Pipeline для быстрой обработки данных и сохраняет результаты в базе данных для быстрого доступа.

**Ключевые улучшения после рефакторинга**:
- ✅ **Упрощенная архитектура** - убраны избыточные сервисы и зависимости
- ✅ **Меньше техдолга** - логика вынесена в Aggregation Pipeline + результаты кэшируются в MongoDB
- ✅ **Оптимизированные запросы** - MongoDB Aggregation Pipeline для быстрой обработки
- ✅ **База данных как кэш** - результаты сохраняются в MongoDB для быстрого доступа
- ✅ **Полная совместимость** - сохранены все API контракты с клиентом

**Текущее состояние**: Сервис полностью функционален, оптимизирован и готов к использованию в production.

Для дополнительной информации обращайтесь к команде разработки LGDX.