@echo off
echo Setting up LinkAuto to auto-start on Windows login...

set "SCRIPT_PATH=%~dp0start-server.bat"

schtasks /create /tn "LinkAuto Dev Server" /tr "\"%SCRIPT_PATH%\"" /sc onlogon /ru "%USERNAME%" /f /rl HIGHEST

echo.
echo  Done! LinkAuto will now auto-start every time you log in.
echo  To remove: schtasks /delete /tn "LinkAuto Dev Server" /f
echo.
pause
