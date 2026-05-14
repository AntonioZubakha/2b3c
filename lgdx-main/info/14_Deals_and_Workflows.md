## Сделки: типы, флоу, действия и API

Документ описывает домен сделок в LGDX: модель данных, типы сделок, стадии и статусы, допустимые переходы, действия (command pattern), связи между сделками и релевантные эндпоинты/роли.

**Обновлено:** 29 января 2026 (проверка по коду: роли Manager/Logist, productSnapshot)

---

### Модель данных (сервер)
- Модель: `server/src/models/Deal.ts` (Mongoose)
- Тип: `IDeal` в `server/src/types/index.ts`

Ключевые поля:
- Идентификаторы: `dealNumber` (уник.), `_id`
- Участники и компании:
  - `buyerId`, `sellerId` (ссылки на `User`)
  - `buyerCompanyId`, `sellerCompanyId` (ссылки на `Company`)
- Финансы: `amount` (итоговая сумма), `fee`, `currency?`
- Состав: `products: IDealProduct[]`
- Тип: `dealType: 'buyer-to-lgdeal' | 'lgdeal-to-seller'`
- Жизненный цикл:
  - `stage: 'request' | 'payment_delivery' | 'completed' | 'cancelled'`
  - `status` (см. ниже)
  - `lastActionAt`, `completedAt`, `cancellationReason?`
- Переговоры: `negotiationDetails`
- Платёж: `paymentDetails` (инвойс, метод, статус, Stripe‑поля, история отклонённых инвойсов)
- Доставка: `shippingDetails` (адрес, стоимость, трекинг, доставка)
- Документы: `shippingDocuments[]`, `invoiceUrl?`
- Активность: `activityLog[]` (время, действие, кто, детали)
- Связи/каскад: `pairedDealId?`, `pairedDealIds?`, `activePurchaseDealId?`
- Для UI: `allowedActions?`, `dashboardDealType?`, `linkedToDealNumber?`

**LGDEAL Internal Workflow поля (новые):**
- `assignedTo?: ObjectId | User` — Manager или Logist, которому назначена сделка
- `assignedRole?: 'manager' | 'logist'` — Роль назначенного пользователя
- `assignedAt?: Date` — Дата назначения
- `assignedBy?: ObjectId | User` — Кто назначил (обычно Supervisor)
- `assignmentHistory?: Array<{...}>` — История назначений с полями:
  - `assignedTo`, `assignedRole`, `assignedBy`, `assignedAt`
  - `reassignmentReason?` — Причина переназначения
  - `autoAssigned?: boolean` — Флаг автоматического назначения (при отклонении качества)
  - `autoAssignmentReason?` — Причина автоназначения

Элемент сделки (`IDealProduct`): `product` (ссылка на Product), `productSnapshot?` (снапшот полей для отображения: shape, carat, color, clarity, certificateNumber, certificateInstitute, location — используется, если продукт удалён из каталога), `price`, `quantity?`, `marketPriceAtInitiation?`, альтернативы (`suggestedAlternatives[]`, `selectedAlternativeProduct?`), флаги и снапшоты оригинала (`originalProductDetailsBeforeSwap?`).

---

### Типы сделок
- `buyer-to-lgdeal`: клиент покупает у LGDEAL (LGDEAL как продавец).
- `lgdeal-to-seller`: LGDEAL закупает у поставщика (LGDEAL как покупатель). Может быть связан с основной продажей клиенту (первичный или альтернативный поставщик).

---

### Стадии и статусы

**Стадии (`DealStage`):** `request` (запрос/одобрение/альтернативы), `payment_delivery` (инвойс/оплата/доставка), `completed`, `cancelled`.

**Статусы (`DealStatus`):**

**Общие терминальные:** `completed`, `cancelled`, `rejected`

**На стадии `request`:**
- `pending` (→ `rejected` или → `awaiting_invoice` после `approve_request`)

**Основной поток оплаты/доставки:**
- `awaiting_invoice` → `invoice_pending` → (`invoice_accepted` →) `awaiting_payment` → `payment_received` → (`awaiting_shipping_documents` → `shipping_documents_uploaded` →) `shipped` → (`delivery_confirmed` →) `completed`

**Особые статусы:**
- `alternative_product_proposed` (когда предложен альтернативный товар)

**LGDEAL Internal Workflow статусы (новые):**
- `assigned_to_manager` — Сделка назначена Manager'у после подтверждения поставщиком
- `quality_check_in_progress` — Manager получил камень и проверяет качество
- `quality_approved` — Manager одобрил качество камня
- `quality_rejected` — Manager отклонил качество; сделка возвращена на стадию Request для выбора альтернативы супервайзером (оплата от покупателя уже получена)
- `ready_for_shipping` — Камень готов к отгрузке, назначен Logist'у

**Переходы статусов для LGDEAL workflow:**

**Важно:** Оплата происходит ДО проверки качества!

1. Поставщик подтверждает наличие (`approve_request`) → `lgdeal-to-seller`: `pending` → `awaiting_invoice`
2. **ОПЛАТА ОТ ПОКУПАТЕЛЯ** (`confirm_payment` на `buyer-to-lgdeal`) → `payment_received`
   - Статус синхронизируется с связанными `lgdeal-to-seller` сделками
   - Если `lgdeal-to-seller` сделка еще в стадии `request`, она переводится в `payment_delivery`
3. Supervisor назначает Manager'у (`assign_to_manager`) → `assigned_to_manager`
   - **Автоматический выбор источника:** Если `activePurchaseDealId` не установлен, автоматически выбирается первая подтвержденная lgdeal-to-seller сделка (основной камень)
   - **Ручной выбор альтернативы:** Supervisor может выбрать другую lgdeal-to-seller через `select_alternative_product` на REQUEST stage
   - **Direct deals:** Для сделок без lgdeal-to-seller (камень уже у LGDEAL) источник не требуется
4. Manager получает камень (`stone_received`) → `quality_check_in_progress`
5. Manager одобряет качество (`approve_quality`) → `quality_approved`
6. Manager назначает Logist'у (`assign_to_logist`) → `ready_for_shipping`
7. Logist добавляет tracking (`add_tracking_number`) → `shipped`
   - Tracking number синхронизируется с `buyer-to-lgdeal` сделкой
   - **НЕ синхронизируется** стоимость доставки (она устанавливается отдельно на `buyer-to-lgdeal`)
8. Buyer подтверждает доставку (`confirm_delivery` на `buyer-to-lgdeal`) → `delivery_confirmed` → `completed`

**При отклонении качества:**
- Manager отклоняет (`reject_quality`) → сделка **возвращается на стадию Request** (`stage: request`, `status: quality_rejected`), назначение сбрасывается, `activePurchaseDealId` сбрасывается. Оплата от покупателя уже в казну LGDEAL — сделка не отменяется, связанные lgdeal-to-seller не трогаются.
- Supervisor получает уведомление и **вручную** выбирает альтернативный продукт (`select_alternative_product`). Продукт, не прошедший проверку качества, нельзя снова выбрать.
- После выбора альтернативы Supervisor назначает Manager'у (`assign_to_manager`) → сделка переходит в `payment_delivery` / `assigned_to_manager`.
- Покупателю отображается, что оплата получена и выбирается альтернативный продукт после отклонения качества.

Допустимые переходы задаются в `controllers/deal/helpers.ts`:
- Переходы стадий: `request → payment_delivery → completed`; `cancelled` — терминальная; при Reject Quality допускается `payment_delivery → request`.
- Переходы статусов зависят от стадии (см. `validTransitions`), в т.ч. `quality_check_in_progress → quality_rejected` и `request`/`quality_rejected → assigned_to_manager`.

---

### Роли и права

**Определение роли (`determineUserRole`):** по пользователю/компании и типу сделки; супервизор LGDEAL может быть `LGDEAL buyer/seller/dual-role` в зависимости от контекста. Роль определяет разрешённые действия (`getAllowedActions`).

**Типы ролей (`UserRole`):**
- `'buyer'` — обычный покупатель
- `'seller'` — обычный продавец
- `'LGDEAL buyer'` — LGDEAL как покупатель (в `lgdeal-to-seller` сделках)
- `'LGDEAL seller'` — LGDEAL как продавец (в `buyer-to-lgdeal` сделках)
- `'LGDEAL dual-role'` — LGDEAL supervisor в прямых сделках
- **`'LGDEAL manager'`** (новое) — Manager LGDeal INC, видит только назначенные ему сделки
- **`'LGDEAL logist'`** (новое) — Logist LGDeal INC, видит только назначенные ему сделки на отгрузку

**Логика доступа для LGDEAL Internal Workflow:**

1. **Supervisor LGDeal INC:**
   - Видит **ВСЕ** сделки LGDeal INC (как `buyer-to-lgdeal`, так и `lgdeal-to-seller`)
   - Может назначать сделки Manager'ам (`assign_to_manager`)
   - Может переназначать между Manager'ами (`reassign_manager`)
   - Имеет полный доступ для контроля

2. **Manager LGDeal INC:**
   - Видит **ТОЛЬКО** сделки где `assignedTo === userId && assignedRole === 'manager' && dealType === 'buyer-to-lgdeal'`
   - Работает **ТОЛЬКО** со сделками типа `buyer-to-lgdeal` (продажи покупателям)
   - Проверяет продукт для покупателей
   - Может отмечать получение камня (`stone_received`) при статусе `assigned_to_manager`
   - Может одобрить качество (`approve_quality`) при статусе `quality_check_in_progress`
   - Может отклонить качество (`reject_quality`) при статусе `quality_check_in_progress` → сделка возвращается на Request, супервайзер выбирает альтернативу
   - Может назначить Logist'у (`assign_to_logist`) при статусе `quality_approved`

3. **Logist LGDeal INC:**
   - Видит **ТОЛЬКО** сделки где `assignedTo === userId && assignedRole === 'logist' && dealType === 'buyer-to-lgdeal'`
   - Работает **ТОЛЬКО** со сделками типа `buyer-to-lgdeal` (продажи покупателям)
   - Организует доставку покупателям
   - Может добавлять tracking number (`add_tracking_number`) при статусе `ready_for_shipping`
   - Работает со статусами: `ready_for_shipping`, `shipped`
   - **НЕ подтверждает доставку** - это делает покупатель на `buyer-to-lgdeal` сделке

**Обзор разрешённых действий (зависит от `stage`/`status`/роли):**

**Общие (для buyer/seller):**
- `cancel_deal`

**Request (seller/LGDEAL seller):**
- `approve_request`, `reject_request`, `set_shipping_cost`

**Request (LGDEAL seller):**
- `select_alternative_product` (при статусе `pending` или `quality_rejected`; при `quality_rejected` нельзя повторно выбрать продукт, не прошедший проверку качества)

**При `alternative_product_proposed`:**
- Покупатель: `accept_alternative_product`, `reject_alternative_product`
- Сторона продавца: `set_shipping_cost`

**Payment/Delivery (seller/LGDEAL seller):**
- `upload_invoice` (awaiting_invoice)
- `confirm_payment` (awaiting_payment)
- `add_tracking_number` (payment_received)

**Payment/Delivery (buyer/LGDEAL buyer):**
- `accept_invoice`/`reject_invoice` (invoice_pending; кроме загрузившей стороны)
- `confirm_delivery` (shipped)

**LGDEAL Internal Workflow действия (новые):**

**Для Supervisor:**
- `assign_to_manager` — Назначить сделку Manager'у (на **buyer-to-lgdeal**; при статусе `payment_received` или `quality_rejected`; при `quality_rejected` сначала требуется выбрать альтернативу)
- `reassign_manager` — Переназначить сделку другому Manager'у (показывать только если >1 manager в компании)

**Для Manager:**
- `stone_received` — Отметить получение камня от поставщика
- `approve_quality` — Одобрить качество камня
- `reject_quality` — Отклонить качество (с указанием причины) → возврат сделки на Request, супервайзер выбирает альтернативу
- `assign_to_logist` — Назначить Logist'у для отгрузки

**Для Logist:**
- `add_tracking_number` — Добавить номер отслеживания
- Стандартные действия для доставки

**На любой стадии:**
- `download_invoice` (если есть инвойс)

---

### Действия (Command Pattern)

Единая точка: `POST /api/deal/:dealId/action/:actionName`

**Существующие команды:**
- approve/reject request, cancel deal, upload/accept/reject invoice, confirm payment, add tracking, confirm delivery, select/accept/reject alternative product, set shipping cost

**LGDEAL Internal Workflow команды (новые):**
- `AssignToManagerCommand` — Supervisor назначает Manager'у
- `ReassignManagerCommand` — Supervisor переназначает между Manager'ами
- `StoneReceivedCommand` — Manager отмечает получение камня
- `ApproveQualityCommand` — Manager одобряет качество
- `RejectQualityCommand` — Manager отклоняет качество; сделка возвращается на Request (`quality_rejected`), супервайзер вручную выбирает альтернативу (оплата уже получена)
- `AssignToLogistCommand` — Manager назначает Logist'у

**Оптимистическая блокировка:** запись с проверкой исходных `status` и `stage`

**Логи активности и уведомления:**
- Telegram уведомления (через Deal Event Bot в канал "LGDEAL Workflow")
- In-app уведомления (модель `Notification` с TTL индексом)

---

### Получение сделок и состояние

**Маршруты (`server/src/routes/deal.ts`):**

**Списки:**
- `GET /api/deal/buyer` — Сделки покупателя
  - Для обычных buyer: `buyerId === userId && dealType === 'buyer-to-lgdeal'`
  - Для LGDEAL Supervisor: все `lgdeal-to-seller` сделки LGDeal INC
- `GET /api/deal/seller` — Сделки продавца
  - Для обычных seller: `sellerId === userId || sellerCompanyId === companyId && dealType === 'lgdeal-to-seller'`
  - Для LGDEAL Supervisor: все `buyer-to-lgdeal` сделки LGDeal INC
  - **Для LGDEAL Manager:** только `assignedTo === userId && assignedRole === 'manager' && dealType === 'buyer-to-lgdeal'`
  - **Для LGDEAL Logist:** только `assignedTo === userId && assignedRole === 'logist' && dealType === 'buyer-to-lgdeal'`
- `GET /api/deal/supervisor-dashboard` (legacy: `/api/deal/dashboard`, `/api/deal/buyer-to-lgdeal`, `/api/deal/lgdeal-to-seller`)

**Детали:**
- `GET /api/deal/:dealId` — Детали сделки с проверкой доступа
- `GET /api/deal/:dealId/state` — Состояние сделки
- `GET /api/deal/:dealId/invoice/download` — Скачать инвойс

**Инициация:**
- `POST /api/deal/initiate-from-cart` — Создать сделку из корзины

**LGDEAL Helper endpoints (новые):**
- `GET /api/deal/lgdeal/managers` — Список Manager'ов LGDeal INC (для Supervisor)
- `GET /api/deal/lgdeal/managers/count` — Количество Manager'ов
- `GET /api/deal/lgdeal/logists` — Список Logist'ов LGDeal INC (для Supervisor/Manager)

---

### LGDEAL Internal Workflow

**Полная цепочка обработки сделки:**

```
1. BUYER СОЗДАЕТ ЗАКАЗ
   → buyer-to-lgdeal сделка: status='pending', stage='request'
   → 4x lgdeal-to-seller сделки: status='pending', stage='request'
     (main product + 3 alternatives от разных поставщиков)

2. ЭТАП REQUEST - ПЕРЕГОВОРЫ И ПОДТВЕРЖДЕНИЯ
   → LGDEAL ведет переговоры с поставщиками
   → Supplier A: approve_request ✅
      lgdeal-to-seller #200001: status → 'awaiting_invoice'
   → Supplier B: approve_request ✅
      lgdeal-to-seller #200002: status → 'awaiting_invoice'
   → Supplier C: reject_request ❌
      lgdeal-to-seller #200003: status → 'rejected'
   → Supplier D: pending ⏳ (еще не ответил)
   → Supervisor устанавливает стоимость доставки на buyer-to-lgdeal сделке
      (set_shipping_cost на этапе request)

3. ОПЛАТА ОТ ПОКУПАТЕЛЯ К LGDEAL 💰
   → Поставщик загружает инвойс → 'invoice_pending'
   → Покупатель принимает инвойс → 'awaiting_payment'
   → Покупатель оплачивает → 'payment_received' ✅
   → Статус синхронизируется с связанными lgdeal-to-seller сделками:
     • Если lgdeal-to-seller сделка в стадии request → переводится в payment_delivery
     • Статус обновляется на payment_received

4. SUPERVISOR НАЗНАЧАЕТ МЕНЕДЖЕРА (ПОСЛЕ ОПЛАТЫ)
   → Supervisor видит что оплата получена на buyer-to-lgdeal сделке
   → Может назначить manager'у:
     • На buyer-to-lgdeal сделке (команда найдет связанную lgdeal-to-seller)
     • Или напрямую на lgdeal-to-seller сделке
   → Выбирает лучший вариант (цена/сроки/поставщик)
   → Назначает lgdeal-to-seller #200001 Manager'у:
      assignedTo: managerId
      assignedRole: 'manager'
      status → 'assigned_to_manager'
   → Если lgdeal-to-seller сделка еще не синхронизирована:
     • Статус синхронизируется на payment_received
     • Stage переводится из request в payment_delivery (если нужно)
   → 📱 Telegram + 🔔 In-app уведомление Manager'у

5. MANAGER ОБРАБАТЫВАЕТ КАМЕНЬ
   → Видит ТОЛЬКО свои buyer-to-lgdeal сделки (assignedTo === userId)
   → Получает камень от поставщика (источник в activePurchaseDealId)
   → Нажимает "Stone Received"
      status → 'quality_check_in_progress'
   → Проверяет качество (вес, цвет, сертификат)

   ┌─ ЕСЛИ КАЧЕСТВО OK (99% случаев): ──────────────────┐
   │  → Нажимает "Quality Approved"                      │
   │     status → 'quality_approved'                     │
   │  → Назначает Logist'у:                              │
   │     assignedTo: logistId                            │
   │     assignedRole: 'logist'                          │
   │     status → 'ready_for_shipping'                   │
   │  → 📱 Уведомление Logist'у                         │
   └─────────────────────────────────────────────────────┘

   ┌─ ЕСЛИ КАЧЕСТВО НЕ OK (1% случаев): ────────────────┐
   │  → Нажимает "Reject Quality" (указывает причину)   │
   │  → Сделка возвращается на стадию Request:           │
   │     • stage → 'request', status → 'quality_rejected'│
   │     • assignedTo/assignedRole/activePurchaseDealId  │
   │       сбрасываются                                   │
   │     • Оплата от покупателя уже получена — сделка   │
   │       не отменяется, связанные сделки не трогаются  │
   │     • 📱 Уведомление Supervisor'ам: выбрать         │
   │       альтернативу                                   │
   │  → Supervisor вручную:                               │
   │     • Выбирает альтернативный продукт               │
   │       (select_alternative_product; тот же продукт,   │
   │       не прошедший проверку, выбрать нельзя)         │
   │     • Назначает Manager'у (assign_to_manager)       │
   │  → Покупателю отображается: оплата получена,         │
   │     выбирается альтернатива после отклонения качества│
   └─────────────────────────────────────────────────────┘

6. LOGIST ОБРАБАТЫВАЕТ ОТГРУЗКУ
   → Видит ТОЛЬКО свои buyer-to-lgdeal сделки (assignedTo === userId)
   → Организует доставку buyer'у
   → Добавляет tracking number напрямую на buyer-to-lgdeal
      status → 'shipped'
   → Стоимость доставки НЕ синхронизируется (устанавливается отдельно)

7. ПОКУПАТЕЛЬ ПОДТВЕРЖДАЕТ ДОСТАВКУ
   → Покупатель видит buyer-to-lgdeal сделку со статусом 'shipped'
   → Нажимает "Confirm Delivery"
      status → 'delivery_confirmed' → 'completed'
   → Сделка завершена
```

**Ключевые моменты:**
1. **"Подтверждение из Индии"** = `approve_request` от поставщика на `lgdeal-to-seller` сделке (статус → `awaiting_invoice`)
2. **💰 ОПЛАТА ПРОИСХОДИТ ДО ПРОВЕРКИ КАЧЕСТВА** - назначение manager'у возможно только после получения оплаты (`payment_received`)
3. **Назначение происходит на уровне `buyer-to-lgdeal` сделок** - Manager и Logist работают с продажами покупателям
4. **Синхронизация статусов** - при подтверждении оплаты на `buyer-to-lgdeal` сделке, статус автоматически синхронизируется с связанными `lgdeal-to-seller` сделками
5. **activePurchaseDealId** - хранит ссылку на текущий активный lgdeal-to-seller источник (поставщика)
6. **При отклонении качества** — сделка возвращается на Request (`quality_rejected`), супервайзер вручную выбирает альтернативу; продукт, не прошедший проверку, повторно выбрать нельзя
7. **Supervisor имеет полный контроль** и visibility всего pipeline
8. **Стоимость доставки** устанавливается супервайзером на `buyer-to-lgdeal` сделке на этапе реквеста
9. **Tracking number** добавляется напрямую на `buyer-to-lgdeal` сделке логистом

---

### Связи и каскад
- Связи через `pairedDealId`/`pairedDealIds` и ссылки на альтернативные товары формируют граф сделок.
- `cancelAllRelatedDeals` отменяет связанные незавершённые сделки (учитывает исключения для альтернативных поставщиков), `processProductsOnDealEnd` обновляет статус товаров (Sold/Available) при завершении/отмене.

---

### Платёж и документы
- `paymentDetails`: метод (`bank_transfer`/`stripe`), статус, идентификаторы транзакций, история отклонённых инвойсов, маркер компании‑загрузчика.
- В `invoice_pending` загрузившая сторона не может принять/отклонить свой инвойс.
- Доставочные документы/детали: трекинг и подтверждение доставки.

---

### Система уведомлений

**Модель Notification (`server/src/models/Notification.ts`):**
- `userId` — получатель уведомления
- `type` — тип: `deal_assigned`, `deal_reassigned`, `quality_rejected`, `quality_rejected_alternative_selected`, `ready_for_shipping`, `stone_received`, `quality_approved`, а также стандартные типы по сделкам (`alternative_proposed`, `payment_confirmed` и т.д.)
- `title`, `message` — текст уведомления
- `dealId`, `dealNumber` — связанная сделка
- `priority` — `low`, `medium`, `high`, `urgent`
- `read`, `readAt` — статус прочтения
- `actionUrl` — ссылка для перехода (например, `/deal/123456`)
- `expiresAt` — TTL индекс (автоматическое удаление через 30 дней)

**Каналы уведомлений:**
1. **Telegram** — через Deal Event Bot в приватный канал "LGDEAL Workflow"
2. **In-app** — через модель `Notification` с WebSocket для real-time обновлений

**API endpoints:**
- `GET /api/notifications` — получить уведомления пользователя
- `GET /api/notifications/unread` — непрочитанные уведомления
- `GET /api/notifications/unread-count` — количество непрочитанных
- `PUT /api/notifications/:id/read` — отметить как прочитанное
- `PUT /api/notifications/read-all` — отметить все как прочитанные
- `DELETE /api/notifications/:id` — удалить уведомление

---

### Клиентский UI

**Роуты:**
- `/my-deals` — Мои сделки (с фильтрацией для Manager/Logist)
- `/deal/:dealId` — Детали сделки
- **`/logist-dashboard`** (новое) — Dashboard для Logist'ов LGDeal INC
  - Табы: Ready for Shipping | In Progress | Shipped | Delivered
  - Фильтрация по статусам
  - Статистика по сделкам
  - Доступ: Logist (свои сделки) + Supervisor (все сделки для контроля)

**UI использует:**
- `dealState` и `allowedActions` для отображения шагов и доступных действий
- `NotificationBell` компонент в Header для in-app уведомлений
- `DealActionsPanel` с новыми кнопками для LGDEAL workflow действий

---

### Безопасность
- Все маршруты сделок защищены авторизацией; часть — только для супервизоров/админов.
- Сервер проверяет права и валидность переходов при выполнении действий.
- **Manager и Logist видят только назначенные им сделки** — строгая изоляция доступа.
- **Supervisor имеет полный доступ** ко всем сделкам LGDeal INC для контроля.

---

### Наблюдаемость
- Логи начала/конца действий, смен стадий/статусов, ошибки.
- Telegram‑уведомления о сменах по `sendDealChangeNotification`.
- **In-app уведомления** через модель `Notification` с WebSocket для real-time.
- **История назначений** в `assignmentHistory` для audit trail.

---

### Troubleshooting

**"Action is not allowed":**
- Недостаточно прав или некорректно для текущей стадии/статуса.
- Проверить `assignedTo` и `assignedRole` для Manager/Logist.

**"Optimistic lock failed":**
- Состояние изменилось параллельно — обновить и повторить.

**"Manager не видит сделку":**
- Проверить что `assignedTo === userId && assignedRole === 'manager'`
- Supervisor должен назначить сделку Manager'у

**"Logist не видит сделку":**
- Проверить что `assignedTo === userId && assignedRole === 'logist'`
- Manager должен назначить сделку Logist'у после одобрения качества

**Каскадная отмена:**
- Не применяется к альтернативным поставщикам — это ожидаемо.

**Автоматический переход на альтернативу:**
- Работает только если есть подтвержденные (`awaiting_invoice` или `approved`) альтернативные `lgdeal-to-seller` сделки
- Если альтернатив нет → уведомление Supervisor'у

---

### Шпаргалка по статусам

**Оплата/доставка:**
1) `awaiting_invoice` → `invoice_pending` → `invoice_accepted` → `awaiting_payment`
2) `awaiting_payment` → `payment_received` → `awaiting_shipping_documents` → `shipping_documents_uploaded` → `shipped` → `delivery_confirmed` → `completed`

**LGDEAL Internal Workflow:**
1) Поставщик подтверждает (`approve_request`) → `awaiting_invoice`
2) Supervisor назначает Manager'у → `assigned_to_manager`
3) Manager получает камень (`stone_received`) → `quality_check_in_progress`
4) Manager одобряет (`approve_quality`) → `quality_approved`
5) Manager назначает Logist'у (`assign_to_logist`) → `ready_for_shipping`
6) Logist добавляет tracking → `shipped`
7) Buyer подтверждает доставку → `delivery_confirmed` → `completed`

**Терминальные статусы:**
- `completed`, `cancelled`, `rejected` — в любой момент можно отменить (`cancelled`)

**Ветви могут сокращаться** в зависимости от данных/действий.

---

### Типичный флоу сделки простыми словами

**Сценарий:** клиент покупает камень у LGDEAL; LGDEAL закупает его у поставщика и отдаёт клиенту.

1. **Клиент оформил заказ**  
   В корзине нажал «Оформить сделку». Создалась одна сделка «клиент → LGDEAL» (buyer-to-lgdeal) и одна или несколько сделок «LGDEAL → поставщик» (lgdeal-to-seller). Все в стадии «запрос» (request), статус «ожидает» (pending).

2. **Поставщик подтверждает**  
   Поставщик в своей сделке lgdeal-to-seller нажимает «Подтвердить запрос». Его сделка переходит в стадию оплаты/доставки, статус «ожидаем инвойс» (awaiting_invoice). LGDEAL (супервайзер) может выставить стоимость доставки для клиента.

3. **Инвойс и оплата**  
   Поставщик загружает инвойс → статус «инвойс на проверке» (invoice_pending). LGDEAL (или клиент, в зависимости от процесса) принимает инвойс → «ожидаем оплату» (awaiting_payment). Кто-то со стороны LGDEAL нажимает «Подтвердить оплату» → статус «оплата получена» (payment_received). Оплата в системе считается полученной.

4. **Назначение менеджеру**  
   Супервайзер LGDEAL в сделке «клиент → LGDEAL» нажимает «Назначить менеджеру» и выбирает менеджера. Сделка получает статус «назначено менеджеру» (assigned_to_manager). Менеджер видит эту сделку в «Мои сделки».

5. **Камень у LGDEAL, проверка качества**  
   Менеджер получил камень от поставщика → нажимает «Камень получен» → статус «проверка качества» (quality_check_in_progress). Проверяет камень и нажимает «Качество одобрено» → статус «качество одобрено» (quality_approved). Если качество не устроило — «Отклонить качество»: сделка возвращается на стадию «запрос» (status: quality_rejected), супервайзер вручную выбирает альтернативный продукт и снова назначает менеджера; оплата от покупателя уже получена, она отображается покупателю.

6. **Назначение логисту и отгрузка**  
   Менеджер нажимает «Назначить логисту» → статус «готово к отгрузке» (ready_for_shipping). Логист видит сделку, организует доставку клиенту и вносит трекинг-номер → статус «отправлено» (shipped).

7. **Клиент подтвердил доставку**  
   Клиент в своей сделке (buyer-to-lgdeal) нажимает «Подтвердить доставку» → статус «доставка подтверждена» (delivery_confirmed), затем сделка переходит в «завершена» (completed). На этом типичный флоу заканчивается.

**Кратко:** запрос → поставщик подтвердил → инвойс и оплата → назначение менеджеру → камень получен и проверен → назначение логисту → трекинг → клиент подтвердил доставку → сделка завершена.

---

### Связанные документы
- `35_LGDEAL_Internal_Workflow_Patch.md` — Детальный план реализации патча
- `12_API_Reference.md` — API документация
- `04_Environment_Variables.md` — Переменные окружения (Telegram bots)
- `16_Chat_Support_System.md` — Chat Support System
