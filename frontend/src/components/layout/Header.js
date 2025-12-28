// frontend/src/components/layout/Header.js
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Command, Bell, Menu, ArrowRight, X } from 'lucide-react';
import { alertsAPI } from '../../services/api';
import { UserMenu } from '../auth';
import './Header.css';

function Header({ onOpenCommandPalette, onToggleMobileSidebar }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadAlertData();
    // Refresh every 60 seconds
    const interval = setInterval(loadAlertData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadAlertData = async () => {
    try {
      const [summaryRes, alertsRes] = await Promise.all([
        alertsAPI.getSummary(),
        alertsAPI.getAlerts({ limit: 3, signals: ['strong_buy', 'buy'] })
      ]);
      if (summaryRes.data?.success) {
        setUnreadCount(summaryRes.data.data?.unread || 0);
      }
      if (alertsRes.data?.success) {
        setRecentAlerts(alertsRes.data.data || []);
      }
    } catch (err) {
      // Silently fail - alerts may not be set up yet
    }
  };

  const handleMarkRead = async (alertId, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await alertsAPI.markAsRead(alertId);
      setRecentAlerts(prev => prev.filter(a => a.id !== alertId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  };

  const signalIcons = {
    strong_buy: '🟢',
    buy: '🔵',
    watch: '👁️',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="mobile-menu-btn" onClick={onToggleMobileSidebar}>
          <Menu size={20} />
        </button>
      </div>

      <div className="header-center">
        <button className="search-trigger" onClick={onOpenCommandPalette}>
          <Search size={16} className="search-icon" />
          <span className="search-placeholder">Search stocks, metrics, or commands...</span>
          <div className="search-shortcut">
            <kbd>
              <Command size={12} />
            </kbd>
            <kbd>K</kbd>
          </div>
        </button>
      </div>

      <div className="header-right" ref={dropdownRef}>
        <button
          className="header-btn notification-btn"
          title="Alerts"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="notification-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {showDropdown && (
          <div className="notification-dropdown">
            <div className="dropdown-header">
              <span className="dropdown-title">Buy Signals</span>
              {unreadCount > 0 && (
                <span className="dropdown-count">{unreadCount} unread</span>
              )}
            </div>

            {recentAlerts.length > 0 ? (
              <div className="dropdown-alerts">
                {recentAlerts.map(alert => (
                  <Link
                    key={alert.id}
                    to={`/company/${alert.symbol}`}
                    className="dropdown-alert-item"
                    onClick={() => setShowDropdown(false)}
                  >
                    <span className="alert-icon">{signalIcons[alert.signal_type]}</span>
                    <div className="alert-content">
                      <span className="alert-symbol">{alert.symbol}</span>
                      <span className="alert-title">{alert.title?.replace(`${alert.symbol}: `, '')}</span>
                    </div>
                    <button
                      className="alert-dismiss"
                      onClick={(e) => handleMarkRead(alert.id, e)}
                      title="Mark as read"
                    >
                      <X size={14} />
                    </button>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dropdown-empty">
                <p>No new buy signals</p>
              </div>
            )}

            <Link
              to="/alerts"
              className="dropdown-footer"
              onClick={() => setShowDropdown(false)}
            >
              <span>View All Alerts</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        )}

        <UserMenu />
      </div>
    </header>
  );
}

export default Header;
