@echo off
rem Start the backend dev server (nest --watch) minimized; output goes to backend-dev.log (git-ignored).
cd /d "%~dp0..\tradingjournal-backend"
start "" /min cmd /c "npm run start:dev > backend-dev.log 2>&1"
