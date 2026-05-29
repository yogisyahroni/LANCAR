import axios from 'axios'
import { adminApiUrl } from './runtimeConfig'

const API_URL = adminApiUrl

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Portal': 'admin',
  },
})

// Add response interceptor for handling 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear any stale state and redirect to login
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
