---
phase: 01-two-catalog-paths
plan: "02"
subsystem: frontend-buyer-flows
tags: [GAP-NAV-01, GAP-CRAFT-01, GAP-CART-01, GAP-CART-02, CAT-01, CAT-02, CAT-03]
key-files:
  created: []
  modified:
    - apps/frontend/src/components/Navbar.tsx
    - apps/frontend/src/pages/CraftPage.tsx
    - apps/frontend/src/pages/CartPage.tsx
    - apps/frontend/src/i18n/locales/en/cart.ts
    - apps/frontend/src/i18n/locales/ru/cart.ts
    - apps/frontend/src/i18n/locales/en/craft.ts
    - apps/frontend/src/i18n/locales/ru/craft.ts
metrics:
  duration_minutes: 0
  completed_date: 2026-05-14
  tasks_completed: 3
---

# Phase 01 Plan 02: Navbar, craft cart-first, safe cart recs summary

**One-liner:** Buyer navbar exposes `/collections` beside `/craft`; craft summary adds bespoke then routes to `/cart` (or auth toward `/cart`) with bill total equal to diamond + setting; cart recommendations only use real jewelry SKUs; empty cart links to collections.

## Tasks completed

| Task | Name | Outcome |
| ---- | ---- | ------- |
| 1 | Buyer navbar — collections (GAP-NAV-01) | Buyer `links`: `/craft` then `/collections` with `nav.collections`. |
| 2 | Craft cart-first + honest totals (GAP-CRAFT-01) | Removed inline checkout and delivery form; `price` on add = `totalPrice` (setting + diamond); bill total matches; redirect `encodeURIComponent('/cart')`; new copy keys `craft.addToBagContinue`, `craft.bespokeTotalNote`, updated `stepThreeDesc`. |
| 3 | Cart recommendations + empty CTA (GAP-CART-01/02) | Jewelry-only SKU walk (inline in this wave; extracted to shared helper in plan 03); empty state secondary link to `/collections` + `cart.exploreCollections` i18n. |

## Verification

- `pnpm --filter frontend run lint` — exit **0** (existing repo warnings only; no new errors).

## Deviations from plan

**None.**

## Self-Check: PASSED

- [x] Modified files exist under `E:\Stonee\apps\frontend\`.
- [x] Lint completed successfully after changes.

**Note:** No git repository at `E:\Stonee`; per-task commits not recorded.
