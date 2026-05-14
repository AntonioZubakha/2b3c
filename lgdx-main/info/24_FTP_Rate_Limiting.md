# 24. FTP Rate Limiting - Защита от перегрузки

**Создан:** 27 ноября 2025  
**Статус:** ✅ Активно  
**Сервис:** `ftp-product-sync-service`

## 📋 Описание

Система ограничения количества загрузок файлов по FTP для защиты от перегрузки очереди RabbitMQ и ресурсов сервера.

**Принцип работы:** Каждая компания может загружать файлы **раз в 12 часов**.

## 🎯 Цели

- Предотвратить перегрузку очереди `file_upload_tasks` частыми загрузками
- Обеспечить равномерное распределение ресурсов между компаниями
- **Актуальность данных** - обновления 2 раза в сутки через равные промежутки (каждые 12ч)
- Масштабируемость при росте количества поставщиков

## ⚙️ Конфигурация

### Environment переменные:

```yaml
FTP_UPLOAD_DAILY_LIMIT: "1"           # Максимум 1 загрузка на компанию
FTP_UPLOAD_RATE_LIMIT_WINDOW: "43200" # Окно лимита: 12 часов (секунды)
FTP_PASV_URL: "49.13.160.126"         # PASV IP (production)
```

### Логика работы:

```
Окно: 12 часов (43200 секунд)
Лимит: 1 загрузка в окне

Пример:
00:15 → 1-я загрузка (следующая возможна в 12:15)
12:15 → 2-я загрузка (следующая возможна в 00:15)
00:15 → 3-я загрузка (следующая возможна в 12:15)

Результат: 2 обновления в сутки через равные промежутки
```

### Изменение лимитов:

```bash
# В docker-compose.prod.secure.final.yml
environment:
  FTP_UPLOAD_DAILY_LIMIT: "1"      # Количество загрузок в окне
  FTP_UPLOAD_RATE_LIMIT_WINDOW: "43200"  # Размер окна (секунды)

# Примеры других настроек:
# - 1 загрузка каждые 6 часов: LIMIT=1, WINDOW=21600
# - 1 загрузка каждые 8 часов: LIMIT=1, WINDOW=28800
# - 2 загрузки в сутки: LIMIT=2, WINDOW=86400
```

## 🏗️ Архитектура

```
┌──────────────┐
│ FTP Upload   │
└──────┬───────┘
       │
       ▼
┌─────────────────────┐      ┌──────────────┐
│   FileWatcher       │─────▶│    Redis     │
│  (Rate Limiter)     │◀─────│ (Counters)   │
└──────┬──────────────┘      └──────────────┘
       │
       ├─ Allowed  ──▶ RabbitMQ Queue
       │
       └─ Exceeded ──▶ Telegram Alert
                       (File retained)
```

## 📊 Компоненты

### 1. FtpRateLimiter (`rateLimiter.ts`)

**Функции:**
- `checkAndIncrement()` - Проверяет и инкрементирует счетчик
- `getStatus()` - Получает текущий статус лимита
- `reset()` - Сбрасывает лимит (админ функция)
- `decrement()` - Откатывает счетчик при ошибке

**Redis ключи:**
```
ftp:rate_limit:{companyId}  →  TTL: 24 hours
```

### 2. TelegramNotifier (`telegramNotifier.ts`)

**Уведомления:**
```
⚠️ FTP Upload Rate Limit Exceeded

Company: UNIQUE GROWN DIAMOND INC.
File: lgdealweb.csv

Current uploads: 2/1 (12-hour window)
Limit reset: 2025-11-27 12:15 UTC

_The file will be processed after the limit resets._
_Allowed: 1 upload every 12 hours._
```

### 3. FileWatcher Integration

**Логика проверки:**
```typescript
// В processFile()
if (this.rateLimiter) {
  const result = await this.rateLimiter.checkAndIncrement(companyId, companyName);
  
  if (!result.allowed) {
    // Send Telegram alert
    await this.telegramNotifier.sendRateLimitExceeded(...);
    
    // Skip processing (file NOT deleted)
    return;
  }
}
```

## 🚀 Поведение

### ✅ Нормальный сценарий (загрузка через 12 часов):
```
00:15 UTC:
1. File uploaded via FTP (lgdealweb.csv)
2. Rate limit check: 1/1 (OK, first upload)
3. File queued to RabbitMQ
4. File processed successfully
5. Next upload allowed at: 12:15 UTC

12:15 UTC:
1. File uploaded via FTP (lgdealweb_updated.csv)
2. Rate limit check: 1/1 (OK, 12 hours passed)
3. File queued to RabbitMQ
4. File processed successfully
5. Next upload allowed at: 00:15 UTC (next day)

✅ Итог: 2 обновления в сутки через равные промежутки
```

### ⚠️ Превышение лимита (загрузка раньше 12 часов):
```
00:15 UTC:
1. File uploaded via FTP
2. Rate limit check: 1/1 (OK)
3. File processed

06:00 UTC (6 часов спустя):
1. File uploaded via FTP again
2. Rate limit check: 2/1 (EXCEEDED - too early!)
3. Telegram notification sent
4. File RETAINED in /app/ftp-data/{companyId}/files/
5. Processing skipped
6. File will be processed after 12:15 UTC

12:15 UTC:
1. Redis TTL expires (12h window)
2. FileWatcher detects retained file
3. File processed automatically
```

### 🔄 После сброса лимита:
```
1. Redis TTL expires after 12 hours
2. Counter reset to 0
3. Next upload allowed
4. FileWatcher detects retained file (if any)
5. File processed
```

## 🛡️ Защита от ошибок

### Fail-Open Strategy:
- Если Redis недоступен → **разрешаем загрузку**
- Лучше обработать файл, чем потерять данные поставщика

```typescript
catch (error) {
  logger.error('[RateLimiter] Error checking rate limit:', error);
  
  // Fail-open: allow processing
  return {
    allowed: true,
    remaining: this.dailyLimit,
    resetAt: new Date(...),
    currentCount: 0
  };
}
```

## 📈 Метрики

### Prometheus метрики:
```
ftp_rate_limit_checks_total{company="UNIQUE",status="allowed"}
ftp_rate_limit_checks_total{company="UNIQUE",status="exceeded"}
ftp_rate_limit_current{company="UNIQUE"} = 2
```

## 🔍 Мониторинг

### Проверка статуса компании:

```bash
# SSH на сервер
ssh root@49.13.160.126

# Подключаемся к Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Проверяем лимит для компании
GET ftp:rate_limit:691354d390a81324b6435957

# Проверяем TTL (время до сброса)
TTL ftp:rate_limit:691354d390a81324b6435957
```

### Просмотр логов:

```bash
# Все rate limit события
docker logs $(docker ps -q -f name=ftp-service) 2>&1 | grep RateLimiter

# Только превышения лимита
docker logs $(docker ps -q -f name=ftp-service) 2>&1 | grep "Rate limit exceeded"
```

## 🛠️ Админ операции

### Сброс лимита для компании:

```bash
# Подключаемся к Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Удаляем ключ (сбрасываем счетчик)
DEL ftp:rate_limit:691354d390a81324b6435957
```

### Изменение лимита для одной компании:

```typescript
// В коде можно добавить логику per-company limits:
const companyLimit = company.ftpConfig?.settings?.dailyUploadLimit || 2;
```

## 📝 Рекомендации

### Текущие настройки (27 ноября 2025):
- **Лимит:** 1 загрузка каждые 12 часов
- **Эффект:** 2 обновления в сутки через равные промежутки
- **Компаний:** ~10 активных
- **Очередь:** Обрабатывается без задержек
- **Актуальность данных:** Максимум 12 часов (вместо 24ч)

### Преимущества текущей настройки:
1. ✅ **Более свежие данные** - обновления каждые 12ч (утро/вечер)
2. ✅ **Равномерная нагрузка** - нет "всплесков" загрузок
3. ✅ **Простое правило** - "раз в 12 часов" понятнее чем "2 раза в сутки"

### Когда уменьшать окно (делать обновления чаще):
1. Очередь пустая (0-1 сообщений)
2. File-import-service работает < 50% capacity
3. Поставщики запрашивают более частые обновления
4. **Пример:** Изменить окно на 8 часов (3 обновления в сутки)

### Признаки перегрузки (нужно увеличить окно):
1. Очередь `file_upload_tasks` > 50 сообщений
2. File-import-service CPU > 80%
3. Задержки обработки > 5 минут

## 🔗 Связанные файлы

- `ftp-product-sync-service/src/services/rateLimiter.ts`
- `ftp-product-sync-service/src/services/telegramNotifier.ts`
- `ftp-product-sync-service/src/services/fileWatcher.ts`
- `ftp-product-sync-service/src/shared/redis.ts`
- `docker-compose.prod.secure.final.yml` (ftp-service environment)

## 📚 См. также

- [06_SSL_Certificate_Management.md](./06_SSL_Certificate_Management.md)
- [19_Monitoring_Quick_Start.md](./19_Monitoring_Quick_Start.md)
- [MICROSERVICES_AUDIT_REPORT.md](./MICROSERVICES_AUDIT_REPORT.md)

---

**Последнее обновление:** 27 ноября 2025  
**Версия:** 1.0.0

