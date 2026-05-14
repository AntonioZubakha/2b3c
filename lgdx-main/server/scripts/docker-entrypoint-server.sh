#!/bin/sh
# Fix bind-mount permissions for API: root chowns ./server/uploads → 1001, then su-exec Node.
# Workers (same image, user 1001, no uploads volume) must NOT mkdir on /app/uploads — skip unless root.
set -e

up="${UPLOAD_PATH:-./uploads}"
case "$up" in
  /*) UP_ABS="$up" ;;
  ./*) UP_ABS="/app/${up#./}" ;;
  *) UP_ABS="/app/$up" ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UP_ABS/invoices"
  chown -R 1001:1001 "$UP_ABS" 2>/dev/null || true
  exec su-exec 1001:1001 "$@"
fi

exec "$@"
