// frontend/src/components/research/QuantWorkbench/BackfillPanel.js
// Backfill historical factor values for ML training

import { useState, useEffect } from 'react';
import { Database, Play, CheckCircle, AlertTriangle, RefreshCw, Info } from '../../icons';
import { factorsAPI } from '../../../services/api';

export default function BackfillPanel({ factor }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Configuration state
  const [startDate, setStartDate] = useState('2022-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [frequency, setFrequency] = useState('monthly');

  // Fetch backfill status for this factor
  useEffect(() => {
    if (!factor?.id) return;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/factors/${factor.id}/backfill-status`);

        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        } else {
          // No backfill data yet
          setStatus(null);
        }
      } catch (err) {
        console.warn('Could not fetch backfill status:', err.message);
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [factor?.id]);

  const handleBackfill = async () => {
    if (!factor?.id || !factor?.formula) {
      setError('Factor ID and formula are required');
      return;
    }

    try {
      setBackfilling(true);
      setError(null);
      setResult(null);

      const response = await factorsAPI.backfill({
        factorId: factor.id,
        formula: factor.formula,
        startDate,
        endDate,
        frequency
      });

      if (response.data?.success) {
        setResult(response.data.data);
      } else {
        throw new Error(response.data?.error || 'Backfill failed');
      }
    } catch (err) {
      console.error('Backfill error:', err);
      // API interceptor formats errors as { message, code, status }
      setError(err.message || 'Backfill operation failed');
    } finally {
      setBackfilling(false);
    }
  };

  if (!factor) {
    return (
      <div className="backfill-panel empty">
        <Database size={24} />
        <p>Select a factor to backfill historical data</p>
      </div>
    );
  }

  return (
    <div className="backfill-panel">
      <div className="panel-header">
        <div className="header-left">
          <Database size={20} />
          <h4>Backfill Historical Data</h4>
        </div>
      </div>

      <div className="info-box">
        <Info size={14} />
        <p>
          Backfilling calculates this factor's values for historical dates and stores them
          for ML training. This enables using the factor as a feature in machine learning models.
        </p>
      </div>

      {/* Current Status */}
      {loading ? (
        <div className="status-loading">
          <RefreshCw size={16} className="spinning" />
          <span>Loading backfill status...</span>
        </div>
      ) : status ? (
        <div className="status-card existing">
          <div className="status-header">
            <CheckCircle size={18} />
            <span>Existing Backfill Data</span>
          </div>
          <div className="status-details">
            <div className="status-item">
              <span className="label">Date Range:</span>
              <span className="value">{status.min_date} to {status.max_date}</span>
            </div>
            <div className="status-item">
              <span className="label">Total Values:</span>
              <span className="value">{status.total_values?.toLocaleString()}</span>
            </div>
            <div className="status-item">
              <span className="label">Companies Covered:</span>
              <span className="value">{status.coverage_companies}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="status-card empty">
          <AlertTriangle size={18} />
          <span>No historical data available for this factor</span>
        </div>
      )}

      {/* Configuration Form */}
      <div className="backfill-config">
        <h5>Backfill Configuration</h5>

        <div className="form-grid">
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={backfilling}
              className="date-input"
            />
          </div>

          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={backfilling}
              className="date-input"
            />
          </div>

          <div className="form-group">
            <label>Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              disabled={backfilling}
              className="frequency-select"
            >
              <option value="monthly">Monthly (12/year)</option>
              <option value="weekly">Weekly (52/year)</option>
              <option value="quarterly">Quarterly (4/year)</option>
              <option value="daily">Daily (252/year)</option>
            </select>
            <span className="hint">
              Monthly recommended for most factors. Daily may be slow.
            </span>
          </div>
        </div>

        <button
          className="backfill-button"
          onClick={handleBackfill}
          disabled={backfilling || !factor?.id}
        >
          {backfilling ? (
            <>
              <RefreshCw size={18} className="spinning" />
              Backfilling... This may take a few minutes
            </>
          ) : (
            <>
              <Play size={18} />
              Start Backfill
            </>
          )}
        </button>
      </div>

      {/* Result Display */}
      {result && (
        <div className={`backfill-result ${result.errorCount > 0 ? 'warning' : 'success'}`}>
          <div className="result-header">
            {result.errorCount > 0 ? (
              <><AlertTriangle size={18} /> Completed with Errors</>
            ) : (
              <><CheckCircle size={18} /> Backfill Completed</>
            )}
          </div>
          <div className="result-details">
            <div className="result-stat">
              <span className="stat-label">Total Dates:</span>
              <span className="stat-value">{result.totalDates}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Successful:</span>
              <span className="stat-value success">{result.successCount}</span>
            </div>
            {result.errorCount > 0 && (
              <div className="result-stat">
                <span className="stat-label">Errors:</span>
                <span className="stat-value error">{result.errorCount}</span>
              </div>
            )}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="error-list">
              <p className="error-list-header">Sample Errors:</p>
              {result.errors.slice(0, 3).map((err, idx) => (
                <div key={idx} className="error-item">
                  <span className="error-date">{err.date}:</span>
                  <span className="error-message">{err.error}</span>
                </div>
              ))}
            </div>
          )}
          <p className="next-step-hint">
            ✓ Factor is now ready for ML training. Go to <strong>ML Ops</strong> to use it.
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="backfill-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
