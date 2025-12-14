import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { companyAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import './WatchlistPage.css';

const formatValue = (value, format) => {
  if (value === null || value === undefined) return '-';
  switch (format) {
    case 'percent': return `${value.toFixed(1)}%`;
    case 'ratio': return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    default: return value.toFixed(2);
  }
};

function WatchlistPage() {
  const { watchlist, removeFromWatchlist, clearWatchlist } = useWatchlist();
  const [metricsData, setMetricsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('addedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load metrics for all watchlist items
  useEffect(() => {
    const loadMetrics = async () => {
      if (watchlist.length === 0) return;

      setLoading(true);
      const newMetrics = {};

      for (const item of watchlist) {
        try {
          const response = await companyAPI.getOne(item.symbol);
          newMetrics[item.symbol] = response.data.latest_metrics;
        } catch (error) {
          console.error(`Error loading metrics for ${item.symbol}:`, error);
        }
      }

      setMetricsData(newMetrics);
      setLoading(false);
    };

    loadMetrics();
  }, [watchlist]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortedWatchlist = () => {
    return [...watchlist].sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'addedAt') {
        aVal = new Date(a.addedAt).getTime();
        bVal = new Date(b.addedAt).getTime();
      } else if (sortBy === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else {
        aVal = metricsData[a.symbol]?.[sortBy] ?? -Infinity;
        bVal = metricsData[b.symbol]?.[sortBy] ?? -Infinity;
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  };

  const exportToCSV = () => {
    if (watchlist.length === 0) return;

    const headers = ['Symbol', 'Name', 'Sector', 'ROIC', 'ROE', 'Net Margin', 'FCF Yield', 'Debt/Equity', 'Added'];
    const rows = watchlist.map(item => {
      const metrics = metricsData[item.symbol] || {};
      return [
        item.symbol,
        `"${item.name || ''}"`,
        item.sector || '',
        metrics.roic?.toFixed(1) || '',
        metrics.roe?.toFixed(1) || '',
        metrics.net_margin?.toFixed(1) || '',
        metrics.fcf_yield?.toFixed(1) || '',
        metrics.debt_to_equity?.toFixed(2) || '',
        new Date(item.addedAt).toLocaleDateString()
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchlist_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="watchlist-page">
      <div className="watchlist-header">
        <div>
          <h1>Watchlist</h1>
          <p>{watchlist.length} {watchlist.length === 1 ? 'company' : 'companies'} tracked</p>
        </div>
        {watchlist.length > 0 && (
          <div className="watchlist-actions">
            <button className="export-btn" onClick={exportToCSV}>
              Export CSV
            </button>
            <button className="clear-btn" onClick={() => {
              if (window.confirm('Clear entire watchlist?')) clearWatchlist();
            }}>
              Clear All
            </button>
          </div>
        )}
      </div>

      {loading && <div className="loading">Loading metrics...</div>}

      {watchlist.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <h3>Your watchlist is empty</h3>
          <p>Add companies from the screening results or company pages</p>
          <Link to="/screening" className="cta-button">
            Browse Stocks
          </Link>
        </div>
      ) : (
        <div className="watchlist-table-section">
          <div className="table-wrapper">
            <table className="watchlist-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('symbol')}>
                    Symbol <SortIcon column="symbol" />
                  </th>
                  <th>Name</th>
                  <th>Sector</th>
                  <th onClick={() => handleSort('roic')}>
                    ROIC <SortIcon column="roic" />
                  </th>
                  <th onClick={() => handleSort('roe')}>
                    ROE <SortIcon column="roe" />
                  </th>
                  <th onClick={() => handleSort('net_margin')}>
                    Net Margin <SortIcon column="net_margin" />
                  </th>
                  <th onClick={() => handleSort('fcf_yield')}>
                    FCF Yield <SortIcon column="fcf_yield" />
                  </th>
                  <th onClick={() => handleSort('debt_to_equity')}>
                    Debt/Eq <SortIcon column="debt_to_equity" />
                  </th>
                  <th onClick={() => handleSort('addedAt')}>
                    Added <SortIcon column="addedAt" />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getSortedWatchlist().map(item => {
                  const metrics = metricsData[item.symbol] || {};
                  return (
                    <tr key={item.symbol}>
                      <td>
                        <Link to={`/company/${item.symbol}`} className="symbol-link">
                          {item.symbol}
                        </Link>
                      </td>
                      <td className="name-cell">{item.name}</td>
                      <td className="sector-cell">{item.sector}</td>
                      <td className={metrics.roic > 15 ? 'positive' : ''}>
                        {formatValue(metrics.roic, 'percent')}
                      </td>
                      <td className={metrics.roe > 15 ? 'positive' : ''}>
                        {formatValue(metrics.roe, 'percent')}
                      </td>
                      <td className={metrics.net_margin > 10 ? 'positive' : ''}>
                        {formatValue(metrics.net_margin, 'percent')}
                      </td>
                      <td className={metrics.fcf_yield > 5 ? 'positive' : ''}>
                        {formatValue(metrics.fcf_yield, 'percent')}
                      </td>
                      <td className={metrics.debt_to_equity < 0.5 ? 'positive' : ''}>
                        {formatValue(metrics.debt_to_equity, 'ratio')}
                      </td>
                      <td className="date-cell">
                        {new Date(item.addedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/company/${item.symbol}`} className="view-btn">
                            View
                          </Link>
                          <button
                            className="remove-btn"
                            onClick={() => removeFromWatchlist(item.symbol)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {watchlist.length > 0 && (
        <div className="watchlist-summary">
          <h3>Portfolio Summary</h3>
          <div className="summary-cards">
            <div className="summary-card">
              <span className="label">Avg ROIC</span>
              <span className="value">
                {formatValue(
                  Object.values(metricsData).reduce((sum, m) => sum + (m?.roic || 0), 0) /
                  Object.keys(metricsData).length || 0,
                  'percent'
                )}
              </span>
            </div>
            <div className="summary-card">
              <span className="label">Avg Net Margin</span>
              <span className="value">
                {formatValue(
                  Object.values(metricsData).reduce((sum, m) => sum + (m?.net_margin || 0), 0) /
                  Object.keys(metricsData).length || 0,
                  'percent'
                )}
              </span>
            </div>
            <div className="summary-card">
              <span className="label">Avg FCF Yield</span>
              <span className="value">
                {formatValue(
                  Object.values(metricsData).reduce((sum, m) => sum + (m?.fcf_yield || 0), 0) /
                  Object.keys(metricsData).length || 0,
                  'percent'
                )}
              </span>
            </div>
            <div className="summary-card">
              <span className="label">Avg Debt/Equity</span>
              <span className="value">
                {formatValue(
                  Object.values(metricsData).reduce((sum, m) => sum + (m?.debt_to_equity || 0), 0) /
                  Object.keys(metricsData).length || 0,
                  'ratio'
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WatchlistPage;
