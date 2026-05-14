# 🚀 Быстрый старт LGDX (актуально по compose файлам)

## ⚡ Запуск

### Development (Docker Compose)

```bash
# Убедитесь, что Docker Desktop запущен
docker-compose -f docker-compose.dev.yml up -d
```

### Production Local (Docker Swarm, локальный prod-like стенд)

```bash
docker stack deploy -c docker-compose.prod.local.yml lgdx
```

### Production Secure (Docker Swarm, боевой стенд)

```bash
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx
```

---

## 🌐 Доступ к сервисам

### Development

Значения ниже отражают `docker-compose.dev.yml` (внутренние порты сервисов отличаются от опубликованных).

| Сервис | URL | Примечание |
|--------|-----|-----------|
| **Frontend (React)** | `http://localhost:${CLIENT_PORT:-3080}` | порт на хосте маппится в контейнерный `3000` |
| **API (Express)** | `http://localhost:5001` | порт на хосте маппится в контейнерный `5000` |
| **Analytics Service** | `http://localhost:9201` | порт на хосте маппится в контейнерный `9200` |
| **RabbitMQ UI** | `http://localhost:15673` | AMQP порт на хосте: `5673` |
| **MongoDB** | `mongodb://localhost:27019` | порт на хосте маппится в контейнерный `27017` |
| **Redis** | `redis://localhost:6380` | пароль обязателен (см. `.env`) |

### Production (Secure)

⚠️ В `docker-compose.prod.secure.final.yml` большинство сервисов **не публикуют порты** наружу. Браузерный трафик идёт через Nginx на `https://lgdeal.com`.

| Сервис | URL | Примечание |
|--------|-----|-----------|
| **Приложение** | `https://lgdeal.com` | через Nginx + SSL |
| **API** | `https://lgdeal.com/api` | через Nginx |
| **Grafana** | `https://lgdeal.com/grafana/` и/или `https://lgdeal.com:3000` | зависит от текущего Nginx конфигура |
| **FTP** | `49.13.160.126:21` | для поставщиков |

---

## 🛠️ Основные команды

### Development (Docker Compose)
```bash
# Запуск
docker-compose -f docker-compose.dev.yml up -d

# Просмотр логов
docker-compose -f docker-compose.dev.yml logs -f

# Остановка
docker-compose -f docker-compose.dev.yml down

# Пересборка
docker-compose -f docker-compose.dev.yml build --no-cache
```

### Production Local (Docker Swarm)
```bash
# Запуск production локально
docker stack deploy -c docker-compose.prod.local.yml lgdx

# Проверка статуса
docker service ls

# Логи
docker service logs lgdx_lgdx-server -f
docker service logs lgdx_api-sync-service -f
docker service logs lgdx_file-import-service -f
docker service logs lgdx_ftp-service -f
```

### Production Secure (Docker Swarm)

```bash
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx

docker service ls

# Health (внутри хоста; в secure compose порт `lgdx-server` наружу не публикуется)
curl http://localhost:5000/health
```

---

## 🔧 Отладка

### Быстрые команды
```bash
# Production
docker service ls
docker service logs -f lgdx_lgdx-server
docker service logs -f lgdx_api-sync-service
docker service logs -f lgdx_file-import-service
docker service logs -f lgdx_ftp-service
```

### Типичные проблемы
| Проблема | Решение |
|----------|---------|
| Docker не запущен | Запустите Docker Desktop |
| Порт занят | Остановите приложение на порту |
| Ошибка сборки | `docker system prune -a` |
| Swarm не инициализирован | `docker swarm init` |

> **📖 Подробное руководство**: [07_Troubleshooting.md](07_Troubleshooting.md)

---

## 📚 Дальнейшие шаги

- **Архитектура**: [02_Architecture.md](02_Architecture.md)
- **Production & Deployment**: [03_Production_Deployment.md](03_Production_Deployment.md)
- **Мониторинг**: [19_Monitoring_Quick_Start.md](19_Monitoring_Quick_Start.md)
- **SSL Управление**: [06_SSL_Certificate_Management.md](06_SSL_Certificate_Management.md)
- **FTP Service**: [23_FTP_Product_Sync_Service.md](23_FTP_Product_Sync_Service.md)
- **Troubleshooting**: [07_Troubleshooting.md](07_Troubleshooting.md)