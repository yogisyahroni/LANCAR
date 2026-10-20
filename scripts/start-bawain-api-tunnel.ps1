$ErrorActionPreference = "Stop"

$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
$userCloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
$config = Join-Path $userCloudflaredDir "config.yml"
$log = Join-Path $userCloudflaredDir "bawain-api-runtime.log"
$metrics = "127.0.0.1:20241"

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Cloudflared config tidak ditemukan: $config"
}

# Prevent a second launcher from creating duplicate tunnel connections.
# A duplicate process is especially confusing because it may use a different
# DNS resolver, metrics port, and transport protocol than the intended one.
$mutex = [Threading.Mutex]::new($false, "Global\TEMBUS-bawain-api-cloudflared")
$mutexOwned = $false
$exitCode = 1

try {
    try {
        $mutexOwned = $mutex.WaitOne(0)
    }
    catch [Threading.AbandonedMutexException] {
        # The previous launcher exited unexpectedly. The mutex is now owned by
        # this process and it is safe to continue.
        $mutexOwned = $true
    }

    if (-not $mutexOwned) {
        throw "Launcher bawain-api sudah berjalan. Gunakan satu launcher saja; jangan menjalankan cloudflared manual bersamaan."
    }

    # Also catch cloudflared processes started manually, which do not share the
    # PowerShell mutex. This is intentionally conservative: this machine owns a
    # single bawain-api tunnel, so any existing cloudflared process is a conflict.
    $existingProcesses = @(Get-Process -Name cloudflared -ErrorAction SilentlyContinue)
    if ($existingProcesses.Count -gt 0) {
        $pids = ($existingProcesses | ForEach-Object { $_.Id }) -join ", "
        throw "cloudflared sudah aktif (PID: $pids). Hentikan instance lama sebelum menjalankan launcher ini agar tidak terjadi duplicate tunnel."
    }

    $arguments = @(
        "--config", $config,
        "--logfile", $log,
        "--metrics", $metrics,
        "tunnel", "run",
        # HTTP/2 keeps tunnel traffic on TCP and avoids QUIC/UDP idle timeouts
        # commonly caused by home routers or ISP NAT.
        "--protocol", "http2",
        # Do not depend on the router/ISP DNS resolver for Cloudflare edge
        # discovery. Both resolvers are public and the tunnel will retry.
        "--dns-resolver-addrs", "1.1.1.1:53",
        "--dns-resolver-addrs", "8.8.8.8:53",
        "bawain-api"
    )

    Write-Host "Menjalankan bawain-api dengan HTTP/2, edge IPv4/IPv6 otomatis, dan resolver DNS 1.1.1.1 / 8.8.8.8..."
    & $cloudflared @arguments
    $exitCode = $LASTEXITCODE
}
finally {
    if ($mutexOwned) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}

exit $exitCode
