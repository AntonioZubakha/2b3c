# 💎 STONEE — Master Documentation v2.1
## AI-Driven Lab-Grown Diamond House | B2C Aggregator × Bespoke Atelier

> **Classification:** Internal & Confidential  
> **Version:** 2.1-Enterprise  
> **Last Updated:** 2026-05-09 (v2.1: P&L vs break-even, OpEx recalibration, ops default, payment/KYC honesty, см. [`info/README.md`](./README.md))  
> **Status:** Pre-Seed / MVP Stage  

**Актуальная техника и запуск:** см. [ARCHITECTURE.md](./ARCHITECTURE.md), [DEVELOPMENT.md](./DEVELOPMENT.md), [API.md](./API.md), [FRONTEND.md](./FRONTEND.md) — там отражено текущее состояние кода (gateway, Docker, Stripe, `/craft`, i18n).

---

## 📋 Table of Contents

1. [Executive Summary](#1-executive-summary)  
   - [1.4 Operational readiness vs documentation](#14-operational-readiness-vs-documentation) · [1.5 Funding Requirements](#15-funding-requirements)
2. [Market Intelligence](#2-market-intelligence)
3. [Product Strategy & Positioning](#3-product-strategy--positioning)
4. [Competitive Landscape](#4-competitive-landscape)
5. [Business Model & Unit Economics](#5-business-model--unit-economics)
6. [Go-To-Market Strategy](#6-go-to-market-strategy)  
   - [6.0 Jurisdictional architecture](#60-jurisdictional-architecture-юрисдикционная-модель)
7. [Technical Architecture](#7-technical-architecture)
8. [Data & AI Strategy](#8-data--ai-strategy)
9. [Security, Compliance & Risk Management](#9-security-compliance--risk-management)
10. [Operations & Logistics: The Stonee Loop](#10-operations--logistics-the-stonee-loop)
11. [Financial Projections (3-Year)](#11-financial-projections-3-year)
12. [Risk Matrix & Mitigation](#12-risk-matrix--mitigation)
13. [Roadmap](#13-roadmap)
14. [Team & Organizational Structure](#14-team--organizational-structure)
15. [Appendices](#15-appendices)

---

## 1. Executive Summary

**Stonee** — технологическая платформа, замыкающая цепочку поставок лабораторных алмазов от производителей (Сурат, Индия) до конечного потребителя через AI-драйвенный агрегатор и конфигуратор bespoke-ювелирки.

### 1.1 Core Thesis
Рынок lab-grown diamonds (LGD) растет на **12–14% CAGR** и достигнет **$91–109 млрд к 2034–2035** [^1^][^5^]. Сегмент до 2 карат занимает **~70% рынка** [^5^]. При этом индустрия остается фрагментированной: покупатель сталкивается с непрозрачным ценообразованием, отсутствием единого стандарта оценки «цена/качество» и высоким порогом доверия при онлайн-покупке товаров >$2,000.

### 1.2 Value Proposition
- **For Consumer:** Алгоритмическая оценка Deal Score, прозрачная цепочка поставок (Surat → Hub → Client), медиа на камень, bespoke-конфигуратор; на high-ticket (**$1.5–4K**) покупают **доверие и сопровождение**, не только цену — **concierge и честные сроки** важнее второго десятка процентов «скидки».
- **For Business:** Zero-inventory модель на loose diamonds, гибридная маржа на jewelry (35–50%), данные о рыночных трендах в реальном времени.

### 1.3 Key Metrics (Realistic Targets)
| Metric | Conservative | Target | Aggressive (organic-heavy blend) |
|--------|-------------|--------|----------------------------------|
| Avg. Order Value (AOV) | $1,800 | $2,400 | $3,200 |
| Customer Acquisition Cost (CAC) | $180 | $140 | **$110** |
| Conversion Rate | 0.8% | 1.2% | 1.8% |
| Gross Margin (Loose) | 8% | 12% | 15% |
| Gross Margin (Bespoke) | 35% | 45% | 55% |
| Repeat Purchase Rate (24M), bridal / engagement | **3%** | **4%** | **6%** |
| LTV / CAC Ratio (ориентир) | 2.5× | 3.5× | 4.5× |

> **⚠️ CAC и финмодель:** в paid-каналах engagement jewelry у лидеров (Brilliant Earth, James Allen) CAC обычно **$120–$250+**. Значение **$80** из ранних черновиков **исключено** из таблицы — оно вводило бы инвестора в заблуждение как «агрессивный, но типичный» сценарь. Колонка **Aggressive ($110)** допустима только при **сильном перекосе в органику/рефералки** и амортизации контента; для **P&L и break-even** в документе далее используется **blended CAC $140** (см. §5.2–5.3). Для **нового бренда** без сильного SEO/UGC **стресс-тест** модели на **blended CAC $180–220** и **отдельном учёте paid vs organic** в отчётах — обязателен перед масштабированием paid.

### 1.4 Operational readiness vs documentation

| Ось | Статус (честно) | Комментарий |
|-----|-----------------|-------------|
| **Продукт / код** | 🟡 MVP | Compose, gateway, Stripe; **нет** production KYC, **нет** crypto в UI, бэкапы — процесс + шаблон скрипта. |
| **Юридика / комплаенс** | 🔴 до подтверждения | DMCC/банк — вне репозитория; см. §9.1, `SECURITY.md`. |
| **Операции / логистика** | 🔴 до пилота | Схема A в `OPERATIONS_MANUAL.md` — пока **план**; нужны брокер, тестовая отправка, агент в Сурате. |
| **Финансы** | 🟡 | P&L v2.1 согласован; **cash runway** часто короче EBITDA-runway (§11.3). |
| **Команда** | 🔴 на бумаге | FTE в §11.2 — **целевой** состав, не факт найма. |

**Инсайт:** сильная документация ≠ работающая **операционная машина**. Следующий режим — **Lean pilot** (`OPERATIONS_MANUAL.md` §5–8): 10–20 реальных заказов, метрики, DD.

### 1.5 Funding Requirements
- **Seed Round:** $350K–$500K
- **Runway:** ориентир **12–18 мес** зависит от **cash** (не только EBITDA); помесячный forecast и триггер bridge при **<$150K** или **<6 мес** runway — см. §11.3
- **Use of Funds:** 40% Product & Engineering, 30% Inventory Buffer & Ops, 20% Marketing, 10% Legal & Compliance

---

## 2. Market Intelligence

### 2.1 Global Market Size
| Year | Market Size (LGD) | CAGR | Source |
|------|-------------------|------|--------|
| 2025 | $29.46–31.38 Bn | — | [^1^][^2^] |
| 2026 | $33.54 Bn | 13.42% | [^5^] |
| 2034 | $91.85 Bn | 13.42% | [^5^] |
| 2035 | $108.98 Bn | 13.87% | [^1^] |

**Total Diamond Market (Natural + LGD):** в тексте ранее указывалось **$42.74 Bn (2025)** рядом с оценками **LGD ~$29–31 Bn** [^8^]. **Эти цифры нельзя вычитать друг из друга как «natural = total − LGD»:** отчёты используют **разные границы** (ювелирный розничный рынок vs весь «diamond value chain», полированый vs шлифовка/промышленность и т.д.). Публичные оценки **природного** сегмента часто лежат в диапазоне **~$60–90 Bn+** (Bain/De Beers и др. — другая методология). Для питча и модели нужно **один согласованный источник и одна дефиниция рынка**; смешение рядов из разных таблиц **занижает** natural при наивном вычитании.

### 2.2 Segment Breakdown
- **By Size:** Below 2 ct = **70.49%** (2026), 2–4 ct = растущий премиум-сегмент [^5^].
- **By Application:** Fashion/Jewelry — highest CAGR (15.06%); Industrial — доминирует по объему (72.86%) [^5^].
- **By Region:** Asia Pacific = 34.54% ($10.18 Bn), North America = 29.23% ($8.61 Bn), Europe = 21.16% [^5^].

### 2.3 Consumer Trends
1. **Gen Z & Millennials:** Предпочитают ethical sourcing; 73% молодых покупателей рассматривают LGD для engagement rings.
2. **Customization:** Растет спрос на bespoke (сделано на заказ) — кольца с уникальными оправами.
3. **Digital-First:** 65% покупателей jewelry начинают journey с онлайн-исследования, но конверсия требует high-touch консультации.
4. **Price Sensitivity:** LGD стоят на 60–85% дешевле природных аналогов; основной драйвер — «больше камень за те же деньги».

### 2.4 Supply Side (Surat, Индия, Китай)
- **Природные камни:** Сурат — крупнейший центр **огранки и торговли** полированым бриллиантом; оценка порядка **~90% мирового объёма огранки** относится к **natural** и **не** переносится на LGD как «монополия Сурата».
- **Lab-grown:** массовый **HPHT** (особенно мелкий/средний размер) исторически силён в **Китае** (**более половины** мирового выпуска по разным оценкам); **Индия** сильна в **CVD**, доработке и огранке LGD, но **не** является единственным производителем. Утверждение «Сурат режет 90% всех алмазов включая LGD» **вводит в заблуждение** — для LGD цепочка **Китай ↔ Индия ↔ хабы** многополярна.
- **RapNet** — распространённый B2B-канал листингов; **Instant Inventory** и прочие API — **платные** (membership **тысячи $/год**, лимиты запросов — закладывать в OpEx, см. §11.2).
- Поставщики также: IDEX, прямые XML/CSV, реже — REST без RapNet.

---

## 3. Product Strategy & Positioning

### 3.1 Product Hierarchy
```
Stonee Platform
├── 1. Loose Diamond Intelligence (Aggregator)
│   ├── AI Deal Score
│   ├── 360° Viewer + Certificate (GIA/IGI)
│   ├── Compare Tool (до 4 камней)
│   └── Concierge Chat (WhatsApp/TG)
├── 2. Bespoke Builder (Ring Configurator)
│   ├── Stone Selector
│   ├── Setting Studio (3D preview)
│   └── Price Builder (real-time)
├── 3. Curated Collections (Ready-to-Ship)
│   ├── Trend Drops (Limited editions)
│   ├── Essentials (Studs, Tennis bracelets)
│   └── Bridal (Pre-set rings)
└── 4. Stonee Pro (B2B Portal) — **отложено до после Series A / ~$500K+ GMV-мес**
    ├── Wholesale pricing
    ├── API access for jewelers
    └── White-label dropshipping
```

**Инвентарная стратегия (без когнитивного диссонанса «zero inventory»):**
1. **Loose diamonds:** zero inventory — агрегатор, резерв у поставщика после оплаты.  
2. **Оправы (settings):** zero inventory — заказ/производство у партнёра после оплаты.  
3. **Ready-to-ship jewelry:** **ограниченный буфер** только после пилота SKU; капитал отдельной строкой (§10.3), не смешивать с loose.  
4. **Bespoke:** assembly-to-order (камень + оправа → монтаж по оплате).

### 3.2 Positioning Statement
> **For** digitally-native couples aged 25–38 seeking engagement jewelry, **Stonee is** the lab-grown diamond platform that combines AI-powered price transparency with bespoke atelier work, **unlike** Blue Nile or James Allen, **because** we aggregate Surat wholesale feeds with real-time Deal Scoring and publish **honest, tracked lead times** for zero-inventory assembly (reserve → QC → hub → mount) instead of over-promising speed.

### 3.2a Zero-inventory bespoke: why «7 days» is not credible
При **zero-inventory** камень не лежит на полке ателье: его нужно **зарезервировать** у поставщика в Сурате, провести **QC**, доставить в хаб или к партнёрскому ателье, выполнить/достать **оправу**, **смонтировать**, упаковать и застраховать отправку. Даже при прямом рейсе **Сурат → Дубай** и без задержек на таможне цепочка редко укладывается в одну неделю — **реалистичный ориентир для клиентских обещаний: порядка 14–21 рабочего дня** (часто дольше при пиках или сложной оправе). Маркетинговые формулировки вроде «7-day bespoke manufacturing» **противоречат физике логистики** и подрывают доверие; в коммуникации использовать **диапазон + статус трекинга**, а не фиктивный минимум.

### 3.3 North Star Metric
**Gross Merchandise Value (GMV) per Concierge Interaction** — показывает, насколько хорошо платформа конвертирует high-intent трафик в revenue через персонализированный сервис.

### 3.3b Concierge: масштаб (без «AI уже есть»)
На старте **human-first**: founder-led / один growth до **~10 заказов/мес**; далее выделенный **Customer Success / concierge** (1 FTE) и **WhatsApp Business API + quick replies** (не LLM). **LLM-слой** — только после объёма переписок и политики качества (**Year 2+**), иначе смешение «AI concierge» в питче с реальностью вредит доверию.

---

## 4. Competitive Landscape

### 4.1 Direct Competitors
| Competitor | Model | Strength | Weakness | Stonee Advantage |
|------------|-------|----------|----------|------------------|
| **Brilliant Earth** | DTC LGD + Ethical | Brand, SEO, Sustainability story | High prices, no AI scoring | Better unit economics via Surat direct |
| **James Allen** | DTC Natural + LGD | 360° viewer, brand trust | Legacy tech, high CAC | Modern AI stack + прозрачные SLA bespoke |
| **Blue Nile** | Aggregator (Signet) | Scale, selection | Impersonal, slow bespoke | Concierge + Deal Score |
| **Ritani** | Hybrid (retail + online) | Local showrooms | Limited tech, inventory risk | Zero inventory, data-driven |
| **With Clarity** | Try-at-home | UX innovation | Inventory heavy, slow | Virtual try-on + Surat direct |
| **Clean Origin** | LGD only | Pure LGD focus | Narrow selection, weak intl | Global Surat hub + bespoke |

### 4.2 Indirect Competitors
- **Moissanite retailers** (Charles & Colvard) — дешевле, но не алмазы.
- **Local jewelers** — доверие, но нет прозрачности цен и выбора.
- **RapNet / IDEX** — B2B only, не доступны конечному потребителю.

### 4.3 Competitive Moat (Defensibility)
1. **Data Moat:** Deal Score алгоритм обучается на реальных транзакциях; чем больше продаж, тем точнее оценка.
2. **Supply Moat:** Эксклюзивные контракты с Surat-агрегаторами на API-уровне (не CSV-дампы).
3. **Brand Moat:** Bespoke + storytelling + sustainability credentials.
4. **Network Effects (B2B):** Ювелиры-партнеры подключаются к Stonee Pro, увеличивая ликвидность платформы.

---

## 5. Business Model & Unit Economics

### 5.1 Revenue Streams

#### Stream A: Loose Diamonds (Aggregator)
- **Mechanics:** **3–5** стратегических поставщиков с **MSA + bulk CSV/XML** (маржа и контроль лучше, чем у «20+ через один API»); RapNet/IDEX — **дополнение**, не единственный источник (стоимость и лимиты, §2.4 / §11.2).
- **Pricing:** Цена поставщика + markup 10–18%.
- **Margin:** 8–15% net после платежей, логистики, QC.
- **Inventory Risk:** ZERO (drop-ship model).

#### Stream B: Bespoke Jewelry
- **Mechanics:** Клиент выбирает камень + оправу → заказ уходит в ателье-партнер (Surat или локальный хаб).
- **Pricing:** Стоимость камня (со markup) + стоимость оправы + workmanship fee.
- **Margin:** 35–50% на оправе, 12–18% на камне.
- **AOV:** $2,200–$3,800.

#### Stream C: Curated Collections (Ready-to-Ship)
- **Mechanics:** Топовые позиции (пуссеты, теннисные браслеты) на буферном складе (Hub: UAE / Turkey / Kazakhstan).
- **Pricing:** Retail с маржой 60–100%.
- **Inventory Risk:** MEDIUM (только ходовые SKU, оборачиваемость <45 дней).

#### Stream D: Stonee Pro (B2B) — Phase 3
- **Mechanics:** SaaS-подписка для ювелиров + комиссия с их продаж.
- **Pricing:** $99–$299/мес + 3–5% с транзакции.

### 5.2 Unit Economics (Per Order)

**Scenario: Bespoke Ring, AOV = $2,400**

| Line Item | Amount | % of AOV |
|-----------|--------|----------|
| **Revenue** | $2,400 | 100% |
| COGS (Diamond at cost) | $1,120 | 46.7% |
| COGS (Setting + Labor) | $480 | 20.0% |
| **Gross Profit** | **$800** | **33.3%** |
| Payment Processing (2.9% + $0.30) | $70 | 2.9% |
| Logistics (Surat → Hub → Client) | $85 | 3.5% |
| QC / Certification | $35 | 1.5% |
| Packaging (Luxury unboxing) | $25 | 1.0% |
| **Contribution Margin** | **$585** | **24.4%** |
| CAC (Blended: paid + organic) | $140 | 5.8% |
| **Net Margin per Order** | **$445** | **18.5%** |

**LTV Calculation:**
- AOV: $2,400
- Repeat purchase (24M): **4%** — типичный диапазон для **engagement / bridal** за 24 мес. **3–5%**, а не 12% (12% ближе к **fashion / repeatable ювелирке**, не к единичному кольцу на помолвку). Доп. выручка на цикл LTV при средней доп. покупке **$1,200:** **0.04 × $1,200 = $48**
- Referral rate: 8% — кредит **$200** на реферала; ожидаемая добавка к LTV: **0.08 × $200 = $16**
- **LTV:** $2,400 + $48 + $16 = **$2,464** *(ранее использовались 12% repeat — **завышали** LTV для bridal-ниши.)*
- **LTV/CAC (при blended CAC $140):** $2,464 / $140 ≈ **17.6×**

При **низком** bridal-repeat **LTV сильнее зависит** от **рефералок, upsell** (апгрейд оправы, второе изделие) и качества сервиса — эти рычаги нужно **планировать и мерить** отдельно, иначе «17×» останется табличной иллюзией.

### 5.3 Break-Even Analysis
- **Contribution margin до маркетинга:** $585 на заказ (как в таблице выше)
- **Blended CAC:** **$140** на заказ (маркетинг масштабируется с числом заказов)
- **Вклад на покрытие фикса после CAC:** $585 − $140 = **$445** на заказ

**Два уровня «фикса» (чтобы не смешивать учебный пример и P&L):**

1. **Узкий cash-фикс (~$28K/мес)** — «ядро» до полного P&L (команда хаба + минимальный Surat + инфра без маркетинга в этой строке): **$28,000 / $445 ≈ 63** заказа/мес (~**$151K** GMV при AOV $2,4K). Формула **n × ($585 − $140) ≥ $28K**. Ранее ошибочно использовалось **48** как `fixed / $585` без вычета CAC из потока на фикс.

2. **Среднемесячный OpEx Year 1 по §11.2 (v2.1 recalibration)** (**~$926K/год** ⇒ **~$77.2K/мес**): **$77,167 / $445 ≈ 174** заказа/мес (~**$418K** GMV/мес при AOV $2,4K) для нуля по операционному cash **только** из вклада после CAC — см. §11.2a (сценарии).

- **Target (Month 12):** **120 заказов/мес** ($288K GMV) остаётся **stretch-гипотезой** маркетинга; при recalibrated OpEx и **$240K** маркетинга Year 1 она **не сходится** с консервативным GMV в одной строке P&L — нужен либо **рост годового GMV** (сценарий Base в §11.2a), либо снижение целей/расходов.
- **Target (Month 24):** 350 заказов/мес ($840K GMV) — долгосрочная цель при масштабировании paid + brand.

---

## 6. Go-To-Market Strategy

### 6.0 Jurisdictional architecture (юрисдикционная модель)

Старые версии документов смешивали **«куда маркетим»**, **«где юрлицо»** и **«как платим»** в один параметр «рынок РФ». Это ломает планирование. Ниже — **арбитражная рамка**: четыре независимые оси; комбинации задают реальный go-to-market.

| Ось | Смысл | Роль Stonee на старте |
|-----|--------|------------------------|
| **Company jurisdiction** | Регистрация, контракты, учёт выручки | **UAE** (например DMCC) как hub и контрактный центр с поставщиками |
| **Payment jurisdiction** | Где и чем принимается оплата | **Не** российские карты Visa/MC «как в 2021»; международные рельсы ($, SWIFT, крипто и др.) — только после **KYC/AML** и санкционного скрининга; детали — платёжный провайдер и юрист |
| **Fulfillment jurisdiction** | Физический путь груза | **Surat → UAE (QC) → клиент** и/или **UAE → партнёрское ателье (СНГ) → клиент** — см. `OPERATIONS_MANUAL.md` |
| **Regulatory jurisdiction** | Маркировка, пробирка, ГИИС ДМДК, таможня | Зависит от **маршрута** и того, кто выступает **импортёром/продавцом** (cross-border B2C vs локальный ювелир vs B2B). **Нет** замены консультации брокера: таблицы в питче не являются правовым заключением |

**Аудитория vs география:** продукт и маркетинг могут быть ориентированы на **русскоязычных клиентов и диаспору + СНГ** без тождества «юрлицо и эквайринг в РФ». Частый кейс: **cross-border e-commerce из UAE** в страну клиента при прозрачной логике пошлин (см. схемы A/B/C в `OPERATIONS_MANUAL.md`).

**Россия как P4 в таблице §6.1:** речь о том, что **прямое** масштабирование с **российским юрлицом**, **российским эквайрингом** и полным **B2C-контуром** под ГИИС/115-ФЗ **не** выбраны как стартовая модель без отдельной стратегии и капитала на compliance. Это **не** утверждение «нельзя продавать россиянам»: можно **другими маршрутами** (схемы A–C), каждый из которых требует **своего** DD.

**UAE — плюсы/минусы (сжато):** доступ к **$**-рельсам и к индийской цепочке, DMCC по камням; **минусы** — стоимость ведения юрлица и хаба, нет «волшебного» приёма ₽ без посредников, **корпоративный налог** и пороги — см. §9.1 (не опираться на устаревший нарратив «0% на всё навсегда»).

### 6.1 Geographic Prioritization (Revised)
| Priority | Market | Rationale | Entry Mode |
|----------|--------|-----------|------------|
| **P0** | UAE (Dubai) | Нет санкций, high HNWI, близость к Индии, хаб логистики; **VAT 5%** на jewelry; **корп. налог 9%** сверх порога прибыли (см. §9.1) — не «0% на бизнес» | Юрлицо в Dubai Free Zone (DMCC) |
| **P1** | Kazakhstan / Armenia | Мост в СНГ, лояльная регуляторика, растущий средний класс | Местное ООО + партнеры |
| **P2** | USA | Самый большой рынок LGD, высокий CAC, но огромный TAM | LLC in Delaware + 3PL |
| **P3** | EU (Germany, UK) | Sustainability-conscious, high AOV | GmbH / Ltd |
| **P4** | Russia | Ювелирный рынок $8Bn, но санкции и платежные риски | Только через посредников |

> **⚠️ Согласование с §6.0:** **Прямой старт** как «российское ООО + российский эквайринг + полный B2C-ювелирный контур без посредников» для команды без готового compliance-контура — **высокий** риск (115-ФЗ, санкции, платежи, ГИИС/пробирка). Это **не** равно «не работать с русскоязычными клиентами»: допустимы **cross-border** и **партнёрские** схемы (см. `OPERATIONS_MANUAL.md`). Стартовая **география юрлица и хаба** — **UAE**; **СНГ** — мост и ателье; **США/ЕС** — параллельно по продукту, не смешивая с российским контуром без отдельного решения.

### 6.2 Launch Phases

#### Phase 0: Stealth (Month 1–2)
- Регистрация DMCC Free Zone Company (Dubai).
- Подписание Master Supply Agreement с 3–5 Surat-агрегаторами.
- Интеграция RapNet Instant Inventory API [^9^] (бюджет membership + overage — см. §11.2).
- Найм gemologist-agent в Сурате (QC на выходе).

#### Phase 1: Soft Launch (Month 3–4)
- Запуск MVP: каталог + Deal Score + корзина.
- Трафик: Instagram/TikTok organic + микро-инфлюенсеры (wedding niche).
- Цель: 10 первых заказов с ручным сопровождением.

#### Phase 2: Growth (Month 5–8)
- Запуск paid acquisition (Meta Ads, Google Shopping).
- SEO-лендинги: «lab grown diamond engagement ring dubai», «2 carat CVD diamond price».
- Concierge service: WhatsApp Business API + Telegram.
- Внедрение 360°-viewer для топ-500 SKU.

#### Phase 3: Scale (Month 9–12)
- Bespoke Builder v1 (3D-конфигуратор).
- Буферный склад в Dubai Airport Freezone (расширение пилота **10–12 SKU**; «топ-50» — после метрик оборачиваемости).
- Запуск реферальной программы.
- Подготовка к Series A ($1.5–2M).

### 6.3 Marketing Mix

**Acquisition Channels (Year 1 — черновик каналов; суммарный бюджет см. ниже)**

| Channel | Budget (черновик) | Expected % of Revenue | CAC |
|---------|-------------------|----------------------|-----|
| Instagram / TikTok (Organic + Paid) | $24K | 35% | $110 |
| Google Ads (Search + Shopping) | $18K | 30% | $95 |
| SEO / Content | $8K | 20% | $25* |
| Influencers (Micro, wedding) | $6K | 10% | $150 |
| Referral | $4K | 5% | $40 |

*SEO CAC амортизированный на 24 мес.

**Согласование с целью объёма (CAC $140, paid):** **120 заказов/мес** при чистом paid требуют порядка **$16.8K/мес** только на CAC (**~$201K/год**). В **§11.2 (v2.1)** маркетинг Year 1 поднят до **$240K** (~**$20K/мес**) как **базовый** ориентир под сценарий **~85 заказов/мес** в среднем за год (см. §11.2a); траектория **120 к месяцу 12** всё равно требует **сильной органики** или **доп. paid** — иначе математика не сходится. Черновик каналов в таблице выше — **не** сумма к $240K; нужен отдельный помесячный план.

**Схема A и доверие (cross-border):** пошлины при получении и отсутствие «оплаты при получении» в привычном смысле **бьют по конверсии** у части русскоязычной аудитории — держать **параллельный** план **Схемы C или B** (ателье/партнёр) как **fallback по триггерам** в `OPERATIONS_MANUAL.md` §2.1, не только после провала.

**Retention Mechanics:**
- **Post-purchase:** Сертификат + unboxing experience + handwritten card.
- **30 days:** Email «How to care for your diamond».
- **6 months:** «Upgrade your setting» offer.
- **12 months:** Anniversary discount (20% на второе изделие).

---

## 7. Technical Architecture

### 7.1 Design Principles
1. **HTTP-first микросервисы (фактический MVP):** Клиент и **api-gateway** вызывают доменные сервисы **синхронно по HTTP** (`@fastify/http-proxy`); «горячие» ответы поиска — **Redis** в `search-service`. Это **не** классическая **EDA**, где обязательный брокер доставляет доменные события между сервисами: **RabbitMQ** в compose поднят как **инфраструктурный задел** и для тестов, но **текущие бизнес-флоу не публикуют и не потребляют доменные события через RabbitMQ** (см. `ARCHITECTURE.md`). Называть текущую систему «EDA через RabbitMQ» — **вводит в заблуждение**; переход к outbox / async consumers — отдельный **ADR** и roadmap.
2. **CQRS for Catalog:** В репозитории — чтение через **Redis** (+ MongoDB в search-service), запись через **MongoDB**; Elasticsearch — только при отдельном внедрении.
3. **Database per Service:** Каждый домен — своя БД.
4. **API-First:** OpenAPI 3.0 спецификации для всех публичных и внутренних API.
5. **Observability by Default:** Distributed tracing, structured logging, metrics.

**Прагматика pre-seed:** микросервисный сплит (pricing, recommendation, supplier…) — **оверхед** по деплою и наблюдаемости; для **очень малой** команды допустим **путь «modular monolith»** внутри одного репозитория как ADR. **MongoDB-каталог** на больших объёмах потребует **жёсткого** индексирования и контроля hot-запросов; Redis-кэш в search — **временный** слой, не замена индексов. При росте цепочки reserve→QC→logistics без шины **возрастает** риск рассинхрона — **outbox / async** (RabbitMQ или аналог) остаётся **roadmap**, см. §7.4.

### 7.2 Service Topology (Revised)

**Согласовано с репозиторием (2026):** персистентность заказов, каталога, пользователей и ювелирного домена — **MongoDB** (отдельные базы/коллекции на сервис). PostgreSQL в этом монорепозитории **не используется**; распределённые шаги оплаты и резервации опираются на **идемпотентность**, явные статусы заказа и компенсирующую логику в сервисах, а не на отдельный RDBMS-слой.

| Service | Responsibility | Stack | Data Store |
|---------|---------------|-------|------------|
| **api-gateway** | Единая точка входа, rate limiting, auth, routing | Fastify + `@fastify/http-proxy` | — |
| **catalog-service** | Ядро данных (алмазы), CRUD, supplier feeds | Fastify + TypeScript | **MongoDB** |
| **pricing-service** | Deal Score, валидация цен checkout | Fastify + TypeScript | **без собственной БД в MVP** (stateless / in-process) |
| **order-service** | Корзина (`sessionId`), заказы, Stripe, статусы | Fastify + TypeScript | **MongoDB** (`stonee_orders`) |
| **search-service** | Поиск, фасеты, кэш | Fastify + TypeScript | **MongoDB** + **Redis** |
| **jewelry-service** | Оправы, готовые коллекции, сид | Fastify + TypeScript | **MongoDB** |
| **user-service** | JWT Auth, профиль, роли staff | Fastify + TypeScript | **MongoDB** |
| **supplier-service** | Интеграции поставщиков | Fastify + TypeScript | вызовы catalog/jewelry/pricing (персист — в их MongoDB) |
| **notification-service** | `/notify`, логи событий | Fastify | **без MongoDB в MVP** (in-memory / stdout; при росте — запись в MongoDB или внешний лог) |
| **recommendation-service** | Рекомендации для корзины | Fastify | Подключён в **корневом `docker-compose.yml`** (v2.1); логика — эвристика по `jewelry-service`, **без** ML |
| **media-service** | 360°, CDN (план) | Fastify + Sharp | S3-compatible + метаданные — **MongoDB** при внедрении |
| **analytics-service** | BI pipeline (план) | **Fastify + TypeScript** | **MongoDB** / выгрузки — по этапу внедрения |

> **Примечание к «enterprise» черновикам v2.0:** ранее здесь фигурировали **PostgreSQL 15** для `order-service` и SAGA вокруг RDBMS — это **не отражает текущий код**. Документ выше выровнен под **MongoDB-first** реализацию; при росте нагрузки возможны дополнительные хранилища (кэш, поисковый движок), но это отдельные решения с миграцией и roadmap, а не зафиксированное состояние репозитория.

### 7.3 Data Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│ API Gateway  │────▶│  Catalog Service│
│ (React/Vite)│     │  (Fastify)   │     │    (MongoDB)    │
└─────────────┘     └──────────────┘     └────────┬────────┘
       │                    │                      │
       │                    │ ◄────────────────────┘ (Cache invalidation)
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Search Svc │◄────│  Redis Cache │◄────│  Change Streams │
│(Mongo+Redis)│     │   (Hot Data) │     │    (MongoDB)    │
└─────────────┘     └──────────────┘     └─────────────────┘
       ▲
       │
┌──────┴──────┐     ┌──────────────┐     ┌─────────────────┐
│   Order Svc │────▶│   MongoDB    │────▶│  Pricing Svc    │
│  (Fastify)  │     │ stonee_orders│     │ (Fastify / TS)  │
└──────┬──────┘     └──────────────┘     └─────────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  RabbitMQ   │     │ Idempotent   │     │  Redis          │
│  (compose;   │     │ Stripe       │     │  (search cache) │
│  not wired   │     │ webhooks +   │     │                 │
│  to domain)  │     │ order status │     │                 │
└─────────────┘     └──────────────┘     └─────────────────┘
```

### 7.4 Critical Technical Decisions

#### CTD-1: Catalog Sharding Strategy
- **v1.0:** Sharding по carat — **неправильно**. Carat — диапазонный запрос, shard key должен быть высоко-кардинальным.
- **v2.0:** Shard key = `supplier_id + sku`. Это обеспечивает локальность данных по поставщику (при bulk-обновлениях) и равномерное распределение.

#### CTD-2: Event schema & contracts (**target state — не реализовано в MVP**)
В репозитории **нет** шины доменных событий: интеграции идут по **HTTP** и общим типам в `packages/shared-types`. Таблица **Appendix B** задаёт **целевые** топики RabbitMQ на будущее; при внедрении понадобятся **отдельные** продюсеры/консьюмеры, контракт версионирования (JSON или Avro + registry) и **ADR**. Пример целевого payload (иллюстрация, не текущий код):
```typescript
// Example: DiamondPriceUpdated v1 (planned bus message shape)
interface DiamondPriceUpdatedEvent {
  eventId: string;
  eventType: 'DiamondPriceUpdated';
  version: '1.0';
  timestamp: ISO8601;
  payload: {
    diamondId: string;
    supplierId: string;
    oldPrice: Decimal128;
    newPrice: Decimal128;
    currency: 'USD';
    dealScore: number;
  };
}
```

#### CTD-3: Caching Strategy (Search Service)
- **Tier 1 (L1):** Redis — «горячие» фильтры (1–2 ct, Round, D-F color). TTL = 5 мин.
- **Tier 2 (L2):** опционально **Elasticsearch** для полнотекста; в текущем коде — MongoDB-запросы + Redis.
- **Tier 3 (L3):** MongoDB — source of truth.

#### CTD-4: Идемпотентность и распределённые шаги (MongoDB) — **не SAGA в классическом смысле**
- Оплата и webhooks **идемпотентны** (ключи Stripe, проверка повторной доставки событий).
- Цепочка Order → Payment → (будущий) Reservation → Logistics в коде — это **явные статусы** в **одном** `order-service` (MongoDB) плюс **синхронные HTTP** вызовы к другим сервисам там, где уже есть wiring; **нет** центрального **SAGA-orchestrator**, **нет** отдельного набора **компенсирующих HTTP-эндпоинтов** под откат шагов (см. `ARCHITECTURE.md`, `API.md`). **Межсервисного ACID** не существует — только **best-effort** согласованность и ручные/локальные компенсации по мере реализации.
- Полноценный choreography / saga с брокером — **roadmap** (outbox в MongoDB, RabbitMQ, отдельные сервисы logistics) и потребует явного дизайна; до этого документы не должны обещать «SAGA уже есть».

### 7.5 Infrastructure & DevOps

#### Deployment Tiers
| Tier | Infra | Use Case |
|------|-------|----------|
| **Dev** | Docker Compose local | Разработка |
| **Staging** | Docker Compose на VPS | QA, демо |
| **Production** | Kubernetes (K8s) на Hetzner / AWS | Живой трафик |

#### CI/CD Pipeline (GitHub Actions)
```yaml
# Simplified flow (TS-first monorepo)
1. Lint (ESLint + Prettier)
2. Type Check (tsc --noEmit в пакетах)
3. Unit Tests (Jest / Vitest — по проекту) — coverage >75%
4. Integration Tests (Testcontainers: MongoDB, Redis, RabbitMQ)
5. Build & Push Docker Image (GHCR)
6. Deploy to Staging (helm upgrade)
7. Smoke Tests (k6 / Postman / pnpm run smoke)
8. Deploy to Production (canary 10% → 100%)
```

#### Observability Stack
| Layer | Tool | Purpose |
|-------|------|---------|
| Logs | Grafana Loki + Pino | Structured JSON logs, correlation ID |
| Metrics | Prometheus + Grafana | RPS, latency p95/p99, error rate, business metrics |
| Tracing | Jaeger / Tempo | Distributed tracing across services |
| Alerting | Grafana Alertmanager | PagerDuty / Telegram для критических алертов |
| Uptime | UptimeRobot + StatusPage | Внешний мониторинг |

### 7.6 Security Architecture
- **TLS 1.3** everywhere (внешний и внутренний трафик через mTLS в K8s).
- **API Gateway:** единый rate limit на IP (`STONEE_GATEWAY_RATE_LIMIT_MAX`, по умолчанию **600**/min — см. `SECURITY.md` и `apps/api-gateway/src/server.ts`; лимит **100**/min был слишком жёстким для каталога с фасетами). Раздельные лимиты для read-heavy маршрутов и burst — **TODO**. WAF rules (SQLi, XSS) — на edge.
- **Secrets:** HashiCorp Vault / AWS Secrets Manager. Никаких `.env` в репозитории.
- **Auth:** JWT (RS256, short-lived access + refresh tokens), OAuth 2.0 / OpenID Connect для соц. входа.
- **Input Validation:** **Zod** (и типы TypeScript) на границах API. Запрещён `any` как долг.

---

## 8. Data & AI Strategy

**Согласовано с репозиторием:** расчёт Deal Score и бейджей, а также **валидация цен** для checkout, выполняются в **`pricing-service` на Node.js + TypeScript + Fastify**. Отдельного Python-микросервиса, FastAPI и scikit-learn **в этом монорепозитории нет**; внешний batch-scoring (любой стек) возможен только как **опциональное** расширение с HTTP-контрактом, без замены TS-сервиса без ADR.

### 8.1 Deal Score: Concept to Implementation

**Definition:** Deal Score — оценка соотношения «цена/качество» алмаза относительно рыночных ориентиров. Шкала: 0–100.

#### v1.0: Rule-Based / Heuristic Scoring (MVP в коде)
Логика в **TypeScript** (упрощённый псевдокод; реализация — в `services/pricing-service`):

```typescript
function calculateDealScoreV1(diamond: DiamondInput, marketCurve: MarketCurve): number {
  const expectedPrice = marketCurve.expectedPrice({
    carat: diamond.carat,
    color: diamond.color,
    clarity: diamond.clarity,
    cut: diamond.cut,
    shape: diamond.shape,
  });
  const priceRatio = diamond.price / expectedPrice;

  const lpScore = lightPerformanceHeuristic({
    table: diamond.tablePct,
    depth: diamond.depthPct,
    ratio: diamond.lWRatio,
  });

  const score =
    0.6 * priceScoreFromRatio(priceRatio) +
    0.25 * lpScore +
    0.15 * certificateBonus(diamond.lab);

  return Math.min(100, Math.max(0, score));
}
```

**Фазы валидации (честно про гипотезу формулы):** текущий rule-based микс (цена + light performance + сертификат) — **не** подтверждён A/B на конверсии. Рекомендуемая дисциплина: **Phase 1 (пилот):** в продукте и отчётах опираться на **price percentile / отношение к медиане рынка** как главный объяснимый сигнал; **Phase 2 (50+ заказов):** A/B «Deal Score badge on/off»; **Phase 3 (200+ заказов):** калибровка весов или внешний batch-скоринг без переписывания ядра TS.

#### v2.0: Усиление модели (Post-MVP, TS-first)
- **Вариант A:** более богатые эвристики и калибровка в TS; A/B по конверсии.
- **Вариант B:** внешний batch или редкий вызов scoring API с записью результата в **MongoDB** каталога — без переписывания `pricing-service` на Python.
- **Онлайн-инференс:** **Fastify + TS**, целевой latency — десятки миллисекунд на камень.

### 8.2 Справочники для pricing (без отдельного PostgreSQL feature store)
| Feature Group | Features | Refresh Rate |
|---------------|----------|--------------|
| `market_curves` | Медиана цен по (shape, carat, color, clarity) | Every 6 hours |
| `diamond_attributes` | 4C + пропорции + сертификат | Real-time (on feed update) |
| `supplier_reliability` | История отмен, скорость резерва, точность описания | Daily |
| `seasonality` | Мультипликаторы (Valentine's, Christmas, Ramadan) | Weekly |

### 8.3 Data Pipeline (Analytics)
```
Сейчас: HTTP/API + логи/БД → (ручные или scheduled) выгрузки / BI
План:   доменные события → RabbitMQ → ClickHouse / агрегаты в MongoDB → Grafana
                              ↓
                        выгрузки S3 / batch на Node.js + TS
```

**Key Dashboards:**
- Conversion funnel (View → Cart → Checkout → Payment)
- Deal Score distribution vs conversion rate
- Supplier performance (fill rate, accuracy, margin)
- CAC by channel cohort

---

## 9. Security, Compliance & Risk Management

### 9.1 Regulatory Landscape

#### For UAE (Primary Jurisdiction)
- **DMCC Free Zone:** Лицензия на торговлю драгоценными камнями и металлами.
- **AML/KYC:** По правилам DMCC и здравому смыслу high-ticket — верификация клиентов при порогах (часто **>$3,000**). **В репозитории нет** KYC-провайдера (Sumsub/Onfido и т.д.), флагов `kycStatus` и блокировки checkout — это **P0 до публичного приёма** реальных платежей на типичный AOV **~$2,4K** (почти каждый заказ выше порога). Пока только Stripe без доп. identity layer.
- **Tax (актуально с 2023):** Федеральный **корпоративный налог 9%** с **налогооблагаемой прибыли** свыше **AED 375,000** (~**USD 102K**) для финансовых лет, начинающихся **не ранее 1 июня 2023**; для **квалифицированного** free-zone дохода возможны **0% / освобождения** при соблюдении условий закона — **нужна юрструктура и консалтинг**, нельзя опираться на формулировку «0% налог на прибыль» без проверки. При **AOV ~$2,4K** и устойчивой операционной марже порог по объёму заказов достигается **порядка десятков** заказов в год (оценка порядка **40–50+** как ориентир, не налоговый совет). **НДФЛ для физлиц** в типичных структурах — **0%**. **VAT 5%** на jewelry — регистрация и учёт при превышении порогов оборота.

#### For USA (Phase 2)
- **FTC Jewelry Guides:** Обязательное раскрытие lab-grown origin.
- **PCI DSS:** При оплате через **Stripe Elements / Checkout** без хранения полных данных карт (PAN) на собственных серверах типичный объём мерчанта — **SAQ A** (карточные данные обрабатываются Stripe). **PCI DSS Level 1** (ежегодный on-site QSA и т.п.) актуален для крупных схем с **хранением/обработкой PAN** на своей инфраструктуре — **не** соответствует архитектуре из `FRONTEND.md` / `DEVELOPMENT.md`.
- **CCPA / GDPR:** Если трафик из Калифорнии / ЕС — политика cookies, право на забвение.

#### For Kazakhstan / Armenia (Bridge to CIS)
- **Customs Union EAEU:** Единые тарифы на ввоз jewelry.
- **Local jewelry licensing:** Обязательная пробирная маркировка (для золотых оправ).

#### For Russia (If Ever)
- **ГИИС ДМДК:** Учет каждого изделия и камня.
- **Пробирная палата:** Маркировка.
- **115-ФЗ:** Риск блокировки счетов за «подозрительные» переводы.
- **⚠️ Recommendation:** Не входить напрямую. Работать через партнеров (marketplace model) или ограничиться B2B.

### 9.2 Information Security
| Threat | Mitigation |
|--------|------------|
| Card fraud (high-ticket) | 3D Secure 2.0, manual review для >$5K, Stripe Radar |
| Account takeover | MFA (TOTP), device fingerprinting, suspicious login alerts |
| Price scraping | Rate limiting, CAPTCHA для anon users, Honeypot API endpoints |
| Supplier feed poisoning | Schema validation, anomaly detection (цена отклоняется >30% от рынка) |
| Data breach | Encryption at rest (AES-256), encryption in transit (TLS 1.3), quarterly pentest |

### 9.3 Business Continuity
- **RTO (Recovery Time Objective):** 4 часа для критических сервисов (order, payment).
- **RPO (Recovery Point Objective):** 15 минут (continuous backup).
- **Backups:** **MongoDB** (все доменные сервисы на нём: catalog, orders, users, jewelry, search metadata) — snapshot / point-in-time по политике облака; **Redis** — AOF + RDB. В репозитории **нет** автоматического cron-джоба бэкапа — ориентир процедуры: `scripts/mongodb-backup.example.sh` + ежедневный выгруз в object storage и **квартальный** тест восстановления на staging (см. `SECURITY.md`).
- **Multi-region:** Primary — Hetzner / AWS eu-central; DR — AWS me-south (Bahrain) или GCP europe-west.

---

## 10. Operations & Logistics: The Stonee Loop

### 10.1 Process Flow (Detailed)

```
[1] AGGREGATION
    ├── Frequency: Every 6 hours (configurable per supplier)
    ├── Sources: **bulk CSV/XML (primary)** + ограниченный live API (RapNet/IDEX) — иначе overage съедает OpEx (§11.2)
    ├── Transform: Normalization to Stonee Schema (40+ fields)
    └── Output: catalog-service MongoDB + pricing-service queue

[2] SCORING
    ├── Input: New/updated diamond records
    ├── pricing-service: Batch inference (1000 records/batch)
    ├── Output: Deal Score (0-100) + price_percentile
    └── Cache invalidation: Redis (+ MongoDB Change Streams)

[3] DISCOVERY & SELECTION
    ├── Client: Filters → Search Service (MongoDB + Redis)
    ├── Compare: Up to 4 diamonds side-by-side
    ├── Concierge: WhatsApp/Telegram consultation (human + AI assistant)
    └── Decision: Add to cart / Save to Wishlist

[4] ORDER & PAYMENT
    ├── Checkout: Shipping address + customization notes
    ├── Payment: **Stripe реализован** в `order-service`; PayPal / **crypto (USDT)** — **roadmap** для схемы A (см. `OPERATIONS_MANUAL.md`), **не** в текущем UI/checkout (`FRONTEND.md`).
    ├── Fraud Check: 3D Secure + manual review if flagged
    └── Order Status: CREATED → PAID

[5] RESERVATION (распределённый шаг; компенсации в прикладном слое, MongoDB)
    ├── order-service → supplier API: Lock diamond for 48h
    ├── Success: Status → RESERVED
    └── Failure: Compensation → refund + notification

[6] QUALITY CONTROL (Surat)
    ├── Agent получает камень у поставщика
    ├── Проверка: соответствие сертификату (GIA/IGI номер), визуальный осмотр
    ├── Photo/Video: 360° съемка если не предоставлена поставщиком
    ├── Pass: Status → QC_PASSED
    └── Fail: Compensation → return to supplier + refund

[7] LOGISTICS
    ├── Surat → Dubai Hub (FedEx / Malca-Amit / Brink's): 2–3 days
    ├── Dubai Hub: Customs clearance, final QC, packaging
    ├── Dubai → Client (DHL Express / local courier): 3–7 days
    └── Tracking: Integration with courier APIs + client dashboard

[8] DELIVERY & POST-SALE
    ├── Delivery confirmation + digital certificate
    ├── Review request (7 days after delivery)
    ├── Warranty activation (1 year на оправу)
    └── Upsell: Cleaning kit, insurance, anniversary reminder
```

### 10.2 Supplier Integration Matrix
| Supplier Tier | Integration Type | Latency | Reliability |
|---------------|-----------------|---------|-------------|
| Tier 1 (Strategic) | REST API + Webhooks | Real-time | 99.9% |
| Tier 2 (Preferred) | RapNet API [^9^] | ~5 min | 99.5% |
| Tier 3 (Standard) | FTP/SFTP (CSV/XML) | 6 hours | 98.0% |
| Tier 4 (Fallback) | Email + manual upload | 24 hours | N/A |

### 10.3 Buffer Stock Strategy (Ready-to-Ship) — согласование с zero-inventory

**Zero-inventory** в модели Stonee относится к **свободным камням** (агрегатор, нет собственного стока бриллиантов). **Буфер готовой ювелирки** — отдельный поток (Stream C): небольшой склад **готовых** SKU в хабе (DAFZA / аналог).

**Проблема старой формулировки «топ-50 SKU + $40–60K»:** при AOV готового изделия **~$2,400** сумма **$40–60K** даёт лишь **~17–25 единиц** на **50 SKU** (**<0.5** ед./SKU). При оборачиваемости **<45 дней** и топ-доле спроса реалистично минимум **2–3 ед./SKU** на ходовой позиции — бюджет **не покрывает** даже пилот.

**Пересмотренный пилот (внутренне согласованный):**
- **Ассортимент:** **10–12 SKU** (пуссеты, простые кольца/цепи), не 50 на старте.
- **Глубина:** **2 единицы** на SKU для ходовых размеров (или **1** на long-tail внутри тех же 10–12).
- **Капитал:** ориентир **$25–40K** при среднем COGS готовки **~$0.9–1.2K**/ед. — отдельная строка капекса, **не** смешивать с «zero loose inventory».
- **Масштаб «топ-50» и $100K+** — **фаза 2** после проверки оборачиваемости и отдельного решения по капиталу.

**Окупаемость:** цель **<60 дней** оставляем как **ориентир по оборачиваемости SKU**, а не как обещание при нулевой глубине стока.

**Риск 80/20 и stock-out:** при **2 ед./SKU** топ-SKU может исчерпаться быстрее хвоста — после **~20 заказов** готовки включить **ABC по конверсии**, динамическое пополнение ходовых позиций и честный **pre-order** («под заказ, 14+ дней») для non-stock.

**Решение пилота (первые ~6 месяцев):** **не** выделять **$25–40K** buffer stock, пока нет **50+** заказов и ABC — капитал уходит в runway, Surat-agent, KYC и тестовую логистику (`OPERATIONS_MANUAL.md` §6). Все продажи — **loose + bespoke** (zero на камнях и оправах до монтажа).

---

## 11. Financial Projections (3-Year)

### 11.1 Assumptions
- Launch: Month 3
- First 6 months: UAE + Kazakhstan focus
- Year 2: USA + EU entry
- AOV grows с bespoke penetration

### 11.2 P&L Forecast (USD)

| Line Item | Year 1 (Base v2.1) | Year 2 | Year 3 |
|-----------|-------------------|--------|--------|
| **GMV** | **$2,448,000** | $5,800,000 | $16,500,000 |
| Revenue (Net, after refunds) | $2,203,200 | $5,220,000 | $14,850,000 |
| **COGS** | $1,542,240 | $3,396,000 | $9,202,000 |
| **Gross Profit** | **$660,960** | **$1,824,000** | **$5,648,000** |
| Gross Margin | 30.0% | 34.9% | 38.0% |
| | | | |
| **Operating Expenses** | | | |
| Team (5 → 12 → 22 FTE) | **$400,000** | $520,000 | $1,020,000 |
| Marketing | **$240,000** | $320,000 | $720,000 |
| Tech & Infrastructure | $24,000 | $58,000 | $120,000 |
| Legal & Compliance | **$42,000** | $36,000 | $60,000 |
| UAE overhead (DMCC desk/visa/PRO + часть retainer) | **$30,000** | $36,000 | $48,000 |
| Surat Ops + Logistics (primary + part-time backup) | **$120,000** | $165,000 | $360,000 |
| B2B data feeds (membership + **bulk-first**, capped API) | **$70,000** | $90,000 | $120,000 |
| **Total OpEx** | **$926,000** | **$1,225,000** | **$2,428,000** |
| | | | |
| **EBITDA** | **-$265,040** | **$599,000** | **$3,220,000** |
| EBITDA Margin | **-12.0%** | 11.5% | 21.7% |

> **Пояснение к Year 1 (v2.1):** Строка **GMV $1.2M (~42 заказа/мес)** из ранних черновиков **несовместима** с полным OpEx и целью **120 заказов/мес** к месяцу 12 при том же годовом GMV — либо GMV Year 1 поднимается (сценарий **Base ~85 заказов/мес** в среднем ⇒ **~$2.45M**), либо цели/OpEx режутся (см. §11.2a). **Marketing $240K** — опора под paid+CAC; **UAE overhead $30K** — лицензия/деск/визы/PRO (оценка, не аудит). **Surat $120K** — primary + **part-time backup** (mitigation key-person). **Data feeds $70K** — membership + буфер на overage при **ограничении** live-API (bulk CSV/XML primary, 3–5 стратегических фидов на старте); при агрессивном polling миллионов SKU бюджет **недостаточен** — см. §2.4. **Year 2–3** totals пересчитаны грубо от новой Year 1 базы — **требуют** финальной модели.

### 11.2a Согласованность GMV, заказов, маркетинга и break-even (v2.1)

| Сценарий | Средн. заказов/мес (Y1) | Годовой GMV (AOV $2,4K) | Комментарий |
|----------|-------------------------|-------------------------|---------------|
| **Conservative** | ~50 | **~$1.44M** | При **$926K** OpEx и **~30%** gross margin на net revenue вклад **недостаточен** для безубыточности без среза расходов или bridge. |
| **Base (колонка §11.2)** | **~85** | **$2.45M** | Согласует порядок величин **GMV ↔ маркетинг $240K ↔ CAC $140** лучше, чем $1.2M; EBITDA Year 1 всё ещё **отрицательный** при текущих COGS/марже — нужен рост GMV, маржи или снижение фикса. |
| **Stretch** | 120 (run-rate, не среднее Y1) | **~$3.46M/год** если держать весь год | Требует **сильной органики** и/или **доп. paid** сверх $20K/мес; иначе только CAC съедает **$201K+/год** на одном paid. |

**Вывод ревью v2.1:** нельзя одновременно заявлять **GMV $1.2M Year 1**, **OpEx ~$0.9M+** и **120 заказов/мес к месяцу 12** без явного **конфликта** в модели — выберите **два** из трёх или добавьте **раунд/срез**. Таблица §11.2 зафиксировала **Base** как менее внутренне противоречивую.

### 11.3 Cash Flow & Runway
- **Initial Capital:** $450K Seed
- **Burn Rate:** при **EBITDA Year 1 ~-$265K** средний **месячный операционный дефицит** порядка **$22K** (~**$265K/12**) — **runway ~19–20 мес** «в теории по EBITDA». **Cash runway** на практике часто **~14–17 мес** (и ниже при задержках DMCC, предоплате маркетинга, депозитах поставщикам) — вести **квартальный** cash-forecast на **3 мес вперёд**. **Триггер bridge / среза расходов:** остаток кэша **<$150K** или горизонт **<6 мес** при базовом burn.
- **Break-Even:** **~63 заказа/мес** — узкий фикс **$28K** (§5.3); при **полном** OpEx v2.1 см. **~174 заказа/мес** (~**$418K** GMV/мес).
- **Series A Trigger:** $400K+ GMV/month + 30%+ gross margin + CAC payback <6 months.

---

## 12. Risk Matrix & Mitigation

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| **Trust / chargebacks (high-ticket, long lead time)** | High | Critical | Human concierge **сейчас**; честные SLA; 3DS; фото/видео топ-SKU; политика возвратов; ручной review >$5K | CEO / CMO |
| **Sanctions / Payment blocks** | High | Critical | Юрлицо в UAE; прием USDT/crypto; локальные эквайеры в СНГ | CEO |
| **Supplier fails to reserve stone** | Medium | High | Multi-supplier strategy; 48h reservation buffer; fallback recommendations | Ops |
| **Customs delay / seizure** | Medium | Critical | Сертифицированный брокер; GIA/IGI docs; страховка (Malca-Amit); hub в Dubai | Ops |
| **Price volatility (USD/RUB/EUR)** | High | Medium | Динамический pricing по курсу ЦБ/Forex API; хеджирование на 30 дней | CFO |
| **Low conversion (<0.5%)** | Medium | Critical | Concierge service; 360° video; trust badges; reviews; return policy 14 days | CMO |
| **Tech: Data inconsistency** | Medium | High | Идемпотентность; **MongoDB Change Streams**; сверка заказ↔каталог; явные статусы; фоновые reconciliation-джобы | CTO |
| **Competitor price war** | Medium | Medium | Дифференциация через bespoke + Deal Score; не гонка за низкой ценой | CEO |
| **Key person dependency** | Medium | High | Документация; cross-training; **бюджет part-time backup** в Surat Ops (§11.2); плейбук handover | HR / COO |
| **Fraud / chargebacks** | Medium | High | 3D Secure; manual review; Stripe Radar; clear return policy | CTO |
| **Regulatory change (UAE/KZ)** | Low | Medium | Юрист на retainer; мониторинг изменений; гибкая структура | Legal |

---

## 13. Roadmap

### Q2 2026 (Foundation)
- [x] DMCC company registration
- [x] RapNet API integration [^9^]
- [x] MVP catalog + Deal Score v1 (rule-based)
- [x] Basic order flow + Stripe
- [ ] Surat agent onboarding
- [ ] **Пилот первых продаж (качество, не только счётчик):** **10+** оплаченных заказов при **возвратах <10%**, **median доставки <21 раб. дня**, **CAC пилота <$250**, **NPS >50** — иначе разбор причин до масштабирования paid.

### Q3 2026 (Product-Market Fit)
- [ ] WhatsApp Concierge integration
- [ ] 360° viewer for top-500 diamonds
- [ ] SEO content engine (50 landing pages)
- [ ] Meta Ads + Google Shopping launch
- [ ] Bespoke Builder v0.5 (stone + setting selection, no 3D)
- [ ] Target: **$80K GMV/month** — **stretch** при отрицательном EBITDA Year 1 в §11.2; требует сходимости каналов с §6.3 / §11.2a

### Q4 2026 (Scale)
- [ ] Bespoke Builder v1.0 (3D preview)
- [ ] Buffer stock in Dubai (top-50 SKUs) — **только после** пилота **50+** заказов и ABC (см. §10.3, `OPERATIONS_MANUAL.md` §6); до этого **не** блокировать runway
- [ ] Referral program
- [ ] Mobile app (PWA / React Native)
- [ ] Deal Score v2.0 (ML model)
- [ ] Target: $200K GMV/month

### Q1 2027 (Expansion)
- [ ] USA launch (Delaware LLC, 3PL)
- [ ] EU pilot (Germany)
- [ ] **Stonee Pro** — **не** ставить в календарь до **~$500K+ GMV/мес** или **Series A** (фокус B2C bespoke + loose)
- [ ] Series A fundraising ($1.5–2M)

### Q2 2027 (Platform)
- [ ] AI Concierge (LLM-powered gemologist assistant)
- [ ] Virtual Try-On (AR)
- [ ] Secondary market (trade-in / resale)
- [ ] Target: $500K+ GMV/month

---

## 14. Team & Organizational Structure

### 14.1 Founding Team (Seed Stage)
| Role | Responsibilities | Profile |
|------|-----------------|---------|
| **CEO / Co-Founder** | Strategy, fundraising, partnerships, UAE ops | Ex-jewelry / e-commerce, network in Surat |
| **CTO / Co-Founder** | Architecture, engineering, data, security | Ex-fintech / marketplace, 7+ yrs |
| **Head of Design** | Brand, UX/UI, 3D configurator, unboxing | Luxury / fashion background |
| **Fullstack Engineer ×2** | Frontend (React) + Backend (Fastify/Node) | 3–5 yrs, TypeScript |
| **DevOps / SRE** | K8s, CI/CD, observability, security | 3+ yrs, cloud-native |
| **Surat Agent** | QC, supplier relations, logistics | Gemologist (GIA/IGI certified), local |
| **Growth Manager** | Paid acquisition, SEO, influencers | Performance marketing, 3+ yrs |

### 14.2 Advisory Board
- **Gemology Advisor:** Сертифицированный геммолог (GIA GG) — валидация Deal Score.
- **Legal Advisor (UAE):** Юрист в DMCC — compliance, контракты.
- **Supply Chain Advisor:** Ex-RapNet / ex-De Beers — отношения с поставщиками.

### 14.3 Org Chart (Year 1)
```
CEO
├── CTO
│   ├── Backend Team (2)
│   ├── Frontend (1)
│   └── DevOps (1)
├── Head of Design
│   ├── UX/UI (1)
│   └── 3D / Motion (contractor)
├── Head of Operations
│   ├── Surat Agent (1)
│   └── Customer Success (1)
└── Growth Manager
    ├── Performance (1)
    └── Content (contractor)
```

---

## 15. Appendices

### Appendix A: API Contract Example (OpenAPI 3.0)
```yaml
# GET /v1/diamonds/{id}
paths:
  /v1/diamonds/{id}:
    get:
      summary: Get diamond by ID
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Diamond details
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
                  carat: { type: number }
                  color: { type: string, enum: [D, E, F, G, H, I, J] }
                  clarity: { type: string, enum: [FL, IF, VVS1, VVS2, VS1, VS2] }
                  cut: { type: string, enum: [Ideal, Excellent, Very Good] }
                  price: { type: number }
                  currency: { type: string, enum: [USD] }
                  dealScore: { type: number, minimum: 0, maximum: 100 }
                  certificate: { type: object, properties: { lab: string, number: string } }
                  media: { type: array, items: { type: string, format: uri } }
```

### Appendix B: Target event catalog (RabbitMQ topics — **not implemented** in MVP)
| Topic | Producer | Consumers | Schema Version |
|-------|----------|-----------|----------------|
| `diamond.price.updated` | pricing-service | search-service, analytics-service | v1.0 |
| `diamond.stock.changed` | catalog-service | search-service, notification-service | v1.0 |
| `order.created` | order-service | pricing-service (reservation), notification-service | v2.1 |
| `order.paid` | order-service | catalog-service (lock), logistics-service | v2.1 |
| `order.shipped` | logistics-service | notification-service, analytics-service | v1.0 |
| `user.registered` | user-service | notification-service, analytics-service | v1.0 |

### Appendix C: Database Schema (High-Level)

**MongoDB (`order-service`, база `stonee_orders`):** заказы и корзина как документы; статусы — строковые enum’ы уровня приложения (`PENDING`, `PAID`, `CONFIRMED`, …). Пример упрощённой формы документа заказа:

```javascript
// collection: orders
{
  _id: ObjectId,
  userId: ObjectId,           // или строка, см. модель сервиса
  status: "PAID",
  totalAmount: 4200,
  currency: "USD",
  shippingAddress: {
    fullName: "…",
    addressLine1: "…",
    city: "…",
    country: "…",
    zipCode: "…"
  },
  items: [
    {
      type: "bespoke",       // diamond | setting | jewelry | bespoke
      productId: "…",
      price: 1200,
      bespokePair: { diamondId: "…", settingId: "…" }
    }
  ],
  stripePaymentIntentId: "pi_…",
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**MongoDB (`catalog-service`):**
```javascript
// diamonds collection
{
  _id: ObjectId,
  sku: "SUP-2026-ABCD1234",
  supplierId: "supplier_001",
  shape: "Round",
  carat: 1.25,
  color: "E",
  clarity: "VS1",
  cut: "Ideal",
  price: { amount: 3200, currency: "USD" },
  dealScore: 87.5,
  certificate: { lab: "IGI", number: "LG123456789", url: "..." },
  media: { images: [...], video360: "..." },
  proportions: { table: 57.0, depth: 62.1, l_w_ratio: 1.01 },
  availability: "AVAILABLE", // AVAILABLE, RESERVED, SOLD
  reservedUntil: ISODate,
  updatedAt: ISODate
}
```

### Appendix D: Technology Stack Summary
| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend | React 18, Vite, TailwindCSS v4, Framer Motion | Performance, luxury UX |
| Mobile | PWA (v1), React Native (v2) | Cost-efficient cross-platform |
| API Gateway | Fastify | High throughput, low latency |
| Backend | **Fastify, TypeScript, Zod** (все микросервисы в репозитории) | Единый стек, типобезопасность |
| Databases | **MongoDB** (catalog, orders, users, jewelry, search), **Redis** (search cache); ClickHouse / Elasticsearch — только при отдельном внедрении | MongoDB-first в репозитории |
| Message Bus | RabbitMQ 3.12 (compose; **no domain pub/sub** in current paths) | Future reliable event delivery; см. §7.1 |
| Search | **MongoDB + Redis** в репозитории; Elasticsearch — опционально | Текущий search-service без ES |
| Analytics | ClickHouse | OLAP, fast aggregations |
| Observability | Grafana, Prometheus, Loki, Jaeger | Industry standard |
| CI/CD | GitHub Actions, ArgoCD | GitOps, automation |
| Infra | Kubernetes (K8s), Terraform | IaC, scalability |
| Cloud | Hetzner / AWS (multi-region) | Cost + feature balance |
| Payments | Stripe, PayPal, Crypto (USDT) | Global coverage |
| 3D | Three.js, React Three Fiber | Browser-based configurator |

---

*End of Document*

*Prepared by Stonee Product & Engineering Team. For internal use only.*
