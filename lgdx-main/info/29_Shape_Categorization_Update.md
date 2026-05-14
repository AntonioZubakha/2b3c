# Обновление системы категоризации форм бриллиантов

**Дата**: Декабрь 2024 — реализовано ✅

## Суть изменения

Старая группировка форм заменена на конкретные формы для более точного маркетпрайса и аналитики.

**Старый enum** (`ShapeCategory`):
```typescript
ROUND | SQUARE_RECTANGULAR | ELONGATED_DROPLET | FANCY
```

**Новый enum** (начиная с этого обновления):
```typescript
ROUND | OVAL | PEAR | CUSHION | EMERALD | RADIANT | PRINCESS | MARQUISE | HEART | ASSCHER | FANCY
```
`FANCY` — по-прежнему fallback для всех нераспознанных форм.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `market-price-calculator-service/src/types/index.ts` | Обновлён enum `ShapeCategory` |
| `market-price-calculator-service/src/calculator.ts` | Обновлена `determineShapeCategory()` |
| `market-price-calculator-service/src/db/models.ts` | Обновлена модель `ProductCategoryStats` |
| `analytics-service/src/utils/constants.ts` | Обновлён массив `MAIN_SHAPES` |
| `client/.../CategoryStatsTable.tsx` | Новый порядок сортировки шейпов, CSS индикаторы |
| `client/.../MarketOverview/constants.ts` | Обновлён `MAIN_SHAPES` |

## Совместимость

Старые записи `ProductCategoryStats` со старыми ключами (`SQUARE_RECTANGULAR` и т.п.) postепенно вытесняются при каждом пересчёте калькулятора — новые сессии записывают данные с новыми ключами.
