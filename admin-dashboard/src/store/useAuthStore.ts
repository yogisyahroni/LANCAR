import { create } from 'zustand'
import { api } from '../lib/api'

interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'superadmin'
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  checkAuth: () => Promise<void>
  login: (credentials: any) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async () => {
    try {
      set({ isLoading: true })
      const { data } = await api.get('/auth/verify')
      set({ user: data.user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (credentials) => {
    try {
      const { data } = await api.post('/auth/login', credentials)
      set({ user: data.user, isAuthenticated: true })
    } catch (error) {
      throw error
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
      set({ user: null, isAuthenticated: false })
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout failed:', error)
    }
  },
}))
