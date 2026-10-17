@echo off
@set "ELECTRON_RUN_AS_NODE="
@cd /d "%~dp0"
@set "ELECTRON_RUN_AS_NODE=1"
@".runtime\electron.exe" "%~dp0scripts\ensure-ts-build.cjs"
@set "ELECTRON_RUN_AS_NODE="
@if errorlevel 1 exit /b 1
".runtime\electron.exe" "%~dp0." --release %*
