@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [Sprite Forge] Always-fresh launch mode

set "NEEDS_INSTALL="
if not exist "node_modules" set "NEEDS_INSTALL=1"
if not exist "node_modules\@sprite-forge\core" set "NEEDS_INSTALL=1"

if defined NEEDS_INSTALL (
  echo [Sprite Forge] Installing dependencies...
  call npm install
  if errorlevel 1 (
    call :fail "npm install failed."
  )
)

echo [Sprite Forge] Cleaning previous runtime/build artifacts...
if exist "core\dist" rd /s /q "core\dist"
if exist "app\dist" rd /s /q "app\dist"
if exist "app\release" rd /s /q "app\release"

if exist "app\release" (
  call :fail "Failed to clean app\release. Close running app and retry."
)

echo [Sprite Forge] Building latest portable package...
call npm run package:portable
if errorlevel 1 (
  call :fail "Portable build failed."
)

set "APP_EXE="
if exist "app\release\win-unpacked\Sprite Forge.exe" (
  set "APP_EXE=%CD%\app\release\win-unpacked\Sprite Forge.exe"
)
if not defined APP_EXE (
  for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "$f=Get-ChildItem -Path 'app/release' -File -Filter '*portable*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if($f){$f.FullName}"`) do set "APP_EXE=%%F"
)

if not defined APP_EXE (
  call :fail "Could not find a launchable EXE in app\release."
)

echo [Sprite Forge] Launching: %APP_EXE%
start "" "%APP_EXE%"
exit /b 0

:fail
echo [Sprite Forge] %~1
if not defined CI pause
exit /b 1
