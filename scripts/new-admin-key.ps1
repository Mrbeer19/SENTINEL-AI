# Create the machine key shared by the admin backend (X-Admin-Key) and the Windows bridge.
# The key is written to %LOCALAPPDATA%\SentinelAI\admin-key.txt, readable only by the current user.
# It is never printed. Restart the admin backend and the bridge afterwards.
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'SentinelAI'
$file = Join-Path $dir 'admin-key.txt'
if ((Test-Path -LiteralPath $file) -and -not $Force) { Write-Output "Key already exists: $file (use -Force to replace)"; return }
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$key = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Set-Content -LiteralPath $file -Value $key -Encoding ascii -NoNewline
Remove-Variable key, bytes
& icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Output "Created $file (64 hex characters, current user only)"
