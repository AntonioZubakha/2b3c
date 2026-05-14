# Разработка и запуск Stonee

## Требования

- **Node.js 20+**
- **pnpm** (монорепозиторий)
- **Docker** + Docker Compose (для полного стека)

## Стек языка

Сервисы в `services/*` и `apps/api-gateway` — **TypeScript + Node.js + Fastify** (запуск через `tsx` или собранный JS — см. `Dockerfile` / `package.json` каждого пакета). Отдельных Python-сервисов в этом репозитории нет.

## Структура репозитория

```
apps/
  api-gateway/      # шлюз :8080
  frontend/         # React + Vite
packages/
  shared-types/     # общие TS-типы
services/
  user-service, catalog-service, search-service, pricing-service,
  order-service, jewelry-service, supplier-service,
  notification-service, recommendation-service
scripts/
  smoke.mjs         # интеграционный smoke через API
  check-prod-gateway.mjs  # CI: STONEE_CORS_ORIGINS обязателен (pnpm run check:prod-gateway)
  mongodb-backup.example.sh  # шаблон ежедневного дампа (см. SECURITY.md / MASTER §9.3)
  mongodb-backup.mjs        # дамп из Node (pnpm run backup:mongo, нужен MONGODB_URI)
```

Корневые скрипты (`package.json`):

| Команда | Действие |
|---------|----------|
| `pnpm run dev` | dev-режим во всех пакетах workspace (см. локальные `package.json`) |
| `pnpm run build` | сборка workspace |
| `pnpm run lint` | линт workspace |
| `pnpm run smoke` | smoke после запуска gateway и зависимостей |
| `pnpm run smoke:kyc` | опционально: сценарий KYC (нужны `STONEE_KYC_ENFORCE_MIN_USD`, `STONEE_INTERNAL_SECRET`, `STONEE_ALLOW_KYC_SELF_VERIFY`; порог задаётся `KYC_SMOKE_MIN_USD` или первым аргументом — см. `scripts/smoke-kyc.mjs`) |
| `pnpm run check:prod-gateway` | перед прод-деплоем: задан `STONEE_CORS_ORIGINS` |
| `pnpm run check:prod-gateway:strict` | то же + `JWT_SECRET` задан и не равен `changeme` |
| `pnpm run backup:mongo` | `mongodump` в `./mongo-backups/<date>` (переменная `MONGODB_URI`) |
| `pnpm run test` | **Unit-тесты** фронта (Vitest): `api`, `orderApiErrors`, `imageFallback`, `useDebouncedValue` — без Docker |
| `pnpm run smoke` | **Интеграционный** сценарий через API gateway (`BASE_URL`, по умолчанию `http://127.0.0.1:8080`); требует поднятый стек. После смены health-роутов на сервисах выполните **`docker compose build`** для затронутых образов |

## Полный стек в Docker

Из корня репозитория:

```bash
docker compose up -d --build
```

- UI: `http://localhost:3000`
- Gateway: `http://localhost:8080`
- Health gateway: `GET http://localhost:8080/health`

**Compose (актуально):** у MongoDB, Redis и RabbitMQ заданы **`healthcheck`**; сервисы, которым нужна БД или Redis, используют **`depends_on` с `condition: service_healthy`** там, где это указано в `docker-compose.yml`. У контейнеров приложений — **`restart: unless-stopped`**. Полный стек после `up` может занять **до ~1–2 минут** на первом старте (ожидание healthy Mongo); скрипт **`pnpm run smoke`** сам ретраит health до **90 с**.

### Редеплой после правок в коде

Из корня репозитория — пересборка образов и перезапуск:

```bash
docker compose up -d --build
```

Точечно (быстрее, если менялись только часть сервисов): например `docker compose up -d --build frontend` или `docker compose up -d --build supplier-service api-gateway`. После заметных изменений в TypeScript/зависимостях разумно полный **`--build`** по стеку и затем **`pnpm run smoke`**.

### Frontend-образ и зависимости

Сборка фронта копирует `pnpm-lock.yaml` и выполняет `pnpm install --frozen-lockfile`. Точка входа — **`scripts/docker-frontend-entrypoint.sh`** (копируется в образ, **не** из bind-mount `apps/frontend`, чтобы на Windows не ломался `#!/bin/sh` из‑за CRLF). При старте: `pnpm install --prefer-offline` в `/app`, затем `npm run dev` для Vite. Анонимный volume `apps/frontend/node_modules` перекрывает `node_modules` из образа — entrypoint снова связывает зависимости.

**Нельзя** bind-mount’ить `pnpm-lock.yaml` с хоста Windows в `/app`: при `pnpm install` pnpm делает atomic `rename` lockfile’а, Docker Desktop отвечает **`EBUSY`**, установка падает, порт **3000** не слушается (`ERR_EMPTY_RESPONSE`).

После изменения **`apps/frontend/package.json`** или **`pnpm-lock.yaml`** в репозитории пересоберите образ: **`docker compose build frontend`** (или **`docker compose up -d --build frontend`**).

### Сиды каталога

Данные оправ и коллекций для демо задаются в `services/jewelry-service/src/seed.ts`. После изменения сидов перезапустите сид-скрипт сервиса согласно README сервиса (обычно `node dist/seed.js` / отдельная npm-команда в образе — уточняйте в `jewelry-service`).

## Локальный фронт без Docker (опционально)

1. Поднять минимум gateway и нужные сервисы **или** весь compose.
2. В `apps/frontend`: переменная **`API_GATEWAY_URL=http://127.0.0.1:8080`** (см. `vite.config.ts` — прокси `/api` на gateway).
3. `pnpm install` в корне, затем `pnpm --filter frontend dev` (или команда dev из `apps/frontend/package.json`).

## Переменные окружения (важные)

Задаются в `.env` рядом с `docker-compose.yml` или в `environment` сервисов.

| Переменная | Где используется | Назначение |
|------------|-------------------|------------|
| `STONEE_GATEWAY_RATE_LIMIT_READ_MAX` | api-gateway | Лимит/мин на IP для «тяжёлых» GET каталога/поиска (см. `SECURITY.md`) |
| `STONEE_GATEWAY_RATE_LIMIT_MUTATE_MAX` | api-gateway | Лимит/мин на IP для остальных маршрутов |
| `STONEE_GATEWAY_RATE_LIMIT_WEBHOOK_MAX` | api-gateway | Лимит/мин для `POST …/webhooks/stripe` |
| `STONEE_GATEWAY_RATE_LIMIT_MAX` | api-gateway | Устаревший одиночный лимит: если read/mutate не заданы, задаёт read и производную mutate |
| `JWT_SECRET` | api-gateway, user-service, supplier-service | Подпись/проверка JWT |
| `STAFF_INVITE_CODE` | user-service | Регистрация staff (если задано) |
| `STRIPE_SECRET_KEY` | order-service | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | order-service | Подпись webhook |
| `STRIPE_ALLOW_SIMULATED_PAY` | order-service | `true` — допуск симуляции без ключа (dev) |
| `STONEE_CACHE_INVALIDATE_SECRET` | catalog-service, search-service | Секрет для инвалидации кэша (если используется эндпоинтами) |
| `STONEE_KYC_ENFORCE_MIN_USD` | user-service (стартовый статус), order-service (блокировка) | Порог суммы заказа (USD) для проверки KYC; **`0`** — gate выключен |
| `STONEE_INTERNAL_SECRET` | user-service (`/internal/kyc`), order-service (KYC + вызовы catalog internal), **catalog-service** (`POST /internal/sku-supplier-map`, если секрет задан — проверка заголовка; иначе эндпоинт остаётся открытым на сервисе — задавайте секрет в production) | Общий секрет service-to-service |
| `USER_SERVICE_URL` | order-service | Базовый URL user-service для внутреннего KYC |
| `STONEE_ALLOW_KYC_SELF_VERIFY` | user-service | **`true`** только в dev: `POST /auth/kyc/self-verify` переводит покупателя в `verified` |

## Полезные проверки

```bash
# Логи заказов и оплаты
docker compose logs -f order-service

# Типизация фронта
cd apps/frontend && pnpm exec tsc --noEmit
```
