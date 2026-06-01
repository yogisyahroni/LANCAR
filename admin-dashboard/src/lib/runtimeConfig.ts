const LOCAL_API_URL = 'http://localhost:8080/api/v1'
const LOCAL_SOCKET_URL = 'http://localhost:8080'

const allowLocalhostFallback =
  import.meta.env.DEV || import.meta.env.VITE_ALLOW_LOCALHOST_FALLBACK === 'true'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')
const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])

const isLocalBrowserHost = () => {
  if (typeof window === 'undefined') return false
  return localHostnames.has(window.location.hostname.toLowerCase())
}

const assertUsableUrl = (name: string, value: string) => {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol')
    }
    const hostname = parsed.hostname.toLowerCase()
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    if (!allowLocalhostFallback && isLocalhost) {
      throw new Error('localhost is not allowed in production')
    }
  } catch {
    throw new Error(`${name} must be a valid http(s) or ws(s) URL.`)
  }
}

const resolveRequiredUrl = (name: string, value: string | undefined, localFallback: string) => {
  if (allowLocalhostFallback && isLocalBrowserHost()) {
    return localFallback
  }

  const configured = value?.trim()
  if (configured) {
    const normalized = trimTrailingSlash(configured)
    assertUsableUrl(name, normalized)
    return normalized
  }

  if (allowLocalhostFallback) {
    return localFallback
  }

  throw new Error(`${name} is required for production admin dashboard builds.`)
}

export const adminApiUrl = resolveRequiredUrl('VITE_API_URL', import.meta.env.VITE_API_URL, LOCAL_API_URL)

export const adminApiRootUrl = adminApiUrl.replace(/\/api\/v1\/?$/, '')

export const adminSocketUrl = resolveRequiredUrl(
  'VITE_SOCKET_URL or VITE_WS_URL',
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_WS_URL,
  LOCAL_SOCKET_URL
)
