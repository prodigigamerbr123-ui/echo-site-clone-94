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
if ($taskManifest.created_utc -ne $taskStamp -or
    (Get-Content -LiteralPath (Join-Path $taskSnapshot 'complete') -Raw).Trim() -ne 'true') {
    throw 'Backup is incomplete or the snapshot identity differs.'
}
$taskExpectedFiles = @('database.dump', 'pooler.dump', 'roles.sql', 'runtime.tar.gz', 'database-config.tar.gz')
$taskHashes = @{}
if ($null -ne $taskManifest.sha256) {
    foreach ($taskEntry in $taskManifest.sha256.PSObject.Properties) {
        $taskHashes[$taskEntry.Name] = [string]$taskEntry.Value
    }
} else {
    # Older manifests recorded only sizes. Obtain hashes independently via SSH.
    $taskHashOutput = & ssh @taskOptions 'ubuntu@157.151.12.122' "cd /home/ubuntu/workout-backups/$taskStamp && sha256sum database.dump pooler.dump roles.sql runtime.tar.gz database-config.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Could not obtain checksums for the legacy backup.' }
    foreach ($taskLine in $taskHashOutput) {
        if ($taskLine -match '^([a-f0-9]{64})  (.+)$') {
            $taskHashes[$Matches[2]] = $Matches[1]
        }
    }
}
foreach ($taskFileName in $taskExpectedFiles) {
    $taskSize = $taskManifest.files.PSObject.Properties[$taskFileName]
    $taskPath = Join-Path $taskSnapshot $taskFileName
    if ($null -eq $taskSize -or (Get-Item -LiteralPath $taskPath).Length -ne $taskSize.Value) {
        throw "Backup size mismatch: $taskFileName"
    }
    if ($taskHashes[$taskFileName] -notmatch '^[a-fA-F0-9]{64}$' -or
        (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash -ne $taskHashes[$taskFileName]) {
        throw "Backup checksum mismatch: $taskFileName"
    }
}
"$(Get-Date -Format o) Verified SHA256 for five files in $taskStamp" | Set-Content -LiteralPath (Join-Path $taskLocal 'last-sync.txt')
