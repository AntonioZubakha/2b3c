# 🚨 Troubleshooting Guide

## 🎯 Обзор

Руководство по решению типичных проблем в LGDX.

## 🔧 Development Environment

### Docker не запускается
```bash
# Проверка статуса Docker
docker --version
docker compose version

# Перезапуск Docker Desktop
# Windows: Перезапустить Docker Desktop
# Linux: sudo systemctl restart docker
```

### Проблемы с портами
```bash
# Проверка занятых портов
# (dev) основной конфликт обычно на 3080 (frontend) и 5001 (API)
# Linux:
#   sudo ss -tulpn | grep -E ':3080|:5001'

# Остановка процессов на портах
# Windows
netstat -ano | findstr :3080
netstat -ano | findstr :5001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3080 | xargs kill -9
lsof -ti:5001 | xargs kill -9
```

### Ошибки сборки
```bash
# Очистка Docker
docker system prune -a

# Пересборка без кэша
docker-compose -f docker-compose.dev.yml build --no-cache

# Проверка логов
docker-compose -f docker-compose.dev.yml logs
```

## 🚀 Production Environment

### Сервисы не запускаются
```bash
# Проверка статуса Swarm
docker node ls

# Проверка сервисов
docker service ls

# Детали сервиса
docker service ps lgdx_lgdx-server  # API
docker service ps lgdx_nginx        # Proxy
docker service ps lgdx_mongodb
docker service ps lgdx_redis
docker service ps lgdx_rabbitmq

# Логи сервиса
docker service logs lgdx_lgdx-server --tail 50
```

### Проблемы с секретами
```bash
# Проверка секретов
docker secret ls

# Проверка использования секретов
docker service inspect lgdx_lgdx-server --format '{{.Spec.TaskTemplate.ContainerSpec.Secrets}}'
```

### Проблемы с сетью
```bash
# Проверка Docker сетей
docker network ls
docker network inspect lgdx_lgdx-network

# Проверка подключения между сервисами
# В Swarm выбирайте конкретный контейнер нужного сервиса:
# docker ps --filter name=lgdx-server
# docker exec -it <container_id> ping mongodb
#
# Или проверяйте доступность “по делу” (предпочтительно), например через health API внутри контейнера:
# docker exec -it $(docker ps -q -f name=lgdx-server) curl -f http://localhost:5000/health/db
```

## 🗄️ База данных

### MongoDB не подключается
```bash
# Проверка статуса MongoDB
docker service logs lgdx_mongodb --tail 20

# Подключение к MongoDB
docker exec -it $(docker ps -q -f name=mongodb) mongosh

# Проверка подключения
docker exec -it $(docker ps -q -f name=mongodb) mongosh --eval "db.adminCommand('ping')"
```

### Проблемы с Redis
```bash
# Проверка Redis
docker service logs lgdx_redis --tail 20

# Подключение к Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Проверка подключения
docker exec -it $(docker ps -q -f name=redis) redis-cli ping
```

### Проблемы с RabbitMQ
```bash
# Проверка RabbitMQ
docker service logs lgdx_rabbitmq --tail 20

# Проверка живости
docker exec -it $(docker ps -q -f name=rabbitmq) rabbitmq-diagnostics ping

# Проверка очередей (внутри контейнера, UI не опубликован в prod secure)
docker exec -it $(docker ps -q -f name=rabbitmq) rabbitmqctl list_queues name messages consumers
```

## 🌐 Web и API

### API не отвечает
```bash
# Проверка health check
curl https://lgdeal.com/health   # prod через nginx
# или внутри сети:
docker exec -it $(docker ps -q -f name=lgdx-server) curl -f http://localhost:5000/health

# Проверка логов API
docker service logs lgdx_lgdx-server --tail 50

# Проверка переменных окружения
docker service inspect lgdx_lgdx-server --format '{{.Spec.TaskTemplate.ContainerSpec.Env}}'
```

### Проблемы с аутентификацией
```bash
# Проверка JWT секрета
docker secret inspect jwt_secret

# Проверка логов аутентификации
docker service logs lgdx_lgdx-server | grep -i "auth\|jwt"
```

### CORS ошибки
```bash
# Проверка CORS настроек в nginx
docker service logs lgdx_nginx --tail 20

# Проверка заголовков
curl -I https://lgdeal.com/health
```

## 📁 Файлы и загрузка

### Проблемы с загрузкой файлов
```bash
# Проверка прав доступа
docker exec -it $(docker ps -q -f name=lgdx-server) ls -la /app/uploads

# Проверка размера файлов
docker exec -it $(docker ps -q -f name=lgdx-server) du -sh /app/uploads
```

### FTP сервис не работает
```bash
# Проверка FTP сервиса
docker service logs lgdx_ftp-service --tail 20

# Проверка портов FTP
# Windows (на хосте):
#   netstat -ano | findstr :21
#   netstat -ano | findstr :10000
#
# Linux (на хосте):
#   sudo ss -tulpn | grep -E ':21|:10000|:10100'

# Тест FTP подключения
# В prod FTP опубликован наружу:
# - control port: 21
# - passive: 10000-10100
# Пример проверки TCP-доступности (Windows PowerShell):
#   Test-NetConnection 49.13.160.126 -Port 21
#   Test-NetConnection 49.13.160.126 -Port 10000
```

## 📊 Мониторинг

### Prometheus не собирает метрики
```bash
# Проверка Prometheus
docker service logs lgdx_prometheus --tail 20

# Проверка targets через опубликованный порт
curl http://49.13.160.126:9090/targets
```

### Grafana не отображает данные
```bash
# Проверка Grafana
docker service logs lgdx_grafana --tail 20

# Проверка подключения к Prometheus
curl http://49.13.160.126:9090/api/v1/targets   # prod порт опубликован

# Проверка подключения к Loki
curl http://49.13.160.126:3100/ready            # prod порт опубликован
```

### Loki не собирает логи
```bash
# Проверка Loki
docker service logs lgdx_loki --tail 20
curl http://49.13.160.126:3100/ready

# Проверка Promtail
docker service logs lgdx_promtail --tail 20

# Проверка директории rules
docker exec -it $(docker ps -q -f name=loki) ls -la /loki/rules
```

## 🔔 Уведомления

### Telegram боты не работают
```bash
# Проверка токенов ботов
docker secret inspect telegram_bot_token
docker secret inspect stock_telegram_bot_token

# Проверка логов уведомлений
docker service logs lgdx_lgdx-server | grep -i "telegram"
```

### Email не отправляется
```bash
# Проверка SMTP настроек
docker service logs lgdx_lgdx-server | grep -i "smtp\|email"

# Проверка SMTP секретов
docker secret inspect smtp_pass
```

## 🚨 Критические проблемы

### Полный отказ системы
```bash
# 1. Проверка статуса всех сервисов
docker service ls

# 2. Перезапуск проблемных сервисов
docker service update --force lgdx_lgdx-server
docker service update --force lgdx_lgdx-client

# 3. Если не помогает - полный перезапуск
docker stack rm lgdx
sleep 30
docker stack deploy -c docker-compose.prod.secure.final.yml lgdx
```

### Проблемы с ресурсами
```bash
# Проверка использования ресурсов
docker stats

# Проверка дискового пространства
df -h

# Очистка Docker
docker system prune -a
```

### Проблемы с SSL
```bash
# Проверка SSL сертификатов
openssl s_client -connect lgdeal.com:443 -servername lgdeal.com

# Проверка Let's Encrypt
certbot certificates

# Обновление сертификатов
certbot renew
```

## 📋 Диагностические команды

### Сбор информации для поддержки
```bash
# Создание диагностического отчета
{
  echo "=== Docker Services ==="
  docker service ls
  echo ""
  echo "=== Docker Nodes ==="
  docker node ls
  echo ""
  echo "=== System Resources ==="
  df -h
  # Linux only:
  # free -h
  echo ""
  echo "=== Recent Logs ==="
  docker service logs lgdx_lgdx-server --tail 20
} > diagnostic_report.txt
```

### Проверка конфигурации
```bash
# Проверка docker-compose файла
docker compose -f docker-compose.prod.secure.final.yml config

# Проверка секретов
docker secret ls

# Проверка volumes
docker volume ls
```

## 🔍 Логи и отладка

### Полезные команды для логов
```bash
# Логи в реальном времени
docker service logs -f lgdx_lgdx-server

# Логи с фильтрацией
docker service logs lgdx_lgdx-server | grep ERROR
docker service logs lgdx_lgdx-server | grep WARN

# Логи за определенный период
docker service logs lgdx_lgdx-server --since 1h
```

### Отладка производительности
```bash
# Статистика контейнеров
docker stats --no-stream

# Проверка медленных запросов
docker service logs lgdx_lgdx-server | grep -i "slow\|timeout"

# Проверка использования памяти
# Linux only (внутри контейнера):
# docker exec -it $(docker ps -q -f name=lgdx-server) free -h
```

## 📞 Получение помощи

### Перед обращением в поддержку
1. **Соберите диагностическую информацию**:
   ```bash
   # Запустите диагностические команды выше
   # Сохраните вывод в файл
   ```

2. **Проверьте логи**:
   ```bash
   # Найдите последние ошибки
   docker service logs lgdx_lgdx-server --tail 100 | grep -i error
   ```

3. **Попробуйте базовые решения**:
   - Перезапуск сервисов
   - Очистка Docker
   - Проверка ресурсов

### Информация для поддержки
- Версия Docker и Docker Compose
- Операционная система
- Размер проекта и количество пользователей
- Время возникновения проблемы
- Действия, которые привели к проблеме
- Логи ошибок

## 📚 Дополнительные ресурсы

- **Мониторинг**: [18_Monitoring.md](18_Monitoring.md)
- **Безопасность**: [10_SECURITY.md](10_SECURITY.md)
- **API Reference**: [12_API_Reference.md](12_API_Reference.md)
- **Production Deployment**: [03_Production_Deployment.md](03_Production_Deployment.md)

---

*Последнее обновление: 2026*
