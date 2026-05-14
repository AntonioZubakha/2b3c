---
date: 2026-05-14
---

<!-- refreshed: 2026-05-14 -->
# Architecture

**Analysis Date:** 2026-05-14

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│              Browser SPA (Vite + React + TanStack Query)   │
│              `apps/frontend/src/main.tsx`                  │
├─────────────────────────────────────────────────────────────┤
│  Routes / pages / components  `apps/frontend/src/`          │
│  API client + `GATEWAY` paths `apps/frontend/src/lib/api.ts`│
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS same-origin `/api/*`
                             │ (Vite proxy → gateway in dev)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           API Gateway (Fastify + JWT + CORS + rate limit)    │
│           `apps/api-gateway/src/server.ts`                  │
│  `preHandler`: verify JWT, inject `x-user-id`, role headers │
│  `@fastify/http-proxy` → per-prefix upstream services       │
└────────┬──────────┬──────────┬──────────┬──────────┬────────┘
         │          │          │          │          │
         ▼          ▼          ▼          ▼          ▼
   catalog    jewelry    search    supplier    user
   pricing    order      recommend notify
   (each: Fastify + Mongo or Redis per service — see STRUCTURE)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Data: MongoDB (`mongodb` in compose), Redis, RabbitMQ       │
│  External: Stripe (order-service), HTTP between services     │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Frontend shell | Providers (theme, i18n, React Query, bespoke), router mount | `apps/frontend/src/main.tsx` |
| Route tree | Public vs wrapped routes; role redirects | `apps/frontend/src/App.tsx`, `apps/frontend/src/components/AppRouteOutlet.tsx` |
| HTTP to backend | Bearer token, supplier company header, timeouts, `ApiHttpError` | `apps/frontend/src/lib/api.ts` |
| Gateway | Auth allowlist, JWT verify, user headers, reverse proxy to services | `apps/api-gateway/src/server.ts` |
| User service | Auth routes, `/auth/me`, internal KYC peek | `services/user-service/src/server.ts`, `services/user-service/src/routes/authRoutes.ts` |
| Catalog service | Diamond CRUD/filter, internal SKU→supplier map, search cache hooks | `services/catalog-service/src/server.ts`, `services/catalog-service/src/routes/catalogRoutes.ts` |
| Order service | Cart, checkout, Stripe webhooks, supplier order views, cross-service calls | `services/order-service/src/server.ts` |
| Shared domain rules | Roles, permissions, supplier ID helpers | `packages/shared-types/src/index.ts` |

## Pattern Overview

**Overall:** Monorepo with **pnpm workspaces**, **Docker Compose** orchestration, **BFF-style API gateway** in front of **independently deployable Fastify microservices**, each owning its MongoDB database name (or shared infra per `docker-compose.yml`).

**Key Characteristics:**
- Single browser origin: frontend calls relative `/api/...`; dev uses Vite proxy to gateway (`apps/frontend/vite.config.ts`).
- Gateway centralizes JWT and injects identity headers for downstream services (`apps/api-gateway/src/server.ts`).
- Services trust gateway-injected headers (`x-user-id`, `x-user-role`, `x-supplier-company-id`) rather than re-parsing JWT on every route (see `services/order-service/src/server.ts`).
- Service-to-service calls use optional `x-stonee-internal` + `STONEE_INTERNAL_SECRET` (see `services/catalog-service/src/routes/catalogRoutes.ts`, `services/user-service/src/server.ts`).

## Layers

**Presentation (SPA):**
- Purpose: Marketplace UI, auth, cart/checkout, supplier portal, staff merchant views.
- Location: `apps/frontend/src/`
- Contains: `pages/`, `components/`, `hooks/`, `context/`, `i18n/`, `lib/`
- Depends on: `@tanstack/react-query`, `react-router-dom`, `@stonee/shared-types` (role checks in `AppRouteOutlet.tsx`).
- Used by: End users in the browser.

**Edge / API gateway:**
- Purpose: TLS termination host in production patterns; JWT verification; CORS; differentiated rate limits; path-based proxy.
- Location: `apps/api-gateway/src/server.ts`
- Contains: Fastify plugins (`@fastify/jwt`, `@fastify/auth`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/http-proxy`).
- Depends on: Upstream hostnames (`catalog-service`, `order-service`, etc. — Docker network DNS).
- Used by: `apps/frontend` and any other HTTP clients hitting `/api`.

**Domain services:**
- Purpose: One bounded context per service (users, catalog, orders, …).
- Location: `services/*/src/`
- Contains: `server.ts` entry, `routes/`, `controllers/`, `models/` (Mongoose), occasional `services/` submodules for orchestration.
- Depends on: MongoDB URI per service, internal HTTP to peers (e.g. order → catalog), `@stonee/shared-types` where shared rules apply.
- Used by: Gateway only (not directly by browser in the default compose topology).

**Shared libraries:**
- Purpose: Cross-cutting TypeScript types and pure functions (no I/O).
- Location: `packages/shared-types/`, `packages/utils/`, `packages/config/`
- Contains: Role helpers, DTO shapes, permission predicates.
- Depends on: None at runtime for types; published as workspace packages.
- Used by: Frontend and backend packages via `package.json` workspace references.

## Data Flow

### Primary Request Path (authenticated marketplace action)

1. User action in a page component under `apps/frontend/src/pages/` triggers `apiFetch` / `apiJson` (`apps/frontend/src/lib/api.ts`).
2. Browser sends `GET` or `POST` to `/api/<service>/...` with `Authorization: Bearer <token>` (and optional `x-supplier-company-id`).
3. Vite dev server proxies to gateway (`apps/frontend/vite.config.ts`); production reverse proxy does the same.
4. Gateway `preHandler` runs `authenticate` (`apps/api-gateway/src/server.ts`): public paths skip JWT; others verify JWT and set `x-user-id`, `x-user-role`, and supplier company header.
5. `@fastify/http-proxy` forwards the request to the matching upstream (same path prefix).
6. Target service reads headers and MongoDB, returns JSON; response flows back through gateway to SPA.

### Cross-service internal call (example: order → catalog)

1. `order-service` handler needs SKU → `supplierId` map (`services/order-service/src/server.ts`).
2. HTTP `POST` to `CATALOG_SERVICE_URL` + `/internal/sku-supplier-map` with `x-stonee-internal` when `STONEE_INTERNAL_SECRET` is configured.
3. `catalog-service` `assertInternal` in `services/catalog-service/src/routes/catalogRoutes.ts` gates the route; Mongoose query on `Diamond` returns the map.

### Auth bootstrap

1. `POST /api/user/auth/login` or `register` is allowlisted as public on the gateway (`apps/api-gateway/src/server.ts`).
2. Proxy forwards to `user-service`; routes registered under `/auth` prefix in `services/user-service/src/server.ts` via `services/user-service/src/routes/authRoutes.ts` → controllers in `services/user-service/src/controllers/`.
3. JWT is issued (details in auth controller); SPA stores token in `localStorage` and sends on subsequent calls (`apps/frontend/src/lib/api.ts`).

**State Management:**
- Server state: TanStack Query (`apps/frontend/src/lib/queryClient.ts`, consumers in pages).
- UI theme / bespoke flows: React context (`apps/frontend/src/context/`).
- Auth snapshot: `localStorage` keys read in `api.ts` and `AppRouteOutlet.tsx` (not Redux).

## Key Abstractions

**GatewayJwtUser:**
- Purpose: Shape of `request.user` after JWT verify in gateway.
- Examples: type in `apps/api-gateway/src/server.ts`.
- Pattern: Decorate request; map to outbound headers for microservices.

**ApiResponse / ApiHttpError:**
- Purpose: Typed success/failure JSON contract and typed fetch errors in the SPA.
- Examples: `apps/frontend/src/lib/api.ts`.
- Pattern: Narrow union for `success` flag; throw `ApiHttpError` on non-2xx.

**Mongoose models per service:**
- Purpose: Persistence boundary for each service’s database.
- Examples: `services/user-service/src/models/User.ts`, `services/catalog-service/src/models/Diamond.ts`, `services/order-service/src/models/Order.ts`.
- Pattern: One service owns writes to its collections; other services integrate via HTTP or internal routes.

## Entry Points

**Frontend dev/build:**
- Location: `apps/frontend/src/main.tsx`, Vite config `apps/frontend/vite.config.ts`, `apps/frontend/index.html`.
- Triggers: `pnpm dev` / `pnpm build` from workspace (`apps/frontend/package.json`).
- Responsibilities: Bundle SPA; proxy `/api` to gateway.

**API gateway:**
- Location: `apps/api-gateway/src/server.ts`.
- Triggers: Container start from `docker-compose.yml` service `api-gateway` (build `apps/api-gateway/Dockerfile`).
- Responsibilities: Listen `:8080`; attach security; register proxies for `/api/catalog`, `/api/jewelry`, `/api/search`, `/api/supplier`, `/api/user`, `/api/pricing`, `/api/order`, `/api/recommendations`, `/api/notifications`.

**Each microservice:**
- Location: `services/<name>/src/server.ts` (Fastify `listen` on port `3000` inside the container network).
- Triggers: Matching `docker-compose.yml` service definition.
- Responsibilities: Connect MongoDB (per-service URI default), register routes, expose `/health`.

**Workspace automation:**
- Location: `package.json` (root), `scripts/*.mjs` (seed, smoke, gateway checks).
- Triggers: `pnpm seed:core`, `pnpm smoke`, etc.

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop per service process; no worker pool in the mapped paths.
- **Global state:** Process env for secrets and service URLs (`process.env` in `server.ts` files); no shared in-memory cluster state across replicas in code reviewed here.
- **Circular imports:** Not audited exhaustively; services favor unidirectional HTTP for cross-boundary calls.
- **Path prefix coupling:** Public API surface is `/api/<segment>/...` — gateway prefix must stay aligned with frontend `GATEWAY` object in `apps/frontend/src/lib/api.ts` and proxy registrations in `apps/api-gateway/src/server.ts`.

## Anti-Patterns

### Duplicating gateway auth logic inside a public browser client

**What happens:** Parsing or trusting JWT in the SPA for security decisions without the gateway.
**Why it's wrong:** Tokens can be manipulated client-side; supplier scope and staff roles belong on the server boundary.
**Do this instead:** Keep authorization at gateway + service header checks; use `AppRouteOutlet` only for UX redirects (`apps/frontend/src/components/AppRouteOutlet.tsx`).

### Calling another service’s MongoDB directly from a new feature

**What happens:** Cross-database joins or shared collections between services.
**Why it's wrong:** Breaks service boundaries and deployment independence defined by `docker-compose.yml` and separate `MONGO_URI` defaults.
**Do this instead:** Add an HTTP route on the owning service (pattern: `/internal/...` with `x-stonee-internal` as in `services/catalog-service/src/routes/catalogRoutes.ts`).

## Error Handling

**Strategy:** HTTP status codes with JSON `{ error: string }` or `{ success: false, error: string }` from services; gateway maps auth failures to `401` without leaking stack traces (`apps/api-gateway/src/server.ts`).

**Patterns:**
- Try/catch in route handlers with `fastify.log.error` and `500` responses (`services/order-service/src/server.ts`, `services/catalog-service/src/routes/catalogRoutes.ts`).
- SPA: `apiJson` throws `ApiHttpError` for caller-specific handling (`apps/frontend/src/lib/api.ts`).

## Cross-Cutting Concerns

**Logging:** Fastify built-in logger (`logger: true`) on gateway and services.

**Validation:** Query/body validation inline in Fastify route generics and manual checks (see catalog list handler in `services/catalog-service/src/routes/catalogRoutes.ts`).

**Authentication:** JWT at gateway; downstream trust of `x-user-id` / role headers; internal routes gated by shared secret header.

---

*Architecture analysis: 2026-05-14*
