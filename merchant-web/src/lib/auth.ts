const TOKEN_KEY = 'merchant_web_access_token'
const REFRESH_KEY = 'merchant_web_refresh_token'
const USER_KEY = 'merchant_web_user'
const DEVICE_KEY = 'merchant_web_device_id'
const MERCHANT_SESSION_KEY = 'merchant_web_session'
const MERCHANT_BRANCH_KEY = 'merchant_web_branch'

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
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setSession(accessToken: string, refreshToken: string | null, user: StoredUser | null) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
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
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(MERCHANT_SESSION_KEY)
  sessionStorage.removeItem(MERCHANT_BRANCH_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken()
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
