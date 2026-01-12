// frontend/src/components/settings/UpdateDashboard.js
// Clean, professional data update management with table view and toggles

import { useState, useEffect, useCallback } from 'react';
import { settingsAPI, insidersAPI, capitalAPI, sentimentAPI, priceUpdatesAPI, indicesAPI, secRefreshAPI, knowledgeAPI, tradingAPI, snapshotsAPI, investorsAPI, etfsAPI, xbrlAPI, europeanAPI } from '../../services/api';
import { Play, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import './SettingsComponents.css';

// Format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return 'Never';
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

// Status indicator component
function StatusIndicator({ status, isRunning }) {
  if (isRunning) {
    return <Loader2 size={16} className="status-icon spinning" />;
  }

  switch (status) {
    case 'completed':
    case 'success':
    case 'idle':
      return <CheckCircle size={16} className="status-icon success" />;
    case 'failed':
    case 'error':
      return <XCircle size={16} className="status-icon error" />;
    case 'running':
      return <Loader2 size={16} className="status-icon spinning" />;
    default:
      return <Clock size={16} className="status-icon muted" />;
  }
}

// Toggle switch component
function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-slider" />
    </label>
  );
}

// Define all update types with their configuration
const UPDATE_TYPES = [
  {
    id: 'stock_prices',
    name: 'Stock Prices',
    description: 'Daily closing prices for tracked stocks',
    frequency: 'Daily',
    category: 'market',
    getStatus: () => priceUpdatesAPI.getStats(),
    runUpdate: () => priceUpdatesAPI.run(),
    statusKey: 'overall',
  },
  {
    id: 'stock_fundamentals',
    name: 'SEC Filings',
    description: 'Financial statements from 10-K/10-Q filings',
    frequency: 'Weekly',
    category: 'fundamentals',
    getStatus: () => secRefreshAPI.getStatus(),
    runUpdate: () => secRefreshAPI.run('watchlist'),
    statusKey: 'recentUpdates',
  },
  {
    id: 'insider_transactions',
    name: 'Insider Trading',
    description: 'Form 4 insider trading filings',
    frequency: 'Daily',
    category: 'fundamentals',
    getStatus: () => insidersAPI.getUpdateStatus(),
    runUpdate: () => insidersAPI.triggerUpdate(30),
    statusKey: 'lastImport',
  },
  {
    id: 'capital_allocation',
    name: 'Capital Allocation',
    description: 'Dividends, buybacks, and shareholder returns',
    frequency: 'Weekly',
    category: 'fundamentals',
    getStatus: () => capitalAPI.getStats(),
    runUpdate: () => capitalAPI.triggerUpdate(),
    statusKey: 'lastUpdate',
  },
  {
    id: 'investor_13f',
    name: '13F Holdings',
    description: 'Famous investor quarterly portfolio filings',
    frequency: 'Quarterly',
    category: 'fundamentals',
    getStatus: () => investorsAPI.getStatus(), // Fast status endpoint
    runUpdate: () => investorsAPI.fetchAll13F(),
    statusKey: 'lastUpdate',
  },
  {
    id: 'etf_holdings',
    name: 'ETF Holdings',
    description: 'ETF holdings and composition data',
    frequency: 'Quarterly',
    category: 'fundamentals',
    getStatus: () => etfsAPI.getHoldingsStatus(),
    runUpdate: () => etfsAPI.refreshAllHoldings(),
    statusKey: 'lastUpdate',
  },
  {
    id: 'reddit_sentiment',
    name: 'Reddit Sentiment',
    description: 'Stock mentions from WSB, r/stocks, r/investing',
    frequency: 'Hourly',
    category: 'sentiment',
    getStatus: () => sentimentAPI.getStatus(),
    runUpdate: () => sentimentAPI.getTrending('24h', 50, true), // refresh=true triggers scan
    statusKey: 'lastScan',
  },
  {
    id: 'index_prices',
    name: 'Market Indices',
    description: 'SPY, QQQ, DIA, sector ETFs prices & alpha calculation',
    frequency: 'Daily',
    category: 'market',
    getStatus: () => indicesAPI.getETFs(), // Returns ETF-based indices with last update info
    runUpdate: () => indicesAPI.update(),
    statusKey: 'lastUpdate',
  },
  {
    id: 'knowledge_base',
    name: 'AI Knowledge Base',
    description: 'Investment wisdom and research documents',
    frequency: 'Weekly',
    category: 'ai',
    getStatus: () => knowledgeAPI.getUpdateStatus(),
    runUpdate: () => knowledgeAPI.refresh('incremental'),
    statusKey: 'database',
  },
  {
    id: 'liquidity_metrics',
    name: 'Liquidity Metrics',
    description: 'Volume, volatility, bid-ask spreads, market impact',
    frequency: 'Daily (8 PM ET)',
    category: 'trading',
    getStatus: () => tradingAPI.getLiquidityStatus(),
    runUpdate: () => tradingAPI.refreshLiquidity(),
    statusKey: 'lastRun',
  },
  {
    id: 'portfolio_snapshots',
    name: 'Portfolio Snapshots',
    description: 'Daily portfolio value snapshots for VaR/performance',
    frequency: 'Daily (7 PM ET)',
    category: 'trading',
    getStatus: async () => {
      // Get summary stats about snapshots
      const health = await tradingAPI.getHealth();
      return health.data;
    },
    runUpdate: () => snapshotsAPI.createAll(),
    statusKey: 'liquidity',
  },
  {
    id: 'market_regime',
    name: 'Market Regime',
    description: 'Bull/Bear/Sideways market classification',
    frequency: 'On-demand',
    category: 'trading',
    getStatus: () => tradingAPI.getRegime(),
    runUpdate: () => tradingAPI.getRegime(), // Recalculates on fetch
    statusKey: 'timestamp',
  },
  // === EU/UK Data Updates ===
  {
    id: 'xbrl_import',
    name: 'EU/UK XBRL Import',
    description: 'Import EU/UK company filings from XBRL registry',
    frequency: 'Weekly',
    category: 'international',
    getStatus: () => xbrlAPI.getBackfillStatus(),
    runUpdate: () => xbrlAPI.startBackfill(['GB', 'DE', 'FR'], 2021),
    statusKey: 'stats',
  },
  {
    id: 'european_prices',
    name: 'EU/UK Prices',
    description: 'Stock prices for European companies (LSE, XETRA, Euronext)',
    frequency: 'Daily (12 PM ET)',
    category: 'international',
    getStatus: () => europeanAPI.getStatus(),
    runUpdate: () => europeanAPI.updatePrices('GB'),
    statusKey: 'prices',
  },
  {
    id: 'european_indices',
    name: 'European Indices',
    description: 'FTSE 100, DAX 40, CAC 40 constituents',
    frequency: 'Weekly',
    category: 'international',
    getStatus: () => europeanAPI.getIndexStats(),
    runUpdate: () => europeanAPI.updateIndices(),
    statusKey: 'indices',
  },
  {
    id: 'european_valuations',
    name: 'EU/UK Valuations',
    description: 'PE, PB, PS ratios for European companies',
    frequency: 'Daily (12:30 PM ET)',
    category: 'international',
    getStatus: () => europeanAPI.getStatus(),
    runUpdate: () => europeanAPI.calculateValuations(),
    statusKey: 'valuations',
  },
];

// Toast notification component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`update-toast ${type}`}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">&times;</button>
    </div>
  );
}

function UpdateDashboard() {
  const [schedules, setSchedules] = useState([]);
  const [updateStatuses, setUpdateStatuses] = useState({});
  const [loadingStatuses, setLoadingStatuses] = useState({});
  const [runningUpdates, setRunningUpdates] = useState({});
  const [updateErrors, setUpdateErrors] = useState({});
  const [updateRuntime, setUpdateRuntime] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Add toast notification
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  // Remove toast
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fetch schedules from backend
  const fetchSchedules = useCallback(async () => {
    try {
      const response = await settingsAPI.getUpdateSchedules();
      const data = response.data?.data || response.data?.schedules || response.data || [];
      setSchedules(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to load schedules:', err);
      setError('Failed to load update schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch status for each update type individually (progressive loading)
  const fetchStatuses = useCallback(async () => {
    // Mark all as loading
    const loadingState = {};
    UPDATE_TYPES.forEach(type => { loadingState[type.id] = true; });
    setLoadingStatuses(loadingState);

    // Fetch each status individually and update as they arrive
    UPDATE_TYPES.forEach(async (type) => {
      try {
        const response = await type.getStatus();
        setUpdateStatuses(prev => ({
          ...prev,
          [type.id]: response.data || response
        }));
      } catch {
        setUpdateStatuses(prev => ({ ...prev, [type.id]: null }));
      } finally {
        setLoadingStatuses(prev => ({ ...prev, [type.id]: false }));
      }
    });
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchStatuses();

    // Refresh every 60 seconds (increased from 30 for performance)
    const interval = setInterval(() => {
      fetchSchedules();
      fetchStatuses();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchSchedules, fetchStatuses]);

  // Toggle schedule enabled/disabled
  const handleToggleSchedule = async (name, enabled) => {
    try {
      await settingsAPI.toggleSchedule(name, enabled);
      fetchSchedules();
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  // Run manual update with error/runtime tracking
  // Background updates return immediately but continue processing - poll for status updates
  const handleRunUpdate = async (updateType) => {
    if (runningUpdates[updateType.id]) return;

    const startTime = Date.now();
    setRunningUpdates(prev => ({ ...prev, [updateType.id]: true }));
    setUpdateErrors(prev => ({ ...prev, [updateType.id]: null }));
    setUpdateRuntime(prev => ({ ...prev, [updateType.id]: 'Starting...' }));

    try {
      // Trigger the update (returns immediately for background jobs)
      await updateType.runUpdate();

      // For background updates, poll status for up to 2 minutes to show progress
      // This gives user visibility that the update is actually running
      setUpdateRuntime(prev => ({ ...prev, [updateType.id]: 'Processing...' }));

      let pollCount = 0;
      const maxPolls = 24; // Poll for up to 2 minutes (5s * 24 = 120s)
      const pollInterval = 5000;

      const pollStatus = async () => {
        pollCount++;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Update the runtime display to show elapsed time
        setUpdateRuntime(prev => ({
          ...prev,
          [updateType.id]: `${elapsed}s elapsed`
        }));

        // Refresh statuses to get latest data
        try {
          const response = await updateType.getStatus();
          setUpdateStatuses(prev => ({
            ...prev,
            [updateType.id]: response.data || response
          }));
        } catch {
          // Status fetch failed, ignore
        }

        // Continue polling if still within time limit
        if (pollCount < maxPolls) {
          setTimeout(pollStatus, pollInterval);
        } else {
          // Done polling - show final status
          const totalTime = Math.round((Date.now() - startTime) / 1000);
          setUpdateRuntime(prev => ({
            ...prev,
            [updateType.id]: `~${totalTime}s`
          }));
          setRunningUpdates(prev => ({ ...prev, [updateType.id]: false }));
          addToast(`${updateType.name} update completed (~${totalTime}s)`, 'success');
        }
      };

      // Start polling after initial delay
      setTimeout(pollStatus, pollInterval);

    } catch (err) {
      console.error(`Failed to run ${updateType.name}:`, err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Update failed';
      setUpdateErrors(prev => ({ ...prev, [updateType.id]: errorMsg }));
      setRunningUpdates(prev => ({ ...prev, [updateType.id]: false }));
      setUpdateRuntime(prev => ({ ...prev, [updateType.id]: null }));
    }
  };

  // Get schedule for update type
  const getScheduleForType = (typeId) => {
    return schedules.find(s => s.name === typeId);
  };

  // Get last run time for update type
  const getLastRun = (typeId) => {
    const schedule = getScheduleForType(typeId);
    if (schedule?.lastRunAt) return schedule.lastRunAt;

    let status = updateStatuses[typeId];
    if (!status) return null;

    // Handle nested data structure: {success: true, data: {...}}
    // Some endpoints wrap response in data property
    if (status.data && typeof status.data === 'object') {
      status = status.data;
    }

    // Price updates: recentRuns[0].created_at
    if (status.recentRuns && status.recentRuns.length > 0) {
      return status.recentRuns[0].created_at;
    }

    // SEC refresh: lastUpdate (when data was actually written to DB)
    if (status.lastUpdate) return status.lastUpdate;

    // Indices/ETFs: check if it's an array (list of indices with dates)
    if (Array.isArray(status) && status.length > 0) {
      // ETFs have updated_at (when we last fetched data)
      if (status[0].updated_at) return status[0].updated_at;
      // Use last_price_date for indices (market date)
      if (status[0].last_price_date) return status[0].last_price_date;
      if (status[0].last_update) return status[0].last_update;
    }

    // Knowledge base: database.modified
    if (status.database?.modified) return status.database.modified;

    // Trading/liquidity: lastRun
    if (status.lastRun) return status.lastRun;

    // Market regime: timestamp
    if (status.timestamp) return status.timestamp;

    // Sentiment: lastScan
    if (status.lastScan) return status.lastScan;

    // ETF holdings: lastUpdate
    if (status.lastUpdate) return status.lastUpdate;

    // Insider trading: lastImport
    if (status.lastImport) return status.lastImport;

    // Investors: lastFetch or filingDate from recent holdings
    if (status.lastFetch) return status.lastFetch;

    return null;
  };

  // Get status for update type
  const getStatus = (typeId) => {
    const schedule = getScheduleForType(typeId);
    return schedule?.status || 'idle';
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader2 size={24} className="spinning" />
        <span>Loading update schedules...</span>
      </div>
    );
  }

  return (
    <div className="update-dashboard">
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="settings-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="update-summary">
        <div className="summary-stat">
          <span className="stat-value">{schedules.filter(s => s.isEnabled).length}</span>
          <span className="stat-label">Active Schedules</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{UPDATE_TYPES.length}</span>
          <span className="stat-label">Data Sources</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{Object.keys(runningUpdates).filter(k => runningUpdates[k]).length}</span>
          <span className="stat-label">Running</span>
        </div>
      </div>

      {/* Update Types Table */}
      <div className="update-table-container">
        <table className="update-table">
          <thead>
            <tr>
              <th>Data Source</th>
              <th>Schedule</th>
              <th>Last Run</th>
              <th>Status</th>
              <th>Auto</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {UPDATE_TYPES.map((type) => {
              const schedule = getScheduleForType(type.id);
              const isEnabled = schedule?.isEnabled ?? true;
              const isRunning = runningUpdates[type.id];
              const isLoadingStatus = loadingStatuses[type.id];
              const lastRun = getLastRun(type.id);
              const status = getStatus(type.id);
              const hasError = updateErrors[type.id];
              const runtime = updateRuntime[type.id];

              return (
                <tr key={type.id} className={`${isRunning ? 'running' : ''} ${hasError ? 'has-error' : ''}`}>
                  <td>
                    <div className="update-name">
                      <strong>{type.name}</strong>
                      <span className="update-description">{type.description}</span>
                      {hasError && (
                        <div className="update-error">
                          <AlertTriangle size={12} />
                          <span>{hasError}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="frequency-badge">{type.frequency}</span>
                  </td>
                  <td className="last-run">
                    {isLoadingStatus ? (
                      <span className="loading-text">...</span>
                    ) : (
                      <span>{formatRelativeTime(lastRun)}</span>
                    )}
                  </td>
                  <td>
                    <div className="status-cell">
                      <StatusIndicator status={hasError ? 'error' : status} isRunning={isRunning || isLoadingStatus} />
                      <span className={`status-text ${hasError ? 'error' : status}`}>
                        {isRunning ? 'Running' : isLoadingStatus ? 'Loading' : hasError ? 'Failed' : status}
                      </span>
                    </div>
                  </td>
                  <td>
                    <ToggleSwitch
                      enabled={isEnabled}
                      onChange={(enabled) => handleToggleSchedule(type.id, enabled)}
                      disabled={isRunning}
                    />
                  </td>
                  <td>
                    <div className="action-cell">
                      <button
                        className="run-btn"
                        onClick={() => handleRunUpdate(type)}
                        disabled={isRunning}
                        title={isRunning ? 'Update in progress' : 'Run now'}
                      >
                        {isRunning ? (
                          <Loader2 size={14} className="spinning" />
                        ) : (
                          <Play size={14} />
                        )}
                        <span>{isRunning ? 'Running...' : 'Run'}</span>
                      </button>
                      {runtime && (
                        <span className={`runtime-badge ${isRunning ? 'processing' : 'completed'}`}>
                          {runtime}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button
          className="btn-secondary"
          onClick={() => {
            fetchSchedules();
            fetchStatuses();
          }}
        >
          <RefreshCw size={14} />
          Refresh Status
        </button>
      </div>
    </div>
  );
}

export default UpdateDashboard;
