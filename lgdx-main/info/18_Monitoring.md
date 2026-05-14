# 📊 Мониторинг LGDX

## 🎯 Мониторинг стек

### Потоки данных
```text
   node-exporter ┐
   cadvisor      ├────►  Prometheus  ───► Alertmanager ──► Telegram
   приложения    ┘

   контейнерные логи ─► Promtail ─► Loki ─► Grafana (Explore)

   метрики Prometheus ─► Grafana дашборды
   логи Loki ─► Grafana Explore (LogQL запросы)
```

---

### Prometheus
- **Роль**: агрегатор метрик всех микросервисов и инфраструктуры
- **URL**: http://49.13.160.126:9090 (prod, published порт) / http://localhost:9090 (local)
- **Сервис (compose)**: `prometheus` (сети: `lgdx-network`, `monitoring-network`)
- **Конфигурация**: `monitoring/prometheus.yml`
- **Правила**: `monitoring/rules/alerts.yml` (монтируется в `/etc/prometheus/rules`)
- **Таргеты**: `lgdx-*` сервисы, `node-exporter`, `cadvisor`, сам Prometheus
- **Retention**: 30 дней
- **Оптимизация**: 384M/0.4 CPU

### Grafana
- **Роль**: визуализация метрик и логов, оповещение через dashboards
- **URL**: https://lgdeal.com/grafana/ (если проксируется Nginx) **и/или** https://lgdeal.com:3000 (порт опубликован). Локально: http://localhost:3000
- **Сервис**: `lgdx_grafana` (сеть: `monitoring-network`)
- **Учётные данные**: `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (по умолчанию `admin/admin`)
- **Источники данных**: Prometheus (метрики) + Loki (логи)
- **Оптимизация**: 384M/0.4 CPU, SQLite для хранения конфигурации
- **📖 Быстрый старт**: См. [19_Monitoring_Quick_Start.md](19_Monitoring_Quick_Start.md) - пошаговая инструкция для начинающих

### Alertmanager
- **Роль**: маршрутизация и эскалация алертов
- **URL**: http://localhost:9093 (порт опубликован)
- **Сервис**: `lgdx_alertmanager` (сеть: `monitoring-network`)
- **Уведомления**: Telegram (использует `system_monitoring_bot_token` и `system_monitoring_chat_id`)

### Loki
- **Роль**: хранилище логов (легковесная альтернатива Elasticsearch)
- **URL**: http://localhost:3100 (порт опубликован)
- **Сервис (compose)**: `loki` (сеть: `monitoring-network`)
- **Конфигурация**: `monitoring/loki/loki.yml`
- **Retention**: 30 дней (автоматическая очистка)
- **Оптимизация**: 512M/0.5 CPU (экономия ~3.5GB по сравнению с ELK Stack)

### Promtail
- **Роль**: сбор stdout/stderr логов контейнеров и отправка в Loki
- **Сервис**: `lgdx_promtail` (global, сеть: `monitoring-network`)
- **Режим**: `deploy.mode=global` (по одному агенту на ноду)
- **Конфигурация**: `monitoring/promtail/promtail.yml`
- **Автообнаружение**: автоматически обнаруживает контейнеры через Docker API
- **Оптимизация**: 128M/0.2 CPU (64M/0.1 reservations)

### Node Exporter / cAdvisor
- **Роль**: системные и контейнерные метрики Swarm-нод
- **Таргеты**: `tasks.node-exporter:9100`, `tasks.cadvisor:8080`

---

## 📈 Метрики

### Swarm Monitoring
- [x] Service replicas count (`up` + Swarm CLI)
- [x] Service health status (`/health` endpoints + Grafana panels)
- [x] Node availability (node-exporter)
- [x] Resource utilization (node-exporter + cAdvisor)
- [x] Network connectivity (overlay network metrics)

### Application Monitoring
- [x] API response times (`http_request_duration_seconds`)
- [x] Queue processing (RabbitMQ health + сервисные gauges)
- [x] Error rates (`http_request_duration_seconds_count{status_code="5.."}`)
- [x] Cache freshness (`market_price_snapshot_age_minutes`)
- [x] Backup latency (`backup_job_duration_seconds`)

### Business Monitoring
- [x] Active users / feature usage (analytics-service endpoints)
- [x] Transaction volumes
- [x] System availability (uptime dashboards)
- [x] Import/sync throughput (api-sync & file-import metrics)

---

## 🔍 Health Checks

### Service Health
```bash
# Проверить статус всех сервисов
docker service ls

# Проверить конкретный сервис
docker service ps lgdx_lgdx-server

# Проверить health check
docker inspect --format='{{.State.Health.Status}}' container_name
```

### Application Health
```bash
# API health check
curl http://localhost:5000/health

# Analytics Service health check
curl http://localhost:9200/health

# Database connectivity
curl http://localhost:5000/health/db

# Queue connectivity
curl http://localhost:5000/health/queue
```

---

## 📊 Дашборды

### System Overview
- Общий статус всех сервисов
- Использование ресурсов (CPU, Memory, Disk)
- Network traffic
- Error rates

### Application Metrics
- API response times
- Database performance
- Queue processing
- User activity

### Business Metrics
- Active users
- Transaction volume
- Feature usage
- Revenue metrics

---

## 🚨 Алерты

### Critical Alerts
- `ServiceDown` — `up{job=~"lgdx-.*"} == 0` более 2 минут
- `HighServerErrorRate` — доля 5xx > 5% за последние 5 минут
- Prometheus недоступен / Alertmanager не отвечает
- Loki недоступен (логи не собираются)

### Warning Alerts
- `MarketPriceSnapshotStale` — кэш не обновлялся > 4 часов
- `BackupOverdue` — не было успешного бэкапа > 36 часов
- `FTPErrorBurst` — >10 ошибок FTP за 5 минут
- Высокая загрузка CPU/Memory (дополнительные Grafana-алерты)

### Info Alerts
- Рестарт сервисов (логируется в Grafana)
- Завершение backup (статусы в Grafana + Telegram summary)
- Новые деплои (в логах docker service update)

---

## 📝 Логирование

### Centralized Logging
- **Loki**: Хранилище логов (легковесная альтернатива Elasticsearch)
- **Promtail**: Сбор логов с контейнеров через Docker API
- **Grafana Explore**: Визуализация и поиск логов через LogQL

### Настройка источников данных в Grafana

> **📖 Полная инструкция**: См. [19_Monitoring_Quick_Start.md](19_Monitoring_Quick_Start.md) - пошаговое руководство для начинающих

**Краткая инструкция:**

1. Откройте Grafana: `https://lgdeal.com/grafana/`
2. Войдите с учётными данными (по умолчанию `admin/admin`)
3. Перейдите в **Configuration → Data Sources**
4. Добавьте **Prometheus**: URL = `http://prometheus:9090`
5. Добавьте **Loki**: URL = `http://loki:3100`
6. Нажмите **Save & Test** для каждого

### Использование LogQL в Grafana Explore
- `{service="lgdx-server"}` — логи основного сервера
- `{service="lgdx-server"} |= "error"` — ошибки в логах сервера
- `{container="lgdx_lgdx-server.*"}` — логи по имени контейнера
- `{service=~"lgdx-.*"} | json | line_format "{{.message}}"` — структурированные логи

### Log Levels
- **ERROR**: Критические ошибки
- **WARN**: Предупреждения
- **INFO**: Информационные сообщения
- **DEBUG**: Отладочная информация

### Retention и очистка
- **Loki**: автоматически удаляет логи старше 30 дней (настроено в `monitoring/loki/loki.yml`)
- **Prometheus**: retention 30 дней
- Ручная очистка: `docker volume rm lgdx_loki_data` (имя volume в Swarm будет с префиксом стека; смотрите `docker volume ls`).

---

## 🔧 Настройка мониторинга

### Деплой / обновление
```bash
# Развёртывание локального production-стека (включает мониторинг)
docker stack deploy -c docker-compose.prod.local.yml lgdx

# Для защищённого окружения
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

# Проверить статус всех сервисов
docker service ls
```

### Проверка состояния
```bash
# Prometheus
docker service logs lgdx_prometheus --tail 20
Откройте в браузере: `http://localhost:9090/targets`

# Alertmanager
docker service logs lgdx_alertmanager --tail 20
Откройте в браузере: `http://localhost:9093/#/status`

# Grafana
Откройте в браузере: `http://localhost:3000` (по умолчанию `admin/admin`)

# Loki
curl http://localhost:3100/ready  # Должен вернуть "ready"
docker service logs lgdx_loki --tail 20

# Promtail
docker service logs lgdx_promtail --tail 20

# Node Exporter / cAdvisor
curl http://localhost:9100/metrics  # Node Exporter
curl http://localhost:8080/metrics  # cAdvisor
```

### Конфигурация
- **Prometheus**: `monitoring/prometheus.yml`, retention 30 дней
- **Alertmanager**: `monitoring/alertmanager.yml` (с секретами через Docker secrets)
- **Loki**: `monitoring/loki/loki.yml`, retention 30 дней, volume `loki_data`
- **Promtail**: `monitoring/promtail/promtail.yml`, автоматическое обнаружение контейнеров
- **Grafana**: Volume `grafana_data` сохраняет дашборды и конфигурацию

### Тонкости реализации
- **CR/LF в Swarm**: Windows CR (`\r`) в bash-скриптах ломает запуск. Используется `tr -d "\015"` и двойное экранирование (`$${var}`).
- **Alertmanager**: использует временную копию конфига для безопасной подстановки секретов.
- **Loki**: требует директорию `/loki/rules` для ruler (создаётся через entrypoint).
- **Promtail**: автоматически обнаруживает контейнеры через Docker API, не требует ручной настройки.
- **Оптимизация ресурсов**: Prometheus/Grafana уменьшены на ~25%, ELK заменён на Loki+Promtail (экономия ~3.5GB памяти).

---

## 📊 Метрики производительности

### Response Times
- **Target**: < 200ms для API endpoints
- **Warning**: > 500ms
- **Critical**: > 2s

### Error Rates
- **Target**: < 0.1%
- **Warning**: > 1%
- **Critical**: > 5%

### Uptime
- **Target**: 99.9%
- **Warning**: < 99.5%
- **Critical**: < 99%

---

## 🚨 Incident Response

### Level 1: Self-Service
```bash
# Проверка статуса
docker service ls

# Просмотр логов
docker service logs lgdx_lgdx-server -f
```

### Level 2: Operations Team
- Monitor Grafana dashboards
- Investigate Prometheus alerts  
- Check Docker Swarm node health
- Review application logs
- Execute scaling operations

### Level 3: Development Team
- Debug application issues
- Deploy hotfixes
- Database maintenance
- Code rollbacks
- Architecture changes

> **📖 Подробное руководство**: [07_Troubleshooting.md](07_Troubleshooting.md)

---

## 📋 Monitoring Checklist

### Setup
- [x] Prometheus configured (scrape targets + alert rules, retention 30 дней)
- [x] Grafana dashboards created (Prometheus + Loki data sources)
- [x] Alertmanager configured (Telegram via secrets)
- [x] Health checks implemented (`/health`, `/metrics`, Swarm)
- [x] Logging centralized (Promtail → Loki → Grafana Explore)
- [x] Loki datasource настроен в Grafana

### Maintenance
- [ ] Regular dashboard reviews
- [ ] Alert threshold tuning
- [ ] Log retention management
- [ ] Performance optimization
- [ ] Security monitoring

---

## 🎯 Best Practices

### Metrics Collection
- Collect only necessary metrics
- Use appropriate retention periods
- Implement data aggregation
- Monitor collection overhead

### Alerting
- Set meaningful thresholds
- Avoid alert fatigue
- Use escalation procedures
- Document alert meanings

### Visualization
- Create intuitive dashboards
- Use appropriate chart types
- Include context information
- Regular dashboard updates

---

**📊 Статус:** FULLY OPERATIONAL  
**🔍 Мониторинг:** Prometheus + Grafana + Loki + Promtail + exporters  
**🚨 Алерты:** Alertmanager → Telegram  
**🗂️ Логи:** Promtail → Loki → Grafana Explore (LogQL)  
**💾 Экономия ресурсов:** ~3.5GB памяти (ELK заменён на Loki+Promtail)