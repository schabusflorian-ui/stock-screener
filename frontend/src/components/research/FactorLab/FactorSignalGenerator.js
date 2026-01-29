// frontend/src/components/research/FactorLab/FactorSignalGenerator.js
// Generate actionable trading signals based on factor analysis

import { useState } from 'react';
import { Loader, TrendingUp, TrendingDown, AlertTriangle, Info } from '../../icons';

const FACTORS = [
  { id: 'value', label: 'Value', color: '#2563EB' },
  { id: 'quality', label: 'Quality', color: '#059669' },
  { id: 'momentum', label: 'Momentum', color: '#D97706' },
  { id: 'growth', label: 'Growth', color: '#7C3AED' },
  { id: 'size', label: 'Size', color: '#DC2626' },
  { id: 'volatility', label: 'Volatility', color: '#0891B2' }
];

export default function FactorSignalGenerator() {
  const [weights, setWeights] = useState({
    value: 20,
    quality: 20,
    momentum: 20,
    growth: 20,
    size: 10,
    volatility: 10
  });
  const [topN, setTopN] = useState(10);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleWeightChange = (factor, value) => {
    setWeights(prev => ({ ...prev, [factor]: Math.max(0, Math.min(100, parseInt(value) || 0)) }));
  };

  const generateSignals = async () => {
    setLoading(true);
    setError(null);

    try {
      const factorWeights = {};
      for (const [key, value] of Object.entries(weights)) {
        factorWeights[key] = value / 100;
      }

      const response = await fetch('/api/backtesting/factor-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorWeights,
          topN
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate signals');
      }

      setResults(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatMarketCap = (cap) => {
    if (!cap) return 'N/A';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
    return `$${cap.toLocaleString()}`;
  };

  return (
    <div className="factor-signal-generator">
      <div className="signal-controls">
        <div className="weight-config">
          <h4>Factor Weights</h4>
          <p className="weight-hint">Adjust weights to customize your factor strategy</p>

          <div className="weight-grid">
            {FACTORS.map(factor => (
              <div key={factor.id} className="weight-item">
                <label>
                  <span className="factor-dot" style={{ backgroundColor: factor.color }} />
                  {factor.label}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weights[factor.id]}
                  onChange={(e) => handleWeightChange(factor.id, e.target.value)}
                />
                <span>%</span>
              </div>
            ))}
          </div>

          <div className="weight-total" style={{ color: totalWeight === 100 ? 'var(--positive)' : 'var(--warning)' }}>
            Total: {totalWeight}%
          </div>
        </div>

        <div className="signal-config">
          <div className="config-row">
            <label>Number of Signals</label>
            <input
              type="number"
              min="5"
              max="25"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 10)}
            />
          </div>

          <button
            className="generate-btn"
            onClick={generateSignals}
            disabled={loading || totalWeight === 0}
          >
            {loading ? <><Loader size={16} /> Generating...</> : 'Generate Signals'}
          </button>
        </div>
      </div>

      {error && (
        <div className="signal-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {results && (
        <div className="signal-results">
          <div className="results-header">
            <span className="score-date">
              <Info size={14} />
              Based on factor scores from {results.scoreDate}
            </span>
            <span className="universe-size">{results.universeSize} stocks analyzed</span>
          </div>

          {results.insights?.length > 0 && (
            <div className="signal-insights">
              {results.insights.map((insight, i) => (
                <div key={i} className="insight-item">
                  <span className="insight-icon">💡</span>
                  {insight}
                </div>
              ))}
            </div>
          )}

          <div className="signals-grid">
            <div className="buy-signals">
              <h4>
                <TrendingUp size={18} />
                Buy Signals
              </h4>

              <table className="signals-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>Sector</th>
                    <th>Score</th>
                    <th>Strength</th>
                    <th>Market Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {results.buySignals?.map(signal => (
                    <tr key={signal.symbol} className="buy-row">
                      <td>{signal.rank}</td>
                      <td className="symbol-cell">
                        <a href={`/company/${signal.symbol}`} target="_blank" rel="noopener noreferrer">
                          {signal.symbol}
                        </a>
                      </td>
                      <td className="sector-cell">{signal.sector || '-'}</td>
                      <td className="score-cell">{signal.combinedScore}</td>
                      <td className={`strength-cell strength-${signal.strength?.toLowerCase().replace(' ', '-')}`}>
                        {signal.strength}
                      </td>
                      <td className="mcap-cell">{formatMarketCap(signal.marketCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="avoid-signals">
              <h4>
                <TrendingDown size={18} />
                Avoid Signals
              </h4>

              <table className="signals-table avoid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>Sector</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {results.sellSignals?.slice(0, 5).map(signal => (
                    <tr key={signal.symbol} className="avoid-row">
                      <td>{signal.rank}</td>
                      <td className="symbol-cell">{signal.symbol}</td>
                      <td className="sector-cell">{signal.sector || '-'}</td>
                      <td className="score-cell">{signal.combinedScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="methodology-note">
            <Info size={14} />
            <span>{results.methodology}</span>
          </div>
        </div>
      )}
    </div>
  );
}
