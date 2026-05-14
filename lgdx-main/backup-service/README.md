# 🔄 LGDX Backup Service

Микросервис для автоматического создания и управления бэкапами MongoDB.

## 🚀 Возможности

- **Автоматические бэкапы** MongoDB по расписанию
- **Ручные бэкапы** через API
- **Восстановление** из бэкапов
- **Тестовое восстановление** без перезаписи данных
- **Retention policy** с автоматической очисткой старых бэкапов
- **Telegram уведомления** о статусе операций
- **Health checks** и мониторинг
- **REST API** для управления

## 📅 Расписание бэкапов

- **Ежедневно**: 2:00 AM UTC
- **Еженедельно**: Воскресенье 2:00 AM UTC
- **Ежемесячно**: Первый день месяца 2:00 AM UTC

## 🗂️ Retention Policy

- **Ежедневные бэкапы**: 7 дней
- **Еженедельные бэкапы**: 4 недели
- **Ежемесячные бэкапы**: 12 месяцев

## 🏗️ Архитектура

```
backup-service/
├── src/
│   ├── config/          # Конфигурация
│   ├── services/        # Основная логика
│   │   ├── backupService.ts    # Создание бэкапов
│   │   └── restoreService.ts   # Восстановление
│   ├── utils/           # Утилиты
│   │   ├── logger.ts           # Логирование
│   │   └── telegram.ts         # Telegram уведомления
│   ├── scheduler.ts     # Планировщик
│   ├── health.ts        # Health checks
│   └── index.ts         # Главный файл
├── Dockerfile           # Docker образ
└── package.json         # Зависимости
```

## 🔧 Установка и запуск

### Development
```bash
cd backup-service
npm install
npm run dev
```

### Production
```bash
# Сборка образа
docker build -t lgdx-backup-service:latest .

# Запуск в Docker Swarm
docker stack deploy -c docker-compose.prod.secure.yml lgdx
```

## 📡 API Endpoints

### Health Checks
- `GET /health` - Полный статус здоровья
- `GET /health/simple` - Простой health check для Docker

### Бэкапы
- `POST /backup/daily` - Ручной запуск ежедневного бэкапа
- `POST /backup/weekly` - Ручной запуск еженедельного бэкапа
- `POST /backup/monthly` - Ручной запуск ежемесячного бэкапа
- `GET /backups` - Список всех бэкапов
- `GET /backups/:filename` - Информация о конкретном бэкапе
- `DELETE /backups/:filename` - Удаление бэкапа

### Восстановление
- `POST /restore/:filename` - Восстановление из бэкапа
  - Body: `{"test": true}` для тестового восстановления

### Планировщик
- `GET /scheduler/status` - Статус планировщика
- `POST /scheduler/start` - Запуск планировщика
- `POST /scheduler/stop` - Остановка планировщика

## 🔧 Конфигурация

### Environment Variables

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `MONGODB_URI` | URI подключения к MongoDB | - |
| `BACKUP_SCHEDULE` | Cron расписание для бэкапов | `0 2 * * *` |
| `RETENTION_DAYS` | Дни хранения ежедневных бэкапов | `7` |
| `REPORTS_RETENTION_HOURS` | Удалять файлы в `REPORTS_PATH` старше N часов (если > 0, имеет приоритет над `REPORTS_RETENTION_DAYS`) | `0` (выкл.; используются дни) |
| `REPORTS_CLEANUP_SCHEDULE` | Cron очистки только отчётов (без Mongo), по умолчанию раз в 6 ч UTC | `0 */6 * * *` |
| `RETENTION_WEEKS` | Недели хранения еженедельных бэкапов | `4` |
| `RETENTION_MONTHS` | Месяцы хранения ежемесячных бэкапов | `12` |
| `BACKUP_PATH` | Путь для хранения бэкапов | `/app/backups` |
| `LOG_PATH` | Путь для логов | `/app/logs` |
| `LOG_LEVEL` | Уровень логирования | `info` |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | - |
| `TELEGRAM_CHAT_ID` | ID Telegram чата | - |

### Docker Secrets
В production используются Docker Secrets:
- `MONGODB_URI_FILE`
- `TELEGRAM_BOT_TOKEN_FILE`
- `TELEGRAM_CHAT_ID_FILE`

## 📊 Мониторинг

### Health Check
```bash
curl http://localhost:3000/health
```

### Логи
```bash
# Docker Swarm
docker service logs lgdx_backup-service

# Docker Compose
docker logs lgdx_backup-service
```

### Статус планировщика
```bash
curl http://localhost:3000/scheduler/status
```

## 🔄 Telegram уведомления

Сервис отправляет уведомления в Telegram при:

### Успешные операции
- ✅ Создание бэкапа
- ✅ Восстановление из бэкапа
- ✅ Запуск сервиса

### Ошибки
- ❌ Ошибка создания бэкапа
- ❌ Ошибка восстановления
- ⚠️ Предупреждение о нехватке места на диске

## 🛠️ Управление

### Ручной запуск бэкапа
```bash
# Windows
scripts\win\prod-backup-manual.bat

# Mac/Linux
./scripts/mac/prod-backup-manual.sh
```

### Проверка статуса
```bash
# Windows
scripts\win\prod-backup-status.bat

# Mac/Linux
./scripts/mac/prod-backup-status.sh
```

### Восстановление
```bash
# Windows
scripts\win\prod-backup-restore.bat

# Mac/Linux
./scripts/mac/prod-backup-restore.sh
```

## 🔒 Безопасность

- Все чувствительные данные хранятся в Docker Secrets
- Бэкапы сжимаются с помощью gzip
- Автоматическая очистка старых бэкапов
- Логирование всех операций
- Health checks для мониторинга

## 🐛 Troubleshooting

### Проблемы с MongoDB
```bash
# Проверить подключение
curl http://localhost:3000/health

# Проверить логи
docker service logs lgdx_backup-service --tail 50
```

### Проблемы с дисковым пространством
```bash
# Проверить использование диска
docker exec -it $(docker ps -q -f name=backup-service) df -h
```

### Проблемы с планировщиком
```bash
# Проверить статус планировщика
curl http://localhost:3000/scheduler/status

# Перезапустить планировщик
curl -X POST http://localhost:3000/scheduler/stop
curl -X POST http://localhost:3000/scheduler/start
```

## 📝 Логи

Логи сохраняются в:
- `/app/logs/combined.log` - Все логи
- `/app/logs/error.log` - Только ошибки

В development режиме логи также выводятся в консоль. 