import axios from 'axios'
import { clearAccessToken, clearSession, getMerchantBranchSelection, getMerchantDeviceSession, getToken, hasWebSession, publishWebAuthEvent } from './auth'
import { reportNetworkFailure } from './network'

const API_BASE = import.meta.env.VITE_API_URL || ''

if (!API_BASE && import.meta.env.PROD) {
  throw new Error('VITE_API_URL is required for a production Merchant Web build')
}

export const apiBaseUrl = API_BASE.replace(/\/+$/, '')

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'X-Portal': 'merchant' },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const merchantSession = getMerchantDeviceSession()
  const branchSelection = getMerchantBranchSelection()
  if (merchantSession) {
    config.headers['X-Merchant-Session-Token'] = merchantSession.session_token
    config.headers['X-Merchant-Branch-ID'] = branchSelection?.branch_id || merchantSession.branch_id
    config.headers['X-Device-ID'] = merchantSession.device_id
  } else if (branchSelection?.branch_id) {
    // Owners do not need a device session, but the server still receives the
    // selected branch so every subsequent query is scoped to that outlet.
    config.headers['X-Merchant-Branch-ID'] = branchSelection.branch_id
  }
  return config
})

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!hasWebSession()) return false
  try {
    await axios.post(`${apiBaseUrl}/auth/web/refresh-token`, null, {
      withCredentials: true,
      headers: { 'X-Portal': 'merchant' },
    })
    return true
  } catch {
    // Another browser tab may have rotated the shared cookie first. A
    // read-after-refresh check avoids logging this tab out on that benign
    // race, while still rejecting a genuinely revoked session.
    try {
      await axios.get(`${apiBaseUrl}/auth/web/me`, {
        withCredentials: true,
        headers: { 'X-Portal': 'merchant' },
      })
      return true
    } catch {
      return false
    }
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (!error.response && error.code !== 'ERR_CANCELED') {
      // Network failures never trigger an automatic command retry. The shell
      // surfaces a recoverable state while preserving the current context.
      reportNetworkFailure()
    }
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      clearAccessToken()
      refreshing = refreshing ?? tryRefresh()
      const refreshed = await refreshing
      refreshing = null
      if (refreshed) {
        if (original.headers) delete original.headers.Authorization
        return api(original)
      }
      publishWebAuthEvent('logout')
      clearSession()
      const returnTo = `${window.location.pathname}${window.location.search}`
      window.location.href = `/masuk?returnTo=${encodeURIComponent(returnTo)}`
    }
    return Promise.reject(error)
  },
)

export function apiErrorMessage(err: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const e = err as { response?: { data?: { error?: unknown; code?: unknown; message?: unknown } }; message?: unknown }
  const data = e?.response?.data
  const rawError = data?.error
  const rawCode = data?.code
  const rawMessage = data?.message
  const errorCode = typeof rawError === 'string' ? rawError : typeof rawCode === 'string' ? rawCode : undefined
  const friendlyMessages: Record<string, string> = {
    ERR_OTP_RATE_LIMIT: 'Terlalu banyak permintaan kode. Coba lagi setelah beberapa saat.',
    ERR_OTP_VERIFY_RATE_LIMIT: 'Terlalu banyak percobaan kode. Coba lagi setelah beberapa saat.',
    ERR_OTP_INVALID: 'Kode verifikasi salah atau sudah kedaluwarsa.',
    ERR_OTP_SEND_FAILED: 'Kode verifikasi belum dapat dikirim. Coba lagi beberapa saat.',
    otp_send_failed: 'Kode verifikasi belum dapat dikirim. Coba lagi beberapa saat.',
    otp_invalid: 'Kode verifikasi salah atau sudah kedaluwarsa.',
  }
  if (errorCode && friendlyMessages[errorCode]) return friendlyMessages[errorCode]
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage
  if (typeof rawMessage === 'object' && rawMessage !== null && 'message' in rawMessage) {
    const nestedMessage = (rawMessage as { message?: unknown }).message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) return nestedMessage
  }
  if (errorCode) return errorCode
  if (typeof e?.message === 'string' && e.message.trim()) return e.message
  return fallback
}
