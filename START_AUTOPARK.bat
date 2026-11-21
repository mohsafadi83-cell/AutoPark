@echo off
title Auto Park - Complete Ecosystem Launcher
echo [1/3] Starting Auto Park Backend + Embedded PostgreSQL (Port 3000)...
start "Auto Park Backend (Port 3000)" cmd /k "cd /d "%~dp0backend" && npm run dev:demo"

echo [2/3] Starting Auto Park Web Admin Panel (Port 5173)...
start "Auto Park Web Admin (Port 5173)" cmd /k "cd /d "%~dp0admin" && npm run dev"

echo [3/3] Starting Auto Park Flutter Mobile App (Port 5174)...
start "Auto Park Flutter Mobile App (Port 5174)" cmd /k "cd /d "%~dp0mobile" && flutter run -d web-server --web-hostname 0.0.0.0 --web-port 5174 --dart-define=API_BASE_URL=http://localhost:3000"

timeout /t 10 /nobreak >nul
start http://localhost:5173
start http://localhost:5174
echo.
echo Auto Park Ecosystem is running!
echo - Web Admin Panel (React):   http://localhost:5173
echo - Mobile App (Flutter):      http://localhost:5174
echo - Backend API:               http://localhost:3000/api/v1
echo - Swagger OpenAPI Docs:      http://localhost:3000/api/docs
pause
