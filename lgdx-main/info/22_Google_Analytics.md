# Google Analytics Setup

## Architecture

Google Analytics настроен через **Docker Secrets** и работает только в production окружении (`docker-compose.prod.secure.final.yml`).

- ✅ **Production (remote)**: GA активен через Docker secret `ga_measurement_id`
- ❌ **Development**: GA отключен
- ❌ **Local Production**: GA отключен (как требуется)

## Quick Setup

### 1. Get Measurement ID
1. https://analytics.google.com/ → Admin → Create Property
2. Set up Web Stream: https://lgdeal.com
3. Copy Measurement ID: `G-XXXXXXXXXX`

### 2. Создать Docker Secret на сервере

```bash
ssh root@49.13.160.126
cd /opt/lgdx

# Создать secret с GA Measurement ID
echo "G-XXXXXXXXXX" | docker secret create ga_measurement_id -

# Проверить
docker secret ls | grep ga_measurement_id
```

### 3. Rebuild и обновить сервис

```bash
cd /opt/lgdx

# Пересобрать клиент (secret читается через entrypoint script)
docker build -t lgdx-lgdx-client:latest ./client

# Обновить сервис
docker service update --force lgdx_lgdx-client
```

**Note:** 
- Docker secret `ga_measurement_id` должен существовать перед запуском
- Entrypoint script автоматически читает secret и создает `env-config.js` при старте контейнера
- Если secret отсутствует, GA просто не инициализируется (silent skip)

## What's Tracked Automatically

- Page views
- Session start/end
- User interactions (clicks, forms)
- Performance metrics
- Errors

## Verify

1. Browser console: `[Analytics] Google Analytics initialized: G-XXXXXXXXXX`
2. GA4 Realtime report shows active users
3. Network tab shows requests to `google-analytics.com`

## Custom Events

```typescript
import { analytics } from '../utils/analytics';

analytics.trackProductViewed(productId, category);
analytics.trackDealCreated(dealId, amount, dealType);
analytics.trackSearch(query, resultsCount);
```

## Troubleshooting

### GA не инициализируется

1. **Проверить наличие Docker secret:**
   ```bash
   docker secret ls | grep ga_measurement_id
   ```

2. **Проверить логи контейнера при старте:**
   ```bash
   docker service logs lgdx_lgdx-client | grep "Google Analytics"
   ```
   Должно быть: `✅ Google Analytics Measurement ID configured`

3. **Проверить содержимое env-config.js в браузере:**
   Открыть `https://lgdeal.com/env-config.js` - должно быть:
   ```javascript
   window.env = {
     REACT_APP_GA_MEASUREMENT_ID: "G-XXXXXXXXXX"
   };
   ```

4. **Проверить консоль браузера:**
   Должно быть: `[Analytics] Google Analytics initialized: G-XXXXXXXXXX`

5. **Проверить network tab:**
   Должны быть запросы к `https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX`

### GA работает в dev/local

- ❌ **Не должно работать** в `docker-compose.dev.yml` и `docker-compose.prod.local.yml`
- ✅ **Должно работать** только в `docker-compose.prod.secure.final.yml` на удаленном сервере

### Отключить GA

Удалить Docker secret:
```bash
docker secret rm ga_measurement_id
docker service update --force lgdx_lgdx-client
```

**Last updated:** 2025-12-10  
**Status:** ✅ Configured with Docker Secrets (runtime injection)

