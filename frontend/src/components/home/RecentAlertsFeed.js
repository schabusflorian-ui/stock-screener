// frontend/src/components/home/RecentAlertsFeed.js
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Bot,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  Clock
} from '../icons';
import './RecentAlertsFeed.css';

// Get icon for alert type
function getAlertIcon(type) {
  const icons = {
    agent_signal: Bot,
    price_alert: TrendingUp,
    insider: Users,
    earnings: FileText,
    valuation: DollarSign,
    portfolio_drawdown: TrendingDown,
    portfolio_concentration: AlertTriangle,
    news: FileText,
    default: Bell
  };
  return icons[type] || icons.default;
}

// Get color class for alert type
function getAlertColor(type, priority) {
  if (priority === 'high' || priority === 'critical') return 'high';
  if (type === 'agent_signal') return 'agent';
  if (type === 'price_alert' || type === 'valuation') return 'price';
  if (type === 'insider') return 'insider';
  if (type === 'portfolio_drawdown' || type === 'portfolio_concentration') return 'portfolio';
  return 'default';
}

// Format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
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
}

function RecentAlertsFeed({
  alerts = [],
  loading = false,
  maxItems = 5
}) {
  // Ensure alerts is an array
  const alertsList = Array.isArray(alerts) ? alerts : [];

  if (loading) {
    return (
      <div className="recent-alerts-feed">
        <div className="alerts-feed-header">
          <div className="alerts-header-content">
            <span className="section-label">NOTIFICATIONS</span>
            <h3><Bell size={16} /> Recent Alerts</h3>
          </div>
        </div>
        <div className="alerts-feed-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="alert-item skeleton">
              <div className="skeleton-icon" />
              <div className="skeleton-content">
                <div className="skeleton-line wide" />
                <div className="skeleton-line medium" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayAlerts = alertsList.slice(0, maxItems);

  return (
    <div className="recent-alerts-feed">
      <div className="alerts-feed-header">
        <div className="alerts-header-content">
          <span className="section-label">NOTIFICATIONS</span>
          <h3><Bell size={16} /> Recent Alerts</h3>
        </div>
        <Link to="/alerts" className="view-all-link">
          View All <ChevronRight size={14} />
        </Link>
      </div>

      {displayAlerts.length > 0 ? (
        <div className="alerts-feed-list">
          {displayAlerts.map((alert, idx) => {
            const Icon = getAlertIcon(alert.type);
            const colorClass = getAlertColor(alert.type, alert.priority);

            return (
              <Link
                key={alert.id || idx}
                to={alert.link || `/alerts?id=${alert.id}`}
                className={`alert-item ${!alert.read ? 'unread' : ''}`}
              >
                <div className={`alert-icon ${colorClass}`}>
                  <Icon size={14} />
                </div>
                <div className="alert-content">
                  <span className="alert-title">{alert.title}</span>
                  {alert.symbol && (
                    <span className="alert-symbol">{alert.symbol}</span>
                  )}
                  <span className="alert-message">{alert.message}</span>
                </div>
                <div className="alert-meta">
                  <Clock size={10} />
                  <span>{formatRelativeTime(alert.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="alerts-feed-empty">
          <Bell size={24} className="empty-icon" />
          <span>No recent alerts</span>
          <p>You'll see notifications about your portfolios, agents, and market events here.</p>
        </div>
      )}
    </div>
  );
}

export default RecentAlertsFeed;
