[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$AdminEmail,

  [Parameter(Mandatory = $true)]
  [string]$AdminPassword,

  [string]$ApiBaseUrl = 'http://localhost:8080/api/v1',
  [string]$WebOrigin = 'https://merchant.bawain.my.id',
  [switch]$KeepData
)

$ErrorActionPreference = 'Stop'
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Net.Http')
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$testEmail = "mweb-e2e-$runId@example.test"
$testPhone = "0812$($runId.ToString().Substring($runId.ToString().Length - 8))"
$testPassword = "E2e-$runId-merchant!"
$apiOrigin = ([Uri]$ApiBaseUrl).GetLeftPart([System.UriPartial]::Authority)
$documentPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\extracted_logo.png')).Path
$adminEmailSql = $AdminEmail.Replace("'", "''")
$testEmailSql = $testEmail.Replace("'", "''")

function Invoke-Db([string]$Sql) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Sql))
  $shell = "printf '%s' '$encoded' | base64 -d | psql -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" -At"
  return (docker exec tembus-db sh -c $shell)
}

function New-ApiClient {
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.CookieContainer = [System.Net.CookieContainer]::new()
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(30)
  $client.DefaultRequestHeaders.ExpectContinue = $false
  Add-Member -InputObject $client -MemberType NoteProperty -Name CookieContainer -Value $handler.CookieContainer
  return $client
}

function Invoke-Api {
  param(
    [System.Net.Http.HttpClient]$Client,
    [ValidateSet('GET', 'POST')][string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = @{},
    [switch]$SkipCsrf
  )

  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::new($Method),
    "$ApiBaseUrl$Path"
  )
  [void]$request.Headers.TryAddWithoutValidation('Origin', $WebOrigin)
  foreach ($header in $Headers.GetEnumerator()) {
    [void]$request.Headers.TryAddWithoutValidation($header.Key, [string]$header.Value)
  }
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    $request.Content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
  }
  $response = $Client.SendAsync($request).GetAwaiter().GetResult()
  $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $data = $null
  if ($text) {
    try { $data = $text | ConvertFrom-Json } catch { $data = $null }
  }
  if (-not $response.IsSuccessStatusCode) {
    throw "HTTP $([int]$response.StatusCode) $Method ${Path}: $text"
  }
  return [pscustomobject]@{
    Status = [int]$response.StatusCode
    Data = $data
  }
}

function Invoke-Upload {
  param(
    [System.Net.Http.HttpClient]$Client,
    [string]$DocType
  )

  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    "$ApiBaseUrl/auth/merchant/documents/upload"
  )
  [void]$request.Headers.TryAddWithoutValidation('Origin', $WebOrigin)
  $multipart = [System.Net.Http.MultipartFormDataContent]::new()
  $bytes = [IO.File]::ReadAllBytes($documentPath)
  $file = [System.Net.Http.ByteArrayContent]::new($bytes)
  $file.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::Parse('image/png')
  $multipart.Add($file, 'file', "e2e-$DocType.png")
  $multipart.Add([System.Net.Http.StringContent]::new($DocType), 'doc_type')
  $request.Content = $multipart
  $response = $Client.SendAsync($request).GetAwaiter().GetResult()
  $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "HTTP $([int]$response.StatusCode) POST /auth/merchant/documents/upload: $text"
  }
  return ($text | ConvertFrom-Json).data.file_url
}

$customerClient = New-ApiClient
$adminClient = New-ApiClient
$previousAdmin2fa = $null
$merchantId = $null
$adminSessionReady = $false
$adminCsrfToken = $null

try {
  $previousAdmin2fa = (Invoke-Db "SELECT COALESCE(is_2fa_enabled, false) FROM users WHERE email = '$adminEmailSql';").Trim()
  if ([string]::IsNullOrWhiteSpace($previousAdmin2fa)) {
    throw 'Admin test identity was not found.'
  }
  [void](Invoke-Db "UPDATE users SET is_2fa_enabled = true WHERE email = '$adminEmailSql';")

  $registration = Invoke-Api -Client $customerClient -Method POST -Path '/auth/customer/register/start' -SkipCsrf -Body @{
    full_name = 'Merchant Web E2E Test'
    email = $testEmail
    phone_number = $testPhone
    password = $testPassword
    device_id = "merchant-web-e2e-$runId"
    device_info = @{ platform = 'web'; app = 'merchant-web-e2e' }
  }
  if ($registration.Data.require_otp -eq $true) {
    throw 'OTP is enabled in the local environment; provide a local OTP fixture before running this harness.'
  }
  if ([string]::IsNullOrWhiteSpace($registration.Data.access_token)) {
    throw 'Customer registration did not return a short-lived access token.'
  }

  [void](Invoke-Api -Client $customerClient -Method POST -Path '/auth/web/session/exchange' -SkipCsrf -Body @{ access_token = $registration.Data.access_token })

  $documents = @{}
  foreach ($docType in @('ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib')) {
    $documents[$docType] = Invoke-Upload -Client $customerClient -DocType $docType
  }

  $merchant = Invoke-Api -Client $customerClient -Method POST -Path '/merchant/register' -Body @{
    nama_toko = 'Merchant Web E2E Test'
    alamat = 'Jl. Uji E2E No. 1, Jakarta Selatan'
    jam_buka = '08:00'
    jam_tutup = '22:00'
    lokasi_lat = -6.2615
    lokasi_lng = 106.8106
    business_type = 'perusahaan'
    ktp_pemilik_url = $documents.ktp_pemilik
    foto_tempat_usaha_url = $documents.foto_tempat_usaha
    rekening_bank_url = $documents.rekening_bank
    nib_url = $documents.nib
  }
  $merchantId = [string]$merchant.Data.id
  if ([string]::IsNullOrWhiteSpace($merchantId)) {
    throw 'Merchant registration did not return a merchant id.'
  }

  $status = Invoke-Api -Client (New-ApiClient) -Method GET -Path "/auth/merchant/registration-status?email=$([Uri]::EscapeDataString($testEmail))&phone=$([Uri]::EscapeDataString($testPhone))"
  if ($status.Data.status -ne 'SUBMITTED') { throw "Expected SUBMITTED after registration, got $($status.Data.status)" }

  [void](Invoke-Api -Client $adminClient -Method POST -Path '/auth/web/login' -SkipCsrf -Body @{ email = $AdminEmail; password = $AdminPassword; portal = 'admin' })
  $adminSessionReady = $true
  $adminCsrfToken = [Guid]::NewGuid().ToString('N')
  $adminClient.CookieContainer.SetCookies(([Uri]$ApiBaseUrl), "tembus_admin_csrf=$adminCsrfToken; path=/")
  $idempotency = 0

  $idempotency++
  [void](Invoke-Api -Client $adminClient -Method POST -Path "/admin/merchants/$merchantId/start-verification" -Body @{} -Headers @{ 'X-Idempotency-Key' = "mweb-e2e-start-$runId-$idempotency"; 'X-CSRF-Token' = $adminCsrfToken })
  $idempotency++
  [void](Invoke-Api -Client $adminClient -Method POST -Path "/admin/merchants/$merchantId/reject" -Body @{ reason = 'Dokumen usaha perlu diperbaiki untuk verifikasi.' } -Headers @{ 'X-Idempotency-Key' = "mweb-e2e-reject-$runId-$idempotency"; 'X-CSRF-Token' = $adminCsrfToken })
  $status = Invoke-Api -Client (New-ApiClient) -Method GET -Path "/auth/merchant/registration-status?email=$([Uri]::EscapeDataString($testEmail))&phone=$([Uri]::EscapeDataString($testPhone))"
  if ($status.Data.status -ne 'REJECTED') { throw "Expected REJECTED after Admin rejection, got $($status.Data.status)" }

  [void](Invoke-Api -Client $customerClient -Method POST -Path '/merchant/register' -Body @{
    nama_toko = 'Merchant Web E2E Test Revisi'
    alamat = 'Jl. Uji E2E No. 2, Jakarta Selatan'
    jam_buka = '08:00'
    jam_tutup = '22:00'
    lokasi_lat = -6.2615
    lokasi_lng = 106.8106
    business_type = 'perusahaan'
    ktp_pemilik_url = $documents.ktp_pemilik
    foto_tempat_usaha_url = $documents.foto_tempat_usaha
    rekening_bank_url = $documents.rekening_bank
    nib_url = $documents.nib
  })
  $status = Invoke-Api -Client (New-ApiClient) -Method GET -Path "/auth/merchant/registration-status?email=$([Uri]::EscapeDataString($testEmail))&phone=$([Uri]::EscapeDataString($testPhone))"
  if ($status.Data.status -ne 'SUBMITTED') { throw "Expected SUBMITTED after resubmit, got $($status.Data.status)" }

  $idempotency++
  [void](Invoke-Api -Client $adminClient -Method POST -Path "/admin/merchants/$merchantId/start-verification" -Body @{} -Headers @{ 'X-Idempotency-Key' = "mweb-e2e-start-retry-$runId-$idempotency"; 'X-CSRF-Token' = $adminCsrfToken })
  $idempotency++
  [void](Invoke-Api -Client $adminClient -Method POST -Path "/admin/merchants/$merchantId/approve" -Body @{} -Headers @{ 'X-Idempotency-Key' = "mweb-e2e-approve-$runId-$idempotency"; 'X-CSRF-Token' = $adminCsrfToken })
  $status = Invoke-Api -Client (New-ApiClient) -Method GET -Path "/auth/merchant/registration-status?email=$([Uri]::EscapeDataString($testEmail))&phone=$([Uri]::EscapeDataString($testPhone))"
  if ($status.Data.status -ne 'ACTIVE' -or $status.Data.next_action -ne 'open_portal') { throw "Expected ACTIVE/open_portal after Admin approval, got $($status.Data.status)/$($status.Data.next_action)" }

  $idempotency++
  [void](Invoke-Api -Client $adminClient -Method POST -Path "/admin/merchants/$merchantId/suspend" -Body @{ reason = 'Penangguhan sementara untuk uji pemulihan.' } -Headers @{ 'X-Idempotency-Key' = "mweb-e2e-suspend-$runId-$idempotency"; 'X-CSRF-Token' = $adminCsrfToken })
  $status = Invoke-Api -Client (New-ApiClient) -Method GET -Path "/auth/merchant/registration-status?email=$([Uri]::EscapeDataString($testEmail))&phone=$([Uri]::EscapeDataString($testPhone))"
  if ($status.Data.status -ne 'SUSPENDED' -or $status.Data.next_action -ne 'contact_support') { throw "Expected SUSPENDED/contact_support after Admin suspend, got $($status.Data.status)/$($status.Data.next_action)" }

  $invariant = Invoke-Db "SELECT m.onboarding_status || '|' || m.verification_status || '|' || (SELECT COUNT(*) FROM merchant_documents d WHERE d.merchant_id = m.id) || '|' || (SELECT COUNT(*) FROM merchant_legal_profiles p WHERE p.merchant_id = m.id) || '|' || (SELECT COUNT(*) FROM merchant_onboarding_reviews r WHERE r.merchant_id = m.id) FROM merchants m WHERE m.id = '$merchantId';"
  Write-Output (@{
    task_id = 'MWEB-P0-008'
    status = 'PASS'
    scenario = @('register', 'document_upload', 'admin_verify_reject', 'resubmit', 'admin_approve', 'public_active_status', 'admin_suspend', 'public_suspended_status')
    sanitized = @{ final_status = $status.Data.status; final_next_action = $status.Data.next_action; db_invariant = $invariant.Trim() }
  } | ConvertTo-Json -Depth 8 -Compress)
}
catch {
  Write-Error ("Merchant web E2E failed: " + $_.Exception.Message)
  throw
}
finally {
  if ($adminSessionReady) {
    try { [void](Invoke-Api -Client $adminClient -Method POST -Path '/auth/web/logout' -SkipCsrf) } catch { }
  }
  if (-not $KeepData) {
    try {
      [void](Invoke-Db "DELETE FROM merchant_onboarding_reviews WHERE actor_id IN (SELECT id FROM users WHERE email = '$testEmailSql') OR merchant_id IN (SELECT id FROM merchants WHERE user_id IN (SELECT id FROM users WHERE email = '$testEmailSql'));" )
      [void](Invoke-Db "DELETE FROM merchant_legal_profiles WHERE owner_user_id IN (SELECT id FROM users WHERE email = '$testEmailSql');" )
      [void](Invoke-Db "DELETE FROM users WHERE email = '$testEmailSql';")
      $remaining = (Invoke-Db "SELECT COUNT(*) FROM users WHERE email = '$testEmailSql';").Trim()
      if ($remaining -ne '0') { throw 'Disposable merchant user cleanup did not remove the user row.' }
    } catch {
      Write-Error 'Disposable merchant cleanup failed.'
    }
  }
  if ($null -ne $previousAdmin2fa) {
    $restore = if ($previousAdmin2fa -eq 't') { 'true' } else { 'false' }
    [void](Invoke-Db "UPDATE users SET is_2fa_enabled = $restore WHERE email = '$adminEmailSql';")
  }
  $customerClient.Dispose()
  $adminClient.Dispose()
}
