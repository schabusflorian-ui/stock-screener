// frontend/src/components/portfolio/PortfolioAlerts.js
import { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  TrendingDown,
  TrendingUp,
  DollarSign,
  PieChart,
  Settings,
  RefreshCw,
  CheckCheck
} from 'lucide-react';
import { portfoliosAPI, notificationsAPI } from '../../services/api';
import NotificationCenter from '../notifications/NotificationCenter';
import './PortfolioAlerts.css';

const ALERT_TYPE_INFO = {
  drawdown_threshold: {
    label: 'Drawdown Alert',
    icon: TrendingDown,
    description: 'Trigger when portfolio drops X% from high'
  },
  position_concentration: {
    label: 'Concentration Alert',
    icon: PieChart,
    description: 'Trigger when single position exceeds X% of portfolio'
  },
  daily_gain: {
    label: 'Daily Gain Alert',
    icon: TrendingUp,
    description: 'Trigger when portfolio gains X% in a day'
  },
  daily_loss: {
    label: 'Daily Loss Alert',
    icon: TrendingDown,
    description: 'Trigger when portfolio loses X% in a day'
  },
  new_high: {
    label: 'New High Alert',
    icon: TrendingUp,
    description: 'Notify on new all-time high'
  },
  cash_low: {
    label: 'Low Cash Alert',
    icon: DollarSign,
    description: 'Trigger when cash falls below $X'
  },
  stop_loss_triggered: {
    label: 'Stop Loss Triggered',
    icon: AlertTriangle,
    description: 'Notify when stop loss order executes'
  },
  take_profit_triggered: {
    label: 'Take Profit Triggered',
    icon: TrendingUp,
    description: 'Notify when take profit order executes'
  },
  dividend_received: {
    label: 'Dividend Received',
    icon: DollarSign,
    description: 'Notify on dividend payments'
  },
  rebalance_needed: {
    label: 'Rebalance Needed',
    icon: PieChart,
    description: 'Notify when allocations drift from targets'
  }
};

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red', icon: AlertTriangle },
  warning: { bg: 'bg-yellow', icon: AlertCircle },
  info: { bg: 'bg-blue', icon: Info }
};

// Settings panel component (used in both modes)
function AlertSettingsPanel({ settings, onUpdateSetting }) {
  return (
    <div className="alerts-settings">
      <h4>Alert Settings</h4>
      <div className="settings-grid">
        {Object.entries(ALERT_TYPE_INFO).map(([type, info]) => {
          const setting = settings[type] || { enabled: true, threshold: null };
          const Icon = info.icon;

          return (
            <div key={type} className="setting-item">
              <div className="setting-header">
                <Icon size={16} />
                <span className="setting-label">{info.label}</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={setting.enabled}
                    onChange={(e) => onUpdateSetting(type, e.target.checked, setting.threshold)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <p className="setting-description">{info.description}</p>
              {setting.threshold !== null && setting.enabled && (
                <div className="threshold-input">
                  <label>Threshold:</label>
                  <input
                    type="number"
                    value={setting.threshold}
                    onChange={(e) => onUpdateSetting(type, setting.enabled, parseFloat(e.target.value))}
                    step={type === 'cash_low' ? 100 : 0.5}
                  />
                  <span>{type === 'cash_low' ? '$' : '%'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Legacy alerts list (used when unified API is unavailable)
function LegacyAlertsList({ alerts, onMarkAsRead, onDismissAlert }) {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (alerts.length === 0) {
    return (
      <div className="no-alerts">
        <BellOff size={48} />
        <p>No alerts</p>
        <span>Alerts will appear here when triggered</span>
      </div>
    );
  }

  return (
    <>
      {alerts.map(alert => {
        const typeInfo = ALERT_TYPE_INFO[alert.alertType] || {
          label: alert.alertType,
          icon: AlertCircle
        };
        const severityStyle = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
        const Icon = typeInfo.icon;
        const SeverityIcon = severityStyle.icon;

        return (
          <div
            key={alert.id}
            className={`alert-item ${alert.isRead ? 'read' : 'unread'} ${severityStyle.bg}`}
          >
            <div className="alert-icon">
              <SeverityIcon size={20} />
            </div>
            <div className="alert-content">
              <div className="alert-header">
                <span className="alert-type">
                  <Icon size={14} />
                  {typeInfo.label}
                </span>
                <span className="alert-time">{formatDate(alert.createdAt)}</span>
              </div>
              <p className="alert-message">{alert.message}</p>
              {alert.data && (
                <div className="alert-details">
                  {alert.data.symbol && (
                    <span className="alert-detail">
                      Symbol: <strong>{alert.data.symbol}</strong>
                    </span>
                  )}
                  {alert.data.drawdownPct !== undefined && (
                    <span className="alert-detail">
                      Drawdown: <strong>{alert.data.drawdownPct.toFixed(2)}%</strong>
                    </span>
                  )}
                  {alert.data.concentrationPct !== undefined && (
                    <span className="alert-detail">
                      Concentration: <strong>{alert.data.concentrationPct.toFixed(2)}%</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="alert-actions">
              {!alert.isRead && (
                <button
                  className="btn-icon"
                  onClick={() => onMarkAsRead(alert.id)}
                  title="Mark as read"
                >
                  <Check size={16} />
                </button>
              )}
              <button
                className="btn-icon dismiss"
                onClick={() => onDismissAlert(alert.id)}
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function PortfolioAlerts({ portfolioId }) {
  // API mode detection
  const [useUnifiedAPI, setUseUnifiedAPI] = useState(true);
  const [checkingAPI, setCheckingAPI] = useState(true);

  // Legacy mode state
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);

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
        console.log('Unified notifications API not available, using legacy portfolio alerts');
        setUseUnifiedAPI(false);
      } finally {
        setCheckingAPI(false);
      }
    };
    checkUnifiedAPI();
  }, []);

  // Load settings (needed in both modes)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRes = await portfoliosAPI.getAlertSettings(portfolioId);
        setSettings(settingsRes.data.settings || {});
      } catch (err) {
        console.error('Error loading alert settings:', err);
      }
    };
    loadSettings();
  }, [portfolioId]);

  // Legacy mode: Load alerts data
  useEffect(() => {
    if (checkingAPI || useUnifiedAPI) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const alertsRes = await portfoliosAPI.getAlerts(portfolioId);
        setAlerts(alertsRes.data.alerts || []);
      } catch (err) {
        console.error('Error loading alerts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [portfolioId, checkingAPI, useUnifiedAPI]);

  const handleCheckAlerts = async () => {
    try {
      setChecking(true);
      await portfoliosAPI.checkAlerts(portfolioId);

      if (!useUnifiedAPI) {
        // Reload alerts in legacy mode
        const alertsRes = await portfoliosAPI.getAlerts(portfolioId);
        setAlerts(alertsRes.data.alerts || []);
      }
      // In unified mode, NotificationCenter handles its own refresh
    } catch (err) {
      console.error('Error checking alerts:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      if (useUnifiedAPI) {
        await notificationsAPI.bulkMarkAsRead({ category: 'portfolio' });
      } else {
        await portfoliosAPI.markAlertsRead(portfolioId, { all: true });
        setAlerts(alerts.map(a => ({ ...a, isRead: true })));
      }
    } catch (err) {
      console.error('Error marking alerts as read:', err);
    }
  };

  const handleDismissAlert = async (alertId) => {
    try {
      await portfoliosAPI.dismissAlert(portfolioId, alertId);
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (err) {
      console.error('Error dismissing alert:', err);
    }
  };

  const handleMarkAsRead = async (alertId) => {
    try {
      await portfoliosAPI.markAlertsRead(portfolioId, { alertIds: [alertId] });
      setAlerts(alerts.map(a =>
        a.id === alertId ? { ...a, isRead: true } : a
      ));
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  };

  const handleUpdateSetting = async (alertType, enabled, threshold) => {
    try {
      const result = await portfoliosAPI.updateAlertSetting(portfolioId, alertType, {
        enabled,
        threshold
      });
      setSettings(result.data.settings);
    } catch (err) {
      console.error('Error updating setting:', err);
    }
  };

  const unreadCount = useUnifiedAPI ? 0 : alerts.filter(a => !a.isRead).length;

  // Show loading while checking API
  if (checkingAPI) {
    return (
      <div className="portfolio-alerts loading">
        <RefreshCw className="loading-spinner" size={24} />
        <p>Loading alerts...</p>
      </div>
    );
  }

  // Unified mode: Use NotificationCenter in panel mode
  if (useUnifiedAPI) {
    return (
      <div className="portfolio-alerts unified-mode">
        {/* Header with settings toggle */}
        <div className="alerts-header">
          <div className="alerts-title">
            <Bell size={20} />
            <h3>Alerts</h3>
          </div>
          <div className="alerts-actions">
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleCheckAlerts}
              disabled={checking}
            >
              <RefreshCw size={14} className={checking ? 'spinning' : ''} />
              Check Now
            </button>
            <button
              className={`btn btn-sm ${showSettings ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings size={14} />
              Settings
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <AlertSettingsPanel
            settings={settings}
            onUpdateSetting={handleUpdateSetting}
          />
        )}

        {/* Unified NotificationCenter in panel mode */}
        <NotificationCenter
          mode="panel"
          category="portfolio"
          portfolioId={portfolioId}
          showSummary={false}
          showFilters={false}
          limit={20}
        />
      </div>
    );
  }

  // Legacy mode: Original implementation
  if (loading) {
    return (
      <div className="portfolio-alerts loading">
        <RefreshCw className="loading-spinner" size={24} />
        <p>Loading alerts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-alerts error">
        <AlertCircle size={24} />
        <p>Error loading alerts: {error}</p>
        <button onClick={() => window.location.reload()} className="btn btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="portfolio-alerts">
      {/* Header */}
      <div className="alerts-header">
        <div className="alerts-title">
          <Bell size={20} />
          <h3>Alerts</h3>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>
        <div className="alerts-actions">
          {unreadCount > 0 && (
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
            onClick={handleCheckAlerts}
            disabled={checking}
          >
            <RefreshCw size={14} className={checking ? 'spinning' : ''} />
            Check Now
          </button>
          <button
            className={`btn btn-sm ${showSettings ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={14} />
            Settings
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <AlertSettingsPanel
          settings={settings}
          onUpdateSetting={handleUpdateSetting}
        />
      )}

      {/* Legacy Alerts List */}
      <div className="alerts-list">
        <LegacyAlertsList
          alerts={alerts}
          onMarkAsRead={handleMarkAsRead}
          onDismissAlert={handleDismissAlert}
        />
      </div>
    </div>
  );
}

export default PortfolioAlerts;
