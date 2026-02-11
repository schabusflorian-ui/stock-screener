// frontend/src/pages/signals/InsidersTab.js
// Insider Trading tab - wrapper around existing functionality
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAskAI } from '../../hooks/useAskAI';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';
import { insidersAPI, pricesAPI, altDataAPI } from '../../services/api';
import { WatchlistButton } from '../../components';
import { SkeletonInsiderTrading } from '../../components/Skeleton';
import { Clock, Landmark } from '../../components/icons';
import { useFormatters } from '../../hooks/useFormatters';
import { SectionErrorBoundary } from '../../components/ErrorBoundary';
import '../InsiderTradingPage.css';

// Sortable table header component
const SortableHeader = ({ label, sortKey, currentSort, onSort }) => {
  const isActive = currentSort.key === sortKey;
  return (
    <th onClick={() => onSort(sortKey)} className={`sortable ${isActive ? 'sorted' : ''}`}>
      {label}
      {isActive && <span className="sort-arrow">{currentSort.dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
};

// Signal badge component
const SignalBadge = ({ signal, score }) => {
  const signalClass = {
    bullish: 'signal-bullish',
    bearish: 'signal-bearish',
    neutral: 'signal-neutral'
  }[signal] || 'signal-neutral';

  const displayScore = score != null && typeof score !== 'object' ? ` (${Number(score)})` : '';
  return (
    <span className={`signal-badge ${signalClass}`}>
      {typeof signal === 'string' ? signal.toUpperCase() : String(signal ?? '')}{displayScore}
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

// Top Buying row component with Ask AI
const TopBuyingRow = memo(function TopBuyingRow({ company, priceData, formatCurrency }) {
  const price = priceData[company.symbol];
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: company.symbol,
    label: `${company.symbol} - ${company.company_name} Insider Buying`,
    data: {
      signal: company.insider_signal,
      buyValue: company.buy_value,
      uniqueBuyers: company.unique_buyers,
      netValue: company.net_value,
      price: price?.last_price
    }
  }));

  return (
    <tr {...askAIProps}>
      <td>
        <Link to={`/company/${company.symbol}`} className="symbol-link">
          {company.symbol}
        </Link>
      </td>
      <td className="company-name">{company.company_name}</td>
      <td className="price-cell">
        {price?.last_price != null && !isNaN(Number(price.last_price)) ? `$${Number(price.last_price).toFixed(2)}` : '-'}
      </td>
      <td className={`change-cell ${Number(price?.change_1m) > 0 ? 'positive' : Number(price?.change_1m) < 0 ? 'negative' : ''}`}>
        {price?.change_1m != null && !isNaN(Number(price.change_1m)) ? `${Number(price.change_1m) > 0 ? '+' : ''}${Number(price.change_1m).toFixed(1)}%` : '-'}
      </td>
      <td>
        <SignalBadge signal={company.insider_signal} score={company.signal_score} />
      </td>
      <td className="positive">{formatCurrency(company.buy_value)}</td>
      <td>{company.unique_buyers || 0}</td>
      <td className={Number(company.net_value) >= 0 ? 'positive' : 'negative'}>
        {formatCurrency(company.net_value)}
      </td>
      <td>
        <WatchlistButton symbol={company.symbol} compact />
      </td>
    </tr>
  );
});

// Signal item component with Ask AI
const SignalItem = memo(function SignalItem({ item, signal }) {
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: item.symbol,
    label: `${item.symbol} - ${signal} insider signal`,
    data: {
      signal,
      signalScore: item.signal_score,
      companyName: item.company_name
    }
  }));

  return (
    <div className="signal-item" {...askAIProps}>
      <Link to={`/company/${item.symbol}`} className="symbol-link">
        {item.symbol}
      </Link>
      <span className="company-name">{item.company_name}</span>
      <SignalBadge signal={signal} score={item.signal_score} />
    </div>
  );
});

function InsidersTab() {
  const fmt = useFormatters();

  const formatCurrency = (value) => {
    const n = Number(value);
    if (value == null || value === '' || isNaN(n)) return '-';
    return fmt.currency(n, { compact: true });
  };

  const formatNumber = (value) => {
    const n = Number(value);
    if (value == null || value === '' || isNaN(n)) return '-';
    return fmt.number(n, { compact: false });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return fmt.date(dateStr);
  };

  // View mode
  const [viewMode, setViewMode] = useState('overview');
  const [period, setPeriod] = useState('3m');

  // Data states
  const [topBuying, setTopBuying] = useState([]);
  const [signals, setSignals] = useState({ bullish: [], bearish: [], neutral: [] });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [clusterBuying, setClusterBuying] = useState([]);
  const [congressionalTrades, setCongressionalTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);

  // Filters
  const [transactionType, setTransactionType] = useState('all');
  const [minInsiders, setMinInsiders] = useState(2);
  const [clusterDays, setClusterDays] = useState(30);

  // Sorting state
  const [overviewSort, setOverviewSort] = useState({ key: 'buy_value', dir: 'desc' });
  const [recentSort, setRecentSort] = useState({ key: 'transaction_date', dir: 'desc' });
  const [clusterSort, setClusterSort] = useState({ key: 'unique_buyers', dir: 'desc' });
  const [congressSort, setCongressSort] = useState({ key: 'total_value', dir: 'desc' });
  const [congressPeriod, setCongressPeriod] = useState('-30 days');

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priceData, setPriceData] = useState({});

  // Cache tracking - prevents refetching already-loaded data when switching tabs
  const [loadedTabs, setLoadedTabs] = useState({ overview: false, signals: false, recent: false, cluster: false, congressional: false });

  // Sort helper
  const handleSort = (setter) => (key) => {
    setter(prev => ({
      key,
      dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc'
    }));
  };

  // Sorted data
  const sortedTopBuying = useMemo(() => {
    return [...topBuying].sort((a, b) => {
      const aVal = a[overviewSort.key] ?? -Infinity;
      const bVal = b[overviewSort.key] ?? -Infinity;
      return overviewSort.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [topBuying, overviewSort]);

  const sortedRecentTransactions = useMemo(() => {
    if (!Array.isArray(recentTransactions)) {
      return [];
    }
    return [...recentTransactions].sort((a, b) => {
      if (recentSort.key === 'transaction_date') {
        const aVal = a[recentSort.key] || '';
        const bVal = b[recentSort.key] || '';
        return recentSort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aVal = a[recentSort.key] ?? -Infinity;
      const bVal = b[recentSort.key] ?? -Infinity;
      return recentSort.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [recentTransactions, recentSort]);

  const sortedClusterBuying = useMemo(() => {
    if (!Array.isArray(clusterBuying)) {
      return [];
    }
    return [...clusterBuying].sort((a, b) => {
      const aVal = a[clusterSort.key] ?? -Infinity;
      const bVal = b[clusterSort.key] ?? -Infinity;
      return clusterSort.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [clusterBuying, clusterSort]);

  const sortedCongressionalTrades = useMemo(() => {
    if (!Array.isArray(congressionalTrades)) {
      return [];
    }
    return [...congressionalTrades].sort((a, b) => {
      const aVal = a[congressSort.key] ?? -Infinity;
      const bVal = b[congressSort.key] ?? -Infinity;
      return congressSort.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [congressionalTrades, congressSort]);

  // Load initial data
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [topBuyingRes, statsRes, updateStatusRes] = await Promise.all([
        insidersAPI.getTopBuying(20, period),
        insidersAPI.getStats(),
        insidersAPI.getUpdateStatus()
      ]);

      const companies = topBuyingRes.data.companies || [];
      setTopBuying(companies);
      setStats(statsRes.data.yearToDate || null);
      setMonthlyTrend(statsRes.data.monthlyTrend || []);
      setUpdateStatus(updateStatusRes.data || null);

      // Load prices
      const newPrices = { ...priceData };
      await Promise.all(
        companies.filter(c => !newPrices[c.symbol]).slice(0, 20).map(async (company) => {
          try {
            const res = await pricesAPI.getMetrics(company.symbol);
            if (res?.data?.data) {
              newPrices[company.symbol] = res.data.data;
            }
          } catch (e) {
            // Ignore
          }
        })
      );
      setPriceData(newPrices);
      setLoadedTabs(prev => ({ ...prev, overview: true }));
    } catch (err) {
      console.error('Error loading insider data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load signals - with caching
  const loadSignals = useCallback(async (forceRefresh = false) => {
    if (loadedTabs.signals && !forceRefresh) return; // Skip if already loaded
    setLoading(true);
    try {
      const res = await insidersAPI.getSignals(period, 'all');
      setSignals(res.data.signals || { bullish: [], bearish: [], neutral: [] });
      setLoadedTabs(prev => ({ ...prev, signals: true }));
    } catch (err) {
      console.error('Error loading signals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period, loadedTabs.signals]);

  // Load recent transactions - with caching
  const loadRecent = useCallback(async (forceRefresh = false) => {
    if (loadedTabs.recent && !forceRefresh) return; // Skip if already loaded
    setLoading(true);
    try {
      const res = await insidersAPI.getRecent(100, transactionType);
      setRecentTransactions(res.data.transactions || []);
      setLoadedTabs(prev => ({ ...prev, recent: true }));
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transactionType, loadedTabs.recent]);

  // Load cluster buying - with caching
  const loadClusterBuying = useCallback(async (forceRefresh = false) => {
    if (loadedTabs.cluster && !forceRefresh) return; // Skip if already loaded
    setLoading(true);
    try {
      const res = await insidersAPI.getClusterBuying(minInsiders, clusterDays);
      setClusterBuying(res.data.clusters || []);
      setLoadedTabs(prev => ({ ...prev, cluster: true }));
    } catch (err) {
      console.error('Error loading cluster data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minInsiders, clusterDays, loadedTabs.cluster]);

  // Load congressional trading data - with caching
  const loadCongressional = useCallback(async (forceRefresh = false) => {
    if (loadedTabs.congressional && !forceRefresh) return; // Skip if already loaded
    setLoading(true);
    try {
      const res = await altDataAPI.getTopCongressBuys(congressPeriod, 30);
      setCongressionalTrades(res.data.results || []);
      setLoadedTabs(prev => ({ ...prev, congressional: true }));
    } catch (err) {
      console.error('Error loading congressional data:', err);
      // Don't set error - congressional data may not be available
      setCongressionalTrades([]);
    } finally {
      setLoading(false);
    }
  }, [congressPeriod, loadedTabs.congressional]);

  // Reset cache when filter/period changes require fresh data
  useEffect(() => {
    setLoadedTabs({ overview: false, signals: false, recent: false, cluster: false, congressional: false });
  }, [period]);

  // Effect for view mode changes - now uses caching
  useEffect(() => {
    if (viewMode === 'signals') {
      loadSignals();
    } else if (viewMode === 'recent') {
      loadRecent();
    } else if (viewMode === 'cluster') {
      loadClusterBuying();
    } else if (viewMode === 'congressional') {
      loadCongressional();
    }
  }, [viewMode, loadSignals, loadRecent, loadClusterBuying, loadCongressional]);

  // Check if stats are all zeros (no data)
  const hasNoData = stats && (
    (stats.total_transactions || 0) === 0 &&
    (stats.buy_count || 0) === 0 &&
    (stats.sell_count || 0) === 0 &&
    (stats.active_insiders || 0) === 0
  );

  // Overview view
  const renderOverview = () => (
    <div className="overview-content">
      {stats && (
        <>
          {hasNoData && (
            <div className="card" style={{ 
              padding: 'var(--space-8)', 
              textAlign: 'center',
              marginBottom: 'var(--space-6)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)'
            }}>
              <div style={{ 
                fontSize: 'var(--text-2xl)', 
                marginBottom: 'var(--space-3)',
                opacity: 0.5
              }}>
                📊
              </div>
              <h3 style={{ 
                fontSize: 'var(--text-lg)', 
                color: 'var(--text-primary)',
                marginBottom: 'var(--space-2)' 
              }}>
                No Insider Data Available
              </h3>
              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: 'var(--text-sm)',
                maxWidth: '600px',
                margin: '0 auto'
              }}>
                Insider trading data has not been loaded yet. Use the "Update Data" button to fetch the latest insider transactions.
              </p>
            </div>
          )}
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
        </>
      )}

      {monthlyTrend.length > 0 && (
        <div className="card chart-card">
          <h3>Monthly Insider Activity (TTM)</h3>
          <SectionErrorBoundary section="Monthly Trend Chart">
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
                <Bar dataKey="buy_value" name="Buy Value" fill="#059669" />
                <Bar dataKey="sell_value" name="Sell Value" fill="#DC2626" />
              </BarChart>
            </ResponsiveContainer>
          </SectionErrorBoundary>
        </div>
      )}

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
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Price</th>
                <th>1M</th>
                <th>Signal</th>
                <SortableHeader label="Buy Value" sortKey="buy_value" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <SortableHeader label="Buyers" sortKey="unique_buyers" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <SortableHeader label="Net Value" sortKey="net_value" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTopBuying.length === 0 ? (
                <tr><td colSpan="9" className="no-data">No insider buying data available</td></tr>
              ) : (
                sortedTopBuying.map((company) => (
                  <TopBuyingRow
                    key={company.company_id || company.symbol}
                    company={company}
                    priceData={priceData}
                    formatCurrency={formatCurrency}
                  />
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
        <div className="signal-column">
          <h3 className="column-title bullish-title">Bullish Signals</h3>
          {signals.bullish?.slice(0, 15).map((item) => (
            <SignalItem key={item.company_id} item={item} signal="bullish" />
          ))}
          {(!signals.bullish || signals.bullish.length === 0) && (
            <div className="no-signals">No bullish signals</div>
          )}
        </div>

        <div className="signal-column">
          <h3 className="column-title neutral-title">Neutral Signals</h3>
          {signals.neutral?.slice(0, 15).map((item) => (
            <SignalItem key={item.company_id} item={item} signal="neutral" />
          ))}
          {(!signals.neutral || signals.neutral.length === 0) && (
            <div className="no-signals">No neutral signals</div>
          )}
        </div>

        <div className="signal-column">
          <h3 className="column-title bearish-title">Bearish Signals</h3>
          {signals.bearish?.slice(0, 15).map((item) => (
            <SignalItem key={item.company_id} item={item} signal="bearish" />
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
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <SortableHeader label="Date" sortKey="transaction_date" currentSort={recentSort} onSort={handleSort(setRecentSort)} />
              <th>Symbol</th>
              <th>Insider</th>
              <th>Title</th>
              <th>Type</th>
              <SortableHeader label="Shares" sortKey="shares_transacted" currentSort={recentSort} onSort={handleSort(setRecentSort)} />
              <SortableHeader label="Price" sortKey="price_per_share" currentSort={recentSort} onSort={handleSort(setRecentSort)} />
              <SortableHeader label="Value" sortKey="total_value" currentSort={recentSort} onSort={handleSort(setRecentSort)} />
            </tr>
          </thead>
          <tbody>
            {sortedRecentTransactions.length === 0 ? (
              <tr><td colSpan="8" className="no-data">No transactions found</td></tr>
            ) : (
              sortedRecentTransactions.map((tx, idx) => (
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
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Sector</th>
              <SortableHeader label="Unique Buyers" sortKey="unique_buyers" currentSort={clusterSort} onSort={handleSort(setClusterSort)} />
              <SortableHeader label="Total Value" sortKey="total_buy_value" currentSort={clusterSort} onSort={handleSort(setClusterSort)} />
              <SortableHeader label="Total Shares" sortKey="total_shares" currentSort={clusterSort} onSort={handleSort(setClusterSort)} />
              <th>Buyers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedClusterBuying.length === 0 ? (
              <tr><td colSpan="8" className="no-data">No cluster buying detected</td></tr>
            ) : (
              sortedClusterBuying.map((cluster) => (
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

  // Congressional trading view
  const renderCongressional = () => (
    <div className="congressional-content">
      <div className="filter-bar">
        <label>Lookback Period:</label>
        <select value={congressPeriod} onChange={(e) => setCongressPeriod(e.target.value)}>
          <option value="-7 days">7 Days</option>
          <option value="-30 days">30 Days</option>
          <option value="-90 days">90 Days</option>
          <option value="-180 days">180 Days</option>
          <option value="-365 days">1 Year</option>
        </select>
        <button onClick={loadCongressional} className="btn-refresh">Refresh</button>
      </div>

      <div className="info-banner">
        <Landmark size={16} />
        <span>Congressional stock trades from publicly disclosed financial reports (STOCK Act filings)</span>
      </div>

      <div className="table-container">
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Politicians</th>
              <SortableHeader label="Buys" sortKey="buy_count" currentSort={congressSort} onSort={handleSort(setCongressSort)} />
              <SortableHeader label="Sells" sortKey="sell_count" currentSort={congressSort} onSort={handleSort(setCongressSort)} />
              <SortableHeader label="Total Value" sortKey="total_amount" currentSort={congressSort} onSort={handleSort(setCongressSort)} />
              <th>Last Trade</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCongressionalTrades.length === 0 ? (
              <tr><td colSpan="8" className="no-data">No congressional trading data available</td></tr>
            ) : (
              sortedCongressionalTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${idx}`}>
                  <td>
                    <Link to={`/company/${trade.symbol}`} className="symbol-link">
                      {trade.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{trade.company_name || trade.symbol}</td>
                  <td className="politicians-cell" title={trade.politicians}>
                    {trade.politicians ? (
                      trade.politicians.split(',').slice(0, 2).join(', ') +
                      (trade.politicians.split(',').length > 2 ? ` +${trade.politicians.split(',').length - 2}` : '')
                    ) : '-'}
                  </td>
                  <td className="positive">{trade.buy_count || 0}</td>
                  <td className="negative">{trade.sell_count || 0}</td>
                  <td>{formatCurrency(trade.total_amount || trade.total_value || 0)}</td>
                  <td>{formatDate(trade.latest_trade || trade.last_trade_date)}</td>
                  <td>
                    <WatchlistButton symbol={trade.symbol} compact />
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

  if (loading && !stats) {
    return (
      <div className="insider-page">
        <SkeletonInsiderTrading />
      </div>
    );
  }

  return (
    <div className="insider-page">
      {updateStatus?.lastImport && (
        <div className="last-refreshed-bar">
          <Clock size={12} /> Updated {formatDate(updateStatus.lastImport)}
        </div>
      )}

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
        <button
          className={viewMode === 'congressional' ? 'active' : ''}
          onClick={() => setViewMode('congressional')}
        >
          <Landmark size={14} /> Congressional
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Loading insider data...</span>
        </div>
      )}

      <div className="page-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'signals' && renderSignals()}
        {viewMode === 'recent' && renderRecent()}
        {viewMode === 'cluster' && renderCluster()}
        {viewMode === 'congressional' && renderCongressional()}
      </div>
    </div>
  );
}

export default InsidersTab;
