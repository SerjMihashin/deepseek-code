@echo off
REM chrome-browser-start - Запуск Chrome с отладочным портом (изолированный профиль)
REM Использование: chrome-browser-start [--port 9222] [--headless]
REM
REM Профиль автоматизации: %TEMP%\chrome-automation-profile
REM Этот профиль отделён от вашего основного браузера.

setlocal enabledelayedexpansion

set PORT=9222
set HEADLESS=
set CHROME_PATH=

REM Парсинг аргументов
:parse
if "%~1"=="--port" (
  set PORT=%~2
  shift & shift
  goto parse
)
if "%~1"=="--headless" (
  set HEADLESS=--headless=new
  shift
  goto parse
)

REM Поиск Chrome
if defined CHROME_PATH goto :found_chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if defined CHROME_PATH goto :found_chrome
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if defined CHROME_PATH goto :found_chrome
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if defined CHROME_PATH goto :found_chrome

echo [chrome-browser-start] ОШИБКА: Chrome не найден!
echo [chrome-browser-start] Укажите путь: set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
pause
exit /b 1

:found_chrome
set "USER_DATA_DIR=%TEMP%\chrome-automation-profile"

REM Проверка через HTTP — запущен ли Chrome на этом порту
echo [chrome-browser-start] Проверка порта %PORT%...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%PORT%/json/version' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo [chrome-browser-start] Chrome уже запущен на порту %PORT%.
  echo [chrome-browser-start] Профиль автоматизации: %USER_DATA_DIR%
  echo.
  echo [chrome-browser-start] Примеры использования:
  echo   chrome-tab http://localhost:5176
  echo   chrome-eval http://localhost:5176 --same-tab "document.title"
  echo   chrome-text http://localhost:5176 --same-tab "body"
  goto :done
)

REM Запускаем Chrome
echo [chrome-browser-start] Запуск Chrome с отладочным портом %PORT%...
echo [chrome-browser-start] Профиль автоматизации: %USER_DATA_DIR%
echo [chrome-browser-start] Ваш основной браузер не будет затронут.

start "Chrome Automation" "%CHROME_PATH%" ^
  --remote-debugging-port=%PORT% ^
  --user-data-dir="%USER_DATA_DIR%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-blink-features=AutomationControlled ^
  %HEADLESS%

REM Ждём, пока Chrome запустится
echo [chrome-browser-start] Ожидание запуска...
timeout /t 3 /nobreak >nul

REM Проверяем, что порт открылся
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%PORT%/json/version' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo [chrome-browser-start] Браузер запущен успешно!
  echo [chrome-browser-start] Порт: %PORT%
  echo [chrome-browser-start] Профиль: %USER_DATA_DIR%
  echo.
  echo [chrome-browser-start] Примеры использования:
  echo   chrome-tab http://localhost:5176
  echo   chrome-eval http://localhost:5176 --same-tab "document.title"
  echo   chrome-text http://localhost:5176 --same-tab "body"
) else (
  echo [chrome-browser-start] ОШИБКА: Chrome не запустился за отведённое время.
  echo [chrome-browser-start] Попробуйте запустить вручную:
  echo   "%CHROME_PATH%" --remote-debugging-port=%PORT% --user-data-dir="%USER_DATA_DIR%" --no-first-run
  pause
  exit /b 1
)

:done
echo.
echo [chrome-browser-start] Готово. Браузер работает в фоне.
