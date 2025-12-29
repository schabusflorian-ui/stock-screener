// frontend/src/components/portfolio/PositionSizingPanel.js
import { useState } from 'react';
import { Loader, Calculator, DollarSign, Target, Percent, AlertTriangle } from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

function PositionSizingPanel({ portfolioValue }) {
  const [method, setMethod] = useState('kelly');
  const [config, setConfig] = useState({
    // Common
    portfolioValue: portfolioValue || 100000,
    entryPrice: '',
    // Kelly
    winRate: 55,
    avgWin: 2,
    avgLoss: 1,
    kellyFraction: 0.5,
    maxPositionPct: 25,
    // Fixed Risk
    maxRiskPct: 2,
    stopLossPrice: '',
    // Volatility
    symbol: '',
    targetVolatility: 15,
    // Equal Weight
    numberOfPositions: 10,
    cashReserve: 5,
    // Percent of Portfolio
    targetPct: 5
  });
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const methods = [
    { id: 'kelly', name: 'Kelly Criterion', icon: Target, description: 'Optimal sizing based on win rate and payoff ratio' },
    { id: 'fixed_risk', name: 'Fixed Risk', icon: Percent, description: 'Risk a fixed percentage per trade' },
    { id: 'volatility_based', name: 'Volatility-Based', icon: AlertTriangle, description: 'Size inversely proportional to volatility' },
    { id: 'equal_weight', name: 'Equal Weight', icon: DollarSign, description: 'Divide equally across positions' },
    { id: 'percent_of_portfolio', name: 'Percent of Portfolio', icon: Calculator, description: 'Simple percentage allocation' }
  ];

  const calculate = async () => {
    try {
      setCalculating(true);
      setError(null);

      const params = { portfolioValue: config.portfolioValue };

      switch (method) {
        case 'kelly':
          params.winRate = config.winRate / 100;
          params.avgWin = config.avgWin;
          params.avgLoss = config.avgLoss;
          params.kellyFraction = config.kellyFraction;
          params.maxPositionPct = config.maxPositionPct;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        case 'fixed_risk':
          params.maxRiskPct = config.maxRiskPct;
          params.entryPrice = parseFloat(config.entryPrice);
          params.stopLossPrice = parseFloat(config.stopLossPrice);
          break;
        case 'volatility_based':
          params.symbol = config.symbol;
          params.targetVolatility = config.targetVolatility;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        case 'equal_weight':
          params.numberOfPositions = config.numberOfPositions;
          params.cashReserve = config.cashReserve;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        case 'percent_of_portfolio':
          params.targetPct = config.targetPct;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        default:
          break;
      }

      const res = await simulateAPI.calculatePositionSize({
        method,
        ...params
      });

      setResult(res.data.data || res.data);
    } catch (err) {
      console.error('Position sizing failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setCalculating(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="simulation-panel position-sizing-panel">
      <div className="panel-header">
        <h3>Position Size Calculator</h3>
        <p className="panel-description">
          Calculate optimal position size for your next trade
        </p>
      </div>

      <div className="panel-content">
        {/* Method Selection */}
        <div className="method-selector">
          {methods.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                className={`method-btn ${method === m.id ? 'active' : ''}`}
                onClick={() => {
                  setMethod(m.id);
                  setResult(null);
                }}
              >
                <Icon size={18} />
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>

        <p className="method-description">
          {methods.find(m => m.id === method)?.description}
        </p>

        <div className="config-section">
          {/* Common Fields */}
          <div className="form-row">
            <div className="form-group">
              <label>Portfolio Value ($)</label>
              <input
                type="number"
                value={config.portfolioValue}
                onChange={e => setConfig({ ...config, portfolioValue: parseFloat(e.target.value) })}
                min="0"
              />
            </div>
            {method !== 'equal_weight' && (
              <div className="form-group">
                <label>Entry Price ($)</label>
                <input
                  type="number"
                  value={config.entryPrice}
                  onChange={e => setConfig({ ...config, entryPrice: e.target.value })}
                  placeholder="Optional"
                  min="0"
                  step="0.01"
                />
              </div>
            )}
          </div>

          {/* Kelly-specific Fields */}
          {method === 'kelly' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Win Rate (%)</label>
                  <input
                    type="number"
                    value={config.winRate}
                    onChange={e => setConfig({ ...config, winRate: parseFloat(e.target.value) })}
                    min="0"
                    max="100"
                    step="1"
                  />
                </div>
                <div className="form-group">
                  <label>Avg Win : Avg Loss</label>
                  <div className="ratio-inputs">
                    <input
                      type="number"
                      value={config.avgWin}
                      onChange={e => setConfig({ ...config, avgWin: parseFloat(e.target.value) })}
                      min="0.1"
                      step="0.1"
                    />
                    <span>:</span>
                    <input
                      type="number"
                      value={config.avgLoss}
                      onChange={e => setConfig({ ...config, avgLoss: parseFloat(e.target.value) })}
                      min="0.1"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Kelly Fraction</label>
                  <select
                    value={config.kellyFraction}
                    onChange={e => setConfig({ ...config, kellyFraction: parseFloat(e.target.value) })}
                  >
                    <option value="0.25">Quarter Kelly (Safest)</option>
                    <option value="0.5">Half Kelly (Recommended)</option>
                    <option value="0.75">Three-Quarter Kelly</option>
                    <option value="1">Full Kelly (Aggressive)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Max Position (%)</label>
                  <input
                    type="number"
                    value={config.maxPositionPct}
                    onChange={e => setConfig({ ...config, maxPositionPct: parseFloat(e.target.value) })}
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </>
          )}

          {/* Fixed Risk Fields */}
          {method === 'fixed_risk' && (
            <div className="form-row">
              <div className="form-group">
                <label>Max Risk Per Trade (%)</label>
                <input
                  type="number"
                  value={config.maxRiskPct}
                  onChange={e => setConfig({ ...config, maxRiskPct: parseFloat(e.target.value) })}
                  min="0.1"
                  max="10"
                  step="0.1"
                />
              </div>
              <div className="form-group">
                <label>Stop Loss Price ($)</label>
                <input
                  type="number"
                  value={config.stopLossPrice}
                  onChange={e => setConfig({ ...config, stopLossPrice: e.target.value })}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </div>
          )}

          {/* Volatility-based Fields */}
          {method === 'volatility_based' && (
            <div className="form-row">
              <div className="form-group">
                <label>Symbol</label>
                <input
                  type="text"
                  value={config.symbol}
                  onChange={e => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
                  placeholder="e.g., AAPL"
                  required
                />
              </div>
              <div className="form-group">
                <label>Target Volatility (%)</label>
                <input
                  type="number"
                  value={config.targetVolatility}
                  onChange={e => setConfig({ ...config, targetVolatility: parseFloat(e.target.value) })}
                  min="1"
                  max="100"
                />
              </div>
            </div>
          )}

          {/* Equal Weight Fields */}
          {method === 'equal_weight' && (
            <div className="form-row">
              <div className="form-group">
                <label>Number of Positions</label>
                <input
                  type="number"
                  value={config.numberOfPositions}
                  onChange={e => setConfig({ ...config, numberOfPositions: parseInt(e.target.value) })}
                  min="1"
                  max="100"
                />
              </div>
              <div className="form-group">
                <label>Cash Reserve (%)</label>
                <input
                  type="number"
                  value={config.cashReserve}
                  onChange={e => setConfig({ ...config, cashReserve: parseFloat(e.target.value) })}
                  min="0"
                  max="50"
                />
              </div>
            </div>
          )}

          {/* Percent of Portfolio Fields */}
          {method === 'percent_of_portfolio' && (
            <div className="form-group">
              <label>Target Allocation (%)</label>
              <input
                type="number"
                value={config.targetPct}
                onChange={e => setConfig({ ...config, targetPct: parseFloat(e.target.value) })}
                min="0.1"
                max="100"
                step="0.5"
              />
            </div>
          )}
        </div>

        <button
          className="btn btn-primary run-btn"
          onClick={calculate}
          disabled={calculating}
        >
          {calculating ? (
            <>
              <Loader className="spinning" size={16} />
              Calculating...
            </>
          ) : (
            <>
              <Calculator size={16} />
              Calculate Position Size
            </>
          )}
        </button>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {result && (
          <div className="results-section">
            <h4>Recommended Position</h4>

            <div className="results-grid">
              <div className="result-card primary large">
                <span className="result-label">Shares to Buy</span>
                <span className="result-value">{result.shares?.toLocaleString() || '-'}</span>
              </div>

              <div className="result-card primary">
                <span className="result-label">Position Value</span>
                <span className="result-value">{formatValue(result.positionValue)}</span>
              </div>

              <div className="result-card">
                <span className="result-label">% of Portfolio</span>
                <span className="result-value">{formatPercent(result.positionPct)}</span>
              </div>

              {result.maxLoss !== undefined && (
                <div className="result-card warning">
                  <span className="result-label">Max Loss</span>
                  <span className="result-value negative">{formatValue(result.maxLoss)}</span>
                  <span className="result-hint">{formatPercent(result.maxLossPct)} of portfolio</span>
                </div>
              )}

              {result.kellyPercent !== undefined && (
                <div className="result-card">
                  <span className="result-label">Kelly %</span>
                  <span className="result-value">{formatPercent(result.kellyPercent)}</span>
                  <span className="result-hint">Optimal fraction</span>
                </div>
              )}

              {result.riskRewardRatio !== undefined && result.riskRewardRatio !== null && (
                <div className="result-card">
                  <span className="result-label">Risk/Reward</span>
                  <span className="result-value">1:{result.riskRewardRatio?.toFixed(2)}</span>
                </div>
              )}
            </div>

            {method === 'kelly' && (
              <div className="kelly-explanation">
                <h5>Kelly Criterion Calculation</h5>
                <p>
                  With a {config.winRate}% win rate and {config.avgWin}:{config.avgLoss} payoff ratio,
                  the optimal Kelly bet is <strong>{formatPercent(result.kellyPercent)}</strong> of your portfolio.
                  {config.kellyFraction < 1 && (
                    <> Using {config.kellyFraction * 100}% Kelly reduces to <strong>{formatPercent(result.positionPct)}</strong>.</>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PositionSizingPanel;
