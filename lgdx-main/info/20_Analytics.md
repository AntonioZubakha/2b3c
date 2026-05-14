# 📊 Analytics System

## Обзор

Актуальная аналитика предоставляется через отдельный микросервис `analytics-service` (порт 9200, prod URL через Nginx). Legacy middleware в `server` не используется как основной источник.

## Компоненты системы

### 1. Frontend Analytics Dashboard
- **Расположение**: `client/src/components/Admin/Analytics.tsx`
- **Стили**: `client/src/components/Admin/Analytics.module.css`
- **Доступ**: Через админ-панель → вкладка "Analytics"

### 2. Analytics Service (основной источник)
- **Сервис**: `analytics-service/` (Docker Swarm)
- **API**: Порт 9200, prod через Nginx `/analytics/*`
- **Кэширование**: MongoDB + Redis (секреты через `/run/secrets/mongodb_uri`, `/run/secrets/redis_url`)
- **Интеграция**: фронтенд обращается к `/analytics/...` через Nginx
- **Расписание**: `ANALYTICS_SCHEDULE="45 3 * * *"` (после market-price-calculator)

### 3. Отслеживание посещений
- Основной сбор и агрегация выполняются в `analytics-service`; legacy middleware не используется как источник данных.

## API Endpoints

### Analytics Service API (основное)
> **📖 Полный справочник API**: [21_Analytics_Service.md](21_Analytics_Service.md) — детальное описание всех endpoints

## Метрики в Dashboard

### 1. User Activity Metrics
- **Total Users**: Общее количество активных пользователей
- **Active Users**: Пользователи, заходившие за выбранный период
- **New Registrations**: Новые регистрации за период

### 2. Product Statistics
- **Total Products**: Общее количество доступных продуктов
- **New Arrivals**: Новые поступления за день
- **Top Shape**: Самая популярная форма бриллианта

### 3. Company Statistics
- **Total Companies**: Общее количество компаний
- **New This Month**: Новые компании за месяц
- **Engagement Rate**: Процент пользователей с активными сделками

### 4. Page Views
- **Total Views**: Общее количество просмотров страниц
- **By Page**: Детализация по страницам
- **Unique Visitors**: Уникальные посетители

### 5. Charts
- **Shape Distribution**: Распределение по формам бриллиантов (ROUND, OVAL, PEAR, CUSHION, EMERALD, RADIANT, PRINCESS, MARQUISE, HEART, ASSCHER, FANCY)
- **Weight Distribution**: Распределение по весу
- **Price Dynamics**: Динамика цен по формам

## Настройка и развертывание

### 1. Redis Configuration
Убедитесь, что Redis настроен в переменных окружения:
```env
REDIS_URL=redis://localhost:6379
```

### 2. Middleware Setup
Middleware для отслеживания автоматически подключается в `server/src/index.ts`:
```typescript
import { trackPageView } from './middleware/analyticsMiddleware';
app.use(trackPageView);
```

### 3. Testing
Запустите тест аналитики:
```bash
# Тестирование API аналитики
curl http://localhost:5001/api/analytics/market-overview
curl http://localhost:5001/api/analytics/user-activity
curl http://localhost:5001/api/analytics/page-views
```

## Расширение функциональности

### 1. Добавление новых метрик
1. Обновите интерфейс в `Analytics.tsx`
2. Добавьте логику в `analyticsController.ts`
3. Обновите API endpoint

### 2. Интеграция с внешними сервисами
- Google Analytics
- Mixpanel
- Amplitude
- Custom tracking

### 3. Экспорт данных
- CSV export
- PDF reports
- Email notifications

## Мониторинг и обслуживание

### 1. Redis Maintenance
```bash
# Очистка старых данных
redis-cli KEYS "page_views:*" | xargs redis-cli DEL
redis-cli KEYS "total_views:*" | xargs redis-cli DEL
redis-cli KEYS "session:*" | xargs redis-cli DEL
```

### 2. Performance Monitoring
- Мониторинг Redis памяти/статуса
- Отслеживание времени ответа API (`analytics-service:9200/health`)
- Логирование ошибок

### 3. Data Retention
- Данные автоматически истекают через 30 дней
- Настройте бэкапы Redis
- Регулярная очистка старых данных

## Troubleshooting

### 1. Redis Connection Issues
```bash
# Проверка подключения (prod secure)
docker exec -it $(docker ps -q -f name=redis) redis-cli -a $(cat /run/secrets/redis_password) ping

# Проверка переменных/секретов
ls /run/secrets
cat /run/secrets/redis_url
```

### 2. API Errors
```bash
# Логи сервиса
docker service logs lgdx_analytics-service --tail 50

# Health
curl http://localhost:9200/health

# Через nginx (prod)
curl https://lgdeal.com/analytics/day
```

### 3. Frontend Issues
- Проверьте консоль браузера
- Убедитесь, что API `/analytics/*` доступны через Nginx
- Проверьте права доступа админа

## Безопасность

### 1. Access Control
- Аналитика доступна только администраторам
- Проверка прав через серверные роли/права (admin/supervisor)

### 2. Data Privacy
- Не сохраняем персональные данные
- Анонимное отслеживание IP
- Автоматическое истечение данных

### 3. Rate Limiting
- Ограничение запросов к API (через Nginx/express-rate-limit)
- Защита от DDoS атак

---

**Последнее обновление:** 10 декабря 2025  
**Статус:** Активный  
**Связанные документы:** [21_Analytics_Service.md](21_Analytics_Service.md), [18_Monitoring.md](18_Monitoring.md), [19_Monitoring_Quick_Start.md](19_Monitoring_Quick_Start.md)