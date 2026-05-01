import axios from 'axios'

// Backend routes are at /admin/*, not /api/admin/*
// The base URL should NOT include /api prefix
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
})

// Inject required admin headers on every request
api.interceptors.request.use((config) => {
  // These headers satisfy the requireAuth & requireRole middlewares
  const authMock = localStorage.getItem('auth_mock')
  if (authMock === 'true') {
    config.headers['x-user-id'] = 'admin-mock-1'
    config.headers['x-user-role'] = 'super_admin'
    config.headers['x-totp-verified'] = 'true'
  }
  return config
})

// Add response interceptor for handling 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login or clear auth state
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
