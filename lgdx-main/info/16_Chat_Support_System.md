# 💬 Chat Support System (актуально по `server/src/routes/chatRoutes.ts` и `server/src/services/chatWebSocketService.ts`)

## 🎯 Назначение

Чат поддержки в LGDX — это:

- **REST API** для создания/получения сессий и истории сообщений.
- **WebSocket (ws)** для real-time сообщений/typing в админ‑панели и пользовательском виджете.
- **Telegram**: опциональное дублирование сообщений чата в канал (через `server/src/services/telegramService.ts`).
- **AI replies**: опционально, управляется настройками и ключами AI (см. `server/src/services/chatAiService.ts`).

## 🔐 Модель доступа

### Authenticated chat

- Доступ к `/api/chat/*` (кроме guest) — через `authMiddleware`.
- Основной механизм auth: **HttpOnly cookie `authToken`**.

### Guest chat

- Guest сессии создаются публично, но чтение/отправка сообщений требует **guest токен**.
- Токен хранится в cookie: **`guestChatToken`** (`server/src/middleware/guestChatAuth.ts`).
- Также поддерживается `Authorization: Bearer <guestChatToken>` (для non-browser клиентов).

## 🔧 REST API

Источник истины: `server/src/routes/chatRoutes.ts`.

### Guest endpoints

- **POST** `/api/chat/guest/session` — создать/получить гостевую сессию (rate limit)
- **GET** `/api/chat/guest/messages/:sessionId` — получить сообщения (требует `guestChatToken`)
- **POST** `/api/chat/guest/send` — отправить сообщение (требует `guestChatToken`)

Пример (curl) гостевого флоу:

```bash
# 1) создать/получить session (сервер выставит Set-Cookie: guestChatToken=...)
curl -i -X POST "http://localhost:5001/api/chat/guest/session"

# 2) получить сообщения, передав cookie
curl -s "http://localhost:5001/api/chat/guest/messages/<sessionId>" ^
  -b "guestChatToken=<TOKEN>"

# 3) отправить сообщение гостем
curl -s -X POST "http://localhost:5001/api/chat/guest/send" ^
  -H "Content-Type: application/json" ^
  -b "guestChatToken=<TOKEN>" ^
  -d "{\"sessionId\":\"<sessionId>\",\"text\":\"Hello\"}"
```

### Authenticated endpoints

- **POST** `/api/chat/session` — создать/получить сессию пользователя (для новых пользователей &lt; 24 ч автоматически создаётся приветственное сообщение онбординга, см. раздел «Онбординг чат»)
- **GET** `/api/chat/messages/:sessionId` — получить сообщения
- **POST** `/api/chat/send` — отправить сообщение
- **PUT** `/api/chat/read/:sessionId` — отметить как прочитанные
- **GET** `/api/chat/unread-count` — количество непрочитанных
- **POST** `/api/chat/onboarding/init` — проверить, нужно ли авто-открыть чат для нового пользователя (см. «Онбординг чат»)

Support/admin UI:

- **GET** `/api/chat/sessions` — список сессий
- **PUT** `/api/chat/close/:sessionId` — закрыть сессию
- **GET** `/api/chat/ai-settings` — глобальные настройки AI
- **PUT** `/api/chat/ai-settings` — изменить глобальные настройки AI
- **PUT** `/api/chat/session/:sessionId/ai` — включить/выключить AI на уровне сессии

### Онбординг чат (новые пользователи)

Для пользователей, зарегистрированных **менее 24 часов** назад:

1. **POST** `/api/chat/onboarding/init` (authenticated) возвращает:
   - `shouldAutoOpenChat: boolean` — открыть виджет чата сразу при загрузке страницы
   - `sessionId: string` — id сессии (если есть/создана)
   - `onboardingWelcomeCreated: boolean` — было ли только что создано приветственное сообщение

2. При первом **POST** `/api/chat/session` для такого пользователя сервер создаёт сессию и добавляет **одно** приветственное сообщение от support (идемпотентно) c текстом:
   - `Greetings from lgdeal.com!`
   - `My name is Glead, I'm an account manager at LGDeal.`
   - `You've recently registered on our Lab-Grown Diamond Exchange Network.`
   - `Please let me know in case of any questions.`

3. **Фронтенд** (`client/src/components/Chat/`):
   - После входа `ChatToggle` вызывает `POST /api/chat/onboarding/init`. Если `shouldAutoOpenChat === true`, чат открывается автоматически.
   - `ChatWidget` работает как обычный диалог без quick actions: пользователь сразу пишет свободным текстом, как в чате с сотрудником поддержки.
   - Для AI-ответов на сервере добавлена случайная задержка **2–7 секунд** для более естественного ритма переписки.
   - Ссылка на демо (`https://lgdeal.com/#schedule-demo`) не отправляется в первом AI-ответе: она добавляется во **2-й или 3-й** ответ (случайно, один раз в рамках раннего диалога).

Окно онбординга: **24 часа** с момента `user.createdAt` (константа в `server/src/controllers/chatController.ts`).

## 🌐 WebSocket (ws) API

### Endpoint

- **GET** `/api/chat/ws` — апгрейд до WebSocket (через Nginx proxy).
- Серверный path: `/api/chat/ws` (см. `server/src/services/chatWebSocketService.ts`).
- Аутентификация для ws: **cookie `authToken`** (гостевой ws не поддерживается).

### Формат сообщений (client → server)

Сообщения — JSON:

```json
{
  "type": "join_session|leave_session|message|typing",
  "sessionId": "optional",
  "isTyping": true,
  "message": {
    "sessionId": "optional",
    "text": "optional"
  }
}
```

Поведение по коду:

- При подключении сервер **аутентифицирует** пользователя из cookies и может **автоматически присоединить к активной сессии**.
- `join_session`/`leave_session` управляют подпиской на конкретную сессию.
- `typing` транслируется участникам сессии.

## 🗄️ Модели данных (MongoDB, gateway)

Источник истины: `server/src/models/ChatSession.ts`, `server/src/models/ChatMessage.ts`.

### ChatSession (`chatsessions`)

- `userId?: ObjectId | null` — logged-in пользователь (для guest = `null`)
- `guestId?: string`, `isGuest?: boolean`
- `status: 'active' | 'waiting' | 'closed'`
- `assignedTo?: ObjectId` — support agent
- `priority: 'low' | 'medium' | 'high' | 'urgent'`
- `aiEnabled?: boolean` — per-session флаг (default `true`)
- `lastMessageAt?: Date`, `closedAt?: Date`
- `metadata?: { userAgent?, ipAddress?, referrer?, pageUrl? }`

### ChatMessage (`chatmessages`)

- `sessionId: ObjectId`
- `sender: 'user' | 'support'`
- `senderId?: ObjectId` (обычно для support сообщений)
- `text: string`
- `messageType: 'text' | 'image' | 'file' | 'system'`
- `attachments?: [{ type: 'image'|'file', url, name, size?, mimeType? }]`
- `isRead`, `readAt?`, `isEdited`, `editedAt?`, `replyTo?`
- `metadata?: { deliveryStatus?: 'sent'|'delivered'|'failed', isAi?: boolean, isOnboardingWelcome?: boolean }` — `isOnboardingWelcome: true` у единственного приветственного сообщения онбординга (используется на фронте для показа Quick actions)

## 🔔 Telegram / AI (фактические интеграции)

- **Telegram**: `server/src/services/telegramService.ts` (в т.ч. `sendChatChannelMessage`)
- **AI**: `server/src/services/chatAiService.ts` (включается ключами AI и настройками)

## 🚨 Troubleshooting (проверки по коду)

- **WS не подключается**:
  - убедиться, что запрос идёт на тот же origin, что и сайт (через Nginx), и что cookie `authToken` передаётся;
  - проверить Nginx location для `/api/chat/ws` (см. `info/15_WebSocket_Real_Time_Updates.md`).
- **Guest запросы 401**:
  - нет `guestChatToken` (cookie) или токен просрочен (TTL 7d).

---

*Последнее обновление: 2026-03 (сверено по `server/src/routes/chatRoutes.ts`, `server/src/controllers/chatController.ts`, `server/src/middleware/guestChatAuth.ts`, `server/src/services/chatWebSocketService.ts`, `server/src/models/ChatSession.ts`, `server/src/models/ChatMessage.ts`, `client/src/components/Chat/ChatToggle.tsx`, `client/src/components/Chat/ChatWidget.tsx`).*
