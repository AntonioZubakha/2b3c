# 📚 LGDX API Reference (актуально по `server/src/routes/*`)

## 🎯 Обзор

- **Базовый URL (prod)**: `https://lgdeal.com`
- **Префикс API**: `/api`
- **Health**: `/health/*`
- **WebSocket**:
  - **Deals (Socket.IO)**: `/socket.io` (namespace `/deal`)
  - **Chat (ws)**: `/api/chat/ws`

## 🔐 Аутентификация и авторизация

- **Источник истины**: `server/src/middleware/auth.ts`, `server/src/middleware/adminAuth.ts`
- **Основной механизм**: JWT в **HttpOnly cookie** `authToken` (браузер).
- **Legacy (только не‑prod)**: заголовок `x-auth-token` (в production игнорируется).

### Пример (curl) с cookie

```bash
# Логин: сервер выставит Set-Cookie: authToken=...
curl -i -X POST "http://localhost:5001/api/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"user@example.com\",\"password\":\"password\"}"

# Дальше передаем cookie (пример для curl на Windows / PowerShell: используйте -b)
curl -s "http://localhost:5001/api/auth/me" -b "authToken=<JWT>"
```

### Уровни доступа (по middleware)

- **Public**: без auth
- **Auth**: `authMiddleware` (допускает unverified пользователей, но ограничивает часть операций)
- **Full access (verified)**: `fullAccessMiddleware` (требует email verification, кроме LGDEAL staff)
- **Admin/Supervisor**: `adminAuthMiddleware`
- **Full admin only**: `fullAdminOnly`

## 📦 Формат ответов

В коде есть стандартизированные типы (`server/src/types/responses.ts`), но отдельные контроллеры могут возвращать доменные поля.

Базовые формы:

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "message": "..." , "code": "..." , "details": {} }
```

## ✅ Полный список эндпоинтов (gateway `server/`)

Ниже перечислены **реальные маршруты** (Express) из `server/src/routes/*.ts`.

### Core

- **GET** `/api/test` — Public

### Auth (`/api/auth`)

- **POST** `/api/auth/register` — Public
- **POST** `/api/auth/login` — Public
- **POST** `/api/auth/create-admin` — Public (доп. секрет в body)
- **GET** `/api/auth/me` — Auth
- **PUT** `/api/auth/me` — Auth
- **POST** `/api/auth/me/telegram-link-request` — Auth
- **POST** `/api/auth/change-password` — Auth
- **POST** `/api/auth/logout` — Auth
- **POST** `/api/auth/refresh` — Auth
- **POST** `/api/auth/verify-email` — Public
- **POST** `/api/auth/resend-verification` — Public
- **GET** `/api/auth/test-verification-token` — Public (**TEMPORARY** в коде)
- **GET** `/api/auth/registrations-enabled` — Public
- **POST** `/api/auth/request-password-reset` — Public
- **POST** `/api/auth/reset-password` — Public
- **POST** `/api/auth/verify-phone` — Public
- **POST** `/api/auth/resend-phone-verification` — Public
- **POST** `/api/auth/request-phone-verification` — Public

### Company (`/api/company`)

Пользовательские/командные операции (Auth):

- **GET** `/api/company/users`
- **POST** `/api/company/invite`
- **POST** `/api/company/invitations/:id/revoke`
- **POST** `/api/company/invitations/:id/resend`
- **POST** `/api/company/invitations/accept` — Public
- **PUT** `/api/company/users/:userId/activate`
- **PUT** `/api/company/users/:userId/role`
- **DELETE** `/api/company/users/:userId`
- **GET** `/api/company/profile`
- **PUT** `/api/company/profile`
- **POST** `/api/company/logo` (upload + rate limit)
- **GET** `/api/company/roles`

Админские операции (`adminAuthMiddleware`):

- **GET** `/api/company/`
- **GET** `/api/company/onboarding-requests`
- **PUT** `/api/company/:companyId/approve`
- **PUT** `/api/company/:companyId/reject`
- **GET** `/api/company/:id`
- **PUT** `/api/company/:companyId/roles`

> ⚠️ **Важное (реальное поведение по коду):** в `server/src/routes/company.ts` маршруты объявлены в порядке, при котором
> `GET /api/company/:id` стоит **раньше**, чем `GET /api/company/roles` и `PUT /api/company/:companyId/roles`.
> Это означает, что запросы на `/api/company/roles` (и потенциально `/api/company/<id>/roles`) будут матчиться как `/:id`
> и падать на валидации/404. Эндпойнты “roles” перечислены выше потому что они **присутствуют в коде**, но на текущий момент
> могут быть **недостижимы** без исправления порядка роутов.

### Inventory (`/api/inventory`)

- **POST** `/api/inventory/upload` — Auth (upload + rate limit)
- **GET** `/api/inventory/` — Auth
- **GET** `/api/inventory/:id` — Auth
- **PUT** `/api/inventory/:id` — Auth

> В этой системе “инвентарь” — это загрузка/импорт стока; публичного `/api/products/*` в gateway **нет**. Marketplace доступен по `/api/marketplace/*`.

### Marketplace (`/api/marketplace`)

- **GET** `/api/marketplace/home-stats` — Public
- **POST** `/api/marketplace/demo-request` — Public (rate limit)
- **GET** `/api/marketplace/` — Optional auth
- **GET** `/api/marketplace/find-pair` — Optional auth
- **GET** `/api/marketplace/suppliers` — Auth
- **GET** `/api/marketplace/shapes` — Optional auth
- **GET** `/api/marketplace/colors` — Optional auth
- **GET** `/api/marketplace/clarities` — Optional auth
- **GET** `/api/marketplace/cuts` — Optional auth
- **GET** `/api/marketplace/filter-stats` — Optional auth
- **GET** `/api/marketplace/search` — Optional auth
- **GET** `/api/marketplace/product/:productId` — Auth
- **GET** `/api/marketplace/product/:productId/price-history` — Auth
- **GET** `/api/marketplace/product/:productId/similar` — Auth
- **GET** `/api/marketplace/lgdeal` — Public (placeholder)

### Cart (`/api/cart`) — Auth

- **GET** `/api/cart/`
- **POST** `/api/cart/add`
- **DELETE** `/api/cart/remove/:itemId`
- **PUT** `/api/cart/update`
- **DELETE** `/api/cart/clear`

### Deals (`/api/deal`)

- **GET** `/api/deal/buyer` — Auth
- **GET** `/api/deal/seller` — Auth
- **GET** `/api/deal/supervisor-dashboard` — Auth + Supervisor helper
- **GET** `/api/deal/dashboard` — Auth (legacy)
- **GET** `/api/deal/buyer-to-lgdeal` — Auth (legacy)
- **GET** `/api/deal/lgdeal-to-seller` — Auth (legacy)
- **GET** `/api/deal/:dealId` — Auth
- **GET** `/api/deal/:dealId/state` — Auth
- **GET** `/api/deal/:dealId/invoice/download` — Auth
- **GET** `/api/deal/lgdeal/managers` — Auth + Supervisor
- **GET** `/api/deal/lgdeal/managers/count` — Auth + Supervisor
- **GET** `/api/deal/lgdeal/logists` — Auth
- **POST** `/api/deal/initiate-from-cart` — Full access (verified)
- **POST** `/api/deal/:dealId/action/:actionName` — Full access (verified)
  - `upload_invoice` использует `multipart/form-data` (поле `invoice`)

### Stripe (`/api/stripe`)

- **GET** `/api/stripe/publishable-key` — Public
- **POST** `/api/stripe/webhook` — Public (проверка подписи; raw body)
- **POST** `/api/stripe/payment-intent/:dealId` — Full access (verified)
- **GET** `/api/stripe/payment-intent/:dealId/status` — Full access (verified)
- **POST** `/api/stripe/payment-intent/:dealId/check-status` — Full access (verified)
- **POST** `/api/stripe/payment-intent/:dealId/cancel` — Full access (verified)
- **POST** `/api/stripe/refund/:dealId` — Supervisor-only

### Chat (`/api/chat`)

Guest:

- **POST** `/api/chat/guest/session` — Public (rate limit)
- **GET** `/api/chat/guest/messages/:sessionId` — Guest session auth (rate limit)
- **POST** `/api/chat/guest/send` — Guest session auth (rate limit)

Authenticated:

- **POST** `/api/chat/session` — Auth
- **GET** `/api/chat/messages/:sessionId` — Auth
- **POST** `/api/chat/send` — Auth
- **PUT** `/api/chat/read/:sessionId` — Auth
- **GET** `/api/chat/unread-count` — Auth
- **GET** `/api/chat/sessions` — Auth
- **PUT** `/api/chat/close/:sessionId` — Auth
- **GET** `/api/chat/ai-settings` — Auth
- **PUT** `/api/chat/ai-settings` — Auth
- **PUT** `/api/chat/session/:sessionId/ai` — Auth
- **GET** `/api/chat/ws` — WebSocket upgrade endpoint

### Notifications (`/api/notifications`) — Auth

- **GET** `/api/notifications/`
- **GET** `/api/notifications/unread`
- **GET** `/api/notifications/unread-count`
- **PUT** `/api/notifications/read-all`
- **PUT** `/api/notifications/:id/read`
- **DELETE** `/api/notifications/:id`

### Files (`/api/files`)

- **GET** `/api/files/:category/:filename` — Auth

`category` allowlist (по коду): `invoices`, `shipping`, `company_logos`, `market_news`, `root`.

### Market news (`/api/market-news`)

- **GET** `/api/market-news/` — Public
- **POST** `/api/market-news/` — Admin/Supervisor
- **POST** `/api/market-news/upload-image` — Admin/Supervisor (upload)
- **PUT** `/api/market-news/:id` — Admin/Supervisor
- **DELETE** `/api/market-news/:id` — Admin/Supervisor

### Admin FTP (`/api/admin/ftp`) — Admin/Supervisor

- **GET** `/api/admin/ftp/companies`
- **POST** `/api/admin/ftp/companies/:companyId/create`
- **POST** `/api/admin/ftp/companies/:companyId/set-legacy`
- **POST** `/api/admin/ftp/companies/:companyId/sync`
- **POST** `/api/admin/ftp/sync-all`
- **PUT** `/api/admin/ftp/companies/:companyId/config`
- **POST** `/api/admin/ftp/companies/:companyId/reset-password`
- **DELETE** `/api/admin/ftp/companies/:companyId`
- **GET** `/api/admin/ftp/stats`

### Admin (`/api/admin`) — Admin/Supervisor (+ часть full-admin-only)

Основные:

- **GET** `/api/admin/users`
- **GET** `/api/admin/users/:id`
- **PUT** `/api/admin/users/:id/company`
- **PUT** `/api/admin/users/:id/activate`
- **PUT** `/api/admin/users/:id/role`
- **PUT** `/api/admin/users/:id/details`
- **POST** `/api/admin/users/:id/force-verify-phone`
- **POST** `/api/admin/users/:id/force-verify-email`
- **DELETE** `/api/admin/users/:id`
- **DELETE** `/api/admin/users/:id/hard`
- **GET** `/api/admin/companies`
- **GET** `/api/admin/companies/:id`
- **PUT** `/api/admin/companies/:id`
- **POST** `/api/admin/companies`
- **DELETE** `/api/admin/companies/:id`
- **DELETE** `/api/admin/companies/:id/hard`
- **GET** `/api/admin/onboarding-requests`
- **PUT** `/api/admin/companies/:companyId/approve`
- **PUT** `/api/admin/companies/:companyId/reject`
- **GET** `/api/admin/impersonate/:userId`
- **DELETE** `/api/admin/cleanup-test-users`
- **GET** `/api/admin/suppliers-stock`
- **POST** `/api/admin/suppliers-stock/:companyId/delete-stock`

Company API config (админ):

- **GET** `/api/admin/company-api/:companyId/config`
- **PUT** `/api/admin/company-api/:companyId/config`
- **POST** `/api/admin/company-api/:companyId/sync`
- **POST** `/api/admin/sync-all-active-apis`
- **GET** `/api/admin/sync-queue-status`
- **PUT** `/api/admin/company-api/:companyId/reset-sync`
- **DELETE** `/api/admin/company-api/:companyId`

Full-admin-only настройки:

- **GET** `/api/admin/system-settings`
- **PUT** `/api/admin/system-settings`
- **POST** `/api/admin/system-settings/registrations/toggle`
- **GET** `/api/admin/system-settings/history`
- **GET** `/api/admin/perfect-pair-settings`
- **PUT** `/api/admin/perfect-pair-settings`
- **GET** `/api/admin/constants-settings`
- **PUT** `/api/admin/constants-settings`
- **GET** `/api/admin/market-price-settings`
- **PUT** `/api/admin/market-price-settings`
- **POST** `/api/admin/trigger-market-calculation`

### Analytics (admin) (`/api/analytics`) — Admin/Supervisor

- **GET** `/api/analytics/user-activity`
- **GET** `/api/analytics/page-views`

### CSP report (`/api/csp-report`)

- **POST** `/api/csp-report/` — Public (204)

### Health (`/health`)

- **GET** `/health/`
- **GET** `/health/detailed`
- **GET** `/health/ready`
- **GET** `/health/live`
- **GET** `/health/sync`
- **GET** `/health/import`
- **GET** `/health/calculator`
- **GET** `/health/db`
- **GET** `/health/redis`
- **GET** `/health/queue`

### Metrics (Prometheus)

- **GET** `/metrics` — Public (Prometheus scrape format; в production рекомендуется ограничить доступ)

### SEO sitemap

- **GET** `/sitemap.xml`

---

*Последнее обновление: 2026-03 (сверено по `server/src/index.ts`, `server/src/routes/*`, `server/src/middleware/auth.ts`).*
