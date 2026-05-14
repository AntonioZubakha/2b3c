# Phase 1: Два сценария каталога — Context

**Gathered:** 2026-05-14  
**Status:** Ready for planning  
**Source:** Brownfield sync — `PROJECT.md`, `REQUIREMENTS.md`, `info/FRONTEND.md`, `info/PRODUCT.md`, codebase map.

## Phase boundary

Закрыть **CAT-01, CAT-02, CAT-03**: два независимых покупательских пути до **корзины** — готовые украшения и конфигуратор «оправа → камни» — без противоречий в типах позиций корзины и API.

## Implementation decisions (locked for this phase)

1. **Готовое украшение (CAT-01)** — витрина коллекций на маршруте `/collections` (`JewelryPage`), добавление в корзину с `type: 'jewelry'` и `productId: sku` (см. `apps/frontend/src/pages/JewelryPage.tsx`).
2. **Оправа + камни (CAT-02)** — мастер на `/craft` (`CraftPage`): шаги `jewelry` → `diamond` → `summary`, контекст bespoke (`useBespoke`), совместимость через `@stonee/shared-types` (`inferSettingType`, категории оправ).
3. **Согласованность (CAT-03)** — корзина и order-service должны принимать оба типа позиций; инвалидация React Query через `orderQueryKeys.carts()` после добавления (уже паттерн во фронте).

## Canonical references

- `info/PRODUCT.md` — продукт 2B3C, два сценария, РФ, Rare Carat как ориентир.
- `info/FRONTEND.md` — маршруты, корзина, gateway paths.
- `info/JEWELRY_SETTINGS.md` — совместимость камень ↔ оправа.
- `.planning/codebase/ARCHITECTURE.md` — gateway и сервисы.
- `apps/frontend/src/pages/CraftPage.tsx` — пошаговый craft flow.
- `apps/frontend/src/pages/JewelryPage.tsx` — готовые изделия.

## Specific ideas

- Редирект `/bespoke` → `/craft` уже есть; не плодить третий URL без причины.
- После логина buyer уходит на `/craft` (`AuthPage`) — это усиливает сценарий CAT-02; для CAT-01 нужна явная навигация на `/collections` с Home/Marketplace.

## Deferred

- Полный ребрендинг UI на «2B3C» — фаза 4.
- Платежи и трекинг — фазы 2–3.

---
*Phase: 01-two-catalog-paths*
