// frontend/src/components/research/FactorLab/FactorCombinationTester.js
// Test factor combinations with historical backtesting

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader, TrendingUp, TrendingDown, AlertTriangle } from '../../icons';

const FACTORS = [
  { id: 'value', label: 'Value', color: '#2563EB', description: 'P/E, P/B ratios' },
  { id: 'quality', label: 'Quality', color: '#059669', description: 'ROE, margins' },
  { id: 'momentum', label: 'Momentum', color: '#D97706', description: 'Price momentum' },
  { id: 'growth', label: 'Growth', color: '#7C3AED', description: 'Revenue growth' },
  { id: 'size', label: 'Size', color: '#DC2626', description: 'Market cap' },
  { id: 'volatility', label: 'Volatility', color: '#0891B2', description: 'Price stability' }
];

export default function FactorCombinationTester() {
  const [weights, setWeights] = useState({
    value: 25,
    quality: 25,
    momentum: 20,
    growth: 15,
    size: 10,
    volatility: 5
  });
  const [config, setConfig] = useState({
    startDate: '2020-01-01',
    endDate: new Date().toISOString().split('T')[0],
    rebalanceFrequency: 'monthly',
    topN: 20
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleWeightChange = (factor, value) => {
    setWeights(prev => ({ ...prev, [factor]: Math.max(0, Math.min(100, parseInt(value) || 0)) }));
  };

  const normalizeWeights = () => {
    if (totalWeight === 0) return;
    const normalized = {};
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = Math.round((value / totalWeight) * 100);
    }
    setWeights(normalized);
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);

    try {
      // Normalize weights to decimals
      const factorWeights = {};
      for (const [key, value] of Object.entries(weights)) {
        factorWeights[key] = value / 100;
      }

      const response = await fetch('/api/backtesting/factor-combination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorWeights,
          ...config
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Backtest failed');
      }

      setResults(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Prepare equity curve data for chart
  const chartData = results?.equityCurve?.filter((_, i) => i % 5 === 0).map(point => ({
    date: point.date,
    portfolio: Math.round(point.value),
    benchmark: results.benchmarkMetrics?.totalReturn
      ? Math.round(100000 * (1 + (results.benchmarkMetrics.totalReturn / 100) * (results.equityCurve.indexOf(point) / results.equityCurve.length)))
      : 100000
  })) || [];

  return (
    <div className="factor-combination-tester">
      <div className="tester-controls">
        <div className="weight-sliders">
          <div className="weight-header">
            <h4>Factor Weights</h4>
            <button
              className="normalize-btn"
              onClick={normalizeWeights}
              disabled={totalWeight === 0}
            >
              Normalize to 100%
            </button>
          </div>

          <div className="total-weight" style={{ color: totalWeight === 100 ? 'var(--positive)' : 'var(--warning)' }}>
            Total: {totalWeight}%
          </div>

          {FACTORS.map(factor => (
            <div key={factor.id} className="weight-slider-row">
              <label>
                <span className="factor-dot" style={{ backgroundColor: factor.color }} />
                {factor.label}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={weights[factor.id]}
                onChange={(e) => handleWeightChange(factor.id, e.target.value)}
                style={{ '--track-color': factor.color }}
              />
              <input
                type="number"
                min="0"
                max="100"
                value={weights[factor.id]}
                onChange={(e) => handleWeightChange(factor.id, e.target.value)}
                className="weight-input"
              />
              <span className="weight-percent">%</span>
            </div>
          ))}
        </div>

        <div className="backtest-config">
          <h4>Configuration</h4>

          <div className="config-row">
            <label>Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
            />
          </div>

          <div className="config-row">
            <label>End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>

          <div className="config-row">
            <label>Rebalance</label>
            <select
              value={config.rebalanceFrequency}
              onChange={(e) => setConfig(prev => ({ ...prev, rebalanceFrequency: e.target.value }))}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>

          <div className="config-row">
            <label>Top N Stocks</label>
            <input
              type="number"
              min="5"
              max="50"
              value={config.topN}
              onChange={(e) => setConfig(prev => ({ ...prev, topN: parseInt(e.target.value) || 20 }))}
            />
          </div>

          <button
            className="run-backtest-btn"
            onClick={runBacktest}
            disabled={loading || totalWeight === 0}
          >
            {loading ? <><Loader size={16} /> Running...</> : 'Run Backtest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="backtest-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {results && (
        <div className="backtest-results">
          <div className="results-metrics">
            <div className="metric-card">
              <span className="metric-label">Total Return</span>
              <span className={`metric-value ${results.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                {results.totalReturn >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {results.totalReturn?.toFixed(1)}%
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">vs Benchmark</span>
              <span className={`metric-value ${results.totalReturn - results.benchmarkMetrics?.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                {(results.totalReturn - (results.benchmarkMetrics?.totalReturn || 0)).toFixed(1)}%
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Sharpe Ratio</span>
              <span className="metric-value">{results.metrics?.sharpe?.toFixed(2) || 'N/A'}</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Max Drawdown</span>
              <span className="metric-value negative">
                {((results.metrics?.maxDrawdown || 0) * 100).toFixed(1)}%
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Alpha</span>
              <span className={`metric-value ${results.metrics?.alpha >= 0 ? 'positive' : 'negative'}`}>
                {((results.metrics?.alpha || 0) * 100).toFixed(1)}%
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Beta</span>
              <span className="metric-value">{results.metrics?.beta?.toFixed(2) || 'N/A'}</span>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="equity-curve-chart">
              <h4>Portfolio Value Over Time</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value.toLocaleString()}`, '']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Portfolio"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="results-summary">
            <p>
              <strong>Period:</strong> {results.config?.startDate} to {results.config?.endDate}
            </p>
            <p>
              <strong>Trades:</strong> {results.trades?.length || 0} total
            </p>
            <p>
              <strong>Final Value:</strong> ${results.finalValue?.toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
