# Stonee — архитектура

Фактическое устройство монорепозитория: сервисы, шлюз, инфраструктура из `docker-compose.yml` и связи по HTTP.

---

## Точка входа

Браузер и внешние клиенты ходят на **`/api/*`** через **api-gateway** (`apps/api-gateway`, порт **8080** в compose). Шлюз: JWT (кроме явно публичных маршрутов), rate limit, CORS, прокси на микросервисы (`@fastify/http-proxy`). Список публичных путей — в `apps/api-gateway/src/server.ts` и в **`info/API.md`**.

Фронтенд (`apps/frontend`, Vite) в dev проксирует `/api` на `API_GATEWAY_URL` (см. `vite.config.ts`, по умолчанию `http://127.0.0.1:8080`).

---

## Микросервисы

Все сервисы в репозитории — **Node.js + TypeScript + Fastify**, если в таблице не указано иное.

| Сервис | Роль (по коду) |
|--------|----------------|
| **api-gateway** | Единая точка `/api/*`: проверка JWT, прокси на сервисы ниже. |
| **user-service** | Регистрация/логин, JWT, профиль, роли; MongoDB `stonee_users`. Поставщик привязан к **компаниям** (`supplierCompanies` в JWT); **`GET/PATCH /auth/companies/:companyId`** — профиль компании (PATCH только owner). |
| **catalog-service** | `GET /health`, `GET /stats`, `GET /` — фильтрованный список in-stock с сортировкой и **опциональной пагинацией**; `GET /:identifier`; `POST /`, `POST /bulk-upsert`, `PATCH /status-bulk`; **`POST /internal/sku-supplier-map`** — по списку SKU возвращает `supplierId` из Mongo (заголовок `x-stonee-internal` при заданном `STONEE_INTERNAL_SECRET`); MongoDB `stonee_catalog`, индексы под фильтры, после записи — инвалидация кэша search. |
| **search-service** | `GET /filter`, `GET /facets`; читает ту же Mongo `stonee_catalog`, кэширует ответы в **Redis**. Поля выдачи задаются явным `.select(...)` в `services/search-service/src/server.ts` (например `videoUrl` для маркетплейса). |
| **pricing-service** | Скоринг камней (Diamond Score, deal badge), `POST /recalculate-all`; ходит в catalog и jewelry по HTTP, **без своей Mongo в этом сервисе**. |
| **order-service** | Корзина по `sessionId`, checkout, заказы, Stripe PaymentIntent и webhooks; MongoDB `stonee_orders`; уведомления — HTTP `POST` на `notification-service:3000/notify`. Для роли **supplier** (JWT + `x-supplier-company-id` от шлюза): **`GET /supplier/orders`**, **`GET /supplier/orders/:id`** — заказы с позициями, чьи SKU мапятся на `supplierId` активной компании через **catalog-service** `POST /internal/sku-supplier-map` (секрет `STONEE_INTERNAL_SECRET`). |
| **jewelry-service** | Оправы и коллекции (`/settings`, `/collections` и т.д. — см. роуты сервиса); MongoDB для изделий/настроек. |
| **supplier-service** | Инжест в catalog (Diamond Atelier, `POST /ingest/stonee-json`, http-feed и др.); JWT; Mongo **`stonee_supplier_meta`** (`FeedSyncState` для DA — один глобальный документ по `source`, в API отдаётся **только** компании, привязанной в env к DA). **`GET /self/summary`** — `supplierCompanyId`, `catalogSupplierId`, **`canSyncDiamondAtelier`**, **`diamondAtelierFeed`** только при `canSyncDiamondAtelier`. **`GET /self/registry`** — список фидов для текущей компании (строка DA скрыта, если компания не привязана). Публичный **`GET /registry`** — полный справочник (в т.ч. для staff/доков). |
| **notification-service** | `GET /health`, `POST /notify` — буфер логов и опционально заглушка Telegram; `GET /logs` (staff); вызывается из order-service. |
| **recommendation-service** | `GET /health` (на upstream после шлюза — `GET /api/recommendations/health`), `GET /api/recommendations/match/:sku`, `GET /api/recommendations/trending` (см. `services/recommendation-service/src/server.ts`); HTTP к **jewelry-service** с таймаутом axios. |

---

## Инфраструктура в Docker Compose

| Компонент | Проброс с хоста (из `docker-compose.yml`) |
|-----------|---------------------------------------------|
| Frontend (Vite dev в контейнере) | **3000** |
| api-gateway | **8080** |
| MongoDB | **27018** → 27017 в контейнере (отдельные БД по сервисам: `stonee_users`, `stonee_catalog`, `stonee_orders`, …) |
| Redis | **6079** → 6379 |
| RabbitMQ | **5672**, UI **15672** |
| user-service (опционально снаружи) | **3001** |

**Healthchecks:** у **MongoDB** (`mongosh` ping), **Redis**, **RabbitMQ** — сервисы приложений ждут готовности Mongo/Redis там, где в `docker-compose.yml` указано `depends_on: … condition: service_healthy`.

**Перезапуск:** у сервисов приложений задано **`restart: unless-stopped`**.

**Redis** — кэш **search-service**. **RabbitMQ** в compose есть для будущих очередей; **текущий код AMQP не использует**, и ни один сервис в этом файле на Rabbit не зависит.

---

## Потоки данных (фронт ↔ API)

- **Сетка маркетплейса:** `GET /api/search/filter?...` — урезанный набор полей + Redis-кэш.
- **Страница камня:** `GET /api/catalog/:id` — полный документ из catalog.
- **Медиа камня:** поля `images`, `videoUrl` с бэка; компонент `DiamondCatalogMedia` (картинка, прямое видео или iframe просмотрщика).
- **Корзина и заказы:** `GET /api/order/cart/:sessionId`, мутации `…/add`, `…/pay`, checkout — см. `GATEWAY.order` на фронте. Кэш корзины в React Query централизован в **`apps/frontend/src/lib/orderQuery.ts`** (общие query keys и `useCartQuery`); после добавления товара или успешной оплаты кэш инвалидируется по префиксу ключей (см. `info/FRONTEND.md`).
- **Поставщик:** заказы своей компании — `GET /api/order/supplier/orders` (+ detail); портал тянет **`/api/supplier/self/summary`** и **`/api/supplier/self/registry`** (не путать с публичным `/api/supplier/registry`).

---

## MVP: роли, компании, изоляция (зафиксировано в коде)

- **Поставщик = компания:** в JWT список `supplierCompanyIds`; gateway выбирает **`x-supplier-company-id`** (из заголовка клиента, если входит в список, иначе первая компания).
- **Заказы поставщика:** только строки, чьи SKU в каталоге мапятся на **`supplierId`** активной компании (`POST /internal/sku-supplier-map` + `STONEE_INTERNAL_SECRET` при необходимости).
- **Профиль компании:** `GET/PATCH /api/user/auth/companies/:id` (PATCH — owner).
- **Фронт:** три поверхности UI (`buyer` / `supplier` / `staff` в `uiSurface.ts`); **supplier и staff-хром только при наличии `token`**, чтобы на `/auth` не «залипали» вкладки партнёра без сессии. Роут `/auth` **вне** `AppRouteOutlet`; партнёрские страницы внутри — редиректы по роли в outlet.
- **DA-синк в UI:** блок и статистика только если **`canSyncDiamondAtelier`** (совпадение с `DIAMOND_ATELIER_SUPPLIER_COMPANY_ID` или legacy user в env).
- **Пока не в репо как продукт:** отдельная история синков JSON/HTTP **по каждой** компании в БД; полный ops-backlog (закупки/продажи, скидки, залежалый сток, члены компании с UI, банковские реквизиты в форме и т.д.).

---

## Команды проверки

```bash
docker compose up -d --build
pnpm run smoke
```

`scripts/smoke.mjs`: цепочка **health** через gateway (в т.ч. `/api/catalog/health`, `/api/notifications/health`, `/api/recommendations/health`), регистрация/логин, при наличии камней в поиске — корзина, checkout, оплата, bespoke; при пустом каталоге часть шагов пропускается (см. вывод `[SKIP]`).

---

## Микросервисы: trade-off

Сейчас в compose **несколько мелких сервисов** (notification, recommendation, pricing, supplier и др.) — это **осознанный обмен**: проще изолировать деплой и ответственность команды, выше **operational** нагрузок (логи, мониторинг, отладка цепочек HTTP). Слияние в «modular monolith» возможно позже, но это **крупный рефакторинг**, а не обязательный шаг для текущего кода.

Отдельный **full-text / facet search engine** (Meilisearch, OpenSearch и т.д.) в репозитории **не подключён** — каталог и поиск идут через **MongoDB** и кэш Redis в search-service.

**RabbitMQ** в compose есть; **AMQP в сервисах не используется** — события между доменами не шинуем, критичные флоу синхронные по HTTP (см. order-service, pricing).

## Масштабирование (общие заметки, не требования репо)

1. При росте каталога — мониторинг slow queries; при необходимости — вынесенный search engine (сейчас в catalog уже есть compound-индексы под основные фильтры).
2. Таймауты и устойчивость HTTP между сервисами (частично: axios с таймаутами в pricing/recommendation/supplier/order; на фронте — `AbortSignal` в `apiFetch`, см. `info/FRONTEND.md`).
3. Политика инвалидации Redis (`STONEE_CACHE_INVALIDATE_SECRET`, эндпоинты в search/catalog).
4. Наблюдаемость (OpenTelemetry, единый лог-агрегатор) — пока **вне репозитория**, планируется под production по необходимости.

---

## Кодстайл

- Общие типы: `packages/shared-types`.
- Фронт: контракты ответов — `apps/frontend/src/lib/contracts.ts`, базовые URL — `apps/frontend/src/lib/api.ts` (`GATEWAY`).
