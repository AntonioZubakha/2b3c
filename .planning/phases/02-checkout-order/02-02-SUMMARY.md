---
phase: 02-checkout-order
plan: 02
subsystem: order-service
tags: [checkout, shipping, status, docs]
requires: [02-01-PLAN GAP register]
provides: [ORD-01, ORD-02 alignment]
affects:
  - services/order-service/src/server.ts
  - services/order-service/src/finalizePaidOrder.ts
  - apps/frontend/src/pages/OrdersPage.tsx
  - apps/frontend/src/pages/OrderDetailPage.tsx
  - apps/frontend/src/lib/contracts.ts
  - apps/frontend/src/i18n/locales/en/orders.ts
  - apps/frontend/src/i18n/locales/ru/orders.ts
  - info/API.md
  - info/SECURITY.md
  - info/FRONTEND.md
  - scripts/smoke.mjs
tech_stack:
  added: []
  patterns: [server-side DTO normalization]
key_files:
  created: [02-02-SUMMARY.md]
  modified:
    - services/order-service/src/server.ts
    - services/order-service/src/finalizePaidOrder.ts
    - apps/frontend/src/pages/OrdersPage.tsx
    - apps/frontend/src/pages/OrderDetailPage.tsx
    - apps/frontend/src/lib/contracts.ts
    - apps/frontend/src/i18n/locales/en/orders.ts
    - apps/frontend/src/i18n/locales/ru/orders.ts
    - info/API.md
    - info/SECURITY.md
    - info/FRONTEND.md
    - scripts/smoke.mjs
decisions:
  - "GAP-STATUS-01: оставлен единый переход finalize в CONFIRMED; UI и i18n трактуют CONFIRMED как «оплачено и подтверждено»; ветка PAID в стилях объединена с CONFIRMED для редких legacy записей."
  - "GAP-SIM-01: fail-closed при пустом STRIPE_SECRET_KEY не внедрён — зафиксирован открытый риск в info/SECURITY.md (2026-05-14) с follow-up SEC-FAIL-CLOSED-SIM-001, чтобы не сломать локальный smoke без согласованного изменения compose."
metrics:
  completed_date: 2026-05-14
---

# Phase 2 Plan 02: Checkout implementation Summary

**One-liner:** Server-side `shippingAddress` normalization (`street`→`addressLine1`, `postalCode`→`zipCode`) on checkout; buyer order UI and docs aligned with **`PENDING`→`CONFIRMED`** payment finalization; SECURITY/API/FRONTEND updated for simulated pay, webhook dedup, and UI↔API status table.

## Completed work

- **GAP-SHIP-01:** `normalizeShippingAddress` in `services/order-service/src/server.ts`; checkout persists canonical fields.
- **GAP-STATUS-01:** Comment in `finalizePaidOrder.ts`; merged `PAID`/`CONFIRMED` badge styling on `OrdersPage` and `OrderDetailPage`; i18n `CONFIRMED` copy; `contracts.ts` comment.
- **GAP-WEBHOOK-01 / GAP-SIM-01 / GAP-ERR-01 / GAP-CART-RL-01:** Addressed via `info/SECURITY.md` and `info/API.md` (no webhook logic change).
- **info/FRONTEND.md:** Table «UI label → API status → когда возникает».
- **scripts/smoke.mjs:** Comments on canonical shipping body (smoke already used `addressLine1`/`zipCode`).

## Verification

- `pnpm run test` — passed (frontend Vitest).
- `pnpm run lint` — passed (0 errors; existing frontend warnings unchanged).
- `pnpm --filter frontend exec tsc --noEmit` — passed.

## Docker smoke

Не запускался в среде агента (нет гарантированного поднятого `docker compose`). Команда из корня репозитория (после `docker compose up -d` по `info/DEVELOPMENT.md`):

`pnpm run smoke`

Предусловия: доступен gateway на `BASE_URL` (default `http://127.0.0.1:8080`), в стеке есть алмазы для ветки buyer flow либо сценарий будет частично пропущен по логам smoke; для **`POST …/pay`** в типичном compose без Stripe-ключа симуляция **включена** автоматически (см. `info/SECURITY.md`).

## Deviations from plan

- **GAP-SIM-01:** Не менялось условие `allowSimulatedPay` в коде — вместо этого явный **open risk** и follow-up ID в `info/SECURITY.md` (согласовано с must_have «перенесён в явный открытый риск»).

## Self-Check: PASSED

- [x] `Select-String -Pattern 'addressLine1|zipCode' -Path 'services/order-service/src/server.ts'` — совпадения в `normalizeShippingAddress` и использовании при checkout (плановый verify).
- [x] `Select-String -Pattern 'normalizeShippingAddress|addressLine1' -Path 'services/order-service/src/server.ts'` находит нормализацию.
- [x] Файлы `info/API.md`, `info/SECURITY.md`, `info/FRONTEND.md` обновлены.
- [x] `02-02-SUMMARY.md` создан.
