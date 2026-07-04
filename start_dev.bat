@echo off
echo =========================================
echo   Starting Nagarkot Dev Environment
echo =========================================

echo.
echo [1/4] Starting OS Backend...
start "OS Backend" cmd /k "cd OS && npm run backend"

echo.
echo [2/4] Starting OS Frontend...
start "OS Frontend" cmd /k "cd OS && npm run frontend"

echo.
echo Waiting 5 seconds to let OS services initialize before starting Trainings...
timeout /t 5 /nobreak > nul

echo.
echo [3/4] Starting Training API...
start "Training API" cmd /k "cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

echo.
echo [4/4] Starting Training UI...
start "Training UI" cmd /k "cd frontend && npm run dev"

echo.
echo =========================================
echo   All services launched!
echo =========================================
echo Close this window at any time (the other 4 terminals will stay open).
pause
