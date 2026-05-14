Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "     LGDX Production Environment Logs (Local)" -ForegroundColor Cyan
Write-Host "             (Docker Swarm Mode)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Change to project root directory
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

Write-Host "Checking if LGDX stack is running..." -ForegroundColor Yellow
$stackExists = docker stack ls | Select-String "lgdx"
if (-not $stackExists) {
    Write-Host "❌ ERROR: LGDX production stack is not running!" -ForegroundColor Red
    Write-Host "Use 'scripts\win\prod-clean-rebuild-keep-data.bat' to start the production environment." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Available services:" -ForegroundColor Green
docker stack services lgdx --format "table {{.Name}}\t{{.Replicas}}\t{{.Image}}"
Write-Host ""
Write-Host "Examples:" -ForegroundColor Yellow
Write-Host "  - Press Enter for all services"
Write-Host "  - lgdx_lgdx-server for main server logs"
Write-Host "  - lgdx_api-sync-service for API sync logs"
Write-Host "  - lgdx_file-import-service for file import logs"
Write-Host "  - lgdx_market-price-calculator for calculator logs"
Write-Host "  - lgdx_backup-service for backup service logs"
Write-Host "  - lgdx_lgdx-client for client logs"
Write-Host "  - lgdx_rabbitmq for RabbitMQ logs"
Write-Host "  - lgdx_mongodb for MongoDB logs"
Write-Host "  - lgdx_redis for Redis logs"
Write-Host "  - lgdx_nginx for Nginx logs"
Write-Host ""

$service = Read-Host "Enter service name (or press Enter for all services)"

if ([string]::IsNullOrWhiteSpace($service)) {
    Write-Host "Showing logs for all services (Press Ctrl+C to exit):" -ForegroundColor Green
    Write-Host ""
    docker service logs -f lgdx_lgdx-server, lgdx_api-sync-service, lgdx_file-import-service, lgdx_market-price-calculator, lgdx_backup-service, lgdx_lgdx-client
} else {
    Write-Host "Showing logs for $service (Press Ctrl+C to exit):" -ForegroundColor Green
    Write-Host ""
    docker service logs -f $service
}