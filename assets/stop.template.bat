@echo off
title %PROJECT_TITLE_ASCII% - Stop Server
cd /d "%~dp0"

set PORT=3000
if exist "data.json" (
  for /f "delims=" %%P in ('node -e "try{console.log(require('./data.json').settings.port)}catch(e){console.log(3000)}"') do set PORT=%%P
)

echo Stopping server on port %PORT% ...

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set FOUND=1
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>nul
)

if %FOUND%==0 echo No process listening on port %PORT%.

echo Done.
pause