# Roadmap: 2B3C (brownfield Stonee)

## Overview

Довести существующий монорепо до **двух явных покупательских сценариев** в каталоге, **согласованного чекаута** и **прозрачного трекинга**, закрепить бренд **2B3C** и **РФ**-фокус в продукте, не ломая текущий стек. Качество — через тесты, линт и smoke. Фазы — вертикальные срезы (MVP-mode), чтобы каждая фаза давала проверяемый пользовательский результат.

## Phases

- [x] **Phase 1: Два сценария каталога** — готовое украшение и оправа+камни до корзины. *(2026-05-14)*
- [x] **Phase 2: Чекаут и заказ** — оплата и статусы заказа для обоих путей. *(2026-05-14)*
- [x] **Phase 3: Трекинг** — изготовление/доставка понятны покупателю. *(2026-05-14)*
- [ ] **Phase 4: Бренд и локаль РФ** — 2B3C в UI/копирайте, основы локализации под РФ.
- [ ] **Phase 5: Качество репозитория** — тесты, линт, smoke как обязательный контур перед релизными ветками.

## Phase Details

### Phase 1: Два сценария каталога

**Goal:** Покупатель может завершить оба пути от каталога до корзины без противоречий в данных.  
**Mode:** mvp  
**Depends on:** Nothing (first phase)  
**Requirements:** CAT-01, CAT-02, CAT-03  

**Success Criteria:**

1. Из UI доступен поток «готовое украшение» с выбором SKU и добавлением в корзину.
2. Из UI доступен поток «оправа → совместимые камни» с добавлением комплекта в корзину.
3. Документированы границы сценариев в `info/PRODUCT.md` и при необходимости `info/FRONTEND.md`.

**Plans:** 3 plans (`.planning/phases/01-two-catalog-paths/01-0N-PLAN.md`)

Plans:

- [x] 01-01-PLAN.md — Аудит UI/API vs CAT-01/CAT-02/CAT-03 и фиксация пробелов *(2026-05-14)*
- [x] 01-02-PLAN.md — Закрытие пробелов (Navbar, Craft cart-first, Cart recommendations/CTA) *(2026-05-14)*
- [x] 01-03-PLAN.md — Регресс: тесты, lint, обновление info/FRONTEND.md и info/PRODUCT.md *(2026-05-14)*

### Phase 2: Чекаут и заказ

**Goal:** Единый чекаут и оплата покрывают оба сценария; статусы заказа согласованы с бэкендом.  
**Mode:** mvp  
**Depends on:** Phase 1  
**Requirements:** ORD-01, ORD-02  

**Success Criteria:**

1. Успешный тестовый чекаут (в т.ч. симуляция, если включена политикой окружения) для обоих типов позиций.
2. В `info/` зафиксированы статусы заказа и расхождения «обещано в UI / есть в API».
3. Нет критичных пунктов из `.planning/codebase/CONCERNS.md` без явного решения или тикета.

**Plans:** 2 plans (`.planning/phases/02-checkout-order/02-0N-PLAN.md`)

Plans:

- [x] 02-01-PLAN.md — Аудит: jewelry / bespoke / diamond через корзину → checkout → order; gateway; GAP vs ORD-01/ORD-02 *(2026-05-14)*
- [x] 02-02-PLAN.md — Реализация и docs: order-service/frontend/gateway по GAP; info/API, SECURITY, FRONTEND; smoke *(2026-05-14)*

### Phase 3: Трекинг

**Goal:** Покупатель видит понятную линию статусов (изготовление и/или доставка).  
**Mode:** mvp  
**Depends on:** Phase 2  
**Requirements:** TRK-01, TRK-02  

**Success Criteria:**

1. Страница/блок «мой заказ» отражает статусы, которые реально приходят с API.
2. E2E или smoke сценарий обновлён под новые статусы.

**Plans:** 2 plans (`.planning/phases/03-tracking/03-0N-PLAN.md`)

Plans:

- [x] 03-01-PLAN.md — Read-only аудит: UI/i18n/smoke vs `OrderStatus`, GAP TRK-01/02, multi-source *(2026-05-14)*
- [x] 03-02-PLAN.md — Timeline + копирайт + info + smoke assert (без новых enum в бэкенде) *(2026-05-14)*

### Phase 4: Бренд 2B3C и РФ

**Goal:** Продукт читается как 2B3C; базовые РФ-аспекты в контенте и навигации.  
**Mode:** mvp  
**Depends on:** Phase 3  
**Requirements:** BRD-01, BRD-02  

**Success Criteria:**

1. Ключевые экраны показывают имя 2B3C (или согласованный lockup) без поломки деплоя.
2. Чеклист локализации РФ в `info/PRODUCT.md` закрыт на уровне «сделано / отложено».

**Plans:** TBD

Plans:

- [ ] 04-01: Бренд-замена в UI и метаданных — PLAN.md

### Phase 5: Качество репозитория

**Goal:** Линт, unit-тесты и smoke — обязательные шаги в рабочем цикле команды.  
**Mode:** mvp  
**Depends on:** Phase 4  
**Requirements:** QLT-01, QLT-02, QLT-03  

**Success Criteria:**

1. В `info/DEVELOPMENT.md` или `info/README.md` явно описан минимальный pre-merge чеклист.
2. Один прогон `pnpm run test` + `pnpm run lint` задокументирован как зелёный на чистом дереве.

**Plans:** TBD

Plans:

- [ ] 05-01: Скрипты/доки CI и локальной проверки — PLAN.md

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Два сценария каталога | 3/3 | Complete | 2026-05-14 |
| 2. Чекаут и заказ | 2/2 | Complete | 2026-05-14 |
| 3. Трекинг | 2/2 | Complete | 2026-05-14 |
| 4. Бренд и РФ | 0/TBD | Not started | - |
| 5. Качество репозитория | 0/TBD | Not started | - |

---
*Roadmap created: 2026-05-14 — brownfield continuation*
