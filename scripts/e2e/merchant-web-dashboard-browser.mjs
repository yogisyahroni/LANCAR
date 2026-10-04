import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium, request } from '../../frontend/node_modules/playwright/index.mjs'

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8080/api/v1'
const requestBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
const webOrigin = process.env.WEB_ORIGIN || 'http://127.0.0.1:3086'
const adminEmail = process.env.MERCHANT_E2E_ADMIN_EMAIL
const adminPassword = process.env.MERCHANT_E2E_ADMIN_PASSWORD
const chromePath = process.env.CHROME_PATH
const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
const testEmail = `mweb-browser-${runId}@example.test`
const testPhone = `0812${runId.replace(/\D/g, '').slice(-8)}`
const testPassword = `E2e-${runId}-merchant!`
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const documentPath = path.join(repoRoot, 'extracted_logo.png')

if (!adminEmail || !adminPassword) {
  throw new Error('Set MERCHANT_E2E_ADMIN_EMAIL and MERCHANT_E2E_ADMIN_PASSWORD for the local harness.')
}

const assertOk = async (response, label) => {
  if (response.ok()) return response
  const body = await response.text()
  throw new Error(`${label} failed with HTTP ${response.status()}: ${body.slice(0, 400)}`)
}

const json = async (response, label) => {
  await assertOk(response, label)
  return response.json()
}

const runDb = (sql) => {
  const encoded = Buffer.from(sql, 'utf8').toString('base64')
  const shell = `printf '%s' '${encoded}' | base64 -d | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At`
  return execFileSync('docker', ['exec', 'tembus-db', 'sh', '-c', shell], { encoding: 'utf8' }).trim()
}

const escapedEmail = testEmail.replaceAll("'", "''")
let merchantId = null
let previousAdmin2fa = null
let customerApi = null
let adminApi = null
let browser = null
let browserPage = null
const pageErrors = []
const failedRequests = []

try {
  previousAdmin2fa = runDb(`SELECT COALESCE(is_2fa_enabled, false) FROM users WHERE email = '${adminEmail.replaceAll("'", "''")}';`)
  if (!previousAdmin2fa) throw new Error('Admin test identity was not found.')
  runDb(`UPDATE users SET is_2fa_enabled = true WHERE email = '${adminEmail.replaceAll("'", "''")}';`)

  customerApi = await request.newContext({
    baseURL: requestBaseUrl,
    extraHTTPHeaders: { Origin: webOrigin, 'X-Portal': 'merchant' },
  })
  const registration = await json(await customerApi.post('auth/customer/register/start', {
    data: {
      full_name: 'Merchant Browser E2E',
      email: testEmail,
      phone_number: testPhone,
      password: testPassword,
      device_id: `merchant-browser-${runId}`,
      device_info: { platform: 'web', app: 'merchant-web-browser-e2e' },
    },
  }), 'customer registration')
  if (registration.require_otp === true) throw new Error('OTP is enabled; local browser harness requires a local OTP fixture.')
  if (!registration.access_token) throw new Error('Customer registration did not return an access token.')

  await json(await customerApi.post('auth/web/session/exchange', {
    data: { access_token: registration.access_token },
    headers: { 'X-Portal': 'merchant' },
  }), 'merchant web session exchange')

  const documentBuffer = fs.readFileSync(documentPath)
  const documents = {}
  for (const docType of ['ktp_pemilik', 'foto_tempat_usaha', 'rekening_bank', 'nib']) {
    const upload = await json(await customerApi.post('auth/merchant/documents/upload', {
      multipart: {
        file: { name: `browser-${docType}.png`, mimeType: 'image/png', buffer: documentBuffer },
        doc_type: docType,
      },
    }), `upload ${docType}`)
    documents[docType] = upload.data.file_url
  }

  const merchant = await json(await customerApi.post('merchant/register', {
    data: {
      nama_toko: 'Merchant Browser E2E',
      alamat: 'Jl. Uji Browser No. 1, Jakarta Selatan',
      jam_buka: '08:00',
      jam_tutup: '22:00',
      lokasi_lat: -6.2615,
      lokasi_lng: 106.8106,
      business_type: 'perusahaan',
      ktp_pemilik_url: documents.ktp_pemilik,
      foto_tempat_usaha_url: documents.foto_tempat_usaha,
      rekening_bank_url: documents.rekening_bank,
      nib_url: documents.nib,
    },
  }), 'merchant registration')
  merchantId = String(merchant.id)

  adminApi = await request.newContext({
    baseURL: requestBaseUrl,
    extraHTTPHeaders: { Origin: webOrigin },
  })
  await json(await adminApi.post('auth/web/login', {
    data: { email: adminEmail, password: adminPassword, portal: 'admin' },
    headers: { 'X-Portal': 'admin' },
  }), 'admin login')
  const adminState = await adminApi.storageState()
  const csrfCookie = adminState.cookies.find((cookie) => cookie.name === 'tembus_admin_csrf')
  const csrfToken = csrfCookie?.value || crypto.randomUUID().replaceAll('-', '')
  if (!csrfCookie) {
    const apiHost = new URL(apiBaseUrl).hostname
    const normalizedCookies = adminState.cookies.map((cookie) => ({
      ...cookie,
      domain: cookie.domain || apiHost,
      path: cookie.path || '/',
      expires: Number.isFinite(cookie.expires) ? cookie.expires : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite || 'Lax',
    }))
    await adminApi.dispose()
    adminApi = await request.newContext({
      baseURL: requestBaseUrl,
      storageState: {
        cookies: [
          ...normalizedCookies,
          { name: 'tembus_admin_csrf', value: csrfToken, domain: apiHost, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
        ],
        origins: [],
      },
      extraHTTPHeaders: { Origin: webOrigin },
    })
  }
  const adminMutation = async (route, key) => json(await adminApi.post(route.replace(/^\/+/, ''), {
    data: {},
    headers: {
      'X-Idempotency-Key': `merchant-browser-${key}-${runId}`,
      'X-CSRF-Token': csrfToken,
    },
  }), `admin ${key}`)
  await adminMutation(`/admin/merchants/${merchantId}/start-verification`, 'start-verification')
  await adminMutation(`/admin/merchants/${merchantId}/approve`, 'approve')

  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) })
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await browserContext.newPage()
  browserPage = page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (req) => failedRequests.push({ method: req.method(), url: req.url(), failure: req.failure()?.errorText || 'unknown' }))
  await page.goto(`${webOrigin}/masuk`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(testEmail)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: /Masuk/ }).click()
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 15_000 })
  await page.getByText('Data server diperbarui').waitFor({ timeout: 15_000 })

  const dashboardRequests = []
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/merchant/dashboard')) dashboardRequests.push(Date.now())
  })
  const openButton = page.getByRole('button', { name: /Toko (BUKA|TUTUP)/ }).first()
  const currentLabel = await openButton.innerText()
  const nextOpen = !currentLabel.includes('BUKA')
  const beforeRefreshCount = dashboardRequests.length
  const externalMutation = await browserContext.request.post(`${apiBaseUrl}/merchant/toggle-open`, {
    data: { is_open: nextOpen },
    headers: { Origin: webOrigin, 'X-Portal': 'merchant' },
  })
  await assertOk(externalMutation, 'external operating-state mutation')

  const deadline = Date.now() + 10_000
  while (dashboardRequests.length <= beforeRefreshCount && Date.now() < deadline) {
    await page.waitForTimeout(250)
  }
  if (dashboardRequests.length <= beforeRefreshCount) {
    throw new Error('Merchant Web did not refetch dashboard after the external operating-state event.')
  }
  await page.getByRole('button', { name: nextOpen ? /Toko BUKA/ : /Toko TUTUP/ }).first().waitFor()

  console.log(JSON.stringify({
    task_id: 'MWEB-PORTAL-P0-002',
    status: 'PASS',
    checks: ['admin_approval', 'browser_login', 'dashboard_freshness', 'external_operating_state_mutation', 'socket_event_dashboard_refetch'],
    dashboard_refetch_count: dashboardRequests.length,
    page_errors: pageErrors,
  }))
  await browserContext.close()
} catch (error) {
  const bodyText = browserPage ? (await browserPage.locator('body').innerText().catch(() => '')).slice(0, 1200) : ''
  console.error(JSON.stringify({
    browser_failure: error.message,
    browser_url: browserPage?.url() || null,
    page_errors: pageErrors,
    failed_requests: failedRequests.slice(-10),
    body_text: bodyText,
  }))
  throw error
} finally {
  await browser?.close().catch(() => undefined)
  await customerApi?.dispose().catch(() => undefined)
  await adminApi?.dispose().catch(() => undefined)
  try {
    const merchantCleanup = merchantId
      ? `DELETE FROM merchant_onboarding_reviews WHERE merchant_id = '${merchantId}'; DELETE FROM merchant_legal_profiles WHERE owner_user_id IN (SELECT user_id FROM merchants WHERE id = '${merchantId}');`
      : ''
    runDb(`${merchantCleanup} DELETE FROM users WHERE email = '${escapedEmail}';`)
  } catch (error) {
    console.error(`Disposable merchant cleanup failed: ${error.message}`)
  }
  if (previousAdmin2fa !== null) {
    try {
      const adminSqlEmail = adminEmail.replaceAll("'", "''")
      runDb(`UPDATE users SET is_2fa_enabled = ${previousAdmin2fa === 't' ? 'true' : 'false'} WHERE email = '${adminSqlEmail}';`)
    } catch (error) {
      console.error(`Admin 2FA restore failed: ${error.message}`)
    }
  }
}
