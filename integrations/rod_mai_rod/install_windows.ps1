param(
    [string]$VpsHost = $env:SENTINEL_VPS_HOST,
    [string]$VpsUser = $env:SENTINEL_VPS_USER
)
$ErrorActionPreference = 'Stop'
if (-not $VpsHost -or -not $VpsUser) { throw 'Pass -VpsHost and -VpsUser, or set SENTINEL_VPS_HOST and SENTINEL_VPS_USER.' }

$installDir = Join-Path $env:LOCALAPPDATA 'SentinelAI'
$agentSource = Join-Path $PSScriptRoot 'agent.py'
$agentInstalled = Join-Path $installDir 'rod-mai-rod-agent.py'
$agentArgs = "`"$agentInstalled`" --host $VpsHost --user $VpsUser --network-sensor"
$pythonw = (Get-Command pythonw.exe -ErrorAction Stop).Source
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'SENTINEL rod-mai-rod bridge.lnk'

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $agentSource -Destination $agentInstalled -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = $agentArgs
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Description = 'Connect SENTINEL to rod-mai-rod via SSH'
$shortcut.Save()

$running = @(Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object { $_.CommandLine -like '*rod-mai-rod-agent.py*' })
if ($running.Count -eq 0) {
    Start-Process -FilePath $pythonw -ArgumentList $agentArgs -WindowStyle Hidden
}
Write-Output "Installed: $agentInstalled"
Write-Output "Starts at sign-in: $shortcutPath"
