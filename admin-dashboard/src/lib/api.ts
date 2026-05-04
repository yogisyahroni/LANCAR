import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
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
