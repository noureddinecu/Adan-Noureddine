@echo off
rem Thaqafa challenge on PC: opens the game in a phone-shaped Chrome/Edge window (or the default browser).
chcp 65001 >nul
cd /d "%~dp0"
set "PAGE=%~dp0web\index.html"
set "CH="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined CH if exist %%P set "CH=%%~P"
)
if defined CH (
  start "" "%CH%" --app="file:///%PAGE%" --window-size=540,980 --user-data-dir="%~dp0browser-profile" --autoplay-policy=no-user-gesture-required
) else (
  start "" "%PAGE%"
)
