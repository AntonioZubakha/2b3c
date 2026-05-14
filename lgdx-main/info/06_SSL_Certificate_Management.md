# SSL Certificate Management

**Дата создания:** 2025-11-20  
**Последнее обновление:** 2025-11-22  
**Статус:** ✅ Продакшен  
**Версия:** 1.1.0

---

## 📋 Содержание

1. [Обзор](#обзор)
2. [Автоматическое обновление](#автоматическое-обновление)
3. [Конфигурация сервиса](#конфигурация-сервиса)
4. [Расписание задач](#расписание-задач)
5. [Мониторинг](#мониторинг)
6. [Troubleshooting](#troubleshooting)

---

## Обзор

### Текущая конфигурация

- **Provider:** Let's Encrypt (Certbot)
- **Domain:** `lgdeal.com`, `www.lgdeal.com`
- **Certificate type:** ECDSA
- **Renewal period:** 90 days (автоматическое обновление за 30 дней до истечения)
- **Certificate path:** `/etc/letsencrypt/live/lgdeal.com/`
- **Service:** `lgdx_ssl-renewal-service` (Docker Swarm)

### Архитектура

```
ssl-renewal-service (Node.js microservice)
  ├── Cron scheduler (Monday 01:30 UTC)
  ├── Certbot integration
  ├── Nginx control (Docker Swarm)
  ├── Certificate validation
  ├── Automatic backup & rollback
  ├── Telegram notifications
  └── Prometheus metrics
```

---

## Автоматическое обновление

### Алгоритм обновления (8 шагов)

#### Шаг 1: Проверка необходимости обновления
```typescript
// Проверить срок действия сертификата
certbot certificates | grep "Expiry Date"

// Если осталось < 30 дней → продолжить
// Если > 30 дней → выход
```

**Критерий:** Сертификат требует обновления, если до истечения осталось менее 30 дней.

---

#### Шаг 2: Подготовка к обновлению
```bash
# 2.1 Создать backup текущего сертификата
BACKUP_DIR="/app/ssl-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -L /etc/letsencrypt/live/lgdeal.com/* "$BACKUP_DIR/"

# 2.2 Записать информацию о текущем сертификате
openssl x509 -in /etc/letsencrypt/live/lgdeal.com/fullchain.pem \
  -noout -serial -dates > "$BACKUP_DIR/cert_info.txt"

# 2.3 Проверить доступность домена
curl -I https://lgdeal.com --max-time 10 || exit 1
```

**Критерии успеха:**
- Backup создан
- Текущий сертификат валиден
- Домен доступен

---

#### Шаг 3: Освобождение порта 80
```bash
# 3.1 Остановить Nginx (scale down to 0)
docker service scale lgdx_nginx=0

# 3.2 Дождаться полной остановки (max 30 сек)
# 3.3 Проверить, что порт 80 свободен
```

**⏱️ Время простоя начинается здесь: ~5-10 секунд**

---

#### Шаг 4: Обновление сертификата
```bash
certbot renew \
  --force-renewal \
  --no-random-sleep-on-renew \
  --preferred-challenges http \
  --non-interactive \
  --agree-tos
```

**⏱️ Время: ~10-15 секунд**

---

#### Шаг 5: Валидация нового сертификата
```bash
# Проверить существование файлов
# Проверить срок действия > 60 дней
# Проверить домены в сертификате
```

---

#### Шаг 6: Применение нового сертификата
```bash
# Scale up Nginx
docker service scale lgdx_nginx=1

# Дождаться запуска (max 60 сек)
```

**⏱️ Время простоя заканчивается здесь: ~15-20 секунд**

**📊 Общее время простоя: ~20-30 секунд**

---

#### Шаг 7: Проверка работоспособности
```bash
# HTTP health check
curl http://lgdeal.com/health

# HTTPS health check
curl https://lgdeal.com/health

# SSL certificate verification
openssl s_client -servername lgdeal.com -connect lgdeal.com:443
```

---

#### Шаг 8: Уведомление об успехе
- Отправка уведомления в Telegram
- Запись в лог
- Обновление Prometheus метрик
- Удаление старых backup'ов (оставить последние 5)

---

## Конфигурация сервиса

### Docker Compose

```yaml
ssl-renewal-service:
  image: lgdx-ssl-renewal-service:latest
  user: "root"
  environment:
    NODE_ENV: production
    DOMAIN: "lgdeal.com"
    STACK_NAME: "lgdx"
    NGINX_SERVICE_NAME: "lgdx_nginx"
    COMPOSE_FILE: "/opt/lgdx/docker-compose.prod.secure.final.yml"
    CERT_PATH: "/etc/letsencrypt/live/lgdeal.com"
    BACKUP_DIR: "/app/ssl-backups"
    LOG_FILE: "/app/logs/ssl-renewal.log"
    RENEWAL_SCHEDULE: "30 1 * * 1"  # Monday 01:30 UTC
    LOG_LEVEL: "info"
    HEALTH_PORT: "3000"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:rw
    - /etc/letsencrypt:/etc/letsencrypt:rw
    - /opt/lgdx:/opt/lgdx:ro
    - ssl_backups:/app/ssl-backups
    - ssl_logs:/app/logs
  networks:
    - lgdx-network
  secrets:
    - system_monitoring_bot_token
    - system_monitoring_chat_id
  healthcheck:
    test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]
    interval: 60s
    timeout: 10s
    retries: 3
    start_period: 30s
  deploy:
    replicas: 1
    resources:
      limits:
        memory: 256M
        cpus: '0.3'
```

### Endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/status` | GET | JSON status с метриками |
| `/trigger-renewal` | POST | Ручной запуск обновления |

---

## Расписание задач

### 🔄 Анализ конфликтов

**Проблема (до исправления):** В понедельник в 03:00 UTC одновременно запускались:
- backup-service (ежедневно)
- market-price-calculator (каждые 3 часа)
- **ssl-renewal-service** (останавливал Nginx!)

**Решение:** Изменено расписание SSL renewal на **01:30 UTC (понедельник)**

### 📅 Текущее расписание (после исправления)

```
01:30 UTC - ssl-renewal-service (ПОНЕДЕЛЬНИК)
          └─ Обновление SSL сертификата
          └─ Downtime: ~20-30 секунд
          └─ ✅ БЕЗОПАСНО: никакие другие задачи не работают

02:00 UTC - api-sync-service (ежедневно)
          └─ Синхронизация данных (~60 мин)

03:00 UTC - backup-service (ежедневно)
          └─ Backup базы данных

03:00 UTC - market-price-calculator (каждые 3 часа)
          └─ Пересчёт цен

03:45 UTC - analytics-service (ежедневно)
          └─ Аналитика
```

### ✅ Преимущества нового расписания

- ✅ **Изоляция:** SSL renewal работает до всех остальных задач
- ✅ **Минимальная нагрузка:** 01:30 UTC = минимум активных пользователей
- ✅ **Предсказуемость:** четкое разделение времени выполнения
- ✅ **Безопасность:** никакие критические операции не прерываются

---

## Мониторинг

### Prometheus Metrics

```
ssl_certificate_expiry_days          - Дней до истечения
ssl_last_renewal_timestamp_seconds   - Время последнего обновления (Unix timestamp)
ssl_last_renewal_duration_seconds    - Длительность обновления
ssl_last_downtime_seconds            - Downtime при обновлении
ssl_last_renewal_success             - Статус (1=success, 0=failed)
ssl_total_renewals_total             - Всего успешных обновлений
ssl_failed_renewals_total            - Всего неудачных обновлений
```

### Prometheus Rules (рекомендуется)

```yaml
# monitoring/rules/ssl_renewal.yml
groups:
  - name: ssl_renewal
    interval: 1h
    rules:
      - alert: SSLCertificateExpiringSoon
        expr: ssl_certificate_expiry_days < 14
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "SSL certificate expires in less than 14 days"
          
      - alert: SSLRenewalFailed
        expr: ssl_last_renewal_success == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SSL renewal failed - manual intervention required"
          
      - alert: SSLRenewalHighDowntime
        expr: ssl_last_downtime_seconds > 60
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SSL renewal downtime exceeded 60 seconds"
```

### Telegram Notifications

Сервис автоматически отправляет уведомления:
- ✅ **Success:** Домен, срок действия, downtime
- ❌ **Failure:** Домен, ошибка, необходимость ручного вмешательства
- ⚠️ **Rollback:** Домен, использованный backup

---

## Troubleshooting

### Проверка статуса сервиса

```bash
# Статус контейнера
docker service ps lgdx_ssl-renewal-service

# Логи
docker service logs lgdx_ssl-renewal-service --tail 100 --follow

# Метрики
curl http://localhost:3000/metrics

# JSON status
curl http://localhost:3000/status | jq
```

### Nginx не поднимается после обновления сертификата

После `docker service scale lgdx_nginx=0` в Swarm число реплик остаётся 0; команда `docker service update --force` не возвращает реплики. Сервис теперь сначала выполняет `docker service scale lgdx_nginx=1`, затем `docker service update --force`. Убедитесь, что **ssl-renewal-service** запущен на **manager** ноде (в compose задано `placement: node.role == manager`), иначе `docker service` может не выполняться. При ошибках смотрите в логах `stdout`/`stderr` от docker.

### Ручной запуск обновления

```bash
# Trigger renewal
curl -X POST http://localhost:3000/trigger-renewal

# Проверить логи
docker service logs lgdx_ssl-renewal-service --follow
```

### Проверка сертификата

```bash
# Проверить срок действия
certbot certificates

# Проверить активный сертификат на сервере
echo | openssl s_client -servername lgdeal.com -connect lgdeal.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Проверить доступность
curl -I https://lgdeal.com
```

### Восстановление из backup

```bash
# Найти последний backup
ls -lt /opt/lgdx/ssl-backups/ | head

# Восстановить сертификаты
cp /opt/lgdx/ssl-backups/YYYY-MM-DD_HHMMSS/* /etc/letsencrypt/live/lgdeal.com/

# Перезапустить Nginx
docker service update --force lgdx_nginx
```

### Типичные проблемы

#### Проблема 1: Port 80 занят
```bash
# Проверить, что на 80 порту
netstat -tuln | grep :80

# Остановить процесс
docker service scale lgdx_nginx=0
```

#### Проблема 2: Certbot не может обновить
```bash
# Проверить домен доступен
curl -I http://lgdeal.com

# Проверить DNS
dig lgdeal.com

# Попробовать ручное обновление
certbot renew --force-renewal --dry-run
```

#### Проблема 3: Nginx не запускается после обновления
```bash
# Проверить конфигурацию
docker service logs lgdx_nginx --tail 50

# Проверить сертификаты
ls -la /etc/letsencrypt/live/lgdeal.com/

# Rollback
docker service update --rollback lgdx_nginx
```

---

## Обработка ошибок

### Автоматический rollback

Сервис автоматически выполняет rollback при ошибках на этапах:
1. Валидация нового сертификата
2. Запуск Nginx
3. Health checks

Процедура rollback:
1. Восстановление сертификата из последнего backup
2. Перезапуск Nginx
3. Отправка уведомления в Telegram

---

## Преимущества решения

1. ✅ **Полная автоматизация** - не требует ручного вмешательства
2. ✅ **Минимальный downtime** - ~20-30 секунд раз в 90 дней
3. ✅ **Безопасность** - backup и rollback при ошибках
4. ✅ **Мониторинг** - Telegram уведомления + Prometheus
5. ✅ **Простота** - использует существующую инфраструктуру
6. ✅ **Надежность** - проверки на каждом этапе
7. ✅ **Расписание без конфликтов** - изолировано от других задач

---

## Будущие оптимизации

### Zero-downtime renewal (webroot challenge)

Для устранения downtime можно настроить Nginx для работы с webroot challenge:

```nginx
# В nginx.production.final.conf добавить:
location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    allow all;
}
```

Это позволит обновлять сертификат **БЕЗ остановки Nginx!** ✅

---

## Ссылки

- [05_Nginx_Configuration.md](05_Nginx_Configuration.md) - Конфигурация Nginx
- [18_Monitoring.md](18_Monitoring.md) - Мониторинг системы
- [07_Troubleshooting.md](07_Troubleshooting.md) - Решение проблем
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://eff-certbot.readthedocs.io/)

---

**Версия:** 1.1.0  
**Статус:** ✅ Production Ready  
**Maintenance:** Автоматическое

