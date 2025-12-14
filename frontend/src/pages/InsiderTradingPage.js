// frontend/src/pages/InsiderTradingPage.js
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { insidersAPI } from '../services/api';
import { WatchlistButton } from '../components';
import './InsiderTradingPage.css';

// Format currency values
const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '-';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

// Format number with commas
const formatNumber = (value) => {
  if (!value || isNaN(value)) return '-';
  return value.toLocaleString();
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Signal badge component
const SignalBadge = ({ signal, score }) => {
  const signalClass = {
    bullish: 'signal-bullish',
    bearish: 'signal-bearish',
    neutral: 'signal-neutral'
  }[signal] || 'signal-neutral';

  return (
    <span className={`signal-badge ${signalClass}`}>
      {signal?.toUpperCase()} {score ? `(${score})` : ''}
    </span>
  );
};

// Transaction type badge
const TransactionBadge = ({ type }) => {
  const typeClass = {
    buy: 'tx-buy',
    sell: 'tx-sell',
    award: 'tx-award',
    exercise: 'tx-exercise'
  }[type] || 'tx-other';

  return (
    <span className={`transaction-badge ${typeClass}`}>
      {type?.toUpperCase()}
    </span>
  );
};

function InsiderTradingPage() {
  // View mode
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'signals', 'recent', 'cluster'
  const [period, setPeriod] = useState('3m');

  // Data states
  const [topBuying, setTopBuying] = useState([]);
  const [signals, setSignals] = useState({ bullish: [], bearish: [], neutral: [] });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [clusterBuying, setClusterBuying] = useState([]);
  const [stats, setStats] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  // Filters
  const [transactionType, setTransactionType] = useState('all');
  const [minInsiders, setMinInsiders] = useState(2);
  const [clusterDays, setClusterDays] = useState(30);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [topBuyingRes, statsRes] = await Promise.all([
        insidersAPI.getTopBuying(20, period),
        insidersAPI.getStats()
      ]);

      setTopBuying(topBuyingRes.data.companies || []);
      setStats(statsRes.data.yearToDate || null);
      setMonthlyTrend(statsRes.data.monthlyTrend || []);
    } catch (err) {
      console.error('Error loading insider data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load signals
  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insidersAPI.getSignals(period, 'all');
      setSignals(res.data.signals || { bullish: [], bearish: [], neutral: [] });
    } catch (err) {
      console.error('Error loading signals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Load recent transactions
  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insidersAPI.getRecent(100, transactionType);
      setRecentTransactions(res.data.transactions || []);
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transactionType]);

  // Load cluster buying
  const loadClusterBuying = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insidersAPI.getClusterBuying(minInsiders, clusterDays);
      setClusterBuying(res.data.clusters || []);
    } catch (err) {
      console.error('Error loading cluster data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minInsiders, clusterDays]);

  // Effect for view mode changes
  useEffect(() => {
    if (viewMode === 'signals') {
      loadSignals();
    } else if (viewMode === 'recent') {
      loadRecent();
    } else if (viewMode === 'cluster') {
      loadClusterBuying();
    }
  }, [viewMode, loadSignals, loadRecent, loadClusterBuying]);

  // Overview view
  const renderOverview = () => (
    <div className="overview-content">
      {/* Stats cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total_transactions?.toLocaleString() || 0}</span>
            <span className="stat-label">Total Transactions</span>
          </div>
          <div className="stat-card positive">
            <span className="stat-value">{stats.buy_count?.toLocaleString() || 0}</span>
            <span className="stat-label">Buy Transactions</span>
          </div>
          <div className="stat-card negative">
            <span className="stat-value">{stats.sell_count?.toLocaleString() || 0}</span>
            <span className="stat-label">Sell Transactions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.active_insiders?.toLocaleString() || 0}</span>
            <span className="stat-label">Active Insiders</span>
          </div>
          <div className="stat-card positive">
            <span className="stat-value">{formatCurrency(stats.total_buy_value)}</span>
            <span className="stat-label">Total Buy Value</span>
          </div>
          <div className="stat-card negative">
            <span className="stat-value">{formatCurrency(stats.total_sell_value)}</span>
            <span className="stat-label">Total Sell Value</span>
          </div>
        </div>
      )}

      {/* Monthly trend chart */}
      {monthlyTrend.length > 0 && (
        <div className="card chart-card">
          <h3>Monthly Insider Activity (TTM)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                formatter={(value) => formatCurrency(value)}
              />
              <Legend />
              <Bar dataKey="buy_value" name="Buy Value" fill="#10b981" />
              <Bar dataKey="sell_value" name="Sell Value" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top buying table */}
      <div className="card">
        <div className="card-header">
          <h3>Top Insider Buying</h3>
          <div className="period-selector">
            {['1m', '3m', '6m', '1y'].map(p => (
              <button
                key={p}
                className={period === p ? 'active' : ''}
                onClick={() => setPeriod(p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Signal</th>
                <th>Buy Value</th>
                <th>Buyers</th>
                <th>Net Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topBuying.length === 0 ? (
                <tr><td colSpan="7" className="no-data">No insider buying data available</td></tr>
              ) : (
                topBuying.map((company) => (
                  <tr key={company.company_id || company.symbol}>
                    <td>
                      <Link to={`/company/${company.symbol}`} className="symbol-link">
                        {company.symbol}
                      </Link>
                    </td>
                    <td className="company-name">{company.company_name}</td>
                    <td>
                      <SignalBadge signal={company.insider_signal} score={company.signal_score} />
                    </td>
                    <td className="positive">{formatCurrency(company.buy_value)}</td>
                    <td>{company.unique_buyers || 0}</td>
                    <td className={company.net_value >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(company.net_value)}
                    </td>
                    <td>
                      <WatchlistButton symbol={company.symbol} compact />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Signals view
  const renderSignals = () => (
    <div className="signals-content">
      <div className="signals-summary">
        <div className="signal-count bullish">
          <span className="count">{signals.bullish?.length || 0}</span>
          <span className="label">Bullish</span>
        </div>
        <div className="signal-count neutral">
          <span className="count">{signals.neutral?.length || 0}</span>
          <span className="label">Neutral</span>
        </div>
        <div className="signal-count bearish">
          <span className="count">{signals.bearish?.length || 0}</span>
          <span className="label">Bearish</span>
        </div>
      </div>

      <div className="signals-grid">
        {/* Bullish signals */}
        <div className="signal-column">
          <h3 className="column-title bullish-title">Bullish Signals</h3>
          {signals.bullish?.slice(0, 15).map((item) => (
            <div key={item.company_id} className="signal-item">
              <Link to={`/company/${item.symbol}`} className="symbol-link">
                {item.symbol}
              </Link>
              <span className="company-name">{item.company_name}</span>
              <SignalBadge signal="bullish" score={item.signal_score} />
            </div>
          ))}
          {(!signals.bullish || signals.bullish.length === 0) && (
            <div className="no-signals">No bullish signals</div>
          )}
        </div>

        {/* Neutral signals */}
        <div className="signal-column">
          <h3 className="column-title neutral-title">Neutral Signals</h3>
          {signals.neutral?.slice(0, 15).map((item) => (
            <div key={item.company_id} className="signal-item">
              <Link to={`/company/${item.symbol}`} className="symbol-link">
                {item.symbol}
              </Link>
              <span className="company-name">{item.company_name}</span>
              <SignalBadge signal="neutral" score={item.signal_score} />
            </div>
          ))}
          {(!signals.neutral || signals.neutral.length === 0) && (
            <div className="no-signals">No neutral signals</div>
          )}
        </div>

        {/* Bearish signals */}
        <div className="signal-column">
          <h3 className="column-title bearish-title">Bearish Signals</h3>
          {signals.bearish?.slice(0, 15).map((item) => (
            <div key={item.company_id} className="signal-item">
              <Link to={`/company/${item.symbol}`} className="symbol-link">
                {item.symbol}
              </Link>
              <span className="company-name">{item.company_name}</span>
              <SignalBadge signal="bearish" score={item.signal_score} />
            </div>
          ))}
          {(!signals.bearish || signals.bearish.length === 0) && (
            <div className="no-signals">No bearish signals</div>
          )}
        </div>
      </div>
    </div>
  );

  // Recent transactions view
  const renderRecent = () => (
    <div className="recent-content">
      <div className="filter-bar">
        <label>Transaction Type:</label>
        <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
          <option value="all">All</option>
          <option value="buy">Buy Only</option>
          <option value="sell">Sell Only</option>
        </select>
        <button onClick={loadRecent} className="btn-refresh">Refresh</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Symbol</th>
              <th>Insider</th>
              <th>Title</th>
              <th>Type</th>
              <th>Shares</th>
              <th>Price</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.length === 0 ? (
              <tr><td colSpan="8" className="no-data">No transactions found</td></tr>
            ) : (
              recentTransactions.map((tx, idx) => (
                <tr key={tx.id || idx}>
                  <td>{formatDate(tx.transaction_date)}</td>
                  <td>
                    <Link to={`/company/${tx.symbol}`} className="symbol-link">
                      {tx.symbol}
                    </Link>
                  </td>
                  <td className="insider-name">{tx.insider_name}</td>
                  <td className="insider-title">
                    {tx.insider_title || (tx.is_director ? 'Director' : tx.is_ten_percent_owner ? '10% Owner' : '-')}
                  </td>
                  <td><TransactionBadge type={tx.transaction_type} /></td>
                  <td>{formatNumber(tx.shares_transacted)}</td>
                  <td>{tx.price_per_share ? `$${tx.price_per_share.toFixed(2)}` : '-'}</td>
                  <td className={tx.transaction_type === 'buy' ? 'positive' : tx.transaction_type === 'sell' ? 'negative' : ''}>
                    {formatCurrency(tx.total_value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Cluster buying view
  const renderCluster = () => (
    <div className="cluster-content">
      <div className="filter-bar">
        <label>Min Insiders:</label>
        <select value={minInsiders} onChange={(e) => setMinInsiders(parseInt(e.target.value))}>
          {[2, 3, 4, 5].map(n => (
            <option key={n} value={n}>{n}+ insiders</option>
          ))}
        </select>
        <label>Time Window:</label>
        <select value={clusterDays} onChange={(e) => setClusterDays(parseInt(e.target.value))}>
          {[7, 14, 30, 60, 90].map(d => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
        <button onClick={loadClusterBuying} className="btn-refresh">Search</button>
      </div>

      <div className="cluster-info">
        <p>
          Found <strong>{clusterBuying.length}</strong> companies with {minInsiders}+ different insiders
          buying within {clusterDays} days.
        </p>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Sector</th>
              <th>Unique Buyers</th>
              <th>Total Value</th>
              <th>Total Shares</th>
              <th>Buyers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clusterBuying.length === 0 ? (
              <tr><td colSpan="8" className="no-data">No cluster buying detected</td></tr>
            ) : (
              clusterBuying.map((cluster) => (
                <tr key={cluster.company_id}>
                  <td>
                    <Link to={`/company/${cluster.symbol}`} className="symbol-link">
                      {cluster.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{cluster.company_name}</td>
                  <td>{cluster.sector || '-'}</td>
                  <td className="highlight">{cluster.unique_buyers}</td>
                  <td className="positive">{formatCurrency(cluster.total_buy_value)}</td>
                  <td>{formatNumber(cluster.total_shares)}</td>
                  <td className="buyers-list">
                    {cluster.buyer_names?.slice(0, 3).join(', ')}
                    {cluster.buyer_names?.length > 3 && ` +${cluster.buyer_names.length - 3}`}
                  </td>
                  <td>
                    <WatchlistButton symbol={cluster.symbol} compact />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="insider-page error-state">
        <div className="error-banner">
          <span>Error loading data: {error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="insider-page">
      <div className="page-header">
        <h1>Insider Trading</h1>
        <p className="subtitle">Track insider buying and selling activity</p>
      </div>

      {/* View mode tabs */}
      <div className="view-tabs">
        <button
          className={viewMode === 'overview' ? 'active' : ''}
          onClick={() => setViewMode('overview')}
        >
          Overview
        </button>
        <button
          className={viewMode === 'signals' ? 'active' : ''}
          onClick={() => setViewMode('signals')}
        >
          Signals
        </button>
        <button
          className={viewMode === 'recent' ? 'active' : ''}
          onClick={() => setViewMode('recent')}
        >
          Recent Transactions
        </button>
        <button
          className={viewMode === 'cluster' ? 'active' : ''}
          onClick={() => setViewMode('cluster')}
        >
          Cluster Buying
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Loading insider data...</span>
        </div>
      )}

      {/* Content based on view mode */}
      <div className="page-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'signals' && renderSignals()}
        {viewMode === 'recent' && renderRecent()}
        {viewMode === 'cluster' && renderCluster()}
      </div>
    </div>
  );
}

export default InsiderTradingPage;
