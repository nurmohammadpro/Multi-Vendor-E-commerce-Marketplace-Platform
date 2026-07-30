@echo off
setlocal enabledelayedexpansion
title App Brainer — POS Printer Setup
echo ============================================
echo   App Brainer — Silent Printer Setup
echo ============================================
echo.

:: ── Step 1: Detect/install Node.js ──
echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found. Download and install Node.js 18+ from https://nodejs.org
    echo After installing, rerun this script.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   Node.js found: %NODE_VER%

:: ── Step 2: Collect credentials ──
echo.
echo [2/5] POS printer credentials
echo.
echo   You need your store ID and an API token from Market One.
echo   Open Market One in your browser, go to Settings ^> Hardware,
echo   and copy the Store ID and Auth Token values.
echo.
set /p STORE_ID="   Store UUID: "
set /p AUTH_TOKEN="   Auth Token: "
set /p PRINTER_NAME="   Printer name [XP-Q80A]: "
if "%PRINTER_NAME%"=="" set PRINTER_NAME=XP-Q80A

echo.
echo [3/5] Verifying printer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Printer | Where-Object { $_.Name -like '*%PRINTER_NAME%*' } | Select-Object Name, DriverName, PortName" 2>nul
if %errorlevel% neq 0 (
    echo   WARNING: Printer "%PRINTER_NAME%" not found in Windows.
    echo   Install the printer driver first, then rerun this script.
    echo   Driver download: https://ihp.com.bd or Xprinter CD
    goto :continue
)
echo   Printer "%PRINTER_NAME%" found.

:continue
:: ── Step 4: Install print agent as Windows service ──
echo.
echo [4/5] Installing print agent...

set AGENT_DIR=%~dp0
set AGENT_DIR=%AGENT_DIR:~0,-1%

:: Create .env file for the print agent
(
echo MVP_PRINTER_NAME=%PRINTER_NAME%
echo MVP_STORE_ID=%STORE_ID%
echo MVP_AUTH_TOKEN=%AUTH_TOKEN%
echo MVP_API_BASE_URL=https://api.merchflow.appbrainer.tech/v1
echo MVP_POLL_INTERVAL_MS=3000
) > "%AGENT_DIR%\.env"

echo   Environment saved to %AGENT_DIR%\.env

:: Install as scheduled task that runs at login
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName='MarketOnePrintAgent';" ^
  "$agentDir='%AGENT_DIR%';" ^
  "try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {};" ^
  "$action = New-ScheduledTaskAction -Execute 'node' -Argument 'server.js' -WorkingDirectory $agentDir;" ^
  "$trigger = New-ScheduledTaskTrigger -AtLogOn;" ^
  "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege;" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);" ^
  "Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null;" ^
  "Start-ScheduledTask -TaskName $taskName;"

if %errorlevel% equ 0 (
    echo   Print agent installed and started.
) else (
    echo   Failed to install scheduled task. Try running as Administrator.
    pause
    exit /b 1
)

:: ── Step 5: Test print ──
echo.
echo [5/5] Testing silent printing...
echo   Make a test sale from the POS. The receipt should print automatically
echo   within 3 seconds on %PRINTER_NAME%.
echo.
echo   To check agent status: open http://127.0.0.1:17668/health
echo   To re-run setup: just run this script again.
echo.
echo ============================================
echo   Setup complete! The print agent will start
echo   automatically every time you log in.
echo ============================================

pause
