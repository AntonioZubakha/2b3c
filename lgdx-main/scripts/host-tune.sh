#!/bin/bash
#
# host-tune.sh — настройка хоста под прод-нагрузку MongoDB (и в целом под Docker Swarm).
#
# Запускать от root один раз на каждой ноде кластера (на manager-ноде, где живёт mongodb,
# обязательно). Изменения применяются runtime + persist в /etc/sysctl.d/99-lgdx.conf.
#
# Что делает:
#   1. vm.max_map_count = 1677720
#      Устраняет startup warning MongoDB:
#        "vm.max_map_count is too low: 1048576 vs recommended 1677720"
#      Низкое значение ограничивает число одновременных connection'ов
#      и memory mapping'ов WiredTiger.
#   2. vm.swappiness = 1
#      Минимизирует swap-out для in-memory БД (рекомендация MongoDB).
#   3. Disable Transparent Huge Pages (THP) hint (только проверка).
#      MongoDB рекомендует отключить THP, но это требует systemd-юнита,
#      поэтому здесь только сообщение, если включено.
#
# Использование:
#   sudo bash scripts/host-tune.sh
#
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: запусти от root: sudo bash scripts/host-tune.sh"
  exit 1
fi

CONF_FILE="/etc/sysctl.d/99-lgdx.conf"

echo "[host-tune] Применяю sysctl runtime..."
sysctl -w vm.max_map_count=1677720
sysctl -w vm.swappiness=1

echo "[host-tune] Сохраняю в ${CONF_FILE} для persist..."
cat > "${CONF_FILE}" <<'EOF'
# Managed by lgdx scripts/host-tune.sh
# MongoDB recommended tunings for production
vm.max_map_count = 1677720
vm.swappiness = 1
EOF

sysctl -p "${CONF_FILE}" >/dev/null

echo "[host-tune] Текущие значения:"
sysctl vm.max_map_count vm.swappiness

# Информационная проверка THP
THP_FILE="/sys/kernel/mm/transparent_hugepage/enabled"
if [[ -r "${THP_FILE}" ]]; then
  THP_STATE=$(cat "${THP_FILE}")
  echo "[host-tune] Transparent Huge Pages: ${THP_STATE}"
  if [[ "${THP_STATE}" != *"[never]"* ]]; then
    echo "[host-tune] WARN: MongoDB рекомендует отключить THP (см. https://www.mongodb.com/docs/manual/tutorial/transparent-huge-pages/)."
    echo "             Сейчас НЕ отключаем автоматически (требуется systemd unit + reboot)."
  fi
fi

echo "[host-tune] Готово. Перезапусти стек, чтобы Mongo подхватил настройки:"
echo "             docker service update --force lgdx_mongodb"
