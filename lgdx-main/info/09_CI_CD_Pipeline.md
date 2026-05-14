# 🚀 09. CI/CD Pipeline LGDX

## 📋 Обзор

Этот документ описывает настройку и использование CI/CD pipeline для проекта LGDX, включая GitHub Actions, автоматическое тестирование, сборку Docker образов и деплой.

---

## 🏗️ Архитектура CI/CD

### **Платформа**: GitHub Actions (опционально)
- **Триггеры**: Push в `main`
- **Среда выполнения**: Ubuntu Latest
- **Docker Registry**: Настраиваемый
- **Деплой**: Выполняется вручную на production сервере (Docker Swarm)

---

## 📁 Структура pipeline

```
.github/
└── workflows/
    └── deploy.yml              # Основной workflow
```

### **Workflow файл**: `.github/workflows/deploy.yml`

---

## 🔄 Этапы pipeline

### 1. **Test** - Тестирование (опционально)
- **Триггер**: Push в `main` или ручной запуск
- **Сервисы**: MongoDB, RabbitMQ
- **Действия**:
  - Установка зависимостей
  - Линтинг кода
  - Unit тесты
  - Интеграционные тесты
  - Сборка TypeScript

### 2. **Security Scan** - Проверка безопасности
- **Триггер**: После успешного тестирования
- **Действия**:
  - Аудит зависимостей
  - Проверка уязвимостей
  - Сканирование кода

### 3. **Build and Push** - Сборка и публикация (опционально)
- **Триггер**: Для `main` ветки (если включено)
- **Действия**:
  - Сборка Docker образов
  - Публикация в registry
  - Тегирование образов

### 4. **Deploy** - Развертывание (ручное)
- **Production**: для `main` — вручную на сервере:
  - `git pull origin main`
  - `docker build ...` (нужные сервисы)
  - `docker stack deploy -c docker-compose.prod.secure.final.yml lgdx`

### 5. **Notify** - Уведомления
- **Триггер**: После деплоя
- **Действия**:
  - Уведомления об успехе/неудаче
  - Отчеты о статусе

---

## ⚙️ Настройка GitHub Secrets

### Обязательные секреты

```bash
# Docker Registry
DOCKER_REGISTRY=your-registry.com
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password

# Production Server
SERVER_HOST=49.13.160.126
SERVER_USER=root
SERVER_SSH_KEY=your-private-ssh-key
```

### Настройка секретов

1. **Перейдите в настройки репозитория**
   - Settings → Secrets and variables → Actions

2. **Добавьте каждый секрет**
   - Нажмите "New repository secret"
   - Введите имя и значение
   - Нажмите "Add secret"

---

## 🔧 Конфигурация workflow

### Основные переменные

```yaml
env:
  NODE_VERSION: '18'
  DOCKER_REGISTRY: ${{ secrets.DOCKER_REGISTRY }}
  IMAGE_TAG: ${{ github.sha }}
  SERVER_HOST: ${{ secrets.SERVER_HOST }}
  SERVER_USER: ${{ secrets.SERVER_USER }}
  SERVER_SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
```

### Триггеры

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

---

## 🧪 Этап тестирования

### Настройка сервисов

```yaml
services:
  mongodb:
    image: mongo:6.0
    ports:
      - 27018:27017
    options: >-
      --health-cmd "mongosh --eval 'db.adminCommand(\"ping\")'"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
  
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - 5672:5672
      - 15672:15672
    env:
      RABBITMQ_DEFAULT_USER: lgdx
      RABBITMQ_DEFAULT_PASS: lgdx2024
```

### Установка зависимостей

```yaml
- name: Install dependencies
  run: |
    echo "Installing server dependencies..."
    cd server && npm ci
    echo "Installing client dependencies..."
    cd ../client && npm ci
    echo "Installing API sync service dependencies..."
    cd ../api-product-sync-service && npm ci
    echo "Installing file import service dependencies..."
    cd ../file-product-import-service && npm ci
    echo "Installing market price calculator dependencies..."
    cd ../market-price-calculator-service && npm ci
    echo "Installing backup service dependencies..."
    cd ../backup-service && npm ci
```

### Линтинг и тестирование

```yaml
- name: Run linting
  run: |
    echo "Linting server..."
    cd server && npm run lint || echo "No lint script found"
    echo "Linting client..."
    cd ../client && npm run lint || echo "No lint script found"
    # ... остальные сервисы

- name: Run tests
  run: |
    echo "Testing server..."
    cd server && npm test || echo "No test script found"
    echo "Testing client..."
    cd ../client && npm test || echo "No test script found"
    # ... остальные сервисы
```

---

## 🔒 Этап проверки безопасности

### Аудит зависимостей

```yaml
- name: Run security audit (main branch, fail on high)
  if: github.ref == 'refs/heads/main'
  run: |
    echo "Auditing server dependencies (fail on high)..."
    cd server && npm audit --audit-level high
    echo "Auditing client dependencies (fail on high)..."
    cd ../client && npm audit --audit-level high
    # ... остальные сервисы

- name: Run security audit (non-main, informational)
  if: github.ref != 'refs/heads/main'
  run: |
    echo "Auditing server dependencies (informational)..."
    cd server && npm audit --audit-level moderate || echo "Vulnerabilities found but continuing"
    # ... остальные сервисы
```

---

## 🐳 Этап сборки и публикации

### Настройка Docker

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Login to Docker Registry
  uses: docker/login-action@v3
  with:
    registry: ${{ env.DOCKER_REGISTRY }}
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}
```

### Сборка образов

```yaml
- name: Build and push server image
  uses: docker/build-push-action@v5
  with:
    context: ./server
    push: true
    tags: ${{ env.DOCKER_REGISTRY }}/lgdx-server:${{ env.IMAGE_TAG }},${{ env.DOCKER_REGISTRY }}/lgdx-server:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max

- name: Build and push client image
  uses: docker/build-push-action@v5
  with:
    context: ./client
    push: true
    tags: ${{ env.DOCKER_REGISTRY }}/lgdx-client:${{ env.IMAGE_TAG }},${{ env.DOCKER_REGISTRY }}/lgdx-client:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## 🚀 Этап развертывания

### Настройка SSH

```yaml
- name: Setup SSH
  uses: webfactory/ssh-agent@v0.8.0
  with:
    ssh-private-key: ${{ env.SERVER_SSH_KEY }}
```

### Деплой на production

Развертывание выполняется вручную на сервере (SSH + `docker build` + `docker stack deploy -c docker-compose.prod.secure.final.yml lgdx`). Автоматический деплой из Actions не используется.

---

## 📊 Мониторинг pipeline

### Проверка статуса

```bash
# Просмотр статуса workflow
gh run list

# Просмотр логов конкретного запуска
gh run view <run-id>

# Просмотр логов в реальном времени
gh run watch <run-id>
```

### Уведомления

```yaml
- name: Notify on success
  if: success()
  run: |
    echo "✅ Deployment successful!"
    echo "🚀 LGDX services have been updated and deployed to production!"
    echo "📊 Check service status: ssh ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} 'cd /opt/lgdx && docker service ls'"
    # Add notification logic (Slack, Telegram, etc.)
    
- name: Notify on failure
  if: failure()
  run: |
    echo "❌ Deployment failed!"
    echo "🔍 Check GitHub Actions logs for details"
    echo "🛠️ Manual intervention may be required"
    # Add failure notification logic
```

---

## 🔧 Локальная разработка

### Тестирование pipeline локально

```bash
# Установка act (локальный GitHub Actions)
npm install -g @nektos/act

# Запуск workflow локально
act push

# Запуск конкретного job
act -j test

# Запуск с секретами
act --secret-file .secrets
```

### Отладка workflow

```yaml
# Добавление отладочной информации
- name: Debug information
  run: |
    echo "GitHub ref: ${{ github.ref }}"
    echo "GitHub event: ${{ github.event_name }}"
    echo "Docker registry: ${{ env.DOCKER_REGISTRY }}"
    echo "Image tag: ${{ env.IMAGE_TAG }}"
```

---

## 🚨 Troubleshooting

### Частые проблемы

#### 1. **Ошибки аутентификации Docker**
```bash
# Проверьте секреты
echo $DOCKER_USERNAME
echo $DOCKER_PASSWORD

# Проверьте права доступа к registry
docker login $DOCKER_REGISTRY
```

#### 2. **Ошибки SSH подключения**
```bash
# Проверьте SSH ключ
ssh-add -l

# Тестируйте подключение
ssh -i ~/.ssh/id_rsa $SERVER_USER@$SERVER_HOST
```

#### 3. **Ошибки сборки Docker**
```bash
# Проверьте Dockerfile
docker build -t test ./server

# Проверьте контекст сборки
ls -la ./server
```

#### 4. **Ошибки деплоя**
```bash
# Проверьте статус сервисов на сервере
ssh $SERVER_USER@$SERVER_HOST "docker service ls"

# Проверьте логи сервисов
ssh $SERVER_USER@$SERVER_HOST "docker service logs lgdx_lgdx-server"
```

---

## 📈 Оптимизация pipeline

### Кэширование

```yaml
# Кэширование зависимостей
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: |
      server/node_modules
      client/node_modules
      api-product-sync-service/node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Параллельное выполнение

```yaml
# Параллельные jobs
jobs:
  test-server:
    runs-on: ubuntu-latest
    steps: [тестирование сервера]
  
  test-client:
    runs-on: ubuntu-latest
    steps: [тестирование клиента]
  
  test-services:
    runs-on: ubuntu-latest
    steps: [тестирование микросервисов]
```

### Условное выполнение

```yaml
# Выполнение только при изменении определенных файлов
- name: Check if server changed
  id: server-changed
  run: |
    if git diff --name-only HEAD~1 HEAD | grep -E '^server/'; then
      echo "changed=true" >> $GITHUB_OUTPUT
    else
      echo "changed=false" >> $GITHUB_OUTPUT
    fi

- name: Build server
  if: steps.server-changed.outputs.changed == 'true'
  run: |
    echo "Building server..."
```

---

## 📚 Дополнительные ресурсы

- **Quick Start**: [14_CI_CD_Quick_Start.md](14_CI_CD_Quick_Start.md)
- **Deployment**: [05_Deployment.md](05_Deployment.md)
- **Scripts**: [15_Scripts_and_Utilities.md](15_Scripts_and_Utilities.md)
- **Testing**: [27_Testing_Guide.md](27_Testing_Guide.md)
- **Troubleshooting**: [07_Troubleshooting.md](07_Troubleshooting.md)

---

## 🎯 Best Practices

### 1. **Безопасность**
- Никогда не коммитьте секреты в код
- Используйте GitHub Secrets для чувствительных данных
- Регулярно ротируйте ключи доступа

### 2. **Производительность**
- Используйте кэширование для зависимостей
- Запускайте тесты параллельно
- Оптимизируйте Docker образы

### 3. **Надежность**
- Добавляйте проверки здоровья после деплоя
- Используйте rollback стратегии
- Мониторьте статус pipeline

### 4. **Мониторинг**
- Настройте уведомления о статусе
- Логируйте все этапы pipeline
- Отслеживайте метрики производительности

---

**Статус:** GitHub Actions workflow описан в этом документе как шаблон (опционально).  
**Текущая практика:** Деплой выполняется **вручную** через Docker Swarm (см. `info/08_CI_CD_Quick_Start.md`).  
Автоматического деплоя на production не настроено.
