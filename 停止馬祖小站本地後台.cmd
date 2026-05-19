@echo off
setlocal
echo Stopping Matsu Station local tools...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-matsu-station.ps1"
echo.
pause
