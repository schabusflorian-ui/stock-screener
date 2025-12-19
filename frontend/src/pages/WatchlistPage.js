import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { companyAPI, pricesAPI } from '../services/api';
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
  const [priceData, setPriceData] = useState({});
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('addedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load metrics and prices for all watchlist items
  useEffect(() => {
    const loadData = async () => {
      if (watchlist.length === 0) return;

      setLoading(true);
      const newMetrics = {};
      const newPrices = {};

      // Load all data in parallel
      await Promise.all(watchlist.map(async (item) => {
        try {
          const [metricsRes, priceRes] = await Promise.all([
            companyAPI.getOne(item.symbol),
            pricesAPI.getMetrics(item.symbol).catch(() => null)
          ]);
          newMetrics[item.symbol] = metricsRes.data.latest_metrics;
          if (priceRes?.data?.data) {
            newPrices[item.symbol] = priceRes.data.data;
          }
        } catch (error) {
          console.error(`Error loading data for ${item.symbol}:`, error);
        }
      }));

      setMetricsData(newMetrics);
      setPriceData(newPrices);
      setLoading(false);
    };

    loadData();
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
      } else if (['last_price', 'change_1d', 'change_1w', 'change_1m'].includes(sortBy)) {
        aVal = priceData[a.symbol]?.[sortBy] ?? -Infinity;
        bVal = priceData[b.symbol]?.[sortBy] ?? -Infinity;
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

    const headers = ['Symbol', 'Name', 'Sector', 'Price', '1D %', '1W %', '1M %', 'ROIC', 'ROE', 'Net Margin', 'FCF Yield', 'Debt/Equity', 'Added'];
    const rows = watchlist.map(item => {
      const metrics = metricsData[item.symbol] || {};
      const prices = priceData[item.symbol] || {};
      return [
        item.symbol,
        `"${item.name || ''}"`,
        item.sector || '',
        prices.last_price?.toFixed(2) || '',
        prices.change_1d?.toFixed(2) || '',
        prices.change_1w?.toFixed(2) || '',
        prices.change_1m?.toFixed(2) || '',
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
                  <th onClick={() => handleSort('last_price')}>
                    Price <SortIcon column="last_price" />
                  </th>
                  <th onClick={() => handleSort('change_1d')}>
                    1D <SortIcon column="change_1d" />
                  </th>
                  <th onClick={() => handleSort('change_1w')}>
                    1W <SortIcon column="change_1w" />
                  </th>
                  <th onClick={() => handleSort('change_1m')}>
                    1M <SortIcon column="change_1m" />
                  </th>
                  <th onClick={() => handleSort('roic')}>
                    ROIC <SortIcon column="roic" />
                  </th>
                  <th onClick={() => handleSort('roe')}>
                    ROE <SortIcon column="roe" />
                  </th>
                  <th onClick={() => handleSort('net_margin')}>
                    Margin <SortIcon column="net_margin" />
                  </th>
                  <th onClick={() => handleSort('fcf_yield')}>
                    FCF Yld <SortIcon column="fcf_yield" />
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
                  const prices = priceData[item.symbol] || {};
                  return (
                    <tr key={item.symbol}>
                      <td>
                        <Link to={`/company/${item.symbol}`} className="symbol-link">
                          {item.symbol}
                        </Link>
                      </td>
                      <td className="name-cell">{item.name}</td>
                      <td className="price-cell">
                        {prices.last_price ? `$${prices.last_price.toFixed(2)}` : '-'}
                      </td>
                      <td className={`change-cell ${prices.change_1d > 0 ? 'positive' : prices.change_1d < 0 ? 'negative' : ''}`}>
                        {prices.change_1d != null ? `${prices.change_1d > 0 ? '+' : ''}${prices.change_1d.toFixed(1)}%` : '-'}
                      </td>
                      <td className={`change-cell ${prices.change_1w > 0 ? 'positive' : prices.change_1w < 0 ? 'negative' : ''}`}>
                        {prices.change_1w != null ? `${prices.change_1w > 0 ? '+' : ''}${prices.change_1w.toFixed(1)}%` : '-'}
                      </td>
                      <td className={`change-cell ${prices.change_1m > 0 ? 'positive' : prices.change_1m < 0 ? 'negative' : ''}`}>
                        {prices.change_1m != null ? `${prices.change_1m > 0 ? '+' : ''}${prices.change_1m.toFixed(1)}%` : '-'}
                      </td>
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
