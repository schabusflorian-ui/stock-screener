// frontend/src/components/research/QuantWorkbench/SignalGenerator.js
// Generate buy signals based on factor scores - matches Screening page patterns

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWatchlist } from '../../../context/WatchlistContext';
import { WatchlistButton } from '../../index';
import {
  Loader, AlertTriangle, TrendingUp, Download, Plus, Check,
  Eye, Star, RefreshCw, Filter, ChevronDown, ChevronUp, Columns, X
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

// Column definitions matching Screening page pattern
const ALL_COLUMNS = [
  { key: 'rank', label: '#', format: 'number', alwaysVisible: true, width: '50px' },
  { key: 'symbol', label: 'Symbol', format: 'text', alwaysVisible: true },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'sector', label: 'Sector', format: 'text' },
  { key: 'zscoreValue', label: 'Z-Score', format: 'number', colorCode: { good: 1, bad: -1 } },
  { key: 'percentileValue', label: 'Percentile', format: 'percent', colorCode: { good: 90, bad: 50, inverse: true } },
  { key: 'rawValue', label: 'Raw Value', format: 'number' },
];

const DEFAULT_VISIBLE_COLUMNS = ['rank', 'symbol', 'name', 'sector', 'zscoreValue', 'percentileValue'];

export default function SignalGenerator({ factor, onAddToPortfolio }) {
  const navigate = useNavigate();
  const { addToWatchlist, isInWatchlist } = useWatchlist();

  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signalCount, setSignalCount] = useState(20);
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
  const [showFilters, setShowFilters] = useState(false);

  // Table state
  const [sortColumn, setSortColumn] = useState('rank');
  const [sortDirection, setSortDirection] = useState('asc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [showColumnSelector, setShowColumnSelector] = useState(false);

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

  // Toggle column visibility
  const toggleColumn = useCallback((columnKey) => {
    setVisibleColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey]
    );
  }, []);

  // Get visible column definitions
  const visibleColumnDefs = useMemo(() => {
    return ALL_COLUMNS.filter(col => visibleColumns.includes(col.key));
  }, [visibleColumns]);

  // Handle table header click for sorting
  const handleTableSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'symbol' || column === 'name' ? 'asc' : 'desc');
    }
  }, [sortColumn]);

  // Sort results
  const sortedResults = useMemo(() => {
    if (!signals?.topStocks) return [];

    // Add rank to each stock
    const withRank = signals.topStocks.map((stock, idx) => ({
      ...stock,
      rank: idx + 1
    }));

    return [...withRank].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      const comparison = aVal - bVal;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [signals, sortColumn, sortDirection]);

  // Format value based on column type
  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '—';

    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'number':
        return typeof value === 'number' ? value.toFixed(2) : value;
      case 'currency':
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      default:
        return value;
    }
  };

  // Get cell class for color coding
  const getCellClass = (value, column) => {
    if (value === null || value === undefined || !column.colorCode) return '';
    const { good, bad, inverse } = column.colorCode;
    if (inverse) {
      if (value >= good) return 'positive';
      if (value <= bad) return 'negative';
    } else {
      if (value >= good) return 'positive';
      if (value <= bad) return 'negative';
    }
    return '';
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

    const headers = ['Rank', 'Symbol', 'Name', 'Sector', 'Z-Score', 'Percentile', 'Raw Value'];
    const rows = signals.topStocks.map((stock, idx) => [
      idx + 1,
      stock.symbol,
      stock.name || '',
      stock.sector || '',
      stock.zscoreValue?.toFixed(4) || '',
      stock.percentileValue?.toFixed(2) || '',
      stock.rawValue?.toFixed(4) || ''
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
            className={`table-control-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <Filter size={14} />
            Filters
            <ChevronDown size={12} className={showFilters ? 'rotated' : ''} />
          </button>

          <button
            className="table-control-btn refresh"
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
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
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

          {/* Table Controls - matching Screening page */}
          <div className="table-controls">
            <div className="table-controls-left">
              <span className="results-count">
                {sortedResults.length} results
              </span>
              <span className="watchlist-status">
                {alreadyInWatchlistCount}/{sortedResults.length} in watchlist
              </span>
            </div>
            <div className="table-controls-right">
              <div className="column-selector-wrapper">
                <button
                  className={`table-control-btn ${showColumnSelector ? 'active' : ''}`}
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  title="Select columns"
                >
                  <Columns size={14} />
                  <span>Columns</span>
                </button>
                {showColumnSelector && (
                  <div className="column-selector-dropdown">
                    <div className="column-selector-header">
                      <span>Show/Hide Columns</span>
                      <button onClick={() => setShowColumnSelector(false)}><X size={14} /></button>
                    </div>
                    <div className="column-selector-list">
                      {ALL_COLUMNS.map(col => (
                        <label key={col.key} className={`column-option ${col.alwaysVisible ? 'disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(col.key)}
                            onChange={() => toggleColumn(col.key)}
                            disabled={col.alwaysVisible}
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="column-selector-footer">
                      <button onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}>
                        Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Table - matching Screening page structure */}
          <div className="results-table signal-results-table">
            <table>
              <thead>
                <tr>
                  {visibleColumnDefs.map(col => (
                    <th
                      key={col.key}
                      className={`sortable ${sortColumn === col.key ? 'sorted' : ''}`}
                      onClick={() => handleTableSort(col.key)}
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                      {sortColumn === col.key && (
                        sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </th>
                  ))}
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((stock) => {
                  const inWatchlist = isInWatchlist(stock.symbol) || addedToWatchlist.has(stock.symbol);

                  return (
                    <tr key={stock.symbol} className={inWatchlist ? 'in-watchlist' : ''}>
                      {visibleColumnDefs.map(col => {
                        const value = stock[col.key];

                        if (col.key === 'symbol') {
                          return (
                            <td key={col.key}>
                              <Link to={`/company/${stock.symbol}`} className="symbol-link">
                                {stock.symbol}
                              </Link>
                            </td>
                          );
                        }

                        if (col.key === 'name') {
                          return (
                            <td key={col.key} className="company-name">
                              {stock.name || '—'}
                            </td>
                          );
                        }

                        if (col.key === 'sector') {
                          return (
                            <td key={col.key} className="sector-cell">
                              {stock.sector || '—'}
                            </td>
                          );
                        }

                        if (col.key === 'percentileValue') {
                          return (
                            <td key={col.key} className={`numeric-cell ${getCellClass(value, col)}`}>
                              Top {value?.toFixed(0) || '?'}%
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className={`numeric-cell ${getCellClass(value, col)}`}>
                            {formatValue(value, col.format)}
                          </td>
                        );
                      })}
                      <td className="action-cell">
                        <div className="action-buttons">
                          <Link
                            to={`/company/${stock.symbol}`}
                            className="action-btn view"
                            title="View company"
                          >
                            <Eye size={14} />
                          </Link>
                          <WatchlistButton
                            symbol={stock.symbol}
                            name={stock.name}
                            sector={stock.sector}
                            size="small"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stats row */}
          {signals.stats && (
            <div className="signal-stats">
              <span>Mean: {signals.stats.mean?.toFixed(2)}</span>
              <span>Std: {signals.stats.std?.toFixed(2)}</span>
              <span>Min: {signals.stats.min?.toFixed(2)}</span>
              <span>Max: {signals.stats.max?.toFixed(2)}</span>
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
                  ({sortedResults.length - alreadyInWatchlistCount})
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
