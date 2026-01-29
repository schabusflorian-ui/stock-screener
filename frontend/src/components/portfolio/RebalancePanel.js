// frontend/src/components/portfolio/RebalancePanel.js
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, Scale, Check, RefreshCw, ArrowRight } from '../icons';
import { simulateAPI } from '../../services/api';
import { useAskAI } from '../../hooks/useAskAI';
import './SimulationPanels.css';

function RebalancePanel({ portfolioId, positions = [] }) {
  // Ask AI context menu for rebalancing
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'rebalance',
    portfolioId,
    label: 'Portfolio Rebalancing',
    positionsCount: positions?.length
  }));

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [driftThreshold, setDriftThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [driftStatus, setDriftStatus] = useState(null);
  const [rebalancePlan, setRebalancePlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTemplates();
    checkDrift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadTemplates = async () => {
    try {
      const res = await simulateAPI.getRebalanceTemplates();
      setTemplates(res.data.data || res.data.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const checkDrift = async () => {
    try {
      setChecking(true);
      const res = await simulateAPI.checkRebalanceNeeded(parseInt(portfolioId));
      setDriftStatus(res.data.data || res.data);
    } catch (err) {
      console.error('Failed to check drift:', err);
    } finally {
      setChecking(false);
    }
  };

  const calculateRebalance = async () => {
    try {
      setLoading(true);
      setError(null);
      setRebalancePlan(null);

      const config = {
        driftThreshold: driftThreshold / 100,
        templateId: selectedTemplate
      };

      const res = await simulateAPI.calculateRebalance(parseInt(portfolioId), config);
      setRebalancePlan(res.data.data || res.data);
    } catch (err) {
      console.error('Rebalance calculation failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = async (templateId) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedTemplate(templateId);

      const res = await simulateAPI.applyTemplate(parseInt(portfolioId), templateId);
      setRebalancePlan(res.data.data || res.data);
    } catch (err) {
      console.error('Template application failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  const getDriftColor = (drift) => {
    const absDrift = Math.abs(drift);
    if (absDrift < 2) return 'var(--success-color)';
    if (absDrift < 5) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  const getDirectionIcon = (direction) => {
    if (direction === 'overweight') return '↑';
    if (direction === 'underweight') return '↓';
    return '=';
  };

  return (
    <div className="simulation-panel rebalance-panel" {...askAIProps}>
      <div className="panel-header">
        <h3>Portfolio Rebalancing</h3>
        <p className="panel-description">
          Analyze drift from target allocations and generate rebalancing trades
        </p>
      </div>

      <div className="panel-content">
        {/* Drift Status Card */}
        <div className="drift-status-card">
          <div className="drift-header">
            <Scale size={20} />
            <span>Portfolio Drift Status</span>
            <button
              className="btn-icon refresh-btn"
              onClick={checkDrift}
              disabled={checking}
            >
              <RefreshCw size={16} className={checking ? 'spinning' : ''} />
            </button>
          </div>

          {driftStatus && (
            <div className="drift-content">
              <div className={`drift-badge ${driftStatus.needsRebalancing ? 'needs-rebalance' : 'balanced'}`}>
                {driftStatus.needsRebalancing ? (
                  <>
                    <AlertTriangle size={16} />
                    Rebalancing Recommended
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Portfolio Balanced
                  </>
                )}
              </div>

              {driftStatus.maxDrift !== undefined && (
                <div className="drift-stats">
                  <div className="drift-stat">
                    <span className="stat-label">Max Drift</span>
                    <span
                      className="stat-value"
                      style={{ color: getDriftColor(driftStatus.maxDrift) }}
                    >
                      {formatPercent(driftStatus.maxDrift)}
                    </span>
                  </div>
                  <div className="drift-stat">
                    <span className="stat-label">Avg Drift</span>
                    <span
                      className="stat-value"
                      style={{ color: getDriftColor(driftStatus.avgDrift) }}
                    >
                      {formatPercent(driftStatus.avgDrift)}
                    </span>
                  </div>
                  <div className="drift-stat">
                    <span className="stat-label">Positions Drifted</span>
                    <span className="stat-value">
                      {driftStatus.positionsDrifted || 0} / {positions.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Templates Section */}
        <div className="config-section">
          <h4>Rebalancing Templates</h4>
          <div className="template-grid">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => applyTemplate(template.id)}
                disabled={loading}
              >
                <span className="template-name">{template.name}</span>
                <span className="template-description">{template.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Rebalance */}
        <div className="config-section">
          <h4>Custom Rebalancing</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Drift Threshold</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  value={driftThreshold}
                  onChange={(e) => setDriftThreshold(parseFloat(e.target.value) || 0)}
                  min="1"
                  max="20"
                  step="0.5"
                />
                <span className="suffix">%</span>
              </div>
              <span className="form-hint">
                Positions with drift above this threshold will be rebalanced
              </span>
            </div>
          </div>

          <button
            className="btn btn-primary run-btn"
            onClick={calculateRebalance}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader className="spinning" size={16} />
                Calculating...
              </>
            ) : (
              <>
                <Scale size={16} />
                Calculate Rebalancing Trades
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {rebalancePlan && (
          <div className="results-section">
            <h4>Rebalancing Plan</h4>

            {rebalancePlan.positions && rebalancePlan.positions.length > 0 && (
              <div className="rebalance-table">
                <div className="table-header">
                  <span>Symbol</span>
                  <span>Current</span>
                  <span></span>
                  <span>Target</span>
                  <span>Drift</span>
                  <span>Direction</span>
                </div>
                {rebalancePlan.positions.map((pos) => (
                  <div key={pos.symbol} className="table-row">
                    <span className="symbol">{pos.symbol}</span>
                    <span>{formatPercent(pos.currentWeight)}</span>
                    <span><ArrowRight size={14} /></span>
                    <span>{formatPercent(pos.targetWeight)}</span>
                    <span style={{ color: getDriftColor(pos.drift) }}>
                      {formatPercent(pos.drift)}
                    </span>
                    <span className={`direction ${pos.direction}`}>
                      {getDirectionIcon(pos.direction)} {pos.direction}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {rebalancePlan.trades && rebalancePlan.trades.length > 0 && (
              <div className="trades-section">
                <h5>Required Trades</h5>
                <div className="trades-list">
                  {rebalancePlan.trades.map((trade, i) => (
                    <div key={i} className={`trade-item ${trade.action}`}>
                      <span className="trade-action">{trade.action.toUpperCase()}</span>
                      <span className="trade-symbol">{trade.symbol}</span>
                      <span className="trade-shares">{trade.shares} shares</span>
                      <span className="trade-value">≈ ${trade.estimatedValue?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="trade-summary">
                  <div className="summary-item">
                    <span>Total Sells</span>
                    <span>${rebalancePlan.totalSells?.toLocaleString() || 0}</span>
                  </div>
                  <div className="summary-item">
                    <span>Total Buys</span>
                    <span>${rebalancePlan.totalBuys?.toLocaleString() || 0}</span>
                  </div>
                  <div className="summary-item">
                    <span>Est. Trading Costs</span>
                    <span>${rebalancePlan.estimatedCosts?.toFixed(2) || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {rebalancePlan.trades?.length === 0 && (
              <div className="no-trades-message">
                <Check size={20} />
                <span>No trades needed - portfolio is within drift threshold</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RebalancePanel;
