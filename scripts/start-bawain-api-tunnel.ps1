$ErrorActionPreference = "Stop"

$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
$userCloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
$config = Join-Path $userCloudflaredDir "config.yml"
$log = Join-Path $userCloudflaredDir "bawain-api-runtime.log"

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Cloudflared config tidak ditemukan: $config"
}

$arguments = @(
    "--config", $config,
    "--logfile", $log,
    "tunnel", "run",
    "--dns-resolver-addrs", "1.1.1.1:53",
    "--dns-resolver-addrs", "8.8.8.8:53",
    "bawain-api"
)

Write-Host "Menjalankan bawain-api dengan resolver DNS 1.1.1.1 dan 8.8.8.8..."
& $cloudflared @arguments
exit $LASTEXITCODE
