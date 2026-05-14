@echo off
echo ===============================================
echo     Stopping LGDX Production Environment (Local)
echo ===============================================
echo.

cd /d "%~dp0\..\.."

echo Removing LGDX production stack...
docker stack rm lgdx

echo.
echo ⏳ Waiting for services to stop...
timeout /t 15 /nobreak >nul

echo.
echo ✅ Production environment stopped! (Local)
echo.
pause 