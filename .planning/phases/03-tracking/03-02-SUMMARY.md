---
phase: 03-tracking
plan: 02
subsystem: ui
tags: [OrderStatus, timeline, i18n, vitest, smoke, TRK-01, TRK-02]

requires:
  - phase: 03-tracking
    provides: GAP register and audit matrix from 03-01-PLAN.md

provides:
  - Buyer order timeline from API `OrderStatus` only (`getOrderTrackingSteps`)
  - Status-aware list/detail hints (ru/en) without fixed SLA after ship/deliver/cancel
  - Documentation in info/FRONTEND.md and info/API.md
  - Smoke asserts CONFIRMED after pay (standard and bespoke branches)

affects:
  - Future ops/merchant status UX; any new OrderStatus values would need contract + orderTracking update

tech-stack:
  added: []
  patterns:
    - "Timeline step ids are only OrderStatus literals; CANCELLED omits DELIVERED"
    - "orderListHintGroup / orderDetailProgressHintGroup centralize TRK-02 copy buckets"

key-files:
  created:
    - apps/frontend/src/lib/orderTracking.ts
    - apps/frontend/src/lib/orderTracking.test.ts
    - .planning/phases/03-tracking/03-02-SUMMARY.md
  modified:
    - apps/frontend/src/pages/OrderDetailPage.tsx
    - apps/frontend/src/pages/OrdersPage.tsx
    - apps/frontend/src/i18n/locales/en/orders.ts
    - apps/frontend/src/i18n/locales/en/orderDetail.ts
    - apps/frontend/src/i18n/locales/ru/orders.ts
    - apps/frontend/src/i18n/locales/ru/orderDetail.ts
    - info/FRONTEND.md
    - info/API.md
    - scripts/smoke.mjs

key-decisions:
  - "PAID uses alternate visual sequence (legacy) while CONFIRMED is default buyer path after finalizePaidOrder"

patterns-established:
  - "orderTracking.ts stays React-free; pages import helpers only"

requirements-completed: [TRK-01, TRK-02]

duration: 35min
completed: 2026-05-14
---

# Phase 03-tracking Plan 02: Order tracking timeline Summary

**Truthful buyer timeline from `OrderStatus` only, Vitest-covered `orderTracking.ts`, status-aware ru/en copy, docs, and smoke CONFIRMED assertions after pay.**

## Performance

- **Duration:** ~35 min (with audit refresh)
- **Started:** 2026-05-14T12:00:00Z (approx.)
- **Completed:** 2026-05-14T12:35:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `getOrderTrackingSteps` implements PENDING, PAID branch, CONFIRMED path, SHIPPED, DELIVERED, and CANCELLED without marking `DELIVERED` on cancel.
- `OrderDetailPage` renders timeline + bespoke vs ready context copy; `OrdersPage` uses `orderListHintGroup` for short hints.
- `info/FRONTEND.md` / `info/API.md` document buyer timeline limits (no manufacturing field).
- `smoke.mjs` asserts `CONFIRMED` after pay for standard and bespoke orders when those flows run.

## Task Commits

1. **Task 1: orderTracking TDD** — included in `feat(frontend): order tracking timeline` (test + implementation together in working tree).
2. **Task 2: UI + i18n** — same commit family as above.
3. **Task 3: Docs + smoke** — same.

## Files Created/Modified

- `apps/frontend/src/lib/orderTracking.ts` — Step list and hint group helpers.
- `apps/frontend/src/lib/orderTracking.test.ts` — Vitest for statuses and hint groups.
- `apps/frontend/src/pages/OrderDetailPage.tsx` — Timeline, context copy, progress hints.
- `apps/frontend/src/pages/OrdersPage.tsx` — List hints under cards.
- `apps/frontend/src/i18n/locales/{en,ru}/orders.ts` — `listHints`, status labels.
- `apps/frontend/src/i18n/locales/{en,ru}/orderDetail.ts` — Tracking context + `progressHints`.
- `info/FRONTEND.md` — Buyer timeline section.
- `info/API.md` — Buyer GET `status` truth + PATCH reminder.
- `scripts/smoke.mjs` — Post-pay status assertions.

## Decisions Made

- Reused single hint bucket type for list and detail footnotes (`orderDetailProgressHintGroup` delegates to `orderListHintGroup`) to avoid duplicated mapping logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Smoke (integration)

- **`pnpm run smoke`** was **not** executed in this environment: full Docker stack on `127.0.0.1:8080` is required for health gates and buyer flow. Assertions are present in `scripts/smoke.mjs` for when the stack is up.

## Next Phase Readiness

- Buyer tracking aligns with TRK-01/02; any future manufacturing milestones need API/schema design outside this phase.

---

*Phase: 03-tracking*

*Completed: 2026-05-14*

## Self-Check: PASSED

- `apps/frontend/src/lib/orderTracking.ts` and `orderTracking.test.ts` exist.
- `smoke.mjs` contains `CONFIRMED` checks after pay (standard + bespoke).
- This summary file exists.
