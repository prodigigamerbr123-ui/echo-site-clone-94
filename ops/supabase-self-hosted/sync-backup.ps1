$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path $env:USERPROFILE '.codex/ssh-workout04'
$taskKey = Join-Path $taskRoot 'oracle-workout.key'
$taskKnownHosts = Join-Path $env:USERPROFILE '.codex/backups/workout04-20261011/oracle-known-hosts'
$taskLocal = Join-Path $taskRoot 'backups'
$taskOptions = @('-i', $taskKey, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$taskKnownHosts")
$taskStamp = (& ssh @taskOptions 'ubuntu@157.151.12.122' 'cat /home/ubuntu/workout-backups/latest' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskStamp -notmatch '^\d{8}T\d{6}Z$') {
    throw 'Could not read the latest VM backup.'
}
$taskSnapshot = Join-Path $taskLocal $taskStamp
New-Item -ItemType Directory -Path $taskSnapshot -Force | Out-Null
& scp @taskOptions -r "ubuntu@157.151.12.122:/home/ubuntu/workout-backups/$taskStamp/." "$taskSnapshot/"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the VM backup.' }
$taskManifest = Get-Content -LiteralPath (Join-Path $taskSnapshot 'manifest.json') -Raw | ConvertFrom-Json
foreach ($taskFile in $taskManifest.files.PSObject.Properties) {
    $taskPath = Join-Path $taskSnapshot $taskFile.Name
    if ((Get-Item -LiteralPath $taskPath).Length -ne $taskFile.Value) {
        throw "Backup size mismatch: $($taskFile.Name)"
    }
}
"$(Get-Date -Format o) Copied $taskStamp" | Set-Content -LiteralPath (Join-Path $taskLocal 'last-sync.txt')
