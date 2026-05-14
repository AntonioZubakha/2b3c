# Миграция API конфигов со старого проекта (PHP → LGDX Admin)

Инструкции по заполнению **API Configurations** в админ-панели для каждой апишки из `config.external.php`.  
Компанию выбирать в списке по имени (после миграции компаний соответствие: старый `company_id` → компания с тем же именем в LGDX).

Поля формы:
- **Company** — выбирается при переходе в редактирование (страница привязана к компании).
- **Config** — URL, Request type (get/post), Headers/Params/Filter/Base body payload (JSON), Data key.
- **Sync schedule** — frequency (daily/hourly/manual), time of day.
- **Token auth** — если API сначала получает токен по отдельному запросу (enabled, url, params, tokens path, token usage).
- **Is active** / **Allow missing media** — чекбоксы.

---

## Первая тройка API

### 1. Classic Grown Jewellery (старый company_id: 523)

**Компания в LGDX:** выбрать компанию с именем **Classic Grown Jewellery** (или похожим, по названию со старой площадки).

| Поле | Значение |
|------|----------|
| **Is active** | ✓ |
| **Allow missing media** | по желанию (можно оставить выкл) |
| **Config → URL** | `https://system.classicgrownjewellery.com/StockAPI/153?password=Sjpl@LGD@1978` |
| **Config → Request type** | `get` |
| **Config → Headers** | `{"Accept": "application/json"}` |
| **Config → Params** | `{}` |
| **Config → Data key** | оставить пустым `""` (ответ — массив на верхнем уровне) |
| **Config → Filter** | `{"Availability": "Available"}` |
| **Config → Base body payload** | `{}` |
| **Sync schedule → Frequency** | `daily` |
| **Sync schedule → Time of day** | `00:00` |
| **Token auth** | не использовать (enabled = false) |

---

### 2. Ramee Gems (старый company_id: 55)

**Компания в LGDX:** выбрать **Ramee Gems**.

| Поле | Значение |
|------|----------|
| **Is active** | ✓ |
| **Allow missing media** | по желанию |
| **Config → URL** | `https://rameegems.com/apis/api/getStockN?auth_key=71uga29icki9` |
| **Config → Request type** | `get` |
| **Config → Headers** | `{}` |
| **Config → Params** | `{}` |
| **Config → Data key** | оставить пустым или подобрать по структуре ответа после первого прогона |
| **Config → Filter** | `{}` |
| **Config → Base body payload** | `{}` |
| **Sync schedule** | `daily`, `00:00` |
| **Token auth** | выкл |

---

### 3. Smit / Wellcome (старый company_id: 607)

**Компания в LGDX:** выбрать компанию, соответствующую **Wellcome** или **Smit** (по старой площадке; URL: wellcome.co.in).

| Поле | Значение |
|------|----------|
| **Is active** | ✓ |
| **Allow missing media** | по желанию |
| **Config → URL** | `http://www.wellcome.co.in/dhavalapi/?APIKEY=LGCVD` |
| **Config → Request type** | `get` |
| **Config → Headers** | `{}` |
| **Config → Params** | `{}` |
| **Config → Data key** | пусто или уточнить по ответу API |
| **Config → Filter** | `{}` |
| **Config → Base body payload** | `{}` |
| **Sync schedule** | `daily`, `00:00` |
| **Token auth** | выкл |

---

## Как вносить в админке

1. **Admin → API Configurations** — открыть список.
2. Найти нужную компанию в списке и нажать **Add** / **Edit**, либо перейти к редактированию конфига компании.
3. Заполнить поля по таблицам выше. **Headers**, **Params**, **Filter**, **Base body payload** — валидный JSON (в т.ч. `{}`).
4. Сохранить. После сохранения можно нажать **Sync now** и проверить, что синк проходит без ошибок; при необходимости скорректировать **Data key** или **Filter** по реальному ответу API.

Дальнейшие апишки из PHP-конфига можно добавлять такими же блоками по три с описанием полей в этом файле.
