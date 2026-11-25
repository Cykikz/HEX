@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
set "HEX_EXIT_CODE=%ERRORLEVEL%"
if not "%HEX_EXIT_CODE%"=="0" pause
exit /b %HEX_EXIT_CODE%
