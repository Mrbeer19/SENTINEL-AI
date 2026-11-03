$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_sentinel-env.ps1')
if (-not $env:SENTINEL_ADMIN_PASSWORD_HASH) { throw 'Run this in the same PowerShell window where the admin backend was started.' }
& $env:SENTINEL_PYTHON -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
