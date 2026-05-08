import { useState, useEffect } from 'react';
import axiosInstance from '@/lib/axios';
import { clearMyBookingsDashboardSession } from '@/components/my-bookings/myBookingsDashboardSession';
import { AuthContext } from './auth-context';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_STORAGE_KEY = 'lastActivityAt';
const LOGOUT_REASON_KEY = 'logoutReason';
const REFRESH_TOKEN_KEY = 'refreshToken';
const AUTH_PROVIDER_KEY = 'authProvider';

const getNow = () => Date.now();

const getLastActivityAt = () => {
  const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const setLastActivityAt = (value = getNow()) => {
  localStorage.setItem(ACTIVITY_STORAGE_KEY, String(value));
};

const clearLastActivityAt = () => {
  localStorage.removeItem(ACTIVITY_STORAGE_KEY);
};

const setStoredLogoutReason = (reason) => {
  if (!reason) return;
  localStorage.setItem(LOGOUT_REASON_KEY, reason);
};

const getStoredLogoutReason = () => localStorage.getItem(LOGOUT_REASON_KEY);

const clearStoredLogoutReason = () => {
  localStorage.removeItem(LOGOUT_REASON_KEY);
};

const isIdleExpired = () => {
  const lastActivityAt = getLastActivityAt();
  if (!lastActivityAt) return true;
  return getNow() - lastActivityAt >= IDLE_TIMEOUT_MS;
};

const setAuthenticatedSession = ({ authProvider = 'legacy', refreshToken, token, user }) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem(AUTH_PROVIDER_KEY, authProvider);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  setLastActivityAt();
  clearStoredLogoutReason();
};

export const AuthProvider = ({ children }) => {
  const [logoutReason, setLogoutReason] = useState(() => {
    const storedReason = getStoredLogoutReason();
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser && isIdleExpired()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_PROVIDER_KEY);
      clearMyBookingsDashboardSession();
      clearLastActivityAt();
      setStoredLogoutReason('idle_timeout');
      return 'idle_timeout';
    }

    return storedReason;
  });
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!storedToken || !storedUser || isIdleExpired()) return null;
    return storedToken;
  });
  const [user, setUser] = useState(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!storedToken || !storedUser || isIdleExpired()) return null;

    try {
      return JSON.parse(storedUser);
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  });
  const [loading] = useState(false);

  const login = async (email, password) => {
    try {
      const response = await axiosInstance.post('/auth/login', {
        email,
        password,
      });

      const {
        authProvider = 'legacy',
        refreshToken,
        token: newToken,
        user: newUser,
      } = response.data;

      setAuthenticatedSession({
        authProvider,
        refreshToken,
        token: newToken,
        user: newUser,
      });
      setLogoutReason(null);
      setToken(newToken);
      setUser(newUser);

      return { success: true, user: newUser };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const register = async (email, password, accountType, userCategory) => {
    try {
      const response = await axiosInstance.post('/auth/register', {
        email,
        password,
        accountType,
        userCategory,
      });

      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const startOAuth = async (provider) => {
    try {
      const redirectTo = `${window.location.origin}/oauth/callback`;
      const response = await axiosInstance.post('/auth/oauth/start', {
        provider,
        redirectTo,
      });
      const url = response.data?.url;
      if (!url) {
        return { success: false, error: 'OAuth URL was not returned by the server' };
      }
      window.location.assign(url);
      return { success: true, user: newUser };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Unable to start OAuth login',
      };
    }
  };

  const completeOAuth = async (accessToken, refreshToken) => {
    try {
      const response = await axiosInstance.post('/auth/oauth/exchange', {
        accessToken,
        refreshToken,
      }, {
        skipAuthRedirect: true,
      });

      const {
        authProvider = 'supabase',
        token: newToken,
        user: newUser,
        refreshToken: newRefreshToken,
      } = response.data;

      setAuthenticatedSession({
        authProvider,
        refreshToken: newRefreshToken || refreshToken || null,
        token: newToken,
        user: newUser,
      });
      setLogoutReason(null);
      setToken(newToken);
      setUser(newUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'OAuth sign-in failed',
      };
    }
  };

  const resendVerificationEmail = async (email) => {
    try {
      const redirectTo = `${window.location.origin}/login`;
      const response = await axiosInstance.post('/auth/email-verification/resend', {
        email,
        redirectTo,
      });
      return { success: true, message: response.data?.message };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Unable to resend verification email',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_PROVIDER_KEY);
    clearMyBookingsDashboardSession();
    clearLastActivityAt();
    setToken(null);
    setUser(null);
  };

  const clearLogoutReason = () => {
    clearStoredLogoutReason();
    setLogoutReason(null);
  };

  const checkAuth = async () => {
    if (!token) return false;

    try {
      await axiosInstance.get('/auth/me');
      return true;
    } catch {
      logout();
      return false;
    }
  };

  useEffect(() => {
    if (!token) return undefined;

    let lastWriteAt = 0;
    const writeActivity = () => {
      const now = getNow();
      // Avoid excessive localStorage writes from high-frequency events.
      if (now - lastWriteAt < 15000) return;
      lastWriteAt = now;
      setLastActivityAt(now);
    };

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, writeActivity, { passive: true }));

    const intervalId = window.setInterval(() => {
      if (isIdleExpired()) {
        setStoredLogoutReason('idle_timeout');
        setLogoutReason('idle_timeout');
        logout();
      }
    }, 30000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, writeActivity));
      window.clearInterval(intervalId);
    };
  }, [token]);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    startOAuth,
    completeOAuth,
    resendVerificationEmail,
    logout,
    checkAuth,
    isAuthenticated: !!token,
    logoutReason,
    clearLogoutReason,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
