param(
  [Parameter(Mandatory = $false)]
  [string]$SshTarget = "root@49.13.160.126",

  [Parameter(Mandatory = $false)]
  [string]$StackName = "lgdx",

  [Parameter(Mandatory = $false)]
  [string]$GrafanaServiceName = "lgdx_grafana",

  [Parameter(Mandatory = $false)]
  [ValidateSet("grafana", "all-safe")]
  [string]$Mode = "grafana"
)

$ErrorActionPreference = "Stop"

function Invoke-RemoteBash([string]$Script) {
  $normalized = $Script.Replace("`r", "")
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
  $b64 = [System.Convert]::ToBase64String($bytes)
  # Decode and execute on remote host (no local *nix tooling required)
  ssh $SshTarget "echo '$b64' | base64 -d | bash"
}

Write-Host "== LGDX production secrets rotation =="
Write-Host "Target: $SshTarget"
Write-Host "Mode:   $Mode"
Write-Host ""

if ($Mode -ne "grafana" -and $Mode -ne "all-safe") {
  throw "Unsupported mode: $Mode"
}

# v1: keep it intentionally small & safe
# - No JWT rotation (would invalidate sessions)
# - No DB/Redis/Rabbit rotation (requires coordinated server-side credential change)
# - No external provider token rotation (Stripe/Twilio/Telegram/OpenAI etc.)

if ($Mode -eq "grafana" -or $Mode -eq "all-safe") {
  Write-Host "-- Rotating Grafana admin password secret (Swarm) --"

  $remote = @'
set -euo pipefail

STACK_NAME="${STACK_NAME:-lgdx}"
GRAFANA_SERVICE_NAME="${GRAFANA_SERVICE_NAME:-lgdx_grafana}"

SECRETS_DIR="/root/lgdx-secrets"
SECRET_NAME="grafana_admin_password"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_secret="${SECRET_NAME}_tmp_${ts}"

mkdir -p "${SECRETS_DIR}"

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi active; then
  echo "ERROR: Docker Swarm is not active on server" >&2
  exit 1
fi

if ! docker service inspect "${GRAFANA_SERVICE_NAME}" >/dev/null 2>&1; then
  echo "ERROR: Service not found: ${GRAFANA_SERVICE_NAME}" >&2
  exit 1
fi

old_file="${SECRETS_DIR}/${SECRET_NAME}"
new_file="${SECRETS_DIR}/${SECRET_NAME}.new"

if [ -f "${old_file}" ]; then
  cp -f "${old_file}" "${old_file}.bak.${ts}"
fi

if command -v openssl >/dev/null 2>&1; then
  openssl rand -hex 16 > "${new_file}"
else
  head -c 32 /dev/urandom | xxd -p > "${new_file}"
fi
chmod 600 "${new_file}"
mv -f "${new_file}" "${old_file}"

# Create temporary secret from the new file
docker secret create "${tmp_secret}" "${old_file}" >/dev/null

echo "Switching ${GRAFANA_SERVICE_NAME} to temporary secret..."
docker service update \
  --secret-rm "${SECRET_NAME}" \
  --secret-add "source=${tmp_secret},target=${SECRET_NAME},uid=472,gid=0,mode=0400" \
  "${GRAFANA_SERVICE_NAME}" >/dev/null

echo "Waiting for ${GRAFANA_SERVICE_NAME} to converge..."
docker service ps "${GRAFANA_SERVICE_NAME}" --no-trunc --format '{{.CurrentState}} {{.Error}}' | head -n 5

# Recreate the stable secret name with the new value
echo "Recreating stable secret ${SECRET_NAME}..."
if docker secret inspect "${SECRET_NAME}" >/dev/null 2>&1; then
  docker secret rm "${SECRET_NAME}" >/dev/null
fi
docker secret create "${SECRET_NAME}" "${old_file}" >/dev/null

echo "Switching ${GRAFANA_SERVICE_NAME} back to stable secret..."
docker service update \
  --secret-rm "${tmp_secret}" \
  --secret-add "source=${SECRET_NAME},target=${SECRET_NAME},uid=472,gid=0,mode=0400" \
  "${GRAFANA_SERVICE_NAME}" >/dev/null

echo "Cleaning up temporary secret..."
docker secret rm "${tmp_secret}" >/dev/null || true

echo "OK: Grafana admin password rotated."
echo "NEW_GRAFANA_ADMIN_PASSWORD=$(cat "${old_file}")"
'@

  Invoke-RemoteBash (@"
export STACK_NAME='$StackName'
export GRAFANA_SERVICE_NAME='$GrafanaServiceName'
$remote
"@)
}

Write-Host ""
Write-Host "Done."
