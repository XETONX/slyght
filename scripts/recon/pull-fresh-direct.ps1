# Direct wrangler KV pull of John's namespaced full-state snapshot.
# Bypasses Phase A device-token auth by reading the KV key directly via wrangler.
# Use when scripts/recon/pull-from-kv.js can't be used because no device token is available.
#
# Usage (from anywhere in PowerShell):
#   & C:\Users\admin\slyght\scripts\recon\pull-fresh-direct.ps1
#
# Output: writes JSON to tests/state-dump/live-<YYYY-MM-DD>.json

$ErrorActionPreference = 'Stop'

$ProjectRoot   = 'C:\Users\admin\slyght'
$WorkerDir     = Join-Path $ProjectRoot 'slyght-worker'
$DeviceHash    = '366fcb8cdd6f0501bdc057130a4435b46a5e5b7e8618383b72f2b56265a84157'
$NamespaceId   = 'a4ca2cafcf4743769d08ea5c0999f046'
$KvKey         = "device:${DeviceHash}:state-full-snapshot"
$DateStamp     = Get-Date -Format 'yyyy-MM-dd'
$OutPath       = Join-Path $ProjectRoot "tests\state-dump\live-${DateStamp}.json"

Push-Location $WorkerDir
try {
    # Use [System.IO.File]::WriteAllText with UTF8Encoding(false) to avoid
    # the BOM that Out-File -Encoding utf8 writes on PowerShell 5.1.
    # The BOM breaks JSON.parse downstream (smoke specs, ledger-walk scripts).
    $output = & npx wrangler kv key get $KvKey --namespace-id=$NamespaceId --remote
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($OutPath, ($output -join "`n"), $utf8NoBom)
    $size = (Get-Item $OutPath).Length
    Write-Output "[pull-fresh-direct] wrote ${OutPath} (${size} bytes, utf8 no-BOM)"
} finally {
    Pop-Location
}
