# Phase 4 — Исследование: строки **Stonee** в UI и SEO, RF

**Дата:** 2026-05-14  
**Метод:** статический обзор репозитория (`rg` по `apps/frontend`). Исполнитель 04-01 подтверждает актуальность и дополняет GAP в `04-01-PLAN.md`.

## Исключения из карты «пользовательский текст»

Следующие совпадения **не** являются публичным брендом в смысле BRD-01:

- Импорты и типы: `@stonee/shared-types`, `isStoneeStaffRole`, enum-значения ролей `stonee_*`.
- Ключи `localStorage` / события: `stonee_locale`, `stonee_theme`, `stonee_session_id`, `stonee_staff_buyer_preview`, `stonee_wishlist_v1`, `stonee-wishlist`.
- URL API: `…/ingest/stonee-json` (технический контракт).
- Путь ассета: `/assets/stonee_logo.png`, файл `public/assets/stonee_logo.png`.

## `document.title` и статический HTML

| Источник | Содержимое (наблюдение 2026-05-14) |
|----------|-------------------------------------|
| `apps/frontend/index.html` | `<title>Stonee · Bespoke Jewelry Atelier</title>`; meta description / og:title / twitter:title с **Stonee**; `og:locale` = `en_US`; `<html lang="en">` |
| `Seo.tsx` | `fullTitle`: если `title` не содержит подстроку `stonee` (lower), добавляется ` · Stonee`; `og:site_name` = `Stonee`; default OG image `stonee_logo.png` |
| `HomePage.tsx` | `<Seo title="Stonee — Bespoke Jewelry Atelier" … />` (хардкод EN) |
| `AboutPage.tsx` | `title={\`${t('about.badge')} — Stonee\`}` |
| `DiamondDetailPage.tsx` | loading state: `title="Stonee · Diamond"` |
| Остальные страницы с `<Seo>` | Заголовки из i18n (`cart`, `wishlist`, `marketplace`, `diamond.*`) — часть значений ниже содержит **Stonee** в JSON переводов |

## Компоненты (сырой текст / alt)

| Файл | Наблюдение |
|------|------------|
| `Navbar.tsx` | Текст логотипа: `<span>Stonee</span>` (десктоп; проверить мобильные ветки в том же файле) |
| `Footer.tsx` | Три поверхности: `<span>Stonee</span>` рядом с `BrandMark` |
| `BrandMark.tsx` | default `alt = 'Stonee atelier'`; комментарии «Stonee» |
| `Seo.tsx` | см. выше |
| `icons/index.tsx` | комментарий про набор иконок Stonee — не UI |

## i18n: модули с подстрокой «Stonee» / «stonee» в **значениях** (user-visible)

Пары `ru` / `en` (ключи даны для ориентира; полный список — по файлам):

| Модуль | Примечание |
|--------|--------------|
| `home.ts` | `whyStonee2` = «Stonee» / «Stonee» |
| `footer.ts` | `copyright` — «Stonee Atelier» |
| `about.ts` | основной абзац — имя Stonee |
| `auth.ts` | `joinItalic`, плейсхолдер staff, подписи ролей «Stonee — …» |
| `concierge.ts` | `brandLine1` |
| `education.ts` | `badge` («Stonee standard») |
| `cart.ts` | `seoDescription`, `warrantyBody` |
| `checkout.ts` | доверительные строки (Stripe, шифрование, страхование доставки) |
| `orders.ts` | `delivered` — «thank you for choosing Stonee» |
| `wishlist.ts` | `seoDescription` |
| `diamond.ts` (ru) | `seoDescription` шаблон — «ателье Stonee» |
| `supplier.ts` | многочисленные «операции Stonee», «каталог Stonee» — B2B копирайт |
| `merchant.ts` | «экосистема Stonee», «шлюз Stonee», «Команда Stonee» |
| `security.ts` (en) | `subtitle` — Stonee account |

Модули **без** вхождения Stonee в значениях по выборочной проверке: `common.ts`, `nav.ts` (подзаголовок бренда «Ателье» без имени 2B3C).

## Open Graph / Twitter (динамика)

Helmet из `Seo` дублирует/переопределяет часть тегов из `index.html` после загрузки приложения; краулеры без JS видят только статический `index.html` — **критично** выровнять статический блок под BRD-01/02.

## Чеклист пунктов РФ (вход для `info/PRODUCT.md`)

Исполнитель 04-02 переносит в продуктовый чеклист и помечает **Done** / **Deferred** + rationale:

1. **Default locale `ru`** в runtime i18n — уже Done (код).
2. **`<html lang>` статический** в `index.html` vs runtime — зафиксировать решение (часто `lang="ru"`).
3. **Статические meta `og:locale`** — `ru_RU` vs `en_US` / дубли `og:locale:alternate` — по политике SEO (минимум — согласованность с primary RU).
4. **Юридические и финансовые утверждения** в `checkout.ts` (страхование Lloyd's, формулировки про «не храним реквизиты») — для рынка РФ: юридический review или Deferred.
5. **Персональные данные / оферта / политика** — ссылки в футере сейчас `href="#"` — не локализация имени; отдельный трек, можно Deferred с отсылкой к будущей юридической странице.
6. **Форматы чисел/валюты** для витрины — проверить единообразие с `displayI18n` и отчётом в чеклисте (Done/Partial/Deferred).

---
*Инвентаризация планировщиком; 04-01 дополняет связью с BRD и GAP-ID.*
