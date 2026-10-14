@echo off
title Nexus
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
if not exist ".runtime\electron.exe" (
  echo Included Electron runtime is missing. Extract the complete source ZIP.
  pause
  exit /b 1
)
".runtime\electron.exe" "%~dp0." --development %*
