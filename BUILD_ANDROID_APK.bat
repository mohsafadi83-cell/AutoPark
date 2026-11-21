@echo off
title Auto Park - Build Android APK
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build-apk.ps1"
pause
