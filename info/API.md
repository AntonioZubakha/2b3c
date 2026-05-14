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

## Order-service (через `/api/order`)

Прокси снимает префикс `/api/order`. Ниже — пути **на сервисе** (как в коде); снаружи добавляйте **`/api/order`**.

### Корзина (гостевая, без JWT на gateway)

- **`GET /cart/:sessionId`** — текущая корзина.
- **`POST /cart/:sessionId/add`** — тело: `{ type, productId, price, quantity?, bespokePair? }` (`jewelry` | `diamond` | `bespoke` | …).
- **`DELETE /cart/:sessionId/item/:productId`** — удалить первую строку с данным `productId`.

### Checkout и заказ (JWT на gateway)

- **`POST /checkout`** — тело: `{ sessionId, shippingAddress }`. Сервер вызывает **`POST {PRICING_SERVICE_URL}/validate-prices`** с позициями корзины и **не доверяет** клиентским ценам. Адрес сохраняется в каноническом виде: **`addressLine1`** (из `addressLine1` **или** UI-поля `street`), **`zipCode`** (из `zipCode` **или** `postalCode`), плюс `fullName`, `city`, `country` — см. `services/order-service/src/server.ts` (`normalizeShippingAddress`). Ответ: `{ success: true, data: { orderId } }`. Статус нового заказа: **`PENDING`**.

### Оплата

- **`POST /orders/:id/create-payment-intent`** — JWT, валидный Stripe; KYC gate при высокой сумме. Сохраняет `paymentIntentId` на заказе. Ответ: `{ success, data: { clientSecret, amount, currency } }`.
- **`POST /orders/:id/confirm-stripe-payment`** — после успешного `stripe.confirmPayment` на клиенте; проверяет PI `succeeded` и сумму в центах; вызывает `finalizePaidOrder`. Ответ: `{ success, data: order, meta?: { alreadyConfirmed } }`.
- **`POST /orders/:id/pay`** — **симулированная** оплата: разрешена только если `STRIPE_ALLOW_SIMULATED_PAY=true` **или** пустой `STRIPE_SECRET_KEY` (см. `info/SECURITY.md`). Иначе **400** с текстом про Stripe.

### Статусы заказа (фактическая машина после оплаты)

Значения enum: `PENDING`, `PAID`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED` (`Order.ts`).

- После **успешной** оплаты (Stripe confirm, webhook `payment_intent.succeeded`, или **`POST …/pay`** при разрешённой симуляции) `finalizePaidOrder` атомарно переводит заказ **`PENDING` → `CONFIRMED`** (промежуточный **`PAID`** в этом happy-path **не** выставляется).
- **`PAID`** остаётся в модели для совместимости / ручных сценариев (например merchant), но **покупательский** checkout не использует его как отдельный шаг.

### Webhook Stripe

- На order-service: **`POST /webhooks/stripe`** (сырое тело, подпись `stripe-signature`). Через gateway для браузера/Stripe Dashboard: **`POST /api/order/webhooks/stripe`** (см. `apps/api-gateway/src/server.ts`, публичный маршрут).
- Идемпотентность: коллекция **`ProcessedStripeEvent`** по **`event.id`**; дубликат Mongo **11000** → `200` без повторного финала. При ошибке после вставки lock удаляется — см. `info/SECURITY.md`.

### Покупательские списки

- **`GET /my-orders`**, **`GET /my-orders/:id`** — JWT, только заказы текущего `x-user-id`.

Покупатель видит **ровно тот же** `status`, что хранится в Mongo (после оплаты happy-path — **`CONFIRMED`**, см. раздел «Статусы заказа» выше). **Нет** поля уровня «manufacturing stage» или трек-номера ТК — шкала на фронте (`orderTracking.ts`) строится **только** из значений `OrderStatus`.

Переходы **`SHIPPED`**, **`DELIVERED`**, **`CANCELLED`** (и прочие значения enum) задаются операционно через **`PATCH /orders/:id/status`** с ролью, у которой есть право менять статус (`canEditOrderStatus`); это **не** покупательский маршрут, но ответы **GET** для владельца заказа должны совпадать с сохранённым значением.
