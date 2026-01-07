// frontend/src/pages/UpdatesPage.js
import { useState, useEffect, useCallback } from 'react';
import { updatesAPI, insidersAPI, capitalAPI, sentimentAPI, priceUpdatesAPI, indicesAPI, secRefreshAPI, knowledgeAPI } from '../services/api';
import { PageHeader, Callout } from '../components/ui';
import { UpdateSystemPanel } from '../components/updates';
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
function UpdatesPage({ embedded = false }) {
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

  // Insider update state
  const [insiderStatus, setInsiderStatus] = useState(null);
  const [insiderUpdating, setInsiderUpdating] = useState(false);
  const [insiderDays, setInsiderDays] = useState(30);

  // Capital allocation update state
  const [capitalStatus, setCapitalStatus] = useState(null);
  const [capitalUpdating, setCapitalUpdating] = useState(false);
  const [capitalResult, setCapitalResult] = useState(null);

  // Reddit sentiment update state
  const [sentimentStatus, setSentimentStatus] = useState(null);
  const [sentimentScanning, setSentimentScanning] = useState(false);

  // Price updates state
  const [priceUpdateStats, setPriceUpdateStats] = useState(null);
  const [priceUpdateSchedule, setPriceUpdateSchedule] = useState(null);
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [priceUpdateMessage, setPriceUpdateMessage] = useState(null);

  // Index updates state
  const [indexStatus, setIndexStatus] = useState(null);
  const [indexUpdating, setIndexUpdating] = useState(false);
  const [indexUpdateMessage, setIndexUpdateMessage] = useState(null);

  // SEC Direct Refresh state
  const [secRefreshStatus, setSecRefreshStatus] = useState(null);
  const [secRefreshing, setSecRefreshing] = useState(false);
  const [secRefreshMessage, setSecRefreshMessage] = useState(null);
  const [secRefreshMode, setSecRefreshMode] = useState('watchlist');

  // Knowledge Base state
  const [knowledgeStatus, setKnowledgeStatus] = useState(null);
  const [knowledgeRefreshing, setKnowledgeRefreshing] = useState(false);
  const [knowledgeRefreshMessage, setKnowledgeRefreshMessage] = useState(null);
  const [knowledgeRefreshMode, setKnowledgeRefreshMode] = useState('incremental');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Load insider status
  const loadInsiderStatus = useCallback(async () => {
    try {
      const res = await insidersAPI.getUpdateStatus();
      setInsiderStatus(res.data);
    } catch (err) {
      console.error('Error loading insider status:', err);
    }
  }, []);

  // Load capital allocation status
  const loadCapitalStatus = useCallback(async () => {
    try {
      const res = await capitalAPI.getUpdateStatus();
      setCapitalStatus(res.data);
    } catch (err) {
      console.error('Error loading capital status:', err);
    }
  }, []);

  // Load Reddit sentiment status
  const loadSentimentStatus = useCallback(async () => {
    try {
      const res = await sentimentAPI.getStatus();
      setSentimentStatus(res.data);
    } catch (err) {
      console.error('Error loading sentiment status:', err);
    }
  }, []);

  // Load price update status
  const loadPriceUpdateStatus = useCallback(async () => {
    try {
      const [statsRes, scheduleRes] = await Promise.all([
        priceUpdatesAPI.getStats(),
        priceUpdatesAPI.getSchedule()
      ]);
      setPriceUpdateStats(statsRes.data?.data);
      setPriceUpdateSchedule(scheduleRes.data?.data);
    } catch (err) {
      console.error('Error loading price update status:', err);
    }
  }, []);

  // Load index status
  const loadIndexStatus = useCallback(async () => {
    try {
      const res = await indicesAPI.getAll();
      if (res.data?.data) {
        setIndexStatus({
          indices: res.data.data,
          count: res.data.data.length,
          lastUpdate: res.data.data[0]?.last_price_date
        });
      }
    } catch (err) {
      console.error('Error loading index status:', err);
    }
  }, []);

  // Load SEC refresh status
  const loadSecRefreshStatus = useCallback(async () => {
    try {
      const res = await secRefreshAPI.getStatus();
      setSecRefreshStatus(res.data?.data);
    } catch (err) {
      console.error('Error loading SEC refresh status:', err);
    }
  }, []);

  // Load Knowledge Base status
  const loadKnowledgeStatus = useCallback(async () => {
    try {
      const res = await knowledgeAPI.getUpdateStatus();
      setKnowledgeStatus(res.data?.data);
    } catch (err) {
      console.error('Error loading knowledge base status:', err);
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

  // Trigger SEC direct refresh
  const runSecRefresh = async () => {
    try {
      setSecRefreshing(true);
      setSecRefreshMessage(null);
      setError(null);
      const res = await secRefreshAPI.run(secRefreshMode);
      setSecRefreshMessage(res.data?.message || 'SEC refresh started');
      setTimeout(async () => {
        await loadSecRefreshStatus();
        setSecRefreshing(false);
      }, 5000);
    } catch (err) {
      setError(err.message);
      setSecRefreshing(false);
    }
  };

  // Trigger Knowledge Base refresh
  const runKnowledgeRefresh = async () => {
    try {
      setKnowledgeRefreshing(true);
      setKnowledgeRefreshMessage(null);
      setError(null);
      const res = await knowledgeAPI.refresh(knowledgeRefreshMode);
      setKnowledgeRefreshMessage(res.data?.message || `Knowledge base ${knowledgeRefreshMode} refresh started`);
      // Poll for completion
      setTimeout(async () => {
        await loadKnowledgeStatus();
        setKnowledgeRefreshing(false);
      }, 10000);
    } catch (err) {
      setError(err.message);
      setKnowledgeRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadHistory(), loadInsiderStatus(), loadCapitalStatus(), loadSentimentStatus(), loadPriceUpdateStatus(), loadIndexStatus(), loadSecRefreshStatus(), loadKnowledgeStatus()]);
      // Load companies after status to get the count
      await loadCompaniesNeedingUpdate(true);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, loadHistory, loadInsiderStatus, loadCapitalStatus, loadSentimentStatus, loadPriceUpdateStatus, loadIndexStatus, loadSecRefreshStatus, loadKnowledgeStatus]);

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

  // Trigger insider update
  const runInsiderUpdate = async () => {
    try {
      setInsiderUpdating(true);
      setError(null);
      await insidersAPI.triggerUpdate(insiderDays, 50);
      // Refresh status after a delay (update runs in background)
      setTimeout(async () => {
        try {
          await loadInsiderStatus();
        } catch (e) {
          console.error('Error refreshing insider status:', e);
        } finally {
          setInsiderUpdating(false);
        }
      }, 3000);
    } catch (err) {
      setError(err.message);
      setInsiderUpdating(false);
    }
  };

  // Trigger capital allocation update
  const runCapitalUpdate = async () => {
    try {
      setCapitalUpdating(true);
      setCapitalResult(null);
      setError(null);
      const res = await capitalAPI.triggerUpdate();
      setCapitalResult(res.data);
      await loadCapitalStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setCapitalUpdating(false);
    }
  };

  // Trigger Reddit sentiment scan
  const runSentimentScan = async () => {
    try {
      setSentimentScanning(true);
      setError(null);
      // Use the trending endpoint with refresh=true to scan Reddit
      await sentimentAPI.getTrending('24h', 50, true);
      // Reload status after scan
      await loadSentimentStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSentimentScanning(false);
    }
  };

  // Trigger price update
  const runPriceUpdate = async () => {
    try {
      setPriceUpdating(true);
      setPriceUpdateMessage(null);
      setError(null);
      const res = await priceUpdatesAPI.run();
      setPriceUpdateMessage(res.data?.message || 'Price update started');
      // Reload status after a delay (update runs in background)
      setTimeout(async () => {
        await loadPriceUpdateStatus();
        setPriceUpdating(false);
      }, 5000);
    } catch (err) {
      setError(err.message);
      setPriceUpdating(false);
    }
  };

  // Trigger price backfill
  const runPriceBackfill = async () => {
    try {
      setPriceUpdating(true);
      setPriceUpdateMessage(null);
      setError(null);
      const res = await priceUpdatesAPI.backfill();
      setPriceUpdateMessage(res.data?.message || 'Backfill started');
      setTimeout(async () => {
        await loadPriceUpdateStatus();
        setPriceUpdating(false);
      }, 5000);
    } catch (err) {
      setError(err.message);
      setPriceUpdating(false);
    }
  };

  // Trigger index update
  const runIndexUpdate = async () => {
    try {
      setIndexUpdating(true);
      setIndexUpdateMessage(null);
      setError(null);
      const res = await indicesAPI.update();
      setIndexUpdateMessage(res.data?.message || 'Index update completed');
      await loadIndexStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setIndexUpdating(false);
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
    <div className={`updates-page ${embedded ? 'updates-page--embedded' : ''}`}>
      {!embedded && (
        <PageHeader
          title="Data Updates"
          subtitle="Manage quarterly SEC data imports"
        />
      )}

      {error && (
        <Callout type="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}

      {/* Centralized Update System Panel */}
      <UpdateSystemPanel />

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

      {/* Insider Trading Update */}
      <div className="card insider-update-card">
        <h3>Insider Trading Data</h3>
        <p className="card-description">
          Import Form 4 insider trading filings from SEC EDGAR for tracked companies.
        </p>

        {insiderStatus && (
          <>
            {insiderStatus.lastImport && (
              <div className="last-update-info">
                Last updated: {formatDate(insiderStatus.lastImport)}
              </div>
            )}
            <div className="insider-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(insiderStatus.companiesWithData)}</span>
                <span className="stat-label">Companies</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(insiderStatus.totalInsiders)}</span>
                <span className="stat-label">Insiders</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(insiderStatus.totalTransactions)}</span>
                <span className="stat-label">Transactions</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{insiderStatus.latestTransaction || '-'}</span>
                <span className="stat-label">Latest Filing</span>
              </div>
            </div>
          </>
        )}

        {insiderStatus?.signalDistribution && (
          <div className="signal-distribution">
            <span className="signal bullish">Bullish: {insiderStatus.signalDistribution.bullish || 0}</span>
            <span className="signal neutral">Neutral: {insiderStatus.signalDistribution.neutral || 0}</span>
            <span className="signal bearish">Bearish: {insiderStatus.signalDistribution.bearish || 0}</span>
          </div>
        )}

        <div className="update-controls">
          <div className="control-row">
            <label>
              <span>Days to fetch:</span>
              <select
                value={insiderDays}
                onChange={(e) => setInsiderDays(parseInt(e.target.value))}
                disabled={insiderUpdating}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>
          <div className="control-row buttons">
            <button
              onClick={loadInsiderStatus}
              disabled={insiderUpdating}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runInsiderUpdate}
              disabled={insiderUpdating}
              className="btn-primary"
            >
              {insiderUpdating ? 'Updating...' : 'Update Insider Data'}
            </button>
          </div>
        </div>

        {insiderUpdating && (
          <div className="update-message">
            Fetching Form 4 filings from SEC EDGAR... This may take a few minutes.
          </div>
        )}
      </div>

      {/* Capital Allocation Update */}
      <div className="card capital-update-card">
        <h3>Capital Allocation Data</h3>
        <p className="card-description">
          Recalculate dividends, buybacks, and shareholder returns from SEC financial statements.
        </p>

        {capitalStatus && (
          <>
            {capitalStatus.lastUpdate && (
              <div className="last-update-info">
                Last updated: {formatDate(capitalStatus.lastUpdate)}
              </div>
            )}
            <div className="capital-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(capitalStatus.companiesTracked)}</span>
                <span className="stat-label">Companies</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(capitalStatus.totalRecords)}</span>
                <span className="stat-label">Records</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{capitalStatus.latestFiscalQuarter || '-'}</span>
                <span className="stat-label">Latest Period</span>
              </div>
            </div>

            {capitalStatus.dataByYear && capitalStatus.dataByYear.length > 0 && (
              <div className="year-breakdown">
                <span className="breakdown-label">Data by Year: </span>
                {capitalStatus.dataByYear.slice(0, 5).map((y, i) => (
                  <span key={y.year} className="year-item">
                    {y.year}: {formatNumber(y.companies)} cos
                    {i < Math.min(capitalStatus.dataByYear.length, 5) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="update-controls">
          <div className="control-row buttons">
            <button
              onClick={loadCapitalStatus}
              disabled={capitalUpdating}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runCapitalUpdate}
              disabled={capitalUpdating}
              className="btn-primary"
            >
              {capitalUpdating ? 'Updating...' : 'Recalculate Capital Data'}
            </button>
          </div>
        </div>

        {capitalUpdating && (
          <div className="update-message">
            Processing all companies... This may take several minutes.
          </div>
        )}

        {capitalResult && (
          <div className="update-result success">
            <strong>Update Complete:</strong> {capitalResult.message}
          </div>
        )}
      </div>

      {/* Reddit Sentiment Update */}
      <div className="card sentiment-update-card">
        <h3>Reddit Sentiment Data</h3>
        <p className="card-description">
          Scan Reddit (r/wallstreetbets, r/stocks, r/investing) for stock mentions and sentiment analysis.
        </p>

        {sentimentStatus && (
          <>
            {sentimentStatus.lastScan && (
              <div className="last-update-info">
                Last scanned: {formatDate(sentimentStatus.lastScan)}
              </div>
            )}
            <div className="sentiment-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(sentimentStatus.tickersTracked)}</span>
                <span className="stat-label">Trending Tickers</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(sentimentStatus.totalMentions)}</span>
                <span className="stat-label">Total Mentions</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(sentimentStatus.totalPosts)}</span>
                <span className="stat-label">Posts Analyzed</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(sentimentStatus.companiesWithPosts)}</span>
                <span className="stat-label">Companies</span>
              </div>
            </div>
          </>
        )}

        {sentimentStatus?.sentimentDistribution && (
          <div className="signal-distribution">
            <span className="signal bullish">Bullish: {sentimentStatus.sentimentDistribution.bullish || 0}</span>
            <span className="signal neutral">Neutral: {sentimentStatus.sentimentDistribution.neutral || 0}</span>
            <span className="signal bearish">Bearish: {sentimentStatus.sentimentDistribution.bearish || 0}</span>
          </div>
        )}

        {sentimentStatus?.subreddits && sentimentStatus.subreddits.length > 0 && (
          <div className="subreddit-breakdown">
            <span className="breakdown-label">Posts by Subreddit: </span>
            {sentimentStatus.subreddits.slice(0, 5).map((sub, i) => (
              <span key={sub.subreddit} className="subreddit-item">
                r/{sub.subreddit}: {formatNumber(sub.post_count)}
                {i < Math.min(sentimentStatus.subreddits.length, 5) - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        <div className="update-controls">
          <div className="control-row buttons">
            <button
              onClick={loadSentimentStatus}
              disabled={sentimentScanning}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runSentimentScan}
              disabled={sentimentScanning}
              className="btn-primary"
            >
              {sentimentScanning ? 'Scanning...' : 'Scan Reddit Now'}
            </button>
          </div>
        </div>

        {sentimentScanning && (
          <div className="update-message">
            Scanning Reddit for stock mentions... This may take 1-2 minutes.
          </div>
        )}
      </div>

      {/* Stock Price Updates */}
      <div className="card price-update-card">
        <h3>Stock Price Data</h3>
        <p className="card-description">
          Daily stock price updates from Yahoo Finance using a tiered rotation system.
        </p>

        {priceUpdateStats && (
          <>
            <div className="price-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(priceUpdateStats.overall?.total)}</span>
                <span className="stat-label">Total Companies</span>
              </div>
              <div className="stat-item">
                <span className="stat-value highlight-green">{formatNumber(priceUpdateStats.overall?.fresh_1d)}</span>
                <span className="stat-label">Fresh (1 Day)</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(priceUpdateStats.overall?.fresh_7d)}</span>
                <span className="stat-label">Fresh (7 Days)</span>
              </div>
              <div className="stat-item">
                <span className="stat-value highlight-warning">{formatNumber(priceUpdateStats.overall?.never_updated)}</span>
                <span className="stat-label">Never Updated</span>
              </div>
            </div>

            {priceUpdateStats.byTier && priceUpdateStats.byTier.length > 0 && (
              <div className="tier-breakdown">
                <span className="breakdown-label">Update Tiers: </span>
                {priceUpdateStats.byTier.map((tier, i) => (
                  <span key={tier.update_tier} className="tier-item">
                    {tier.tier_name}: {formatNumber(tier.total)}
                    {tier.avg_age_days != null && ` (avg ${tier.avg_age_days}d)`}
                    {i < priceUpdateStats.byTier.length - 1 ? ' | ' : ''}
                  </span>
                ))}
              </div>
            )}

            {priceUpdateStats.recentRuns && priceUpdateStats.recentRuns.length > 0 && (
              <div className="last-update-info">
                Last run: {formatDate(priceUpdateStats.recentRuns[0].created_at)}
                {priceUpdateStats.recentRuns[0].companies_updated > 0 && (
                  <> - Updated {formatNumber(priceUpdateStats.recentRuns[0].companies_updated)} companies</>
                )}
              </div>
            )}
          </>
        )}

        {priceUpdateSchedule && (
          <div className="schedule-info">
            <span className="schedule-label">Today's Schedule ({priceUpdateSchedule.date}): </span>
            <span className="schedule-total">{formatNumber(priceUpdateSchedule.total)} companies</span>
            {priceUpdateSchedule.message && (
              <span className="schedule-message"> - {priceUpdateSchedule.message}</span>
            )}
          </div>
        )}

        <div className="update-controls">
          <div className="control-row buttons">
            <button
              onClick={loadPriceUpdateStatus}
              disabled={priceUpdating}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runPriceBackfill}
              disabled={priceUpdating}
              className="btn-secondary"
            >
              {priceUpdating ? 'Running...' : 'Run Backfill'}
            </button>
            <button
              onClick={runPriceUpdate}
              disabled={priceUpdating}
              className="btn-primary"
            >
              {priceUpdating ? 'Running...' : 'Run Daily Update'}
            </button>
          </div>
        </div>

        {priceUpdating && (
          <div className="update-message">
            Running price update in the background... This may take several minutes.
          </div>
        )}

        {priceUpdateMessage && !priceUpdating && (
          <div className="update-result success">
            {priceUpdateMessage}
          </div>
        )}
      </div>

      {/* Market Indices Update */}
      <div className="card index-update-card">
        <h3>Market Indices Data</h3>
        <p className="card-description">
          Update historical prices and metrics for market indices (S&P 500, Dow Jones, NASDAQ, Russell 2000).
        </p>

        {indexStatus && (
          <>
            {indexStatus.lastUpdate && (
              <div className="last-update-info">
                Last updated: {formatDate(indexStatus.lastUpdate)}
              </div>
            )}
            <div className="index-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(indexStatus.count)}</span>
                <span className="stat-label">Indices Tracked</span>
              </div>
              {indexStatus.indices?.slice(0, 4).map(idx => (
                <div key={idx.symbol} className="stat-item">
                  <span className="stat-value">
                    <span className={idx.change_1d_pct >= 0 ? 'positive' : 'negative'}>
                      {idx.change_1d_pct >= 0 ? '+' : ''}{idx.change_1d_pct?.toFixed(2)}%
                    </span>
                  </span>
                  <span className="stat-label">{idx.short_name}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="update-controls">
          <div className="control-row buttons">
            <button
              onClick={loadIndexStatus}
              disabled={indexUpdating}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runIndexUpdate}
              disabled={indexUpdating}
              className="btn-primary"
            >
              {indexUpdating ? 'Updating...' : 'Update Index Prices'}
            </button>
          </div>
        </div>

        {indexUpdating && (
          <div className="update-message">
            Fetching latest index prices from Yahoo Finance... This may take a minute.
          </div>
        )}

        {indexUpdateMessage && !indexUpdating && (
          <div className="update-result success">
            {indexUpdateMessage}
          </div>
        )}
      </div>

      {/* SEC Direct Refresh */}
      <div className="card sec-refresh-card">
        <h3>SEC Direct Filing Refresh</h3>
        <p className="card-description">
          Fetch latest 10-K and 10-Q filings directly from SEC EDGAR API for individual companies.
        </p>

        {secRefreshStatus && (
          <>
            <div className="sec-refresh-stats-grid">
              <div className="stat-item">
                <span className="stat-value">{formatNumber(secRefreshStatus.watchlistCount)}</span>
                <span className="stat-label">Watchlist Companies</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{formatNumber(secRefreshStatus.recentUpdates?.length || 0)}</span>
                <span className="stat-label">Updated (30d)</span>
              </div>
              <div className="stat-item">
                <span className="stat-value highlight-warning">{formatNumber(secRefreshStatus.staleCompanies?.length || 0)}</span>
                <span className="stat-label">Stale Data (120d+)</span>
              </div>
            </div>

            {secRefreshStatus.recentUpdates && secRefreshStatus.recentUpdates.length > 0 && (
              <div className="recent-updates-list">
                <span className="breakdown-label">Recent Updates: </span>
                {secRefreshStatus.recentUpdates.slice(0, 5).map((update, i) => (
                  <span key={update.symbol} className="update-item">
                    {update.symbol} ({update.latest_filing})
                    {i < Math.min(secRefreshStatus.recentUpdates.length, 5) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="update-controls">
          <div className="control-row">
            <label>
              <span>Mode:</span>
              <select
                value={secRefreshMode}
                onChange={(e) => setSecRefreshMode(e.target.value)}
                disabled={secRefreshing}
              >
                <option value="watchlist">Watchlist Only</option>
                <option value="all">All Companies (Top 50)</option>
              </select>
            </label>
          </div>
          <div className="control-row buttons">
            <button
              onClick={loadSecRefreshStatus}
              disabled={secRefreshing}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runSecRefresh}
              disabled={secRefreshing}
              className="btn-primary"
            >
              {secRefreshing ? 'Refreshing...' : 'Run SEC Refresh'}
            </button>
          </div>
        </div>

        {secRefreshing && (
          <div className="update-message">
            Fetching latest filings from SEC EDGAR... This may take several minutes.
          </div>
        )}

        {secRefreshMessage && !secRefreshing && (
          <div className="update-result success">
            {secRefreshMessage}
          </div>
        )}
      </div>

      {/* AI Knowledge Base */}
      <div className="card knowledge-update-card">
        <h3>AI Knowledge Base</h3>
        <p className="card-description">
          Investment wisdom from Buffett, Marks, Damodaran, Taleb, a16z, ARK Invest, and more.
          Powers AI analyst personas and contextual insights.
        </p>

        {knowledgeStatus && (
          <>
            {knowledgeStatus.database && (
              <div className="last-update-info">
                Vector DB: {knowledgeStatus.database.sizeMB} MB,
                modified {formatDate(knowledgeStatus.database.modified)}
              </div>
            )}
            <div className="knowledge-stats-grid">
              <div className="stat-item">
                <span className="stat-value">
                  {knowledgeStatus.vectorStore?.total_documents
                    ? formatNumber(knowledgeStatus.vectorStore.total_documents)
                    : '-'}
                </span>
                <span className="stat-label">Vector Embeddings</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {knowledgeStatus.sources ? Object.keys(knowledgeStatus.sources).length : '-'}
                </span>
                <span className="stat-label">Sources</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {knowledgeStatus.vectorStore?.topics
                    ? Object.keys(knowledgeStatus.vectorStore.topics).length
                    : '-'}
                </span>
                <span className="stat-label">Topics</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {knowledgeStatus.sources
                    ? Object.values(knowledgeStatus.sources).reduce((a, b) => a + b, 0)
                    : '-'}
                </span>
                <span className="stat-label">Raw Documents</span>
              </div>
            </div>

            {knowledgeStatus.sources && Object.keys(knowledgeStatus.sources).length > 0 && (
              <div className="sources-breakdown">
                <span className="breakdown-label">Sources: </span>
                {Object.entries(knowledgeStatus.sources)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([source, count], i) => (
                    <span key={source} className="source-item">
                      {source.split('/').pop()}: {count}
                      {i < Math.min(Object.keys(knowledgeStatus.sources).length, 6) - 1 ? ', ' : ''}
                    </span>
                  ))}
              </div>
            )}

            {knowledgeStatus.history && knowledgeStatus.history.length > 0 && (
              <div className="refresh-history">
                <span className="breakdown-label">Recent Refreshes: </span>
                {knowledgeStatus.history.slice(0, 3).map((run, i) => (
                  <span key={i} className="history-item">
                    {run.success ? '✓' : '✗'} {run.incremental ? 'incr' : 'full'} ({run.duration})
                    {i < Math.min(knowledgeStatus.history.length, 3) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="update-controls">
          <div className="control-row">
            <label>
              <span>Mode:</span>
              <select
                value={knowledgeRefreshMode}
                onChange={(e) => setKnowledgeRefreshMode(e.target.value)}
                disabled={knowledgeRefreshing}
              >
                <option value="incremental">Incremental (Tech sources only)</option>
                <option value="full">Full Refresh (All sources)</option>
                <option value="rebuild">Rebuild Embeddings Only</option>
              </select>
            </label>
          </div>
          <div className="control-row buttons">
            <button
              onClick={loadKnowledgeStatus}
              disabled={knowledgeRefreshing}
              className="btn-secondary"
            >
              Refresh Status
            </button>
            <button
              onClick={runKnowledgeRefresh}
              disabled={knowledgeRefreshing}
              className="btn-primary"
            >
              {knowledgeRefreshing ? 'Refreshing...' : 'Run Knowledge Refresh'}
            </button>
          </div>
        </div>

        {knowledgeRefreshing && (
          <div className="update-message">
            Refreshing knowledge base... This may take several minutes for a full refresh.
          </div>
        )}

        {knowledgeRefreshMessage && !knowledgeRefreshing && (
          <div className="update-result success">
            {knowledgeRefreshMessage}
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
