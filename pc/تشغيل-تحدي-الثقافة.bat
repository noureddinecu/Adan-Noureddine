@echo off
rem Opens «تحدي الثقافة» in a phone-shaped Chrome (or Edge) window, ready to capture in TikTok LIVE Studio / OBS.
set "PAGE=%~dp0web\index.html"
set "PROF=%~dp0chrome-profile"
set "CH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CH%" set "CH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CH%" set "CH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CH%" set "CH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
start "" "%CH%" --app="file:///%PAGE:\=/%" --window-size=540,980 --user-data-dir="%PROF%" --autoplay-policy=no-user-gesture-required
