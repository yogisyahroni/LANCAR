param(
  [string]$BaseUrl = 'http://localhost:8080',
  [int]$Workers = 14,
  [int]$WorkerQuoteRps = 8,
  [int]$WorkerCheckoutRps = 2,
  [int]$WorkerCallbackRps = 2,
  [string]$ProfileDuration = '5s',
  [string]$NextStage = 'city_production',
  [int]$SafetyMarginPct = 50
)

$ErrorActionPreference = 'Stop'

$loginUrl = $env:PAYPLAT_LOGIN_URL
if ([string]::IsNullOrWhiteSpace($loginUrl)) { $loginUrl = 'https://api.bawain.my.id' }
$customerEmail = $env:PAYPLAT_CUSTOMER_EMAIL
$customerPassword = $env:PAYPLAT_CUSTOMER_PASSWORD
$deviceId = $env:PAYPLAT_DEVICE_ID
if ([string]::IsNullOrWhiteSpace($customerEmail) -or [string]::IsNullOrWhiteSpace($customerPassword)) {
  throw 'PAYPLAT_CUSTOMER_EMAIL and PAYPLAT_CUSTOMER_PASSWORD are required through the environment'
}
if ([string]::IsNullOrWhiteSpace($deviceId)) { $deviceId = 'k6-payplat-010' }

$login = Invoke-RestMethod -Uri "$loginUrl/api/v1/auth/customer/login/start" -Method Post `
  -ContentType 'application/json' -Body (@{ email = $customerEmail; password = $customerPassword; device_id = $deviceId } | ConvertTo-Json)
$customerToken = [string]$login.access_token
if ([string]::IsNullOrWhiteSpace($customerToken)) { throw 'trusted staging login did not return an access token' }

$customerUserId = (docker exec tembus-db psql -U postgres -d tembus -Atc "SELECT id::text FROM users WHERE email='$customerEmail' AND deleted_at IS NULL LIMIT 1").Trim()
$internalKeyLine = docker inspect tembus-payment --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String '^INTERNAL_PAYMENT_API_KEY='
$internalKey = if ($internalKeyLine) { ($internalKeyLine.ToString() -split '=', 2)[1] } else { '' }
if ([string]::IsNullOrWhiteSpace($customerUserId) -or [string]::IsNullOrWhiteSpace($internalKey)) {
  throw 'staging payment fixture identity/configuration is incomplete'
}

$runId = "payplat-010-distributed-$(Get-Date -Format yyyyMMddHHmmss)-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$fixtureBaseUrl = $BaseUrl -replace '^http://host\.docker\.internal:', 'http://localhost:'
$packageDetails = @{
  item_description = 'PAYPLAT-2026-010 disposable staging package'
  category = 'document'
  weight_kg = 1
  quantity = 1
  dangerous_goods = $false
  vehicle_type = 'motor'
  size_tier = 'small'
}
$quotePayload = @{
  pickup = @{ lat = -6.25052; lng = 106.88576 }
  dropoff = @{ lat = -6.17539; lng = 106.82715 }
  dimensions = @{ length_cm = 0; width_cm = 0; height_cm = 0 }
  package_details = $packageDetails
  weight_kg = 1
  service_code = 'tembus_instant'
  size_tier = 'small'
  item_value = 0
  recipient_name = 'PAYPLAT load fixture'
  recipient_phone = '+6287885358663'
} | ConvertTo-Json -Depth 8
$orderId = ''
$intentId = ''
$reportDir = Join-Path ([System.IO.Path]::GetTempPath()) ('payplat010-' + [guid]::NewGuid().ToString('N'))
$jobs = @()

try {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  $fixtureHeaders = @{
    Authorization = "Bearer $customerToken"
    'X-Device-Id' = $deviceId
    'X-Correlation-Id' = "$runId-fixture"
  }
  $quoteResponse = Invoke-WebRequest -Uri "$fixtureBaseUrl/api/v1/customer/orders/calculate" -Method Post `
    -Headers $fixtureHeaders -ContentType 'application/json' -Body $quotePayload -SkipHttpErrorCheck
  if ($quoteResponse.StatusCode -ne 200) { throw "fixture quote failed with HTTP $($quoteResponse.StatusCode)" }
  $quote = $quoteResponse.Content | ConvertFrom-Json

  $orderPayload = @{
    pickup_address = 'Halim HSR Station, Jakarta Timur'
    pickup_location = @{ lat = -6.25052; lng = 106.88576; accuracy_m = 10; source = 'load-test' }
    dropoff_address = 'Monumen Nasional, Jakarta Pusat'
    dropoff_location = @{ lat = -6.17539; lng = 106.82715; accuracy_m = 10; source = 'load-test' }
    recipient_name = 'PAYPLAT load fixture'
    recipient_phone = '+6287885358663'
    package_details = $packageDetails
    packages = @(@{ description = $packageDetails.item_description; category = 'document'; weight_kg = 1; quantity = 1 })
    service_code = 'tembus_instant'
    payment_method = 'lapay'
    schedule_type = 'now'
    quote_id = $quote.quote_id
    quote_input_fingerprint = $quote.input_fingerprint
    quote_snapshot_hash = $quote.snapshot_hash
    quote_expires_at = $quote.expires_at
    quote_total_price_idr = $quote.total_price_idr
    price_breakdown = $quote
    customer_notes = "$runId-fixture"
  } | ConvertTo-Json -Depth 12
  $orderResponse = Invoke-WebRequest -Uri "$fixtureBaseUrl/api/v1/customer/orders" -Method Post `
    -Headers ($fixtureHeaders + @{ 'X-Idempotency-Key' = "$runId-order-fixture" }) `
    -ContentType 'application/json' -Body $orderPayload -SkipHttpErrorCheck
  if ($orderResponse.StatusCode -ne 201) { throw "fixture order failed with HTTP $($orderResponse.StatusCode)" }
  $order = $orderResponse.Content | ConvertFrom-Json
  $orderId = [string]$order.order.id

  $intent = Invoke-RestMethod -Uri 'http://localhost:8084/api/v1/payment-intents' -Method Post `
    -Headers @{ 'X-User-ID' = $customerUserId; 'Idempotency-Key' = "$runId-intent-fixture" } `
    -ContentType 'application/json' `
    -Body (@{ order_id = $orderId; market_code = 'id-jk'; currency = 'IDR'; amount_minor = 10000; payment_method = 'qris' } | ConvertTo-Json)
  $intentId = [string]$intent.data.id
  if ([string]::IsNullOrWhiteSpace($intentId)) { throw 'fixture payment intent did not return an id' }

  $mount = "{0}\scripts\ci\k6:/scripts:ro" -f (Get-Location).Path
  $reportMount = $reportDir + ':/reports'
  for ($worker = 1; $worker -le $Workers; $worker++) {
    $jobs += Start-Job -ScriptBlock {
      param($workerId, $mountPath, $reportMountPath, $apiBase, $token, $userId, $paymentKey, $intent, $run, $quoteRps, $checkoutRps, $callbackRps, $duration, $device, $nextStage, $marginPct)
      $reportPath = "/reports/worker-$workerId.json"
      $dockerArgs = @(
        'run', '--rm', '--add-host=host.docker.internal:host-gateway', '-v', $mountPath, '-v', $reportMountPath,
        '-e', "BASE_URL=$apiBase", '-e', 'PAYMENT_BASE_URL=http://host.docker.internal:8084',
        '-e', "CUSTOMER_TOKEN=$token", '-e', "CUSTOMER_USER_ID=$userId", '-e', "INTERNAL_PAYMENT_API_KEY=$paymentKey",
        '-e', "PAYMENT_INTENT_ID=$intent", '-e', "PAYPLAT_RUN_ID=$run", '-e', "PAYPLAT_WORKER_ID=$workerId",
        '-e', "QUOTE_RPS=$quoteRps", '-e', "CHECKOUT_RPS=$checkoutRps", '-e', "CALLBACK_RPS=$callbackRps",
        '-e', "PROFILE_DURATION=$duration", '-e', "DEVICE_ID=$device", '-e', "NEXT_STAGE=$nextStage", '-e', "SAFETY_MARGIN_PCT=$marginPct", 'grafana/k6:0.49.0',
        'run', '--quiet', "--summary-export=$reportPath", '/scripts/payplat-peak-staging.js'
      )
      $logPath = Join-Path $env:TEMP "payplat010-worker-$workerId.log"
      & docker @dockerArgs *> $logPath
      [pscustomobject]@{ worker = $workerId; exit_code = $LASTEXITCODE }
    } -ArgumentList $worker, $mount, $reportMount, $BaseUrl, $customerToken, $customerUserId, $internalKey, $intentId, $runId, $WorkerQuoteRps, $WorkerCheckoutRps, $WorkerCallbackRps, $ProfileDuration, $deviceId, $NextStage, $SafetyMarginPct
  }

  $results = @($jobs | Wait-Job | Receive-Job)
  $workerFailures = @($results | Where-Object { $_.exit_code -ne 0 }).Count
  $reports = @(Get-ChildItem -LiteralPath $reportDir -Filter 'worker-*.json' -File)
  $totalRequests = 0
  $totalChecks = 0
  $totalDropped = 0
  $maxFailureRate = 0.0
  foreach ($reportFile in $reports) {
    $summary = Get-Content -LiteralPath $reportFile.FullName -Raw | ConvertFrom-Json
    $totalRequests += [int]$summary.metrics.http_reqs.values.count
    $totalChecks += [int]$summary.metrics.checks.values.count
    $totalDropped += [int]$summary.metrics.dropped_iterations.values.count
    $maxFailureRate = [math]::Max($maxFailureRate, [double]$summary.metrics.http_req_failed.values.rate)
  }
  Write-Output "distributed_workers=$Workers"
  Write-Output "worker_failures=$workerFailures"
  Write-Output "summary_reports=$($reports.Count)"
  Write-Output "aggregate_http_requests=$totalRequests"
  Write-Output "aggregate_checks=$totalChecks"
  Write-Output "aggregate_dropped_iterations=$totalDropped"
  Write-Output ("max_worker_http_failure_rate={0:P2}" -f $maxFailureRate)
  if ($workerFailures -ne 0 -or $reports.Count -ne $Workers) { throw 'one or more distributed k6 workers failed' }
}
finally {
  $safeRunId = $runId.Replace("'", "''")
  $cleanupSql = @'
BEGIN;
CREATE TEMP TABLE payplat_cleanup_ids AS
  SELECT id FROM orders WHERE customer_notes LIKE '__RUN_ID__%';
DELETE FROM payment_intent_events
 WHERE intent_id IN (SELECT id FROM payment_intents WHERE order_id IN (SELECT id FROM payplat_cleanup_ids));
DELETE FROM payments WHERE order_id IN (SELECT id FROM payplat_cleanup_ids);
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT DISTINCT tc.table_schema, tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name = 'order_id'
       AND tc.table_schema = 'public'
       AND tc.table_name NOT IN ('orders', 'payments', 'payment_intents')
  LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE order_id IN (SELECT id FROM payplat_cleanup_ids)', item.table_schema, item.table_name);
  END LOOP;
END
$$;
DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM payplat_cleanup_ids);
DELETE FROM orders WHERE id IN (SELECT id FROM payplat_cleanup_ids);
COMMIT;
SELECT COUNT(*) AS remaining_orders FROM orders WHERE customer_notes LIKE '__RUN_ID__%';
'@.Replace('__RUN_ID__', $safeRunId)
  $cleanupOutput = docker exec -i tembus-db psql -U postgres -d tembus -v ON_ERROR_STOP=1 -Atc $cleanupSql
  Write-Output ('fixture_cleanup=' + (($cleanupOutput -join ' ') -replace '\s+', ' ').Trim())
  if ($jobs.Count -gt 0) { Remove-Job -Force -ErrorAction SilentlyContinue $jobs }
  Remove-Item -LiteralPath $reportDir -Recurse -Force -ErrorAction SilentlyContinue
}
