@echo off
rem Start the frontend dev server (quasar dev) minimized; output goes to frontend-dev.log (git-ignored).
cd /d "%~dp0..\tradingjournal-frontend"
start "" /min cmd /c "npm run dev > frontend-dev.log 2>&1"
