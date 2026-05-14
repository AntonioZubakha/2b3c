# Phase 1 — Research (inline)

**Date:** 2026-05-14  
**Mode:** `--skip-research` equivalent — краткий обзор без внешних агентов.

## Findings

1. **Два URL уже разделены:** `/collections` (готовые SKU) и `/craft` (конфигуратор). Пробел продукта скорее в **онбординге и копирайте** (пользователь не понимает два пути), чем в отсутствии страниц.
2. **Корзина:** `JewelryPage` шлёт `type: 'jewelry'`; craft — см. `CraftPage` / `useBespoke` для финального add-to-cart (нужно подтвердить в коде summary-шага при планировании 01-02).
3. **Риск:** дублирование логики цен/наличия между маркетплейсом камней и craft — при изменениях проверять оба потока.

## Unknowns (для 01-01 audit)

- Точное тело запроса «add to cart» из `CraftPage` summary vs `JewelryPage`.
- Есть ли готовые украшения вне `/collections` (например, ссылки с Home).

## RESEARCH COMPLETE

Дальше: планы `01-01` … `01-03`.
