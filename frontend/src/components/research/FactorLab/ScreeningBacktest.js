// frontend/src/components/research/FactorLab/ScreeningBacktest.js
// Backtest screening strategies historically

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader, TrendingUp, TrendingDown, AlertTriangle } from '../../icons';

export default function ScreeningBacktest() {
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('buffett');
  const [config, setConfig] = useState({
    startDate: '2019-01-01',
    endDate: new Date().toISOString().split('T')[0],
    rebalanceFrequency: 'quarterly',
    maxPositions: 20
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Load available presets
  useEffect(() => {
    fetch('/api/backtesting/screen-presets')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPresets(data.data);
        }
      })
      .catch(err => console.error('Failed to load presets:', err));
  }, []);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/backtesting/preset-screen-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
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

  // Prepare chart data
  const chartData = results?.equityCurve?.filter((_, i) => i % 5 === 0).map(point => ({
    date: point.date,
    value: Math.round(point.value)
  })) || [];

  const selectedPresetInfo = presets.find(p => p.key === selectedPreset);

  return (
    <div className="screening-backtest">
      <div className="backtest-controls">
        <div className="preset-selector">
          <h4>Select Strategy</h4>

          <div className="preset-grid">
            {presets.map(preset => (
              <button
                key={preset.key}
                className={`preset-card ${selectedPreset === preset.key ? 'selected' : ''}`}
                onClick={() => setSelectedPreset(preset.key)}
              >
                <span className="preset-name">{preset.name}</span>
                <span className="preset-desc">{preset.description}</span>
              </button>
            ))}
          </div>

          {selectedPresetInfo && (
            <div className="selected-preset-info">
              <strong>{selectedPresetInfo.name}</strong>: {selectedPresetInfo.description}
            </div>
          )}
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
            <label>Max Positions</label>
            <input
              type="number"
              min="5"
              max="50"
              value={config.maxPositions}
              onChange={(e) => setConfig(prev => ({ ...prev, maxPositions: parseInt(e.target.value) || 20 }))}
            />
          </div>

          <button
            className="run-backtest-btn"
            onClick={runBacktest}
            disabled={loading}
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
                    formatter={(value) => [`$${value.toLocaleString()}`, 'Portfolio']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Portfolio"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {results.screeningHistory?.length > 0 && (
            <div className="screening-history">
              <h4>Recent Selections</h4>
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Stocks Selected</th>
                      <th>Top Holdings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.screeningHistory.slice(-5).reverse().map((h, i) => (
                      <tr key={i}>
                        <td>{h.date}</td>
                        <td>{h.selected?.length || 0}</td>
                        <td className="top-holdings">
                          {h.selected?.slice(0, 5).map(s => s.symbol).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
