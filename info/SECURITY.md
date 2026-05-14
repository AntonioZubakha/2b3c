# Безопасность и комплаенс (обзор для разработки)

Документ фиксирует **реализованные в репозитории** механизмы и ожидания для production. Не заменяет юридический аудит.

## API Gateway

- **JWT** (`@fastify/jwt`): для защищённых маршрутов требуется валидный Bearer-токен; в upstream добавляются `x-user-id`, `x-user-role`.
- **Rate limiting:** лимит **на IP** в минуту (`@fastify/rate-limit` в `apps/api-gateway/src/server.ts`), **раздельно по типу трафика**:
  - **Чтение:** `GET` под `/api/search`, `/api/catalog`, `/api/jewelry`, `/api/recommendations` — лимит **`STONEE_GATEWAY_RATE_LIMIT_READ_MAX`** (по умолчанию **1000**/мин).
  - **Остальное** (в т.ч. `POST` checkout, `GET /api/order/...`, `GET /api/user/...`) — **`STONEE_GATEWAY_RATE_LIMIT_MUTATE_MAX`** (по умолчанию **150**/мин).
  - **Stripe webhook:** `POST /api/order/webhooks/stripe` — **`STONEE_GATEWAY_RATE_LIMIT_WEBHOOK_MAX`** (по умолчанию **5000**/мин).
  - **Обратная совместимость:** если задан только **`STONEE_GATEWAY_RATE_LIMIT_MAX`**, а read/mutate не заданы — read = это значение, mutate = `max(50, ⌊read/4⌋)`.
- **CORS:** если задана **`STONEE_CORS_ORIGINS`** (строка: origin’ы через **запятую**, без пробелов вокруг URL или с trim в коде), шлюз использует **только этот список**; иначе — **`origin: true`** (удобно для локальной разработки, **опасно** для публичного production). См. чеклист ниже.
- **Публичные исключения:** см. `info/API.md` (каталог, гостевая корзина, Stripe webhook, health).

## Чеклист перед production-деплоем (gateway)

1. **`STONEE_CORS_ORIGINS`** — непустая строка с доверенными origin’ами фронта. Проверка: `pnpm run check:prod-gateway` (см. `scripts/check-prod-gateway.mjs`).
2. **`JWT_SECRET`** — не дефолт `changeme`; уникальный секрет. В CI перед продом можно вызвать **`pnpm run check:prod-gateway:strict`** (CORS + JWT).
3. Лимиты шлюза — см. блок выше (`STONEE_GATEWAY_RATE_LIMIT_*`).
4. Убедиться, что TLS и reverse-proxy не отключают `trustProxy`, если rate limit считает IP с заголовка `X-Forwarded-For`.

## Платежи

- **Stripe:** секреты только на сервере (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` в order-service). Webhook проверяется в order-service; gateway пропускает путь без JWT.
- Режим **`STRIPE_ALLOW_SIMULATED_PAY`** — только для разработки без реального Stripe.

## Секреты

- Не коммитить `.env` с прод-секретами.  
- Менять дефолтные значения `JWT_SECRET` и `changeme` перед публичным деплоем.

## Персональные данные

- Профиль пользователя и заказы хранятся в MongoDB сервисов user/order. Политика хранения и сроки — зона продукта/юридического оформления (см. [MASTER_ENTERPRISE.md](./MASTER_ENTERPRISE.md) §6.0, [OPERATIONS_MANUAL.md](./OPERATIONS_MANUAL.md)).

## Рекомендации на production

- TLS на reverse-proxy, только HTTPS снаружи.  
- Выполнить **чеклист gateway** выше; не деплоить с пустым `STONEE_CORS_ORIGINS` при публичном фронте.  
- Включить централизованные логи и алерты.  
- **MongoDB:** ежедневный **mongodump** (или snapshot облака) в **шифрованное** object storage; шаблон — `scripts/mongodb-backup.example.sh`; в репозитории также `pnpm run backup:mongo` (`scripts/mongodb-backup.mjs`, требует `MONGODB_URI`); **квартальный** тест восстановления на staging.  
- **Stripe webhooks:** в `order-service` дедуп по **`event.id`** (коллекция `ProcessedStripeEvent`) + идемпотентный переход заказа из `PENDING`; при расширении — smoke на тройную доставку одного события.

## KYC / high-ticket gate (честность vs MASTER §9.1)

- **Реализовано в коде:** при **`STONEE_KYC_ENFORCE_MIN_USD` > 0** сервис заказов перед **`POST /checkout`** и **`POST /orders/:id/create-payment-intent`** запрашивает у user-service статус KYC по внутреннему HTTP (`GET /internal/kyc/:userId` с заголовком **`x-stonee-internal`** = **`STONEE_INTERNAL_SECRET`**). Покупатели с суммой заказа ≥ порога должны иметь **`kycStatus: verified`**; роли staff/supplier пропускаются. Ответы клиенту: **`403`** с **`code: kyc_required`**, при недоступности user-service — **`503`** с **`code: kyc_unavailable`** (при заданном internal secret).
- **Не публичный путь:** `/internal/kyc/*` **не** проксируется через API gateway; вызывается только из Docker-сети (order-service → user-service).
- **Dev-only самопроверка:** при **`STONEE_ALLOW_KYC_SELF_VERIFY=true`** доступен **`POST /auth/kyc/self-verify`** (JWT); в production выключать. Полноценный KYC-провайдер, AML-мониторинг и юридическое закрытие DMCC — по-прежнему **P0** к публичному приёму платежей (см. `MASTER_ENTERPRISE.md`, раздел 9.1).
