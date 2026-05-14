# 🚀 Быстрый старт мониторинга в Grafana

**Дата создания:** 2025-11-19  
**Последнее обновление:** 2025-11-22  
**Для:** Операторов и DevOps инженеров

---

## 📍 Шаг 1: Добавить источники данных (Data Sources)

### 1.1. Добавить Prometheus (для метрик)

1. Открой Grafana: `https://lgdeal.com/grafana/` (prod) или `http://localhost:3000` (local)
2. Войди: `admin` / `admin`
3. Слева в меню нажми **⚙️ Configuration** → **Data sources**
4. Нажми кнопку **Add data source**
5. Выбери **Prometheus**
6. В поле **URL** введи: `http://prometheus:9090`
   - ⚠️ Важно: это URL **внутри Docker overlay сети** (service discovery), не `localhost`.
7. Нажми **Save & Test**
8. Должно появиться зелёное сообщение: **"Data source is working"** ✅

### 1.2. Добавить Loki (для логов)

1. Снова нажми **Add data source**
2. Выбери **Loki**
3. В поле **URL** введи: `http://loki:3100`
   - ⚠️ Важно: это URL **внутри Docker overlay сети** (service discovery), не `localhost`.
4. Нажми **Save & Test**
5. Должно появиться зелёное сообщение: **"Data source is working"** ✅

---

## 📊 Шаг 2: Что наблюдать (самое важное)

### 🔴 КРИТИЧНО (если это сломается — сайт не работает):

#### 1. Статус всех сервисов
**Где смотреть:** В Grafana → **Explore** → выбери **Prometheus** → введи:
```
up
```
Это покажет, какие сервисы работают (1 = работает, 0 = не работает)

**Что нормально:** Все должны быть `1`

#### 2. Ошибки сервера (5xx ошибки)
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])
```

**Что нормально:** Должно быть `0` или очень мало

#### 3. Время ответа сайта
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])
```

**Что нормально:** Меньше 0.5 секунды (500 миллисекунд)

#### 4. Использование памяти
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))
```

**Что нормально:** Меньше 80%

---

### 🟡 ВАЖНО (если это сломается — проблемы, но сайт работает):

#### 5. Ошибки в логах
**Где смотреть:** **Explore** → выбери **Loki** → введи:
```
{container=~"lgdx_lgdx-server.*"} |= "error"
```
или
```
{service="lgdx_lgdx-server"} |= "error"
```

**Что нормально:** Ошибок должно быть мало или вообще нет

**💡 Совет:** Используй кнопку **Label browser** в Grafana Explore, чтобы увидеть все доступные лейблы и их значения!

#### 6. Очередь задач (RabbitMQ)
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
rabbitmq_queue_messages_ready
```

**Что нормально:** Очередь не должна расти бесконечно

#### 7. Последний бэкап
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
backup_last_success_timestamp
```

**Что нормально:** Бэкап был не более 24 часов назад

#### 8. SSL сертификат
**Где смотреть:** **Explore** → **Prometheus** → введи:
```
ssl_certificate_expiry_days
```

**Что нормально:** Больше 14 дней до истечения

---

## 🎨 Шаг 3: Создать простой дашборд (Dashboard)

### Быстрый способ:

1. В Grafana нажми **+** (слева вверху) → **Create** → **Dashboard**
2. Нажми **Add visualization**
3. Выбери **Prometheus** как источник данных
4. В поле **Metrics** введи: `up`
5. Нажми **Apply**
6. Нажми **Save dashboard** (иконка дискеты вверху)
7. Назови дашборд: "Основные метрики"

### Что добавить на дашборд:

1. **Панель "Статус сервисов"**
   - Метрика: `up`
   - Тип: **Stat** (статистика)
   - Покажет: сколько сервисов работает

2. **Панель "Время ответа"**
   - Метрика: `rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])`
   - Тип: **Graph** (график)
   - Покажет: как быстро отвечает сайт

3. **Панель "Использование памяти"**
   - Метрика: `100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))`
   - Тип: **Gauge** (датчик)
   - Покажет: сколько памяти используется

4. **Панель "Ошибки"**
   - Метрика: `rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])`
   - Тип: **Graph** (график)
   - Покажет: сколько ошибок происходит

5. **Панель "SSL сертификат"**
   - Метрика: `ssl_certificate_expiry_days`
   - Тип: **Gauge** (датчик)
   - Покажет: сколько дней до истечения SSL сертификата

---

## 🔍 Шаг 4: Как искать ошибки в логах

### В Grafana Explore (Loki):

1. Нажми **Explore** (иконка компаса слева)
2. Выбери **Loki** как источник данных
3. В поле запроса введи:

**Все логи сервера:**
```
{container=~"lgdx_lgdx-server.*"}
```
или
```
{service="lgdx_lgdx-server"}
```

**Только ошибки:**
```
{container=~"lgdx_lgdx-server.*"} |= "error"
```

**Логи конкретного сервиса:**
```
{container=~"lgdx_api-sync-service.*"}
```
или
```
{service="lgdx_api-sync-service"}
```

**Логи за последний час с ошибками (только приложения, без системных сервисов):**
```
{container=~"lgdx_(lgdx-server|api-sync-service|file-import-service|ftp-service|market-price-calculator|backup-service|analytics-service|lgdx-client|mongodb|rabbitmq|redis).*"} |= "error"
```

**💡 Важно:** Логи системных сервисов мониторинга (Loki, Promtail, Grafana, Prometheus и т.д.) автоматически исключены из сбора, чтобы не засорять результаты поиска ошибок.

**💡 Важно:** 
- В Docker Swarm имена сервисов имеют префикс `lgdx_` (например, `lgdx_lgdx-server`)
- Используй **Label browser** в Grafana Explore, чтобы увидеть все доступные лейблы
- Можно использовать `container` (по имени контейнера) или `service` (по имени сервиса Swarm)

4. Нажми **Run query** (или Enter)
5. Увидишь все логи, которые соответствуют запросу

---

## ✅ Ежедневная проверка (2 минуты)

### Быстрая проверка:

1. Открой Grafana: `https://lgdeal.com/grafana/`
2. Открой свой дашборд "Основные метрики"
3. Проверь:
   - ✅ Все сервисы работают? (зелёные)
   - ✅ Ошибок нет? (0 или очень мало)
   - ✅ Память меньше 80%? (зелёная)
   - ✅ Время ответа нормальное? (меньше 0.5 сек)
   - ✅ SSL сертификат не истекает? (>14 дней)

**Если всё зелёное — всё хорошо! 🎉**

---

## 🚨 Что делать, если что-то красное?

### Если сервис не работает:

1. Открой **Explore** → **Loki**
2. Используй **Label browser** (кнопка справа от поля запроса), чтобы увидеть все доступные лейблы
3. Введи: `{container=~"lgdx_название-сервиса.*"} |= "error"`
4. Посмотри последние ошибки
5. Если не понятно — обратись к разработчику

### Если много ошибок:

1. Открой **Explore** → **Loki**
2. Введи: `{container=~"lgdx_lgdx-server.*"} |= "error"`
3. Посмотри, какие ошибки повторяются
4. Скопируй ошибку и покажи разработчику

### Если память заканчивается:

1. Проверь, какие сервисы используют больше всего памяти
2. В **Explore** → **Prometheus** введи:
   ```
   container_memory_usage_bytes
   ```
3. Посмотри, какой сервис "ест" больше всего памяти

### Если SSL сертификат истекает:

1. Проверь дату истечения:
   ```bash
   ssh root@49.13.160.126
   certbot certificates
   ```
2. Проверь логи ssl-renewal-service:
   ```bash
   docker service logs lgdx_ssl-renewal-service --tail 100
   ```
3. См. [06_SSL_Certificate_Management.md](06_SSL_Certificate_Management.md) для деталей

---

## 📚 Полезные запросы (Prometheus)

### Основные метрики:

**Сколько запросов в секунду:**
```
rate(http_request_duration_seconds_count[5m])
```

**Сколько ошибок в секунду:**
```
rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])
```

**Использование CPU:**
```
100 - (avg(rate(container_cpu_usage_seconds_total[5m])) * 100)
```

**Свободная память:**
```
node_memory_MemAvailable_bytes / 1024 / 1024 / 1024
```

**SSL сертификат (дней до истечения):**
```
ssl_certificate_expiry_days
```

**Последний бэкап (Unix timestamp):**
```
backup_last_success_timestamp
```

**Статус последнего SSL renewal:**
```
ssl_last_renewal_success
```

---

## 📚 Полезные запросы (Loki - логи)

### Поиск в логах:

**Все логи приложений за последний час (без системных сервисов):**
```
{container=~"lgdx_(lgdx-server|api-sync-service|file-import-service|ftp-service|market-price-calculator|backup-service|analytics-service|lgdx-client|mongodb|rabbitmq|redis).*"}
```

**💡 Важно:** Логи системных сервисов мониторинга (Loki, Promtail, Grafana, Prometheus и т.д.) автоматически исключены из сбора.

**Ошибки во всех сервисах приложений (без системных сервисов):**
```
{container=~"lgdx_(lgdx-server|api-sync-service|file-import-service|ftp-service|market-price-calculator|backup-service|analytics-service|lgdx-client|mongodb|rabbitmq|redis).*"} |= "error"
```

**Логи конкретного контейнера:**
```
{container=~"lgdx_lgdx-server.*"}
```

**Логи с конкретным текстом:**
```
{container=~"lgdx_lgdx-server.*"} |~ "database|connection|timeout"
```

**Логи SSL renewal service:**
```
{container=~"lgdx_ssl-renewal-service.*"}
```

**💡 Как найти правильное имя:**
1. В Grafana Explore нажми кнопку **Label browser** (справа от поля запроса)
2. Выбери лейбл `container` или `service`
3. Увидишь все доступные значения (например, `lgdx_lgdx-server.1.xxxxx`)
4. Используй регулярное выражение `.*` для поиска по всем контейнерам сервиса

---

## 🎯 Итоговая памятка

### Каждый день проверяй:
1. ✅ Все сервисы работают
2. ✅ Ошибок нет
3. ✅ Память в норме
4. ✅ Сайт быстро отвечает
5. ✅ SSL сертификат не истекает

### Если что-то не так:
1. Открой логи в **Explore** → **Loki**
2. Найди ошибку
3. Если не понятно — обратись к разработчику

### Главное правило:
**Если всё зелёное — всё хорошо! 🎉**

---

## Ссылки на документацию

- [18_Monitoring.md](18_Monitoring.md) - Полное руководство по мониторингу
- [06_SSL_Certificate_Management.md](06_SSL_Certificate_Management.md) - Управление SSL сертификатами
- [07_Troubleshooting.md](07_Troubleshooting.md) - Решение проблем

---

**Готово!** Теперь ты знаешь, как наблюдать за системой. Начни с добавления Prometheus и Loki как источников данных, потом создай простой дашборд с основными метриками.

