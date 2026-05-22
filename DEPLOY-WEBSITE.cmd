@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%APPDATA%\npm;%PATH%"
npm run ranger:deploy
pause
