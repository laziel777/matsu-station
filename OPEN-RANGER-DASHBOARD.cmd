@echo off
setlocal EnableExtensions
title Open Matsu Station AI Ranger Dashboard

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-ranger-dashboard.ps1"
set "OPEN_CODE=%ERRORLEVEL%"

echo.
echo Browser open exit code: %OPEN_CODE%
echo Dashboard URL: http://127.0.0.1:4321
echo Log: %~dp0.local-logs\browser-open.log
echo.
pause
exit /b %OPEN_CODE%
