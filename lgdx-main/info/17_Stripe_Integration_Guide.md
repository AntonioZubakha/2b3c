# Stripe Integration Guide

## Обзор

Интеграция Stripe позволяет покупателям оплачивать сделки мгновенно с помощью кредитных/дебетовых карт, обеспечивая автоматическое подтверждение платежей.

## Архитектура

### Двойной режим оплаты
- **Stripe (быстрая оплата)** - автоматическое подтверждение через webhook
- **Банковский перевод** - ручное подтверждение LGDEAL

### Логика работы
1. После того как инвойс принят и сделка перешла в `awaiting_payment`, покупатель видит варианты оплаты
2. Stripe-оплата автоматически переводит сделку в `payment_received` через webhook `payment_intent.succeeded`
3. Банковский перевод требует ручного подтверждения через action `confirm_payment`

## Настройка Stripe

### 1. Создание аккаунта Stripe

1. Зарегистрируйтесь на [stripe.com](https://stripe.com)
2. Завершите верификацию аккаунта
3. Получите API ключи из Dashboard

### 2. Получение API ключей

**Test Mode (для разработки):**
- Publishable Key: `pk_test_...`
- Secret Key: `sk_test_...`
- Webhook Secret: `whsec_...`

**Live Mode (для продакшена):**
- Publishable Key: `pk_live_...`
- Secret Key: `sk_live_...`
- Webhook Secret: `whsec_...`

### 3. Настройка Webhook

1. В Stripe Dashboard перейдите в Webhooks
2. Создайте новый endpoint: `https://lgdeal.com/api/stripe/webhook`
3. Выберите события:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `charge.dispute.created`
4. Скопируйте Webhook Secret

### 4. Настройка переменных/секретов

**Development (.env):**
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Production (Docker Secrets):**
```bash
# Используются Docker Secrets
stripe_secret_key
stripe_publishable_key
stripe_webhook_secret
```

## API Endpoints

### Получение publishable key (публичный)
```http
GET /api/stripe/publishable-key
```

### Создание Payment Intent
```http
POST /api/stripe/payment-intent/:dealId
Content-Type: application/json

{
  "amount": 1000,
  "currency": "usd"
}
```

Требования по коду (`server/src/controllers/stripeController.ts`):

- Endpoint защищён (`authMiddleware` + `fullAccessMiddleware`).
- Платёж может инициировать только **buyer** сделки (или LGDEAL supervisor в контексте `buyer-to-lgdeal`).
- Статус сделки должен быть **`awaiting_payment`**.
- В `deal.paymentDetails.invoiceFilename` должен быть загруженный инвойс.
- `amount` опционален, но если передан — должен совпадать с `deal.amount` (погрешность до 0.01).

Пример ответа:

```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_...",
    "clientSecret": "pi_..._secret_...",
    "amount": 1000,
    "currency": "usd",
    "status": "requires_payment_method"
  }
}
```

### Получение статуса Payment Intent
```http
GET /api/stripe/payment-intent/:dealId/status
```

### Отмена Payment Intent
```http
POST /api/stripe/payment-intent/:dealId/cancel
```

### Проверка статуса платежа и обновление сделки (manual sync)
```http
POST /api/stripe/payment-intent/:dealId/check-status
```

### Webhook (автоматический)
```http
POST /api/stripe/webhook
Content-Type: application/json
Stripe-Signature: ...
```

## Frontend Integration

### Компоненты

1. **PaymentMethodSelector** - выбор способа оплаты
2. **StripePaymentPanel** - форма оплаты картой
3. **PaymentStatusTimeline** - обновленная временная шкала

### Использование

```tsx
import PaymentMethodSelector from './components/PaymentMethodSelector';

<PaymentMethodSelector
  deal={deal}
  onPaymentSuccess={() => window.location.reload()}
  onPaymentError={(error) => setError(error)}
/>
```

## Best practices (реализовано)

- **Webhook raw body:** endpoint `/api/stripe/webhook` получает сырое тело запроса (до `express.json()`), чтобы проверка подписи Stripe была корректной.
- **Повторное использование Payment Intent:** при создании Payment Intent сервер переиспользует существующий PI по сделке, если он в статусе `requires_payment_method` / `requires_confirmation` / `requires_action` и сумма/валюта совпадают (меньше «осиротевших» PI в Stripe).
- **Идемпотентность webhook:** при повторной доставке `payment_intent.succeeded` обновление сделки не выполняется, если сделка уже в статусе `payment_received`.
- **Валидация возврата:** при частичном возврате проверяется, что сумма не больше уплаченной и положительная.

## Безопасность

### 1. Валидация webhook
- Проверка подписи Stripe (сырое тело запроса)
- Обработка дублирующихся событий (идемпотентность)

### 2. Защита данных
- PCI DSS compliance через Stripe
- Никаких карточных данных на серверах
- Шифрование всех транзакций

### 3. Мониторинг
- Логирование всех платежей
- Алерты на неудачные платежи
- Отслеживание споров

## Тестирование

### Test Cards

**Успешные платежи:**
- `4242424242424242` - Visa
- `5555555555554444` - Mastercard
- `378282246310005` - American Express

**Неудачные платежи:**
- `4000000000000002` - Declined
- `4000000000009995` - Insufficient funds

### Webhook Testing

Используйте Stripe CLI для тестирования webhook:
```bash
stripe listen --forward-to localhost:5001/api/stripe/webhook
```

Примечание: в dev по умолчанию порт хоста `5001` (см. `docker-compose.dev.yml`: `5001:5000`). В прод через Nginx используйте `https://lgdeal.com/api/stripe/webhook`.

## Мониторинг и Аналитика

### Stripe Dashboard
- Просмотр всех транзакций
- Аналитика доходов
- Управление возвратами

### Логи приложения
```bash
# Prod (Swarm)
docker service logs lgdx_lgdx-server --tail 100 | grep Stripe
```

## Troubleshooting

### Частые проблемы

1. **Webhook не работает**
   - Проверьте URL endpoint
   - Убедитесь в правильности webhook secret
   - Проверьте логи сервера

2. **Payment Intent не создается**
   - Проверьте Stripe ключи
   - Убедитесь в правильности суммы
   - Проверьте права пользователя

3. **Платеж не подтверждается**
   - Проверьте webhook события
   - Убедитесь в правильности dealId в metadata
   - Проверьте статус сделки

### Логи

```bash
# Все Stripe операции
grep "Stripe" logs/combined.log

# Ошибки webhook
grep "StripeWebhook" logs/error.log

# Успешные платежи
grep "payment_intent.succeeded" logs/combined.log
```

## Производственное развертывание

### Продакшен секреты и деплой
- Ключи задаются через Docker Secrets (`stripe_secret_key`, `stripe_publishable_key`, `stripe_webhook_secret`).
- Деплой выполняется вручную: SSH → `git pull` → `docker build` нужных сервисов → `docker stack deploy -c docker-compose.prod.secure.final.yml lgdx`.

## Стоимость

### Stripe Fees
- **Online payments**: 2.9% + $0.30 per transaction
- **International cards**: +1.5% additional
- **Currency conversion**: +1% additional

### Рекомендации
- Включите комиссию в цену товара
- Учитывайте международные платежи
- Мониторьте возвраты и споры

## Поддержка

### Документация Stripe
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Elements](https://stripe.com/docs/stripe-js)

### Контакты
- Stripe Support: [support.stripe.com](https://support.stripe.com)
- LGDX Support: support@lgdeal.com
