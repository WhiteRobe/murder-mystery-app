@echo off
title %PROJECT_TITLE_ASCII% - DM Server
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] node not found. Run install.bat first.
  echo         Download: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "data.json" (
  echo [INFO] data.json not found, will be auto-generated on first run.
)

for /f "delims=" %%P in ('node -e "try{console.log(require('./data.json').settings.port)}catch(e){console.log(3000)}"') do set PORT=%%P

echo ===============================================
echo   %PROJECT_TITLE_ASCII% DM Server - Port %PORT%
echo ===============================================
echo   Player Entry:  http://localhost:%PORT%/
echo   DM Console:    http://localhost:%PORT%/host
echo ===============================================
echo   Keep this window open. Closing stops the server.
echo.

node server.js

echo.
echo Server exited.
pause