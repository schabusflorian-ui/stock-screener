// frontend/src/components/layout/Header.js
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Command, Bell, Menu, ArrowRight, X, Sparkles, AlertTriangle, AlertCircle, Info, Building2, Briefcase, Star } from 'lucide-react';
import { notificationsAPI, alertsAPI } from '../../services/api';
import { UserMenu } from '../auth';
import './Header.css';

// Category icons for unified notifications
const CATEGORY_ICONS = {
  company: Building2,
  portfolio: Briefcase,
  watchlist: Star,
  correlation: AlertCircle
};

// Severity icons
const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info
};

function Header({ onOpenCommandPalette, onToggleMobileSidebar, onToggleChatPanel, isChatPanelOpen }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [useUnifiedAPI, setUseUnifiedAPI] = useState(true);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadNotificationData();
    // Refresh every 60 seconds
    const interval = setInterval(loadNotificationData, 60000);
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

  const loadNotificationData = async () => {
    // Try unified notifications API first
    if (useUnifiedAPI) {
      try {
        const [summaryRes, notificationsRes] = await Promise.all([
          notificationsAPI.getSummary(),
          notificationsAPI.getNotifications({ status: 'unread', limit: 5, minPriority: 2 })
        ]);

        if (summaryRes.data?.success) {
          setUnreadCount(summaryRes.data.data?.unread || 0);
        }
        if (notificationsRes.data?.success) {
          setRecentNotifications(notificationsRes.data.data || []);
        }
        return;
      } catch (err) {
        // If unified API fails, fall back to legacy alerts API
        console.log('Unified notifications API not available, using legacy alerts');
        setUseUnifiedAPI(false);
      }
    }

    // Fallback to legacy alerts API
    try {
      const [summaryRes, alertsRes] = await Promise.all([
        alertsAPI.getSummary(),
        alertsAPI.getAlerts({ limit: 5, signals: ['strong_buy', 'buy', 'warning'] })
      ]);
      if (summaryRes.data?.success) {
        setUnreadCount(summaryRes.data.data?.unread || 0);
      }
      if (alertsRes.data?.success) {
        // Convert legacy alerts to notification format
        const notifications = (alertsRes.data.data || []).map(alert => ({
          id: alert.id,
          category: 'company',
          severity: alert.signal_type === 'warning' ? 'warning' : 'info',
          priority: alert.priority,
          title: alert.title,
          body: alert.description,
          relatedEntities: [{ type: 'company', label: alert.symbol }],
          createdAt: alert.triggered_at,
          status: alert.is_read ? 'read' : 'unread',
          // Keep legacy fields for compatibility
          symbol: alert.symbol,
          signal_type: alert.signal_type
        }));
        setRecentNotifications(notifications);
      }
    } catch (err) {
      // Silently fail - notifications may not be set up yet
    }
  };

  const handleMarkRead = async (notificationId, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (useUnifiedAPI) {
        await notificationsAPI.markAsRead(notificationId);
      } else {
        await alertsAPI.markAsRead(notificationId);
      }
      setRecentNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAllRead = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (useUnifiedAPI) {
        await notificationsAPI.bulkMarkAsRead({});
      } else {
        await alertsAPI.markAllAsRead();
      }
      setRecentNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Format relative time
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get icon for notification
  const getNotificationIcon = (notification) => {
    // Legacy alerts have signal_type
    if (notification.signal_type) {
      const icons = {
        strong_buy: { icon: '🟢', color: '#10b981' },
        buy: { icon: '🔵', color: '#3b82f6' },
        watch: { icon: '👁️', color: '#6366f1' },
        warning: { icon: '⚠️', color: '#f59e0b' },
        info: { icon: 'ℹ️', color: '#6b7280' }
      };
      return icons[notification.signal_type] || icons.info;
    }

    // Unified notifications use severity
    const SeverityIcon = SEVERITY_ICONS[notification.severity] || Info;
    const colors = {
      critical: '#dc2626',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    return { Icon: SeverityIcon, color: colors[notification.severity] || colors.info };
  };

  // Get label/symbol from notification
  const getNotificationLabel = (notification) => {
    // Legacy alerts have symbol directly
    if (notification.symbol) return notification.symbol;
    // Unified notifications have relatedEntities
    return notification.relatedEntities?.[0]?.label || '';
  };

  // Get link for notification
  const getNotificationLink = (notification) => {
    const label = getNotificationLabel(notification);
    const entity = notification.relatedEntities?.[0];

    if (entity?.type === 'portfolio') {
      return `/portfolios/${entity.id}`;
    }
    if (label) {
      return `/company/${label}`;
    }
    return '/alerts';
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="mobile-menu-btn" onClick={onToggleMobileSidebar}>
          <Menu size={20} />
        </button>
      </div>

      <div className="header-center">
        <button className="search-trigger" onClick={onOpenCommandPalette} data-tour="search">
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
          className={`header-btn ai-chat-btn ${isChatPanelOpen ? 'active' : ''}`}
          title="Ask AI"
          onClick={onToggleChatPanel}
          data-tour="ai-chat"
        >
          <Sparkles size={18} />
        </button>

        <button
          className="header-btn notification-btn"
          title="Notifications"
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
              <span className="dropdown-title">Notifications</span>
              <div className="dropdown-header-actions">
                {unreadCount > 0 && (
                  <>
                    <span className="dropdown-count">{unreadCount} unread</span>
                    <button
                      className="mark-all-read-btn"
                      onClick={handleMarkAllRead}
                      title="Mark all as read"
                    >
                      Mark all read
                    </button>
                  </>
                )}
              </div>
            </div>

            {recentNotifications.length > 0 ? (
              <div className="dropdown-alerts">
                {recentNotifications.map(notification => {
                  const iconData = getNotificationIcon(notification);
                  const label = getNotificationLabel(notification);
                  const link = getNotificationLink(notification);
                  const CategoryIcon = CATEGORY_ICONS[notification.category] || Building2;

                  return (
                    <Link
                      key={notification.id}
                      to={link}
                      className={`dropdown-alert-item ${notification.severity || ''}`}
                      onClick={() => setShowDropdown(false)}
                    >
                      <div className="alert-icon-wrapper" style={{ color: iconData.color }}>
                        {iconData.icon ? (
                          <span className="alert-emoji">{iconData.icon}</span>
                        ) : (
                          <iconData.Icon size={16} />
                        )}
                      </div>
                      <div className="alert-content">
                        <div className="alert-top-row">
                          {label && <span className="alert-symbol">{label}</span>}
                          <span className={`alert-category ${notification.category || 'company'}`}>
                            <CategoryIcon size={10} />
                            {notification.category || 'company'}
                          </span>
                          <span className="alert-time">{formatTime(notification.createdAt)}</span>
                        </div>
                        <span className="alert-title">
                          {notification.title?.replace(`${label}: `, '')}
                        </span>
                      </div>
                      <button
                        className="alert-dismiss"
                        onClick={(e) => handleMarkRead(notification.id, e)}
                        title="Mark as read"
                      >
                        <X size={14} />
                      </button>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="dropdown-empty">
                <Bell size={24} className="empty-icon" />
                <p>All caught up!</p>
                <span>No new notifications</span>
              </div>
            )}

            <Link
              to="/alerts"
              className="dropdown-footer"
              onClick={() => setShowDropdown(false)}
            >
              <span>View All Notifications</span>
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
