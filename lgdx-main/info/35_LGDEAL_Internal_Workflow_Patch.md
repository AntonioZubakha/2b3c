# LGDeal INC Internal Workflow System — Technical Design Document

> **Статус: НЕ РЕАЛИЗОВАНО.** Это проектный документ (planning phase). В коде описанные роли логиста, поля `assignedTo/assignedRole` в Deal и новые статусы (`quality_check_in_progress` и т.д.) **не реализованы**.  
> Текущая реализация ролей: `server/src/models/User.ts` — `admin | supervisor | manager | buyer | logist`.  
> Фаза: 📝 Planning

**Дата составления:** 15 января 2026  

---

## 📋 EXECUTIVE SUMMARY

Новая система внутреннего workflow для компании LGDeal INC с тремя ролями и цепочкой передачи сделок от Supervisor → Manager → Logist.

### **✅ Подтвержденные требования:**
1. ✅ Manager может отклонить камень (99% случаев OK, но возможность нужна)
2. ✅ При отклонении → автоматический переход на альтернативу
3. ✅ Отдельная страница `/logist-dashboard` (доступ: Logist + Supervisor)
4. ✅ Переназначение manager'ов (показывать только если >1 manager)
5. ✅ Уведомления: Telegram + In-app notifications

---

## 🎯 ЦЕЛИ ПАТЧА

### **Проблема:**
В текущей системе все сотрудники LGDeal INC (supervisor, manager) видят **ВСЕ** сделки одновременно. Нет разделения ответственности и контроля за этапами обработки заказа.

### **Решение:**
Создать систему назначения сделок с четкими ролями и правами доступа:
1. **Supervisor** → Получает все новые сделки, назначает Manager'у после подтверждения из Индии
2. **Manager** → Получает камень, проверяет качество, передает Logist'у
3. **Logist** (новая роль) → Обрабатывает отгрузку и доставку

---

## 🔍 АНАЛИЗ ТЕКУЩЕЙ СИСТЕМЫ

### **1. Текущие роли пользователей:**
```typescript
// server/src/models/User.ts
role: 'admin' | 'supervisor' | 'manager' | 'buyer'
```

**Проблема:** Роль `'logist'` отсутствует ❌

---

### **2. Текущие роли в сделках (UserRole):**
```typescript
// server/src/controllers/deal/helpers.ts:11
export type UserRole = 
  | 'buyer' 
  | 'seller' 
  | 'LGDEAL buyer' 
  | 'LGDEAL seller' 
  | 'LGDEAL dual-role' 
  | null;
```

**Анализ:**
- ✅ `isLgdealSupervisor` определяет supervisor'ов LGDeal INC автоматически
- ✅ Существует логика определения роли через `determineUserRole()`
- ❌ Нет различия между manager и supervisor внутри LGDEAL
- ❌ Нет роли для логиста

---

### **3. Текущая структура Deal:**
```typescript
// server/src/models/Deal.ts
{
  dealNumber: String,
  status: String,      // 'pending', 'approved', 'awaiting_invoice', etc.
  stage: String,       // 'request', 'payment_delivery', 'completed', 'cancelled'
  dealType: String,    // 'buyer-to-lgdeal', 'lgdeal-to-seller'
  
  buyerId: ObjectId,
  sellerId: ObjectId,
  buyerCompanyId: ObjectId,
  sellerCompanyId: ObjectId,
  
  products: [DealProduct],
  shippingDetails: ShippingDetails,
  activityLog: [ActivityLog],
  
  // ❌ НЕТ: assignedTo, assignedRole, internalStatus
}
```

**Проблема:** Нет поля для назначения сделки конкретному сотруднику ❌

---

### **4. Текущие статусы (DEAL_STATUSES):**
```typescript
// server/src/types/constants.ts
PENDING = 'pending'
APPROVED = 'approved'
AWAITING_INVOICE = 'awaiting_invoice'
INVOICE_PENDING = 'invoice_pending'
AWAITING_PAYMENT = 'awaiting_payment'
PAYMENT_RECEIVED = 'payment_received'
SHIPPED = 'shipped'
DELIVERED = 'delivered'
COMPLETED = 'completed'
CANCELLED = 'cancelled'
// ... и другие
```

**Анализ:**
- ✅ Достаточно статусов для workflow
- ❌ Нет статусов для внутренних этапов LGDEAL:
  - Подтверждение из Индии
  - Проверка качества менеджером
  - Готов к отгрузке

---

### **5. Текущая логика доступа:**
```typescript
// server/src/controllers/deal/retrievalController.ts

// Supervisor LGDeal INC видит ВСЕ сделки компании LGDEAL
if (isLgdealSupervisor && !req.user.isImpersonation) {
  const lgdealCompany = await Company.findOne({
    name: 'LGDeal INC'
  });
  
  // Возвращаем все сделки где LGDEAL - buyer или seller
  const deals = await Deal.find({
    $or: [
      { buyerCompanyId: lgdealCompany._id },
      { sellerCompanyId: lgdealCompany._id }
    ]
  });
}
```

**Проблема:** Все сотрудники LGDEAL с `isLgdealSupervisor=true` видят все сделки ❌

---

## 🎨 УТВЕРЖДЕННЫЙ WORKFLOW (С УТОЧНЕНИЯМИ)

### **Полная цепочка обработки сделки:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. BUYER СОЗДАЕТ ЗАКАЗ                                          │
│    → buyer-to-lgdeal сделка: status='pending'                   │
│    → 4x lgdeal-to-seller сделки: status='pending'               │
│      (main product + 3 alternatives от разных поставщиков)       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. ЭТАП REQUEST - ПЕРЕГОВОРЫ С ПОСТАВЩИКАМИ                    │
│    → LGDEAL ведет переговоры с продавцами                        │
│    → Приоритетно с продавцом запрошенного продукта               │
│    → Supplier A: approve_request ✅                             │
│       lgdeal-to-seller #200001: status → 'awaiting_invoice'     │
│    → Supplier B: approve_request ✅                             │
│       lgdeal-to-seller #200002: status → 'awaiting_invoice'     │
│    → Supplier C: reject_request ❌                              │
│       lgdeal-to-seller #200003: status → 'rejected'             │
│    → Если основной товар не подтвержден:                         │
│       • Заменяем на альтернативу                                 │
│       • Покупатель должен подтвердить альтернативу              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ОПЛАТА ОТ ПОКУПАТЕЛЯ К LGDEAL 💰                             │
│    → Поставщик загружает инвойс → 'invoice_pending'            │
│    → Покупатель принимает инвойс → 'awaiting_payment'           │
│    → Покупатель оплачивает → 'payment_received' ✅              │
│    → 💰 ОПЛАТА ПРОИСХОДИТ ЗДЕСЬ (ДО проверки качества!)        │
│    → Статус синхронизируется с связанными lgdeal-to-seller      │
│      сделками (если они еще в стадии request, переводятся      │
│      в payment_delivery)                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SUPERVISOR НАЗНАЧАЕТ МЕНЕДЖЕРА (ПОСЛЕ ОПЛАТЫ)                │
│    → Supervisor видит что оплата получена на buyer-to-lgdeal    │
│    → Открывает модальное окно "Assign to Manager"               │
│    → Выбирает Manager'а из списка активных LGDEAL менеджеров    │
│    → Нажимает "Assign Deal"                                      │
│    → Backend автоматически определяет тип сделки:                │
│                                                                  │
│    **Если есть lgdeal-to-seller сделки (buyer→LGDEAL→sellers):**│
│    → Если activePurchaseDealId НЕ установлен (обычный случай):  │
│      • Автоматически выбирает первую подтвержденную             │
│        lgdeal-to-seller сделку (основной камень)                │
│      • Устанавливает activePurchaseDealId                        │
│    → Если Supervisor выбрал альтернативу вручную:                │
│      • Использует уже установленный activePurchaseDealId         │
│    → Валидация что supplier deal подтвержден                     │
│                                                                  │
│    **Если direct deal (buyer→LGDEAL, камень уже у LGDEAL):**    │
│    → activePurchaseDealId не требуется                           │
│    → Назначение без дополнительных проверок                      │
│                                                                  │
│    → Назначает buyer-to-lgdeal сделку Manager'у:                │
│       assignedTo: managerId                                      │
│       assignedRole: 'manager'                                    │
│       status → 'assigned_to_manager'                            │
│    → 📱 Telegram + 🔔 In-app уведомление Manager'у             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. MANAGER ПРОВЕРЯЕТ КАЧЕСТВО КАМНЯ                             │
│    → Видит ТОЛЬКО свои buyer-to-lgdeal сделки (assignedTo)     │
│    → Получает камень от поставщика (источник в                  │
│       activePurchaseDealId)                                      │
│    → Нажимает "Stone Received"                                   │
│       status → 'quality_check_in_progress'                       │
│    → Проверяет качество (вес, цвет, сертификат)                │
│                                                                  │
│    ┌─ ЕСЛИ КАЧЕСТВО OK (99% случаев): ──────────────────┐      │
│    │  → Нажимает "Quality Approved"                      │      │
│    │     status → 'quality_approved'                     │      │
│    │  → Назначает Logist'у:                              │      │
│    │     assignedTo: logistId                            │      │
│    │     assignedRole: 'logist'                          │      │
│    │     status → 'ready_for_shipping'                   │      │
│    │  → 📱 Уведомление Logist'у                         │      │
│    └─────────────────────────────────────────────────────┘      │
│                                                                  │
│    ┌─ ЕСЛИ КАЧЕСТВО НЕ OK (1% случаев): ────────────────┐      │
│    │  → Нажимает "Reject Quality" (указывает причину)   │      │
│    │  → Сделка возвращается на Request:                  │      │
│    │     • stage → 'request', status → 'quality_rejected'│     │
│    │     • assignedTo/assignedRole/activePurchaseDealId  │      │
│    │       сбрасываются; оплата от покупателя уже в      │      │
│    │       казну — сделка не отменяется                  │      │
│    │     • 📱 Уведомление Supervisor'ам: выбрать         │      │
│    │       альтернативу                                   │      │
│    │  → Supervisor вручную выбирает альтернативный       │      │
│    │     продукт (select_alternative_product; тот же      │      │
│    │     продукт, не прошедший проверку, выбрать нельзя),│      │
│    │     затем назначает Manager'у (assign_to_manager)   │      │
│    │  → Покупателю: отображается оплата получена,        │      │
│    │     выбирается альтернатива                          │      │
│    └─────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. LOGIST ОБРАБАТЫВАЕТ ОТГРУЗКУ                                  │
│    → Видит ТОЛЬКО свои buyer-to-lgdeal сделки                   │
│      (assignedTo === userId && assignedRole === 'logist')      │
│    → Организует доставку buyer'у                                 │
│    → Добавляет tracking number напрямую на buyer-to-lgdeal      │
│       status → 'shipped'                                         │
│    → Стоимость доставки НЕ синхронизируется                      │
│                                                                  │
│ 7. ПОКУПАТЕЛЬ ПОДТВЕРЖДАЕТ ДОСТАВКУ                              │
│    → Покупатель видит buyer-to-lgdeal сделку со статусом        │
│      'shipped'                                                   │
│    → Нажимает "Confirm Delivery"                                │
│       status → 'delivery_confirmed' → 'completed'               │
│    → Сделка завершена                                            │
└─────────────────────────────────────────────────────────────────┘
```

### **🔑 Ключевые моменты:**

1. **"Подтверждение из Индии"** = `approve_request` от поставщика на `lgdeal-to-seller` сделке (статус → `awaiting_invoice`)
2. **💰 ОПЛАТА ОБЯЗАТЕЛЬНО ПЕРЕД ПРОВЕРКОЙ КАЧЕСТВА** - назначение менеджеру происходит только после получения оплаты (`payment_received`)
3. **Назначение происходит на уровне `buyer-to-lgdeal` сделок** - Manager и Logist работают с продажами покупателям
4. **activePurchaseDealId** - хранит ссылку на текущий активный lgdeal-to-seller источник (поставщика)
5. **При отклонении качества** — сделка возвращается на Request (`quality_rejected`), супервайзер вручную выбирает альтернативу; продукт, не прошедший проверку, повторно выбрать нельзя; оплата от покупателя уже получена
6. **Supervisor имеет полный контроль** и visibility всего pipeline
7. **Стоимость доставки** устанавливается супервайзером на `buyer-to-lgdeal` сделке на этапе реквеста
8. **Manager и Logist работают ТОЛЬКО со сделками `buyer-to-lgdeal`** - они проверяют продукт для покупателей и организуют доставку покупателям

---

## 🛠️ ТЕХНИЧЕСКИЙ ПЛАН РЕАЛИЗАЦИИ

### **ФАЗА 1: Расширение моделей данных**

#### **1.1. Добавить роль 'logist' в User**
```typescript
// server/src/models/User.ts
role: {
  type: String,
  enum: ['admin', 'supervisor', 'manager', 'buyer', 'logist'], // ← Добавить 'logist'
  default: 'manager'
}
```

#### **1.2. Добавить поля в Deal**
```typescript
// server/src/models/Deal.ts
const DealSchema = new Schema<IDeal>({
  // ... существующие поля
  
  // НОВЫЕ ПОЛЯ:
  assignedTo: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: false,
    index: true  // ← Для быстрого поиска
  },
  
  assignedRole: { 
    type: String,
    enum: ['manager', 'logist'],
    required: false
  },
  
  assignedAt: { 
    type: Date,
    required: false
  },
  
  assignedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: false
  },
  
  // История назначений
  assignmentHistory: [{
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedRole: { type: String },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    _id: false
  }]
});
```

#### **1.3. Добавить новые статусы**
```typescript
// server/src/types/constants.ts
export const DEAL_STATUSES = {
  // ... существующие статусы
  
  // НОВЫЕ СТАТУСЫ ДЛЯ LGDEAL WORKFLOW:
  AWAITING_INDIA_CONFIRMATION: 'awaiting_india_confirmation',  // Ждем подтверждения из Индии
  ASSIGNED_TO_MANAGER: 'assigned_to_manager',                  // Назначено менеджеру
  QUALITY_CHECK_IN_PROGRESS: 'quality_check_in_progress',      // Менеджер проверяет качество
  READY_FOR_SHIPPING: 'ready_for_shipping',                    // Готово к отгрузке (у логиста)
  SHIPPING_IN_PROGRESS: 'shipping_in_progress',                // Логист обрабатывает отгрузку
  
  // ... остальные статусы
} as const;
```

---

### **ФАЗА 2: Обновление логики доступа**

#### **2.1. Обновить типы UserRole**
```typescript
// server/src/controllers/deal/helpers.ts
export type UserRole = 
  | 'buyer' 
  | 'seller' 
  | 'LGDEAL buyer' 
  | 'LGDEAL seller' 
  | 'LGDEAL dual-role'
  | 'LGDEAL manager'     // ← НОВАЯ РОЛЬ
  | 'LGDEAL logist'      // ← НОВАЯ РОЛЬ
  | null;
```

#### **2.2. Обновить determineUserRole()**
```typescript
// server/src/controllers/deal/helpers.ts
export const determineUserRole = (
  deal: IDeal,
  userId: string,
  userObject: IUser,  // ← Добавить полный объект юзера
  companyId: string | undefined,
  isLgdealSupervisor: boolean,
  isDirectLgdealDeal: boolean
): UserRole => {
  
  // Если пользователь из LGDeal INC
  if (userObject.company.name === 'LGDeal INC') {
    
    // Supervisor видит как dual-role
    if (userObject.role === 'supervisor') {
      if (isDirectLgdealDeal) return 'LGDEAL dual-role';
      if (deal.dealType === 'buyer-to-lgdeal') return 'LGDEAL seller';
      if (deal.dealType === 'lgdeal-to-seller') return 'LGDEAL buyer';
    }
    
    // Manager видит только назначенные сделки
    if (userObject.role === 'manager') {
      if (deal.assignedTo?.toString() === userId) {
        return 'LGDEAL manager';
      }
      return null;  // ← Не видит сделку если не назначена
    }
    
    // Logist видит только сделки готовые к отгрузке
    if (userObject.role === 'logist') {
      if (deal.assignedTo?.toString() === userId && deal.assignedRole === 'logist') {
        return 'LGDEAL logist';
      }
      return null;  // ← Не видит сделку если не назначена
    }
  }
  
  // ... остальная логика для buyer/seller
};
```

#### **2.3. Обновить getBuyerDeals() и getSellerDeals()**
```typescript
// server/src/controllers/deal/retrievalController.ts

export const getSellerDeals = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const user = await User.findById(userId).populate('company');
  
  // Если пользователь из LGDeal INC
  if (user.company.name === 'LGDeal INC') {
    
    // SUPERVISOR видит ВСЕ сделки LGDEAL
    if (user.role === 'supervisor') {
      const lgdealCompany = await Company.findOne({ name: 'LGDeal INC' });
      const deals = await Deal.find({
        sellerCompanyId: lgdealCompany._id,
        dealType: 'buyer-to-lgdeal'
      }).sort({ createdAt: -1 });
      
      return res.json({ deals });
    }
    
    // MANAGER видит только назначенные ему сделки
    if (user.role === 'manager') {
      const deals = await Deal.find({
        assignedTo: userId,
        assignedRole: 'manager'
      }).sort({ createdAt: -1 });
      
      return res.json({ deals });
    }
    
    // LOGIST видит только сделки готовые к отгрузке
    if (user.role === 'logist') {
      const deals = await Deal.find({
        assignedTo: userId,
        assignedRole: 'logist',
        status: { $in: ['ready_for_shipping', 'shipping_in_progress', 'shipped'] }
      }).sort({ createdAt: -1 });
      
      return res.json({ deals });
    }
  }
  
  // ... обычная логика для других компаний
});
```

---

### **ФАЗА 3: Новые действия (Actions)**

#### **3.1. AssignToManagerCommand**
```typescript
// server/src/controllers/deal/actions/AssignToManagerCommand.ts

export class AssignToManagerCommand implements ICommand {
  async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole) {
    const { managerId, supplierDealId } = req.body;  // ← supplierDealId добавлен!
    
    // Проверка прав: только supervisor может назначать
    if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
      throw new ActionError('Only LGDEAL supervisors can assign deals to managers', 403);
    }
    
    // Проверка статуса: должен быть payment_received (оплата получена от покупателя)
    // ВАЖНО: Назначение происходит ТОЛЬКО после оплаты, до проверки качества
    if (deal.status !== DEAL_STATUSES.PAYMENT_RECEIVED) {
      throw new ActionError('Can only assign deals after payment is received', 400);
    }
    
    // Валидация supplierDealId (опционально)
    // Supervisor выбирает конкретный lgdeal-to-seller источник
    if (supplierDealId) {
      const supplierDeal = await Deal.findById(supplierDealId);
      // Проверяем что это lgdeal-to-seller и связан с buyer-to-lgdeal
    }
    
    // Проверка что manager из LGDeal INC
    const manager = await User.findById(managerId).populate('company');
    if (!manager || manager.company.name !== 'LGDeal INC' || manager.role !== 'manager') {
      throw new ActionError('Invalid manager ID', 400);
    }
    
    // Назначение
    deal.assignedTo = managerId;
    deal.assignedRole = 'manager';
    deal.assignedAt = new Date();
    deal.assignedBy = req.user.userId;
    deal.status = DEAL_STATUSES.ASSIGNED_TO_MANAGER;
    
    // Устанавливаем источник поставки
    if (supplierDealId) {
      deal.activePurchaseDealId = supplierDealId;  // ← ВАЖНО!
    }
    
    // История
    if (!deal.assignmentHistory) deal.assignmentHistory = [];
    deal.assignmentHistory.push({
      assignedTo: managerId,
      assignedRole: 'manager',
      assignedBy: req.user.userId,
      assignedAt: new Date()
    });
    
    return { activityLogDetails: `Deal assigned to manager ${manager.firstName} ${manager.lastName}` };
  }
}
```

#### **3.2. AssignToLogistCommand**
```typescript
// server/src/controllers/deal/actions/AssignToLogistCommand.ts

export class AssignToLogistCommand implements ICommand {
  async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole) {
    const { logistId } = req.body;
    
    // Проверка прав: только manager может передать логисту
    if (currentUserRole !== 'LGDEAL manager') {
      throw new ActionError('Only LGDEAL managers can assign deals to logists', 403);
    }
    
    // Проверка что logist из LGDeal INC
    const logist = await User.findById(logistId).populate('company');
    if (!logist || logist.company.name !== 'LGDeal INC' || logist.role !== 'logist') {
      throw new ActionError('Invalid logist ID', 400);
    }
    
    // Назначение
    deal.assignedTo = logistId;
    deal.assignedRole = 'logist';
    deal.assignedAt = new Date();
    deal.assignedBy = req.user.userId;
    deal.status = DEAL_STATUSES.READY_FOR_SHIPPING;
    
    // История
    if (!deal.assignmentHistory) deal.assignmentHistory = [];
    deal.assignmentHistory.push({
      assignedTo: logistId,
      assignedRole: 'logist',
      assignedBy: req.user.userId,
      assignedAt: new Date()
    });
    
    return { activityLogDetails: `Deal assigned to logist ${logist.firstName} ${logist.lastName}` };
  }
}
```

#### **3.3. RejectQualityCommand — возврат на Request, супервайзер выбирает альтернативу**

Реализовано в `server/src/controllers/deal/actions/RejectQualityCommand.ts`.

**Поведение:** Manager отклоняет качество (только LGDEAL manager, сделка назначена ему, статус `quality_check_in_progress`). Сделка **не отменяется** и **не переключается автоматически** на другого поставщика. Вместо этого:

- `stage` → `'request'`, `status` → `'quality_rejected'`
- `assignedTo`, `assignedRole`, `activePurchaseDealId` сбрасываются
- В activity log пишется запись, Supervisor'ам отправляется уведомление (`quality_rejected`: «Select Alternative»)
- Оплата от покупателя уже в казну LGDEAL — связанные lgdeal-to-seller сделки не отменяются

Далее Supervisor вручную выбирает альтернативный продукт (`select_alternative_product`; продукт, не прошедший проверку, выбрать повторно нельзя) и назначает Manager'у (`assign_to_manager`). При назначении из `quality_rejected` сделка переводится в `payment_delivery` / `assigned_to_manager`. Покупателю отображается, что оплата получена и выбирается альтернатива после отклонения качества.

#### **3.4. ReassignManagerCommand**
```typescript
// server/src/controllers/deal/actions/ReassignManagerCommand.ts

export class ReassignManagerCommand implements ICommand {
  async execute(deal: IDeal, req: ActionRequest, currentUserRole: UserRole) {
    const { newManagerId, reason } = req.body;
    const { userId } = req.user;
    
    // Проверка прав: только supervisor
    if (currentUserRole !== 'LGDEAL seller' && currentUserRole !== 'LGDEAL dual-role') {
      throw new ActionError('Only LGDEAL supervisors can reassign managers', 403);
    }
    
    // Проверка что сделка назначена manager'у
    if (!deal.assignedTo || deal.assignedRole !== 'manager') {
      throw new ActionError('Deal is not assigned to a manager', 400);
    }
    
    // Проверка что новый manager из LGDeal INC
    const newManager = await User.findById(newManagerId).populate('company');
    if (!newManager || 
        newManager.company.name !== 'LGDeal INC' || 
        newManager.role !== 'manager') {
      throw new ActionError('Invalid manager ID', 400);
    }
    
    // Проверка что это другой manager
    if (deal.assignedTo.toString() === newManagerId) {
      throw new ActionError('Cannot reassign to the same manager', 400);
    }
    
    // Получаем старого manager'а
    const oldManagerId = deal.assignedTo;
    const oldManager = await User.findById(oldManagerId);
    
    // Переназначение
    deal.assignedTo = newManagerId;
    deal.assignedAt = new Date();
    deal.assignedBy = userId;
    
    // История
    if (!deal.assignmentHistory) deal.assignmentHistory = [];
    deal.assignmentHistory.push({
      assignedTo: newManagerId,
      assignedRole: 'manager',
      assignedBy: userId,
      assignedAt: new Date(),
      reassignmentReason: reason
    });
    
    // Уведомления
    await sendNotification({
      userId: oldManagerId,
      type: 'deal_reassigned',
      title: 'Deal Reassigned',
      message: `Deal ${deal.dealNumber} has been reassigned to another manager`,
      dealId: deal._id,
      priority: 'medium'
    });
    
    await sendNotification({
      userId: newManagerId,
      type: 'deal_assigned',
      title: 'New Deal Assigned',
      message: `Deal ${deal.dealNumber} has been assigned to you by supervisor`,
      dealId: deal._id,
      dealNumber: deal.dealNumber,
      priority: 'high',
      actionUrl: `/deal/${deal._id}`
    });
    
    // Telegram
    await sendDealChangeNotification({
      dealNumber: deal.dealNumber,
      dealId: deal._id,
      changeType: 'status',
      changedBy: 'Supervisor (reassignment)',
      additionalInfo: `Reassigned from ${oldManager.firstName} to ${newManager.firstName}. Reason: ${reason}`
    });
    
    return { 
      activityLogDetails: `Deal reassigned from ${oldManager.firstName} ${oldManager.lastName} to ${newManager.firstName} ${newManager.lastName}. Reason: ${reason}`
    };
  }
}
```

#### **3.5. Обновить getAllowedActions()**
```typescript
// server/src/controllers/deal/helpers.ts

export const getAllowedActions = (
  deal: IDeal,
  userRole: UserRole,
  isDirectLgdealDeal: boolean
): string[] => {
  const actions: string[] = [];
  
  // LGDEAL SUPERVISOR может назначать менеджеру
  if ((userRole === 'LGDEAL seller' || userRole === 'LGDEAL dual-role') && 
      deal.status === 'pending' && 
      !deal.assignedTo) {
    actions.push('assign_to_manager');
  }
  
  // LGDEAL MANAGER может передать логисту
  if (userRole === 'LGDEAL manager' && 
      deal.assignedTo && 
      deal.status === 'quality_check_in_progress') {
    actions.push('assign_to_logist');
  }
  
  // LGDEAL LOGIST может отгружать
  if (userRole === 'LGDEAL logist' && 
      deal.status === 'ready_for_shipping') {
    actions.push('add_tracking_number', 'mark_as_shipped');
  }
  
  // ... остальные действия
  
  return actions;
};
```

---

### **ФАЗА 4: Frontend - UI для ролей**

#### **4.1. Создать LogistDashboardPage**
```typescript
// client/src/pages/LogistDashboardPage/LogistDashboardPage.tsx

const LogistDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filter, setFilter] = useState<'ready' | 'in_progress' | 'shipped' | 'delivered'>('ready');
  
  useEffect(() => {
    // Получить только сделки назначенные этому логисту
    api.get('/api/deal/seller', {
      params: {
        assignedTo: user.id,
        assignedRole: 'logist'
      }
    }).then(res => setDeals(res.data.deals));
  }, [filter]);
  
  return (
    <div className="logist-dashboard">
      <h1>Logistics Dashboard</h1>
      
      <div className="tabs">
        <button onClick={() => setFilter('ready')}>
          Ready for Shipping ({deals.filter(d => d.status === 'ready_for_shipping').length})
        </button>
        <button onClick={() => setFilter('in_progress')}>
          In Progress ({deals.filter(d => d.status === 'shipping_in_progress').length})
        </button>
        <button onClick={() => setFilter('shipped')}>
          Shipped ({deals.filter(d => d.status === 'shipped').length})
        </button>
        <button onClick={() => setFilter('delivered')}>
          Delivered ({deals.filter(d => d.status === 'delivered').length})
        </button>
      </div>
      
      <div className="deals-list">
        {deals.filter(d => matchesFilter(d, filter)).map(deal => (
          <LogistDealCard key={deal._id} deal={deal} />
        ))}
      </div>
    </div>
  );
};
```

#### **4.2. Обновить MyDealsPage для Manager**
```typescript
// client/src/pages/MyDealsPage/MyDealsPage.tsx

// Добавить фильтр для manager'ов LGDEAL
if (user.role === 'manager' && user.company.name === 'LGDeal INC') {
  // Показывать только назначенные сделки
  const assignedDeals = deals.filter(d => d.assignedTo === user.id);
  
  return (
    <div>
      <h2>My Assigned Deals</h2>
      <p>Deals assigned to you: {assignedDeals.length}</p>
      {assignedDeals.map(deal => <DealCard key={deal._id} deal={deal} />)}
    </div>
  );
}
```

#### **4.3. Supervisor - добавить кнопку "Assign to Manager"**

**✅ РЕАЛИЗОВАНО - упрощенная версия (один select)**

```typescript
// client/src/pages/DealDetailPage/components/AssignToManagerModal.tsx

// Модальное окно загружает ТОЛЬКО список Manager'ов

interface AssignToManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (managerId: string) => void;
  currentManagerId?: string;
  // deal НЕ нужен - supplier deal УЖЕ выбран на REQUEST stage
}

// UI показывает ОДИН выпадающий список:
// - Select Manager - выбор менеджера

// При нажатии отправляется:
handleAssignToManager(managerId)
  -> performAction('assign_to_manager', { managerId })

// Backend проверяет что activePurchaseDealId УЖЕ установлен
// Если не установлен - возвращает ошибку:
// "No supplier deal selected. Please select an alternative product 
//  on the request stage before assigning to manager."
```

**Почему НЕ нужен supplierDealId:**
- **REQUEST stage**: Supervisor выбирает альтернативу через `SupervisorProductTable`
  - Кнопка "Select Alternative" → action `select_alternative_product`
  - Устанавливается `activePurchaseDealId` на выбранный lgdeal-to-seller
- **PAYMENT stage**: При назначении используется УЖЕ установленный `activePurchaseDealId`
- Это предотвращает дублирование выбора и путаницу

**Workflow:**
1. REQUEST: Supervisor видит все альтернативы в таблице → выбирает лучшую
2. Buyer платит → PAYMENT_RECEIVED
3. Supervisor назначает Manager'у → используется pre-selected supplier deal
4. Manager знает от какого поставщика ожидать камень (activePurchaseDealId)

---

## ⚠️ ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### **ПРОБЛЕМА 1: "Подтверждение из Индии"**

**Вопрос:** Как определить что "камень подтвержден в Индии"?

**Варианты решения:**

**A) Ручное подтверждение Supervisor'ом:**
```typescript
// Supervisor нажимает кнопку "Confirm India Stock"
deal.status = 'awaiting_india_confirmation' → 'pending'
// После чего может назначить Manager'у
```

**B) Автоматическое по статусу связанной сделки:**
```typescript
// Если deal.dealType === 'buyer-to-lgdeal' и есть pairedDealId
const supplierDeal = await Deal.findById(deal.pairedDealIds[0]);
if (supplierDeal.status === 'approved') {
  // Камень подтвержден, можно назначать manager'у
  deal.status = 'india_confirmed';
}
```

**Рекомендация:** Вариант **A** (ручное подтверждение) - дает больше контроля ✅

---

### **ПРОБЛЕМА 2: Проверка качества**

**Вопрос:** Как manager отмечает "проверку качества"?

**Решение:** Добавить действие `complete_quality_check`:
```typescript
// LGDEAL Manager после получения камня:
1. Получает уведомление "Deal assigned to you"
2. Отмечает "Stone Received" → status: 'quality_check_in_progress'
3. Проверяет камень
4. Нажимает "Quality Check Complete" → status: 'quality_check_completed'
5. Назначает Logist'у → status: 'ready_for_shipping'
```

---

### **ПРОБЛЕМА 3: Миграция существующих сделок**

**Вопрос:** Что делать с существующими сделками?

**Решение:** Создать миграцию:
```typescript
// server/src/migrations/add-assignment-fields.ts

async function migrateDeals() {
  // Все активные сделки LGDEAL без assignedTo
  const lgdealCompany = await Company.findOne({ name: 'LGDeal INC' });
  
  const deals = await Deal.find({
    sellerCompanyId: lgdealCompany._id,
    status: { $nin: ['completed', 'cancelled', 'rejected'] },
    assignedTo: { $exists: false }
  });
  
  // Оставляем их без назначения (supervisor обработает вручную)
  for (const deal of deals) {
    deal.assignedTo = null;
    deal.assignedRole = null;
    await deal.save();
  }
}
```

---

### **ПРОБЛЕМА 4: Права на просмотр чужих сделок**

**Вопрос:** Может ли manager увидеть сделку другого manager'а?

**Ответ:** **НЕТ** ❌

**Логика:**
```typescript
// Manager видит ТОЛЬКО:
1. Сделки где assignedTo === thisManagerId
2. Никаких других сделок

// Supervisor видит ВСЕ сделки LGDeal INC
// Logist видит ТОЛЬКО сделки где assignedTo === thisLogistId
```

---

## 📊 СХЕМА БД ПОСЛЕ ПАТЧА

```
┌─────────────────────────────────────────────────────────────────┐
│ USER                                                             │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                    │
│ email: String                                                    │
│ firstName: String                                                │
│ lastName: String                                                 │
│ company: ObjectId → Company                                      │
│ role: 'admin' | 'supervisor' | 'manager' | 'buyer' | 'logist'  │ ← НОВОЕ
│ isLgdealSupervisor: Boolean                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ DEAL                                                             │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                    │
│ dealNumber: String                                               │
│ status: String                                                   │
│ stage: String                                                    │
│ dealType: 'buyer-to-lgdeal' | 'lgdeal-to-seller'               │
│                                                                  │
│ buyerId: ObjectId → User                                         │
│ sellerId: ObjectId → User                                        │
│ buyerCompanyId: ObjectId → Company                              │
│ sellerCompanyId: ObjectId → Company                             │
│                                                                  │
│ assignedTo: ObjectId → User                                     │ ← НОВОЕ
│ assignedRole: 'manager' | 'logist'                              │ ← НОВОЕ
│ assignedAt: Date                                                │ ← НОВОЕ
│ assignedBy: ObjectId → User                                     │ ← НОВОЕ
│                                                                  │
│ assignmentHistory: [{                                           │ ← НОВОЕ
│   assignedTo: ObjectId,                                         │
│   assignedRole: String,                                         │
│   assignedBy: ObjectId,                                         │
│   assignedAt: Date                                              │
│ }]                                                               │
│                                                                  │
│ products: [DealProduct]                                          │
│ shippingDetails: ShippingDetails                                │
│ activityLog: [ActivityLog]                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 ПОЭТАПНЫЙ ПЛАН ВНЕДРЕНИЯ

### **ЭТАП 1: Backend Foundation (1-2 дня)**
- [ ] Добавить роль `'logist'` в User model enum
- [ ] Добавить поля `assignedTo`, `assignedRole`, `assignedAt`, `assignedBy` в Deal model
- [ ] Добавить поле `assignmentHistory[]` в Deal model
- [ ] Добавить новые статусы в DEAL_STATUSES:
  - `assigned_to_manager`
  - `quality_check_in_progress`
  - `quality_approved`
  - `ready_for_shipping`
- [ ] Создать модель `Notification` для in-app уведомлений
- [ ] Создать миграцию для существующих данных
- [ ] Добавить индексы: `assignedTo`, `assignedRole`, `userId` (в Notification)

### **ЭТАП 2: Access Control Logic (2-3 дня)**
- [ ] Обновить `UserRole` type (добавить `'LGDEAL manager'`, `'LGDEAL logist'`)
- [ ] Обновить `determineUserRole()` для поддержки manager/logist ролей
- [ ] Обновить `getBuyerDeals()` с фильтрацией для LGDEAL manager'ов
- [ ] Обновить `getSellerDeals()` с фильтрацией для LGDEAL manager'ов/logist'ов
- [ ] Создать новый endpoint `GET /api/deal/logistics` для logist dashboard
- [ ] Добавить проверки прав в middleware

### **ЭТАП 3: Actions & Commands (2-3 дня)**
- [ ] Создать `AssignToManagerCommand`
- [ ] Создать `AssignToLogistCommand`
- [x] `RejectQualityCommand` — возврат на Request (`quality_rejected`), супервайзер вручную выбирает альтернативу (оплата уже получена)
- [ ] Создать `ReassignManagerCommand`
- [ ] Создать `StoneReceivedCommand` (manager отмечает получение камня)
- [ ] Создать `ApproveQualityCommand` (manager одобряет качество)
- [ ] Обновить `getAllowedActions()` для новых ролей
- [ ] Добавить эндпоинты API для всех новых команд

### **ЭТАП 4: Notifications System (1-2 дня)**
- [ ] Создать `NotificationService` для создания уведомлений
- [ ] Интегрировать Telegram (использовать существующий Deal Event Bot)
- [ ] Создать Telegram канал "LGDEAL Workflow" (приватный)
- [ ] Добавить manager'ов и logist'ов в канал
- [ ] Создать API endpoints для in-app notifications:
  - `GET /api/notifications` - получить уведомления
  - `PUT /api/notifications/:id/read` - отметить как прочитанное
  - `PUT /api/notifications/read-all` - отметить все как прочитанные
- [ ] Настроить WebSocket для real-time уведомлений

### **ЭТАП 5: Frontend UI (3-4 дня)**
- [ ] Создать `LogistDashboardPage` с табами (Ready/In Progress/Shipped/Delivered)
- [ ] Создать `NotificationBell` component в Header
- [ ] Создать `NotificationDropdown` component
- [ ] Обновить `MyDealsPage` для LGDEAL manager'ов (показывать только assignedTo)
- [ ] Добавить UI для назначения manager'а в `DealDetailPage`:
  - Dropdown со списком manager'ов
  - Кнопка "Assign to Manager"
  - Показывать только если есть подтвержденные lgdeal-to-seller сделки
- [ ] Добавить UI для назначения logist'а (для manager'ов)
- [ ] Добавить UI для переназначения (показывать только если >1 manager)
- [ ] Добавить индикаторы `assignedTo` в карточках сделок
- [ ] Создать `AssignmentHistory` component для отображения истории

### **ЭТАП 6: Helper Endpoints (1 день)**
- [ ] `GET /api/company/lgdeal/managers` - список manager'ов с статистикой
- [ ] `GET /api/company/lgdeal/logists` - список logist'ов с статистикой
- [ ] `GET /api/deal/:id/alternatives` - доступные альтернативы для назначения

### **ЭТАП 7: Testing & QA (2-3 дня)**
- [ ] Unit tests для новых команд
- [ ] Integration tests для workflow (full cycle)
- [ ] E2E tests для UI
- [ ] Тестирование автоматического перехода на альтернативу
- [ ] Тестирование прав доступа (manager видит только свои сделки)
- [ ] Тестирование уведомлений (Telegram + In-app)
- [ ] Нагрузочное тестирование

### **ЭТАП 8: Documentation & Deployment (1 день)**
- [ ] Обновить API документацию (`12_API_Reference.md`)
- [ ] Написать user guide для новых ролей
- [ ] Создать миграцию для production
- [ ] Создать Telegram канал и добавить пользователей
- [ ] Деплой на staging
- [ ] Тестирование на staging
- [ ] Деплой на production
- [ ] Обучение supervisor'ов, manager'ов, logist'ов

---

## 📈 МЕТРИКИ УСПЕХА

1. ✅ **Manager'ы видят только назначенные сделки** (0 чужих сделок)
2. ✅ **Logist'ы видят только сделки на отгрузку** (100% relevance)
3. ✅ **Supervisor контролирует назначения** (audit log работает)
4. ✅ **Среднее время обработки сделки** снижается на 20%
5. ✅ **0 конфликтов** при одновременной обработке

---

## 🔒 БЕЗОПАСНОСТЬ

### **Проверки прав:**
```typescript
// Каждая роль может видеть только свои сделки:

SUPERVISOR:
  - Видит: ВСЕ сделки LGDeal INC
  - Может: Назначать manager'ам

MANAGER:
  - Видит: assignedTo === userId && assignedRole === 'manager'
  - Может: Назначать logist'ам, обрабатывать камни

LOGIST:
  - Видит: assignedTo === userId && assignedRole === 'logist'
  - Может: Отгружать, добавлять tracking, отмечать доставку

BUYER/SELLER (другие компании):
  - Видят: свои сделки как обычно
  - Не видят: внутреннюю информацию LGDEAL (assignedTo, assignedRole)
```

---

## ✅ ПОДТВЕРЖДЕННЫЕ ТРЕБОВАНИЯ (ОТ КЛИЕНТА)

### **1. Подтверждение из Индии:**
- ✅ **АВТОМАТИЧЕСКОЕ** - происходит когда поставщик делает `approve_request` на `lgdeal-to-seller` сделке
- ✅ Status `lgdeal-to-seller`: `pending` → `awaiting_invoice` = камень подтвержден!
- ✅ Supervisor видит какие lgdeal-to-seller сделки подтверждены (через `pairedDealIds`)

### **2. Проверка качества:**
- ✅ **Manager МОЖЕТ отклонить камень** если качество не OK
- ✅ **99% случаев камень OK** (все продукты сертифицированы)
- ✅ **При отклонении:** Автоматический переход на следующую подтвержденную альтернативу
- ✅ **Если альтернатив нет:** Уведомление Supervisor'у

### **3. UI Logist:**
- ✅ **Отдельная страница** `/logist-dashboard`
- ✅ **Доступ:** Logist (свои сделки) + Supervisor (все сделки для контроля)
- ✅ **Табы:** Ready for Shipping | In Progress | Shipped | Delivered
- ✅ **Функции:** Export CSV, Print Labels

### **4. Переназначение:**
- ✅ **Supervisor может переназначить** на другого manager'а
- ✅ **UI условие:** Показывать кнопку "Reassign" **ТОЛЬКО если >1 manager** в компании
- ✅ **Обязательна причина** переназначения
- ✅ **История назначений** сохраняется в `assignmentHistory[]`

### **5. Уведомления:**
- ✅ **Telegram + In-app notifications**
- ✅ Использовать существующий **Deal Event Bot** или создать новый **Workflow Bot**
- ✅ Создать таблицу `Notification` для in-app уведомлений

---

## 📱 TELEGRAM INFRASTRUCTURE

### **🤖 Существующие боты:**

1. **Deal Event Bot** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
   - ✅ События по сделкам
   - ✅ `sendDealChangeNotification()` уже реализован
   - 💡 **Можем использовать для workflow уведомлений!**

2. **Stock Update Bot** (`STOCK_TELEGRAM_BOT_TOKEN`, `STOCK_TELEGRAM_CHAT_ID`)
   - Обновления складских остатков

3. **Registration Bot** (`REGISTRATION_TELEGRAM_BOT_TOKEN`, `REGISTRATION_TELEGRAM_CHAT_ID`)
   - Новые регистрации

4. **System Monitoring Bot** (`SYSTEM_MONITORING_BOT_TOKEN`, `SYSTEM_MONITORING_CHAT_ID`)
   - Системный мониторинг

5. **Chat Support Bot** (`CHAT_TELEGRAM_BOT_TOKEN`, `CHAT_TELEGRAM_CHAT_ID`)
   - Поддержка клиентов

---

### **🆕 Что нужно создать для Workflow:**

#### **Вариант A: Использовать Deal Event Bot (Рекомендуется)**

**Преимущества:**
- ✅ Не нужен новый бот
- ✅ Меньше секретов и конфигурации
- ✅ Единая система уведомлений о сделках
- ✅ `sendDealChangeNotification()` уже работает

**Реализация:**
```typescript
// Расширить существующую функцию новыми типами событий:
sendDealChangeNotification({
  dealNumber: '200001',
  dealId: dealId,
  changeType: 'assignment',  // ← Новый тип
  newStatus: 'assigned_to_manager',
  changedBy: 'Supervisor Ivan',
  additionalInfo: 'Assigned to Manager John Doe'
});
```

**Настройка:**
```bash
# Создать приватный Telegram канал "LGDEAL Workflow"
# Добавить бота в канал
# Пригласить всех supervisor'ов, manager'ов, logist'ов

# Переменные уже существуют:
TELEGRAM_BOT_TOKEN=...  # Deal Event Bot
TELEGRAM_CHAT_ID=...    # ID канала "LGDEAL Workflow"
```

---

#### **Вариант B: Создать новый Workflow Bot + личные чаты (Опционально)**

**Если нужна полная изоляция:**
```bash
# Новые переменные окружения:
WORKFLOW_TELEGRAM_BOT_TOKEN=...
WORKFLOW_TELEGRAM_CHAT_ID=...  # Канал "LGDEAL Internal Workflow"

# Docker secrets:
workflow_telegram_bot_token
workflow_telegram_chat_id
```

**Плюс личные уведомления:**
```typescript
// Добавить в User model:
User {
  telegramId?: string,  // Личный Telegram ID (опционально)
  telegramUsername?: string
}

// Отправка в личный чат:
if (user.telegramId) {
  await workflowBot.telegram.sendMessage(user.telegramId, message);
}
```

---

### **📲 In-App Notifications:**

#### **Новая модель Notification:**
```typescript
// server/src/models/Notification.ts

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: [
      'deal_assigned',
      'deal_reassigned', 
      'quality_rejected',
      'quality_rejected_alternative_selected',
      'ready_for_shipping',
      'stone_received',
      'quality_approved'
    ],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  dealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
  dealNumber: { type: String },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  actionUrl: { type: String },  // e.g., '/deal/123456'
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }  // Auto-delete old notifications
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
```

#### **Frontend - Bell Icon с Badge:**
```typescript
// client/src/components/Header/NotificationBell.tsx

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  
  useEffect(() => {
    // Fetch notifications
    api.get('/api/notifications').then(res => {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.notifications.filter(n => !n.read).length);
    });
    
    // WebSocket для real-time уведомлений
    socket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      // Show toast
      toast.info(notification.title);
    });
  }, []);
  
  return (
    <div className="notification-bell">
      <button onClick={() => setShowDropdown(!showDropdown)}>
        <i className="fas fa-bell"></i>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      
      {showDropdown && (
        <NotificationDropdown 
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
        />
      )}
    </div>
  );
};
```

---

### **🔔 Типы уведомлений для каждой роли:**

#### **Manager получает:**
1. 📌 **Deal Assigned** - новая сделка назначена
2. 🔄 **Deal Reassigned** - сделка переназначена другому manager'у
3. 🔁 **Alternative Auto-Assigned** - после отклонения качества назначена новая

#### **Logist получает:**
1. 📦 **Ready for Shipping** - сделка передана на отгрузку

#### **Supervisor получает:**
1. ⚠️ **No Alternatives Available** - manager отклонил, альтернатив нет
2. ❌ **Quality Rejected** - manager отклонил камень (для статистики)
3. 📊 **Daily Summary** - сводка за день (опционально)

---

### **💡 РЕКОМЕНДАЦИЯ:**

**Использовать существующий Deal Event Bot + создать Notification модель:**

```typescript
// При назначении manager'у:
1. Telegram → общий канал "LGDEAL Workflow" (все видят)
2. In-app → личное уведомление в UI (только для этого manager'а)

// Это дает:
✅ Прозрачность (все в команде видят активность)
✅ Персональные уведомления (manager видит только свои)
✅ Не нужен новый бот
✅ Меньше конфигурации
```

---

## 🔧 ЧТО НУЖНО СОЗДАТЬ/НАСТРОИТЬ

### **📱 Telegram:**

#### **Вариант A: Использовать существующий Deal Event Bot (Рекомендуется)**

**Действия:**
1. ✅ Создать приватный Telegram канал "LGDEAL Workflow"
2. ✅ Добавить существующего Deal Event Bot в канал (как admin)
3. ✅ Пригласить всех supervisor'ов, manager'ов, logist'ов LGDeal INC
4. ✅ Получить Chat ID канала
5. ✅ Обновить `TELEGRAM_CHAT_ID` (или использовать отдельную переменную)

**Код:**
```typescript
// Использовать существующую функцию:
sendDealChangeNotification({
  dealNumber: deal.dealNumber,
  dealId: deal._id,
  changeType: 'assignment',  // ← Новый тип
  newStatus: 'assigned_to_manager',
  changedBy: 'Supervisor Ivan',
  additionalInfo: 'Assigned to Manager John'
});
```

**Переменные окружения:**
```bash
# Уже существуют:
TELEGRAM_BOT_TOKEN=...  # Deal Event Bot
TELEGRAM_CHAT_ID=...    # ID канала "LGDEAL Workflow"
```

---

#### **Вариант B: Создать новый Workflow Bot (Опционально)**

**Если нужна полная изоляция от общих deal events:**

**Действия:**
1. ⭐ Создать нового бота через @BotFather
2. ⭐ Создать приватный канал "LGDEAL Internal Workflow"
3. ⭐ Добавить бота в канал
4. ⭐ Пригласить команду
5. ⭐ Добавить новые переменные окружения

**Переменные окружения:**
```bash
# Новые:
WORKFLOW_TELEGRAM_BOT_TOKEN=...
WORKFLOW_TELEGRAM_CHAT_ID=...

# Docker secrets:
workflow_telegram_bot_token
workflow_telegram_chat_id
```

**Код:**
```typescript
// server/src/utils/telegramBot.ts

const workflowBotToken = getSecretFromFile('WORKFLOW_TELEGRAM_BOT_TOKEN');
const workflowBotChatId = getSecretFromFile('WORKFLOW_TELEGRAM_CHAT_ID');
let workflowBot: Telegraf<any> | null = null;

if (workflowBotToken && workflowBotChatId) {
  workflowBot = new Telegraf(workflowBotToken);
  logger.info(`[TelegramBot] Workflow Bot initialized for chat ID: ${workflowBotChatId}`);
}

export const sendWorkflowNotification = async (message: string) => {
  await _sendTelegramMessage(workflowBot, workflowBotChatId, message);
};
```

---

### **🔔 In-App Notifications:**

**Создать новую модель:**
```typescript
// server/src/models/Notification.ts

const NotificationSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  
  type: { 
    type: String, 
    enum: [
      'deal_assigned',
      'deal_reassigned', 
      'quality_rejected',
      'quality_rejected_alternative_selected',
      'ready_for_shipping',
      'stone_received',
      'quality_approved'
    ],
    required: true 
  },
  
  title: { type: String, required: true },
  message: { type: String, required: true },
  
  dealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
  dealNumber: { type: String },
  
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'urgent'], 
    default: 'medium' 
  },
  
  read: { type: Boolean, default: false, index: true },
  readAt: { type: Date },
  
  actionUrl: { type: String },  // e.g., '/deal/123456'
  actionLabel: { type: String }, // e.g., 'View Deal'
  
  metadata: { type: Schema.Types.Mixed },  // Дополнительные данные
  
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }  // 30 дней
});

// Compound index для быстрого получения непрочитанных уведомлений
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL index для автоматического удаления старых уведомлений
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**Сервис для создания уведомлений:**
```typescript
// server/src/services/notificationService.ts

export class NotificationService {
  async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    dealId?: string;
    dealNumber?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    actionUrl?: string;
  }): Promise<INotification> {
    
    const notification = await Notification.create({
      ...data,
      createdAt: new Date()
    });
    
    // Отправить через WebSocket для real-time обновления
    if (global.io) {
      global.io.to(`user:${data.userId}`).emit('new_notification', notification);
    }
    
    return notification;
  }
  
  async getUnreadCount(userId: string): Promise<number> {
    return await Notification.countDocuments({ userId, read: false });
  }
  
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await Notification.updateOne(
      { _id: notificationId, userId },
      { read: true, readAt: new Date() }
    );
  }
  
  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );
  }
}
```

---

### **ЭТАП 2: Access Control Logic (2-3 дня)**
- [ ] Обновить `UserRole` type (добавить `'LGDEAL manager'`, `'LGDEAL logist'`)
- [ ] Обновить `determineUserRole()` для поддержки manager/logist ролей
- [ ] Обновить `getSellerDeals()` с логикой:
  - Supervisor → все lgdeal-to-seller сделки
  - Manager → только assignedTo === userId
  - Logist → только assignedTo === userId && assignedRole === 'logist'
- [ ] Создать `GET /api/deal/logistics` endpoint для logist dashboard
- [ ] Добавить проверки прав в middleware

### **ЭТАП 3: Actions & Commands (2-3 дня)**
- [ ] `AssignToManagerCommand` - назначить manager'у
- [ ] `AssignToLogistCommand` - передать логисту
- [x] `RejectQualityCommand` — отклонить качество, возврат на Request, супервайзер выбирает альтернативу
- [ ] `ReassignManagerCommand` - переназначить другому manager'у
- [ ] `StoneReceivedCommand` - manager отмечает получение
- [ ] `ApproveQualityCommand` - manager одобряет качество
- [ ] Обновить `getAllowedActions()` для всех новых ролей и статусов
- [ ] Добавить эндпоинты API для всех команд

### **ЭТАП 4: Helper Endpoints (1 день)**
- [ ] `GET /api/company/lgdeal/managers` - список manager'ов + stats (activeDeals)
- [ ] `GET /api/company/lgdeal/logists` - список logist'ов + stats
- [ ] `GET /api/deal/:id/available-alternatives` - подтвержденные альтернативы
- [ ] `GET /api/notifications` - получить уведомления пользователя
- [ ] `PUT /api/notifications/:id/read` - отметить уведомление
- [ ] `PUT /api/notifications/read-all` - отметить все

### **ЭТАП 5: Frontend UI (3-4 дня)**
- [ ] Создать `LogistDashboardPage`:
  - Табы: Ready | In Progress | Shipped | Delivered
  - Фильтр по logist'у (для supervisor'а)
  - Компактная таблица
  - Export CSV, Print Labels
- [ ] Создать `NotificationBell` component:
  - Badge с количеством непрочитанных
  - Dropdown с списком уведомлений
  - Mark as read функционал
  - Real-time через WebSocket
- [ ] Обновить `MyDealsPage` для LGDEAL manager'ов:
  - Показывать только assignedTo === userId
  - Индикатор "Assigned to you"
- [ ] Обновить `DealDetailPage`:
  - UI для назначения manager'а (для supervisor'а)
  - UI для назначения logist'а (для manager'а)
  - UI для переназначения (показывать только если >1 manager)
  - Отображение assignment history
- [ ] Создать `AssignmentHistory` component
- [ ] Создать `QualityCheckPanel` component (для manager'а)

### **ЭТАП 6: Testing & QA (2-3 дня)**
- [ ] Unit tests для всех новых команд
- [ ] Integration tests для полного workflow цикла
- [ ] E2E tests для UI (Playwright/Cypress)
- [ ] Тестирование автоматического перехода на альтернативу
- [ ] Тестирование прав доступа:
  - Manager видит только свои сделки
  - Logist видит только свои сделки
  - Supervisor видит все
- [ ] Тестирование уведомлений (Telegram + In-app + WebSocket)
- [ ] Тестирование edge cases:
  - Нет альтернатив после отклонения
  - Только 1 manager в компании (скрыть reassign)
  - Переназначение во время quality check
- [ ] Нагрузочное тестирование

### **ЭТАП 7: Telegram Setup (0.5 дня)**
- [ ] Создать приватный Telegram канал "LGDEAL Workflow"
- [ ] Добавить Deal Event Bot в канал (или создать новый Workflow Bot)
- [ ] Получить Chat ID канала
- [ ] Обновить docker secrets с Chat ID
- [ ] Пригласить всех supervisor'ов, manager'ов, logist'ов
- [ ] Протестировать отправку уведомлений

### **ЭТАП 8: Documentation & Deployment (1 день)**
- [ ] Обновить `12_API_Reference.md` (новые endpoints)
- [ ] Обновить `14_Deals_and_Workflows.md` (новый workflow)
- [ ] Создать user guide: "LGDEAL Internal Workflow Guide"
- [ ] Создать миграцию для production (add fields to Deal)
- [ ] Деплой на staging
- [ ] Тестирование на staging
- [ ] Деплой на production
- [ ] Обучение команды (supervisor'ов, manager'ов, logist'ов)

---

## 📊 ОЦЕНКА СЛОЖНОСТИ И СРОКОВ

| Этап | Компонент | Время | Риск |
|------|-----------|-------|------|
| 1 | Backend Foundation (Models + Migrations) | 1-2 дня | 🟢 Низкий |
| 2 | Access Control Logic | 2-3 дня | 🟡 Средний |
| 3 | Actions & Commands (6 команд) | 2-3 дня | 🟢 Низкий |
| 4 | Notifications System | 1-2 дня | 🟡 Средний |
| 5 | Frontend UI | 3-4 дня | 🟡 Средний |
| 6 | Helper Endpoints | 1 день | 🟢 Низкий |
| 7 | Testing & QA | 2-3 дня | 🟢 Низкий |
| 8 | Telegram Setup | 0.5 дня | 🟢 Низкий |
| 9 | Documentation | 1 день | 🟢 Низкий |
| **ИТОГО:** | | **14-20 дней** | 🟡 **Средний** |

### **Критический путь:**
```
ЭТАП 1 → ЭТАП 2 → ЭТАП 3 → ЭТАП 5 → ЭТАП 7 → ЭТАП 9
(Backend → Logic → Commands → UI → Testing → Deploy)
```

### **Параллельная разработка:**
- 🔀 ЭТАП 4 (Notifications) + ЭТАП 6 (Helper Endpoints) - параллельно после ЭТАП 2
- 🔀 ЭТАП 8 (Telegram Setup) - можно начать заранее

**Реалистичный срок:** ~**15 рабочих дней (3 недели)** при одном разработчике

---

## 📈 МЕТРИКИ УСПЕХА

После внедрения патча должны достичь:

### **1. Разделение доступа:**
- ✅ Manager'ы видят только назначенные сделки (0% чужих)
- ✅ Logist'ы видят только сделки на отгрузку (100% relevance)
- ✅ Supervisor видит все для контроля

### **2. Эффективность workflow:**
- ✅ Среднее время обработки сделки снижается на 20-30%
- ✅ Автоматический переход на альтернативу при отклонении (<1 минуты)
- ✅ 0 конфликтов при одновременной обработке разными manager'ами

### **3. Прозрачность и audit:**
- ✅ Полная история назначений в `assignmentHistory`
- ✅ Real-time уведомления (Telegram + In-app)
- ✅ Activity log для всех действий
- ✅ Статистика по каждому manager'у/logist'у (activeDeals, completedDeals)

### **4. Качество обработки:**
- ✅ 99%+ камней проходят проверку качества manager'а
- ✅ <1% отклонений с автоматическим fallback на альтернативу
- ✅ 100% сертифицированные продукты (первичный контроль)

### **5. UX для команды:**
- ✅ Manager видит только свои задачи (фокус, не перегружен)
- ✅ Logist видит только отгрузки (простота интерфейса)
- ✅ Supervisor контролирует весь pipeline (полная visibility)
- ✅ Уведомления в реальном времени (меньше задержек)

---

## 📚 RELATED DOCUMENTS

- `02_Architecture.md` - Общая архитектура системы
- `14_Deals_and_Workflows.md` - Текущие workflow сделок
- `12_API_Reference.md` - API документация
- `04_Environment_Variables.md` - Telegram bot tokens и переменные окружения
- `16_Chat_Support_System.md` - Chat Support System

---

## 🚀 NEXT STEPS

### **Immediate Actions:**
1. ✅ **Создать Telegram канал** "LGDEAL Workflow" (приватный)
2. ✅ **Добавить Deal Event Bot** в канал
3. ✅ **Пригласить команду** (supervisor'ов, manager'ов, logist'ов)
4. ✅ **Утвердить финальный план** с командой

### **Development Start:**
1. 🔄 Начать с **ЭТАП 1** (Backend Foundation)
2. 🔄 Параллельно настроить **ЭТАП 8** (Telegram)
3. 🔄 Создать задачи для tracking прогресса

---

## 📝 CHANGELOG

**v3.0 (18 января 2026):**
- ✅ Документация обновлена согласно актуальному коду
- ✅ Уточнена последовательность: оплата ДО проверки качества
- ✅ Добавлена информация о синхронизации статусов между сделками
- ✅ Уточнено: стоимость доставки устанавливается на buyer-to-lgdeal сделке
- ✅ Уточнено: Manager и Logist работают ТОЛЬКО со сделками lgdeal-to-seller
- ✅ Добавлена информация о синхронизации tracking number

**v2.0 (15 января 2026):**
- ✅ Подтверждены все требования клиента
- ✅ Уточнен workflow с учетом существующей архитектуры
- ✅ Добавлена логика автоматического перехода на альтернативу
- ✅ Определена Telegram инфраструктура (использовать Deal Event Bot)
- ✅ Добавлена спецификация Notification model для in-app
- ✅ Расширен план на 8 этапов с детальными задачами
- ✅ Добавлены метрики успеха

**v1.0 (15 января 2026):**
- Первичный анализ и план

---

**Статус:** ✅ **IMPLEMENTED** (Январь 2026)

**Реализовано:**
- ✅ Все модели данных (assignedTo, assignedRole, assignmentHistory)
- ✅ Все команды (AssignToManager, AssignToLogist, StoneReceived, ApproveQuality, RejectQuality, ReassignManager)
- ✅ Логика доступа для Manager и Logist
- ✅ Logist Dashboard (`/logist-dashboard`)
- ✅ Синхронизация статусов между buyer-to-lgdeal и lgdeal-to-seller сделками
- ✅ Telegram и In-app уведомления
- ✅ Уточненная логика: оплата ДО проверки качества
- ✅ Стоимость доставки устанавливается на buyer-to-lgdeal сделке на этапе реквеста

**Следующий шаг:** Документация обновлена согласно актуальному коду

