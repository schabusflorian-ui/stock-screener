// frontend/src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Admin access expiry: 24 hours
const ADMIN_ACCESS_EXPIRY = 24 * 60 * 60 * 1000;

// Check if admin access is valid
function checkAdminAccess() {
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
    if (checkAdminAccess()) {
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

    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      // Still redirect even on error
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user || isAdmin,
    isAdmin,
    login,
    logout,
    checkAuth
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
