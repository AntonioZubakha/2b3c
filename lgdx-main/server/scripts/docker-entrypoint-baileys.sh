#!/bin/sh
# Baileys persists session under WHATSAPP_BAILEYS_AUTH_DIR. Docker named volumes are
# root-owned; the worker must run as appuser (1001) at runtime — fix ownership once at start.
set -e
DIR="${WHATSAPP_BAILEYS_AUTH_DIR:-/data/auth_baileys}"
mkdir -p "$DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R appuser:nodejs "$DIR"
  exec su-exec appuser:nodejs "$@"
fi
exec "$@"