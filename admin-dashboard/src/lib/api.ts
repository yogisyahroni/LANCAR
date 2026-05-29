import axios from 'axios'
import { adminApiUrl } from './runtimeConfig'

const API_URL = adminApiUrl
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const safeRequestId = (value: unknown) => {
  const candidate = typeof value === 'string' ? value.trim() : ''
  return SAFE_REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined
}

const getHeader = (headers: any, name: string) => {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name)
  return headers[name] ?? headers[name.toLowerCase()]
}

const setHeader = (headers: any, name: string, value: string) => {
  if (typeof headers?.set === 'function') {
    headers.set(name, value)
    return headers
  }
  return {
    ...(headers ?? {}),
    [name]: value,
  }
}

const shortRequestReference = (requestId: string) => `Ref ${requestId.slice(-12).toUpperCase()}`

const attachErrorReference = (error: any) => {
  const requestId =
    safeRequestId(getHeader(error.response?.headers, 'x-request-id')) ||
    safeRequestId(getHeader(error.config?.headers, 'X-Request-ID'))

  if (!requestId) return error

  const reference = shortRequestReference(requestId)
  error.requestId = requestId
  error.referenceCode = reference

  if (typeof error.response?.data?.message === 'string' && !error.response.data.message.includes(reference)) {
    error.response.data.message = `${error.response.data.message} (${reference})`
  }
  if (typeof error.message === 'string' && !error.message.includes(reference)) {
    error.message = `${error.message} (${reference})`
  }

  return error
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Portal': 'admin',
  },
})

api.interceptors.request.use((config) => {
  config.headers = setHeader(config.headers, 'X-Request-ID', createRequestId())
  return config
})

// Add response interceptor for handling 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    attachErrorReference(error)
    if (error.response?.status === 401) {
      // Clear any stale state and redirect to login
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
