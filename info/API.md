# API Gateway — обзор

Браузер ходит на относительный префикс **`/api`** (Vite проксирует на `API_GATEWAY_URL`, по умолчанию `http://127.0.0.1:8080`).

Upstream в этом репозитории — **Fastify + TypeScript**. Регистрация прокси: `apps/api-gateway/src/server.ts`.

## Префиксы прокси

| Префикс | Upstream (в Docker: hostname:порт) |
|---------|-------------------------------------|
| `/api/catalog` | catalog-service:3000 |
| `/api/jewelry` | jewelry-service:3000 |
| `/api/search` | search-service:3000 |
| `/api/supplier` | supplier-service:3000 |
| `/api/user` | user-service:3000 |
| `/api/pricing` | pricing-service:3000 |
| `/api/order` | order-service:3000 |
| `/api/recommendations` | recommendation-service:3000 |
| `/api/notifications` | notification-service:3000 |

## Публичные маршруты (без JWT)

Логика в `apps/api-gateway/src/server.ts` (хук `authenticate`, условие `isPublic`):

- `GET /health`
- `POST /api/user/auth/login`, `POST /api/user/auth/register`
- `GET` с префиксами: `/api/catalog`, `/api/jewelry`, `/api/search`, **`/api/recommendations`**
- `GET` с префиксом `/api/supplier/registry`
- `GET` путей вида `/api/.../health` (суффикс `/health`)
- `POST /api/order/webhooks/stripe`
- Для `/api/order/cart`: методы **`GET`**, **`POST`**, **`DELETE`** (гостевая корзина по `sessionId`)

Остальные запросы ожидают **`Authorization: Bearer <jwt>`**. После проверки шлюз добавляет заголовки **`x-user-id`** и **`x-user-role`** к upstream.

## Catalog (через `/api/catalog`)

Прокси снимает префикс `/api/catalog` — на **catalog-service** уходят пути вида `/health`, `/stats`, `/`, `/:identifier`, …

Публичные **`GET`** (см. список выше) включают в том числе:

- **`GET /api/catalog/health`** — готовность сервиса и Mongo.
- **`GET /api/catalog/stats`** — счётчики `inStock` / `total` без выгрузки всего каталога.
- **`GET /api/catalog/?…`** — список **только `availability: in-stock`**, query-параметры: `shape`, `color`, `clarity`, `cut`, `minPrice`, `maxPrice`, `minCarat`, `maxCarat`, `sort` (`price-asc` | `price-desc` | `score-desc` | `createdAt-desc`). Опционально **`supplierId`** (строка до 80 символов, `[A-Za-z0-9_-]+`) — фильтр по каталожному идентификатору поставщика (для партнёрского инвентаря и интеграций). Опционально **`page`** и **`limit`** (1…500): в ответе появляются **`total`**, **`pages`**, **`page`**; без них — прежнее поведение (все совпадения в одном ответе).

## KYC и крупные заказы

Параметры задаются в `docker-compose` / `.env`, в т.ч. **`STONEE_KYC_ENFORCE_MIN_USD`**, **`STONEE_INTERNAL_SECRET`**, **`USER_SERVICE_URL`** на order-service и user-service.

- Клиент с JWT: при пороге **`POST /api/order/checkout`** или создании платежа могут вернуться **`403`** с кодом вроде `kyc_required` или **`503`** с `kyc_unavailable` (см. ответы order-service).
- **`GET /api/user/auth/me`** — профиль, в т.ч. `kycStatus`.
- Внутренний **`GET /internal/kyc/:userId`** в user-service не проксируется наружу через этот список публичных маршрутов.

## Фронтенд

Константы путей: `apps/frontend/src/lib/api.ts` — объект **`GATEWAY`**.

## User-service (через `/api/user`)

Прокси снимает префикс `/api/user`.

- **`GET /api/user/auth/companies/:companyId`** — JWT; участник компании может читать профиль (имя, контакты, адрес, описание).
- **`PATCH /api/user/auth/companies/:companyId`** — только **owner** компании.

## Order-service: поставщик (через `/api/order`)

Требуют JWT с ролью **supplier**; шлюз выставляет **`x-supplier-company-id`**.

- **`GET /api/order/supplier/orders`** — список заказов, в которых есть позиции, относящиеся к каталожному `supplierId` активной компании (вызов catalog internal map по SKU).
- **`GET /api/order/supplier/orders/:id`** — деталь при той же видимости.

## Catalog-service: внутренний маппинг SKU

На сервисе путь **`POST /internal/sku-supplier-map`** (через шлюз: **`POST /api/catalog/internal/sku-supplier-map`**). Тело: `{ "skus": ["…"] }`. Если в catalog-service задан **`STONEE_INTERNAL_SECRET`**, нужен заголовок **`x-stonee-internal`** с тем же значением (order-service передаёт его при обращении к catalog). Ответ: `{ success, data: { [sku]: supplierId } }`.

## Supplier-service: сводка для партнёра

- **`GET /api/supplier/self/summary`** — JWT supplier; ответ: `supplierCompanyId`, `catalogSupplierId`, **`canSyncDiamondAtelier`** (совпадение с `DIAMOND_ATELIER_SUPPLIER_COMPANY_ID` / legacy user в env), **`diamondAtelierFeed`** только если `canSyncDiamondAtelier` (иначе `null` — чужой глобальный статус не отдаём).
- **`GET /api/supplier/self/registry`** — JWT supplier; таблица фидов без строки Diamond Atelier, если компания к ней не привязана; текст `auth` без обещания DA-синка для чужих компаний.
- Публичный **`GET /api/supplier/registry`** — полный справочник фидов (в списке публичных маршрутов шлюза); для UI партнёрского кабинета предпочтительнее **`/self/registry`**.
