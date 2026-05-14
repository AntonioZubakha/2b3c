---
date: 2026-05-14
---

# Coding Conventions

**Analysis Date:** 2026-05-14

## Monorepo scope

**Workspace packages:** `pnpm-workspace.yaml` includes `apps/*`, `services/*`, and `packages/*`. Conventions below reflect what is enforced or consistently practiced in those trees; the `frontend` app is the only package with ESLint and Vitest wired today.

## Naming patterns

**Files:**

- React pages: `PascalCase` + `Page` suffix in `apps/frontend/src/pages/` (example: `apps/frontend/src/pages/MarketplacePage.tsx`).
- Shared UI: `PascalCase` components under `apps/frontend/src/components/` (example: `apps/frontend/src/components/Navbar.tsx`).
- Hooks: `camelCase` with `use` prefix, colocated with tests as `useName.test.tsx` (example: `apps/frontend/src/hooks/useDebouncedValue.tsx`, `apps/frontend/src/hooks/useDebouncedValue.test.tsx`).
- Library modules: `camelCase` filenames under `apps/frontend/src/lib/` (example: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/api.test.ts`).
- Backend services: entry `src/server.ts`, routes under `src/routes/`, models under `src/models/` (example: `services/user-service/src/server.ts`, `services/user-service/src/routes/authRoutes.ts`).

**Functions and variables:**

- Use `camelCase` for functions, hooks, and locals (example: `apiFetch`, `apiJson` in `apps/frontend/src/lib/api.ts`).
- Use `PascalCase` for React components and custom error classes (example: `ApiHttpError` in `apps/frontend/src/lib/api.ts`).

**Types:**

- Export shared response shapes and discriminated unions with `PascalCase` type names (example: `ApiOk`, `ApiFail`, `ApiResponse` in `apps/frontend/src/lib/api.ts`).
- Use `as const` for frozen path maps (example: `GATEWAY` in `apps/frontend/src/lib/api.ts`).

**Packages:**

- Workspace protocol: `@stonee/shared-types`, `@stonee/utils`, `@stonee/config` in `packages/`; services use scoped names like `@stonee/user-service` per each `services/*/package.json`.

## Code style

**Formatting:**

- No repo-wide Prettier or Biome config detected at the monorepo root. Rely on ESLint + TypeScript compiler options for consistency in `apps/frontend`.
- `apps/frontend` mixes styles slightly (for example `apps/frontend/vite.config.ts` often omits semicolons; `apps/frontend/src/main.tsx` uses semicolons). Prefer matching the dominant file you are editing.

**Linting (`apps/frontend`):**

- Config: `apps/frontend/eslint.config.js`.
- Stack: `typescript-eslint` recommended, `@eslint/js` recommended, `eslint-plugin-react-hooks` recommended, `eslint-plugin-react-refresh` with `react-refresh/only-export-components` set to `warn` and `allowConstantExport: true`.
- Scope: all `**/*.{ts,tsx}` except `dist` per `apps/frontend/eslint.config.js`.
- Run: `pnpm --filter frontend lint` (from root) or `pnpm lint` inside `apps/frontend` per `apps/frontend/package.json`.

**TypeScript (`apps/frontend`):**

- App compile settings: `apps/frontend/tsconfig.app.json` — `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `jsx: react-jsx`, `moduleResolution: Bundler`.
- Tests are excluded from the app TS project build graph: `apps/frontend/tsconfig.app.json` lists `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]` so Vitest type-checks tests via its own pipeline.

**Backend services:**

- Services under `services/*` use TypeScript with Fastify; there is no shared ESLint config in those packages—follow the patterns in existing `src/server.ts` and route files when adding code.

## Import organization

**Order (observed in `apps/frontend/src`):**

1. External packages (`react`, `react-router-dom`, `framer-motion`, `@tanstack/react-query`, `@stonee/shared-types`, etc.).
2. Internal relative imports (`../lib/...`, `./components/...`).

**Path aliases:**

- No dedicated `paths` alias in `apps/frontend/tsconfig.app.json`; use relative imports from the importing file’s directory.

**Type-only imports:**

- Use `import type { ... }` when importing only types (example: `apps/frontend/src/lib/orderApiErrors.test.ts` imports `TFunction` from `i18next`).

**Extension in imports:**

- Some entry and context files import with explicit `.tsx` / `.ts` extensions (example: `apps/frontend/src/main.tsx` imports `./context/BespokeContext.tsx`). Match the surrounding file when adding imports in the same module style.

## Error handling

**Browser API layer:**

- Define domain-specific `Error` subclasses with `name` set and `Object.setPrototypeOf` for correct `instanceof` (pattern in `apps/frontend/src/lib/api.ts` for `ApiHttpError`).
- `apiJson` parses JSON or text, maps non-OK HTTP to `ApiHttpError` with optional `code` from the body—callers should catch `ApiHttpError` when they need status-specific UX (tests in `apps/frontend/src/lib/api.test.ts`).

**UI / checkout messaging:**

- Map transport errors to user-visible strings or i18n keys in dedicated helpers (example: `apps/frontend/src/lib/orderApiErrors.ts` tested by `apps/frontend/src/lib/orderApiErrors.test.ts`).

**Fastify services:**

- Use `reply.status(...).send({ error: '...' })` for HTTP errors and `fastify.log.error(err)` plus `process.exit(1)` on fatal startup failure (pattern in `services/user-service/src/server.ts`).

## Logging

**Frontend:** Prefer structured user messaging over `console` in user-facing flows; no shared logging framework detected in `apps/frontend`.

**Services:** Fastify logger enabled via `Fastify({ logger: true })` (example: `services/user-service/src/server.ts`).

## Comments

**When to comment:**

- Use short file-level docblocks to explain cross-cutting behavior (example: gateway path comment at top of `apps/frontend/src/lib/api.ts`).
- Inline comments for non-obvious environment or platform workarounds (example: Vite watch polling note in `apps/frontend/vite.config.ts`).

**JSDoc:**

- Use `@link` style references on exported symbols where it clarifies behavior (example: `ApiHttpError` JSDoc in `apps/frontend/src/lib/api.ts`).

## Function design

**Parameters:** Prefer explicit options objects for HTTP helpers (`RequestInit` spread in `apps/frontend/src/lib/api.ts`).

**Async:** Prefer `async`/`await` over raw `Promise` chains in new code; services use top-level `start()` async IIFE pattern in `services/user-service/src/server.ts`.

## Module design

**Exports:** Named exports for library utilities (`apiFetch`, `GATEWAY`, types in `apps/frontend/src/lib/api.ts`). Default exports common for page components (import style in `apps/frontend/src/App.tsx`).

**Barrel files:** `packages/shared-types` exposes via `packages/shared-types/src/index.ts` per `packages/shared-types/package.json` `exports` field; import from `@stonee/shared-types` in app code.

---

*Convention analysis: 2026-05-14*
