// frontend/src/components/auth/UserMenu.js
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Settings, LogOut, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import './UserMenu.css';

export default function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`user-menu-trigger ${isAdmin ? 'user-menu-trigger--admin' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        {isAdmin ? (
          <div className="user-avatar-admin">
            <Shield size={16} />
          </div>
        ) : user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="user-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="user-avatar-placeholder">
            {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          {/* User Info */}
          <div className="user-menu-header">
            <div className="user-menu-header-row">
              <p className="user-name">{user.name}</p>
              {isAdmin && <span className="user-admin-badge">Admin</span>}
            </div>
            <p className="user-email">{user.email}</p>
          </div>

          {/* Menu Items */}
          <div className="user-menu-items">
            <Link
              to="/settings"
              className="user-menu-item"
              onClick={() => setIsOpen(false)}
            >
              <Settings size={16} />
              Settings
            </Link>
          </div>

          {/* Sign Out */}
          <div className="user-menu-footer">
            <button onClick={logout} className="user-menu-logout">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
