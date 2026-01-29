// frontend/src/components/auth/ProtectedRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './ProtectedRoute.css';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="protected-route-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Allow access if authenticated OR admin (admin can access without OAuth login)
  if (!isAuthenticated && !isAdmin) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
