@echo off
@set "ELECTRON_RUN_AS_NODE="
@cd /d "%~dp0"
".runtime\electron.exe" "%~dp0." --release %*
