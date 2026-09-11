import crypto from 'node:crypto'

const baseUrl = (process.env.ADS_LOAD_URL || 'http://127.0.0.1:8091').replace(/\/$/, '')
const count = Number.parseInt(process.env.ADS_LOAD_COUNT || '120', 10)
const concurrency = Number.parseInt(process.env.ADS_LOAD_CONCURRENCY || '20', 10)
const timeoutMs = Number.parseInt(process.env.ADS_LOAD_TIMEOUT_MS || '2000', 10)
const secret = process.env.ADS_GATEWAY_SECRET || ''
const userId = process.env.ADS_LOAD_USER_ID || '00000000-0000-0000-0000-000000000001'
const role = process.env.ADS_LOAD_ROLE || 'customer'

if (secret.length < 32) throw new Error('ADS_GATEWAY_SECRET must be provided through the environment')
if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('ADS_LOAD_COUNT must be between 1 and 5000')
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > count) throw new Error('ADS_LOAD_CONCURRENCY is invalid')

function signedHeaders() {
  const timestamp = String(Date.now())
  const payload = [timestamp, userId, role, '', ''].join('.')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return {
    'X-User-ID': userId,
    'X-User-Role': role,
    'X-Internal-Auth-TS': timestamp,
    'X-Internal-Auth': signature,
    'X-Ads-Context-Resolved': 'true',
    'X-App-Version': 'load-test',
  }
}

async function request(path, index) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers: signedHeaders(), signal: controller.signal })
    await response.arrayBuffer()
    return { ok: response.status >= 200 && response.status < 300, status: response.status, ms: performance.now() - started, index }
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - started, index, error: error.name || 'request_failed' }
  } finally {
    clearTimeout(timer)
  }
}

async function runPhase(name, path) {
  const results = []
  let next = 0
  async function worker() {
    while (true) {
      const index = next++
      if (index >= count) return
      results.push(await request(path(index), index))
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  const sorted = results.map((item) => item.ms).sort((a, b) => a - b)
  const failures = results.filter((item) => !item.ok)
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const summary = {
    phase: name,
    requests: results.length,
    concurrency,
    failures: failures.length,
    statuses: Object.fromEntries([...new Set(results.map((item) => item.status))].map((status) => [status, results.filter((item) => item.status === status).length])),
    p50_ms: Math.round(percentile(0.5) * 100) / 100,
    p95_ms: Math.round(percentile(0.95) * 100) / 100,
    max_ms: Math.round(Math.max(...sorted) * 100) / 100,
  }
  console.log(JSON.stringify(summary))
  if (failures.length) throw new Error(`${name} had ${failures.length} failed requests`)
}

await runPhase('campaign_launch_read', () => '/api/v1/merchant/ads?page=1&page_size=20')
await runPhase('home_food_high_qps', (index) => `/api/v1/ads/placements/food_discovery?market=id-jk&session_id=load-${index}&intent=food_discovery`)
