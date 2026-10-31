# Lets the SENTINEL API on the VPS use the r3 model on this GPU workstation.
# Opens VPS 127.0.0.1:11434 -> this PC 127.0.0.1:11434 over SSH and reconnects if the link drops.
# The VPS end binds loopback only (sshd GatewayPorts no), so Ollama is never exposed publicly.
# When this PC is off, the API falls back to the detection rules.
param(
    [string]$VpsHost = $env:SENTINEL_VPS_HOST,
    [string]$VpsUser = $env:SENTINEL_VPS_USER,
    [string]$Key = (Join-Path $HOME '.ssh\sentinel_rod_mai_rod')
)
if (-not $VpsHost -or -not $VpsUser) { throw 'Set -VpsHost/-VpsUser or SENTINEL_VPS_HOST/SENTINEL_VPS_USER' }
$log = Join-Path $env:LOCALAPPDATA 'SentinelAI\ollama-tunnel.log'
while ($true) {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) connecting"
    & ssh -N -i $Key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes `
        -o ServerAliveInterval=30 -o ServerAliveCountMax=3 `
        -R 127.0.0.1:11434:127.0.0.1:11434 "$VpsUser@$VpsHost" 2>> $log
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) tunnel closed (exit $LASTEXITCODE), retry in 15 s"
    Start-Sleep -Seconds 15
}
