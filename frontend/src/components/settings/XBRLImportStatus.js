// frontend/src/components/settings/XBRLImportStatus.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import './SettingsComponents.css';

/**
 * XBRLImportStatus Component
 *
 * Dashboard for monitoring and controlling EU/UK XBRL data import.
 * Shows progress by country, recent sync logs, and provides controls
 * for starting/pausing backfill operations.
 */
const XBRLImportStatus = () => {
  const [status, setStatus] = useState(null);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState(['GB', 'DE', 'FR', 'NL', 'SE']);
  const [startYear, setStartYear] = useState(2021);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, countriesRes] = await Promise.all([
        api.get('/api/xbrl/backfill/status'),
        api.get('/api/xbrl/backfill/countries')
      ]);

      if (statusRes.data.success) {
        setStatus(statusRes.data.data);
      }
      if (countriesRes.data.success) {
        setCountries(countriesRes.data.data);
      }
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds when import is running
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Start backfill
  const handleStartBackfill = async () => {
    if (selectedCountries.length === 0) {
      setError('Please select at least one country');
      return;
    }

    setActionInProgress(true);
    try {
      const response = await api.post('/api/xbrl/backfill/start', {
        countries: selectedCountries,
        startYear
      });

      if (response.data.success) {
        await fetchStatus();
      } else {
        setError(response.data.error);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  // Pause backfill
  const handlePauseBackfill = async () => {
    setActionInProgress(true);
    try {
      const response = await api.post('/api/xbrl/backfill/pause');
      if (response.data.success) {
        await fetchStatus();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  // Resume interrupted import
  const handleResumeImport = async (syncLogId) => {
    setActionInProgress(true);
    try {
      const response = await api.post(`/api/xbrl/backfill/resume/${syncLogId}`);
      if (response.data.success) {
        await fetchStatus();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  // Start single country import
  const handleImportCountry = async (countryCode) => {
    setActionInProgress(true);
    try {
      const response = await api.post(`/api/xbrl/backfill/country/${countryCode}`, {
        startYear
      });
      if (response.data.success) {
        await fetchStatus();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  // Toggle country selection
  const toggleCountry = (code) => {
    setSelectedCountries(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  if (loading) {
    return (
      <div className="settings-panel">
        <h3>EU/UK XBRL Import Status</h3>
        <div className="loading-indicator">Loading...</div>
      </div>
    );
  }

  const isRunning = status?.importer?.isRunning;
  const isPaused = status?.importer?.isPaused;

  return (
    <div className="settings-panel xbrl-import-status">
      <h3>EU/UK XBRL Import Status</h3>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Overall Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{status?.stats?.identifiers?.toLocaleString() || 0}</div>
          <div className="stat-label">Companies</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.stats?.filings?.total?.toLocaleString() || 0}</div>
          <div className="stat-label">Total Filings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.stats?.filings?.parsed?.toLocaleString() || 0}</div>
          <div className="stat-label">Parsed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{status?.stats?.metrics?.toLocaleString() || 0}</div>
          <div className="stat-label">Metrics Records</div>
        </div>
      </div>

      {/* Import Controls */}
      <div className="import-controls">
        <h4>Import Controls</h4>

        <div className="control-row">
          <label>Start Year:</label>
          <select
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value))}
            disabled={isRunning}
          >
            <option value={2021}>2021 (ESEF mandate start)</option>
            <option value={2022}>2022</option>
            <option value={2023}>2023</option>
            <option value={2024}>2024</option>
          </select>
        </div>

        <div className="control-row">
          <label>Countries:</label>
          <div className="country-selector">
            {countries.slice(0, 10).map(country => (
              <label key={country.code} className="country-checkbox">
                <input
                  type="checkbox"
                  checked={selectedCountries.includes(country.code)}
                  onChange={() => toggleCountry(country.code)}
                  disabled={isRunning}
                />
                <span>{country.code}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="button-row">
          {!isRunning ? (
            <button
              className="primary-button"
              onClick={handleStartBackfill}
              disabled={actionInProgress || selectedCountries.length === 0}
            >
              {actionInProgress ? 'Starting...' : 'Start Import'}
            </button>
          ) : (
            <button
              className="warning-button"
              onClick={handlePauseBackfill}
              disabled={actionInProgress || isPaused}
            >
              {isPaused ? 'Pausing...' : 'Pause Import'}
            </button>
          )}
          <button
            className="secondary-button"
            onClick={fetchStatus}
            disabled={actionInProgress}
          >
            Refresh Status
          </button>
        </div>

        {isRunning && (
          <div className="running-indicator">
            <span className="pulse-dot"></span>
            Import in progress{isPaused ? ' (pausing...)' : ''}
          </div>
        )}
      </div>

      {/* Country Coverage */}
      <div className="country-coverage">
        <h4>Country Coverage</h4>
        <div className="coverage-table">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Filings</th>
                <th>Parsed</th>
                <th>Parse Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {countries.map(country => {
                const parseRate = country.currentFilings > 0
                  ? ((country.currentParsed / country.currentFilings) * 100).toFixed(1)
                  : 0;
                return (
                  <tr key={country.code}>
                    <td>
                      <strong>{country.code}</strong>
                      <span className="country-name">{country.name}</span>
                    </td>
                    <td>{country.currentFilings.toLocaleString()}</td>
                    <td>{country.currentParsed.toLocaleString()}</td>
                    <td>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${parseRate}%` }}
                        ></div>
                        <span className="progress-text">{parseRate}%</span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="small-button"
                        onClick={() => handleImportCountry(country.code)}
                        disabled={isRunning || actionInProgress}
                      >
                        Import
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Sync Logs */}
      <div className="sync-logs">
        <h4>Recent Import Logs</h4>
        {status?.recentLogs?.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Started</th>
                <th>Status</th>
                <th>Processed</th>
                <th>Added</th>
                <th>Errors</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {status.recentLogs.map(log => (
                <tr key={log.id} className={`status-${log.status}`}>
                  <td>{log.target_country || log.country || '-'}</td>
                  <td>{new Date(log.started_at).toLocaleString()}</td>
                  <td>
                    <span className={`status-badge ${log.status}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{log.filings_processed?.toLocaleString() || 0}</td>
                  <td>{log.filings_added?.toLocaleString() || 0}</td>
                  <td>{log.errors || 0}</td>
                  <td>
                    {log.status === 'running' && (
                      <button
                        className="small-button"
                        onClick={() => handleResumeImport(log.id)}
                        disabled={isRunning || actionInProgress}
                      >
                        Resume
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data">No import logs yet</p>
        )}
      </div>
    </div>
  );
};

export default XBRLImportStatus;
