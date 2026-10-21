$ErrorActionPreference = 'Stop'

$taskName = 'SENTINEL-rod-mai-rod-bridge'
$installDir = Join-Path $env:LOCALAPPDATA 'SentinelAI'
$agentSource = Join-Path $PSScriptRoot 'agent.py'
$agentInstalled = Join-Path $installDir 'rod-mai-rod-agent.py'
$pythonw = (Get-Command pythonw.exe -ErrorAction Stop).Source
$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $agentSource -Destination $agentInstalled -Force

$action = New-ScheduledTaskAction -Execute $pythonw -Argument $agentInstalled
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
