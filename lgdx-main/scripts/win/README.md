# 🪟 Windows Scripts

Скрипты для Windows (Batch files).

## 🚀 Быстрый старт

### Production Local
```cmd
scripts\win\prod-clean-rebuild-keep-data.bat
```

## 📋 Основные команды

### 🏭 Production Local (Docker Swarm)
| Действие | Команда | Описание |
|----------|---------|----------|
| Остановка | `prod-stop.bat` | Остановка production |
| Логи | `prod-logs.bat` | Просмотр логов production |
| Логи (PowerShell) | `prod-logs.ps1` | Просмотр логов с цветным выводом |
| Статус | `prod-status.bat` | Статус production сервисов |
| Пересборка (сохранить данные) | `prod-clean-rebuild-keep-data.bat` | Пересборка с сохранением данных |
| Настройка секретов | `prod-setup-docker-secrets.bat` | Настройка Docker Secrets |

## 🌐 Доступные URL

### Development
- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:5001
- **MongoDB**: localhost:27019 (admin/password)
- **Redis**: localhost:6380
- **RabbitMQ**: http://localhost:15673 (lgdx/lgdx2024)

### Production Local
- **Frontend**: http://localhost
- **Backend**: http://localhost:5000
- **MongoDB**: localhost:27020
- **Redis**: localhost:6379
- **RabbitMQ**: http://localhost:15672

## 🔗 MongoDB Compass

### Development
```
mongodb://admin:password@localhost:27019/lgdx_dev?authSource=admin
```

### Production Local
```
mongodb://lgdx_admin:[password]@localhost:27020/lgdx?authSource=admin
```
*Пароль находится в файле `docker-secrets/mongodb_uri`*

## 🐛 Troubleshooting

### Проблемы с Docker
```cmd
# Проверить статус
docker info

# Очистить ресурсы
docker system prune -f
```

### Проблемы с подключениями
```cmd
# Проверить логи
scripts\win\prod-logs.bat

# Проверить статус
scripts\win\prod-status.bat

# Пересобрать и перезапустить (с сохранением данных)
scripts\win\prod-clean-rebuild-keep-data.bat
```

### Проблемы с секретами
```cmd
# Пересоздать секреты
node scripts/generate-secrets.js
scripts\win\prod-setup-docker-secrets.bat
```

### Проблемы с портами
```cmd
# Проверить занятые порты
netstat -an | findstr :3001
netstat -an | findstr :5001
netstat -an | findstr :27019
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи: `scripts\win\prod-logs.bat`
2. Проверьте статус: `scripts\win\prod-status.bat`
3. Перезапустите: `scripts\win\prod-clean-rebuild-keep-data.bat`

## 🔧 Системные требования

- Windows 10+
- Docker Desktop
- Node.js 18+
- Git

## 🚀 Первый запуск

1. Клонируйте репозиторий
2. Сгенерируйте секреты: `node scripts/generate-secrets.js`
3. Настройте Docker Secrets: `scripts\win\prod-setup-docker-secrets.bat`
4. Соберите и запустите production локально (данные сохранятся): `scripts\win\prod-clean-rebuild-keep-data.bat`