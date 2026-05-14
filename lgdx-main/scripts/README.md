# 🛠️ LGDX Scripts & Utilities

Централизованная коллекция скриптов и утилит для управления системой LGDX.

## 📁 Структура

```
scripts/
├── README.md                    # Этот файл
├── install-all-deps.js         # Установка всех зависимостей
├── generate-secrets.js         # Генерация секретов для production
├── clear-cache.js              # Очистка различных типов кэша
├── check-system.js             # Комплексная проверка системы
├── clear-cache.sh              # Очистка кэша (Bash)
├── win/                        # Windows скрипты (.bat)
├── mac/                        # macOS/Linux скрипты (.sh)
├── mongo-init.js/              # MongoDB инициализация
└── mongo-init-dev.js/          # MongoDB инициализация (dev)
```

## 🚀 Быстрый старт

### 1. Установка зависимостей
```bash
# Универсальный установщик
node scripts/install-all-deps.js

# Или через npm
npm run install-deps
```

### 2. Генерация секретов
```bash
# Создание всех необходимых секретов
node scripts/generate-secrets.js
```

### 3. Проверка системы
```bash
# Проверка всех сервисов
node scripts/check-system.js --env=dev
node scripts/check-system.js --env=prod --verbose
```

### 4. Очистка кэша
```bash
# Очистка всех типов кэша
node scripts/clear-cache.js --env=dev

# Очистка только маркет-аналитики
node scripts/clear-cache.js --type=market --env=prod
```

## 📋 Основные скрипты

### 🔧 Универсальные утилиты

| Скрипт | Описание | Использование |
|--------|----------|---------------|
| `install-all-deps.js` | Установка зависимостей всех сервисов | `node scripts/install-all-deps.js` |
| `generate-secrets.js` | Генерация секретов для production | `node scripts/generate-secrets.js` |
| `check-system.js` | Комплексная проверка системы | `node scripts/check-system.js [--env=dev\|prod]` |
| `clear-cache.js` | Очистка различных типов кэша | `node scripts/clear-cache.js [--type=all\|market\|analytics]` |

### 🪟 Windows скрипты

| Скрипт | Описание | Использование |
|--------|----------|---------------|
| `win/prod-clean-rebuild-keep-data.bat` | Полная пересборка production локально (данные сохраняются) | `scripts\win\prod-clean-rebuild-keep-data.bat` |
| `win/prod-logs.bat` | Просмотр логов | `scripts\win\prod-logs.bat` |
| `win/prod-status.bat` | Статус сервисов | `scripts\win\prod-status.bat` |

### 🍎 macOS/Linux скрипты

| Скрипт | Описание | Использование |
|--------|----------|---------------|
| `mac/dev-start.sh` | Запуск development окружения | `./scripts/mac/dev-start.sh` |
| `mac/prod-deploy.sh` | Деплой production | `./scripts/mac/prod-deploy.sh` |
| `mac/prod-logs.sh` | Просмотр логов | `./scripts/mac/prod-logs.sh` |

## 🔧 Конфигурация

### Переменные окружения

Скрипты автоматически определяют окружение на основе аргументов командной строки:

- `--env=dev` - Development окружение (порты 3001, 5001, 27019)
- `--env=prod` - Production окружение (порты 80, 5000, 27020)

### Типы кэша

Для скрипта `clear-cache.js`:

- `--type=all` - Очистка всех типов кэша (по умолчанию)
- `--type=market` - Только маркет-аналитика
- `--type=analytics` - Только аналитика
- `--type=redis` - Только Redis кэш

## 🌐 Доступные URL

### Development
- **Frontend**: http://localhost:3001
- **API**: http://localhost:5001
- **MongoDB**: localhost:27019 (admin/password)
- **Redis**: localhost:6380
- **RabbitMQ**: http://localhost:15673

### Production Local
- **Frontend**: http://localhost
- **API**: http://localhost:5000
- **MongoDB**: localhost:27020
- **Redis**: localhost:6379
- **RabbitMQ**: http://localhost:15672

## 🐛 Troubleshooting

### Проблемы с зависимостями
```bash
# Переустановка всех зависимостей
node scripts/install-all-deps.js

# Очистка npm кэша
npm cache clean --force
```

### Проблемы с кэшем
```bash
# Очистка всех типов кэша
node scripts/clear-cache.js --env=dev

# Очистка только проблемного кэша
node scripts/clear-cache.js --type=market --env=prod
```

### Проблемы с системой
```bash
# Проверка всех сервисов
node scripts/check-system.js --env=dev --verbose

# Проверка конкретного сервиса
node scripts/check-system.js --env=prod | grep "MongoDB"
```

## 📞 Поддержка

При возникновении проблем:

1. **Проверьте логи**: `scripts/win/prod-logs.bat` или `./scripts/mac/prod-logs.sh`
2. **Проверьте систему**: `node scripts/check-system.js --env=prod`
3. **Очистите кэш**: `node scripts/clear-cache.js --env=prod`
4. **Перезапустите**: `scripts/win/prod-clean-rebuild-keep-data.bat` или `./scripts/mac/prod-deploy.sh`

## 🔧 Системные требования

- **Node.js**: 18+
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 2.30+

## 📝 Дополнительная информация

- Все скрипты поддерживают `--help` для получения справки
- Логи сохраняются в соответствующих папках сервисов
- Секреты генерируются в папке `docker-secrets/`
- Тестовые данные можно очистить через `clear-cache.js`

## 🚀 Первый запуск

1. **Клонируйте репозиторий**
2. **Установите зависимости**: `node scripts/install-all-deps.js`
3. **Сгенерируйте секреты**: `node scripts/generate-secrets.js`
4. **Проверьте систему**: `node scripts/check-system.js --env=dev`
5. **Запустите development**: `./scripts/mac/dev-start.sh`
