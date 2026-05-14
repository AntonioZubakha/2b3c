# 🌐 05. Конфигурация Nginx LGDX

## 📋 Обзор

Этот документ описывает настройку и конфигурацию Nginx reverse proxy для проекта LGDX, включая SSL, load balancing, security headers и оптимизацию производительности.

---

## 🏗️ Архитектура Nginx

### **Роль**: Reverse Proxy
- **Статические файлы**: React приложение
- **API запросы**: Перенаправление на backend
- **SSL терминация**: HTTPS для production
- **Load balancing**: Распределение нагрузки

---

## 📁 Файлы конфигурации

```
nginx/
├── nginx.production.conf          # Production конфигурация
└── nginx.production.final.conf    # Final production конфигурация (используется в Swarm)
```

> Grafana работает отдельным сервисом (`:3000`), с `GF_SERVER_ROOT_URL=https://lgdeal.com/grafana/` и `GF_SERVER_SERVE_FROM_SUB_PATH=true`.
> При этом в production (`docker-compose.prod.secure.final.yml`) Nginx подключён к `monitoring-network`, чтобы при необходимости проксировать Grafana/Loki/Prometheus; текущая схема доступа может быть как через прямой порт `:3000`, так и через под‑путь `/grafana/` (зависит от конфигурации `nginx.production.final.conf`).

---

## ⚙️ Основная конфигурация

### Source of truth (prod)
В production фактическая маршрутизация/проксирование задаются в `nginx/nginx.production.final.conf` (он и монтируется в контейнер `nginx`).

Ключевые особенности текущей prod-конфигурации:
- **HTTPS canonical host**: `lgdeal.com` (есть редиректы `http -> https` и `www -> apex`)
- **WebSocket/Realtime**:
  - `/socket.io/` проксируется на `lgdx-server` (deal updates; учитывается polling/upgrade)
  - `/api/chat/ws` проксируется на `lgdx-server` (native WebSocket)
  - `http2` **отключён** для корректного WebSocket proxying
- **Monitoring UI**: `/grafana/` проксируется на сервис `grafana:3000` (и отдельно в compose также опубликован порт `3000:3000`)
- **API**:
  - `/api/` проксируется на `lgdx-server` (для GET добавляется короткий cache-control)
  - отдельные приоритетные локации вынесены выше общего `/api/` (например, `/api/auth/login`, `/api/auth/register`, `/api/category-stats...`)
- **Category stats**: `/api/category-stats*` проксируется на сервис `analytics` (а не на `lgdx-server`), поэтому эти `location` должны быть **выше** общего `/api/`.
- **Health**: `/health` отдаётся самим Nginx (plain text `healthy`), не проксируется на backend.

### `nginx.production.conf` (исторический файл)

`nginx/nginx.production.conf` **не является source of truth** и может расходиться с боевой конфигурацией.
Для production ориентируйтесь только на `nginx/nginx.production.final.conf`.

Критичные особенности, которые завязаны на порядок `location` и легко “сломать” при переносе:

- **WebSocket endpoints должны быть выше rewrite правил**:
  - `location /socket.io/` (socket.io, long-polling/upgrade)
  - `location /api/chat/ws` (native WebSocket)
- **Trailing slash нормализация**:
  - есть `rewrite ^/socket\.io$ /socket.io/ last;`
  - запрет на strip для `/grafana/` (Grafana subpath требует слеша)
- **Category stats**:
  - `/api/category-stats*` уходит в `analytics-service:9200`
  - `/api/category-stats/calculate` уходит в `market-price-calculator:9100`
- **Health**: `location /health { return 200 "healthy\n"; }` (отдаёт Nginx)

---

## 🔒 Security Headers

### Content Security Policy (CSP)

```nginx
# Примечание:
# - В `nginx.production.final.conf` CSP как “политика всего сайта” не задаётся.
# - В production добавляется только CSP `frame-ancestors 'self'` в `location /` (React app).
add_header Content-Security-Policy "frame-ancestors 'self'" always;
```

### Другие security headers

```nginx
# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# X-Frame-Options
add_header X-Frame-Options "SAMEORIGIN" always;

# X-Content-Type-Options
add_header X-Content-Type-Options "nosniff" always;

# X-XSS-Protection
add_header X-XSS-Protection "1; mode=block" always;

# Referrer Policy
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Permissions Policy (prod)
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;
```

---

## ⚡ Оптимизация производительности

### Gzip сжатие

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_proxied any;
gzip_comp_level 6;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml+rss
    application/atom+xml
    image/svg+xml;
```

### Кэширование

```nginx
# Статические ресурсы
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    proxy_pass http://frontend;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# HTML файлы
location ~* \.html$ {
    proxy_pass http://frontend;
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}
```

### Keep-alive соединения

```nginx
# Примечание: upstream `lgdx_backend/lgdx_frontend` приведены как общий пример.
# В production (`nginx.production.final.conf`) используются upstream `backend/frontend/analytics/market_calculator`.
```

---

## 🔧 Rate Limiting

### Ограничение запросов (prod)

В production лимиты определены в `nginx/nginx.production.final.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
limit_req_zone $binary_remote_addr zone=upload:10m rate=2r/s;
limit_req_zone $binary_remote_addr zone=registration:10m rate=1r/m;
limit_req_zone $binary_remote_addr zone=email_verification:10m rate=1r/m;
```

И применяются точечно:
- `location /api/auth/login` → `limit_req zone=login`
- `location /api/auth/register` → `limit_req zone=registration`
- `location ~ ^/api/auth/(verify-email|resend-verification|request-password-reset)$` → `limit_req zone=email_verification`
- `location /uploads/` → `limit_req zone=upload`

### Защита от DDoS

```nginx
# Примечание: в текущем `nginx.production.final.conf` нет отдельного limit_conn_zone.
# Если понадобится — добавляйте в `nginx.production.final.conf` и документируйте здесь.
```

---

## 📊 Мониторинг и логирование

### Формат логов

```nginx
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for" '
                'rt=$request_time uct="$upstream_connect_time" '
                'uht="$upstream_header_time" urt="$upstream_response_time"';

access_log /var/log/nginx/access.log main;
error_log /var/log/nginx/error.log warn;
```

### Nginx status / stub_status

В текущем `nginx/nginx.production.final.conf` endpoint со `stub_status` **не включён**.
Если понадобится (временно, для диагностики) — добавляйте отдельный `location` в `nginx.production.final.conf` и закрывайте его ACL.

---

## 🔄 Load Balancing

### Балансировка нагрузки

В текущей production-конфигурации нет upstream-балансировки между несколькими `lgdx-server-*`.
Если будете добавлять replicas/балансировку — source of truth должен остаться в `nginx.production.final.conf`.

### Sticky sessions

В текущей production-конфигурации sticky sessions не настроены.

---

## 🚀 SSL/TLS конфигурация

### SSL сертификаты

```nginx
# Production (Let's Encrypt, смонтировано в контейнер Nginx)
ssl_certificate /etc/ssl/certs/fullchain.pem;
ssl_certificate_key /etc/ssl/private/privkey.pem;
ssl_trusted_certificate /etc/ssl/certs/chain.pem;
```

### SSL настройки

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;
```

---

## 🔧 Docker конфигурация

### Dockerfile для Nginx

В production используется официальный образ `nginx:1.25-alpine` и монтируется готовый конфиг `nginx/nginx.production.final.conf`
(см. `docker-compose.prod.secure.final.yml`).

### Docker Compose

```yaml
nginx:
  image: nginx:1.25-alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.production.final.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt/live/lgdeal.com/fullchain.pem:/etc/ssl/certs/fullchain.pem:ro
    - /etc/letsencrypt/live/lgdeal.com/privkey.pem:/etc/ssl/private/privkey.pem:ro
    - /etc/letsencrypt/live/lgdeal.com/chain.pem:/etc/ssl/certs/chain.pem:ro
  networks:
    - lgdx-network
  depends_on:
    - lgdx-server
    - lgdx-client
    - analytics-service
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

---

## 🧪 Тестирование конфигурации

### Проверка синтаксиса

```bash
# Проверка конфигурации
nginx -t

# Проверка с указанием файла
nginx -t -c /path/to/nginx.conf
```

### Проверки “после выката” (prod)

```bash
# Nginx health (в контейнере nginx)
curl -f http://localhost/health

# Главный API health (снаружи через reverse proxy)
curl -f https://lgdeal.com/health

# Логи nginx (Swarm)
docker service logs lgdx_nginx --tail 200
```

---

## 🚨 Troubleshooting

### Частые проблемы

#### 1. **502 Bad Gateway**
```bash
# Проверьте статус backend сервисов
docker service ls
docker service logs lgdx_lgdx-server

# Проверьте подключение
curl http://lgdx-server:5000/health
```

#### 2. **SSL ошибки**
```bash
# Проверьте сертификаты
openssl x509 -in /etc/ssl/certs/fullchain.pem -text -noout

# Проверьте приватный ключ
openssl rsa -in /etc/ssl/private/privkey.pem -check
```

#### 3. **Проблемы с кэшированием**
```bash
# Очистите кэш браузера
# Проверьте заголовки ответа
curl -I https://lgdeal.com/

# Если правили конфиг и нужно перечитать - обновляйте сервис в Swarm
docker service update --force lgdx_nginx
```

#### 4. **Rate limiting**
```bash
# Проверьте логи nginx (Swarm)
docker service logs lgdx_nginx --tail 200

# В prod лимиты заданы в `nginx/nginx.production.final.conf` (limit_req_zone + limit_req в конкретных location).
```

---

## 📈 Мониторинг (как есть в prod)

В текущей production-конфигурации Nginx:
- пишет access log в `/var/log/nginx/access.log` (внутри контейнера),
- пишет отдельные access logs для WebSocket:
  - `/var/log/nginx/socket-io.log`
  - `/var/log/nginx/websocket.log`
- **не** экспортирует метрики через `/nginx_metrics` и **не** включает `stub_status` endpoint.

Для метрик используйте Prometheus/Grafana стек (см. `info/18_Monitoring.md`, `info/19_Monitoring_Quick_Start.md`).

---

## 📚 Дополнительные ресурсы

- **Deployment (prod)**: [03_Production_Deployment.md](03_Production_Deployment.md)
- **Security**: [10_SECURITY.md](10_SECURITY.md)
- **Monitoring**: [18_Monitoring.md](18_Monitoring.md)
- **Troubleshooting**: [07_Troubleshooting.md](07_Troubleshooting.md)

---

## 🎯 Best Practices

### 1. **Безопасность**
- Используйте HTTPS везде
- Настройте security headers
- Ограничивайте rate limiting
- Регулярно обновляйте SSL сертификаты

### 2. **Производительность**
- Включите gzip сжатие
- Настройте кэширование
- Используйте keep-alive соединения
- Оптимизируйте upstream конфигурацию

### 3. **Мониторинг**
- Настройте логирование
- Мониторьте метрики производительности
- Настройте алерты
- Регулярно проверяйте статус

### 4. **Обслуживание**
- Регулярно тестируйте конфигурацию
- Планируйте обновления
- Создавайте бэкапы конфигурации
- Документируйте изменения

---
