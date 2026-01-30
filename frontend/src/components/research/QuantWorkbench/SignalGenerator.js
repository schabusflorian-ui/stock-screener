// frontend/src/components/research/QuantWorkbench/SignalGenerator.js
// Generate buy signals based on factor scores

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../../../context/WatchlistContext';
import {
  Loader, AlertTriangle, TrendingUp, Download, Plus, Check,
  Eye, Star, RefreshCw, Filter, ChevronDown
} from '../../icons';

// Sector filter options
const SECTORS = [
  'All Sectors',
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services'
];

export default function SignalGenerator({ factor, onAddToPortfolio }) {
  const navigate = useNavigate();
  const { addToWatchlist, isInWatchlist } = useWatchlist();

  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signalCount, setSignalCount] = useState(10);
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
  const [showFilters, setShowFilters] = useState(false);

  // Track which stocks have been added to watchlist (for UI feedback)
  const [addedToWatchlist, setAddedToWatchlist] = useState(new Set());
  const [addingAll, setAddingAll] = useState(false);

  // Generate signals when factor changes
  useEffect(() => {
    if (factor?.formula) {
      generateSignals();
    }
    // Reset added tracking when factor changes
    setAddedToWatchlist(new Set());
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
          higherIsBetter: factor.higherIsBetter !== false,
          sector: sectorFilter !== 'All Sectors' ? sectorFilter : undefined
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

  // Add single stock to watchlist
  const handleAddToWatchlist = useCallback((stock) => {
    addToWatchlist(stock.symbol, stock.name, stock.sector);
    setAddedToWatchlist(prev => new Set([...prev, stock.symbol]));
  }, [addToWatchlist]);

  // Add all signals to watchlist
  const handleAddAllToWatchlist = useCallback(async () => {
    if (!signals?.topStocks) return;

    setAddingAll(true);
    const newAdded = new Set(addedToWatchlist);

    for (const stock of signals.topStocks) {
      if (!isInWatchlist(stock.symbol)) {
        addToWatchlist(stock.symbol, stock.name, stock.sector);
        newAdded.add(stock.symbol);
      }
    }

    setAddedToWatchlist(newAdded);
    setAddingAll(false);
  }, [signals, addToWatchlist, isInWatchlist, addedToWatchlist]);

  // Export signals as CSV
  const exportAsCSV = useCallback(() => {
    if (!signals?.topStocks) return;

    const headers = ['Rank', 'Symbol', 'Name', 'Sector', 'Z-Score', 'Percentile'];
    const rows = signals.topStocks.map((stock, idx) => [
      idx + 1,
      stock.symbol,
      stock.name || '',
      stock.sector || '',
      stock.zscoreValue?.toFixed(4) || '',
      stock.percentileValue?.toFixed(2) || ''
    ]);

    const csvContent = [
      `# Factor: ${factor.name}`,
      `# Formula: ${factor.formula}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Universe Size: ${signals.stats?.universeSize || 'N/A'}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${factor.name.replace(/\s+/g, '_')}_signals_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [signals, factor]);

  // Navigate to company page
  const handleViewCompany = useCallback((symbol) => {
    navigate(`/company/${symbol}`);
  }, [navigate]);

  // Count how many are already in watchlist
  const alreadyInWatchlistCount = signals?.topStocks?.filter(s => isInWatchlist(s.symbol)).length || 0;
  const canAddMore = signals?.topStocks && alreadyInWatchlistCount < signals.topStocks.length;

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
      {/* Header with controls */}
      <div className="signal-generator-header">
        <div className="header-left">
          <h4>
            <TrendingUp size={18} />
            Today's Top Picks
          </h4>
          <span className="factor-badge">{factor.name}</span>
        </div>

        <div className="signal-controls">
          <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} />
            Filters
            <ChevronDown size={12} className={showFilters ? 'rotated' : ''} />
          </button>

          <button
            className="refresh-btn"
            onClick={generateSignals}
            disabled={loading}
            title="Refresh signals"
          >
            {loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* Collapsible Filters */}
      {showFilters && (
        <div className="signal-filters">
          <div className="filter-group">
            <label>Show top</label>
            <select
              value={signalCount}
              onChange={(e) => setSignalCount(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sector</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              {SECTORS.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>

          <button className="apply-filters-btn" onClick={generateSignals}>
            Apply Filters
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="signal-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !signals && (
        <div className="signal-loading">
          <Loader size={24} className="spin" />
          <span>Calculating factor scores...</span>
        </div>
      )}

      {/* Results */}
      {signals && (
        <>
          {/* Summary bar */}
          <div className="signal-summary">
            <div className="summary-left">
              <code>{factor.formula}</code>
            </div>
            <div className="summary-right">
              <span className="signal-date">As of {new Date().toLocaleDateString()}</span>
              {signals.stats && (
                <span className="universe-size">
                  {signals.stats.universeSize?.toLocaleString()} stocks scanned
                </span>
              )}
            </div>
          </div>

          {/* Signal list with enhanced actions */}
          <div className="signal-list">
            <div className="signal-list-header">
              <span className="col-rank">#</span>
              <span className="col-symbol">Symbol</span>
              <span className="col-name">Name</span>
              <span className="col-score">Z-Score</span>
              <span className="col-percentile">Rank</span>
              <span className="col-actions">Actions</span>
            </div>

            {signals.topStocks?.map((stock, index) => {
              const inWatchlist = isInWatchlist(stock.symbol) || addedToWatchlist.has(stock.symbol);

              return (
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
                  <span className="signal-actions">
                    <button
                      className="action-btn view"
                      onClick={() => handleViewCompany(stock.symbol)}
                      title="View company"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className={`action-btn watchlist ${inWatchlist ? 'added' : ''}`}
                      onClick={() => !inWatchlist && handleAddToWatchlist(stock)}
                      disabled={inWatchlist}
                      title={inWatchlist ? 'In watchlist' : 'Add to watchlist'}
                    >
                      {inWatchlist ? <Check size={14} /> : <Star size={14} />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stats row */}
          {signals.stats && (
            <div className="signal-stats">
              <span>Mean: {signals.stats.mean?.toFixed(2)}</span>
              <span>Std: {signals.stats.std?.toFixed(2)}</span>
              <span className="watchlist-count">
                {alreadyInWatchlistCount}/{signals.topStocks?.length} in watchlist
              </span>
            </div>
          )}

          {/* Bulk actions */}
          <div className="signal-bulk-actions">
            <button
              className="bulk-btn watchlist-all"
              onClick={handleAddAllToWatchlist}
              disabled={!canAddMore || addingAll}
            >
              {addingAll ? (
                <Loader size={14} className="spin" />
              ) : (
                <Plus size={14} />
              )}
              Add All to Watchlist
              {canAddMore && (
                <span className="count">
                  ({signals.topStocks.length - alreadyInWatchlistCount})
                </span>
              )}
            </button>

            <button className="bulk-btn export-csv" onClick={exportAsCSV}>
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
