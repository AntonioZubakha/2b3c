# Frontend (`apps/frontend`)

## Стек (из `package.json`)

- **React 18**, **TypeScript**
- **Vite 5** (`vite`, `@vitejs/plugin-react`)
- **Tailwind CSS v4** (`tailwindcss`, `@tailwindcss/vite`)
- **React Router 7** (`react-router`, `react-router-dom`)
- **Framer Motion**
- **i18next** + **react-i18next** — локали `ru` / `en`, ключ `stonee_locale`, `document.documentElement.lang` (см. `src/i18n/config.ts`)
- **Stripe** — `@stripe/react-stripe-js` на checkout
- **TanStack Query** (`@tanstack/react-query`) — серверное состояние на **маркетплейсе**, **карточке камня**, **корзине** и **checkout** (кэш, дедуп, `keepPreviousData` на маркетплейсе; корзина и оформление — `refetchOnMount: 'always'`)
- **Корзина (ключи и хук):** `src/lib/orderQuery.ts` — `orderQueryKeys` (`orderQueryKeys.cart(sessionId)`, префикс `orderQueryKeys.carts()` для инвалидации всех сессий), `useCartQuery`, `fetchCartBySession`. После **оплаты** (checkout), **добавления в корзину** (PDP, коллекции, craft) вызывается `invalidateQueries({ queryKey: orderQueryKeys.carts() })`, чтобы список на `/cart` и `/checkout` не залипал в кэше.

## Маршруты

Источник: `src/App.tsx`; обёртка **`AppRouteOutlet`** (`src/components/AppRouteOutlet.tsx`) — редиректы по роли / «поверхности» UI (поставщик не попадает на маркетплейс без нужного пути, staff без превью — с `/merchant` на `/`, и т.д.).

### Поверхности UI (`src/lib/uiSurface.ts`)

Поверхность **supplier** / **staff** включается только при наличии **`token`** в `localStorage`; без JWT «роль» из прошлой сессии игнорируется (иначе на `/auth` оставались бы вкладки партнёра).

- **buyer** — обычный покупатель и staff с флагом предпросмотра в `localStorage` (`stonee_staff_buyer_preview=1`): навбар с **ателье** (`/craft`) и **готовыми коллекциями** (`/collections`); без корзины у поставщика.
- **supplier** — роль `supplier`: партнёрский кабинет, маршруты `/supplier/*`.
- **staff** — роли `stonee_*`: полный навбар (ops + витрина), на **`/merchant`** чекбокс «Buyer UI preview» выставляет предпросмотр и ведёт на `/craft`.

| Путь | Компонент |
|------|-----------|
| `/` | `HomePage` |
| `/marketplace` | `MarketplacePage` |
| `/diamond/:id` | `DiamondDetailPage` |
| `/collections` | `JewelryPage` |
| `/craft` | `CraftPage` |
| `/bespoke` | `BespokePage` → `<Navigate to="/craft" replace />` |
| `/about` | `AboutPage` |
| `/auth` | `AuthPage` |
| `/wishlist` | `WishlistPage` |
| `/cart` | `CartPage` |
| `/checkout` | `CheckoutPage` |
| `/account/orders` | `OrdersPage` |
| `/account/orders/:orderId` | `OrderDetailPage` |
| `/account/vault` | `VaultPage` |
| `/account/security` | `SecurityPage` |
| `/merchant` | `MerchantDashboard` |
| `/supplier/portal` | `SupplierPortalPage` |
| `/supplier/orders` | `SupplierOrdersPage` |
| `/supplier/orders/:orderId` | `SupplierOrderDetailPage` |
| `/supplier/inventory` | `SupplierInventoryPage` |
| `/supplier/company` | `SupplierCompanyPage` |

После логина без `?redirect=`: покупатель → **`/craft`**, поставщик → **`/supplier/portal`**, staff → **`/merchant`** (`AuthPage`).

## Навбар и футер

- **`Navbar`**, **`Footer`**: ссылки и «лишние» действия (желания, корзина, консьерж, сейф) зависят от **`getUiSurface()`**; при **выходе** снимаются `token`, роли, контекст поставщика и ключ **`stonee_staff_buyer_preview`**.
- Поверхность **buyer**: в десктопном навбаре рядом показываются **`/craft`** (atelier) и **`/collections`** (готовые украшения) — оба пути до корзины доступны без бургер-меню.
- Финальный шаг **`CraftPage`** (summary): добавление bespoke в корзину через `POST /api/order/cart/.../add`, затем переход на **`/cart`** (гости уходят на **`/auth?redirect=%2Fcart`**). Отдельного чекаута на странице craft нет — оплата только через общий **`/checkout`** после корзины.
- Рекомендации на **`/cart`**: запрос `GET /api/recommendations/match/:sku` включается только если в корзине есть строка `type: 'jewelry'` с реальным SKU (не `BESPOKE-…`); логика вынесена в **`src/lib/cartRecommendationsSku.ts`** (`pickJewelryRecommendationSku`).
- **`/auth`** рендерится **с общим** Navbar/Footer, но без JWT поверхность **buyer**, чтобы не путать форму входа с вкладками партнёра.

## Партнёрский портал (детали)

- Данные реестра фидов: **`GET /api/supplier/self/registry`** (с JWT и `x-supplier-company-id`), а не публичный `/api/supplier/registry` — так в таблице не попадает чужой Diamond Atelier.
- Сводка и смена активной компании: повторный запрос **`/self/summary`** и **`/self/registry`** при изменении **`supplierCompanyId`** в `localStorage`.
- Страница **`/supplier/company`**: редирект на `/auth?redirect=…`, если нет **token**, роли **supplier** или **`supplierCompanyId`**.
- Страница **`/supplier/inventory`**: список строк каталога по **`catalogSupplierId`** активной компании (`GET /api/catalog/?supplierId=…`); те же условия редиректа, что и для company.

## API

Запросы на **`/api`** (прокси в `vite.config.ts` → gateway). Базовые пути: **`src/lib/api.ts`** (`GATEWAY`).

**Таймауты:** `apiFetch` / `apiJson` по умолчанию обрывают запрос через **`AbortController`** после **20 с** (переопределение: второй аргумент `{ timeoutMs: number }`). Это защищает UI от «вечного» ожидания при проблемах сети или шлюза.

- Маркетплейс: **`/api/search/filter`** (Redis-кэш, ограниченный `.select` на search-service).
- Карточка камня: **`/api/catalog/:id`**.
- Рекомендации на PDP: **`/api/recommendations/match/:sku`** (публичный `GET` на шлюзе).
- Поставщик (JWT + активная компания в **`x-supplier-company-id`**, шлюз подставляет из JWT): **`GET /api/supplier/self/summary`**, **`GET /api/supplier/self/registry`**, заказы **`GET /api/order/supplier/orders`**, **`GET /api/order/supplier/orders/:id`**, профиль компании **`GET/PATCH /api/user/auth/companies/:companyId`**, инвентарь витрины — публичный **`GET /api/catalog/?supplierId=<catalogSupplierId>&limit=…`** (см. `catalogSupplierId` в `/self/summary`).

## Медиа камня

`src/components/DiamondCatalogMedia.tsx`: приоритет **изображения из `images`**, иначе **`videoUrl`** (прямой файл → `<video>`, иначе `https` → `<iframe>`). Для карточек сетки — пресеты кропа по хосту (без доступа к DOM чужого iframe).

## Локализация

Ресурсы: `src/i18n/locales/{ru,en}/`. Доменные подписи к данным из API: модуль **`catalog`**, хелперы **`src/lib/displayI18n.ts`**.

## Заказы: подписи UI ↔ статус API

Источник статусов в API: `services/order-service/src/models/Order.ts`. После успешной оплаты (Stripe `confirm-stripe-payment`, webhook `payment_intent.succeeded`, или **`POST …/pay`** при разрешённой симуляции) бэкенд выставляет **`CONFIRMED`**, а не отдельный шаг **`PAID`**.

| UI label (i18n `orders.status.*`) | Значение `order.status` | Когда |
|-----------------------------------|---------------------------|--------|
| Pending payment | `PENDING` | Заказ создан, оплата не завершена |
| Paid — confirmed / Оплачено, подтверждён | `CONFIRMED` | Happy-path после оплаты |
| Paid / Оплачен | `PAID` | Только если данные/merchant выставили вручную; **не** результат стандартного checkout |
| Shipped / … | `SHIPPED` | Логистика (merchant / ops) |
| Delivered / … | `DELIVERED` | Завершение доставки |
| Cancelled / … | `CANCELLED` | Отмена |

Страницы: `OrdersPage.tsx`, `OrderDetailPage.tsx` — стили **`PAID`** и **`CONFIRMED`** для покупателя совпадают (оба «оплачено и зафиксировано» визуально); различие по тексту см. ключи выше.

### Buyer timeline (только `OrderStatus`)

- **Источник этапов на UI:** только поле **`status`** из **`GET /api/order/my-orders`** и **`GET /api/order/my-orders/:id`**. Отдельного поля «manufacturing» / подэтапов изготовления в JSON **нет** — шкала не должна показывать шаги вне enum.
- **Хелпер:** `apps/frontend/src/lib/orderTracking.ts` — `getOrderTrackingSteps(status)` возвращает узлы с `id: OrderStatus` и флаги `completed` / `current` для честного таймлайна на **`OrderDetailPage`**.
- **Контекст линии заказа:** по `items[].type` (например bespoke) можно показать текст ожидаемого процесса **как пояснение**, явно не выдавая его за отдельный сигнал бэкенда (см. `orderDetail.trackingContext*` в i18n).
- **Список заказов:** краткая подсказка под карточкой — **`orders.listHints.*`**, привязана к **`order.status`** (без фиксированного SLA при `SHIPPED` / `DELIVERED` / `CANCELLED`).

## Docker

См. `info/DEVELOPMENT.md`: `scripts/docker-frontend-entrypoint.sh` в образе фронта поднимает `pnpm install` и **`npm run dev -- --host`** (Vite).

## Production-сборка

В пакете фронта: `pnpm build` → `tsc -b` и `vite build`, артефакты в `dist/`. За reverse-proxy нужен тот же префикс **`/api`** на gateway.
