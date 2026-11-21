@echo off
chcp 65001 >nul
title Auto Park - فتح منافذ جدار الحماية للموبايل (3000 / 5174 / 5173)

:: طلب صلاحية المسؤول (UAC) بشكل رسمي من Windows
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo جاري طلب صلاحية المسؤول لفتح منافذ جدار الحماية...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ==============================================================
echo   إضافة قواعد السماح في Windows Firewall لمنظومة Auto Park
echo ==============================================================
echo.

netsh advfirewall firewall delete rule name="AutoPark API (TCP 3000)" >nul 2>&1
netsh advfirewall firewall delete rule name="AutoPark Mobile iOS/PWA (TCP 5174)" >nul 2>&1
netsh advfirewall firewall delete rule name="AutoPark Web Admin (TCP 5173)" >nul 2>&1

netsh advfirewall firewall add rule name="AutoPark API (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any
netsh advfirewall firewall add rule name="AutoPark Mobile iOS/PWA (TCP 5174)" dir=in action=allow protocol=TCP localport=5174 profile=any
netsh advfirewall firewall add rule name="AutoPark Web Admin (TCP 5173)" dir=in action=allow protocol=TCP localport=5173 profile=any

echo.
echo [OK] تم فتح المنافذ 3000 و 5174 و 5173 بنجاح!
echo يمكنك الآن عمل NAT على جدار الحماية للشركة نحو هذا السيرفر للمنافذ (3000 و 5174 و 5173):
echo   - تطبيق الآيفون (iOS PWA):  http://46.185.128.165:5174
echo   - السيرفر API (APK):        http://46.185.128.165:3000/api/v1/health
echo   - لوحة الإدارة (Admin):     http://46.185.128.165:5173
echo.
pause
