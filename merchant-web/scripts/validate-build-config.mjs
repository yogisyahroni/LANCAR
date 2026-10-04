import { fileURLToPath } from 'node:url'

const RELEASE_ENVIRONMENTS = new Set(['ci', 'staging', 'production'])
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'])

function normalizeApiUrl(value, name) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error(`${name} is required for Merchant Web builds`)

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${name} must be an absolute URL`)
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments`)
  }

  const pathname = parsed.pathname.replace(/\/+$/, '')
  if (pathname !== '/api/v1') {
    throw new Error(`${name} must end with /api/v1`)
  }

  return `${parsed.protocol}//${parsed.host}${pathname}`
}

export function validateBuildConfig(env = process.env) {
  const environment = String(env.MERCHANT_BUILD_ENV || (env.CI ? 'ci' : 'local')).trim().toLowerCase()
  const apiUrl = normalizeApiUrl(env.VITE_API_URL, 'VITE_API_URL')
  const parsed = new URL(apiUrl)

  if (RELEASE_ENVIRONMENTS.has(environment)) {
    if (parsed.protocol !== 'https:') {
      throw new Error(`VITE_API_URL must use HTTPS for ${environment} builds`)
    }

    if (LOCAL_HOSTNAMES.has(parsed.hostname) || parsed.hostname.endsWith('.localhost')) {
      throw new Error(`VITE_API_URL must not target localhost or a loopback host for ${environment} builds`)
    }

    const expectedApiUrl = normalizeApiUrl(env.MERCHANT_EXPECTED_API_URL, 'MERCHANT_EXPECTED_API_URL')
    if (apiUrl !== expectedApiUrl) {
      throw new Error(`VITE_API_URL does not match MERCHANT_EXPECTED_API_URL for ${environment}`)
    }
  }

  return { environment, apiUrl }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = validateBuildConfig()
  console.log(`Merchant Web build configuration PASS: ${result.environment} -> ${result.apiUrl}`)
}
