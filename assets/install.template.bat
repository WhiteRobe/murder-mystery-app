@echo off
title %PROJECT_TITLE_ASCII% - Install Check
echo ============================================
echo   %PROJECT_TITLE_ASCII% DM Server - Install Check
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not detected.
  echo         Download LTS from https://nodejs.org/
  echo.
  echo Install Node.js first, then re-run install.bat
  pause
  exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

if not exist "data.json" (
  echo [INFO] data.json not found. Will be auto-generated on first run.
) else (
  echo [OK] data.json found.
)

echo [TIP] Zero npm dependencies required for the server.
echo [TIP] Edit data.json settings.port to change port.
echo [TIP] Use the PDF splitter tool separately if needed.
echo.

echo Install check passed. Double-click start.bat to launch.
pause