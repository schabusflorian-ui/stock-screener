// frontend/src/components/portfolio/WhatIfPanel.js
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, GitBranch, Plus, Trash2, Play, ArrowRight } from '../icons';
import { simulateAPI, companyAPI } from '../../services/api';
import { useAskAI } from '../../hooks/useAskAI';
import './SimulationPanels.css';

function WhatIfPanel({ portfolioId, positions = [] }) {
  // Ask AI context menu for what-if analysis
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'what_if',
    portfolioId,
    label: 'What-If Analysis',
    positionsCount: positions?.length
  }));

  const [mode, setMode] = useState('changes'); // 'changes' or 'weights'
  const [changes, setChanges] = useState([{ action: 'add', symbol: '', shares: 0 }]);
  const [targetWeights, setTargetWeights] = useState({});
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [, setSearchResults] = useState([]);
  const [, setSearching] = useState(false);

  useEffect(() => {
    // Initialize target weights from current positions
    const weights = {};
    positions.forEach(pos => {
      weights[pos.symbol] = pos.weight || 0;
    });
    setTargetWeights(weights);
  }, [positions]);

  const searchCompanies = async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const res = await companyAPI?.search?.(query) || { data: [] };
      setSearchResults(res.data?.slice(0, 5) || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const addChange = () => {
    setChanges([...changes, { action: 'add', symbol: '', shares: 0 }]);
  };

  const removeChange = (index) => {
    setChanges(changes.filter((_, i) => i !== index));
  };

  const updateChange = (index, field, value) => {
    const newChanges = [...changes];
    newChanges[index][field] = value;
    setChanges(newChanges);
  };

  const runWhatIf = async () => {
    try {
      setRunning(true);
      setError(null);
      setResults(null);

      let res;
      if (mode === 'changes') {
        const validChanges = changes.filter(c => c.symbol && c.shares > 0);
        if (validChanges.length === 0) {
          setError('Please add at least one valid change');
          setRunning(false);
          return;
        }
        res = await simulateAPI.runWhatIf(parseInt(portfolioId), validChanges);
      } else {
        const weights = Object.entries(targetWeights)
          .filter(([_, weight]) => weight > 0)
          .reduce((acc, [symbol, weight]) => {
            acc[symbol] = weight / 100; // Convert to decimal
            return acc;
          }, {});
        res = await simulateAPI.runWhatIfWeights(parseInt(portfolioId), weights);
      }

      const data = res.data.data ?? res.data;
      const tradesToExecute = Array.isArray(data?.tradesToExecute) ? data.tradesToExecute : [];
      setResults(data ? { ...data, tradesToExecute } : null);
    } catch (err) {
      console.error('What-if analysis failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    const sign = value >= 0 ? '+$' : '-$';
    return `${sign}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const getImpactColor = (value) => {
    if (value > 0) return 'var(--success-color)';
    if (value < 0) return 'var(--danger-color)';
    return 'var(--text-secondary)';
  };

  return (
    <div className="simulation-panel what-if-panel" {...askAIProps}>
      <div className="panel-header">
        <h3>What-If Analysis</h3>
        <p className="panel-description">
          Simulate portfolio changes and see their impact before executing
        </p>
      </div>

      <div className="panel-content">
        <div className="mode-selector">
          <button
            className={`mode-btn ${mode === 'changes' ? 'active' : ''}`}
            onClick={() => setMode('changes')}
          >
            <Plus size={16} />
            Add/Remove Positions
          </button>
          <button
            className={`mode-btn ${mode === 'weights' ? 'active' : ''}`}
            onClick={() => setMode('weights')}
          >
            <GitBranch size={16} />
            Adjust Weights
          </button>
        </div>

        {mode === 'changes' && (
          <div className="changes-section">
            <h4>Position Changes</h4>

            {changes.map((change, index) => (
              <div key={index} className="change-row">
                <select
                  value={change.action}
                  onChange={(e) => updateChange(index, 'action', e.target.value)}
                >
                  <option value="add">Add</option>
                  <option value="remove">Remove</option>
                  <option value="adjust">Adjust</option>
                </select>

                <input
                  type="text"
                  placeholder="Symbol (e.g., AAPL)"
                  value={change.symbol}
                  onChange={(e) => {
                    updateChange(index, 'symbol', e.target.value.toUpperCase());
                    searchCompanies(e.target.value);
                  }}
                />

                <input
                  type="number"
                  placeholder="Shares"
                  value={change.shares || ''}
                  onChange={(e) => updateChange(index, 'shares', parseInt(e.target.value) || 0)}
                  min="0"
                />

                <button
                  className="btn-icon"
                  onClick={() => removeChange(index)}
                  disabled={changes.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <button className="btn btn-secondary add-change-btn" onClick={addChange}>
              <Plus size={16} />
              Add Another Change
            </button>
          </div>
        )}

        {mode === 'weights' && (
          <div className="weights-section">
            <h4>Target Allocations</h4>
            <p className="section-hint">
              Adjust target weights for each position. Must sum to 100%.
            </p>

            <div className="weights-grid">
              {positions.map((pos) => (
                <div key={pos.symbol} className="weight-row">
                  <span className="symbol">{pos.symbol}</span>
                  <span className="current-weight">
                    Current: {(pos.weight || 0).toFixed(1)}%
                  </span>
                  <div className="weight-input">
                    <input
                      type="number"
                      value={targetWeights[pos.symbol] || 0}
                      onChange={(e) => setTargetWeights({
                        ...targetWeights,
                        [pos.symbol]: parseFloat(e.target.value) || 0
                      })}
                      min="0"
                      max="100"
                      step="0.5"
                    />
                    <span>%</span>
                  </div>
                  <div className="weight-change">
                    <ArrowRight size={14} />
                    <span style={{ color: getImpactColor((targetWeights[pos.symbol] || 0) - (pos.weight || 0)) }}>
                      {formatPercent((targetWeights[pos.symbol] || 0) - (pos.weight || 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="weights-total">
              Total: {Object.values(targetWeights).reduce((a, b) => a + b, 0).toFixed(1)}%
              {Math.abs(Object.values(targetWeights).reduce((a, b) => a + b, 0) - 100) > 0.1 && (
                <span className="warning"> (should be 100%)</span>
              )}
            </div>
          </div>
        )}

        <button
          className="btn btn-primary run-btn"
          onClick={runWhatIf}
          disabled={running}
        >
          {running ? (
            <>
              <Loader className="spinning" size={16} />
              Analyzing Impact...
            </>
          ) : (
            <>
              <Play size={16} />
              Simulate Changes
            </>
          )}
        </button>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {results && (
          <div className="results-section">
            <h4>Impact Analysis</h4>

            <div className="results-grid">
              <div className="result-card primary">
                <span className="result-label">Value Change</span>
                <span
                  className="result-value"
                  style={{ color: getImpactColor(results.valueChange) }}
                >
                  {formatValue(results.valueChange)}
                </span>
                <span className="result-hint">
                  {formatPercent(results.valueChangePercent)}
                </span>
              </div>

              <div className="result-card">
                <span className="result-label">Positions</span>
                <span className="result-value">
                  {results.currentPositions} → {results.newPositions}
                </span>
                <span className="result-hint">
                  {results.newPositions - results.currentPositions >= 0 ? '+' : ''}
                  {results.newPositions - results.currentPositions} positions
                </span>
              </div>

              {results.volatilityChange !== undefined && (
                <div className="result-card">
                  <span className="result-label">Volatility Change</span>
                  <span
                    className="result-value"
                    style={{ color: getImpactColor(-results.volatilityChange) }}
                  >
                    {formatPercent(results.volatilityChange)}
                  </span>
                  <span className="result-hint">
                    {results.volatilityChange > 0 ? 'More risky' : 'Less risky'}
                  </span>
                </div>
              )}

              {results.betaChange !== undefined && (
                <div className="result-card">
                  <span className="result-label">Beta Change</span>
                  <span className="result-value">
                    {results.currentBeta?.toFixed(2)} → {results.newBeta?.toFixed(2)}
                  </span>
                  <span className="result-hint">
                    {results.betaChange >= 0 ? '+' : ''}{results.betaChange?.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {Array.isArray(results.tradesToExecute) && results.tradesToExecute.length > 0 && (
              <div className="trades-section">
                <h5>Trades to Execute</h5>
                <div className="trades-list">
                  {results.tradesToExecute.map((trade, i) => (
                    <div key={i} className={`trade-item ${trade.action}`}>
                      <span className="trade-action">{trade.action.toUpperCase()}</span>
                      <span className="trade-symbol">{trade.symbol}</span>
                      <span className="trade-shares">{trade.shares} shares</span>
                      <span className="trade-value">≈ ${trade.estimatedValue?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {results.estimatedTradingCost && (
                  <div className="trading-costs">
                    Estimated trading costs: ${results.estimatedTradingCost.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {results.riskAssessment && (
              <div className="risk-assessment">
                <h5>Risk Assessment</h5>
                <div className={`risk-badge ${results.riskAssessment.level}`}>
                  {results.riskAssessment.level === 'increased' && <AlertTriangle size={16} />}
                  Risk {results.riskAssessment.level}
                </div>
                <p>{results.riskAssessment.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WhatIfPanel;
