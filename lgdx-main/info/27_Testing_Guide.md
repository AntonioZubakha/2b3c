# 🧪 27. Руководство по тестированию (актуально по репозиторию)

## 🎯 Обзор

В проекте есть:

- **Unit/Integration tests** (Jest) в сервисах Node/TS.
- **Скрипты системных проверок** в `scripts/testing/`.
- **E2E** на стороне клиента (см. `client/src/__tests__/e2e/`).

Документ описывает **как запускать** тесты и где они лежат. Примеры эндпоинтов/флоу берите из `info/12_API_Reference.md` (код — источник истины).

## 🏗️ Где лежат тесты

### Server (gateway)

- `server/src/tests/integration/*` — интеграционные тесты (например, `server/src/tests/integration/simple-api.test.ts`)
- `server/src/tests/integration/setup.ts` — setup/утилиты для интеграционных тестов (если используются)

### Microservices

Каждый микросервис имеет свой `package.json` и собственные тесты (если есть):

- `analytics-service/`
- `market-price-calculator-service/`
- `api-product-sync-service/`
- `file-product-import-service/`
- `backup-service/`
- `ftp-product-sync-service/`
- `legacy-ftp-poller-service/`
- `ssl-renewal-service/`


## 🚀 Запуск тестов

### Server

```bash
cd server
npm test
```

Если в `server/package.json` есть отдельные команды (например `test:integration`, `test:coverage`) — используйте их.

### Микросервисы

```bash
cd analytics-service
npm test
```

Аналогично для остальных сервисов.

### Клиент

```bash
cd client
npm test
```

## 🧪 Smoke-проверки

**Чат поддержки (ручной smoke):** чеклист из 5 сценариев — виджет, guest, WebSocket+AI, онбординг, клавиатура/reconnect — см. `info/42_Chat_Support_Smoke_Test.md`.

**Ручная проверка API:** см. `info/12_API_Reference.md` — эндпоинты и примеры запросов.

> Папка `scripts/testing/` удалена. Разовые скрипты комплексных тестов (`comprehensive-system-test.js` и др.) более не поддерживаются.

## ⚠️ Важные замечания

- **Auth в production** завязан на HttpOnly cookies (`authToken`). Для API тестов используйте `supertest` cookie jar или прокидывайте cookie вручную.
- **Не используйте фиктивные endpoints** в документации: сверяйтесь с `server/src/routes/*` и `info/12_API_Reference.md`.

---

*Последнее обновление: 2026-03.*

