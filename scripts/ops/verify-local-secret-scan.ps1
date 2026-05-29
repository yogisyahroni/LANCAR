param(
  [string]$Source = ".",
  [switch]$VerboseScan
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
  param([string]$PathValue)

  $resolvedPath = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
  return $resolvedPath.ProviderPath
}

function Test-CommandExists {
  param([string]$Name)

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

$scanSource = Resolve-RepoPath -PathValue $Source

if (-not (Test-CommandExists -Name "gitleaks")) {
  Write-Host "gitleaks is not installed or not available on PATH." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Install options:"
  Write-Host "  winget install gitleaks"
  Write-Host "  scoop install gitleaks"
  Write-Host "  choco install gitleaks"
  Write-Host ""
  Write-Host "After install, rerun:"
  Write-Host "  pwsh scripts/ops/verify-local-secret-scan.ps1"
  exit 2
}

$arguments = @(
  "detect",
  "--source", $scanSource,
  "--redact",
  "--no-banner"
)

if ($VerboseScan) {
  $arguments += "--verbose"
}

Write-Host "Running gitleaks secret scan against $scanSource"
& gitleaks @arguments
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host "Secret scan failed. Review redacted findings before committing or deploying." -ForegroundColor Red
  exit $exitCode
}

Write-Host "Secret scan passed: no leaks detected." -ForegroundColor Green
