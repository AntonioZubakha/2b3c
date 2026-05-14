# Блокировка камней в сделках (защита от перезаписи и удаления)

Камни (продукты), участвующие в сделке или уже проданные, защищены от перезаписи при синке стоков, от изменения рыночной цены и от удаления. Ниже — как это устроено.

---

## 1. Модель продукта: флаги и статус

В схеме **Product** (server, api-product-sync-service, file-product-import-service) есть поля:

- **`onDeal`** (boolean) — камень в активной сделке.
- **`sold`** (boolean) — камень продан (сделка завершена).
- **`dealId`** (ObjectId) — ссылка на сделку.
- **`status`** — `'available' | 'OnDeal' | 'Sold' | 'reserved' | 'inactive'`.

Когда сделка **создаётся** (dealInitiationService), у всех камней сделки выставляется:

- `status = 'OnDeal'`
- `onDeal = true`
- `dealId = <id сделки>`

Когда сделка **завершается успешно** (confirmDelivery / processProductsOnDealEnd):

- `status = 'Sold'`
- `sold = true` (в коде в `deal/helpers.ts` используется `product.isSold` — при необходимости привести к полю схемы `sold`)  
(и при необходимости сертификат попадает в BlacklistedCertificate).

Когда сделка **отменяется**:

- `status = 'available'`
- `onDeal = false`
- `sold = false`

То есть «заблокированными» считаются продукты с **`onDeal === true`** или **`sold === true`**.

---

## 2. Защита от перезаписи при обновлении стоков

### 2.1 API Product Sync Service

- При синке по API для каждого продукта из источника проверяется, есть ли уже продукт с тем же `certificateNumber` в БД.
- Если **существует** и у него **`onDeal === true`** или **`sold === true`** — продукт **не обновляется**, запись пропускается, в отчёт идёт причина `existing_on_deal_or_sold` и увеличивается счётчик `skippedExistingOnDealOrSold`.
- Код: `api-product-sync-service/src/shared/syncUtils.ts` (проверка `existingProduct.onDeal || existingProduct.sold` перед upsert).

### 2.2 File Product Import Service

- При импорте из файла (Excel/CSV) для каждого камня проверяется существующий продукт по компании и `certificateNumber`.
- Если продукт **уже есть** и у него **`onDeal`** или **`sold`** (или кэшированный флаг `isOnDealOrSold`) — импорт **не обновляет** этот продукт, возвращается `success: false`, причина `'Product is already on deal or sold'`, увеличивается `skippedExistingOnDealOrSold`.
- Код: `file-product-import-service/src/shared/productUtils.ts` (проверка `isOnDealOrSold` перед `findByIdAndUpdate`).

Итого: при синке (API или файл) камни в сделке или проданные **не перезаписываются** новыми данными из источника.

---

## 3. Защита от удаления при обновлении стоков

### 3.1 API Product Sync Service (удаление «устаревших»)

- Если включено удаление устаревших (`preDeleteStale`), сервис строит список сертификатов из текущего ответа API и ищет в БД продукты **этой компании**, которых **нет** в этом списке.
- Перед добавлением операции **удаления** проверяется: **`prod.onDeal || prod.sold`** — если true, продукт **не удаляется** (`continue`), в операцию delete он не попадает.
- Код: `api-product-sync-service/src/shared/syncUtils.ts` (Step 4: Identify stale products — `if (prod.onDeal || prod.sold) continue;`).

### 3.2 File Product Import Service (режим «заменить»)

- В режиме **replace** перед импортом выполняется массовое удаление продуктов компании, **кроме** тех, кто в сделке или продан:
  - `Product.deleteMany({ company, onDeal: { $ne: true }, sold: { $ne: true } })`.
- То есть удаляются только продукты без `onDeal` и без `sold`; камни в сделке или проданные **не удаляются**.
- Код: `file-product-import-service/src/worker.ts` (комментарий: «If replace mode, delete only products that are NOT on deal and NOT sold»).

Итого: при любом «подчищении» стока по синку или замене файлом камни в сделке и проданные **никогда не удаляются**.

---

## 4. Защита от изменения market price (Market Price Calculator Service)

- При расчёте рыночных цен продукты с **`onDeal === true`** или **`status === 'OnDeal'`**:
  - **не участвуют** в агрегации для расчёта категорий (выборка из БД с условием `onDeal: { $ne: true }`);
  - **не обновляются** при проставлении `marketPrice` / `marketPricePerCarat`: перед обновлением снова проверяется `status === 'OnDeal'` и `onDeal === true`, такие продукты пропускаются;
  - сам `updateOne` для записи рыночной цены делается с условием `status: { $ne: 'OnDeal' }, onDeal: { $ne: true }`, чтобы даже при гонке не перезаписать цену у камня в сделке.
- Код: `market-price-calculator-service/src/calculator.ts` (исключение onDeal из выборки, проверки перед обновлением, условие в `updateOne`).

Итого: у камней в сделке **не перезаписываются** `marketPrice` и `marketPricePerCarat` при пересчёте рыночных цен.

---

## 5. Защита от ручного изменения/удаления (Server API)

- В **inventoryController** при обновлении продукта (PATCH/update) перед применением изменений проверяется:
  - продукт принадлежит компании пользователя;
  - **если `product.onDeal || product.sold`** — возвращается **403** с сообщением `'Cannot modify product: it is on a deal or already sold'`, обновление **не выполняется**.
- Код: `server/src/controllers/inventoryController.ts` (проверка перед `findByIdAndUpdate`).

Отдельного API для удаления продукта в коде не найдено; при его появлении ту же проверку `onDeal`/`sold` нужно добавить, чтобы не удалять камни в сделке или проданные.

---

## 6. Краткая сводка

| Действие | Где | Защита |
|----------|-----|--------|
| Перезапись при API-синке | api-product-sync-service | Пропуск продукта, если `onDeal` или `sold`; счётчик `skippedExistingOnDealOrSold`. |
| Перезапись при файловом импорте | file-product-import-service | Не обновлять существующий продукт, если он onDeal/sold; ответ с причиной. |
| Удаление «устаревших» при API-синке | api-product-sync-service | Не добавлять в delete операции продукты с `onDeal` или `sold`. |
| Удаление при replace-импорте | file-product-import-service | `deleteMany` только по условию `onDeal: { $ne: true }, sold: { $ne: true }`. |
| Обновление рыночной цены | market-price-calculator-service | Исключение onDeal из выборки и из обновления; условие в `updateOne`. |
| Ручное изменение продукта | server inventoryController | 403, если `onDeal` или `sold`. |

Во всех случаях «блокировка» — это проверка полей **`onDeal`** и **`sold`** у продукта; выставляются они при создании/завершении/отмене сделки в **dealInitiationService** и **deal/helpers** (`processProductsOnDealEnd`).
