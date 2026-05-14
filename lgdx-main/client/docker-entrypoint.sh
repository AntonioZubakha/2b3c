#!/bin/sh
# Entrypoint script для чтения Docker secrets и инжекции в React приложение

set -e

# Читаем GA Measurement ID из Docker secret или переменной окружения
if [ -f "/run/secrets/ga_measurement_id" ]; then
  GA_MEASUREMENT_ID=$(cat /run/secrets/ga_measurement_id | tr -d '\n\r ')
elif [ -n "$REACT_APP_GA_MEASUREMENT_ID" ]; then
  GA_MEASUREMENT_ID="$REACT_APP_GA_MEASUREMENT_ID"
else
  GA_MEASUREMENT_ID=""
fi

# Создаем JavaScript файл с конфигурацией для runtime
if [ -n "$GA_MEASUREMENT_ID" ]; then
  cat > /usr/share/nginx/html/env-config.js <<EOF
window.env = {
  REACT_APP_GA_MEASUREMENT_ID: "$GA_MEASUREMENT_ID"
};
EOF
else
  cat > /usr/share/nginx/html/env-config.js <<EOF
window.env = {
  REACT_APP_GA_MEASUREMENT_ID: ""
};
EOF
fi

echo "✅ Runtime configuration created"
if [ -n "$GA_MEASUREMENT_ID" ]; then
  echo "✅ Google Analytics Measurement ID configured"
else
  echo "ℹ️  Google Analytics not configured (this is OK for local/dev)"
fi

# Запускаем nginx
exec nginx -g "daemon off;"
