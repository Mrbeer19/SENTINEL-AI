param(
 [Parameter(Mandatory=$true)][string]$VpsHost,
 [Parameter(Mandatory=$true)][string]$VpsUser,
 [Parameter(Mandatory=$true)][string]$VpsDir,
 [string]$Key = "$env:USERPROFILE\.ssh\sentinel_rod_mai_rod"
)
$ErrorActionPreference='Stop'
if ($VpsHost -notmatch '^[a-zA-Z0-9.:-]+$' -or $VpsUser -notmatch '^[a-zA-Z0-9_-]+$' -or $VpsDir -notmatch '^/[a-zA-Z0-9_./-]+$') {throw 'Invalid SSH host/user/folder'}
$remote="$VpsUser@$VpsHost"
$sshOptions=@('-i',$Key,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10')
# Existing privileged collector account is required; never change firewall or auth methods.
& ssh @sshOptions $remote 'test "$(id -u)" = 0 && command -v python3 && command -v tcpdump && command -v journalctl'
if ($LASTEXITCODE -ne 0) {throw 'Requires existing root collector access and installed python3, tcpdump, journalctl. No server changes made.'}
& scp @sshOptions "$PSScriptRoot/vps_sensor.py" "$PSScriptRoot/vps_logs.py" "$PSScriptRoot/site_config.py" "$PSScriptRoot/sentinel-sensor.service" "${remote}:$VpsDir/"
if ($LASTEXITCODE -ne 0) {throw 'Upload failed'}
& ssh @sshOptions $remote "chmod 600 $VpsDir/vps_sensor.py; sed 's#__VPS_DIR__#$VpsDir#' $VpsDir/sentinel-sensor.service > /etc/systemd/system/sentinel-sensor.service; chmod 644 /etc/systemd/system/sentinel-sensor.service; systemctl daemon-reload; systemctl enable --now sentinel-sensor; systemctl is-active sentinel-sensor"
if ($LASTEXITCODE -ne 0) {throw 'Sensor service setup failed'}
Write-Host 'Sensor installed. Run the updated Windows bridge with --network-sensor. Wait one poll before testing.' -ForegroundColor Green
