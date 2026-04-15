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
  (error) => {
    // Only redirect to login if 401 occurs on authenticated routes
    // Don't redirect if the error is from the login endpoint itself
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      clearMyBookingsDashboardSession();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
