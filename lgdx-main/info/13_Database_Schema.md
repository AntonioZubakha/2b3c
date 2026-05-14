# 🗄️ MongoDB Schema (актуально по `server/src/models/*`)

## 🎯 Обзор

Этот документ описывает **фактические** коллекции MongoDB, которые использует backend (`server/`), и ключевые поля/связи.  
**Код — источник истины**: `server/src/models/*.ts`.

## 🧱 Основные коллекции (gateway `server/`)

### `users` (`server/src/models/User.ts`)

**Ключевые поля:**

- **Идентификация**: `email` (unique), `phone` (required, unique)
- **Роли**: `role ∈ {admin, supervisor, manager, logist}`
- **Статус**: `isActive` (default `false`)
- **Email verification**: `emailVerified`, `emailVerificationToken`, `emailVerificationExpires`
- **Phone verification**: `phoneVerified`, `phoneVerificationToken`, `phoneVerificationExpires`, `phoneVerificationCode`
- **Password reset**: `passwordResetToken`, `passwordResetExpires`
- **Telegram linking**: `telegramId`, `telegramLinkToken`, `telegramLinkTokenExpires`
- **Корзина (embedded)**: `cart.items[{ product, dateAdded }]`, `cart.updatedAt`

**Важно:**

- Поле `isLgdealSupervisor` помечено как **@deprecated** и не участвует в актуальной логике роли LGDEAL (роль выводится из компании + `role`).

### `companies` (`server/src/models/Company.ts`)

**Ключевые поля:**

- **Основное**: `name` (unique), `description`, `status ∈ {pending_review, active, rejected, suspended}`
- **Users (embedded)**: `users[{ user, role, isActive }]`, где `role ∈ {supervisor, manager, logist}`
- **Roles компании**: `roles[]` (enum из `CompanyRole` в `server/src/types`)
- **Details**: `details.phone/email/website/companyCountry/technology`, адреса (`legalAddress/actualAddress/shippingAddress`), `bankInformation`, `taxInformation`, `logo{url,filename}`
- **API sync**: `apiConfig` → ref `CompanyApiConfig`
- **FTP**: `ftpConfig` (enabled, username, passwordHash, allowedIPs, quota, settings…)
- **Legacy FTP**: `legacyFtpConfig` (host/port/user/encryptedPassword/remoteDir/pollIntervalHours…)
- **Stock sync marker**: `lastSync`

### `products` (`server/src/models/Product.ts`)

**Ключевые поля (не исчерпывающе):**

- **Идентификация**: `id` (uuid, unique), `sku` (uuid, unique sparse)
- **Характеристики**: `shape`, `carat`, `color`, `clarity`, `cut`, `polish`, `symmetry`, `fluorescence`
- **Сертификат**: `certificateInstitute`, `certificateNumber`
- **Media**: `photo`, `video`, `reportLink`, `image360`, `link`
- **Цены**: `price`, `pricePerCarat`, `marketPrice`, `marketPricePerCarat`, `discount`
- **Размеры**: `measurement1/2/3`, `ratio`, `tableSize`, `totalDepth`, `crownHeight`, `pavilionDepth`, `girdle`, `culet`, `measurements` (строка)
- **Статус**: `status ∈ {available, OnDeal, Sold, reserved, inactive}`, `sold`, `onDeal`, `dealId` (ref Deal)

### `deals` (`server/src/models/Deal.ts`)

**Ключевые поля:**

- **Идентификация**: `dealNumber` (unique)
- **Тип**: `dealType` (например `buyer-to-lgdeal`, `lgdeal-to-seller`)
- **Стадия/статус**: `stage` (default `request`), `status` (default `pending`)
- **Участники**: `buyerId`, `sellerId` (ref User), `buyerCompanyId`, `sellerCompanyId` (ref Company)
- **Состав**: `products[]` (ref Product + `productSnapshot` fallback)
- **Shipping**: `shippingDetails{ shippingAddress{...}, cost, importTariff, trackingNumber, ... }`
- **Request/Negotiation**: `requestDetails`, `negotiationDetails` (proposedTerms, finalTerms…)
- **Payment**: `paymentDetails` (invoice, bank/stripe, rejectedInvoices, stripe fields…)
- **Связи**: `pairedDealId`, `pairedDealIds`, `activePurchaseDealId`
- **LGDEAL internal assignment**: `assignedTo`, `assignedRole ∈ {manager, logist}`, `assignedAt`, `assignedBy`, `assignmentHistory[]`
- **Activity log**: `activityLog[]`

### `notifications` (`server/src/models/Notification.ts`)

**Ключевые поля:**

- `userId` (ref User)
- `type` (enum: LGDEAL workflow + deal flow)
- `priority ∈ {low, medium, high, urgent}`
- `dealId?`, `dealNumber?`, `actionUrl?`, `actionLabel?`, `metadata?`
- `read`, `readAt?`
- `expiresAt` — **TTL index** (по умолчанию 30 дней)

### `chatsessions` (`server/src/models/ChatSession.ts`)

**Ключевые поля:**

- `userId?` (ref User) — для logged-in; для гостей `null`
- `guestId?`, `isGuest`
- `status ∈ {active, waiting, closed}`
- `assignedTo?` (support agent)
- `priority ∈ {low, medium, high, urgent}`
- `aiEnabled` (default `true`)
- `lastMessageAt?`, `closedAt?`, `metadata?`

### `chatmessages` (`server/src/models/ChatMessage.ts`)

**Ключевые поля:**

- `sessionId` (ref ChatSession)
- `sender ∈ {user, support}`, `senderId?` (для support сообщений)
- `text` (max 2000), `messageType ∈ {text, image, file, system}`
- `attachments[]` (image/file)
- `isRead`, `readAt?`, `isEdited`, `editedAt?`, `replyTo?`
- `metadata.deliveryStatus`, `metadata.isAi`

### `companyapiconfigs` (`server/src/models/CompanyApiConfig.ts`)

**Ключевые поля:**

- `company` (ref Company, unique)
- `isActive`, `allowMissingMedia`
- `config{ url, requestType, headers, params, baseBodyPayload, dataKey, totalCountPath, filter }`
- `syncSchedule{ frequency, timeOfDay }`
- `tokenAuthConfig{ enabled, url, requestType, params, headers, bodyPayload, bodyEncodeType, tokensPathInResponse, tokenUsage[] }`
- `syncStatus ∈ {idle, in_progress, success, error}`, `lastSync`, `lastSyncError`
- `brahmaniTotalPages?`, `brahmaniCurrentPage?` (состояние multi‑page синка)

### Дополнительные коллекции (настройки, служебные, контент)

#### `invitations` (`server/src/models/Invitation.ts`)
- `email`, `company` (ref Company), `status ∈ {pending, sent, revoked, accepted}`
- `token?`, `lastSentAt?`, `sendCount`, `expiresAt?`
- Уникальный индекс: `(email, company)` при `status ≠ accepted`; sparse по `token`

#### `marketnews` (`server/src/models/MarketNews.ts`)
- `title`, `summary`, `body?`, `imageUrl?`, `imageCredit?`, `date`, `category`, `impact ∈ {positive, negative, neutral}`, `order`

#### `chataisettings` (`server/src/models/ChatAiSettings.ts`, collection: `chataisettings`)
- Один документ: `globalEnabled` (boolean) — включение/выключение AI в чате глобально.

#### `counters` (`server/src/models/Counter.ts`)
- `name` (unique), `value`, `prefix`, `suffix` — для генерации последовательных номеров (например, dealNumber).

#### `marketpricesettings` (`server/src/models/MarketPriceSettings.ts`, collection: `marketpricesettings`)
- Экономические коэффициенты: `coeffInr`, `coeffGold`, `coeffOil`
- Веса для расчёта рыночной цены: `weightPriceDecreased`, `weightPriceIncreased`, `weightNewProducts`, `weightDisappeared`, `weightUnchanged`
- Параметры медианы по размеру выборки: `medianSmallKeepPct`, `medianMediumKeepPct`, `medianLargeExpensiveExcludePct`, `medianLargeCheapExcludePct`, `medianVeryLarge*`
- `updatedBy?`, `updatedAt`, `reason`, `createdAt`

#### `perfectpairsettings` (`server/src/models/PerfectPairSettings.ts`)
- `enableProgressiveRelaxation`, `maxStage`, `stages[]` (caratTolerancePct, clarityStepsAllowed, cutMaxDowngrade, …), `weights` (carat, clarity, cut, …)
- `updatedBy?`, `updatedAt`, `reason`, `createdAt`

#### `constantssettings` (`server/src/models/ConstantsSettings.ts`)
- `minSupplierPrice`, `measurementRatioGeometryTolerancePct`, `alternativesCaratTolerance`
- `updatedBy?`, `updatedAt`, `reason`, `createdAt`

#### `systemsettings` (`server/src/models/SystemSettings.ts`)
- Один документ (последний по `updatedAt`): `registrationsEnabled`, `updatedBy?`, `updatedAt`, `reason`, `createdAt`

#### `blacklistedcertificates` (`server/src/models/BlacklistedCertificate.ts`)
- `certificateNumber` (unique), `reason ∈ {product_sold, deal_cancelled, duplicate, other}`, `dealId?`, `addedBy` (ref User), `addedAt`

#### `carts` (`server/src/models/Cart.ts`)
- Модель есть в коде; **актуальная корзина** хранится в `users.cart` (embedded). Коллекция `carts` может использоваться в других сценариях.

## 🔗 Связи (основные)

- **Company → Users**: `companies.users[].user` → `users._id`
- **User → Company**: `users.company` → `companies._id`
- **Deal → User**: `deals.buyerId/sellerId/assignedTo/assignedBy` → `users._id`
- **Deal → Company**: `deals.buyerCompanyId/sellerCompanyId` → `companies._id`
- **Deal → Product**: `deals.products[].product` → `products._id` (+ `productSnapshot` fallback)
- **Product → Deal**: `products.dealId` → `deals._id`
- **Notification → User/Deal**: `notifications.userId` → `users._id`, `notifications.dealId` → `deals._id`
- **Chat**: `chatmessages.sessionId` → `chatsessions._id`; `chatsessions.userId` → `users._id`
- **Company → CompanyApiConfig**: `companies.apiConfig` → `companyapiconfigs._id`
- **Invitation → Company**: `invitations.company` → `companies._id`
- **Settings**: `systemsettings`, `marketpricesettings`, `perfectpairsettings`, `constantssettings` — синглтон-стиль (текущие настройки = последний документ по `updatedAt`)
- **BlacklistedCertificate**: `addedBy` → `users._id`, `dealId?` → `deals._id`

## ⚠️ Неоднозначности/ограничения (из кода)

- **Коллекции чата** заданы явно: `chatsessions`, `chatmessages`. Для остальных коллекций применяется стандартное pluralize Mongoose.
- **Product.company**: присутствует в типах/запросах; для полного списка полей/индексов см. `server/src/models/Product.ts` целиком.

---

*Последнее обновление: 2026-03 (сверено по `server/src/models/*.ts`).*

