@echo off
setlocal
cd /d "%~dp0"

set "CODEX_PNPM=C:\Users\13532\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
set "CODEX_NODE_BIN=C:\Users\13532\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "CODEX_BIN=C:\Users\13532\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
set "PATH=%CODEX_NODE_BIN%;%CODEX_BIN%;%PATH%"

if "%~1"=="--background" (
  if exist "%CODEX_PNPM%" (
    "%CODEX_PNPM%" dev --hostname 127.0.0.1 >> "%~dp0dev-server.out.log" 2>> "%~dp0dev-server.err.log"
  ) else (
    pnpm dev --hostname 127.0.0.1 >> "%~dp0dev-server.out.log" 2>> "%~dp0dev-server.err.log"
  )
) else (
  if exist "%CODEX_PNPM%" (
    "%CODEX_PNPM%" dev --hostname 127.0.0.1
  ) else (
    pnpm dev --hostname 127.0.0.1
  )
)
