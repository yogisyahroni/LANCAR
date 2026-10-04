import axios from 'axios'
import { clearSession, deviceId, getMerchantBranchSelection, getMerchantDeviceSession, getRefreshToken, getToken, setSession } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'

export const apiBaseUrl = API_BASE.replace(/\/+$/, '')

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
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

let refreshing: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await axios.post(`${apiBaseUrl}/auth/refresh`, {
      refresh_token: refreshToken,
      device_id: deviceId(),
    })
    const newToken: string | undefined = res.data?.access_token || res.data?.data?.token
    if (!newToken) return null
    setSession(newToken, res.data?.refresh_token ?? refreshToken, null)
    return newToken
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      refreshing = refreshing ?? tryRefresh()
      const token = await refreshing
      refreshing = null
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
      clearSession()
      const returnTo = `${window.location.pathname}${window.location.search}`
      window.location.href = `/masuk?returnTo=${encodeURIComponent(returnTo)}`
    }
    return Promise.reject(error)
  },
)

export function apiErrorMessage(err: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string }
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback
}
