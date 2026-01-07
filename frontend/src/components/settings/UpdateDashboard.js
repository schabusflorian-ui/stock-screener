// frontend/src/components/settings/UpdateDashboard.js
// Clean, professional data update management with table view and toggles

import { useState, useEffect, useCallback } from 'react';
import { settingsAPI, insidersAPI, capitalAPI, sentimentAPI, priceUpdatesAPI, indicesAPI, secRefreshAPI, knowledgeAPI, tradingAPI, snapshotsAPI, investorsAPI, etfsAPI } from '../../services/api';
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
    description: 'S&P 500, Nasdaq, Dow Jones prices',
    frequency: 'Daily',
    category: 'market',
    getStatus: () => indicesAPI.getAll(), // Returns indices with last update info
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
];

function UpdateDashboard() {
  const [schedules, setSchedules] = useState([]);
  const [updateStatuses, setUpdateStatuses] = useState({});
  const [loadingStatuses, setLoadingStatuses] = useState({});
  const [runningUpdates, setRunningUpdates] = useState({});
  const [updateErrors, setUpdateErrors] = useState({});
  const [updateRuntime, setUpdateRuntime] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const handleRunUpdate = async (updateType) => {
    if (runningUpdates[updateType.id]) return;

    const startTime = Date.now();
    setRunningUpdates(prev => ({ ...prev, [updateType.id]: true }));
    setUpdateErrors(prev => ({ ...prev, [updateType.id]: null }));
    setUpdateRuntime(prev => ({ ...prev, [updateType.id]: null }));

    try {
      await updateType.runUpdate();
      // Calculate runtime
      const runtime = ((Date.now() - startTime) / 1000).toFixed(1);
      setUpdateRuntime(prev => ({ ...prev, [updateType.id]: `${runtime}s` }));
      // Refresh status after update
      setTimeout(() => {
        fetchStatuses();
        setRunningUpdates(prev => ({ ...prev, [updateType.id]: false }));
      }, 1000);
    } catch (err) {
      console.error(`Failed to run ${updateType.name}:`, err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Update failed';
      setUpdateErrors(prev => ({ ...prev, [updateType.id]: errorMsg }));
      setRunningUpdates(prev => ({ ...prev, [updateType.id]: false }));
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

    const status = updateStatuses[typeId];
    if (!status) return null;

    const type = UPDATE_TYPES.find(t => t.id === typeId);
    if (type?.statusKey && status[type.statusKey]) {
      if (typeof status[type.statusKey] === 'string') {
        return status[type.statusKey];
      }
      if (status[type.statusKey].modified) {
        return status[type.statusKey].modified;
      }
    }

    return status.lastUpdate || status.lastRun || status.lastImport || status.lastScan || null;
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
                      <div className="last-run-info">
                        <span>{formatRelativeTime(lastRun)}</span>
                        {runtime && <span className="runtime-badge">{runtime}</span>}
                      </div>
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
