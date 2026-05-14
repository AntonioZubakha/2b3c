# WebSocket и real-time обновления (сделки и чат поддержки)

Документ описывает настройку и работу WebSocket в LGDX: **Socket.IO** для real-time обновлений в сделках и **нативный WebSocket** для чата поддержки. Учтены особенности **тестовой среды** (`docker-compose.prod.local.yml` + `nginx.production.conf`) и **боевого продакшена** (`docker-compose.prod.secure.final.yml` + `nginx.production.final.conf`).

---

## 1. Обзор каналов

| Назначение | Технология | Путь | Использование |
|------------|-------------|------|----------------|
| Обновления в сделках | Socket.IO | `/socket.io/` | Страница сделки: обновление стадии, инвойсов, доставки, статусов оплаты и т.д. |
| Чат поддержки | WebSocket (ws) | `/api/chat/ws` | Админ-панель → Chat Support: сообщения и типинг в реальном времени |

Клиент подключается к **текущему origin** (`window.location.origin`), поэтому за прокси (Nginx) отвечает один и тот же хост: на тесте — `http://localhost`, на продакшене — `https://lgdeal.com`.

---

## 2. Архитектура

- **Nginx** — единственная точка входа для браузера. Он проксирует:
  - `/socket.io/` → `lgdx-server:5000` (Socket.IO)
  - `/api/chat/ws` → `lgdx-server:5000` (WebSocket upgrade)
- **lgdx-server** — поднимает HTTP-сервер, на нём висят:
  - Socket.IO (path `/socket.io`, в т.ч. namespace `/deal` для сделок)
  - Chat WebSocket Server (path `/api/chat/ws`)

В **prod secure final** порты бэкенда наружу не пробрасываются: весь браузерный трафик идёт через Nginx.  
В **prod local** для удобства отладки `lgdx-server` может быть опубликован наружу (например, `5000:5000` в `docker-compose.prod.local.yml`), но для браузера по-прежнему рекомендуется ходить через Nginx (same-origin, cookies, WS-proxy).

---

## 3. Тестовая среда (prod local)

**Файлы:** `docker-compose.prod.local.yml`, `nginx/nginx.production.conf`

### 3.1. Сеть и сервисы

- Nginx слушает **80** (HTTP), без SSL.
- `BACKEND_HOST: lgdx-server` передаётся в Nginx; апстрим `backend` указывает на `lgdx-server:5000`.
- Сервер доступен только внутри overlay-сети; снаружи — только через Nginx.

### 3.2. Socket.IO (сделки)

- **Location:** `location /socket.io/`
- **Прокси:** `proxy_pass http://backend/socket.io/`
- **Важно:** `proxy_http_version 1.1`, `Upgrade` и `Connection` передаются для поддержки и long-polling, и WebSocket (если клиент переключится).
- В локальном Nginx используется фиксированное значение `Connection "upgrade"` (нет `map $http_upgrade $connection_upgrade`). Для текущего клиента, который использует только **polling**, этого достаточно.
- Таймауты: 60s (connect/send/read); при необходимости можно поднять для длинных сессий.

### 3.3. Чат поддержки (WebSocket)

- **Location:** `location /api/chat/ws`
- **Прокси:** `proxy_pass http://backend` (путь `/api/chat/ws` уходит на бэкенд как есть).
- Заголовки: `Upgrade`, `Connection "upgrade"`, передача `Host`, `X-Real-IP`, `X-Forwarded-*`, `Cookie` для авторизации.
- `proxy_buffering off` — обязательно для WebSocket.

### 3.4. Порядок location

В `nginx.production.conf` блоки WebSocket расположены **до** общего `location /api/`, чтобы запросы к `/socket.io/` и `/api/chat/ws` не обрабатывались общим API-блоком.

---

## 4. Боевой продакшен (final)

**Файлы:** `docker-compose.prod.secure.final.yml`, `nginx/nginx.production.final.conf`

### 4.1. Сеть и протокол

- Nginx слушает **443** (HTTPS), **http2 отключён** на виртуальном сервере приложения.
- Причина: Nginx не проксирует нативный WebSocket поверх HTTP/2; для upgrade нужен HTTP/1.1. Отключение `http2` гарантирует, что браузер и Nginx общаются по HTTP/1.1 и WebSocket (чат) и Socket.IO работают стабильно.

### 4.2. Connection upgrade (map)

В `http`-блоке задаётся:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

- Если клиент присылает `Upgrade` (WebSocket или Socket.IO upgrade) — Nginx подставляет `Connection: upgrade`.
- Если нет (например, Socket.IO в режиме **polling**) — `Connection: close`, что корректно для обычных HTTP-запросов и избегает проблем с кешированием/прокси.

В сделках клиент настроен на **только polling** (`transports: ['polling']`), поэтому стабильная работа не зависит от WebSocket upgrade через Nginx; при этом конфиг готов и к upgrade, если позже включить websocket-транспорт.

### 4.3. Socket.IO (сделки)

- **Location:** `location /socket.io/`
- **Прокси:** `proxy_pass http://backend/socket.io/`
- Заголовки: `Upgrade`, `Connection $connection_upgrade`, передача `Host`, `X-Real-IP`, `X-Forwarded-*`, `Cookie`.
- Таймауты увеличены: `proxy_connect_timeout 60s`, `proxy_send_timeout 3600s`, `proxy_read_timeout 3600s` — длинные сессии без обрыва по таймауту.
- `proxy_buffering off`, `proxy_request_buffering off` — как требуется для потокового/долгоживущего трафика.

Правило реврайта `^/socket\.io$ /socket.io/ last` обеспечивает, что запросы к `/socket.io` без слэша тоже попадают в этот location.

### 4.4. Чат поддержки (WebSocket)

- **Location:** `location /api/chat/ws`
- **Прокси:** `proxy_pass http://backend`
- Те же заголовки upgrade и передачи клиентских данных; таймауты 60s (для чата достаточно).

### 4.5. Порядок location и реврайты

- Блоки `/socket.io/` и `/api/chat/ws` объявлены **в начале** server-блока, до правил с `rewrite` и до `location /api/`.
- Реврайты для SEO (trailing slash и т.д.) не затрагивают `/socket.io/` и не создают циклов для WebSocket.

---

## 5. Клиентская настройка (сделки)

- **Хук:** `client/src/hooks/useSocket.ts`
- **URL:** `window.location.origin` (без явного порта), т.е. через Nginx.
- **Namespace для сделок:** по умолчанию используется **`/` (default namespace)**. Сервер также поддерживает namespace `/deal`, но текущая реализация клиента подписывается через `/` для максимальной совместимости.
- **Опции клиента:** `transports: ['polling']`, `withCredentials: true`, токен берётся из cookie `authToken` и передаётся в `auth.token`. Включены reconnection с ограничением попыток.

Страница сделки использует `useDealUpdates(dealId)`, который подписывается на события обновления сделки только при успешном подключении сокета (`hasSocket === true`), чтобы не показывать устаревшие данные.

---

## 6. Чат поддержки (клиент)

- Подключение к `wss://...` (на продакшене) или `ws://...` (на тесте) по тому же host, что и страница, путь `/api/chat/ws`.
- Авторизация через cookie; Nginx проксирует `Cookie` на бэкенд.

---

## 7. Краткое сравнение сред

| Аспект | prod local (тест) | prod secure final (боевой) |
|--------|-------------------|----------------------------|
| Протокол до Nginx | HTTP, порт 80 | HTTPS, порт 443, без http2 |
| `map $connection_upgrade` | Нет (Connection "upgrade") | Да (upgrade / close) |
| Socket.IO таймауты | 60s | 60s connect, 3600s send/read |
| Реврайты для `/socket.io` | Нет | Да (`/socket.io` → `/socket.io/`) |
| Trailing slash реврайты | Нет | Да, после WebSocket-блоков |

Оба варианта обеспечивают работу Socket.IO (сделки) и WebSocket (чат поддержки) через Nginx без прямого доступа к порту приложения.

---

## 8. Troubleshooting

- **Сделки не обновляются в реальном времени:** убедиться, что запросы к `/socket.io/` идут на тот же origin и возвращают 200; в консоли не должно быть постоянных `[useDealUpdates] useEffect skipped { hasSocket: false }` при открытой странице сделки. Проверить, что в Nginx нет реврайта/кэширования для `/socket.io/`.
- **Чат не подключается:** проверить, что `location /api/chat/ws` идёт до `location /api/`, и что на продакшене не включён http2 для этого server-блока.
- **Отваливается по таймауту:** на продакшене для `/socket.io/` уже стоят длинные `proxy_send_timeout`/`proxy_read_timeout` (3600s); на тесте при длинных сессиях можно поднять аналогично.

---

*Документ актуален для конфигов: `docker-compose.prod.local.yml`, `docker-compose.prod.secure.final.yml`, `nginx/nginx.production.conf`, `nginx/nginx.production.final.conf`.*
