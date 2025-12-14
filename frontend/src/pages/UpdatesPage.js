// frontend/src/pages/UpdatesPage.js
import { useState, useEffect, useCallback } from 'react';
import { updatesAPI } from '../services/api';
import './UpdatesPage.css';

// Format date for display
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format number with commas
const formatNumber = (num) => {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
};

// Status badge component
function StatusBadge({ status }) {
  const statusColors = {
    completed: 'status-completed',
    running: 'status-running',
    failed: 'status-failed',
    idle: 'status-idle'
  };

  return (
    <span className={`status-badge ${statusColors[status] || 'status-idle'}`}>
      {status}
    </span>
  );
}

// Progress bar component
function ProgressBar({ progress }) {
  if (!progress) return null;

  const { stage, percent, message, companiesProcessed, companiesTotal, recordsAdded, currentCompany } = progress;

  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-stage">{stage}</span>
        <span className="progress-percent">{Math.round(percent || 0)}%</span>
      </div>

      <div className="progress-bar-wrapper">
        <div
          className="progress-bar-fill"
          style={{ width: `${percent || 0}%` }}
        />
      </div>

      {message && <div className="progress-message">{message}</div>}

      {companiesTotal > 0 && (
        <div className="progress-details">
          <span>Companies: {companiesProcessed || 0} / {companiesTotal}</span>
          {recordsAdded > 0 && <span>Records: {formatNumber(recordsAdded)}</span>}
          {currentCompany && <span>Current: {currentCompany}</span>}
        </div>
      )}
    </div>
  );
}

// Data freshness card
function FreshnessCard({ freshness }) {
  if (!freshness) return null;

  return (
    <div className="card freshness-card">
      <h3>Data Freshness</h3>

      <div className="freshness-stats">
        <div className="stat-item">
          <span className="stat-value">{formatNumber(freshness.totalCompanies)}</span>
          <span className="stat-label">Total Companies</span>
        </div>

        <div className="stat-item">
          <span className="stat-value highlight">{formatNumber(freshness.needingUpdate)}</span>
          <span className="stat-label">Needing Update</span>
        </div>

        {freshness.latestFiling && (
          <div className="stat-item">
            <span className="stat-value">{freshness.latestFiling}</span>
            <span className="stat-label">Latest Filing</span>
          </div>
        )}

        {freshness.oldestData && (
          <div className="stat-item">
            <span className="stat-value">{freshness.oldestData}</span>
            <span className="stat-label">Oldest Data</span>
          </div>
        )}
      </div>

      {!freshness.freshnessInitialized && (
        <div className="freshness-warning">
          Freshness tracking not initialized. Run initialization after bulk import.
        </div>
      )}
    </div>
  );
}

// Companies needing update list
function CompaniesNeedingUpdate({ companies, total, onLoadMore, loading }) {
  if (!companies || companies.length === 0) {
    return (
      <div className="card companies-update-card">
        <h3>Companies Needing Update</h3>
        <p className="no-data">No companies need updates at this time</p>
      </div>
    );
  }

  return (
    <div className="card companies-update-card">
      <h3>Companies Needing Update ({total})</h3>

      <div className="companies-update-list">
        <table className="companies-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>CIK</th>
              <th>Latest Filing</th>
              <th>Latest 10-K</th>
              <th>Latest 10-Q</th>
              <th>Pending</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id}>
                <td className="symbol-cell">
                  {company.symbol ? (
                    <a href={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </a>
                  ) : (
                    <span className="no-symbol">-</span>
                  )}
                </td>
                <td className="company-name-cell">{company.company_name || '-'}</td>
                <td className="cik-cell">{company.cik}</td>
                <td>{company.latest_filing_date || '-'}</td>
                <td>{company.latest_10k_date || '-'}</td>
                <td>{company.latest_10q_date || '-'}</td>
                <td className="pending-cell">
                  {company.pendingFilings && company.pendingFilings.length > 0 ? (
                    <span className="pending-badge">
                      {company.pendingFilings.length} filing{company.pendingFilings.length > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="needs-check">Needs check</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {companies.length < total && (
        <div className="load-more-container">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? 'Loading...' : `Load More (${companies.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}

// Update history table
function UpdateHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="card history-card">
        <h3>Update History</h3>
        <p className="no-data">No updates yet</p>
      </div>
    );
  }

  return (
    <div className="card history-card">
      <h3>Update History</h3>

      <table className="history-table">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Status</th>
            <th>Companies</th>
            <th>Records</th>
            <th>Started</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {history.map((update) => {
            const duration = update.completed_at && update.started_at
              ? Math.round((new Date(update.completed_at) - new Date(update.started_at)) / 1000 / 60)
              : null;

            return (
              <tr key={update.id} className={`status-row-${update.status}`}>
                <td>{update.quarter || '-'}</td>
                <td><StatusBadge status={update.status} /></td>
                <td>{formatNumber(update.companies_updated)} / {formatNumber(update.companies_checked)}</td>
                <td>{formatNumber(update.records_added)}</td>
                <td>{formatDate(update.started_at)}</td>
                <td>{duration ? `${duration} min` : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Main Updates Page
function UpdatesPage() {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [companiesNeedingUpdate, setCompaniesNeedingUpdate] = useState([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkingAvailable, setCheckingAvailable] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState(null);
  const [forceUpdate, setForceUpdate] = useState(false);

  // Load status
  const loadStatus = useCallback(async () => {
    try {
      const data = await updatesAPI.getStatus();
      setStatus(data);
      setSelectedQuarter(data.availableQuarter);

      if (!data.updateInProgress) {
        setProgress(null);
      }
    } catch (err) {
      console.error('Error loading status:', err);
      setError(err.message);
    }
  }, []);

  // Load progress when update is running
  const loadProgress = useCallback(async () => {
    try {
      const data = await updatesAPI.getProgress();
      if (data.status === 'running') {
        setProgress(data.progress);
      } else {
        setProgress(null);
        // Reload status when update completes
        loadStatus();
        loadHistory();
      }
    } catch (err) {
      console.error('Error loading progress:', err);
    }
  }, [loadStatus]);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const data = await updatesAPI.getHistory(20);
      setHistory(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }, []);

  // Load companies needing update
  const loadCompaniesNeedingUpdate = useCallback(async (reset = false) => {
    try {
      setLoadingCompanies(true);
      const offset = reset ? 0 : companiesNeedingUpdate.length;
      const data = await updatesAPI.getCompaniesNeedingUpdate(50, offset);

      if (reset) {
        setCompaniesNeedingUpdate(data.companies);
      } else {
        setCompaniesNeedingUpdate(prev => [...prev, ...data.companies]);
      }
      setCompaniesTotal(data.total);
    } catch (err) {
      console.error('Error loading companies needing update:', err);
    } finally {
      setLoadingCompanies(false);
    }
  }, [companiesNeedingUpdate.length]);

  // Load more companies
  const loadMoreCompanies = () => {
    loadCompaniesNeedingUpdate(false);
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadHistory()]);
      // Load companies after status to get the count
      await loadCompaniesNeedingUpdate(true);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, loadHistory]);

  // Poll for progress when update is running
  useEffect(() => {
    if (status?.updateInProgress) {
      const interval = setInterval(loadProgress, 2000);
      return () => clearInterval(interval);
    }
  }, [status?.updateInProgress, loadProgress]);

  // Check if bulk file is available
  const checkAvailability = async () => {
    setCheckingAvailable(true);
    setAvailabilityResult(null);
    try {
      const result = await updatesAPI.checkAvailable(selectedQuarter);
      setAvailabilityResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingAvailable(false);
    }
  };

  // Run update
  const runUpdate = async () => {
    try {
      setError(null);
      await updatesAPI.run(selectedQuarter, forceUpdate);
      // Start polling
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
  };

  // Initialize freshness tracking
  const initializeFreshness = async () => {
    try {
      setError(null);
      await updatesAPI.initializeFreshness();
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="updates-page">
        <div className="loading">Loading update status...</div>
      </div>
    );
  }

  const isRunning = status?.updateInProgress;

  return (
    <div className="updates-page">
      <header className="page-header">
        <h1>Data Updates</h1>
        <p className="subtitle">Manage quarterly SEC data imports</p>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Current Update Section */}
      <div className="card update-control-card">
        <h3>Quarterly Update</h3>

        <div className="update-controls">
          <div className="control-row">
            <label>
              <span>Quarter:</span>
              <select
                value={selectedQuarter || ''}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                disabled={isRunning}
              >
                {status?.availableQuarter && (
                  <option value={status.availableQuarter}>
                    {status.availableQuarter} (Current)
                  </option>
                )}
                {/* Add previous quarters */}
                {(() => {
                  const quarters = [];
                  const year = new Date().getFullYear();
                  for (let y = year; y >= year - 2; y--) {
                    for (let q = 4; q >= 1; q--) {
                      const qStr = `${y}q${q}`;
                      if (qStr !== status?.availableQuarter) {
                        quarters.push(<option key={qStr} value={qStr}>{qStr}</option>);
                      }
                    }
                  }
                  return quarters;
                })()}
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={forceUpdate}
                onChange={(e) => setForceUpdate(e.target.checked)}
                disabled={isRunning}
              />
              <span>Force re-import</span>
            </label>
          </div>

          <div className="control-row buttons">
            <button
              onClick={checkAvailability}
              disabled={isRunning || checkingAvailable}
              className="btn-secondary"
            >
              {checkingAvailable ? 'Checking...' : 'Check Availability'}
            </button>

            <button
              onClick={runUpdate}
              disabled={isRunning}
              className="btn-primary"
            >
              {isRunning ? 'Update Running...' : 'Run Update'}
            </button>
          </div>
        </div>

        {/* Availability Result */}
        {availabilityResult && (
          <div className={`availability-result ${availabilityResult.isAvailable ? 'available' : 'not-available'}`}>
            {availabilityResult.isAvailable ? (
              <>
                <span className="icon">&#10003;</span>
                <span>
                  {availabilityResult.quarter} is available
                  {availabilityResult.alreadyImported && ' (already imported)'}
                </span>
              </>
            ) : (
              <>
                <span className="icon">&#10005;</span>
                <span>{availabilityResult.quarter} is not yet available</span>
              </>
            )}
          </div>
        )}

        {/* Progress */}
        {isRunning && (
          <div className="update-progress">
            <ProgressBar progress={progress} />
          </div>
        )}

        {/* Current Status */}
        {!isRunning && status?.currentStatus?.status !== 'idle' && (
          <div className="last-update-info">
            <span>Last update: </span>
            <StatusBadge status={status.currentStatus?.status} />
            {status.currentStatus?.completed_at && (
              <span> on {formatDate(status.currentStatus.completed_at)}</span>
            )}
          </div>
        )}
      </div>

      {/* Data Freshness */}
      <FreshnessCard freshness={status?.dataFreshness} />

      {/* Companies Needing Update */}
      {status?.dataFreshness?.needingUpdate > 0 && (
        <CompaniesNeedingUpdate
          companies={companiesNeedingUpdate}
          total={companiesTotal}
          onLoadMore={loadMoreCompanies}
          loading={loadingCompanies}
        />
      )}

      {/* Freshness Initialization */}
      {status?.dataFreshness && !status.dataFreshness.freshnessInitialized && (
        <div className="card">
          <h3>Initialize Freshness Tracking</h3>
          <p>
            Freshness tracking helps identify which companies have new SEC filings.
            Run this once after your initial bulk import.
          </p>
          <button
            onClick={initializeFreshness}
            disabled={isRunning}
            className="btn-secondary"
          >
            Initialize Freshness
          </button>
        </div>
      )}

      {/* Update History */}
      <UpdateHistory history={history} />
    </div>
  );
}

export default UpdatesPage;
