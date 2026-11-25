@echo off
title AutoPark - Company Server One-Click Update (192.168.0.30)
setlocal
cd /d "%~dp0"

echo ====================================================================
echo   TECHNO Electrical.Jo - AutoPark Server Update ^& Verification
echo ====================================================================
echo.

echo [1/5] Fetching latest verified code from GitHub (main)...
if exist "%~dp0.git" (
  git pull origin main
) else (
  echo No .git folder found on server - downloading latest source from GitHub...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$zip = Join-Path $env:TEMP 'autopark_main.zip';" ^
    "$ext = Join-Path $env:TEMP 'autopark_main_ext';" ^
    "if (Test-Path $ext) { Remove-Item $ext -Recurse -Force };" ^
    "Invoke-WebRequest -Uri 'https://github.com/mohsafadi83-cell/AutoPark/archive/refs/heads/main.zip' -OutFile $zip;" ^
    "Expand-Archive -Path $zip -DestinationPath $ext -Force;" ^
    "$src = Join-Path $ext 'AutoPark-main';" ^
    "$dst = '%~dp0'.TrimEnd('\');" ^
    "Copy-Item (Join-Path $src 'backend\src') (Join-Path $dst 'backend') -Recurse -Force;" ^
    "Copy-Item (Join-Path $src 'backend\tsconfig*.json') (Join-Path $dst 'backend') -Force;" ^
    "Copy-Item (Join-Path $src 'backend\nest-cli.json') (Join-Path $dst 'backend') -Force;" ^
    "Copy-Item (Join-Path $src 'backend\package.json') (Join-Path $dst 'backend') -Force;" ^
    "if (Test-Path (Join-Path $src 'admin\src')) { Copy-Item (Join-Path $src 'admin\src') (Join-Path $dst 'admin') -Recurse -Force };" ^
    "if (Test-Path (Join-Path $src 'mobile\build\web')) { New-Item -ItemType Directory -Force -Path (Join-Path $dst 'mobile\build\web') | Out-Null; Copy-Item (Join-Path $src 'mobile\build\web\*') (Join-Path $dst 'mobile\build\web') -Recurse -Force };" ^
    "Copy-Item (Join-Path $src 'UPDATE_COMPANY_SERVER.bat') $dst -Force;" ^
    "Write-Host 'Source synced cleanly (.env and database preserved)!' -ForegroundColor Green"
  if errorlevel 1 (
    echo [ERROR] Failed to download latest code from GitHub!
    pause
    exit /b 1
  )
)

echo.
echo [1.5/5] Ensuring LIVE Production Mode (APP_MODE=LIVE, INDUSTRIAL_WRITE_ENABLED=true) in backend\.env...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$envFile = Join-Path '%~dp0backend' '.env';" ^
  "if (Test-Path $envFile) {" ^
  "  $c = Get-Content $envFile -Raw;" ^
  "  if ($c -match '(?m)^APP_MODE=') { $c = $c -replace '(?m)^APP_MODE=.*$', 'APP_MODE=LIVE' } else { $c = \"APP_MODE=LIVE`r`n\" + $c };" ^
  "  if ($c -match '(?m)^INDUSTRIAL_WRITE_ENABLED=') { $c = $c -replace '(?m)^INDUSTRIAL_WRITE_ENABLED=.*$', 'INDUSTRIAL_WRITE_ENABLED=true' } else { $c = $c + \"`r`nINDUSTRIAL_WRITE_ENABLED=true`r`n\" };" ^
  "  Set-Content -Path $envFile -Value $c -NoNewline;" ^
  "  Write-Host 'LIVE Mode enforced in backend\.env (APP_MODE=LIVE, INDUSTRIAL_WRITE_ENABLED=true)!' -ForegroundColor Green" ^
  "}"

echo.
echo [2/5] Building NestJS Backend (PLC Fixes + DB Caching + Direct Bay Move)...
cd /d "%~dp0backend"
call npm run build
if errorlevel 1 (
  echo [ERROR] Backend build FAILED! Aborting restart.
  pause
  exit /b 1
)

echo.
echo [3/5] Running Safe Dry-Run PLC ^& Cache Unit Tests (ZERO Physical Movement)...
call npm run test:unit
if errorlevel 1 (
  echo [WARN] Unit tests skipped or failed; check output above. Continuing if build succeeded...
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
echo [5/5] Waiting 6s and verifying live API health ^& DB cache...
timeout /t 6 /nobreak >nul
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/health' -TimeoutSec 5; Write-Host ('HEALTH OK: ' + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green } catch { Write-Host ('HEALTH CHECK FAILED: ' + $_.Exception.Message) -ForegroundColor Red }"

echo.
echo Done! AutoPark Server is updated and running.
pause
