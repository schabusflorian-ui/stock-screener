// frontend/src/components/research/QuantWorkbench/SignalGenerator.js
// Generate buy signals based on factor scores

import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, TrendingUp, Download, Plus } from '../../icons';

export default function SignalGenerator({ factor }) {
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signalCount, setSignalCount] = useState(10);

  // Generate signals when factor changes
  useEffect(() => {
    if (factor?.formula) {
      generateSignals();
    }
  }, [factor?.id]);

  const generateSignals = async () => {
    if (!factor?.formula) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/factors/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorId: factor.id,
          formula: factor.formula,
          topN: signalCount,
          higherIsBetter: factor.higherIsBetter !== false
        })
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate signals');
      }

      setSignals(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export to watchlist (placeholder)
  const exportToWatchlist = () => {
    if (!signals?.topStocks) return;
    const symbols = signals.topStocks.map(s => s.symbol).join(',');
    // TODO: Integrate with watchlist context
    navigator.clipboard.writeText(symbols);
    alert(`Copied ${signals.topStocks.length} symbols to clipboard: ${symbols}`);
  };

  if (!factor) {
    return (
      <div className="signal-generator empty">
        <div className="empty-icon-wrapper">
          <TrendingUp size={32} />
        </div>
        <h4>No Factor Selected</h4>
        <p>Select or create a factor to generate today's top stock picks based on your quantitative criteria.</p>
      </div>
    );
  }

  return (
    <div className="signal-generator">
      <div className="signal-generator-header">
        <h4>
          <TrendingUp size={18} />
          Today's Top Picks
        </h4>
        <div className="signal-controls">
          <label>
            Show top
            <select value={signalCount} onChange={(e) => setSignalCount(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            stocks
          </label>
          <button
            className="generate-btn"
            onClick={generateSignals}
            disabled={loading}
          >
            {loading ? <Loader size={14} /> : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="signal-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {loading && !signals && (
        <div className="signal-loading">
          <Loader size={24} />
          <span>Calculating factor scores...</span>
        </div>
      )}

      {signals && (
        <>
          <div className="signal-summary">
            <span>Based on: <code>{factor.formula}</code></span>
            <span className="signal-date">As of {new Date().toLocaleDateString()}</span>
          </div>

          <div className="signal-list">
            {signals.topStocks?.map((stock, index) => (
              <div key={stock.symbol} className="signal-item">
                <span className="signal-rank">#{index + 1}</span>
                <span className="signal-symbol">{stock.symbol}</span>
                <span className="signal-name">{stock.name || stock.sector || '-'}</span>
                <span className="signal-score">
                  {stock.zscoreValue?.toFixed(2) || stock.rawValue?.toFixed(2)}
                </span>
                <span className="signal-percentile">
                  Top {stock.percentileValue?.toFixed(0) || '?'}%
                </span>
              </div>
            ))}
          </div>

          {signals.stats && (
            <div className="signal-stats">
              <span>Universe: {signals.stats.universeSize?.toLocaleString()} stocks</span>
              <span>Mean: {signals.stats.mean?.toFixed(2)}</span>
              <span>Std: {signals.stats.std?.toFixed(2)}</span>
            </div>
          )}

          <div className="signal-actions">
            <button className="export-signals-btn" onClick={exportToWatchlist}>
              <Download size={14} />
              Copy Symbols
            </button>
          </div>
        </>
      )}
    </div>
  );
}
