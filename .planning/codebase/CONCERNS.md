---
date: 2026-05-14
---

# Codebase Concerns

**Analysis Date:** 2026-05-14

## Tech Debt

**Internal catalog routes without mandatory secret:**

- Issue: When `STONEE_INTERNAL_SECRET` is unset or empty, `assertInternal` in catalog-service returns success without checking headers, so `/internal/sku-supplier-map` accepts requests with no shared secret.
- Files: `services/catalog-service/src/routes/catalogRoutes.ts`
- Impact: In a misconfigured or overly exposed network, SKU-to-supplier mappings can be enumerated without the intended internal gate.
- Fix approach: Fail closed when the secret is unset in non-development environments, or require a non-empty secret before registering internal routes.

**Large in-process supplier order fan-out:**

- Issue: `GET /supplier/orders` loads up to 500 full order documents from MongoDB, collects SKUs, then calls catalog for mapping and filters in memory.
- Files: `services/order-service/src/server.ts`
- Impact: CPU, memory, and latency grow with order volume and item counts; risk of timeouts under load (`axios` timeout 45s on catalog).
- Fix approach: Push filtering into MongoDB (indexed supplier fields on line items after denormalization), paginate, or cap with cursor-based paging.

**Root workspace test scope:**

- Issue: Root `package.json` runs `pnpm --filter frontend test` only; `services/` has no `*.test.ts` / `*.spec.ts` files detected.
- Files: `package.json`, `services/*/package.json` (no co-located tests)
- Impact: Gateway and microservice regressions rely on manual checks and smoke scripts.
- Fix approach: Add Vitest or integration tests per service for auth headers, KYC gate, and webhook idempotency paths.

**Nested legacy tree `lgdx-main/`:**

- Issue: Full separate stack (multiple `package.json`, Docker Compose variants, eslint disables, `any` types) lives beside Stonee apps.
- Files: `lgdx-main/` (e.g. `lgdx-main/server/package.json`, `lgdx-main/client/`)
- Impact: Duplicate dependency surfaces, confusion over which stack is authoritative, higher audit/review cost.
- Fix approach: Document ownership boundary in ops docs; submodule or extract; align lint/type strictness if any code is still imported.

**Minimal `.gitignore`:**

- Issue: Repository `.gitignore` currently lists only `.env`; build artifacts such as `apps/frontend/dist/` may be committed unintentionally.
- Files: `.gitignore`, `apps/frontend/dist/` (if present in tree)
- Impact: Merge noise, stale assets, accidental leakage of build-time strings.
- Fix approach: Ignore `dist/`, `node_modules/`, coverage, and IDE cruft consistently at repo root.

## Known Bugs

**Not classified as a confirmed runtime bug from this pass:** no reproducible defect filed here. Treat misconfiguration cases below as operational risks until automated gates cover them in all deploy paths.

## Security Considerations

**Default JWT secret across services:**

- Risk: Same literal fallback `changeme` if `JWT_SECRET` is unset, enabling token forgery across gateway and services that sign or verify with the same secret.
- Files: `apps/api-gateway/src/server.ts`, `services/user-service/src/controllers/authController.ts`, `services/supplier-service/src/verifyBearerJwt.ts`
- Current mitigation: `scripts/check-prod-gateway.mjs` with `--strict` rejects default in CI when env is wired; `info/SECURITY.md` documents the requirement.
- Recommendations: Fail fast at service startup when `JWT_SECRET` is missing in `NODE_ENV=production`; align all verifiers on one config contract.

**Permissive CORS when origins unset:**

- Risk: `resolveCorsOrigin()` returns `true` if `STONEE_CORS_ORIGINS` is empty, reflecting any browser origin.
- Files: `apps/api-gateway/src/server.ts`, `info/SECURITY.md`
- Current mitigation: `pnpm run check:prod-gateway` enforces non-empty `STONEE_CORS_ORIGINS` in release pipelines that run the script.
- Recommendations: Default-deny in production unless an explicit `STONEE_CORS_ALLOW_DEV=true` (or similar) is set.

**Simulated payments without Stripe:**

- Risk: `allowSimulatedPay` is true when `STRIPE_ALLOW_SIMULATED_PAY === 'true'` or when `STRIPE_SECRET_KEY` is empty, which can complete flows without real card capture.
- Files: `services/order-service/src/server.ts`
- Current mitigation: Documented in `info/SECURITY.md` as dev-only; simulated path errors when disabled at runtime for clients.
- Recommendations: Require explicit env to enable simulation even when the secret is missing, so empty prod config fails closed instead of opening simulated pay.

**KYC enforcement gap on missing internal secret:**

- Risk: If `STONEE_KYC_ENFORCE_MIN_USD > 0` but `STONEE_INTERNAL_SECRET` is unset, checkout proceeds with a warning (“allow checkout (misconfig)”).
- Files: `services/order-service/src/kycGate.ts`
- Current mitigation: Logs warn; `info/SECURITY.md` describes intended Docker-internal wiring.
- Recommendations: In production, treat as fatal misconfiguration or return `503` when min USD is set and secret is absent.

**Dev-only KYC self-verify:**

- Risk: `POST` handler gated only by `STONEE_ALLOW_KYC_SELF_VERIFY === 'true'` marks buyers verified without a provider.
- Files: `services/user-service/src/controllers/authController.ts`, `scripts/smoke-kyc.mjs`
- Current mitigation: Off unless env is set; documented in `info/SECURITY.md`.
- Recommendations: Hard-disable when `NODE_ENV=production` regardless of env var typos.

**Rate limit client identity:**

- Risk: `keyGenerator` prefers the first `X-Forwarded-For` hop; if `trustProxy` is true without a trusted edge stripping client-supplied forwards, limits can be bypassed or shifted.
- Files: `apps/api-gateway/src/server.ts`, `info/SECURITY.md`
- Current mitigation: Documentation calls out reverse-proxy and `trustProxy` expectations.
- Recommendations: Configure the edge to set a single trusted client IP header; optionally require a shared proxy secret.

## Performance Bottlenecks

**Supplier orders listing (see Tech Debt):** repeated full scans and cross-service HTTP for SKU mapping — see `services/order-service/src/server.ts`.

**Catalog list query typing:** broad `filter: any` on the main GET path allows flexible queries but skips compile-time guardrails for index usage and query shape.
- Files: `services/catalog-service/src/routes/catalogRoutes.ts`
- Improvement path: Replace `any` with typed filter builders; add explicit pagination defaults for unbounded result sets when `page`/`limit` omitted.

## Fragile Areas

**Header-based authorization downstream of gateway:**

- Files: `services/order-service/src/server.ts`, `services/user-service/src/server.ts`
- Why fragile: Services trust `x-user-id`, `x-user-role`, and `x-supplier-company-id` set by the gateway; anything that bypasses the gateway on the same network must not reach these ports.
- Safe modification: Any new route must assume headers are untrusted unless network policy guarantees gateway-only access; document Docker network boundaries.
- Test coverage: No automated service tests observed for header injection or role matrix.

**Stripe webhook and payment state machine:**

- Files: `services/order-service/src/stripeWebhookPlugin.ts`, `services/order-service/src/finalizePaidOrder.ts` (imported from `services/order-service/src/server.ts`)
- Why fragile: Idempotency and signature verification are security- and money-critical; regressions are high impact.
- Test coverage: Rely on manual/smoke; add contract tests with Stripe test fixtures.

## Scaling Limits

**In-memory supplier order filter cap:**

- Current capacity: Hard `limit(500)` on Mongo query for supplier listing path.
- Limit: Suppliers with relevant activity beyond recent 500 orders see incomplete lists; memory still holds 500 full documents per request.
- Scaling path: Cursor pagination, server-side aggregation, or denormalized supplier index on orders.

## Dependencies at Risk

**Not evaluated for CVE depth in this pass:** run `pnpm audit` / OSV regularly on `pnpm-lock.yaml` at repo root and per-service lockfiles if split. The monorepo mixes `lgdx-main` and Stonee workspaces — scope audits intentionally.

## Missing Critical Features

**Production KYC provider integration:**

- Problem: `info/SECURITY.md` states full KYC provider and AML remain product/legal P0; code uses internal status and optional self-verify.
- Blocks: Regulatory posture for high-ticket public launch beyond technical gate flags.

## Test Coverage Gaps

**Backend and gateway:**

- What's not tested: Fastify handlers in `services/*`, JWT/CORS/rate-limit behavior in `apps/api-gateway/src/server.ts`, internal route auth in `services/catalog-service/src/routes/catalogRoutes.ts`, KYC gate in `services/order-service/src/kycGate.ts`.
- Files: `services/**/*.ts` (no test files matched), `apps/api-gateway/src/server.ts`
- Risk: Shipping auth or payment regressions without CI signal.
- Priority: High

**Frontend (partial coverage):**

- What exists: Vitest tests under `apps/frontend/src/lib/*.test.ts` and hooks tests.
- What's not exhaustively covered: Checkout, supplier portal, and admin flows in `apps/frontend/src/pages/`.
- Risk: UI regressions on money paths.
- Priority: Medium

---

*Concerns audit: 2026-05-14*
