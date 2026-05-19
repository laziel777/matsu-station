@echo off
setlocal EnableExtensions
title Matsu Station Desktop Launcher

cd /d "%~dp0"

echo ============================================================
echo  Matsu Station Desktop Launcher
echo ============================================================
echo.
echo This window will stay open.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desktop-launcher.ps1"
set "LAUNCHER_CODE=%ERRORLEVEL%"

echo.
echo ============================================================
echo Launcher exit code: %LAUNCHER_CODE%
echo Dashboard URL: http://127.0.0.1:4321
echo Log: %~dp0.local-logs\desktop-launcher.log
echo ============================================================
echo.

if not "%LAUNCHER_CODE%"=="0" (
  echo Startup failed. Read the error above.
)

pause
exit /b %LAUNCHER_CODE%
