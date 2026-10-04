const USER_KEY = 'merchant_web_user'
const DEVICE_KEY = 'merchant_web_device_id'
const MERCHANT_SESSION_KEY = 'merchant_web_session'
const MERCHANT_BRANCH_KEY = 'merchant_web_branch'
const WEB_SESSION_KEY = 'merchant_web_session_established'
const AUTH_EVENT_KEY = 'merchant_web_auth_event'

// Access tokens are only held for the short token-to-cookie exchange. The
// portal uses an HttpOnly server session afterwards, so a browser reload or
// XSS cannot recover a persistent bearer credential from localStorage.
let memoryAccessToken: string | null = null

// One-time cleanup for tokens written by previous portal builds.
localStorage.removeItem('merchant_web_access_token')
localStorage.removeItem('merchant_web_refresh_token')

export interface StoredUser {
  id?: string
  name?: string
  email?: string
}

export interface MerchantDeviceSession {
  session_token: string
  branch_id: string
  device_id: string
}

export interface MerchantBranchSelection {
  merchant_id: string
  branch_id: string
}

export function getToken(): string | null {
  return memoryAccessToken
}

export function getRefreshToken(): string | null {
  return null
}

export function setSession(accessToken: string, refreshToken: string | null, user: StoredUser | null) {
  memoryAccessToken = accessToken || null
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAccessToken() {
  memoryAccessToken = null
}

export function markWebSessionEstablished(user: StoredUser | null = null) {
  // The marker is not a credential; the authoritative session remains the
  // HttpOnly cookie. Keep only this non-secret marker in localStorage so a
  // newly opened tab can use the shared cookie without forcing a second login.
  localStorage.setItem(WEB_SESSION_KEY, '1')
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export type WebAuthEvent = 'logout'

type WebAuthEventPayload = { type: WebAuthEvent; at: number }

const authEventKey = (payload: WebAuthEventPayload) => `${payload.type}:${payload.at}`

export function publishWebAuthEvent(type: WebAuthEvent) {
  if (typeof window === 'undefined') return
  const payload: WebAuthEventPayload = { type, at: Date.now() }
  try {
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(AUTH_EVENT_KEY) : null
    channel?.postMessage(payload)
    channel?.close()
  } catch {
    // Storage remains the fallback for browsers that do not expose
    // BroadcastChannel or block it in a private context.
  }
  try {
    window.localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(payload))
    window.localStorage.removeItem(AUTH_EVENT_KEY)
  } catch {
    // A tab without storage access still has its own authenticated session.
  }
}

export function subscribeToWebAuthEvents(listener: (type: WebAuthEvent) => void) {
  if (typeof window === 'undefined') return () => undefined
  const seen = new Set<string>()
  const notify = (payload: WebAuthEventPayload) => {
    if (payload.type !== 'logout') return
    const key = authEventKey(payload)
    if (seen.has(key)) return
    seen.add(key)
    // Keep this bounded in long-lived portal tabs. The timestamp makes the
    // key unique across publishes without retaining an unbounded event log.
    if (seen.size > 32) seen.delete(seen.values().next().value as string)
    listener(payload.type)
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_EVENT_KEY || !event.newValue) return
    try {
      notify(JSON.parse(event.newValue) as WebAuthEventPayload)
    } catch {
      // Ignore malformed cross-tab notifications.
    }
  }
  let channel: BroadcastChannel | null = null
  try {
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(AUTH_EVENT_KEY)
      channel.addEventListener('message', (event: MessageEvent<WebAuthEventPayload>) => {
        if (!event.data || typeof event.data !== 'object') return
        notify(event.data)
      })
    }
  } catch {
    // Storage remains the fallback for browsers without BroadcastChannel.
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.close()
  }
}

export function hasWebSession(): boolean {
  return localStorage.getItem(WEB_SESSION_KEY) === '1' || sessionStorage.getItem(WEB_SESSION_KEY) === '1'
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as StoredUser) : null
  } catch {
    return null
  }
}

export function clearSession() {
  memoryAccessToken = null
  // Remove legacy bearer storage left by older portal builds during migration.
  localStorage.removeItem('merchant_web_access_token')
  localStorage.removeItem('merchant_web_refresh_token')
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(WEB_SESSION_KEY)
  sessionStorage.removeItem(WEB_SESSION_KEY)
  sessionStorage.removeItem(MERCHANT_SESSION_KEY)
  sessionStorage.removeItem(MERCHANT_BRANCH_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken() || hasWebSession()
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = `web-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function getMerchantDeviceSession(): MerchantDeviceSession | null {
  try {
    const raw = sessionStorage.getItem(MERCHANT_SESSION_KEY)
    return raw ? (JSON.parse(raw) as MerchantDeviceSession) : null
  } catch {
    return null
  }
}

export function setMerchantDeviceSession(session: MerchantDeviceSession) {
  sessionStorage.setItem(MERCHANT_SESSION_KEY, JSON.stringify(session))
}

export function clearMerchantDeviceSession() {
  sessionStorage.removeItem(MERCHANT_SESSION_KEY)
}

export function getMerchantBranchSelection(): MerchantBranchSelection | null {
  try {
    const raw = sessionStorage.getItem(MERCHANT_BRANCH_KEY)
    return raw ? (JSON.parse(raw) as MerchantBranchSelection) : null
  } catch {
    return null
  }
}

export function setMerchantBranchSelection(selection: MerchantBranchSelection) {
  sessionStorage.setItem(MERCHANT_BRANCH_KEY, JSON.stringify(selection))
}

export function clearMerchantBranchSelection() {
  sessionStorage.removeItem(MERCHANT_BRANCH_KEY)
}
