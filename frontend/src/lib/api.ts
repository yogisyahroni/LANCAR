import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Portal': 'customer',
  },
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Check if error is due to expired or missing token (401 Unauthorized)
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/web/refresh-token')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/web/refresh-token');
        isRefreshing = false;
        processQueue(null);
        return api(originalRequest);
      } catch (err: any) {
        isRefreshing = false;
        processQueue(err);

        if (!originalRequest.url?.includes('/auth/web/logout')) {
          const { setAuth } = useAuthStore.getState();
          setAuth(false, null);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);
