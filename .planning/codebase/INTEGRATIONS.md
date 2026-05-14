---
title: External Integrations
date: 2026-05-14
---

# External Integrations

**Analysis Date:** 2026-05-14

## APIs & External Services

**Payments (Stripe):**

- **Stripe** — Checkout and payment intents on the server (`services/order-service` uses `stripe` package; secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, dev flag `STRIPE_ALLOW_SIMULATED_PAY` in `services/order-service/src/server.ts`). The browser loads Stripe.js using `VITE_STRIPE_PUBLISHABLE_KEY` (`apps/frontend/src/pages/CheckoutPage.tsx` references `import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY`).
- **Stripe webhooks** — HTTP `POST` paths under `/api/order/webhooks/stripe` are treated as public on the gateway (no JWT) but rate-limited with a dedicated cap (`apps/api-gateway/src/server.ts`). Signature verification and idempotency live in order-service (see overview in `info/SECURITY.md`).

**Supplier feed (Diamond Atelier):**

- **Diamond Atelier HTTP API** — Bulk catalog sync from supplier-service using Basic-auth style credentials from env: `DIAMOND_ATELIER_BASE_URL`, `DIAMOND_ATELIER_USER_NAME`, `DIAMOND_ATELIER_PASSWORD`, plus supplier scoping `DIAMOND_ATELIER_SUPPLIER_COMPANY_ID` or legacy `DIAMOND_ATELIER_SUPPLIER_USER_ID` (`services/supplier-service/src/diamondAtelierSync.ts`, `services/supplier-service/src/server.ts`). Tunables: `DIAMOND_ATELIER_ROWS_PER_PAGE`, `DIAMOND_ATELIER_MAX_PAGES`, `DIAMOND_ATELIER_UPSERT_CHUNK`.

**Notifications (Telegram, optional):**

- **Telegram Bot API (planned / partial)** — `services/notification-service/src/server.ts` reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`; when set, the service logs intent to send; primary behavior today is structured console output and in-memory `NOTIFICATION_LOG` for staff `GET` routes gated by `x-user-role`.

**Internal HTTP between microservices:**

- **Service mesh over Docker DNS** — Default bases such as `http://catalog-service:3000`, `http://user-service:3000`, `http://pricing-service:3000`, `http://notification-service:3000`, `http://jewelry-service:3000`, `http://search-service:3000` appear in `services/order-service/src/server.ts`, `services/pricing-service/src/server.ts`, `services/catalog-service/src/notifySearchCache.ts`, `services/recommendation-service/src/server.ts`, `services/order-service/src/kycGate.ts`, and `docker-compose.yml` environment blocks. Overrides use env-prefixed URLs (e.g. `CATALOG_SERVICE_URL`, `USER_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `PRICING_SERVICE_URL`, `SEARCH_SERVICE_URL`, `JEWELRY_SERVICE_URL`).

## Data Storage

**Databases:**

- **MongoDB** — Primary persistence. Compose service `mongodb` (`docker-compose.yml`) exposes host port **27018** → container **27017**. Each service uses `MONGO_URI` or a dedicated URI with distinct database path segments, for example `stonee_users`, `stonee_catalog`, `stonee_orders`, `stonee_jewelry` (see `docker-compose.yml` and `services/*/src/server.ts`). Supplier metadata may use **`SUPPLIER_META_MONGO_URI`** (`services/supplier-service/src/server.ts`, `docker-compose.yml`).

**Caching:**

- **Redis** — Used by `search-service` with `REDIS_URL` default `redis://redis:6379` (`services/search-service/src/server.ts`, `docker-compose.yml` host port **6079**). Catalog notifies search to invalidate cache using `STONEE_CACHE_INVALIDATE_SECRET` (`services/catalog-service/src/notifySearchCache.ts`, `services/search-service/src/server.ts`).

**Message broker (infrastructure only):**

- **RabbitMQ** — Declared in `docker-compose.yml` as `rabbitmq:3-management` with AMQP and management UI ports. No Stonee first-party service `package.json` under `services/` or `apps/` currently lists an AMQP client; treat as **reserved / future** unless wired later.

## Authentication & Identity

**Custom JWT (shared secret):**

- **Signing / verification** — `JWT_SECRET` consumed by `apps/api-gateway/src/server.ts`, `services/user-service/src/controllers/authController.ts`, `services/supplier-service/src/verifyBearerJwt.ts`. Gateway verifies JWT for non-public routes and forwards `x-user-id`, `x-user-role`, and optional `x-supplier-company-id` (`apps/api-gateway/src/server.ts`).

**Internal service auth:**

- **`STONEE_INTERNAL_SECRET`** — Validates internal HTTP from order-service to user-service for KYC (`services/order-service/src/kycGate.ts`, `services/user-service/src/server.ts`) and protects catalog internal routes (`services/catalog-service/src/routes/catalogRoutes.ts`). Header convention includes `x-stonee-internal` (see `info/SECURITY.md`).

**Staff onboarding:**

- **`STAFF_INVITE_CODE`** — Registration gate for staff accounts (`services/user-service/src/controllers/authController.ts`).

## Monitoring & Observability

**Error Tracking:**

- Not detected as a dedicated SaaS SDK in scanned `package.json` files (no Sentry/Datadog client in the listed app manifests).

**Logs:**

- **Fastify built-in logger** — `logger: true` on gateway and services (e.g. `apps/api-gateway/src/server.ts`, `services/notification-service/src/server.ts`). Notification service augments with formatted console blocks for operational visibility.

## CI/CD & Deployment

**Hosting:**

- **Docker Compose** — Local and integrated stack defined in `docker-compose.yml` (build contexts point at repo root with per-service `Dockerfile` paths).

**CI Pipeline:**

- No first-party GitHub Actions workflows were found at the repository root under `.github/workflows` for this project (only nested `node_modules` / unrelated tree matches). CI may be external or not yet committed for Stonee.

## Environment Configuration

**Gateway / edge:**

- `JWT_SECRET`, `STONEE_CORS_ORIGINS`, `STONEE_GATEWAY_RATE_LIMIT_READ_MAX`, `STONEE_GATEWAY_RATE_LIMIT_MUTATE_MAX`, `STONEE_GATEWAY_RATE_LIMIT_WEBHOOK_MAX`, legacy `STONEE_GATEWAY_RATE_LIMIT_MAX` (`apps/api-gateway/src/server.ts`, `docker-compose.yml`).

**Frontend dev proxy:**

- `API_GATEWAY_URL` — Target for Vite dev proxy `/api` (`apps/frontend/vite.config.ts`). Docker frontend service sets `API_GATEWAY_URL: http://api-gateway:8080` (`docker-compose.yml`).

**KYC gating:**

- `STONEE_KYC_ENFORCE_MIN_USD`, `STONEE_ALLOW_KYC_SELF_VERIFY` (`services/user-service/src/controllers/authController.ts`, `services/order-service/src/kycGate.ts`, `docker-compose.yml`).

**Ingest / limits:**

- `SUPPLIER_INGEST_TOKEN`, `MAX_DIAMONDS_PER_JSON_INGEST`, `SUPPLIER_BODY_LIMIT_BYTES` (`services/supplier-service/src/server.ts`, `services/supplier-service/src/ingestAuth.ts`).
- `CATALOG_BODY_LIMIT_BYTES` (`services/catalog-service/src/server.ts`).

**Backup script:**

- `MONGO_URI`, `OUT_DIR` for `scripts/mongodb-backup.mjs` (root `pnpm run backup:mongo`). Default URI targets local mapped port `127.0.0.1:27018` per script header comment.

**Secrets location:**

- Operators supply secrets via host environment or compose interpolation (`${VAR:-default}` patterns in `docker-compose.yml`). Do not commit populated `.env` files (policy in `info/SECURITY.md`).

## Webhooks & Callbacks

**Incoming:**

- **Stripe** — `POST /api/order/webhooks/stripe` proxied to order-service, public at gateway layer, higher webhook rate limit (`apps/api-gateway/src/server.ts`).

**Outgoing:**

- **HTTP calls** — Order flow calls catalog, pricing, notification URLs (`services/order-service/src/server.ts`, `services/order-service/src/finalizePaidOrder.ts`). Catalog calls search for cache bust (`services/catalog-service/src/notifySearchCache.ts`). Pricing pulls catalog and jewelry (`services/pricing-service/src/server.ts`). Recommendation service calls jewelry HTTP (`services/recommendation-service/src/server.ts`).

---

*Integration audit: 2026-05-14*
