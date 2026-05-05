import { create } from 'zustand'
import { api } from '../lib/api'

interface User {
  id: string
  name: string
  email: string
  // Backend returns 'super_admin', 'admin', 'manager', etc.
  role: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  checkAuth: () => Promise<void>
  login: (credentials: { email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      // Correct endpoint: GET /auth/web/me (via gateway → admin-service)
      const { data } = await api.get('/auth/web/me')
      set({ user: data.user, isAuthenticated: true, isLoading: false })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (credentials) => {
    // Correct endpoint: POST /auth/web/login (via gateway → admin-service)
    // Sending portal: 'admin' to enforce strict role check in backend
    const { data } = await api.post('/auth/web/login', { ...credentials, portal: 'admin' })
    set({ user: data.user, isAuthenticated: true })
  },

  logout: async () => {
    try {
      // Correct endpoint: POST /auth/web/logout (via gateway → admin-service)
      await api.post('/auth/web/logout')
    } finally {
      set({ user: null, isAuthenticated: false })
      window.location.href = '/login'
    }
  },
}))

