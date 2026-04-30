import axios from 'axios';
import { clearMyBookingsDashboardSession } from '@/components/my-bookings/myBookingsDashboardSession';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // Only redirect to login if 401 occurs on authenticated routes
    // Don't redirect if the error is from the login endpoint itself
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    const isRefreshRequest = error.config?.url?.includes('/auth/refresh');
    const skipAuthRedirect = error.config?.skipAuthRedirect;

    if (
      error.response?.status === 401 &&
      !isLoginRequest &&
      !isRefreshRequest &&
      !skipAuthRedirect &&
      !error.config?._retry &&
      localStorage.getItem('authProvider') === 'supabase' &&
      localStorage.getItem('refreshToken')
    ) {
      try {
        error.config._retry = true;
        const refreshResponse = await axiosInstance.post('/auth/refresh', {
          refreshToken: localStorage.getItem('refreshToken'),
        });
        const { token, refreshToken, user, authProvider = 'supabase' } = refreshResponse.data;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('authProvider', authProvider);
        localStorage.setItem('user', JSON.stringify(user));
        error.config.headers.Authorization = `Bearer ${token}`;
        return axiosInstance(error.config);
      } catch {
        // Fall through to normal logout handling below.
      }
    }

    if (error.response?.status === 401 && !isLoginRequest && !skipAuthRedirect) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('authProvider');
      clearMyBookingsDashboardSession();
      localStorage.setItem('logoutReason', 'session_expired');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
