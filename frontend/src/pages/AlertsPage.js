// frontend/src/pages/AlertsPage.js
import { useState, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAskAI } from '../hooks/useAskAI';
import { RefreshCw, Bell, Settings, CheckCircle, Circle, Eye, AlertTriangle, Info, Sliders } from '../components/icons';
import { alertsAPI, notificationsAPI, pricesAPI } from '../services/api';
import { PageHeader, Button, Callout } from '../components/ui';
import NotificationCenter from '../components/notifications/NotificationCenter';
import { WhatMattersToday, DigestPreferences } from '../components/alerts';
import './AlertsPage.css';

// Format date (for legacy mode)
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

// Legacy Alert card component (used when unified API is unavailable)
const LegacyAlertCard = memo(function LegacyAlertCard({ alert, onMarkRead, onDismiss, priceData }) {
  const price = priceData?.[alert.symbol];
  const signalColors = {
    strong_buy: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
    buy: { bg: '#ECFDF5', border: '#059669', text: '#047857' },
    watch: { bg: '#E0E7FF', border: '#6366F1', text: '#4338CA' },
    warning: { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309' },
    info: { bg: '#F3F4F6', border: '#6B7280', text: '#374151' }
  };

  const signalIcons = {
    strong_buy: <CheckCircle size={16} color="#10B981" />,
    buy: <Circle size={16} color="#3B82F6" />,
    watch: <Eye size={16} color="#6366F1" />,
    warning: <AlertTriangle size={16} color="#F59E0B" />,
    info: <Info size={16} color="#6B7280" />
  };

  const colors = signalColors[alert.signal_type] || signalColors.info;

  const askAIProps = useAskAI(() => ({
    type: 'alert',
    symbol: alert.symbol,
    label: `${alert.symbol} - ${alert.title}`,
    data: {
      signalType: alert.signal_type,
      alertType: alert.alert_type,
      title: alert.title,
      description: alert.description,
      priority: alert.priority,
      price: price?.last_price
    }
  }));

  return (
    <div
      className={`alert-card ${alert.is_read ? 'read' : 'unread'}`}
      style={{ borderLeftColor: colors.border }}
      {...askAIProps}
    >
      <div className="alert-header">
        <div className="alert-meta">
          <span className="alert-icon">{signalIcons[alert.signal_type]}</span>
          <Link to={`/company/${alert.symbol}`} className="alert-symbol">
            {alert.symbol}
          </Link>
          {price?.last_price && (
            <span className="alert-price">
              ${price.last_price.toFixed(2)}
              {price.change_1d != null && (
                <span className={`price-change ${price.change_1d >= 0 ? 'up' : 'down'}`}>
                  {price.change_1d >= 0 ? '+' : ''}{price.change_1d.toFixed(1)}%
                </span>
              )}
            </span>
          )}
          <span
            className="alert-signal"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {alert.signal_type?.replace('_', ' ')}
          </span>
          <span className="alert-type">{alert.alert_type}</span>
          {alert.is_watchlist ? <span className="watchlist-badge">★</span> : null}
        </div>
        <div className="alert-actions">
          <span className="alert-time">{formatDate(alert.triggered_at)}</span>
          {!alert.is_read && (
            <button
              className="btn-icon"
              onClick={() => onMarkRead(alert.id)}
              title="Mark as read"
            >
              ✓
            </button>
          )}
          <button
            className="btn-icon"
            onClick={() => onDismiss(alert.id)}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
      <div className="alert-content">
        <h4 className="alert-title">{alert.title}</h4>
        <p className="alert-description">{alert.description}</p>
      </div>
      <div className="alert-footer">
        <span className="alert-priority">Priority: {alert.priority}/5</span>
        <Link to={`/company/${alert.symbol}`} className="btn-link">
          View Company →
        </Link>
      </div>
    </div>
  );
});

// Legacy Summary card component
const LegacySummaryCard = ({ summary }) => {
  return (
    <div className="summary-card">
      <div className="summary-stats">
        <div className="stat-item">
          <span className="stat-value">{summary?.unread || 0}</span>
          <span className="stat-label">Unread</span>
        </div>
        <div className="stat-item strong-buy">
          <span className="stat-value">{summary?.strong_buy_unread || 0}</span>
          <span className="stat-label">Strong Buy</span>
        </div>
        <div className="stat-item buy">
          <span className="stat-value">{summary?.buy_unread || 0}</span>
          <span className="stat-label">Buy</span>
        </div>
        <div className="stat-item warning">
          <span className="stat-value">{summary?.warning_unread || 0}</span>
          <span className="stat-label">Warnings</span>
        </div>
        <div className="stat-item total">
          <span className="stat-value">{summary?.total_buy_signals || 0}</span>
          <span className="stat-label">Total Buy Signals (7d)</span>
        </div>
      </div>
    </div>
  );
};

// Smart Alerts Page Component (new unified experience)
function SmartAlertsPage({ error, scanning, onScan }) {
  const [showDigestPrefs, setShowDigestPrefs] = useState(false);

  return (
    <div className="alerts-page smart-alerts">
      <PageHeader
        title="Smart Alerts"
        subtitle="AI-powered alerts with actionability scoring and market context"
        actions={
          <div className="alerts-page__header-actions">
            <Button
              variant="secondary"
              icon={Sliders}
              onClick={() => setShowDigestPrefs(true)}
            >
              Digest Settings
            </Button>
            <Link to="/settings" state={{ activeTab: 'notifications' }}>
              <Button variant="secondary" icon={Settings}>
                Configure
              </Button>
            </Link>
            <Button
              variant="primary"
              onClick={onScan}
              disabled={scanning}
              icon={RefreshCw}
            >
              {scanning ? 'Scanning...' : 'Run Scan'}
            </Button>
          </div>
        }
      />

      {error && (
        <Callout type="error">
          {error}
        </Callout>
      )}

      {/* AI Summary - What Matters Today */}
      <WhatMattersToday />

      {/* Main Notification List */}
      <NotificationCenter
        mode="full"
        showSummary={false}
        showFilters={true}
      />

      {/* Digest Preferences Modal */}
      {showDigestPrefs && (
        <DigestPreferences
          onClose={() => setShowDigestPrefs(false)}
        />
      )}
    </div>
  );
}

// Legacy Filter bar component
const LegacyFilterBar = ({ filters, setFilters, onMarkAllRead }) => {
  const signalTypes = ['strong_buy', 'buy', 'watch', 'warning', 'info'];
  const alertTypes = ['valuation', 'fundamental', 'price', 'filing', 'composite'];

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Signal Type</label>
        <div className="filter-buttons">
          {signalTypes.map(type => (
            <button
              key={type}
              className={`filter-btn ${filters.signals?.includes(type) ? 'active' : ''}`}
              onClick={() => {
                const current = filters.signals || [];
                if (current.includes(type)) {
                  setFilters({ ...filters, signals: current.filter(s => s !== type) });
                } else {
                  setFilters({ ...filters, signals: [...current, type] });
                }
              }}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Alert Type</label>
        <div className="filter-buttons">
          {alertTypes.map(type => (
            <button
              key={type}
              className={`filter-btn ${filters.types?.includes(type) ? 'active' : ''}`}
              onClick={() => {
                const current = filters.types || [];
                if (current.includes(type)) {
                  setFilters({ ...filters, types: current.filter(t => t !== type) });
                } else {
                  setFilters({ ...filters, types: [...current, type] });
                }
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Options</label>
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filters.unreadOnly ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, unreadOnly: !filters.unreadOnly })}
          >
            Unread Only
          </button>
          <button
            className={`filter-btn ${filters.watchlistOnly ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, watchlistOnly: !filters.watchlistOnly })}
          >
            Watchlist Only
          </button>
        </div>
      </div>

      <div className="filter-actions">
        <button
          className="btn-secondary"
          onClick={() => setFilters({})}
        >
          Clear Filters
        </button>
        <button
          className="btn-secondary"
          onClick={onMarkAllRead}
        >
          Mark All Read
        </button>
      </div>
    </div>
  );
};

export default function AlertsPage() {
  // State for unified vs legacy mode
  const [useUnifiedAPI, setUseUnifiedAPI] = useState(true);
  const [checkingAPI, setCheckingAPI] = useState(true);

  // Legacy mode state
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [priceData, setPriceData] = useState({});

  // Check if unified API is available
  useEffect(() => {
    const checkUnifiedAPI = async () => {
      try {
        const response = await notificationsAPI.getSummary();
        if (response.data?.success) {
          setUseUnifiedAPI(true);
        } else {
          setUseUnifiedAPI(false);
        }
      } catch (err) {
        console.log('Unified notifications API not available, using legacy alerts');
        setUseUnifiedAPI(false);
      } finally {
        setCheckingAPI(false);
      }
    };
    checkUnifiedAPI();
  }, []);

  // Legacy mode: Load alerts
  const loadAlerts = useCallback(async (reset = true) => {
    if (useUnifiedAPI) return; // Skip in unified mode

    try {
      if (reset) setLoading(true);
      setError(null);

      const offset = reset ? 0 : alerts.length;
      const response = await alertsAPI.getAlerts({
        ...filters,
        limit: 50,
        offset
      });

      if (response.data?.success) {
        const alertsData = response.data.data || [];
        if (reset) {
          setAlerts(alertsData);
        } else {
          setAlerts(prev => [...prev, ...alertsData]);
        }
        setHasMore(response.data.pagination?.hasMore || false);

        // Load prices for alert symbols in background
        const symbols = [...new Set(alertsData.map(a => a.symbol))];
        const newPrices = { ...priceData };
        await Promise.all(
          symbols.filter(s => !newPrices[s]).slice(0, 20).map(async (symbol) => {
            try {
              const res = await pricesAPI.getMetrics(symbol);
              if (res?.data?.data) {
                newPrices[symbol] = res.data.data;
              }
            } catch (e) {
              // Ignore individual price fetch errors
            }
          })
        );
        setPriceData(newPrices);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [useUnifiedAPI, filters, alerts.length, priceData]);

  // Legacy mode: Load summary
  const loadSummary = useCallback(async () => {
    if (useUnifiedAPI) return; // Skip in unified mode

    try {
      const response = await alertsAPI.getSummary();
      if (response.data?.success) {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error('Error loading summary:', err);
    }
  }, [useUnifiedAPI]);

  // Legacy mode: Initial load
  useEffect(() => {
    if (!checkingAPI && !useUnifiedAPI) {
      loadAlerts(true);
      loadSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAPI, useUnifiedAPI, filters]);

  // Legacy mode: Mark as read
  const handleMarkRead = async (alertId) => {
    try {
      await alertsAPI.markAsRead(alertId);
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, is_read: 1 } : a
      ));
      loadSummary();
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  };

  // Legacy mode: Dismiss alert
  const handleDismiss = async (alertId) => {
    try {
      await alertsAPI.dismiss(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      loadSummary();
    } catch (err) {
      console.error('Error dismissing alert:', err);
    }
  };

  // Legacy mode: Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await alertsAPI.markAllAsRead();
      setAlerts(prev => prev.map(a => ({ ...a, is_read: 1 })));
      loadSummary();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Run scan (works for both modes)
  const handleScan = async () => {
    try {
      setScanning(true);
      setError(null);
      const response = await alertsAPI.dailyScan();
      if (response.data?.success) {
        const results = response.data.data;
        alert(`Scan complete: ${results.alertsGenerated} alerts generated from ${results.companiesEvaluated} companies`);
        // Refresh notifications/alerts
        if (useUnifiedAPI) {
          // The NotificationCenter will auto-refresh
          window.location.reload();
        } else {
          loadAlerts(true);
          loadSummary();
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  // Show loading while checking API availability
  if (checkingAPI) {
    return (
      <div className="alerts-page">
        <PageHeader
          title="Notification Center"
          subtitle="Alerts, signals, and important updates"
        />
        <div className="loading">
          <RefreshCw className="spinning" size={24} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Unified mode: Use NotificationCenter component with Smart Alerts
  if (useUnifiedAPI) {
    return (
      <SmartAlertsPage
        error={error}
        scanning={scanning}
        onScan={handleScan}
      />
    );
  }

  // Legacy mode: Original AlertsPage implementation
  return (
    <div className="alerts-page">
      <PageHeader
        title="Alert Center"
        subtitle="Buy signals, valuation alerts, and market opportunities"
        actions={
          <div className="alerts-page__header-actions">
            <Link to="/settings" state={{ activeTab: 'notifications' }}>
              <Button variant="secondary" icon={Settings}>
                Configure Alerts
              </Button>
            </Link>
            <Button
              variant="primary"
              onClick={handleScan}
              disabled={scanning}
              icon={RefreshCw}
            >
              {scanning ? 'Scanning...' : 'Run Scan'}
            </Button>
          </div>
        }
      />

      {error && (
        <Callout type="error">
          {error}
        </Callout>
      )}

      <LegacySummaryCard summary={summary} />

      <LegacyFilterBar
        filters={filters}
        setFilters={setFilters}
        onMarkAllRead={handleMarkAllRead}
      />

      {loading ? (
        <div className="loading">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <Bell size={48} className="empty-icon" />
          <p>No alerts found</p>
          <p className="hint">Run a scan to detect new buy signals and alerts</p>
        </div>
      ) : (
        <>
          <div className="alerts-list">
            {alerts.map(alert => (
              <LegacyAlertCard
                key={alert.id}
                alert={alert}
                onMarkRead={handleMarkRead}
                onDismiss={handleDismiss}
                priceData={priceData}
              />
            ))}
          </div>

          {hasMore && (
            <div className="load-more">
              <button
                className="btn-secondary"
                onClick={() => loadAlerts(false)}
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
