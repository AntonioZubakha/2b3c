# SSL Certificate Auto-Renewal Service

Автоматический сервис для обновления SSL сертификатов Let's Encrypt для канонического домена **`lgdeal.com`** (apex и `www` через `CERTBOT_DOMAINS`).

## Описание

Сервис автоматически проверяет срок действия SSL сертификата и обновляет его за 30 дней до истечения. Процесс включает:

- Проверку необходимости обновления
- Создание backup текущего сертификата
- Обновление через **Certbot webroot** (Nginx **не останавливается**; на `:80` отдаётся `/.well-known/acme-challenge/`)
- Валидацию нового сертификата
- Принудительный rolling update Nginx, чтобы подтянуть файлы с хоста
- Проверку работоспособности
- Уведомления в Telegram

## Требования

- Docker Swarm mode
- Certbot установлен на хосте
- Доступ к `/etc/letsencrypt`
- Доступ к Docker socket
- Telegram bot token и chat ID для уведомлений

## Конфигурация

Сервис настраивается через переменные окружения:

- `DOMAIN` - домен для обновления (по умолчанию: `lgdeal.com`)
- `CERT_NAME` - имя lineage в `/etc/letsencrypt` (по умолчанию: как `DOMAIN`)
- `ACME_WEBROOT` - каталог webroot для HTTP-01 (по умолчанию: `/var/www/certbot`; **тот же volume должен быть смонтирован в Nginx**)
- `CERTBOT_DOMAINS` - список SAN через запятую (по умолчанию: `DOMAIN` и `www.DOMAIN`)
- `STACK_NAME` - имя Docker Swarm stack (по умолчанию: `lgdx`)
- `NGINX_SERVICE_NAME` - имя Nginx сервиса (по умолчанию: `lgdx_nginx`)
- `CERT_PATH` - путь к сертификатам (по умолчанию: `/etc/letsencrypt/live/lgdeal.com`)
- `BACKUP_DIR` - директория для backup'ов (по умолчанию: `/app/ssl-backups`)
- `RENEWAL_SCHEDULE` - расписание проверки в формате cron (по умолчанию: `30 1 * * 1` - каждый понедельник в 01:30 UTC, до других задач)
- `LOG_LEVEL` - уровень логирования (по умолчанию: `info`)

## Использование

### Сборка образа

```bash
docker build -t lgdx-ssl-renewal-service:latest ./ssl-renewal-service
```

### Запуск через Docker Swarm

Сервис автоматически запускается при деплое stack:

```bash
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx
```

### Ручной запуск обновления

Для ручного запуска обновления используйте API endpoint:

```bash
# Через Docker network
docker exec $(docker ps -q -f name=ssl-renewal-service) curl -X POST http://localhost:3000/trigger-renewal

# Или с хоста (если порт открыт)
curl -X POST http://localhost:3000/trigger-renewal
```

## Мониторинг

Сервис предоставляет несколько HTTP endpoints на порту 3000:

### Health Check
```bash
curl http://localhost:3000/health
```

### Prometheus Metrics
```bash
curl http://localhost:3000/metrics
```

Доступные метрики:
- `ssl_certificate_expiry_days` - дней до истечения сертификата
- `ssl_last_renewal_timestamp_seconds` - время последнего обновления
- `ssl_last_renewal_duration_seconds` - длительность обновления
- `ssl_last_downtime_seconds` - длительность rolling-рестарта Nginx при последнем обновлении (не полный простой сайта при webroot)
- `ssl_last_renewal_success` - статус последнего обновления (1=успех, 0=ошибка)
- `ssl_total_renewals_total` - всего успешных обновлений
- `ssl_failed_renewals_total` - всего неудачных обновлений

### Status (JSON)
```bash
curl http://localhost:3000/status
```

### Manual Trigger
```bash
curl -X POST http://localhost:3000/trigger-renewal
```

Запускает процесс обновления вручную (возвращает 202 Accepted сразу).

Логи доступны в:
- `/app/logs/ssl-renewal.log` - общие логи
- `/app/logs/ssl-renewal-error.log` - только ошибки

## Безопасность

- Сервис работает с правами root для доступа к Certbot и Docker
- Все операции логируются
- Backup'ы сохраняются перед обновлением
- Автоматический rollback при ошибках
- Уведомления в Telegram при успехе/неудаче

## Время простоя

Минимальное время простоя: ~20-30 секунд во время обновления сертификата.

## Troubleshooting

### Сервис не запускается

Проверьте:
1. Доступ к Docker socket
2. Доступ к `/etc/letsencrypt`
3. Установлен ли Certbot на хосте
4. Правильность Telegram secrets

### Обновление не происходит

Проверьте логи:
```bash
docker service logs lgdx_ssl-renewal-service
```

### Nginx не перезапускается

Сервис после остановки Nginx (`scale=0`) сначала выполняет `docker service scale lgdx_nginx=1`, затем `docker service update --force`, так как в Swarm один только `update --force` не возвращает число реплик с 0.

Проверьте:
1. Что ssl-renewal-service запущен на **manager** ноде (placement: `node.role == manager`), иначе команды `docker service` могут не выполняться.
2. Статус сервиса:
```bash
docker service ls | grep nginx
docker service ps lgdx_nginx
```

## Лицензия

ISC

