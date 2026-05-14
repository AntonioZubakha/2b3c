---
phase: 03-tracking
plan: 01
subsystem: planning
tags: [audit, OrderStatus, TRK-01, TRK-02, i18n, smoke]

requires:
  - phase: 02-checkout-order
    provides: Checkout, pay finalize → CONFIRMED, buyer GET my-orders

provides:
  - GAP register (TRK-01, TRK-02, smoke) with priorities and file owners
  - Evidence matrix with line pointers into Order.ts, server.ts, finalizePaidOrder, UI, i18n
  - Multi-source coverage row for GOAL, TRK-01/02, 03-RESEARCH, D-03-01–04

affects:
  - 03-02 implementation (orderTracking, UI, docs, smoke)

tech-stack:
  added: []
  patterns:
    - "Buyer-visible fulfillment truth = order.status only; item.type for narrative hints"

key-files:
  created:
    - .planning/phases/03-tracking/03-01-SUMMARY.md
  modified:
    - .planning/phases/03-tracking/03-01-PLAN.md

key-decisions:
  - "No new OrderStatus values in Phase 3; gaps closed in 03-02 with UI/docs/smoke only"

patterns-established:
  - "GAP IDs GAP-TRK-01, GAP-TRK-02a/b, GAP-SMK-01 map to 03-02 tasks"

requirements-completed: [TRK-01, TRK-02]

duration: 25min
completed: 2026-05-14
---

# Phase 03-tracking Plan 01: Buyer tracking audit Summary

**Read-only audit of OrderStatus sources, UI/i18n mapping, TRK-02 static-copy risk, and GAP register wired to D-03 decisions for 03-02.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-14T00:00:00Z (approx.)
- **Completed:** 2026-05-14T00:25:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Expanded **Матрица (полная)** with grep-friendly file:line pointers for all six statuses, buyer GET routes, `orderStatusLabel`, and SLA strings.
- Added **подматрица** `items[].type` vs API-only `order.status` per D-03-02 (explicit «нет поля manufacturing»).
- Refined **GAP register** with P0/P1, GAP-SMK-01 assert contract, and **Multi-source coverage** rows for D-03-01–D-03-04 individually.

## Task Commits

1. **Task 1–2: Matrix, GAP, multi-source** — (see git after `docs(03): audit tracking)`)

**Plan metadata:** (same commit as wave 1 docs)

## Files Created/Modified

- `.planning/phases/03-tracking/03-01-PLAN.md` — Audit sections, GAP priorities, multi-source sign-off.
- `.planning/phases/03-tracking/03-01-SUMMARY.md` — This file.

## Decisions Made

None beyond plan: audit stays read-only; no backend enum changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

03-02 can implement `orderTracking.ts`, timeline on `OrderDetailPage`, conditional copy, docs, and smoke asserts using this PLAN as SoT.

---

*Phase: 03-tracking*

*Completed: 2026-05-14*

## Self-Check: PASSED

- `.planning/phases/03-tracking/03-01-SUMMARY.md` exists.
- Plan patterns `Матрица (полная)`, `GAP-TRK-01`, `OrderStatus`, `GAP-TRK*`, `GAP-SMK-01`, `Multi-source coverage` verified via workspace search (host shell had no `rg` in PATH).
