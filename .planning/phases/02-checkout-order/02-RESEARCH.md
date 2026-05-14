# Phase 2 — Research notes (checkout, Stripe, statuses)

**Date:** 2026-05-14  
**Scope:** Короткая выжимка для исполнителей; детальный аудит — в `02-01-PLAN.md`.

## Stripe PaymentIntent flow (live)

1. Клиент после `POST /api/order/checkout` получает `orderId` (`CheckoutPage.tsx` → `GATEWAY.order` + `/checkout`).
2. `POST /api/order/orders/:id/create-payment-intent` создаёт PI с `metadata.orderId` / `metadata.userId` (`services/order-service/src/server.ts`).
3. `StripePaymentForm` вызывает `stripe.confirmPayment`, затем при `succeeded` — `POST /api/order/orders/:id/confirm-stripe-payment`, который дергает `finalizePaidOrder` после проверки суммы в центах (`StripePaymentForm.tsx`, `server.ts`, `finalizePaidOrder.ts`).

## Webhook path и идемпотентность

- Шлюз пускает без JWT: `POST` на путь, начинающийся с `/api/order/webhooks/stripe` (`apps/api-gateway/src/server.ts` — условие `isPublic`).
- В order-service плагин регистрируется с `prefix: '/webhooks'` и маршрутом `POST /stripe` → фактический путь **`/webhooks/stripe`** на сервисе (`server.ts` + `stripeWebhookPlugin.ts`). Прокси с префиксом `/api/order` должен сохранять суффикс, совместимый с этим путём (проверить в аудите 02-01 при расхождении 502).
- **Идемпотентность:** вставка в коллекцию `ProcessedStripeEvent` по `event.id` до обработки; дубликат Mongo `11000` → `200` без повторного `finalizePaidOrder` (`stripeWebhookPlugin.ts`). При ошибке после вставки lock удаляется — возможен retry Stripe (исследование риска replay при частичном сбое зафиксировать в threat register 02-01/02-02).

## Simulated pay (`allowSimulatedPay`)

- `allowSimulatedPay === true` если `STRIPE_ALLOW_SIMULATED_PAY === 'true'` **или** `STRIPE_SECRET_KEY` пустой (`services/order-service/src/server.ts` вверху файла).
- `POST /orders/:id/pay` разрешён только при `allowSimulatedPay`; иначе 400 с текстом про Stripe / env (`server.ts`).
- UI без publishable key показывает dev-блок и кнопку simulated pay (`CheckoutPage.tsx`).

## OrderStatus в коде vs ожидания UI

- **Enum сервера:** `PENDING | PAID | CONFIRMED | SHIPPED | DELIVERED | CANCELLED` (`services/order-service/src/models/Order.ts`).
- **`finalizePaidOrder`:** атомарно переводит только из **`PENDING` → `CONFIRMED`**, не через `PAID` (`finalizePaidOrder.ts`).
- **Фронт:** `OrdersPage.tsx` / `OrderDetailPage.tsx` / `MerchantDashboard.tsx` и `contracts.ts` включают `PAID` в union и стили; i18n `orders.status.PAID` / `CONFIRMED` есть (`apps/frontend/src/i18n/locales/en/orders.ts`, `ru/orders.ts`).
- **Вывод:** состояние **`PAID` в типах и переводах есть, в happy-path после Stripe/simulated фактически приходит `CONFIRMED`. Это обязательный предмет ORD-02 в документации и при желании — выравнивания машины состояний.

## Pricing и типы линий (jewelry / bespoke / diamond)

- `/validate-prices` поддерживает `diamond`, `setting`, `bespoke` (сумма цен пары), `jewelry` (`services/pricing-service/src/server.ts`).
- Корзина допускает те же типы (`Cart.ts`). Craft summary добавляет bespoke; готовые изделия — `jewelry`; маркетплейс может давать только `diamond` в корзине — все ветки должны пройти в аудите 02-01 против `scripts/smoke.mjs` (diamond + bespoke сценарии).

---
*Phase: 02-checkout-order*
