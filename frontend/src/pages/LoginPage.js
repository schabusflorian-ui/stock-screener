// frontend/src/pages/LoginPage.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, Shield, BarChart3, PieChart } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [adminCode, setAdminCode] = useState('');
  const [showAdminInput, setShowAdminInput] = useState(false);

  const error = searchParams.get('error');

  useEffect(() => {
    // If already logged in, redirect to home
    if (!loading && isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleAdminAccess = (e) => {
    e.preventDefault();
    // Check admin code from environment or use default for dev
    const validCode = process.env.REACT_APP_ADMIN_CODE || 'admin';
    if (adminCode === validCode) {
      // Store admin session in localStorage
      localStorage.setItem('adminAccess', 'true');
      localStorage.setItem('adminAccessTime', Date.now().toString());
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-loading">
          <div className="login-loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Background decoration */}
      <div className="login-bg-decoration">
        <div className="login-bg-circle login-bg-circle-1" />
        <div className="login-bg-circle login-bg-circle-2" />
        <div className="login-bg-circle login-bg-circle-3" />
      </div>

      <div className="login-container">
        {/* Brand header */}
        <div className="login-brand">
          <div className="login-logo">
            <TrendingUp size={32} />
          </div>
          <h1 className="login-title">Investment Project</h1>
          <p className="login-subtitle">Portfolio Analytics & Research Platform</p>
        </div>

        {/* Features */}
        <div className="login-features">
          <div className="login-feature">
            <BarChart3 size={18} />
            <span>Advanced Screening</span>
          </div>
          <div className="login-feature">
            <PieChart size={18} />
            <span>Portfolio Tracking</span>
          </div>
          <div className="login-feature">
            <Shield size={18} />
            <span>Secure & Private</span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="login-error">
            <span>Authentication failed. Please try again.</span>
          </div>
        )}

        {/* Login Card */}
        <div className="login-card">
          <button onClick={login} className="login-google-btn">
            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="login-divider">
            <span>or</span>
          </div>

          {/* Admin Access */}
          {!showAdminInput ? (
            <button
              className="login-admin-toggle"
              onClick={() => setShowAdminInput(true)}
            >
              Admin Access
            </button>
          ) : (
            <form onSubmit={handleAdminAccess} className="login-admin-form">
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="Enter admin code"
                className="login-admin-input"
                autoFocus
              />
              <button type="submit" className="login-admin-submit">
                Enter
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="login-footer">
          Personal investment research platform
        </p>
      </div>
    </div>
  );
}
