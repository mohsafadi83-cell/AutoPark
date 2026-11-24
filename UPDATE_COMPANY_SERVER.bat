@echo off
title AutoPark — Company Server One-Click Update (192.168.0.30)
setlocal
cd /d "%~dp0"

echo ====================================================================
echo   TECHNO Electrical.Jo — AutoPark Server Update & Verification
echo ====================================================================
echo.

echo [1/5] Pulling latest verified code from GitHub (origin/main)...
git pull origin main
if errorlevel 1 (
  echo [WARN] git pull returned non-zero; continuing with local workspace files.
)

echo.
echo [2/5] Building NestJS Backend (PLC Fixes + DB Caching + Security)...
cd /d "%~dp0backend"
call npm run build
if errorlevel 1 (
  echo [ERROR] Backend build FAILED! Aborting restart.
  pause
  exit /b 1
)

echo.
echo [3/5] Running Safe Dry-Run PLC & Cache Unit Tests (ZERO Physical Movement)...
call npm run test:unit
if errorlevel 1 (
  echo [ERROR] Unit tests FAILED! Aborting restart.
  pause
  exit /b 1
)

echo.
echo [4/5] Restarting AutoPark Standalone Server (dist\standalone.js)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  echo Stopping previous backend PID %%a...
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
start "AutoPark Production Backend (Port 3000)" cmd /k "cd /d "%~dp0backend" && node dist/standalone.js"

echo.
echo [5/5] Waiting 6s and verifying live API health & DB cache...
timeout /t 6 /nobreak >nul
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/health' -TimeoutSec 5; Write-Host ('HEALTH OK: ' + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green } catch { Write-Host ('HEALTH CHECK FAILED: ' + $_.Exception.Message) -ForegroundColor Red }"

echo.
echo Done! AutoPark Server is updated and running.
pause
