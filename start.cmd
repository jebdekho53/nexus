@echo off
title Matrix
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
if not exist ".runtime\electron.exe" (
  echo Included Electron runtime is missing. Extract the complete source ZIP.
  pause
  exit /b 1
)
rem Compile the TypeScript modules (src\ts -> build\ts) when needed; the bundled Electron runs the script as Node.
set "ELECTRON_RUN_AS_NODE=1"
".runtime\electron.exe" "%~dp0scripts\ensure-ts-build.cjs"
set "ELECTRON_RUN_AS_NODE="
if errorlevel 1 (
  pause
  exit /b 1
)
".runtime\electron.exe" "%~dp0." --development %*
