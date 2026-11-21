@echo off
rem Builds ..\AutoPark.exe (single-file standalone Windows application, just like D:\Rest\Safadi.exe).
rem Uses the C# compiler that ships with Windows (.NET Framework 4.x); no Visual Studio needed.
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe

"%CSC%" -nologo -codepage:65001 -target:winexe -optimize+ ^
  -out:"..\AutoPark.exe" ^
  -r:System.dll -r:System.Core.dll -r:System.Data.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Xml.dll ^
  *.cs

if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)
if exist "%USERPROFILE%\Desktop" copy /y "..\AutoPark.exe" "%USERPROFILE%\Desktop\AutoPark.exe" >nul
echo BUILD OK - ..\AutoPark.exe
