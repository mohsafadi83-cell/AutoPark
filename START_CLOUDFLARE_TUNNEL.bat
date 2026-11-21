@echo off
chcp 65001 >nul
title AutoPark — Cloudflare Tunnel (تشغيل بدون فايروول / NAT)
cd /d "%~dp0"

set CF=%~dp0tools\cloudflared.exe
if not exist "%CF%" (
    echo [INFO] Downloading official Cloudflare Tunnel client ^(cloudflared.exe^)...
    if not exist "%~dp0tools" mkdir "%~dp0tools"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%' -UseBasicParsing"
    if not exist "%CF%" (
        echo [ERROR] Failed to download cloudflared.exe. Check internet connection.
        pause
        exit /b 1
    )
)

echo ==============================================================
echo   AutoPark — Cloudflare Tunnel (HTTPS من خارج الشركة بدون NAT)
echo ==============================================================
echo.
echo اذا كان لديك Token لنفق دائم من Cloudflare Zero Trust،
echo ضعه في متغير البيئة CLOUDFLARE_TUNNEL_TOKEN او احفظه في tools\tunnel_token.txt
echo والا سيبدأ نفق Cloudflare Quick Tunnel فوري مجاني على المنفذ 3000.
echo.

if exist "%~dp0tools\tunnel_token.txt" (
    set /p CF_TOKEN=<"%~dp0tools\tunnel_token.txt"
)
if not "%CLOUDFLARE_TUNNEL_TOKEN%"=="" set CF_TOKEN=%CLOUDFLARE_TUNNEL_TOKEN%

if not "%CF_TOKEN%"=="" (
    echo [MODE] Starting Permanent Cloudflare Named Tunnel...
    "%CF%" tunnel run --token %CF_TOKEN%
) else (
    echo [MODE] Starting Instant Cloudflare HTTPS Tunnel -> http://localhost:3000
    echo   - API / Android APK : https://^<tunnel-url^>
    echo   - iOS Safari App    : https://^<tunnel-url^>/mobile/
    echo   - Web Admin Panel   : https://^<tunnel-url^>/
    echo.
    "%CF%" tunnel --url http://localhost:3000 --protocol http2
)
pause
