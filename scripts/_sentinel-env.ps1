# Shared settings for the admin backend scripts. Machine-specific paths go in
# scripts/local.ps1 (ignored by Git), for example:
#   $env:SENTINEL_PYTHON  = 'D:\venvs\sentinel\Scripts\python.exe'
#   $env:SENTINEL_DB_PATH = 'D:\sentinel-data\sentinel.db'
$SentinelRoot = Split-Path -Parent $PSScriptRoot
$localSettings = Join-Path $PSScriptRoot 'local.ps1'
if (Test-Path -LiteralPath $localSettings) { . $localSettings }
if (-not $env:SENTINEL_PYTHON) {
    $venvPython = Join-Path $SentinelRoot 'backend\.venv\Scripts\python.exe'
    $env:SENTINEL_PYTHON = if (Test-Path -LiteralPath $venvPython) { $venvPython } else { 'python' }
}
if (-not $env:SENTINEL_MODEL) { $env:SENTINEL_MODEL = 'sentinel-qwen3.5-4b-r3:latest' }
if (-not $env:SENTINEL_ADMIN_KEY) {
    # Same machine key file the Windows bridge reads (created by scripts/new-admin-key.ps1).
    $keyFile = Join-Path $env:LOCALAPPDATA 'SentinelAI\admin-key.txt'
    if (Test-Path -LiteralPath $keyFile) { $env:SENTINEL_ADMIN_KEY = (Get-Content -LiteralPath $keyFile -Raw).Trim() }
}
if (-not $env:SENTINEL_COOKIE_SECURE) { $env:SENTINEL_COOKIE_SECURE = '0' }
Set-Location -LiteralPath $SentinelRoot
