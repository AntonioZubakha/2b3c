---
date: 2026-05-14
---

# Testing Patterns

**Analysis Date:** 2026-05-14

## Test framework

**Runner:**

- Vitest `^2.1.9` in `apps/frontend` (`apps/frontend/package.json` devDependencies).
- Config: `apps/frontend/vitest.config.ts` using `defineConfig` from `vitest/config` and `@vitejs/plugin-react` for JSX in tests.

**Assertion library:**

- Vitest built-in `expect` (Chai-compatible API).

**DOM environment:**

- `happy-dom` (`apps/frontend/package.json`) with `test.environment: 'happy-dom'` in `apps/frontend/vitest.config.ts`.

**Run commands:**

```bash
pnpm test                    # from repo root — runs frontend tests only (`package.json` uses `pnpm --filter frontend test`)
pnpm --filter frontend test  # explicit filter
pnpm --filter frontend test:watch
```

From `apps/frontend`:

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest watch
```

## Test file organization

**Location:**

- Co-located next to implementation under `apps/frontend/src/`, matching Vitest `include` in `apps/frontend/vitest.config.ts`.

**Naming:**

- `*.test.ts` for pure TS modules.
- `*.test.tsx` for hooks/components that need React Testing Library.

**Discovered test files:**

- `apps/frontend/src/lib/api.test.ts`
- `apps/frontend/src/lib/orderApiErrors.test.ts`
- `apps/frontend/src/lib/imageFallback.test.ts`
- `apps/frontend/src/hooks/useDebouncedValue.test.tsx`

**Vitest settings (from `apps/frontend/vitest.config.ts`):**

- `include: ['src/**/*.test.{ts,tsx}']`
- `clearMocks: true`, `restoreMocks: true`

## Test structure

**Suite organization:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// ...
describe('apiFetch', () => {
  beforeEach(() => { /* setup */ });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('does something', async () => { /* ... */ });
});
```

Reference implementation: `apps/frontend/src/lib/api.test.ts`.

**Patterns:**

- **Globals:** `vi.stubGlobal('fetch', ...)` then `vi.unstubAllGlobals()` in `afterEach` (`apps/frontend/src/lib/api.test.ts`).
- **Timers:** `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach` for hook tests (`apps/frontend/src/hooks/useDebouncedValue.test.tsx`).
- **Async errors:** `try/catch` with `expect.fail('expected throw')` when asserting thrown custom errors (`apps/frontend/src/lib/api.test.ts`).

## React hook testing

**Library:** `@testing-library/react` (`renderHook`, `act`) as in `apps/frontend/src/hooks/useDebouncedValue.test.tsx`.

**Pattern:**

```typescript
import { renderHook, act } from '@testing-library/react';
// rerender with new props, advance timers inside act()
```

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, `vi.stubGlobal`, timer helpers).

**What to mock:**

- Browser globals not provided by happy-dom the way you need (example: `fetch` in `apps/frontend/src/lib/api.test.ts`).

**What not to mock:**

- Pure functions under test—pass inputs and assert return values (examples in `apps/frontend/src/lib/imageFallback.test.ts`).

## Fixtures and factories

**Test data:**

- Inline literals and minimal stubs (example: fake `TFunction` cast in `apps/frontend/src/lib/orderApiErrors.test.ts`).
- `Response` / `JSON.stringify` payloads for HTTP tests in `apps/frontend/src/lib/api.test.ts`.

**Location:** No central `__fixtures__` or `test-utils` directory detected; keep fixtures minimal and local to each `*.test.ts(x)` file unless duplication grows.

## Coverage

**Requirements:** No coverage thresholds or `vitest --coverage` script detected in `apps/frontend/package.json` or `apps/frontend/vitest.config.ts`.

**View coverage:** Add `@vitest/coverage-v8` (or similar) and a `test:coverage` script if you introduce coverage; not present today.

## Test types

**Unit tests:** Primary style—lib helpers and hooks in isolation (`apps/frontend/src/lib/*.test.ts`, `apps/frontend/src/hooks/*.test.tsx`).

**Integration tests:** Not detected in workspace packages (no `*.integration.test.*`).

**E2E tests:** Not detected (no Playwright/Cypress config under `apps/frontend` or repo root).

## Backend and workspace packages

**Services (`services/*`):** `package.json` files (for example `services/user-service/package.json`, `services/order-service/package.json`, `services/catalog-service/package.json`) define `start`/`dev`/`build` only—no `test` script and no Vitest/Jest config in those services.

**Shared packages (`packages/*`):** `packages/shared-types`, `packages/utils`, `packages/config` have no test runner configured in their `package.json` files.

## CI / automation

**GitHub Actions:** No `.github/workflows` directory at the Stonee monorepo root for workspace-owned code; nothing in-repo wires `pnpm test` into CI for this workspace.

**Manual / scripted checks:** Root `package.json` defines operational scripts such as `smoke`, `smoke:kyc`, and gateway checks (`check:prod-gateway`, `check:prod-gateway:strict`) invoking `scripts/*.mjs`—these are smoke/verification scripts, not unit tests.

## Adding tests checklist

1. Place `YourModule.test.ts` or `YourHook.test.tsx` beside the source under `apps/frontend/src/`.
2. Import from `vitest` and, for hooks, from `@testing-library/react`.
3. Use `vi.stubGlobal` / `vi.fn` for `fetch` or other globals; clean up in `afterEach`.
4. Run `pnpm test` from the repo root or `pnpm test` in `apps/frontend`.

---

*Testing analysis: 2026-05-14*
