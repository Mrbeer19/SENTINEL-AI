param(
 [Parameter(Mandatory=$true)][string]$VpsHost,
 [Parameter(Mandatory=$true)][string]$VpsUser,
 [string]$Key = "$env:USERPROFILE\.ssh\sentinel_rod_mai_rod"
)
$ErrorActionPreference='Stop'
if ($VpsHost -notmatch '^[a-zA-Z0-9.:-]+$' -or $VpsUser -notmatch '^[a-zA-Z0-9_-]+$') {throw 'Invalid SSH host/user'}
$remote="$VpsUser@$VpsHost"
$sshOptions=@('-i',$Key,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10')
# Existing privileged collector account is required; never change firewall or auth methods.
& ssh @sshOptions $remote 'test "$(id -u)" = 0 && command -v python3 && command -v tcpdump && command -v journalctl'
if ($LASTEXITCODE -ne 0) {throw 'Requires existing root collector access and installed python3, tcpdump, journalctl. No server changes made.'}
& scp @sshOptions "$PSScriptRoot/vps_sensor.py" "$PSScriptRoot/vps_logs.py" "$PSScriptRoot/sentinel-sensor.service" "${remote}:/opt/rod-mai-rod/sentinel/"
if ($LASTEXITCODE -ne 0) {throw 'Upload failed'}
& ssh @sshOptions $remote 'chmod 600 /opt/rod-mai-rod/sentinel/vps_sensor.py; install -m 644 /opt/rod-mai-rod/sentinel/sentinel-sensor.service /etc/systemd/system/sentinel-sensor.service; systemctl daemon-reload; systemctl enable --now sentinel-sensor; systemctl is-active sentinel-sensor'
if ($LASTEXITCODE -ne 0) {throw 'Sensor service setup failed'}
Write-Host 'Sensor installed. Run the updated Windows bridge with --network-sensor. Wait one poll before testing.' -ForegroundColor Green
