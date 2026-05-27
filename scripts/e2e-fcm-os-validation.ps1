param(
  [string]$CustomerSerial = "",
  [string]$CourierSerial = "",
  [string[]]$Roles = @("customer", "courier"),
  [string[]]$States = @("foreground", "background", "killed"),
  [string]$AdminServicePath = "backend/admin-service",
  [string]$BackendContainer = "tembus-admin",
  [switch]$UseHostBackend,
  [string]$OutputDir = "artifacts/fcm-os-validation"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$adminPath = Join-Path $root $AdminServicePath
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path (Join-Path $root $OutputDir) $timestamp
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$normalizedRoles = @($Roles | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$normalizedStates = @($States | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$apps = @(
  @{
    role = "customer"
    package = "com.lancar.customer"
    serial = $CustomerSerial
    logTags = @("TEMBUSFCMService")
  },
  @{
    role = "courier"
    package = "com.lancar.courier"
    serial = $CourierSerial
    logTags = @("FCM_TEMBUS")
  }
)

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $root,
    [switch]$AllowFailure
  )

  Push-Location $WorkingDirectory
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Pop-Location
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Command failed ($exitCode): $FilePath $($Arguments -join ' ')`n$output"
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join "`n") }
}

function Get-AdbDevices {
  $result = Invoke-Checked -FilePath "adb" -Arguments @("devices")
  return $result.Output -split "`n" |
    Where-Object { $_ -match "device$" -and $_ -notmatch "^List" } |
    ForEach-Object { ($_ -split "\s+")[0] }
}

function Resolve-Serials {
  $devices = @(Get-AdbDevices)
  if ($devices.Count -eq 0) {
    throw "No adb devices found. Open Android Studio emulator first."
  }

  if (-not $apps[0].serial) { $apps[0].serial = $devices[0] }
  if (-not $apps[1].serial) {
    $apps[1].serial = if ($devices.Count -gt 1) { $devices[1] } else { $devices[0] }
  }
}

function Invoke-Adb {
  param(
    [string]$Serial,
    [string[]]$Arguments,
    [switch]$AllowFailure
  )
  return Invoke-Checked -FilePath "adb" -Arguments (@("-s", $Serial) + $Arguments) -AllowFailure:$AllowFailure
}

function Start-App {
  param([hashtable]$App)
  Invoke-Adb -Serial $App.serial -Arguments @("shell", "monkey", "-p", $App.package, "-c", "android.intent.category.LAUNCHER", "1") | Out-Null
  Start-Sleep -Seconds 4
}

function Put-AppInBackground {
  param([hashtable]$App)
  Start-App -App $App
  Invoke-Adb -Serial $App.serial -Arguments @("shell", "input", "keyevent", "HOME") | Out-Null
  Start-Sleep -Seconds 2
}

function Kill-AppProcessOnly {
  param([hashtable]$App)
  Put-AppInBackground -App $App
  Invoke-Adb -Serial $App.serial -Arguments @("shell", "am", "kill", $App.package) -AllowFailure | Out-Null
  Start-Sleep -Seconds 2
}

function Prepare-AppState {
  param(
    [hashtable]$App,
    [string]$State
  )

  Invoke-Adb -Serial $App.serial -Arguments @("shell", "pm", "grant", $App.package, "android.permission.POST_NOTIFICATIONS") -AllowFailure | Out-Null

  if ($State -eq "foreground") {
    Start-App -App $App
    return
  }

  if ($State -eq "background") {
    Put-AppInBackground -App $App
    return
  }

  if ($State -eq "killed") {
    Kill-AppProcessOnly -App $App
    return
  }

  throw "Unsupported state: $State"
}

function Send-FcmProbe {
  param(
    [string]$Role,
    [string]$State
  )

  if ($UseHostBackend) {
    $result = Invoke-Checked `
      -FilePath "npm" `
      -Arguments @("run", "fcm:probe", "--", "--role", $Role, "--state", $State) `
      -WorkingDirectory $adminPath
  } else {
    $result = Invoke-Checked `
      -FilePath "docker" `
      -Arguments @("exec", "-e", "FCM_SEND_TIMEOUT_MS=15000", $BackendContainer, "node", "dist/scripts/sendFcmDeviceProbe.js", "--role", $Role, "--state", $State)
  }

  $marker = "__FCM_PROBE_RESULT__"
  $markerStart = $result.Output.LastIndexOf($marker)
  if ($markerStart -lt 0) {
    throw "FCM probe did not return JSON: $($result.Output)"
  }

  $jsonPayload = $result.Output.Substring($markerStart + $marker.Length)
  $probe = $jsonPayload | ConvertFrom-Json
  if ($probe.success -ne $true) {
    throw "FCM probe failed for ${Role}/${State}: $($probe.error)"
  }
  return $probe
}

function Test-Evidence {
  param(
    [hashtable]$App,
    [string]$State,
    [string]$ProbeId
  )

  Start-Sleep -Seconds 10

  $safeName = "$($App.role)-$State"
  $logPath = Join-Path $runDir "$safeName-logcat.txt"
  $notificationPath = Join-Path $runDir "$safeName-notifications.txt"

  $logcat = Invoke-Adb -Serial $App.serial -Arguments @("logcat", "-d") -AllowFailure
  Set-Content -LiteralPath $logPath -Value $logcat.Output -Encoding UTF8

  $notifications = Invoke-Adb -Serial $App.serial -Arguments @("shell", "dumpsys", "notification", "--noredact") -AllowFailure
  Set-Content -LiteralPath $notificationPath -Value $notifications.Output -Encoding UTF8

  $tagHit = $false
  foreach ($tag in $App.logTags) {
    if ($logcat.Output -match [regex]::Escape($tag)) {
      $tagHit = $true
      break
    }
  }

  $probeHit = $logcat.Output -match [regex]::Escape($ProbeId)
  $notificationHit = $notifications.Output -match [regex]::Escape($App.package) -or
    $notifications.Output -match "Tes tawaran TEMBUS" -or
    $notifications.Output -match "Tes tracking TEMBUS"

  return [pscustomobject]@{
    role = $App.role
    state = $State
    serial = $App.serial
    package = $App.package
    probe_id = $ProbeId
    log_tag_seen = $tagHit
    probe_id_seen_in_logcat = $probeHit
    notification_seen = $notificationHit
    logcat_artifact = $logPath
    notification_artifact = $notificationPath
    passed = ($tagHit -or $probeHit -or $notificationHit)
  }
}

Resolve-Serials

$summary = [System.Collections.Generic.List[object]]::new()

foreach ($app in ($apps | Where-Object { $normalizedRoles -contains $_.role })) {
  $installed = Invoke-Adb -Serial $app.serial -Arguments @("shell", "pm", "path", $app.package) -AllowFailure
  if ($installed.ExitCode -ne 0 -or -not $installed.Output.Trim()) {
    throw "$($app.role) package $($app.package) is not installed on $($app.serial)."
  }

  foreach ($state in $normalizedStates) {
    Write-Host "Validating $($app.role) $state on $($app.serial)..."
    Invoke-Adb -Serial $app.serial -Arguments @("logcat", "-c") -AllowFailure | Out-Null
    Prepare-AppState -App $app -State $state
    $probe = Send-FcmProbe -Role $app.role -State $state
    $evidence = Test-Evidence -App $app -State $state -ProbeId $probe.probe_id
    $summary.Add($evidence)
  }
}

$summaryPath = Join-Path $runDir "summary.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$failed = @($summary | Where-Object { -not $_.passed })
if ($failed.Count -gt 0) {
  Write-Host "FCM OS validation failed. Artifacts: $runDir"
  $failed | Format-Table role, state, serial, log_tag_seen, probe_id_seen_in_logcat, notification_seen
  exit 1
}

Write-Host "FCM OS validation passed. Artifacts: $runDir"
$summary | Format-Table role, state, serial, log_tag_seen, probe_id_seen_in_logcat, notification_seen
