// frontend/src/components/agents/MLCombinerPanel.js
// ML Signal Combiner Panel - Train and monitor gradient boosting models

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, RefreshCw, AlertTriangle, CheckCircle, Clock,
  BarChart3, TrendingUp, Settings, Play, Zap, Info, Database
} from 'lucide-react';
import { mlCombinerAPI, signalPerformanceAPI } from '../../services/api';
import './MLCombinerPanel.css';

function MLCombinerPanel({ agentId, onMLStatusChange }) {
  const [status, setStatus] = useState(null);
  const [importance, setImportance] = useState(null);
  const [signalHealth, setSignalHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState(null);
  const [lookbackDays, setLookbackDays] = useState(730);
  const [activeTab, setActiveTab] = useState('status');
  const [trainResult, setTrainResult] = useState(null);

  // Fetch ML status - with timeout protection
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), 10000)
      );

      // Race between actual request and timeout
      const res = await Promise.race([
        mlCombinerAPI.getStatus(),
        timeoutPromise
      ]);

      setStatus(res.data?.data);

      // Fetch importance if model is trained (don't block on this)
      if (res.data?.data?.modelsLoaded) {
        mlCombinerAPI.getImportance(21)
          .then(impRes => {
            setImportance(impRes.data?.data);
            if (onMLStatusChange) {
              onMLStatusChange({ trained: true, ...res.data?.data });
            }
          })
          .catch(err => console.warn('Failed to fetch importance:', err.message));
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching ML status:', err);
      // Don't show error for timeout - just show empty state
      if (err.message !== 'Request timed out') {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [onMLStatusChange]);

  // Fetch signal health - non-blocking
  const fetchSignalHealth = useCallback(async () => {
    try {
      const res = await signalPerformanceAPI.getHealth(180);
      setSignalHealth(res.data);
    } catch (err) {
      // Silently fail - signal health is optional
      console.warn('Signal health not available:', err.message);
    }
  }, []);

  useEffect(() => {
    // Fetch status immediately
    fetchStatus();
    // Delay signal health fetch to not block page load
    const timer = setTimeout(fetchSignalHealth, 1000);
    return () => clearTimeout(timer);
  }, [fetchStatus, fetchSignalHealth]);

  // Train the model
  const handleTrain = async () => {
    try {
      setTraining(true);
      setTrainResult(null);
      setError(null);

      const res = await mlCombinerAPI.train(lookbackDays);
      setTrainResult(res.data?.data);

      // Refresh status after training
      await fetchStatus();
    } catch (err) {
      console.error('Error training ML model:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setTraining(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading && !status) {
    return (
      <div className="ml-combiner-panel loading">
        <RefreshCw className="spinning" size={20} />
        <span>Loading ML status...</span>
      </div>
    );
  }

  return (
    <div className="ml-combiner-panel">
      {/* Header */}
      <div className="ml-combiner-header">
        <div className="header-title">
          <Brain size={20} />
          <h4>ML Signal Combiner</h4>
          {status?.modelsLoaded && (
            <span className="ml-badge trained">Trained</span>
          )}
          {!status?.modelsLoaded && (
            <span className="ml-badge untrained">Not Trained</span>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            onClick={fetchStatus}
            disabled={loading || training}
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="ml-info-box">
        <Info size={14} />
        <p>
          The ML Signal Combiner uses gradient boosting to learn optimal signal weights
          from historical data. When enabled, it replaces static weights with learned
          non-linear relationships for improved prediction accuracy.
        </p>
      </div>

      {/* Tabs */}
      <div className="ml-tabs">
        <button
          className={`tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
        <button
          className={`tab ${activeTab === 'train' ? 'active' : ''}`}
          onClick={() => setActiveTab('train')}
        >
          Train Model
        </button>
        <button
          className={`tab ${activeTab === 'importance' ? 'active' : ''}`}
          onClick={() => setActiveTab('importance')}
          disabled={!status?.modelsLoaded}
        >
          Feature Importance
        </button>
        <button
          className={`tab ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Signal Health
        </button>
      </div>

      {/* Tab Content */}
      <div className="ml-tab-content">
        {/* Status Tab */}
        {activeTab === 'status' && (
          <div className="ml-status-section">
            {status?.modelsLoaded ? (
              <>
                <div className="status-grid">
                  <div className="status-card positive">
                    <CheckCircle size={20} />
                    <div className="status-info">
                      <span className="status-label">Model Status</span>
                      <span className="status-value">Trained & Ready</span>
                    </div>
                  </div>
                  <div className="status-card">
                    <BarChart3 size={20} />
                    <div className="status-info">
                      <span className="status-label">Horizons</span>
                      <span className="status-value">
                        {status.horizons?.join(', ') || '21, 63, 126'}d
                      </span>
                    </div>
                  </div>
                  <div className="status-card">
                    <Clock size={20} />
                    <div className="status-info">
                      <span className="status-label">Last Trained</span>
                      <span className="status-value">
                        {status.lastTrainedAt
                          ? new Date(status.lastTrainedAt).toLocaleDateString()
                          : 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <div className="status-card">
                    <TrendingUp size={20} />
                    <div className="status-info">
                      <span className="status-label">Training Samples</span>
                      <span className="status-value">
                        {status.trainingSamples?.toLocaleString() || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {status.performance && (
                  <div className="performance-section">
                    <h5>Model Performance</h5>
                    <div className="performance-grid">
                      {Object.entries(status.performance).map(([horizon, perf]) => (
                        <div key={horizon} className="performance-card">
                          <span className="horizon-label">{horizon}d Horizon</span>
                          <div className="perf-metrics">
                            <div className="perf-metric">
                              <span className="metric-label">R²</span>
                              <span className="metric-value">{perf.r2?.toFixed(3) || '-'}</span>
                            </div>
                            <div className="perf-metric">
                              <span className="metric-label">MAE</span>
                              <span className="metric-value">{formatPercent(perf.mae)}</span>
                            </div>
                            <div className="perf-metric">
                              <span className="metric-label">IC</span>
                              <span className="metric-value">{perf.ic?.toFixed(3) || '-'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-model-state">
                <AlertTriangle size={40} />
                <h5>No Model Trained</h5>
                <p>
                  Train the ML model to enable intelligent signal combination.
                  The model will learn optimal weights from historical factor-to-return data.
                </p>

                {/* Factor Data Status */}
                {status?.factorDataAvailable && (
                  <div className="data-readiness">
                    <Database size={16} />
                    <div className="readiness-info">
                      <span className="readiness-label">Training Data Ready</span>
                      <span className="readiness-value">
                        {status.factorRecords?.toLocaleString() || '0'} factor records
                        ({status.factorCompanies?.toLocaleString() || '0'} companies)
                      </span>
                      {status.factorDateRange && (
                        <span className="readiness-date">
                          {status.factorDateRange.min} to {status.factorDateRange.max}
                        </span>
                      )}
                    </div>
                    <CheckCircle size={16} className="readiness-check" />
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  onClick={() => setActiveTab('train')}
                >
                  <Play size={16} />
                  Go to Training
                </button>
              </div>
            )}
          </div>
        )}

        {/* Train Tab */}
        {activeTab === 'train' && (
          <div className="ml-train-section">
            <div className="train-config">
              <h5>Training Configuration</h5>

              {/* Factor Data Status */}
              {status?.factorData && (
                <div className={`data-status-card ${status.factorData.readyForTraining ? 'ready' : 'not-ready'}`}>
                  <div className="data-status-header">
                    <Database size={18} />
                    <span>Training Data Status</span>
                    {status.factorData.readyForTraining ? (
                      <CheckCircle size={16} className="status-icon ready" />
                    ) : (
                      <AlertTriangle size={16} className="status-icon not-ready" />
                    )}
                  </div>
                  <div className="data-status-details">
                    <div className="data-stat">
                      <span className="stat-label">Factor Records</span>
                      <span className="stat-value">{status.factorData.recordsAvailable?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="data-stat">
                      <span className="stat-label">Companies</span>
                      <span className="stat-value">{status.factorData.companiesAvailable?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="data-stat">
                      <span className="stat-label">Trainable Samples</span>
                      <span className="stat-value">{status.factorData.trainableRecords?.toLocaleString() || '0'}</span>
                    </div>
                    {status.factorData.dateRange && (
                      <div className="data-stat wide">
                        <span className="stat-label">Date Range</span>
                        <span className="stat-value">
                          {status.factorData.dateRange.min} to {status.factorData.dateRange.max}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Training Lookback Period</label>
                <select
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(parseInt(e.target.value))}
                  className="form-select"
                  disabled={training}
                >
                  <option value={365}>1 Year (365 days)</option>
                  <option value={730}>2 Years (730 days)</option>
                  <option value={1095}>3 Years (1095 days)</option>
                  <option value={1460}>4 Years (1460 days)</option>
                </select>
                <span className="form-hint">
                  Longer periods provide more data but may include outdated patterns.
                </span>
              </div>

              <div className="train-info">
                <h6>What happens during training:</h6>
                <ul>
                  <li>Historical factor scores are joined with price data</li>
                  <li>Forward returns (21d, 63d, 126d) are calculated from daily prices</li>
                  <li>Gradient boosting models learn factor→return relationships</li>
                  <li>Feature importance is computed for each factor type</li>
                  <li>Models are validated with 80/20 train/validation split</li>
                </ul>
              </div>

              <button
                className="btn btn-primary btn-lg train-button"
                onClick={handleTrain}
                disabled={training}
              >
                {training ? (
                  <>
                    <RefreshCw size={18} className="spinning" />
                    Training... (this may take a few minutes)
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Train ML Model
                  </>
                )}
              </button>
            </div>

            {/* Training Result */}
            {trainResult && (
              <div className={`train-result ${trainResult.success ? 'success' : 'error'}`}>
                <h5>
                  {trainResult.success ? (
                    <><CheckCircle size={18} /> Training Completed</>
                  ) : (
                    <><AlertTriangle size={18} /> Training Failed</>
                  )}
                </h5>
                {trainResult.success && (
                  <div className="result-details">
                    <p>Training samples: {trainResult.trainingSetSize?.toLocaleString()}</p>
                    <p>Validation samples: {trainResult.validationSetSize?.toLocaleString()}</p>
                    {trainResult.metrics && Object.entries(trainResult.metrics).map(([h, m]) => (
                      <div key={h} className="horizon-result">
                        <span className="horizon">{h}d:</span>
                        <span>R²={m.r2?.toFixed(3)}</span>
                        <span>MAE={formatPercent(m.mae)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {trainResult.error && (
                  <p className="error-message">{trainResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Importance Tab */}
        {activeTab === 'importance' && (
          <div className="ml-importance-section">
            {importance && importance.length > 0 ? (
              <>
                <h5>Feature Importance (21d Horizon)</h5>
                <p className="importance-desc">
                  Higher importance means the signal has more predictive power for forward returns.
                </p>
                <div className="importance-list">
                  {importance.map((item, idx) => (
                    <div key={item.feature} className="importance-item">
                      <div className="importance-rank">{idx + 1}</div>
                      <div className="importance-info">
                        <span className="feature-name">{item.feature}</span>
                        <div className="importance-bar-container">
                          <div
                            className="importance-bar"
                            style={{ width: `${item.importance * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="importance-value">{item.percentContribution}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <BarChart3 size={24} />
                <p>No feature importance data available</p>
                <p>Train the model first to see feature rankings</p>
              </div>
            )}
          </div>
        )}

        {/* Signal Health Tab */}
        {activeTab === 'health' && (
          <div className="ml-health-section">
            {signalHealth?.data ? (
              <>
                <h5>Signal Health Report (180 days)</h5>
                <div className="health-summary">
                  <div className="health-stat">
                    <span className="stat-label">Overall Score</span>
                    <span className={`stat-value ${
                      signalHealth.data.overallHealth >= 0.7 ? 'positive' :
                      signalHealth.data.overallHealth >= 0.4 ? 'warning' : 'negative'
                    }`}>
                      {formatPercent(signalHealth.data.overallHealth)}
                    </span>
                  </div>
                  <div className="health-stat">
                    <span className="stat-label">Signals Analyzed</span>
                    <span className="stat-value">
                      {signalHealth.data.signalsAnalyzed || 0}
                    </span>
                  </div>
                </div>

                {signalHealth.data.signals && (
                  <div className="signals-health-grid">
                    {Object.entries(signalHealth.data.signals).map(([signal, health]) => (
                      <div key={signal} className="signal-health-card">
                        <div className="signal-header">
                          <span className="signal-name">{signal}</span>
                          <span className={`signal-status ${
                            health.status === 'healthy' ? 'positive' :
                            health.status === 'degraded' ? 'warning' : 'negative'
                          }`}>
                            {health.status}
                          </span>
                        </div>
                        <div className="signal-metrics">
                          <div className="signal-metric">
                            <span>IC</span>
                            <span>{health.ic?.toFixed(3) || '-'}</span>
                          </div>
                          <div className="signal-metric">
                            <span>Hit Rate</span>
                            <span>{formatPercent(health.hitRate)}</span>
                          </div>
                          <div className="signal-metric">
                            <span>Decay Days</span>
                            <span>{health.decayDays || '-'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <Settings size={24} />
                <p>No signal health data available</p>
                <p>Signal performance tracking may not be configured</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="ml-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}

export default MLCombinerPanel;
