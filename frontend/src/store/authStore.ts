import { create } from 'zustand';

interface User {
  id: string;
  name?: string;
  email?: string;
  phone_number?: string;
  full_name?: string;
  role?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  setAuth: (isAuthenticated: boolean, user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true, // Start as true to wait for initial session check
  setAuth: (isAuthenticated, user) => set({ isAuthenticated, user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
