$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_sentinel-env.ps1')
Write-Host 'SENTINEL admin setup' -ForegroundColor Cyan
Write-Host 'Username: admin'
Write-Host 'Paste the generated hash (scrypt$...) below. Input is hidden.'
$adminSecureHash = Read-Host 'Admin password hash' -AsSecureString
$adminHashPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecureHash)
try { $adminHashText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminHashPtr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminHashPtr) }
$adminHashText = $adminHashText -replace '^SENTINEL_ADMIN_PASSWORD_HASH=', ''
if ($adminHashText -notmatch '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$') {
    Write-Host 'Invalid hash. Run python -m backend.admin_auth and copy the generated value.' -ForegroundColor Red
    return
}
$env:SENTINEL_ADMIN_USERNAME = 'admin'
$env:SENTINEL_ADMIN_PASSWORD_HASH = $adminHashText
Remove-Variable adminHashText, adminSecureHash
Write-Host 'Starting local backend. Keep this window open; Ctrl+C stops it.' -ForegroundColor Green
& $env:SENTINEL_PYTHON -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
