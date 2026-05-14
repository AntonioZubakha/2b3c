@echo off
echo ===============================================
echo     LGDX Production Clean ^& Rebuild (Local - Keep Data)
echo ===============================================
echo.

echo ⚠️  WARNING: This will delete ALL LGDX production containers and images!
echo 📊 DATABASE DATA WILL BE PRESERVED!
echo.
set /p confirm="Type 'YES' to continue: "
if not "%confirm%"=="YES" (
    echo ❌ Operation cancelled
    pause
    exit /b 1
)

REM Always run from repo root (compose paths, file-processing dirs, etc.)
cd /d "%~dp0\..\.."

echo.
echo 🧹 Starting cleanup process...
echo.

REM Check if Docker Swarm is active
docker info | findstr "Swarm: active" >nul
if errorlevel 1 (
    echo ❌ Docker Swarm is not active!
    echo Please run: docker swarm init
    pause
    exit /b 1
)

echo ✅ Docker Swarm is active
echo.

REM Remove LGDX stack
echo 📦 Removing LGDX stack...
docker stack rm lgdx 2>nul

REM Wait for stack removal with verification
echo ⏳ Waiting for stack removal...
:wait_removal
timeout /t 5 /nobreak >nul
docker stack ls | findstr "lgdx" >nul
if not errorlevel 1 (
    echo ⏳ Still removing stack, waiting...
    goto wait_removal
)
echo ✅ Stack removed successfully

REM Remove all LGDX production images
echo 🗑️ Removing production images...
docker rmi lgdx-lgdx-server:latest 2>nul
docker rmi lgdx-lgdx-client:latest 2>nul
docker rmi lgdx-api-sync-service:latest 2>nul
docker rmi lgdx-file-import-service:latest 2>nul
docker rmi lgdx-market-price-calculator:latest 2>nul
docker rmi lgdx-backup-service:latest 2>nul
docker rmi lgdx-ftp-sync-service:latest 2>nul
docker rmi lgdx-analytics-service:latest 2>nul
docker rmi lgdx-legacy-ftp-poller:latest 2>nul

REM Remove dangling images and containers (but NOT volumes)
echo 🧽 Cleaning up dangling resources...
docker system prune -f
docker container prune -f
docker image prune -f
REM NOTE: docker volume prune -f is REMOVED to preserve data
REM NOTE: Do not "docker network rm" external stack networks here.
REM       After stack rm, `docker system prune` removes unused overlay networks;
REM       compose declares them as external, so they MUST be recreated before deploy (see below).

REM Clean build cache completely
echo 🧹 Cleaning Docker build cache...
docker builder prune -f

echo.
echo ✅ Cleanup completed! (Database data preserved)
echo.

echo 🔨 Starting fresh build (no cache)...
echo.

REM Check Docker secrets
echo 🔐 Checking Docker secrets...

REM Required secrets list
set secrets=lgdx_jwt_secret lgdx_admin_secret_key lgdx_mongodb_password lgdx_mongodb_uri lgdx_rabbitmq_password lgdx_rabbitmq_url lgdx_redis_password lgdx_redis_url lgdx_telegram_bot_token lgdx_stock_telegram_bot_token lgdx_telegram_chat_id lgdx_stock_telegram_chat_id lgdx_registration_telegram_bot_token lgdx_registration_telegram_chat_id lgdx_system_monitoring_bot_token lgdx_system_monitoring_chat_id lgdx_twilio_account_sid lgdx_twilio_auth_token lgdx_twilio_verify_service_sid lgdx_oil_price_api lgdx_gemini_api_key lgdx_smtp_pass

for %%s in (%secrets%) do (
    docker secret ls | findstr "%%s" >nul
    if errorlevel 1 (
        echo ❌ Secret not found: %%s
        echo Please run: scripts\win\prod-setup-docker-secrets.bat
        pause
        exit /b 1
    )
)

echo ✅ All secrets are available
echo.

REM Ensure required bind-mount directories exist (avoid "path does not exist" on deploy)
echo 📁 Ensuring required directories exist...
if not exist "file-processing\reports" mkdir file-processing\reports
if not exist "file-processing\processed" mkdir file-processing\processed
if not exist "file-processing\failed" mkdir file-processing\failed
if not exist "analytics-service\logs" mkdir analytics-service\logs
if not exist "ssl" mkdir ssl
echo ✅ Directories ready
echo.

REM Build production images (without cache)
echo 📦 Building production images (no cache)...
docker build --no-cache -t lgdx-lgdx-server:latest ./server
if errorlevel 1 (
    echo ❌ Failed to build server image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-lgdx-client:latest -f ./client/Dockerfile.local ./client
if errorlevel 1 (
    echo ❌ Failed to build client image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-api-sync-service:latest ./api-product-sync-service
if errorlevel 1 (
    echo ❌ Failed to build API sync service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-file-import-service:latest ./file-product-import-service
if errorlevel 1 (
    echo ❌ Failed to build file import service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-market-price-calculator:latest ./market-price-calculator-service
if errorlevel 1 (
    echo ❌ Failed to build market price calculator service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-backup-service:latest ./backup-service
if errorlevel 1 (
    echo ❌ Failed to build backup service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-ftp-sync-service:latest ./ftp-product-sync-service
if errorlevel 1 (
    echo ❌ Failed to build FTP sync service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-analytics-service:latest ./analytics-service
if errorlevel 1 (
    echo ❌ Failed to build analytics service image!
    pause
    exit /b 1
)

docker build --no-cache -t lgdx-legacy-ftp-poller:latest ./legacy-ftp-poller-service
if errorlevel 1 (
    echo ❌ Failed to build legacy FTP poller image!
    pause
    exit /b 1
)

echo ✅ Images built successfully
echo.

REM Final cleanup check before deployment
echo 🔍 Final cleanup check...
docker service ls | findstr "lgdx" >nul
if not errorlevel 1 (
    echo ⚠️  Found remaining LGDX services, removing...
    for /f "tokens=*" %%i in ('docker service ls -q ^| findstr "lgdx"') do docker service rm %%i
    timeout /t 5 /nobreak >nul
)

REM External overlay networks are required by docker-compose.prod.local.yml; prune/stack rm may delete them.
echo 🌐 Ensuring Swarm overlay networks...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-lgdx-local-stack-networks.ps1"
if errorlevel 1 (
    echo ❌ Failed to create overlay networks. Is Swarm initialized? Try: docker swarm init
    pause
    exit /b 1
)

REM Deploy stack
echo 🚀 Deploying LGDX stack...
docker stack deploy -c docker-compose.prod.local.yml lgdx

if errorlevel 1 (
    echo ❌ Failed to deploy stack!
    echo 🔍 Checking for conflicts...
    docker service ls | findstr "lgdx"
    echo.
    echo 💡 Try running: docker service rm $(docker service ls -q)
    pause
    exit /b 1
)

echo.
echo ⏳ Waiting for MongoDB and core services (60s)...
timeout /t 60 /nobreak >nul

REM Analytics and FTP often fail on first start (ENOTFOUND lgdx_mongodb) - restart after MongoDB is up
echo 🔁 Restarting analytics-service and ftp-service (so they connect to MongoDB)...
docker service update --force lgdx_analytics-service
docker service update --force lgdx_ftp-service

echo ⏳ Waiting for analytics and ftp to become ready (45s)...
timeout /t 45 /nobreak >nul

REM Nginx waits for analytics in its entrypoint; force refresh so it picks up DNS
echo 🔁 Restarting nginx to pick up upstreams...
docker service update --force lgdx_nginx

echo ⏳ Final wait (20s)...
timeout /t 20 /nobreak >nul

echo.
echo 📊 Checking service status...
docker stack services lgdx

echo.
echo ================================================
echo ✅ Production environment rebuilt successfully! (Local)
echo 📊 Database data has been preserved!
echo ================================================
echo.
echo 🌐 Access URLs:
echo    Application: http://localhost
echo    API:        http://localhost:5000
echo    Analytics:  http://localhost:9200
echo    FTP Health:  http://localhost:3002/health
echo    FTP Server:  ftp://localhost:21
echo    MongoDB:    localhost:27020
echo    Redis:      localhost:6379
echo    RabbitMQ:   http://localhost:15672
echo.
echo 📋 Useful commands:
echo    View logs:   scripts\win\prod-logs.bat
echo    Check status: scripts\win\prod-status.bat
echo    Stop:        scripts\win\prod-stop.bat
echo.

pause 