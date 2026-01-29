// frontend/src/components/auth/UserMenu.js
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Settings, LogOut, Crown, HelpCircle, User } from '../icons';
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

  // Show menu for authenticated users OR admin bypass
  if (!user && !isAdmin) return null;

  // Get user initials for fallback
  const getInitials = () => {
    if (user?.name) {
      const names = user.name.split(' ');
      if (names.length >= 2) {
        return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
      }
      return user.name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    // Admin bypass without user object
    return 'A';
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`user-menu-trigger ${isAdmin ? 'user-menu-trigger--admin' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user?.name || 'User'}
            className="user-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="user-avatar-icon">
            <User size={18} />
            {isAdmin && (
              <span className="user-avatar-admin-badge">
                <Crown size={10} />
              </span>
            )}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          {/* User Info */}
          <div className="user-menu-header">
            <div className="user-menu-header-row">
              <p className="user-name">{user?.name || (isAdmin ? 'Admin User' : 'User')}</p>
              {isAdmin && <span className="user-admin-badge">Admin</span>}
            </div>
            <p className="user-email">{user?.email || (isAdmin ? 'Admin Access' : '')}</p>
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
            <button
              className="user-menu-item"
              onClick={() => {
                setIsOpen(false);
                window.openHelp?.();
              }}
            >
              <HelpCircle size={16} />
              Help
              <span className="user-menu-shortcut">Ctrl+/</span>
            </button>
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
