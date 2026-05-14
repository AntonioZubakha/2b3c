@echo off
echo ===============================================
echo     LGDX Production Environment Status (Local)
echo              (Docker Swarm Mode)
echo ===============================================
echo.

cd /d "%~dp0\..\.."

echo 🔍 Docker Swarm Status:
docker node ls
echo.

echo 📊 LGDX Stack Status:
docker stack ls | findstr "lgdx"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ LGDX production stack is NOT running
    echo Use 'scripts\win\prod-clean-rebuild-keep-data.bat' to start the production environment (local).
    echo.
    pause
    exit /b 1
)
echo.

echo 🚀 Service Status:
docker stack services lgdx --format "table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}\t{{.Ports}}"
echo.

echo 🏥 Service Health:
for /f "delims=" %%i in ('docker stack services lgdx --format "{{.Name}}" 2^>nul') do (
    echo Checking %%i...
    docker service ps %%i --format "{{.Name}}\t{{.CurrentState}}" | more +1
    echo.
)

echo 🌐 Access URLs:
echo    • Frontend:      http://localhost
echo    • API:           http://localhost:5000  
echo    • Grafana:       http://localhost:3001 (admin/grafana)
echo    • Prometheus:    http://localhost:9090
echo    • RabbitMQ:      http://localhost:15672
echo    • Alertmanager:  http://localhost:9093
echo    • Nginx:         http://localhost:80
echo.

echo 📈 Resource Usage:
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo.

echo 🔐 Docker Secrets Status:
docker secret ls | findstr "lgdx_" >nul
if %ERRORLEVEL% EQU 0 (
    echo    ✅ Docker Secrets are configured
    docker secret ls | findstr "lgdx_"
) else (
    echo    ❌ No Docker Secrets found - using env vars
)
echo.

echo 🔧 Quick Commands:
echo    • View logs:        scripts\win\prod-logs.bat
echo    • Stop stack:       scripts\win\prod-stop.bat
echo    • Restart:          scripts\win\prod-clean-rebuild-keep-data.bat
echo    • Setup secrets:    scripts\win\prod-setup-docker-secrets.bat
echo    • Full rebuild:     scripts\win\prod-clean-rebuild-keep-data.bat
echo.
pause 