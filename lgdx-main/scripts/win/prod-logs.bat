@echo off
echo ===============================================
echo      LGDX Production Environment Logs (Local)
echo              (Docker Swarm Mode)
echo ===============================================
echo.

cd /d "%~dp0\..\.."

echo Checking if LGDX stack is running...
docker stack ls | findstr "lgdx" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: LGDX production stack is not running!
    echo Use 'scripts\win\prod-clean-rebuild-keep-data.bat' to start the production environment (local).
    echo.
    pause
    exit /b 1
)

echo Available services:
docker stack services lgdx --format "table {{.Name}}\t{{.Replicas}}\t{{.Image}}"
echo.
echo Examples:
echo   - Press Enter for all services
echo   - lgdx_lgdx-server for main server logs
echo   - lgdx_api-sync-service for API sync logs
echo   - lgdx_file-import-service for file import logs
echo   - lgdx_market-price-calculator for calculator logs
echo   - lgdx_backup-service for backup service logs
echo   - lgdx_lgdx-client for client logs
echo   - lgdx_rabbitmq for RabbitMQ logs
echo   - lgdx_mongodb for MongoDB logs
echo   - lgdx_redis for Redis logs
echo   - lgdx_nginx for Nginx logs
echo.

echo Enter service name (or press Enter for all services):
set /p SERVICE=

if "%SERVICE%"=="" (
    echo Showing logs for all services (Press Ctrl+C to exit):
    echo.
    docker service logs -f lgdx_lgdx-server lgdx_api-sync-service lgdx_file-import-service lgdx_market-price-calculator lgdx_backup-service lgdx_lgdx-client
) else (
    echo Showing logs for %SERVICE% (Press Ctrl+C to exit):
    echo.
    docker service logs -f %SERVICE%
) 