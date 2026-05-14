# Secrets for `docker-compose.prod.local.yml` (stack deploy)

`docker stack deploy` **does not read** a project `.env` file. Telegram MTProto (user session / QR) credentials are passed as **Docker secret files** referenced in the compose file.

## Telegram user session (QR in admin)

1. Open [my.telegram.org](https://my.telegram.org) → API development tools → create an app.
2. Put the **numeric** `api_id` in `telegram_user_api_id` (single line, no spaces).
3. Put the **api_hash** string in `telegram_user_api_hash` (single line).

Then redeploy the stack (or only update the `telegram-user-worker` service) so the worker picks up the new secrets.

Without valid credentials the worker will stay **disconnected** and the admin panel will not show a real QR.
