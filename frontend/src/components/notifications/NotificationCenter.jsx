/**
 * NotificationCenter - Unified notification display component
 *
 * Can be used as:
 * 1. Full page (AlertsPage replacement)
 * 2. Embedded panel (PortfolioAlerts replacement)
 * 3. Dropdown (Header notification dropdown)
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  Building2,
  Briefcase,
  Star,
  TrendingUp,
  Sparkles,
  Settings,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw
} from 'lucide-react';
import { notificationsAPI } from '../../services/api';
import './NotificationCenter.css';

// Icon mapping for categories and severities
const CATEGORY_ICONS = {
  company: Building2,
  portfolio: Briefcase,
  watchlist: Star,
  sentiment: TrendingUp,
  ai: Sparkles,
  system: Settings,
  correlation: LinkIcon
};

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info
};

// Format relative time
const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Single notification card
function NotificationCard({ notification, onMarkRead, onDismiss, onSnooze, onAction, compact = false }) {
  const [showActions, setShowActions] = useState(false);

  const CategoryIcon = CATEGORY_ICONS[notification.category] || Info;
  const SeverityIcon = SEVERITY_ICONS[notification.severity] || Info;

  const handleAction = (action) => {
    if (action.url) {
      onAction?.(notification.id, action.label);
    } else if (action.apiCall) {
      onAction?.(notification.id, action.label, action.apiCall);
    }
  };

  // Get primary related entity for linking
  const primaryEntity = notification.relatedEntities?.[0];
  const linkTo = primaryEntity?.type === 'company'
    ? `/company/${primaryEntity.label}`
    : primaryEntity?.type === 'portfolio'
      ? `/portfolios/${primaryEntity.id}`
      : null;

  return (
    <div
      className={`notification-card ${notification.status} ${notification.severity} ${compact ? 'compact' : ''}`}
      onClick={() => !notification.status !== 'read' && onMarkRead?.(notification.id)}
    >
      {/* Icon */}
      <div className={`notification-icon ${notification.severity}`}>
        <SeverityIcon size={compact ? 16 : 20} />
      </div>

      {/* Content */}
      <div className="notification-content">
        <div className="notification-header">
          <div className="notification-meta">
            <span className={`category-badge ${notification.category}`}>
              <CategoryIcon size={12} />
              {notification.category}
            </span>
            {primaryEntity?.label && (
              <Link
                to={linkTo || '#'}
                className="entity-label"
                onClick={(e) => e.stopPropagation()}
              >
                {primaryEntity.label}
              </Link>
            )}
            <span className="notification-time">{formatTime(notification.createdAt)}</span>
          </div>

          <div className="notification-actions-quick">
            {notification.status === 'unread' && (
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); onMarkRead?.(notification.id); }}
                title="Mark as read"
              >
                <Check size={14} />
              </button>
            )}
            <button
              className="btn-icon"
              onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }}
              title="More actions"
            >
              <ChevronDown size={14} className={showActions ? 'rotated' : ''} />
            </button>
          </div>
        </div>

        <h4 className="notification-title">{notification.title}</h4>

        {!compact && notification.body && (
          <p className="notification-body">{notification.body}</p>
        )}

        {/* Actions dropdown */}
        {showActions && (
          <div className="notification-actions-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onSnooze?.(notification.id, '1h')}>
              <Clock size={14} /> Snooze 1h
            </button>
            <button onClick={() => onSnooze?.(notification.id, '1d')}>
              <Clock size={14} /> Snooze 1d
            </button>
            <button onClick={() => onDismiss?.(notification.id)}>
              <X size={14} /> Dismiss
            </button>
          </div>
        )}

        {/* Action buttons */}
        {!compact && notification.actions?.length > 0 && (
          <div className="notification-action-buttons">
            {notification.actions.slice(0, 2).map((action, idx) => (
              action.url ? (
                <Link
                  key={idx}
                  to={action.url}
                  className="action-btn"
                  onClick={(e) => { e.stopPropagation(); handleAction(action); }}
                >
                  {action.label} <ChevronRight size={14} />
                </Link>
              ) : (
                <button
                  key={idx}
                  className="action-btn"
                  onClick={(e) => { e.stopPropagation(); handleAction(action); }}
                >
                  {action.label}
                </button>
              )
            ))}
          </div>
        )}
      </div>

      {/* Priority indicator */}
      <div className={`priority-indicator priority-${notification.priority}`} title={`Priority ${notification.priority}`} />
    </div>
  );
}

// Filter bar component
function FilterBar({ filters, setFilters, categories, onMarkAllRead, loading }) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="notification-filter-bar">
      <div className="filter-row">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${!filters.status ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, status: null })}
          >
            All
          </button>
          <button
            className={`filter-tab ${filters.status === 'unread' ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, status: 'unread' })}
          >
            Unread
          </button>
        </div>

        <div className="filter-actions">
          <button
            className={`btn-filter ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} />
            Filters
          </button>
          <button
            className="btn-mark-all"
            onClick={onMarkAllRead}
            disabled={loading}
          >
            <CheckCheck size={14} />
            Mark All Read
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filter-expanded">
          <div className="filter-group">
            <label>Category</label>
            <div className="filter-chips">
              {Object.entries(categories || {}).map(([key, config]) => {
                const Icon = CATEGORY_ICONS[key] || Info;
                const isActive = filters.category === key;
                return (
                  <button
                    key={key}
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                    onClick={() => setFilters({
                      ...filters,
                      category: isActive ? null : key
                    })}
                  >
                    <Icon size={12} />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-group">
            <label>Severity</label>
            <div className="filter-chips">
              {['critical', 'warning', 'info'].map(sev => {
                const Icon = SEVERITY_ICONS[sev];
                const isActive = filters.severity === sev;
                return (
                  <button
                    key={sev}
                    className={`filter-chip ${sev} ${isActive ? 'active' : ''}`}
                    onClick={() => setFilters({
                      ...filters,
                      severity: isActive ? null : sev
                    })}
                  >
                    <Icon size={12} />
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-group">
            <label>Min Priority</label>
            <div className="filter-chips">
              {[1, 2, 3, 4, 5].map(p => {
                const isActive = filters.minPriority === p;
                return (
                  <button
                    key={p}
                    className={`filter-chip priority ${isActive ? 'active' : ''}`}
                    onClick={() => setFilters({
                      ...filters,
                      minPriority: isActive ? null : p
                    })}
                  >
                    P{p}+
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="btn-clear-filters"
            onClick={() => setFilters({})}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

// Summary stats component
function SummaryStats({ summary }) {
  if (!summary) return null;

  return (
    <div className="notification-summary">
      <div className="summary-stat">
        <span className="stat-value">{summary.unread || 0}</span>
        <span className="stat-label">Unread</span>
      </div>
      <div className="summary-stat critical">
        <span className="stat-value">{summary.critical || 0}</span>
        <span className="stat-label">Critical</span>
      </div>
      <div className="summary-stat warning">
        <span className="stat-value">{summary.warnings || 0}</span>
        <span className="stat-label">Warnings</span>
      </div>
      {summary.byCategory && Object.entries(summary.byCategory).slice(0, 3).map(([cat, data]) => (
        <div key={cat} className="summary-stat">
          <span className="stat-value">{data.unread}</span>
          <span className="stat-label">{cat}</span>
        </div>
      ))}
    </div>
  );
}

// Main NotificationCenter component
export default function NotificationCenter({
  mode = 'full',  // 'full', 'panel', 'dropdown'
  category = null,  // Filter to specific category
  portfolioId = null,  // Filter to specific portfolio
  companyId = null,  // Filter to specific company
  symbol = null,  // Filter to specific symbol
  limit = 50,
  showSummary = true,
  showFilters = true,
  onClose = null
}) {
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState({ categories: {}, severities: {} });
  const [filters, setFilters] = useState({
    status: null,
    category: category,
    severity: null,
    minPriority: null
  });
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // Load notifications
  const loadNotifications = useCallback(async (reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);

      const offset = reset ? 0 : notifications.length;
      const response = await notificationsAPI.getNotifications({
        ...filters,
        portfolioId,
        companyId,
        symbol,
        limit,
        offset
      });

      if (response.data?.success) {
        const data = response.data.data || [];
        if (reset) {
          setNotifications(data);
        } else {
          setNotifications(prev => [...prev, ...data]);
        }
        setHasMore(response.data.pagination?.hasMore || false);
        setSummary(response.data.summary);
        setConfig(response.data.config || { categories: {}, severities: {} });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, portfolioId, companyId, symbol, limit, notifications.length]);

  // Initial load
  useEffect(() => {
    loadNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, portfolioId, companyId, symbol]);

  // Refresh periodically (for dropdown/panel modes)
  useEffect(() => {
    if (mode !== 'full') {
      const interval = setInterval(() => loadNotifications(true), 60000);
      return () => clearInterval(interval);
    }
  }, [mode, loadNotifications]);

  // Mark as read
  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, status: 'read', readAt: new Date().toISOString() } : n
      ));
      setSummary(prev => prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev);
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Dismiss
  const handleDismiss = async (id) => {
    try {
      await notificationsAPI.dismiss(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setSummary(prev => prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev);
    } catch (err) {
      console.error('Error dismissing notification:', err);
    }
  };

  // Snooze
  const handleSnooze = async (id, until) => {
    try {
      await notificationsAPI.snooze(id, until);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error snoozing notification:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.bulkMarkAsRead({
        category: filters.category,
        minPriority: filters.minPriority
      });
      setNotifications(prev => prev.map(n => ({
        ...n,
        status: 'read',
        readAt: new Date().toISOString()
      })));
      setSummary(prev => prev ? { ...prev, unread: 0 } : prev);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Action handler
  const handleAction = async (id, actionLabel, apiCall = null) => {
    try {
      await notificationsAPI.markAsActioned(id, actionLabel);
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, status: 'actioned' } : n
      ));
    } catch (err) {
      console.error('Error recording action:', err);
    }
  };

  // Render based on mode
  const renderContent = () => {
    if (loading && notifications.length === 0) {
      return (
        <div className="notification-loading">
          <RefreshCw className="spinning" size={24} />
          <p>Loading notifications...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="notification-error">
          <AlertCircle size={24} />
          <p>Error loading notifications</p>
          <button onClick={() => loadNotifications(true)}>Retry</button>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div className="notification-empty">
          <BellOff size={48} />
          <p>No notifications</p>
          <span>
            {filters.status === 'unread' ? 'All caught up!' : 'No notifications match your filters'}
          </span>
        </div>
      );
    }

    return (
      <>
        <div className="notification-list">
          {notifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onAction={handleAction}
              compact={mode === 'dropdown'}
            />
          ))}
        </div>

        {hasMore && (
          <div className="notification-load-more">
            <button
              onClick={() => loadNotifications(false)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </>
    );
  };

  // Dropdown mode
  if (mode === 'dropdown') {
    return (
      <div className="notification-center dropdown">
        <div className="dropdown-header">
          <span className="dropdown-title">Notifications</span>
          {summary?.unread > 0 && (
            <span className="dropdown-count">{summary.unread} unread</span>
          )}
        </div>
        {renderContent()}
        <Link to="/alerts" className="dropdown-view-all" onClick={onClose}>
          View All Notifications <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  // Panel mode (embedded)
  if (mode === 'panel') {
    return (
      <div className="notification-center panel">
        <div className="panel-header">
          <div className="panel-title">
            <Bell size={20} />
            <h3>Notifications</h3>
            {summary?.unread > 0 && (
              <span className="unread-badge">{summary.unread}</span>
            )}
          </div>
          <div className="panel-actions">
            {summary?.unread > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleMarkAllRead}
              >
                <CheckCheck size={14} />
                Mark All Read
              </button>
            )}
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => loadNotifications(true)}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>
        {renderContent()}
      </div>
    );
  }

  // Full page mode
  return (
    <div className="notification-center full">
      {showSummary && <SummaryStats summary={summary} />}

      {showFilters && (
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          categories={config.categories}
          onMarkAllRead={handleMarkAllRead}
          loading={loading}
        />
      )}

      {renderContent()}
    </div>
  );
}

// Export sub-components for flexibility
export { NotificationCard, FilterBar, SummaryStats };
