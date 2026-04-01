@echo off
title LinkAuto — Dev Server
cd /d "%~dp0"

echo.
echo  ==========================================
echo   LinkAuto Dev Server — Starting...
echo  ==========================================
echo.

:RESTART
echo  [%TIME%] Starting Next.js on http://localhost:3000
npm run dev
echo.
echo  [%TIME%] Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto RESTART
