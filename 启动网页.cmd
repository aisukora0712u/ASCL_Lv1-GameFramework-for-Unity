@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\KnowledgeSite\Start.ps1" %*
set "launchExitCode=%errorlevel%"
if not "%launchExitCode%"=="0" pause
exit /b %launchExitCode%
