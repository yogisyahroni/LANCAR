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
    set({ isLoading: true })
    
    // Check for mock session first
    if (localStorage.getItem('auth_mock') === 'true') {
      set({ 
        user: {
          id: 'admin-mock-1',
          name: 'Master Admin',
          email: 'admin@lancar.com',
          role: 'superadmin'
        }, 
        isAuthenticated: true, 
        isLoading: false 
      });
      return;
    }

    try {
      const { data } = await api.get('/auth/verify')
      set({ user: data.user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (credentials) => {
    // Mock Bypass for testing
    if (credentials.email === 'admin@lancar.com' && credentials.password === 'admin123') {
      const mockUser: User = {
        id: 'admin-mock-1',
        name: 'Master Admin',
        email: 'admin@lancar.com',
        role: 'superadmin'
      };
      localStorage.setItem('auth_mock', 'true');
      set({ user: mockUser, isAuthenticated: true });
      return;
    }

    const { data } = await api.post('/auth/login', credentials)
    set({ user: data.user, isAuthenticated: true })
  },

  logout: async () => {
    localStorage.removeItem('auth_mock');
    try {
      await api.post('/auth/logout')
      set({ user: null, isAuthenticated: false })
      window.location.href = '/login'
    } catch (error) {
      // Still clear local state on error
      set({ user: null, isAuthenticated: false })
      window.location.href = '/login'
    }
  },
}))

