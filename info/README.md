# Stonee — документация репозитория

Актуальные **технические** материалы лежат в **`info/`**. Корневой [`readme.md`](../readme.md) — краткий вход и ссылки.

**Правило актуальности:** при изменении поведения шлюза, compose, smoke, публичных API или фронтового контракта — в том же изменении обновляйте соответствующие файлы в **`info/`** (и при необходимости корневой `readme.md`). Источник истины по runtime — **код и `docker-compose.yml`**, не бизнес-документы в `MASTER_ENTERPRISE.md` и т.п.

| Файл | Содержание |
|------|------------|
| [PRODUCT.md](./PRODUCT.md) | Продукт **2B3C**: сценарии каталога, РФ, ориентир Rare Carat (не runtime-спека) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Сервисы, шлюз, compose, потоки данных фронта |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Запуск, Docker, env, smoke, скрипты |
| [API.md](./API.md) | Префиксы gateway, публичные маршруты |
| [FRONTEND.md](./FRONTEND.md) | Vite/React, маршруты, API, медиа камня |
| [JEWELRY_SETTINGS.md](./JEWELRY_SETTINGS.md) | Оправы и совместимость камень ↔ оправа |
| [SECURITY.md](./SECURITY.md) | JWT, rate limit, Stripe, секреты |

### Тесты

- **`pnpm run test`** — Vitest в `apps/frontend` (`*.test.ts` / `*.test.tsx`), быстрые проверки чистой логики и HTTP-обёртки.
- **`pnpm run smoke`** — сквозной сценарий против gateway (health, каталог, рекомендации, auth, корзина при наличии камней и т.д.); нужен **`docker compose up`** и при обновлении кода сервисов — пересборка образов.

### Бизнес и операции (не спецификация кода)

Документы **`BUSINESS_PLAN.md`**, **`MASTER_ENTERPRISE.md`**, **`OPERATIONS_MANUAL.md`**, **`GO_TO_MARKET.md`** описывают продукт, сценарии и планы. Цифры и формулировки там **не** автоматически выверены по текущему коду — при расхождении приоритет у репозитория и runtime-поведения.

**Стек бэкенда в монорепо:** Node.js + TypeScript + Fastify (без Python/FastAPI в этом репозитории).
