# Phase 3 — Трекинг: исследование (SoT = код на 2026-05-14)

## 1. `OrderStatus` в БД / API

**Определение:** `services/order-service/src/models/Order.ts`

| Значение | Назначение (по коду и комментариям Phase 2) |
|----------|---------------------------------------------|
| `PENDING` | Заказ создан (checkout), ожидает оплату. |
| `PAID` | Остаётся в enum для совместимости / ручных сценариев; **стандартный** buyer checkout **не** выставляет `PAID` (сразу `CONFIRMED`). |
| `CONFIRMED` | После успешной оплаты: `finalizePaidOrder` атомарно `PENDING` → `CONFIRMED`. |
| `SHIPPED` | Логистика; может выставляться через `PATCH /orders/:id/status` (роль с `canEditOrderStatus`). |
| `DELIVERED` | Завершение доставки; same PATCH. |
| `CANCELLED` | Отмена; same PATCH. |

**Поля «fulfillment / manufacturing / shipping tracking» в `IOrder`:** отсутствуют (только `shippingAddress`, `items`, `status`, `paymentIntentId`, суммы и даты).

## 2. Где статус меняется

| Механизм | Файл / маршрут | Переходы |
|----------|----------------|----------|
| Оплата (Stripe confirm, webhook, simulated `POST …/pay`) | `finalizePaidOrder.ts` | `PENDING` → `CONFIRMED` при матче. |
| Ручное/операционное | `order-service` `PATCH /orders/:id/status` | Любой допустимый enum в теле (валидация — enum схемы Mongoose + права роли). |
| Checkout | `server.ts` `POST /checkout` | Новый заказ в `PENDING`. |

При `SHIPPED` или `CONFIRMED` на PATCH дополнительно дергается catalog `status-bulk` (инвентарь) — для покупательского трекинга вторично.

## 3. Что видит UI сегодня

| Элемент | Поведение |
|---------|-----------|
| Список заказов | `order.status` → `orderStatusLabel(t, status)` → ключи `orders.status.*` (`displayI18n.ts`). |
| Деталь заказа | То же для бейджа; **нет** timeline по статусам. |
| Статические строки | `orders.processingTime` («3–5 рабочих дней») на **всех** заказах в списке; `orderDetail.processingNote` — то же на детали **независимо** от `status` и типа позиций. |

**Стили:** `getStatusClass` — ветки `PENDING`, `PAID`+`CONFIRMED`, `SHIPPED`, `DELIVERED`, default (`OrdersPage.tsx`, `OrderDetailPage.tsx`).

## 4. Соответствие TRK-01 / TRK-02

| Требование | Состояние кода | Пробел |
|------------|----------------|--------|
| **TRK-01** — отслеживание изготовление+доставка или доставка | Пользователь видит **один** бейдж статуса; нет пошаговой линейки по реальным состояниям API. | Нужна минимальная **визуальная** шкала только из `OrderStatus` + краткие подсказки по типу позиции (D-03). |
| **TRK-02** — копирайт не обещает лишнего | Фиксированные «3–5 дней» звучат как обещание SLA при любом статусе и типе (bespoke vs готовое). | Привязать/смягчить копирайт к `status` + `items[].type` или заменить на нейтральное «сроки уточняет консьерж» где нет данных. |

## 5. Smoke / E2E

`scripts/smoke.mjs`: после `pay` проверяется наличие заказа в `GET /api/order/my-orders`, но **не** проверяется значение `status` и нет отдельной проверки детального GET. Для регресса при изменении семантики статусов полезно assert-ить ожидаемый `status` на ответе списка или `my-orders/:id`.

## 6. Вне объёма этого RESEARCH (ссылка)

Расширение enum, webhooks от ТК, уведомления — только после явного решения и отдельных планов.

---
*Research artifact for Phase 03-tracking; сверять с кодом при исполнении.*
