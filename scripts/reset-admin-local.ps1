$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_sentinel-env.ps1')
Write-Host 'Set a new SENTINEL admin password' -ForegroundColor Cyan
Write-Host 'Username: admin. Enter a new password below, NOT the scrypt hash.'
$env:SENTINEL_ADMIN_USERNAME = 'admin'
$adminHashResult = & $env:SENTINEL_PYTHON -m backend.admin_auth
if ($LASTEXITCODE -ne 0 -or -not $adminHashResult) { Write-Host 'Password was not changed. Run this script again.'; return }
$env:SENTINEL_ADMIN_PASSWORD_HASH = ($adminHashResult | Select-Object -Last 1) -replace '^SENTINEL_ADMIN_PASSWORD_HASH=', ''
Remove-Variable adminHashResult
Write-Host 'Password configured. Keep this window open. Login with admin and the password you just entered.' -ForegroundColor Green
& $env:SENTINEL_PYTHON -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
