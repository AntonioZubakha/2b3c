# Rebuilds lgdx-server image and redeploys the local Swarm stack.
# .env is NOT read by "docker stack deploy" - Telegram MTProto keys live in
#   config/stack-local-secrets/telegram_user_api_id
#   config/stack-local-secrets/telegram_user_api_hash
# (see config/stack-local-secrets/README.md)
param(
  [string] $StackName = "lgdx",
  [string] $ComposeFile = "docker-compose.prod.local.yml"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$required = @(
  "config/stack-local-secrets/telegram_user_api_id",
  "config/stack-local-secrets/telegram_user_api_hash"
)
foreach ($f in $required) {
  if (-not (Test-Path $f)) {
    throw "Missing $f. Copy from README in config/stack-local-secrets/ and set real api_id and api_hash from https://my.telegram.org"
  }
}

Write-Host "Building lgdx-lgdx-server:latest ..." -ForegroundColor Cyan
docker build -t lgdx-lgdx-server:latest -f server/Dockerfile server
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Deploying stack $StackName ..." -ForegroundColor Cyan
docker stack deploy -c $ComposeFile $StackName
if ($LASTEXITCODE -ne 0) { throw "stack deploy failed" }

Write-Host "Done. Check: docker service ps ${StackName}_telegram-user-worker" -ForegroundColor Green
Write-Host "Logs:  docker service logs -f ${StackName}_telegram-user-worker --tail 80" -ForegroundColor Green
