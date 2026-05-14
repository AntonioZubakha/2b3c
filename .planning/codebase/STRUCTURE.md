---
date: 2026-05-14
---

# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```text
Stonee/
├── apps/
│   ├── api-gateway/       # Fastify reverse proxy + JWT/CORS/rate limit
│   └── frontend/          # Vite + React SPA (marketplace, supplier, staff UI)
├── services/              # Fastify microservices (one folder per bounded context)
├── packages/              # Workspace libraries (shared-types, utils, config)
├── scripts/               # Root-level Node maintenance (seed, smoke, backups)
├── docs/                  # Project documentation
├── info/                  # Security / ops notes (non-runtime)
├── lgdx-main/             # Separate LGDX-era codebase subtree (not in pnpm workspace)
├── docker-compose.yml     # Local/prod-style stack wiring for Stonee services
├── pnpm-workspace.yaml    # Workspace globs: apps/*, services/*, packages/*
├── package.json           # Root scripts orchestrating workspace commands
└── pnpm-lock.yaml         # Lockfile for the workspace
```

## Directory Purposes

**`apps/`:**
- Purpose: User-facing and edge-tier applications shipped as containers or static assets.
- Contains: `frontend` (React), `api-gateway` (Fastify proxy).
- Key files: `apps/frontend/src/main.tsx`, `apps/frontend/src/App.tsx`, `apps/api-gateway/src/server.ts`, `apps/frontend/vite.config.ts`, `apps/*/Dockerfile`.

**`services/`:**
- Purpose: Backend microservices; each package is independently built (`Dockerfile` per service).
- Contains: `src/server.ts`, `src/routes/`, `src/models/`, `src/controllers/` (where used), `package.json`, `tsconfig.json`, `Dockerfile`.
- Key files: `services/user-service/src/server.ts`, `services/catalog-service/src/server.ts`, `services/order-service/src/server.ts`, and peers: `jewelry-service`, `search-service`, `supplier-service`, `pricing-service`, `recommendation-service`, `notification-service`.

**`packages/`:**
- Purpose: Shared TypeScript published only inside the monorepo via pnpm `workspace:*`.
- Contains: `shared-types` (roles, DTO helpers), `utils`, `config`.
- Key files: `packages/shared-types/src/index.ts`, `packages/utils/src/index.ts`.

**`scripts/`:**
- Purpose: Operational scripts invoked from root `package.json` (`node scripts/*.mjs`).
- Contains: Seeding, smoke tests, gateway CORS checks, Mongo backup helpers.

**`docs/` and `info/`:**
- Purpose: Human-readable documentation and security notes; not imported by runtime services.

**`lgdx-main/`:**
- Purpose: Legacy or parallel LGDX stack (client, server, multiple workers). Treat as a **separate product tree** from `apps/` and `services/`; it is not listed in `pnpm-workspace.yaml`.

**`.planning/`:**
- Purpose: Planning and codebase map artifacts for GSD-style workflows.
- Contains: `codebase/*.md` analysis files.

## Key File Locations

**Entry Points:**
- `apps/frontend/src/main.tsx`: React root, providers, router.
- `apps/frontend/index.html`: Vite HTML shell.
- `apps/api-gateway/src/server.ts`: Gateway listen and proxy table.
- `services/*/src/server.ts`: Per-service Fastify bootstrap and Mongo connect.

**Configuration:**
- `pnpm-workspace.yaml`: Which directories participate in the workspace.
- `docker-compose.yml`: Service images, ports, env placeholders, depends_on health.
- `apps/frontend/vite.config.ts`: Dev server port `3000`, `/api` proxy target.
- `apps/frontend/tsconfig.app.json`, `services/*/tsconfig.json`: TS compile options per package.

**Core Logic:**
- `apps/frontend/src/pages/`: Route-level screens (marketplace, checkout, supplier portal, merchant).
- `apps/frontend/src/lib/api.ts`: Central API paths and fetch helpers.
- `services/*/src/routes/`: HTTP route plugins registered from `server.ts`.
- `services/*/src/models/`: Mongoose schemas.

**Testing:**
- `apps/frontend/vitest.config.ts` and co-located `*.test.ts` / `*.test.tsx` under `apps/frontend/src/`.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` in `components/` and `pages/` (e.g. `AppRouteOutlet.tsx`, `MarketplacePage.tsx`).
- Hooks: `use*.ts` or `use*.tsx` under `hooks/`.
- Service entry: `server.ts`; routes often `*Routes.ts`; controllers `*Controller.ts`; models match entity (`User.ts`, `Diamond.ts`, `Order.ts`).

**Directories:**
- Kebab-case for package folders: `api-gateway`, `user-service`, `shared-types`.
- Plural segment names for types of code: `routes/`, `models/`, `controllers/`, `pages/`, `components/`.

**Imports in services:**
- TypeScript sources import local modules with `.js` extension where ESM output is used (e.g. `from './routes/authRoutes.js'` in `services/user-service/src/server.ts`) — match this when adding imports in those packages.

## Where to Add New Code

**New Feature (customer-facing UI):**
- Primary code: `apps/frontend/src/pages/` (new route) and `apps/frontend/src/components/` (reusable UI).
- Wire route in `apps/frontend/src/App.tsx`.
- Tests: co-located `*.test.tsx` next to hook or lib, or under same feature folder in `apps/frontend/src/`.

**New HTTP surface on an existing domain:**
- Implementation: add route plugin or handlers under the owning service `services/<domain>/src/routes/` and register in that service’s `server.ts`.
- Gateway: register or extend `@fastify/http-proxy` prefix in `apps/api-gateway/src/server.ts` if the path prefix is new.
- Frontend paths: extend `GATEWAY` in `apps/frontend/src/lib/api.ts` if the SPA needs a typed base path.

**New Microservice:**
- Create `services/<new-service>/` mirroring peers: `package.json`, `Dockerfile`, `src/server.ts`, `tsconfig.json`.
- Add service to `docker-compose.yml` and to proxy table in `apps/api-gateway/src/server.ts`.
- Add package name to root workspace automatically via `pnpm-workspace.yaml` glob `services/*` (folder name must live under `services/`).

**Utilities:**
- Pure helpers shared across apps/services: `packages/utils/src/index.ts` (export from package entry).
- Cross-service types and permission helpers: `packages/shared-types/src/index.ts`.

**Operational scripts:**
- `scripts/<name>.mjs` and expose via root `package.json` `scripts` block.

## Special Directories

**`apps/frontend/dist/`:**
- Purpose: Production build output from Vite.
- Generated: Yes (by `pnpm build` in frontend).
- Committed: Typically no — verify `.gitignore`; treat as build artifact.

**`services/*/dist/` and nested `node_modules/`:**
- Purpose: Compiled JS or local install artifacts per package.
- Generated: Yes.
- Committed: No.

**`node_modules/` (root):**
- Purpose: pnpm virtual store and hoisted deps.
- Generated: Yes (`pnpm install`).
- Committed: No.

---

*Structure analysis: 2026-05-14*
