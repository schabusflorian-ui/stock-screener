/**
 * AdminRoute Component
 *
 * Protects routes that should only be accessible to admin users.
 * Redirects non-admin users to the home page.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminRoute = ({ children, fallback = '/' }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="admin-route-loading">
        <div className="page-loading-spinner" />
        <span>Checking permissions...</span>
      </div>
    );
  }

  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Not admin - redirect to fallback
  if (!isAdmin) {
    return <Navigate to={fallback} replace />;
  }

  // Admin - render children
  return children;
};

export default AdminRoute;
