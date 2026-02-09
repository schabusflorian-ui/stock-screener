// frontend/src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '';

// Admin access expiry: 24 hours
const ADMIN_ACCESS_EXPIRY = 24 * 60 * 60 * 1000;

// Admin access code - can be set via environment variable or use default
// For production: Set REACT_APP_ADMIN_CODE environment variable
// For development: Auto-enabled on localhost
const ADMIN_CODE = process.env.REACT_APP_ADMIN_CODE || 'prism-admin-2024';

// Auto-enable admin for localhost development
const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Check if admin access is currently valid (stored in localStorage)
function isAdminAccessActive() {
  // Auto-enable admin for local development
  if (isLocalDev) {
    if (localStorage.getItem('adminAccess') !== 'true') {
      console.log('[Auth] Auto-enabling admin access for local development');
      localStorage.setItem('adminAccess', 'true');
      localStorage.setItem('adminAccessTime', Date.now().toString());
    }
    return true;
  }

  const adminAccess = localStorage.getItem('adminAccess');
  const adminAccessTime = localStorage.getItem('adminAccessTime');

  if (adminAccess === 'true' && adminAccessTime) {
    const elapsed = Date.now() - parseInt(adminAccessTime, 10);
    if (elapsed < ADMIN_ACCESS_EXPIRY) {
      return true;
    }
    // Expired - clean up
    localStorage.removeItem('adminAccess');
    localStorage.removeItem('adminAccessTime');
  }
  return false;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check auth status on mount
  const checkAuth = useCallback(async () => {
    // First check admin access
    if (isAdminAccessActive()) {
      setIsAdmin(true);
      setUser({
        id: 'admin',
        name: 'Admin',
        email: 'admin@local',
        picture: null
      });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(() => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_BASE}/api/auth/google`;
  }, []);

  const logout = useCallback(async () => {
    // Clear admin access
    localStorage.removeItem('adminAccess');
    localStorage.removeItem('adminAccessTime');
    setIsAdmin(false);

    // Clear user state immediately
    setUser(null);

    try {
      // Call backend logout endpoint
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout failed:', error);
      // Continue with logout anyway
    }

    // Note: We intentionally don't clear watchlist/onboarding localStorage
    // because users may want to keep their local data even after logout
    // Backend data is user-specific and protected by authentication

    // Force redirect after a short delay to ensure state updates
    setTimeout(() => {
      window.location.href = '/login';
    }, 100);
  }, []);

  // Check admin access with code
  const checkAdminAccess = useCallback((code) => {
    if (!code || code.trim() === '') {
      return false;
    }

    // Check if code matches
    if (code === ADMIN_CODE) {
      // Store admin access
      localStorage.setItem('adminAccess', 'true');
      localStorage.setItem('adminAccessTime', Date.now().toString());

      // Update state
      setIsAdmin(true);
      setUser({
        id: 'admin',
        name: 'Admin',
        email: 'admin@local',
        picture: null
      });

      console.log('[Auth] Admin access granted via code');
      return true;
    }

    return false;
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user || isAdmin,
    isAdmin,
    login,
    logout,
    checkAuth,
    checkAdminAccess
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
