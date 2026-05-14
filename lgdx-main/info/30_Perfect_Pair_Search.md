## Поиск Perfect Pair (актуально по `server/src/controllers/marketplaceController.ts`)

Документ описывает **фактическую** реализацию поиска пары: API, фильтры/инварианты, скоринг, fallback и админ‑настройки.

### Общее
- **Цель**: найти «пару» к референсному бриллианту, строго совпадающую по `shape` и `color`, с ограничениями по весу/качеству/геометрии и выбором лучшего кандидата по скорингу.
- **Код — источник истины**: основной алгоритм находится в `server/src/controllers/marketplaceController.ts` (функция `findPerfectPair`).

### API

- **Эндпоинт**: `GET /api/marketplace/find-pair`
- **Доступ**: Public (используется `optionalAuthMiddleware`)
  - Если пользователь **LGDEAL supervisor**, в ответе **не скрываются** `price`/`pricePerCarat`.
  - Для остальных пользователей `price` и `pricePerCarat` **удаляются** из объектов в `diamonds[]`.
- **Валидация**: Zod, `FindPerfectPairSchema` (`server/src/validation/schemas/productSchemas.ts`).

#### Query параметры
- **`referenceId`** (обязателен) — ObjectId референсного продукта.
- Дополнительные поля (`shape`, `color`, `clarity`, `carat`, `cut`, `polish`, `symmetry`) **разрешены схемой**, но **в текущей реализации не используются**: алгоритм всегда берёт значения из найденного по `referenceId` продукта.

#### Ответ (фактические формы)

Успех на этапах (найден кандидат на одном из stage):

```json
{
  "success": true,
  "diamonds": [ { "/* Product */": "..." } ],
  "matchScore": 123.45,
  "stageFound": 1
}
```

Fallback (найден кандидат только в «широком» фильтре):

```json
{
  "success": true,
  "diamonds": [ { "/* Product */": "..." } ],
  "stageFound": 0
}
```

Нет кандидатов:

```json
{
  "success": true,
  "message": "No suitable pair found matching the criteria.",
  "diamonds": []
}
```

Ошибки (бросаются как исключения и превращаются в error‑response глобальным обработчиком):
- 404: `Reference product not found`
- 400: `Reference product must have shape and color to find a pair`
- 400: `Reference product must have a valid carat weight (> 0)`
- 400: `Reference product must have a photo to find a pair`

### Инварианты и базовые исключения

Во всех этапах и в fallback кандидаты должны:
- **не быть** самим референсом: `_id != referenceId`
- **не быть** `sold` и **не быть** `onDeal`
- иметь фото: `photo` существует и не пустая строка
- удовлетворять минимальной цене поставщика: `price >= minSupplierPrice`

Значения `shape` и `color` берутся из референса и применяются как **строгие** фильтры.

Минимальная цена берётся из `ConstantsSettingsService`:
- `constants.minSupplierPrice` (fallback: `process.env.MIN_SUPPLIER_PRICE` или `15`)

### Этапный подбор (progressive relaxation)

Настройки этапов берутся из `PerfectPairSettings`:
- `enableProgressiveRelaxation` — если `false`, поиск прекращается после 1-го stage.
- `maxStage` — максимум этапов поиска (1..4).
- `stages[]` — массив stage-конфигов (фактически используется до `maxStage`, но не больше длины массива).

На каждом stage применяется:
- **Окно по весу**: `carat` в пределах ± `stage.caratTolerancePct`% (но не больше 5%).
- **Окно по clarity**: берётся `clarityOrder`, и разрешаются значения в пределах \(\le\) `stage.clarityStepsAllowed` шагов, но шаги ограничены максимумом **2**.
  - Если clarity референса пустая/`N/A`/неизвестная, фильтр по clarity **не ставится**.
- **Окна по cut/polish/symmetry** (только ухудшение):
  - Если поле референса пустое/`N/A` — фильтр по этому полю **не ставится** (разрешены любые значения).
  - Иначе берётся диапазон от значения референса вниз до `maxDowngrade` (но downgrade ограничен максимумом **2**).
  - **Round special rule**: если `shape` = round и `cut` референса `Excellent`/`Very Good`, то разрешены только `Excellent`/`Very Good`.

#### Геометрия/измерения (дополнительные фильтры stage)

Используется `constants.measurementRatioGeometryTolerancePct` (fallback: `0.025`).

Если у референса задано и > 0, то на stage добавляются диапазоны \(\pm tol\) для:
- `ratio`
- `measurement1`, `measurement2`, `measurement3`
- `tableSize`, `totalDepth`
- `crownHeight`, `pavilionDepth`

#### Ограничение пула кандидатов

На stage выбираются кандидаты:
- сортировка: по `price` (возрастание)
- лимит: `stage.maxCandidatesPerStage`, но зажат в диапазон **1..200**

### Скоринг (выбор лучшего в пуле)

Для кандидатов в текущем stage считается `score`, затем выбирается максимум.
Если score равны — выбирается кандидат с меньшей `pricePerCarat` (или `price/carat`).

**Компоненты score (фактически):**
- **Carat score**: близость по `carat` (нормируется относительно 5% окна).
- **Clarity score**: штраф только по модулю разницы шагов (если clarity референса валидная); иначе нейтральный `0.5 * weights.clarity`.
- **Cut/Polish/Symmetry scores**: штраф за downgrade относительно референса; если у референса значение пустое/`N/A` — нейтральный `0.5 * weights.*`.
- **Full GIA bonus** (`weights.bonusFullGia`): добавляется только если у референса **все три** `cut/polish/symmetry` не пустые, и у кандидата одновременно совпали `clarity`, `cut`, `polish`, `symmetry`.
- **Measurements/ratio/geometry score**: суммарная «близость» по измерениям в пределах `tol` (каждое измерение даёт вклад, вес одной размерности фиксирован как 5).
- **Price penalty**: берётся `pricePerCarat` по пулу, считается \(z\)-score; штраф = `max(0, z) * weights.pricePenaltyK`.

**weights** берутся из `PerfectPairSettings.weights`, иначе используются дефолты:
`{ carat: 35, clarity: 20, cut: 15, polish: 10, symmetry: 10, bonusFullGia: 10, pricePenaltyK: 7 }`.

### Fallback (если stage-алгоритм не нашёл)

Если подходящего кандидата не найдено:
- применяется фильтр: строгие `shape` + `color`, `carat` ±5%
- **игнорируются**: `clarity`, `cut`, `polish`, `symmetry` и геометрия/измерения
- выбирается самый дешёвый по `price`
- возвращается `stageFound: 0` (а `matchScore` отсутствует/`undefined`)

### Админ‑настройки (server)

#### Модель
- `PerfectPairSettings`: `server/src/models/PerfectPairSettings.ts`

#### API (фактический доступ и валидация)

Эти эндпоинты требуют `adminAuthMiddleware` и `fullAdminOnly`:
- `GET /api/admin/perfect-pair-settings`
- `PUT /api/admin/perfect-pair-settings`
  - Zod schema: `UpdatePerfectPairSettingsSchema` (в `server/src/routes/admin.ts`)
  - `reason` **обязателен**, `string(1..500)`

### Логирование

Сервер пишет в debug:
- фильтры stage: `[PerfectPair] Stage N filter: ...`
- количество кандидатов: `[PerfectPair] Stage N candidates: X`
- найденный лучший кандидат: `[PerfectPair] Found best match at stage ...`
- fallback фильтр и количество fallback-кандидатов

### Troubleshooting (привязано к коду)

- **ValidationError про photo/shape/color/carat**: референсный продукт не подходит для подбора — исправлять данные продукта.
- **Нет совпадений на stage**:
  - увеличить `caratTolerancePct` на ранних этапах (но в коде она всё равно ограничится 5%)
  - увеличить `maxCandidatesPerStage` (но в коде ограничение 200)
  - если референс имеет много измерений/геометрии, слишком маленький `measurementRatioGeometryTolerancePct` может «задушить» выдачу
- **Непрозрачный результат (у клиента нет цен)**: это ожидаемо — `price`/`pricePerCarat` отдаются только LGDEAL supervisor.


