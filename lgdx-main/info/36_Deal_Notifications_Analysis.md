# Система уведомлений по сделкам (актуально по коду `server/`)

Документ фиксирует **фактическую** реализацию уведомлений в gateway `server/`: in‑app (MongoDB), Telegram (deal event bot) и real‑time (Socket.IO).

## Источник истины (файлы)

- `server/src/services/notificationService.ts` — создание уведомлений, Telegram‑рассылка, real‑time emit.
- `server/src/models/Notification.ts` — модель, список `NotificationType`, TTL (30 дней).
- `server/src/socket/index.ts` — инициализация Socket.IO и запись `global.io` для `NotificationService`.
- `server/src/routes/notification.ts` + `server/src/controllers/notificationController.ts` — API уведомлений для пользователя.

## Каналы доставки

### 1) In-app (MongoDB)

Создание: `notificationService.createNotification(...)` создаёт документ `Notification` в MongoDB.

Срок жизни: поле `expiresAt` имеет TTL индекс (по умолчанию удаление через 30 дней).

### 2) Telegram (deal event bot)

`NotificationService` по умолчанию пытается отправить Telegram‑сообщение, если:
- `sendTelegram=true` (дефолтный аргумент `createNotification`), и
- в данных присутствует `dealNumber`

Отправка идёт через `sendDealEventNotification(...)` (`server/src/utils/telegramBot.ts`).

Важно: это **канальный** бот для событий (не DM пользователям), т.е. аудит/оперативный канал для команды.

### 3) Real-time (Socket.IO)

После создания уведомления сервис отправляет событие:
- event: `new_notification`
- room: `user:<userId>`

Условие: Socket.IO должен быть поднят и сохранить `global.io` (делается в `server/src/socket/index.ts`).

## API уведомлений (для клиента)

Маршруты `server/src/routes/notification.ts` (все требуют auth):

- `GET /api/notifications?limit=20&skip=0` — список + `total` + `unreadCount`
- `GET /api/notifications/unread` — последние непрочитанные (до 50)
- `GET /api/notifications/unread-count`
- `PUT /api/notifications/read-all`
- `PUT /api/notifications/:id/read`
- `DELETE /api/notifications/:id`

## NotificationType (фактический список)

Источник: `server/src/models/Notification.ts`. Среди типов есть (и реально используются в командах):
- `deal_created`
- `deal_cancelled`
- `shipping_cost_updated`
- `stone_received`
- `quality_approved`
- `import_tariff_updated`
…и остальные типы, перечисленные в модели.

## Где создаются уведомления (по коду)

### A) notifyCounterparty (уведомление второй стороны сделки)

`notificationService.notifyCounterparty(...)` используется в командах `server/src/controllers/deal/actions/*` (ключевые):

- approve/reject request: `request_approved`, `request_rejected`
- invoice upload/accept/reject: `invoice_uploaded`, `invoice_accepted`, `invoice_rejected`
- payment/delivery/shipping tracking: `payment_confirmed`, `order_shipped`, `delivery_confirmed`
- alternatives: `alternative_proposed`, `alternative_accepted`, `alternative_rejected`, `quality_rejected_alternative_selected`
- LGDEAL workflow → buyer: `stone_received`, `quality_approved`
- cancellation & charges: `deal_cancelled`, `shipping_cost_updated`, `import_tariff_updated`

Определение «контрагента» зависит от `dealType`:
- `buyer-to-lgdeal`: buyer ↔ LGDEAL(seller)
- `lgdeal-to-seller`: LGDEAL(buyer) ↔ supplier(seller)
- прочие: buyer ↔ seller

Реализация: `NotificationService.notifyCounterparty(...)`.

### B) createNotification напрямую (уведомление конкретной внутренней роли)

Команды, где создаются уведомления конкретным пользователям (не “контрагенту”), делают `createNotification(...)` напрямую (примеры):
- `AssignToManagerCommand`
- `ReassignManagerCommand`
- `AssignToLogistCommand`
- `RejectQualityCommand`

### C) Создание сделок (уведомления продавцам/поставщикам)

При инициации сделок из корзины `DealInitiationService` отправляет `deal_created` продавцам (по созданным `lgdeal-to-seller` сделкам) через `notificationService.createNotification(...)`.

## Отладка

1) In-app: `GET /api/notifications` и коллекция `notifications` в MongoDB.  
2) Real-time: убедиться, что Socket.IO инициализирован и `global.io` выставлен; клиент должен слушать `new_notification`.  
3) Telegram: проверять канал/чат, куда настроен deal event bot (`telegramBot.ts`).

# Анализ системы уведомлений для участников сделок

## Дата анализа: 2026-01-27

## Обзор

В проекте реализована система уведомлений для участников сделок через `NotificationService`. Система поддерживает:
- **In-app уведомления** (сохраняются в БД, модель `Notification`)
- **Telegram уведомления** (через Deal Event Bot)
- **WebSocket уведомления** (real-time обновления)

---

## ✅ Что уже реализовано

### 1. Базовая инфраструктура

**Файлы:**
- `server/src/services/notificationService.ts` - основной сервис уведомлений
- `server/src/models/Notification.ts` - модель уведомлений
- `server/src/utils/telegramBot.ts` - интеграция с Telegram

**Функциональность:**
- ✅ `createNotification()` - создание in-app уведомления
- ✅ `notifyCounterparty()` - уведомление контрагента в сделке
- ✅ Поддержка различных типов сделок (buyer-to-lgdeal, lgdeal-to-seller, обычные)
- ✅ WebSocket для real-time обновлений
- ✅ TTL индекс (автоудаление через 30 дней)

### 2. Уведомления для участников сделок (Buyer ↔ Seller)

#### ✅ Реализованные команды с уведомлениями:

1. **approveRequestCommand** ✅
   - Уведомляет: **Buyer**
   - Тип: `request_approved`
   - Сообщение: "Your request for deal #X has been approved by the seller"

2. **rejectRequestCommand** ✅
   - Уведомляет: **Buyer**
   - Тип: `request_rejected`
   - Сообщение: "Your request for deal #X has been rejected"

3. **uploadInvoiceCommand** ✅
   - Уведомляет: **Buyer**
   - Тип: `invoice_uploaded`
   - Сообщение: "The seller has uploaded an invoice for deal #X"

4. **acceptInvoiceCommand** ✅
   - Уведомляет: **Seller**
   - Тип: `invoice_accepted`
   - Сообщение: "The buyer has accepted the invoice for deal #X"

5. **rejectInvoiceCommand** ✅
   - Уведомляет: **Seller**
   - Тип: `invoice_rejected`
   - Сообщение: "The buyer has rejected the invoice for deal #X"

6. **confirmPaymentCommand** ✅
   - Уведомляет: **Buyer** (контрагент продавца)
   - Тип: `payment_confirmed`
   - Сообщение: "Payment has been confirmed for deal #X"

7. **addTrackingNumberCommand** ✅
   - Уведомляет: **Buyer**
   - Тип: `order_shipped`
   - Сообщение: "Your order (deal #X) has been shipped"

8. **confirmDeliveryCommand** ✅
   - Уведомляет: **Seller**
   - Тип: `delivery_confirmed`
   - Сообщение: "The buyer has confirmed delivery for deal #X"

9. **SelectAlternativeProductCommand** ✅
   - Уведомляет: **Buyer**
   - Тип: `alternative_proposed`
   - Сообщение: "An alternative product has been proposed for deal #X"

10. **AcceptAlternativeProductCommand** ✅
    - Уведомляет: **Seller/LGDEAL**
    - Тип: `alternative_accepted`
    - Сообщение: "The buyer has accepted the alternative product"

11. **RejectAlternativeProductCommand** ✅
    - Уведомляет: **Seller/LGDEAL**
    - Тип: `alternative_rejected`
    - Сообщение: "The buyer has rejected the alternative product"

### 3. Уведомления для внутренних ролей (LGDEAL Workflow)

1. **AssignToManagerCommand** ✅
   - Уведомляет: **Manager**
   - Тип: `deal_assigned`
   - Telegram: отправляется отдельно

2. **ReassignManagerCommand** ✅
   - Уведомляет: **Old Manager** и **New Manager**
   - Тип: `deal_reassigned` и `deal_assigned`

3. **AssignToLogistCommand** ✅
   - Уведомляет: **Logist**
   - Тип: `ready_for_shipping`
   - Telegram: отправляется отдельно

4. **RejectQualityCommand** ✅
   - Уведомляет: **Supervisors** — сделка возвращена на Request, выбрать альтернативу (тип: `quality_rejected`)
   - При выборе альтернативы супервайзером (**SelectAlternativeProductCommand** при статусе `quality_rejected`) уведомляет **покупателя**: оплата получена, выбран альтернативный продукт (тип: `quality_rejected_alternative_selected`)

---

## ❌ Чего не хватает

### 1. Критичные отсутствующие уведомления

#### 1.1. **ApproveQualityCommand** - нет уведомления покупателю
**Проблема:** Когда Manager одобряет качество камня, покупатель не получает уведомление.

**Что нужно добавить:**
```typescript
// В ApproveQualityCommand после одобрения качества
await notificationService.notifyCounterparty(
    deal,
    req.user!.userId,
    'quality_approved',
    'Quality Approved',
    `The quality check for deal #${deal.dealNumber} has been approved. Your order is ready for shipping.`,
    'high'
);
```

**Приоритет:** 🔴 **ВЫСОКИЙ** - покупатель должен знать, что его заказ прошел проверку качества

---

#### 1.2. **StoneReceivedCommand** - нет уведомления покупателю
**Проблема:** Когда Manager получает камень от поставщика, покупатель не уведомляется.

**Что нужно добавить:**
```typescript
// В StoneReceivedCommand после получения камня
await notificationService.notifyCounterparty(
    deal,
    req.user!.userId,
    'stone_received',
    'Stone Received',
    `The stone for deal #${deal.dealNumber} has been received. Quality check is in progress.`,
    'medium'
);
```

**Приоритет:** 🟡 **СРЕДНИЙ** - покупатель должен знать, что камень получен и проверяется

---

#### 1.3. **cancelDealCommand** - нет уведомления контрагенту
**Проблема:** При отмене сделки контрагент не получает уведомление.

**Что нужно добавить:**
```typescript
// В cancelDealCommand после отмены
await notificationService.notifyCounterparty(
    deal,
    req.user!.userId,
    'deal_cancelled', // НОВЫЙ ТИП - нужно добавить в NotificationType
    'Deal Cancelled',
    `Deal #${deal.dealNumber} has been cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    'high'
);
```

**Приоритет:** 🔴 **ВЫСОКИЙ** - контрагент должен быть уведомлен об отмене

**Дополнительно:** Нужно добавить тип `deal_cancelled` в `NotificationType`

---

#### 1.4. **SetShippingCostCommand** - нет уведомления покупателю
**Проблема:** Когда продавец устанавливает/изменяет стоимость доставки, покупатель не уведомляется.

**Что нужно добавить:**
```typescript
// В SetShippingCostCommand после установки стоимости доставки
await notificationService.notifyCounterparty(
    deal,
    req.user!.userId,
    'shipping_cost_updated', // НОВЫЙ ТИП - нужно добавить в NotificationType
    'Shipping Cost Updated',
    `Shipping cost for deal #${deal.dealNumber} has been ${oldCost > 0 ? 'updated' : 'set'} to $${shippingCost.toFixed(2)}.`,
    'medium'
);
```

**Приоритет:** 🟡 **СРЕДНИЙ** - покупатель должен знать об изменении стоимости доставки

**Дополнительно:** Нужно добавить тип `shipping_cost_updated` в `NotificationType`

---

#### 1.5. **Создание сделки (dealInitiationService)** - нет уведомления продавцу
**Проблема:** При создании новой сделки продавец не получает уведомление о новом запросе.

**Что нужно добавить:**
```typescript
// В dealInitiationService после создания buyer-to-lgdeal сделки
// Уведомляем всех продавцов, у которых есть товары в корзине

// Для lgdeal-to-seller сделок (запросы к поставщикам)
for (const sellerDeal of lgdealToSellerDeals) {
    if (sellerDeal.sellerId) {
        await notificationService.createNotification({
            userId: sellerDeal.sellerId,
            type: 'deal_created',
            title: 'New Deal Request',
            message: `You have received a new deal request #${sellerDeal.dealNumber}. Please review and respond.`,
            dealId: sellerDeal._id,
            dealNumber: sellerDeal.dealNumber,
            priority: 'high',
            actionUrl: `/deal/${sellerDeal._id}`,
            actionLabel: 'View Deal'
        });
    }
}
```

**Приоритет:** 🔴 **ВЫСОКИЙ** - продавец должен знать о новом запросе

---

### 2. Дополнительные улучшения

#### 2.1. Уведомление при изменении статуса сделки
**Проблема:** Некоторые изменения статуса не уведомляют контрагента.

**Решение:** Добавить уведомления в `dealService.ts` при изменении статуса через `updateDealStatus()`

---

#### 2.2. Уведомление при загрузке документов доставки
**Проблема:** Если есть отдельная команда для загрузки shipping documents, нужно проверить наличие уведомлений.

**Решение:** Проверить наличие команды и добавить уведомление покупателю.

---

#### 2.3. Уведомление при изменении условий сделки
**Проблема:** Если есть возможность изменить цену или условия после создания сделки, нужно уведомлять контрагента.

**Решение:** Добавить уведомления при изменении `negotiationDetails` или `amount`.

---

## 📋 План действий

### Приоритет 1 (Критично) 🔴
1. ✅ Добавить уведомление в `ApproveQualityCommand` - покупателю
2. ✅ Добавить уведомление в `cancelDealCommand` - контрагенту
3. ✅ Добавить уведомление при создании сделки - продавцам
4. ✅ Добавить тип `deal_cancelled` в `NotificationType`

### Приоритет 2 (Важно) 🟡
5. ✅ Добавить уведомление в `StoneReceivedCommand` - покупателю
6. ✅ Добавить уведомление в `SetShippingCostCommand` - покупателю
7. ✅ Добавить тип `shipping_cost_updated` в `NotificationType`

### Приоритет 3 (Улучшения) 🟢
8. Проверить и добавить уведомления при изменении статуса через `dealService`
9. Проверить уведомления при загрузке shipping documents
10. Добавить уведомления при изменении условий сделки

---

## 📝 Новые типы уведомлений для добавления

В `server/src/models/Notification.ts` нужно добавить:

```typescript
export type NotificationType =
  // ... существующие типы ...
  | 'deal_cancelled'        // НОВЫЙ - при отмене сделки
  | 'shipping_cost_updated' // НОВЫЙ - при изменении стоимости доставки
```

И в enum схемы:
```typescript
enum: [
  // ... существующие ...
  'deal_cancelled',
  'shipping_cost_updated'
]
```

И в emoji map в `notificationService.ts`:
```typescript
'deal_cancelled': '❌',
'shipping_cost_updated': '📦',
```

---

## 🔍 Дополнительные проверки

1. **Проверить все команды в `server/src/controllers/deal/actions/`:**
   - Убедиться, что каждая команда, которая влияет на контрагента, отправляет уведомление
   - Проверить, что уведомления отправляются и покупателю, и продавцу где необходимо

2. **Проверить синхронизацию статусов:**
   - При синхронизации статусов между buyer-to-lgdeal и lgdeal-to-seller сделками
   - Убедиться, что уведомления отправляются всем заинтересованным сторонам

3. **Проверить WebSocket:**
   - Убедиться, что все уведомления отправляются через WebSocket для real-time обновлений

4. **Проверить Telegram:**
   - Убедиться, что важные уведомления также отправляются в Telegram канал

---

## 📊 Статистика покрытия

- **Всего команд действий:** 19
- **Команд с уведомлениями:** 11 (58%)
- **Команд без уведомлений:** 8 (42%)
  - ApproveQualityCommand ❌
  - StoneReceivedCommand ❌
  - cancelDealCommand ❌
  - SetShippingCostCommand ❌
  - Создание сделки ❌
  - (и другие, если есть)

---

## ✅ Заключение

Система уведомлений в целом реализована хорошо, но есть несколько критичных пробелов:

1. **Отсутствуют уведомления покупателю** при важных событиях (одобрение качества, получение камня)
2. **Отсутствует уведомление контрагенту** при отмене сделки
3. **Отсутствует уведомление продавцу** при создании новой сделки
4. **Отсутствует уведомление** при изменении стоимости доставки

Рекомендуется добавить эти уведомления для полного покрытия всех важных событий в жизненном цикле сделки.
