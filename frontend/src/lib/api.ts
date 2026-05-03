import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check if the error is due to an expired or missing token (401 Unauthorized)
    if (error.response && error.response.status === 401) {
      // Avoid infinite loops if the logout endpoint itself returns 401
      if (!error.config.url?.includes('/auth/web/logout')) {
        // Clear auth state in store
        const { setAuth } = useAuthStore.getState();
        setAuth(false, null);

        // Redirect to login page if on the client side
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
