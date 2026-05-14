---
title: Technology Stack
date: 2026-05-14
---

# Technology Stack

**Analysis Date:** 2026-05-14

## Languages

**Primary:**

- **TypeScript** — All first-party application code in `apps/`, `services/`, and `packages/` is TypeScript (`.ts` / `.tsx`). Compiler targets and module settings vary by package; the SPA uses strict mode with bundler resolution (`apps/frontend/tsconfig.app.json`).

**Secondary:**

- **JavaScript (ES modules)** — Root automation and ops scripts under `scripts/` use Node ESM (`.mjs`), for example `scripts/check-prod-gateway.mjs`, `scripts/mongodb-backup.mjs`, `scripts/smoke.mjs`.

## Runtime

**Environment:**

- **Node.js** — Container images standardize on **Node 20** (see `apps/api-gateway/Dockerfile`: `FROM node:20-slim`). Local development assumes a compatible modern Node for `pnpm`, `vite`, `tsx`, and `vitest`.

**Package Manager:**

- **pnpm** — Workspace root `package.json` drives recursive scripts (`pnpm -r run dev`, `pnpm -r run build`). Workspace definition: `pnpm-workspace.yaml` (`apps/*`, `services/*`, `packages/*`).
- **Lockfile:** `pnpm-lock.yaml` (lockfileVersion `9.0`) pins resolved dependency graphs for all importers.

## Frameworks

**Core:**

- **React 18** + **Vite 5** — SPA in `apps/frontend` (`package.json`: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`). Dev server listens on port **3000** with `/api` proxied to the gateway (`apps/frontend/vite.config.ts`).
- **React Router 7** — Client routing (`react-router`, `react-router-dom` in `apps/frontend/package.json`).
- **Fastify 4** — HTTP servers for the API gateway and every microservice (`fastify` in `apps/api-gateway/package.json` and each `services/*/package.json`). Gateway adds `@fastify/http-proxy`, `@fastify/jwt`, `@fastify/auth`, `@fastify/cors`, `@fastify/rate-limit` (`apps/api-gateway/package.json`).

**Data access:**

- **Mongoose 9** — ODM in services that persist to MongoDB (`mongoose` in `services/user-service/package.json`, `services/order-service/package.json`, `services/catalog-service/package.json`, `services/search-service/package.json`, `services/jewelry-service/package.json`, `services/supplier-service/package.json`).
- **ioredis 5** — Redis client in `services/search-service/package.json` for caching layer.

**Testing:**

- **Vitest 2** — Unit/component tests for the frontend (`apps/frontend/package.json`: `vitest`, `happy-dom`, `@testing-library/react`). Root `package.json` script `"test": "pnpm --filter frontend test"`.

**Build / Dev:**

- **Tailwind CSS 4** — Styling pipeline via `@tailwindcss/vite` and `tailwindcss` (`apps/frontend/package.json`).
- **ESLint 9** — Flat config `apps/frontend/eslint.config.js` with `typescript-eslint`, React hooks, and refresh plugins.
- **tsx** — TypeScript execution without prebuild for several services (`services/user-service/package.json`, `services/order-service/package.json`, and others).

## Key Dependencies

**Critical (product / money movement):**

- **Stripe** — Server SDK in `services/order-service/package.json` (`stripe`); browser SDK in `apps/frontend/package.json` (`@stripe/stripe-js`, `@stripe/react-stripe-js`).

**Cross-cutting:**

- **axios** — Outbound HTTP in `services/order-service`, `services/catalog-service`, `services/pricing-service`, `services/supplier-service`, `services/recommendation-service` (`package.json` files).
- **jsonwebtoken** + **bcryptjs** — Auth stack in `services/user-service/package.json` and `services/supplier-service/package.json` (password hashing and JWT signing/verification patterns).

**Workspace libraries:**

- **`@stonee/shared-types`** — Shared enums/types (`packages/shared-types/package.json`, consumed via `workspace:*` from frontend and services).
- **`@stonee/config`** and **`@stonee/utils`** — Placeholder workspace packages (`packages/config/package.json`, `packages/utils/package.json`).

**Root dev tooling:**

- **`mongodb`** and **`bcryptjs`** — Declared at workspace root `package.json` for scripts and tooling that touch Mongo or hashing outside a single package boundary.

## Configuration

**Environment:**

- Per-service `process.env.*` reads (no `.env` contents are documented here). Compose-level defaults and variable names are listed in `docker-compose.yml` and individual `services/*/src/server.ts` files.
- Production gateway gates documented in `info/SECURITY.md`; enforced in CI/host via `scripts/check-prod-gateway.mjs` (`pnpm run check:prod-gateway`, `check:prod-gateway:strict` in root `package.json`).

**Build:**

- Frontend: `apps/frontend/vite.config.ts`, `apps/frontend/tsconfig.json` (project references), `apps/frontend/tsconfig.app.json`, `apps/frontend/tsconfig.node.json`.
- API gateway: TypeScript **6.x** pinned in `apps/api-gateway/package.json` (separate from frontend **~5.6**).
- Services: each `services/*/tsconfig.json` or `tsconfig.build.json` where present (e.g. `services/user-service/tsconfig.build.json`).

## Platform Requirements

**Development:**

- **pnpm** installed globally or via Corepack.
- **Docker Desktop** (optional but recommended) — `docker-compose.yml` orchestrates MongoDB, Redis, RabbitMQ image, all services, gateway, and frontend with published ports (e.g. gateway **8080**, host Mongo **27018**, Redis **6079**).

**Production:**

- **Docker**-style deployment using service Dockerfiles under `apps/*/Dockerfile` and `services/*/Dockerfile` with internal DNS names such as `catalog-service:3000` as assumed by `apps/api-gateway/src/server.ts` proxy upstreams.

---

*Stack analysis: 2026-05-14*
