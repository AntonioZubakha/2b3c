# Stonee

Монорепозиторий платформы: **React (Vite)** + **Fastify**-микросервисы, **MongoDB**, **Redis** (кэш поиска), **Docker Compose**. Продуктовое имя и сценарии **2B3C** (РФ, два пути в каталоге) — см. [`info/PRODUCT.md`](./info/PRODUCT.md); планирование GSD — каталог [`.planning/`](./.planning/).

## Документация

Индекс и описание структуры — **[`info/README.md`](./info/README.md)**. Там же ссылки на архитектуру, API, фронт, запуск и security. Технические файлы в **`info/`** поддерживаются в соответствии с кодом и `docker-compose.yml`.

## Быстрый старт

```bash
docker compose up -d --build
```

- **Frontend:** http://localhost:3000  
- **API Gateway:** http://localhost:8080  

После поднятия стека:

```bash
pnpm run smoke
```

Unit-тесты (без Docker): `pnpm run test`. Подробности — [`info/DEVELOPMENT.md`](./info/DEVELOPMENT.md).
