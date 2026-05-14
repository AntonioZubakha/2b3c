@echo off
echo ===============================================
echo     LGDX Docker Secrets Setup
echo ===============================================
echo.

REM Check if running in swarm mode
docker info | findstr "Swarm: active" >nul
if errorlevel 1 (
    echo ❌ Docker Swarm is not active!
    echo Please run: docker swarm init
    pause
    exit /b 1
)

echo ✅ Docker Swarm is active
echo.

REM Check if secrets directory exists
if not exist "docker-secrets" (
    echo ❌ docker-secrets directory not found!
    echo Please run: node scripts\generate-secrets.js
    pause
    exit /b 1
)

echo Creating Docker secrets from files...
echo.

REM Create secrets
if exist "docker-secrets\jwt_secret" (
    echo Creating secret: lgdx_jwt_secret
    docker secret create lgdx_jwt_secret docker-secrets\jwt_secret 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_jwt_secret
    ) else (
        echo ✅ Secret created: lgdx_jwt_secret
    )
)

if exist "docker-secrets\admin_secret_key" (
    echo Creating secret: lgdx_admin_secret_key
    docker secret create lgdx_admin_secret_key docker-secrets\admin_secret_key 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_admin_secret_key
    ) else (
        echo ✅ Secret created: lgdx_admin_secret_key
    )
)

if exist "docker-secrets\grafana_admin_user" (
    echo Creating secret: grafana_admin_user
    docker secret create grafana_admin_user docker-secrets\grafana_admin_user 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: grafana_admin_user
    ) else (
        echo ✅ Secret created: grafana_admin_user
    )
)

if exist "docker-secrets\grafana_admin_password" (
    echo Creating secret: grafana_admin_password
    docker secret create grafana_admin_password docker-secrets\grafana_admin_password 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: grafana_admin_password
    ) else (
        echo ✅ Secret created: grafana_admin_password
    )
)

if exist "docker-secrets\mongodb_password" (
    echo Creating secret: lgdx_mongodb_password
    docker secret create lgdx_mongodb_password docker-secrets\mongodb_password 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_mongodb_password
    ) else (
        echo ✅ Secret created: lgdx_mongodb_password
    )
)

if exist "docker-secrets\mongodb_uri" (
    echo Creating secret: lgdx_mongodb_uri
    docker secret create lgdx_mongodb_uri docker-secrets\mongodb_uri 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_mongodb_uri
    ) else (
        echo ✅ Secret created: lgdx_mongodb_uri
    )
)

if exist "docker-secrets\rabbitmq_password" (
    echo Creating secret: lgdx_rabbitmq_password
    docker secret create lgdx_rabbitmq_password docker-secrets\rabbitmq_password 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_rabbitmq_password
    ) else (
        echo ✅ Secret created: lgdx_rabbitmq_password
    )
)

if exist "docker-secrets\rabbitmq_url" (
    echo Creating secret: lgdx_rabbitmq_url
    docker secret create lgdx_rabbitmq_url docker-secrets\rabbitmq_url 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_rabbitmq_url
    ) else (
        echo ✅ Secret created: lgdx_rabbitmq_url
    )
)

if exist "docker-secrets\redis_password" (
    echo Creating secret: lgdx_redis_password
    docker secret create lgdx_redis_password docker-secrets\redis_password 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_redis_password
    ) else (
        echo ✅ Secret created: lgdx_redis_password
    )
)

if exist "docker-secrets\redis_url" (
    echo Creating secret: lgdx_redis_url
    docker secret create lgdx_redis_url docker-secrets\redis_url 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_redis_url
    ) else (
        echo ✅ Secret created: lgdx_redis_url
    )
)

if exist "docker-secrets\telegram_bot_token" (
    echo Creating secret: lgdx_telegram_bot_token
    docker secret create lgdx_telegram_bot_token docker-secrets\telegram_bot_token 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_telegram_bot_token
    ) else (
        echo ✅ Secret created: lgdx_telegram_bot_token
    )
)

if exist "docker-secrets\stock_telegram_bot_token" (
    echo Creating secret: lgdx_stock_telegram_bot_token
    docker secret create lgdx_stock_telegram_bot_token docker-secrets\stock_telegram_bot_token 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_stock_telegram_bot_token
    ) else (
        echo ✅ Secret created: lgdx_stock_telegram_bot_token
    )
)

if exist "docker-secrets\oil_price_api" (
    echo Creating secret: lgdx_oil_price_api
    docker secret create lgdx_oil_price_api docker-secrets\oil_price_api 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_oil_price_api
    ) else (
        echo ✅ Secret created: lgdx_oil_price_api
    )
)

if exist "docker-secrets\gemini_api_key" (
    echo Creating secret: lgdx_gemini_api_key
    docker secret create lgdx_gemini_api_key docker-secrets\gemini_api_key 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_gemini_api_key
    ) else (
        echo ✅ Secret created: lgdx_gemini_api_key
    )
)

if exist "docker-secrets\smtp_pass" (
    echo Creating secret: lgdx_smtp_pass
    docker secret create lgdx_smtp_pass docker-secrets\smtp_pass 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_smtp_pass
    ) else (
        echo ✅ Secret created: lgdx_smtp_pass
    )
)

if exist "docker-secrets\telegram_chat_id" (
    echo Creating secret: lgdx_telegram_chat_id
    docker secret create lgdx_telegram_chat_id docker-secrets\telegram_chat_id 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_telegram_chat_id
    ) else (
        echo ✅ Secret created: lgdx_telegram_chat_id
    )
)

if exist "docker-secrets\stock_telegram_chat_id" (
    echo Creating secret: lgdx_stock_telegram_chat_id
    docker secret create lgdx_stock_telegram_chat_id docker-secrets\stock_telegram_chat_id 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_stock_telegram_chat_id
    ) else (
        echo ✅ Secret created: lgdx_stock_telegram_chat_id
    )
)

if exist "docker-secrets\registration_telegram_bot_username" (
    echo Creating secret: lgdx_registration_telegram_bot_username
    docker secret create lgdx_registration_telegram_bot_username docker-secrets\registration_telegram_bot_username 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_registration_telegram_bot_username
    ) else (
        echo ✅ Secret created: lgdx_registration_telegram_bot_username
    )
)

if exist "docker-secrets\registration_telegram_bot_token" (
    echo Creating secret: lgdx_registration_telegram_bot_token
    docker secret create lgdx_registration_telegram_bot_token docker-secrets\registration_telegram_bot_token 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_registration_telegram_bot_token
    ) else (
        echo ✅ Secret created: lgdx_registration_telegram_bot_token
    )
)

if exist "docker-secrets\registration_telegram_chat_id" (
    echo Creating secret: lgdx_registration_telegram_chat_id
    docker secret create lgdx_registration_telegram_chat_id docker-secrets\registration_telegram_chat_id 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_registration_telegram_chat_id
    ) else (
        echo ✅ Secret created: lgdx_registration_telegram_chat_id
    )
)

if exist "docker-secrets\system_monitoring_bot_token" (
    echo Creating secret: lgdx_system_monitoring_bot_token
    docker secret create lgdx_system_monitoring_bot_token docker-secrets\system_monitoring_bot_token 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_system_monitoring_bot_token
    ) else (
        echo ✅ Secret created: lgdx_system_monitoring_bot_token
    )
)

if exist "docker-secrets\system_monitoring_chat_id" (
    echo Creating secret: lgdx_system_monitoring_chat_id
    docker secret create lgdx_system_monitoring_chat_id docker-secrets\system_monitoring_chat_id 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_system_monitoring_chat_id
    ) else (
        echo ✅ Secret created: lgdx_system_monitoring_chat_id
    )
)

if exist "docker-secrets\twilio_account_sid" (
    echo Creating secret: lgdx_twilio_account_sid
    docker secret create lgdx_twilio_account_sid docker-secrets\twilio_account_sid 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_twilio_account_sid
    ) else (
        echo ✅ Secret created: lgdx_twilio_account_sid
    )
)

if exist "docker-secrets\twilio_auth_token" (
    echo Creating secret: lgdx_twilio_auth_token
    docker secret create lgdx_twilio_auth_token docker-secrets\twilio_auth_token 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_twilio_auth_token
    ) else (
        echo ✅ Secret created: lgdx_twilio_auth_token
    )
)

if exist "docker-secrets\twilio_verify_service_sid" (
    echo Creating secret: lgdx_twilio_verify_service_sid
    docker secret create lgdx_twilio_verify_service_sid docker-secrets\twilio_verify_service_sid 2>nul
    if errorlevel 1 (
        echo ⚠️  Secret already exists: lgdx_twilio_verify_service_sid
    ) else (
        echo ✅ Secret created: lgdx_twilio_verify_service_sid
    )
)

echo.
echo ================================================
echo ✅ Docker secrets setup completed!
echo ================================================
echo.
echo You can now deploy production services:
echo   docker stack deploy -c docker-compose.prod.local.yml lgdx
echo.

pause 