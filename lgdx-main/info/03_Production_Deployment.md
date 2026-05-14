# 🚀 03. Production Deployment - Развертывание LGDX

**Обновлено:** 27 ноября 2025  
**Версия документа:** 2.1.0  
**Архитектура:** Docker Swarm  
**Сервисы:** см. `docker-compose.prod.secure.final.yml` (source of truth)

---

## ✅ Статус и критерии готовности

Этот документ описывает **процедуры** и **команды** для production (Docker Swarm).\
Текущий “статус готовности” определяйте проверяемыми критериями ниже (а не декларациями):

- **Сервисы**: `docker service ls` (ожидаемые реплики подняты)
- **Nginx health**: `curl http://localhost/health` (на хосте) → `healthy`
- **API health**: `curl https://lgdeal.com/health` → 200
- **Grafana**: доступна `https://lgdeal.com:3000` и/или `https://lgdeal.com/grafana/` (если включён subpath proxy)
- **Prometheus targets**: `http://<host>:9090/targets` (ожидаемые таргеты UP)

---

## 🚀 Быстрый деплой

### Production Secure (боевой сервер):
```bash
# 1. SSH на сервер
ssh root@49.13.160.126

# 2. Перейти в директорию проекта
cd /opt/lgdx

# 3. Обновить код
git pull origin main

# 4. Пересобрать образы (если нужно)
docker build -t lgdx-lgdx-server:latest ./server
docker build -t lgdx-ftp-sync-service:latest ./ftp-product-sync-service

# 5. Развернуть/обновить stack
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# 6. Проверить статус
docker service ls
```

### Быстрое обновление сервиса:
```bash
# Пересобрать и обновить один сервис
docker build -t lgdx-lgdx-server:latest ./server
docker service scale lgdx_lgdx-server=0
docker service scale lgdx_lgdx-server=1

# Или force update (без пересборки)
docker service update --force lgdx_lgdx-server
```

---

## 📊 Список сервисов (high-level)

### **Core Services (4):**
1. **lgdx-server** - Основной API сервер
2. **lgdx-client** - React фронтенд (Nginx)
3. **nginx** - Reverse proxy + SSL termination
4. **ssl-renewal-service** - Автообновление SSL (понедельник 01:30 UTC)

### **Worker Services (6):**
5. **api-sync-service** - Синхронизация с API поставщиков (02:00 UTC)
6. **file-import-service** - Обработка файлов (on-demand)
7. **ftp-service** - FTP сервер + file watcher (rate limiting: 1/12h)
8. **analytics-service** - Генерация аналитики (03:45 UTC)
9. **market-price-calculator** - Расчет цен (каждые 3 часа)
10. **backup-service** - Резервное копирование (03:00 UTC)
11. **legacy-ftp-poller** - Legacy FTP polling (каждые 12 часов)

### **Infrastructure (3):**
- **mongodb** - База данных
- **redis** - Кэш + rate limiting
- **rabbitmq** - Очередь сообщений

### **Monitoring (7):**
- **prometheus** - Метрики
- **grafana** - Визуализация (см. “Мониторинг Production”)
- **loki** - Хранилище логов
- **promtail** - Сбор логов
- **alertmanager** - Telegram алерты
- **cadvisor** - Мониторинг контейнеров
- **node-exporter** - Мониторинг хоста

---

## 🔐 Управление секретами

### Обязательные секреты (проверить):
```bash
# Проверить наличие всех секретов
docker secret ls

# Должны быть:
jwt_secret
admin_secret_key
mongodb_password
mongodb_uri
redis_password
redis_url
rabbitmq_password
rabbitmq_url
telegram_bot_token
stock_telegram_bot_token
system_monitoring_bot_token
smtp_pass
twilio_account_sid
twilio_auth_token
# ... и другие
```

### Создание нового секрета:
```bash
# Из строки
echo "your-secret-value" | docker secret create secret_name -

# Из файла
docker secret create secret_name /path/to/file

# Из переменной
echo $SECRET_VALUE | docker secret create secret_name -
```

### Обновление секрета:
```bash
# Секреты immutable - нужно удалить и пересоздать
docker secret rm old_secret
echo "new-value" | docker secret create new_secret -

# Обновить сервис для использования нового секрета
docker service update --secret-rm old_secret --secret-add new_secret lgdx_lgdx-server
```

---

## 🔄 Процедуры обновления

### Rolling Update (без простоя):
```bash
# 1. Обновить код
cd /opt/lgdx
git pull origin main

# 2. Пересобрать образ
docker build -t lgdx-lgdx-server:latest ./server

# 3. Применить через stack deploy
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# Docker Swarm автоматически:
# - Создаст новые контейнеры
# - Проверит health checks
# - Удалит старые контейнеры
```

### Manual Scale Update (полный контроль):
```bash
# 1. Scale down (освобождает ресурсы)
docker service scale lgdx_lgdx-server=0

# 2. Scale up с новым образом
docker service scale lgdx_lgdx-server=1

# 3. Проверить логи
docker logs $(docker ps -q -f name=lgdx-server) --tail 50
```

### Обновление всего stack:
```bash
# 1. Полный rebuild
docker stack rm lgdx
docker system prune -a -f

# 2. Пересобрать все образы
cd /opt/lgdx
docker build -t lgdx-lgdx-server:latest ./server
docker build -t lgdx-lgdx-client:latest ./client
docker build -t lgdx-analytics-service:latest ./analytics-service
docker build -t lgdx-api-sync-service:latest ./api-product-sync-service
docker build -t lgdx-file-import-service:latest ./file-product-import-service
docker build -t lgdx-ftp-sync-service:latest ./ftp-product-sync-service
docker build -t lgdx-market-price-calculator:latest ./market-price-calculator-service
docker build -t lgdx-backup-service:latest ./backup-service
docker build -t lgdx-ssl-renewal-service:latest ./ssl-renewal-service

# 3. Развернуть stack
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# 4. Проверить статус
docker service ls
```

---

## 🔍 Health Checks

### Service Health (Docker Swarm):
```bash
# Статус всех сервисов
docker service ls

# Детали конкретного сервиса
docker service ps lgdx_lgdx-server

# Inspect health
docker inspect --format='{{.State.Health.Status}}' $(docker ps -q -f name=lgdx-server)
```

### Application Health:
```bash
# Main server
# В production secure порт `lgdx-server` наружу не публикуется — внешняя проверка через Nginx:
# curl https://lgdeal.com/health
# Внутренняя проверка (из контейнера `lgdx-server`):
docker exec $(docker ps -q -f name=lgdx-server) curl -f http://localhost:5000/health

# Database
curl http://localhost:5000/health/db

# RabbitMQ
curl http://localhost:5000/health/queue

# Redis
curl http://localhost:5000/health/redis

Примечание:
- агрегирующего endpoint вида `/health/all` в текущем коде нет;
- endpoint `/health/cache` тоже отсутствует (актуальный — `/health/redis`).
```

### Microservices Health:
```bash
# Analytics Service
curl http://localhost:9200/health

# File Import Service
curl http://localhost:9101/health

# FTP Service
curl http://localhost:3000/health

# Market Price Calculator
curl http://localhost:9100/health

# SSL Renewal Service
curl http://localhost:8080/health
curl http://localhost:8080/status  # Detailed status
```

---

## ✅ Post-deploy checklist (prod secure)
```bash
# Сервисы в статусе 1/1
docker service ls

# API health через Nginx
curl https://lgdeal.com/health

# SSL renewal статус
curl http://49.13.160.126:8080/status

# Prometheus таргеты
curl http://49.13.160.126:9090/targets
# или откройте в браузере: http://49.13.160.126:9090/targets
```

Основные логи для проверки:
```bash
docker service logs lgdx_lgdx-server --tail 50
docker service logs lgdx_nginx --tail 50
docker service logs lgdx_api-sync-service --tail 50
docker service logs lgdx_file-import-service --tail 50
docker service logs lgdx_ftp-service --tail 50
docker service logs lgdx_market-price-calculator --tail 50
docker service logs lgdx_analytics-service --tail 50
docker service logs lgdx_ssl-renewal-service --tail 50
```

## 🚨 Rollback Procedures

### Emergency Rollback (< 5 минут):
```bash
# 1. Остановить текущий stack
docker stack rm lgdx

# 2. Откатить Git
cd /opt/lgdx
git log --oneline -n 10  # Найти предыдущий коммит
git reset --hard <previous-commit-hash>

# 3. Очистить Docker
docker system prune -f

# 4. Развернуть предыдущую версию
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# 5. Проверить статус
docker service ls
watch -n 2 'docker service ls'
```

### Graceful Rollback (постепенный):
```bash
# 1. Scale down проблемного сервиса
docker service scale lgdx_lgdx-server=0

# 2. Откатить код
git checkout <previous-commit>

# 3. Пересобрать
docker build -t lgdx-lgdx-server:latest ./server

# 4. Scale up
docker service scale lgdx_lgdx-server=1

# 5. Мониторинг
docker service logs lgdx_lgdx-server -f
```

---

## 🐛 Troubleshooting

### Типичные проблемы:

#### 1. Сервис не запускается:
```bash
# Проверить статус
docker service ps lgdx_lgdx-server --no-trunc

# Проверить логи
docker service logs lgdx_lgdx-server --tail 100

# Проверить ресурсы
docker stats --no-stream

# Проверить секреты
docker secret ls
```

#### 2. Health check fails:
```bash
# Проверить endpoint
docker exec $(docker ps -q -f name=lgdx-server) curl -f http://localhost:5000/health

# Проверить зависимости
curl http://localhost:5000/health/db
curl http://localhost:5000/health/queue
curl http://localhost:5000/health/redis

# Логи
docker logs $(docker ps -q -f name=lgdx-server) --tail 50
```

#### 3. Нехватка ресурсов:
```bash
# Проверить использование
docker stats --no-stream

# Освободить память
docker system prune -a -f

# Scale down non-critical services
docker service scale lgdx_cadvisor=0
docker service scale lgdx_node-exporter=0
```

#### 4. RabbitMQ очередь переполнена:
```bash
# Проверить очередь
docker exec $(docker ps -q -f name=rabbitmq) rabbitmqctl list_queues

# Очистить застрявшие сообщения
docker exec $(docker ps -q -f name=rabbitmq) rabbitmqctl purge_queue file_upload_tasks

# Проверить consumers
docker exec $(docker ps -q -f name=rabbitmq) rabbitmqctl list_consumers
```

#### 5. Rate Limiting issues:
```bash
# Проверить счетчики
docker exec $(docker ps -q -f name=redis) redis-cli KEYS "ftp:rate_limit:*"

# Проверить TTL
docker exec $(docker ps -q -f name=redis) redis-cli TTL ftp:rate_limit:COMPANY_ID

# Сбросить лимиты (после изменения конфигурации)
cat /opt/lgdx/ftp-product-sync-service/clear-rate-limits.js | \
  docker exec -i $(docker ps -q -f name=ftp-service) sh -c 'cd /node-app && node'
```

---

## 📈 Мониторинг Production

### Grafana Dashboards:
```
URL: https://lgdeal.com:3000 (порт опубликован) и/или https://lgdeal.com/grafana/ (проксирование через Nginx в prod-конфиге)
Login: admin
Password: (from GRAFANA_ADMIN_PASSWORD)

Основные дашборды:
- System Overview
- Service Health
- RabbitMQ Queues
- MongoDB Performance
- SSL Certificate Status
```

### Prometheus Metrics:
```
URL: http://49.13.160.126:9090 (порт опубликован на хосте)

Ключевые метрики:
- ssl_certificate_expiry_days
- ftp_uploads_total
- rabbitmq_queue_messages
- mongodb_connections
- http_request_duration_seconds
```

### Loki (логи):
```
URL: http://49.13.160.126:3100 (порт опубликован на хосте)
Примечание: обычно Loki используют через Grafana datasource, напрямую в браузере обращаться не обязательно.
```

### Telegram Alerts:
```
Автоматические уведомления:
✅ Sync started/completed
✅ SSL renewal status
⚠️ FTP rate limit exceeded
⚠️ Service health issues
❌ Критические ошибки
```

---

## 🔧 Maintenance Tasks

### Ежедневно (автоматически):
- 03:00 UTC - MongoDB backup
- 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 - Market price calculation
- 02:00 UTC - API sync (все активные поставщики)

### Еженедельно (автоматически):
- Понедельник 01:30 UTC - SSL certificate check & renewal

### Ежемесячно (вручную):
```bash
# 1. Очистка Docker (последняя: 27 ноября 2025)
docker system df  # Проверить использование
docker system prune -a -f  # Удалить неиспользуемое

# 2. Проверка SSL сертификата
curl http://localhost:8080/status  # ssl-renewal-service

# 3. Audit логов
docker service logs lgdx_lgdx-server --since 30d > /tmp/server-logs.txt

# 4. Проверка метрик безопасности
# См. Grafana Security Dashboard
```

### При необходимости:
```bash
# Обновление зависимостей
npm audit fix --force

# Обновление Docker images
docker-compose pull

# Миграция базы данных
docker exec $(docker ps -q -f name=mongodb) mongosh ...
```

---

## 🚨 Критические процедуры

### Emergency: Сервис упал
```bash
# 1. Быстрая диагностика
docker service ps lgdx_lgdx-server --no-trunc
docker logs $(docker ps -q -f name=lgdx-server) --tail 100

# 2. Restart
docker service update --force lgdx_lgdx-server

# 3. Если не помогло - scale
docker service scale lgdx_lgdx-server=0
docker service scale lgdx_lgdx-server=1
```

### Emergency: База данных недоступна
```bash
# 1. Проверить статус MongoDB
docker service ps lgdx_mongodb
docker logs $(docker ps -q -f name=mongodb) --tail 50

# 2. Restart MongoDB
docker service update --force lgdx_mongodb

# 3. Проверить health
docker exec $(docker ps -q -f name=mongodb) mongosh --eval "db.adminCommand('ping')"

# 4. Если не помогло - восстановить из бэкапа
# См. backup-service/README.md
```

### Emergency: Очередь RabbitMQ переполнена
```bash
# 1. Проверить очередь
docker exec $(docker ps -q -f name=rabbitmq) rabbitmqctl list_queues

# 2. Увеличить workers
docker service scale lgdx_file-import-service=2
docker service scale lgdx_api-sync-service=2

# 3. Если критично - очистить очередь
docker exec $(docker ps -q -f name=rabbitmq) rabbitmqctl purge_queue file_upload_tasks

# 4. Восстановить replicas после обработки
docker service scale lgdx_file-import-service=1
docker service scale lgdx_api-sync-service=1
```

### Emergency: Нехватка памяти
```bash
# 1. Проверить использование
docker stats --no-stream

# 2. Очистить Docker
docker system prune -a -f

# 3. Scale down некритичные сервисы
docker service scale lgdx_cadvisor=0
docker service scale lgdx_promtail=0

# 4. Restart Redis (flush cache)
docker service update --force lgdx_redis
```

---

## 📋 Deployment Checklist

### Pre-Deployment:
- [ ] Все тесты прошли локально
- [ ] Security audit выполнен
- [ ] Docker Secrets проверены (`docker secret ls`)
- [ ] SSL сертификат валиден (проверить: `curl http://localhost:8080/status`)
- [ ] Backup выполнен за последние 24 часа
- [ ] Мониторинг работает (Grafana доступен)
- [ ] Git tag создан для версии

### Deployment Steps:
- [ ] Git pull на сервере
- [ ] Пересборка измененных образов
- [ ] Stack deploy с новой конфигурацией
- [ ] Проверка `docker service ls` (ожидаемые сервисы в нужных репликах)

### Post-Deployment:
- [ ] Все сервисы running (`docker service ls`)
- [ ] Health checks passing (проверены ключевые `/health`: Nginx, API, микросервисы)
- [ ] SSL cert valid (`curl https://lgdeal.com`)
- [ ] RabbitMQ queues processing (`rabbitmqctl list_queues`)
- [ ] Логи без errors (`docker service logs` для каждого сервиса)
- [ ] Prometheus metrics coming (`http://49.13.160.126:9090`)
- [ ] Telegram alerts working (проверить тестовое сообщение)

---

## 🎯 Performance / Capacity

Числа (uptime/RPS/latency/объёмы) зависят от окружения и меняются.\
Для актуальных значений используйте:
- Grafana dashboards (ресурсы/latency/ошибки)
- Prometheus targets и метрики (`http://<host>:9090`)
- Loki (поиск по логам через Grafana)

---

## 🔐 Security Checklist

### Infrastructure Security:
- [x] Docker Swarm secrets используются
- [x] Все пароли > 12 символов
- [x] SSL сертификаты автообновляются
- [x] Nginx reverse proxy настроен
- [x] Firewall rules применены
- [x] SSH key-based auth only

### Application Security:
- [x] JWT authentication
- [x] Rate limiting (FTP: 1 upload/12h)
- [x] File upload validation
- [x] CSP headers enabled
- [x] CORS properly configured
- [x] SQL injection protection (NoSQL)
- [x] XSS protection

### Monitoring Security:
- [x] Failed login attempts tracked
- [x] Suspicious activity alerts
- [x] Resource usage monitoring
- [x] Error rate monitoring

---

## 📞 Support Levels

### Level 1: Self-Service (DevOps)
```bash
# Проверить статус
docker service ls

# Просмотреть логи
docker service logs lgdx_lgdx-server -f

# Restart сервиса
docker service update --force lgdx_lgdx-server

# Проверить health
# Внешняя проверка (через Nginx)
curl https://lgdeal.com/health

# Внутренняя проверка (из контейнера `lgdx-server`)
docker exec $(docker ps -q -f name=lgdx-server) curl -f http://localhost:5000/health
```

### Level 2: Operations Team
- Monitor Grafana dashboards
- Investigate Prometheus alerts
- Check Docker Swarm node health
- Review application logs
- Execute scaling operations
- Clear RabbitMQ queues if needed

### Level 3: Development Team
- Debug application issues
- Deploy hotfixes
- Database maintenance
- Code rollbacks
- Architecture changes
- Performance optimization

---

## 📚 Связанная документация

### Deployment & Operations:
- [01_Quick_Start.md](./01_Quick_Start.md) - Быстрый старт
- [02_Architecture.md](./02_Architecture.md) - Архитектура
- [06_SSL_Certificate_Management.md](./06_SSL_Certificate_Management.md) - SSL
- [19_Monitoring_Quick_Start.md](./19_Monitoring_Quick_Start.md) - Мониторинг
- [24_FTP_Rate_Limiting.md](./24_FTP_Rate_Limiting.md) - FTP Rate Limiting

### Microservices:
- [23_FTP_Product_Sync_Service.md](./23_FTP_Product_Sync_Service.md) - FTP Service
- [25_Market_Price_Calculator_Service.md](./25_Market_Price_Calculator_Service.md) - Market Prices
- [21_Analytics_Service.md](./21_Analytics_Service.md) - Analytics

### Infrastructure:
- [13_Database_Schema.md](./13_Database_Schema.md) - Database
- [05_Nginx_Configuration.md](./05_Nginx_Configuration.md) - Nginx

---

## ✅ GO/NO-GO Decision

### ✅ GO (Развертывать):
- Все критические проверки пройдены
- Docker Swarm функционирует корректно
- Health checks passing
- Docker Secrets настроены
- Backup система работает
- Мониторинг активен

### ❌ NO-GO (Отложить):
- Критические security issues
- Нестабильная работа в staging
- Health checks failing
- Docker Secrets отсутствуют
- Нет backup за последние 24ч

---

**📊 Статус документа:** актуализирован под текущие `docker-compose.prod.secure.final.yml` и `nginx/nginx.production.final.conf`  
**🚀 Архитектура:** Docker Swarm  
**🔐 Безопасность (infra):** Docker Secrets + SSL auto-renewal  
**📈 Мониторинг:** Prometheus + Grafana + Loki  
**⏱️ Последнее обновление:** 27 ноября 2025

