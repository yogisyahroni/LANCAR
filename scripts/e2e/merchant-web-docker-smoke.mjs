const [baseUrl = 'http://127.0.0.1:4173'] = process.argv.slice(2)
const forbiddenApiUrls = [
  /http:\/\/localhost(?::\d+)?\/api\/v1/i,
  /https?:\/\/127\.0\.0\.1(?::\d+)?\/api\/v1/i,
  /https?:\/\/0\.0\.0\.0(?::\d+)?\/api\/v1/i,
]
const routes = ['/', '/masuk', '/daftar', '/status', '/dashboard']
const requiredHeaders = {
  'content-security-policy': /default-src 'self'/i,
  'x-frame-options': /^DENY$/i,
  'x-content-type-options': /^nosniff$/i,
  'referrer-policy': /^strict-origin-when-cross-origin$/i,
  'permissions-policy': /geolocation=/i,
  'strict-transport-security': /max-age=31536000/i,
}

function assertResponseHeaders(response, path) {
  for (const [name, pattern] of Object.entries(requiredHeaders)) {
    const value = response.headers.get(name) || ''
    if (!pattern.test(value)) throw new Error(`${path}: missing or invalid ${name}`)
  }
}

async function get(path) {
  const response = await fetch(new URL(path, baseUrl))
  if (!response.ok) throw new Error(`${path}: expected HTTP 2xx, got ${response.status}`)
  assertResponseHeaders(response, path)
  return response
}

const html = await (await get('/')).text()
for (const pattern of forbiddenApiUrls) {
  if (pattern.test(html)) throw new Error(`root HTML contains forbidden runtime URL: ${pattern}`)
}

for (const route of routes.slice(1)) {
  const body = await (await get(route)).text()
  if (!body.includes('<div id="root"></div>')) throw new Error(`${route}: SPA fallback did not serve index.html`)
}

const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
if (scriptSources.length === 0) throw new Error('root HTML does not reference a JavaScript bundle')

for (const source of scriptSources) {
  const scriptResponse = await get(source)
  const script = await scriptResponse.text()
  for (const pattern of forbiddenApiUrls) {
    if (pattern.test(script)) throw new Error(`bundle ${source} contains forbidden runtime URL: ${pattern}`)
  }
}

console.log(JSON.stringify({ status: 'PASS', routes, checkedHeaders: Object.keys(requiredHeaders), bundles: scriptSources.length }))
