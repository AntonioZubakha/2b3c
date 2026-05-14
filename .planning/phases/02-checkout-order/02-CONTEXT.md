# Phase 2: Чекаут и заказ — Context

**Gathered:** 2026-05-14  
**Status:** Ready for execution  
**Source:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` Phase 2, Phase 1 summaries, `CONCERNS.md`, `info/*`, order/pricing/gateway/checkout code paths.

## Phase boundary

Закрыть **ORD-01** (оплата и подтверждение заказа для обоих каталожных сценариев: готовое украшение и bespoke/craft) и **ORD-02** (статусы заказа согласованы с доменом; явные пробелы «UI ↔ API» задокументированы в `info/` до или вместе с правками). **Не** расширять Phase 3 (трекинг UX) и Phase 4 (бренд) сверх документированных отсылок.

**Depends on:** Phase 1 завершена (два пути до корзины) — см. `01-01-SUMMARY.md`, `01-02-SUMMARY.md`, `01-03-SUMMARY.md`.

## Implementation decisions (locked for this phase)

1. **D-01 (ORD-01):** Единая точка чекаута для покупателя — `apps/frontend/src/pages/CheckoutPage.tsx`; серверный контур оплаты — `services/order-service/src/server.ts` (`POST /checkout`, `POST /orders/:id/create-payment-intent`, `POST /orders/:id/confirm-stripe-payment`, `POST /orders/:id/pay`, webhook `services/order-service/src/stripeWebhookPlugin.ts`); шлюз — `apps/api-gateway/src/server.ts` (JWT vs публичные исключения).
2. **D-02 (ORD-02):** Источник истины по статусам заказа — `services/order-service/src/models/Order.ts` (`OrderStatus`); отображение — `apps/frontend/src/lib/displayI18n.ts` (`orderStatusLabel`) и страницы `OrdersPage.tsx`, `OrderDetailPage.tsx`; любое расхождение перечисляется в `info/FRONTEND.md` и при необходимости `info/API.md`.
3. **D-03:** Валидация цен на чекауте обязательна через pricing-service — `POST /validate-prices` в `services/pricing-service/src/server.ts`; корзина до заказа — `services/order-service/src/server.ts` + модель `services/order-service/src/models/Cart.ts` (типы `diamond` | `setting` | `jewelry` | `bespoke`).
4. **D-04 (CONCERNS / roadmap success #3):** Критичные пункты из `.planning/codebase/CONCERNS.md`, затрагивающие оплату и webhooks (симуляция оплаты, идемпотентность webhook, KYC/internal secret, заголовки downstream), **либо** закрываются кодом/конфигом в рамках 02-02, **либо** явно фиксируются как открытый риск с датой и ссылкой на follow-up в `info/SECURITY.md` — без «молчаливого» игнорирования.

## Canonical file references

- `apps/frontend/src/pages/CartPage.tsx` — корзина, редирект на auth перед `/checkout`.
- `apps/frontend/src/pages/CheckoutPage.tsx` — адрес доставки, Stripe / simulated pay UI.
- `apps/frontend/src/components/StripePaymentForm.tsx` — `confirmPayment` + `POST …/confirm-stripe-payment`.
- `apps/frontend/src/lib/orderQuery.ts`, `apps/frontend/src/lib/contracts.ts` — контракты корзины/заказа.
- `apps/api-gateway/src/server.ts` — `isPublic`, rate limits, прокси `/api/order`.
- `services/order-service/src/server.ts` — cart, checkout, pay, Stripe PI, finalize path.
- `services/order-service/src/finalizePaidOrder.ts` — переход после оплаты, каталог/уведомления.
- `services/order-service/src/stripeWebhookPlugin.ts`, `services/order-service/src/models/ProcessedStripeEvent.js` (или `.ts`) — webhook и дедуп.
- `services/pricing-service/src/server.ts` — `/validate-prices`.
- `scripts/smoke.mjs` — happy-path checkout + `…/pay` для diamond и bespoke.
- `info/API.md`, `info/SECURITY.md`, `info/FRONTEND.md`, `info/DEVELOPMENT.md`.

## Deferred (не в Phase 2)

- Полноценные платёжные провайдеры РФ, смена npm-scope, глубокий ребрендинг.
- Расширенный трекинг заказа (Phase 3) сверх согласования статусов и документации.

---
*Phase: 02-checkout-order*
