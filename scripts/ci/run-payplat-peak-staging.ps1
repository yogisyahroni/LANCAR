param(
  # k6 runs inside a Docker container; host.docker.internal is the host
  # gateway from that container. The fixture calls below normalize it back to
  # localhost for PowerShell on the host.
  [string]$BaseUrl = 'http://host.docker.internal:8080',
  [int]$Workers = 14,
  [int]$WorkerQuoteRps = 8,
  [int]$WorkerCheckoutRps = 2,
  [int]$WorkerCallbackRps = 2,
  [string]$ProfileDuration = '5s',
  [string]$NextStage = 'city_production',
  [int]$SafetyMarginPct = 50
)

$ErrorActionPreference = 'Stop'

$fixtureBaseUrl = $BaseUrl -replace '^http://host\.docker\.internal:', 'http://localhost:'
if ($fixtureBaseUrl -match '^http://localhost:') {
  $fixtureBaseUrl = $fixtureBaseUrl -replace '^http://localhost:', 'http://127.0.0.1:'
}
$loginUrl = $env:PAYPLAT_LOGIN_URL
if ([string]::IsNullOrWhiteSpace($loginUrl)) { $loginUrl = $fixtureBaseUrl }
$customerEmail = $env:PAYPLAT_CUSTOMER_EMAIL
$customerPassword = $env:PAYPLAT_CUSTOMER_PASSWORD
$deviceId = $env:PAYPLAT_DEVICE_ID
if ([string]::IsNullOrWhiteSpace($customerEmail) -or [string]::IsNullOrWhiteSpace($customerPassword)) {
  throw 'PAYPLAT_CUSTOMER_EMAIL and PAYPLAT_CUSTOMER_PASSWORD are required through the environment'
}
if ([string]::IsNullOrWhiteSpace($deviceId)) { $deviceId = 'k6-payplat-010' }

$loginBody = @{ email = $customerEmail; password = $customerPassword; device_id = $deviceId } | ConvertTo-Json
$login = $null
for ($attempt = 1; $attempt -le 4; $attempt++) {
  try {
    $login = Invoke-RestMethod -Uri "$loginUrl/api/v1/auth/customer/login/start" -Method Post -Headers @{ Connection = 'close' } `
      -ContentType 'application/json' -Body $loginBody
    break
  } catch {
    if ($attempt -eq 4) { throw }
    Start-Sleep -Milliseconds (250 * $attempt)
  }
}
$customerToken = [string]$login.access_token
if ([string]::IsNullOrWhiteSpace($customerToken)) { throw 'trusted staging login did not return an access token' }

$customerUserId = (docker exec tembus-db psql -U postgres -d tembus -Atc "SELECT id::text FROM users WHERE email='$customerEmail' AND deleted_at IS NULL LIMIT 1").Trim()
$internalKeyLine = docker inspect tembus-payment --format '{{range .Config.Env}}{{println .}}{{end}}' | Select-String '^INTERNAL_PAYMENT_API_KEY='
$internalKey = if ($internalKeyLine) { ($internalKeyLine.ToString() -split '=', 2)[1] } else { '' }
if ([string]::IsNullOrWhiteSpace($customerUserId) -or [string]::IsNullOrWhiteSpace($internalKey)) {
  throw 'staging payment fixture identity/configuration is incomplete'
}

$runId = "payplat-010-distributed-$(Get-Date -Format yyyyMMddHHmmss)-$([guid]::NewGuid().ToString('N').Substring(0,8))"
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
    # The gateway intentionally closes authenticated fixture responses. Keep
    # PowerShell from reusing that closed socket for the following order call.
    Connection = 'close'
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

  $intentBody = @{ order_id = $orderId; market_code = 'id-jk'; currency = 'IDR'; amount_minor = 10000; payment_method = 'qris' } | ConvertTo-Json
  $intent = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      $intent = Invoke-RestMethod -Uri 'http://127.0.0.1:8084/api/v1/payment-intents' -Method Post `
        -Headers @{ 'X-User-ID' = $customerUserId; 'Idempotency-Key' = "$runId-intent-fixture"; Connection = 'close' } `
        -ContentType 'application/json' -Body $intentBody
      break
    } catch {
      if ($attempt -eq 4) { throw }
      Start-Sleep -Milliseconds (250 * $attempt)
    }
  }
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
    function Get-JsonPropertyValue($object, [string]$propertyName) {
      if ($null -eq $object) { return $null }
      $property = @($object.PSObject.Properties | Where-Object { $_.Name -eq $propertyName } | Select-Object -First 1)
      if ($property.Count -eq 1) { return $property[0].Value }
      return $null
    }
    function Get-K6MetricValues($metrics, [string]$metricName) {
      $metric = Get-JsonPropertyValue $metrics $metricName
      if ($null -eq $metric) { return $null }
      $nestedValues = Get-JsonPropertyValue $metric 'values'
      if ($null -ne $nestedValues) { return $nestedValues }
      return $metric
    }
    $httpReqsValues = Get-K6MetricValues $summary.metrics 'http_reqs'
    $checksValues = Get-K6MetricValues $summary.metrics 'checks'
    $droppedValues = Get-K6MetricValues $summary.metrics 'dropped_iterations'
    $failedValues = Get-K6MetricValues $summary.metrics 'http_req_failed'
    $requestCount = Get-JsonPropertyValue $httpReqsValues 'count'
    $checkCount = Get-JsonPropertyValue $checksValues 'count'
    if ($null -eq $checkCount) {
      $checkPasses = Get-JsonPropertyValue $checksValues 'passes'
      $checkFails = Get-JsonPropertyValue $checksValues 'fails'
      if ($null -ne $checkPasses -and $null -ne $checkFails) {
        $checkCount = [int]$checkPasses + [int]$checkFails
      }
    }
    $droppedCount = Get-JsonPropertyValue $droppedValues 'count'
    $failureRate = Get-JsonPropertyValue $failedValues 'rate'
    if ($null -eq $failureRate) {
      $failureRate = Get-JsonPropertyValue $failedValues 'value'
    }
    if ($null -eq $requestCount -or $null -eq $checkCount -or $null -eq $failureRate) {
      Write-Output ("k6_summary_top_level=" + (($summary.PSObject.Properties.Name) -join ','))
      Write-Output ("k6_summary_metric_names=" + ($(if ($summary.metrics) { $summary.metrics.PSObject.Properties.Name -join ',' } else { 'NONE' })))
      Write-Output ("k6_summary_http_reqs_properties=" + ($(if ($httpReqsValues) { $httpReqsValues.PSObject.Properties.Name -join ',' } else { 'NONE' })))
      Write-Output ("k6_summary_checks_properties=" + ($(if ($checksValues) { $checksValues.PSObject.Properties.Name -join ',' } else { 'NONE' })))
      Write-Output ("k6_summary_failed_properties=" + ($(if ($failedValues) { $failedValues.PSObject.Properties.Name -join ',' } else { 'NONE' })))
      throw "k6 summary is missing required metrics in $($reportFile.Name)"
    }
    $totalRequests += [int]$requestCount
    $totalChecks += [int]$checkCount
    if ($null -ne $droppedCount) {
      $totalDropped += [int]$droppedCount
    }
    $maxFailureRate = [math]::Max($maxFailureRate, [double]$failureRate)
  }
  Write-Output "distributed_workers=$Workers"
  Write-Output "worker_failures=$workerFailures"
  Write-Output "summary_reports=$($reports.Count)"
  Write-Output "aggregate_http_requests=$totalRequests"
  Write-Output "aggregate_checks=$totalChecks"
  Write-Output "aggregate_dropped_iterations=$totalDropped"
  Write-Output ("max_worker_http_failure_rate={0:P2}" -f $maxFailureRate)
  if ($workerFailures -ne 0 -or $reports.Count -ne $Workers) { throw 'one or more distributed k6 workers failed' }
  if ($totalRequests -le 0 -or $totalChecks -le 0) { throw 'k6 reports contained no request/check samples' }
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
