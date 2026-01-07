// frontend/src/pages/CapitalAllocationPage.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { capitalAPI, earningsAPI, pricesAPI } from '../services/api';
import { WatchlistButton } from '../components';
import { PageHeader } from '../components/ui';
import { SkeletonCapitalAllocation } from '../components/Skeleton';
import { SectionErrorBoundary } from '../components/ErrorBoundary';
import './CapitalAllocationPage.css';

// Format currency values
const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '-';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(2)}`;
};

// Format percentage
const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value.toFixed(2)}%`;
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

// Format market cap
const formatMarketCap = (value) => {
  if (!value || isNaN(value)) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
};

// Event type badge
const EventBadge = ({ type }) => {
  const config = {
    buyback_announcement: { label: 'Buyback', class: 'event-buyback' },
    dividend_increase: { label: 'Div Increase', class: 'event-div-increase' },
    dividend_decrease: { label: 'Div Cut', class: 'event-div-decrease' },
    dividend_initiation: { label: 'Div Initiation', class: 'event-div-initiation' }
  }[type] || { label: type, class: 'event-other' };

  return (
    <span className={`event-badge ${config.class}`}>
      {config.label}
    </span>
  );
};

// Generic sortable table header component
const SortableHeader = ({ label, sortKey, currentSort, onSort, align = 'left' }) => {
  const isActive = currentSort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`sortable ${isActive ? 'sorted' : ''}`}
      style={{ textAlign: align }}
    >
      {label}
      {isActive && <span className="sort-arrow">{currentSort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
    </th>
  );
};

// Generic sort function
const sortData = (data, sortConfig) => {
  if (!sortConfig.key) return data;

  return [...data].sort((a, b) => {
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];

    // Handle null/undefined
    if (aVal === null || aVal === undefined) aVal = sortConfig.dir === 'asc' ? Infinity : -Infinity;
    if (bVal === null || bVal === undefined) bVal = sortConfig.dir === 'asc' ? Infinity : -Infinity;

    // Handle strings
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.dir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    // Handle numbers
    return sortConfig.dir === 'asc' ? aVal - bVal : bVal - aVal;
  });
};

function CapitalAllocationPage() {
  // View mode
  const [viewMode, setViewMode] = useState('overview');

  // Data states
  const [topYield, setTopYield] = useState([]);
  const [topBuybacks, setTopBuybacks] = useState([]);
  const [topDividendYielders, setTopDividendYielders] = useState([]);
  const [dividendGrowthLeaders, setDividendGrowthLeaders] = useState([]);
  const [aristocrats, setAristocrats] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [dividendCalendar, setDividendCalendar] = useState({ list: [], byDate: {} });
  const [earningsCalendar, setEarningsCalendar] = useState({ data: [], byDay: {} });
  const [calendarTab, setCalendarTab] = useState('combined');
  const [sectorComparison, setSectorComparison] = useState([]);
  const [dividendsBySector, setDividendsBySector] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [priceMetrics, setPriceMetrics] = useState({});

  // Filters
  const [minYears, setMinYears] = useState(5);
  const [calendarDays, setCalendarDays] = useState(30);
  const [growthPeriod, setGrowthPeriod] = useState('5y');

  // Sorting state for each table
  const [overviewSort, setOverviewSort] = useState({ key: 'total_shareholder_return', dir: 'desc' });
  const [yieldersSort, setYieldersSort] = useState({ key: 'dividend_yield', dir: 'desc' });
  const [growthSort, setGrowthSort] = useState({ key: 'growth_rate', dir: 'desc' });
  const [aristocratsSort, setAristocratSort] = useState({ key: 'years_of_growth', dir: 'desc' });
  const [buybacksSort, setBuybacksSort] = useState({ key: 'buybacks_executed', dir: 'desc' });
  const [sectorSort, setSectorSort] = useState({ key: 'avg_total_return', dir: 'desc' });
  const [divSectorSort, setDivSectorSort] = useState({ key: 'avg_yield', dir: 'desc' });
  const [eventsSort, setEventsSort] = useState({ key: 'event_date', dir: 'desc' });

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sort helper
  const handleSort = (setter) => (key) => {
    setter(prev => ({
      key,
      dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc'
    }));
  };

  // Sorted data using generic sort function
  const sortedTopYield = useMemo(() => sortData(topYield, overviewSort), [topYield, overviewSort]);
  const sortedYielders = useMemo(() => sortData(topDividendYielders, yieldersSort), [topDividendYielders, yieldersSort]);
  const sortedGrowthLeaders = useMemo(() => sortData(dividendGrowthLeaders, growthSort), [dividendGrowthLeaders, growthSort]);
  const sortedAristocrats = useMemo(() => sortData(aristocrats, aristocratsSort), [aristocrats, aristocratsSort]);
  const sortedBuybacks = useMemo(() => sortData(topBuybacks, buybacksSort), [topBuybacks, buybacksSort]);
  const sortedSectorComparison = useMemo(() => sortData(sectorComparison, sectorSort), [sectorComparison, sectorSort]);
  const sortedDivBySector = useMemo(() => sortData(dividendsBySector, divSectorSort), [dividendsBySector, divSectorSort]);
  const sortedEvents = useMemo(() => sortData(recentEvents, eventsSort), [recentEvents, eventsSort]);

  // Load price metrics for a list of symbols
  const loadPriceMetrics = async (symbols) => {
    const newMetrics = { ...priceMetrics };
    const toFetch = symbols.filter(s => !newMetrics[s]);

    await Promise.all(
      toFetch.slice(0, 20).map(async (symbol) => {
        try {
          const res = await pricesAPI.getMetrics(symbol);
          if (res.data) {
            newMetrics[symbol] = res.data;
          }
        } catch (err) {
          // Silently fail for individual stocks
        }
      })
    );

    setPriceMetrics(newMetrics);
  };

  // Load initial data
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [topYieldRes, topBuybacksRes, statsRes, sectorRes, divSectorRes] = await Promise.all([
        capitalAPI.getTopYield(20),
        capitalAPI.getTopBuybacks(20),
        capitalAPI.getStats(),
        capitalAPI.getSectorComparison(),
        capitalAPI.getDividendsBySector()
      ]);

      const yieldCompanies = topYieldRes.data.companies || [];
      const buybackCompanies = topBuybacksRes.data.companies || [];

      setTopYield(yieldCompanies);
      setTopBuybacks(buybackCompanies);
      setStats(statsRes.data || null);
      setSectorComparison(sectorRes.data.sectors || []);
      setDividendsBySector(divSectorRes.data.sectors || []);

      // Load price metrics for top companies
      const allSymbols = [...new Set([
        ...yieldCompanies.map(c => c.symbol),
        ...buybackCompanies.map(c => c.symbol)
      ])];
      loadPriceMetrics(allSymbols);

      // Extract latest fiscal year from data for "last updated"
      const latestYear = yieldCompanies[0]?.fiscal_quarter?.substring(0, 4);
      if (latestYear) {
        setLastUpdated(`FY ${latestYear}`);
      }
    } catch (err) {
      console.error('Error loading capital data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load dividend yielders
  const loadDividendYielders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getTopDividendYielders({ limit: 50 });
      const companies = res.data.companies || [];
      setTopDividendYielders(companies);
      loadPriceMetrics(companies.map(c => c.symbol));
    } catch (err) {
      console.error('Error loading dividend yielders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load dividend growth leaders
  const loadGrowthLeaders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getDividendGrowthLeaders(growthPeriod, 50);
      const companies = res.data.companies || [];
      setDividendGrowthLeaders(companies);
      loadPriceMetrics(companies.map(c => c.symbol));
    } catch (err) {
      console.error('Error loading growth leaders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthPeriod]);

  // Load dividend aristocrats
  const loadAristocrats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getDividendAristocrats(minYears);
      const companies = res.data.companies || [];
      setAristocrats(companies);
      loadPriceMetrics(companies.map(c => c.symbol));
    } catch (err) {
      console.error('Error loading aristocrats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minYears]);

  // Load recent events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getRecentEvents(100);
      setRecentEvents(res.data.events || []);
    } catch (err) {
      console.error('Error loading events:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load dividend and earnings calendar
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const [divRes, earnRes] = await Promise.all([
        capitalAPI.getDividendCalendar(calendarDays),
        earningsAPI.getWeek(null, 100).catch(() => ({ data: { data: [], byDay: {} } }))
      ]);
      setDividendCalendar(divRes.data || { list: [], byDate: {} });
      setEarningsCalendar(earnRes.data || { data: [], byDay: {} });
    } catch (err) {
      console.error('Error loading calendar:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [calendarDays]);

  // Effect for view mode changes
  useEffect(() => {
    if (viewMode === 'dividends') {
      loadAristocrats();
    } else if (viewMode === 'yielders') {
      loadDividendYielders();
    } else if (viewMode === 'growth') {
      loadGrowthLeaders();
    } else if (viewMode === 'events') {
      loadEvents();
    } else if (viewMode === 'calendar') {
      loadCalendar();
    }
  }, [viewMode, loadAristocrats, loadDividendYielders, loadGrowthLeaders, loadEvents, loadCalendar]);

  // Overview view
  const renderOverview = () => (
    <div className="overview-content">
      {/* Stats cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{(stats.dividends?.total_dividend_payers || 0).toLocaleString()}</span>
            <span className="stat-label">Dividend Payers</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatPercent(stats.dividends?.avg_yield)}</span>
            <span className="stat-label">Avg Dividend Yield</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{(stats.buybacks?.companies_with_programs || 0).toLocaleString()}</span>
            <span className="stat-label">Companies with Buybacks</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-value">{formatCurrency(stats.buybacks?.total_spent)}</span>
            <span className="stat-label">Total Buybacks</span>
          </div>
        </div>
      )}

      {/* Top dividend yielders from stats */}
      {stats?.topDividendYielders?.length > 0 && (
        <div className="card">
          <h3>Top Dividend Yielders</h3>
          <div className="quick-list">
            {stats.topDividendYielders.map((c) => (
              <div key={c.symbol} className="quick-item">
                <Link to={`/company/${c.symbol}`} className="symbol-link">{c.symbol}</Link>
                <span className="yield-value">{formatPercent(c.dividend_yield)}</span>
                {c.years_of_growth > 0 && <span className="years-badge">{c.years_of_growth}yr</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dividend stats by sector chart */}
      {dividendsBySector.length > 0 && (
        <div className="card chart-card">
          <h3>Average Dividend Yield by Sector</h3>
          <SectionErrorBoundary section="Dividend Yield by Sector Chart">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dividendsBySector.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis type="category" dataKey="sector" width={150} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                  formatter={(value) => `${value?.toFixed(2)}%`}
                />
                <Bar dataKey="avg_yield" name="Avg Yield" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </SectionErrorBoundary>
        </div>
      )}

      {/* Top shareholder return table */}
      <div className="card">
        <h3>Top Shareholder Return (Dividends + Buybacks)</h3>
        <div className="table-container">
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <SortableHeader label="Symbol" sortKey="symbol" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <SortableHeader label="Company" sortKey="name" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <SortableHeader label="Sector" sortKey="sector" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} />
                <SortableHeader label="Total Return" sortKey="total_shareholder_return" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} align="right" />
                <SortableHeader label="Dividends" sortKey="dividends_paid" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} align="right" />
                <SortableHeader label="Buybacks" sortKey="buybacks_executed" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} align="right" />
                <SortableHeader label="Div % FCF" sortKey="dividend_pct_of_fcf" currentSort={overviewSort} onSort={handleSort(setOverviewSort)} align="right" />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTopYield.length === 0 ? (
                <tr><td colSpan="8" className="no-data">No data available</td></tr>
              ) : (
                sortedTopYield.map((company) => (
                  <tr key={company.id || company.symbol}>
                    <td>
                      <Link to={`/company/${company.symbol}`} className="symbol-link">
                        {company.symbol}
                      </Link>
                    </td>
                    <td className="company-name">{company.name}</td>
                    <td>{company.sector || '-'}</td>
                    <td className="highlight" style={{ textAlign: 'right' }}>{formatCurrency(company.total_shareholder_return)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(company.dividends_paid)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(company.buybacks_executed)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPercent(company.dividend_pct_of_fcf)}</td>
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

      {/* Sector dividend comparison table */}
      <div className="card">
        <h3>Dividend Statistics by Sector</h3>
        <div className="table-container">
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <SortableHeader label="Sector" sortKey="sector" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} />
                <SortableHeader label="Companies" sortKey="company_count" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} align="right" />
                <SortableHeader label="Avg Yield" sortKey="avg_yield" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} align="right" />
                <SortableHeader label="Avg 5Y Growth" sortKey="avg_5y_growth" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} align="right" />
                <SortableHeader label="Avg Years" sortKey="avg_years_growth" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} align="right" />
                <SortableHeader label="Aristocrats" sortKey="aristocrats" currentSort={divSectorSort} onSort={handleSort(setDivSectorSort)} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedDivBySector.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No sector data available</td></tr>
              ) : (
                sortedDivBySector.map((sector) => (
                  <tr key={sector.sector}>
                    <td className="sector-name">{sector.sector}</td>
                    <td style={{ textAlign: 'right' }}>{sector.company_count}</td>
                    <td className="highlight" style={{ textAlign: 'right' }}>{formatPercent(sector.avg_yield)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPercent(sector.avg_5y_growth)}</td>
                    <td style={{ textAlign: 'right' }}>{sector.avg_years_growth?.toFixed(1) || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{sector.aristocrats || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Top Dividend Yielders view
  const renderYielders = () => (
    <div className="yielders-content">
      <div className="view-description">
        <p>Stocks with the highest dividend yields. Higher yields may indicate value opportunities or distressed companies - always check fundamentals.</p>
      </div>

      <div className="table-container">
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <SortableHeader label="Symbol" sortKey="symbol" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} />
              <SortableHeader label="Company" sortKey="name" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} />
              <SortableHeader label="Sector" sortKey="sector" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} />
              <SortableHeader label="Market Cap" sortKey="market_cap" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} align="right" />
              <SortableHeader label="Yield" sortKey="dividend_yield" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} align="right" />
              <SortableHeader label="Annual Div" sortKey="current_annual_dividend" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} align="right" />
              <SortableHeader label="5Y Growth" sortKey="dividend_growth_5y" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} align="right" />
              <SortableHeader label="Years" sortKey="years_of_growth" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} align="right" />
              <SortableHeader label="Ex-Date" sortKey="ex_dividend_date" currentSort={yieldersSort} onSort={handleSort(setYieldersSort)} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedYielders.length === 0 ? (
              <tr><td colSpan="10" className="no-data">No dividend data available</td></tr>
            ) : (
              sortedYielders.map((company) => (
                <tr key={company.id || company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td>{company.sector || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{formatMarketCap(company.market_cap)}</td>
                  <td className="highlight" style={{ textAlign: 'right' }}>{formatPercent(company.dividend_yield)}</td>
                  <td style={{ textAlign: 'right' }}>${company.current_annual_dividend?.toFixed(2) || '-'}</td>
                  <td style={{ textAlign: 'right' }} className={company.dividend_growth_5y > 0 ? 'positive' : company.dividend_growth_5y < 0 ? 'negative' : ''}>
                    {formatPercent(company.dividend_growth_5y)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {company.years_of_growth > 0 && <span className="streak-badge">{company.years_of_growth}</span>}
                    {!company.years_of_growth && '-'}
                  </td>
                  <td>{company.ex_dividend_date || '-'}</td>
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
  );

  // Dividend Growth Leaders view
  const renderGrowthLeaders = () => (
    <div className="growth-content">
      <div className="filter-bar">
        <label>Growth Period:</label>
        <select value={growthPeriod} onChange={(e) => setGrowthPeriod(e.target.value)}>
          <option value="1y">1 Year</option>
          <option value="3y">3 Year</option>
          <option value="5y">5 Year</option>
          <option value="10y">10 Year</option>
        </select>
        <button onClick={loadGrowthLeaders} className="btn-refresh">Refresh</button>
      </div>

      <div className="view-description">
        <p>Companies with the highest dividend growth rates over {growthPeriod}. Consistent dividend growth often indicates financial health and shareholder-friendly management.</p>
      </div>

      <div className="table-container">
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <SortableHeader label="Symbol" sortKey="symbol" currentSort={growthSort} onSort={handleSort(setGrowthSort)} />
              <SortableHeader label="Company" sortKey="name" currentSort={growthSort} onSort={handleSort(setGrowthSort)} />
              <SortableHeader label="Sector" sortKey="sector" currentSort={growthSort} onSort={handleSort(setGrowthSort)} />
              <SortableHeader label="Market Cap" sortKey="market_cap" currentSort={growthSort} onSort={handleSort(setGrowthSort)} align="right" />
              <SortableHeader label={`${growthPeriod} Growth`} sortKey="growth_rate" currentSort={growthSort} onSort={handleSort(setGrowthSort)} align="right" />
              <SortableHeader label="Yield" sortKey="dividend_yield" currentSort={growthSort} onSort={handleSort(setGrowthSort)} align="right" />
              <SortableHeader label="Years" sortKey="years_of_growth" currentSort={growthSort} onSort={handleSort(setGrowthSort)} align="right" />
              <SortableHeader label="Annual Div" sortKey="current_annual_dividend" currentSort={growthSort} onSort={handleSort(setGrowthSort)} align="right" />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedGrowthLeaders.length === 0 ? (
              <tr><td colSpan="9" className="no-data">No growth data available</td></tr>
            ) : (
              sortedGrowthLeaders.map((company) => (
                <tr key={company.id || company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td>{company.sector || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{formatMarketCap(company.market_cap)}</td>
                  <td className="highlight positive" style={{ textAlign: 'right' }}>{formatPercent(company.growth_rate)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(company.dividend_yield)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {company.years_of_growth > 0 && <span className="streak-badge">{company.years_of_growth}</span>}
                    {!company.years_of_growth && '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>${company.current_annual_dividend?.toFixed(2) || '-'}</td>
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
  );

  // Dividend Aristocrats view
  const renderDividends = () => (
    <div className="dividends-content">
      <div className="filter-bar">
        <label>Minimum Years of Dividend Growth:</label>
        <select value={minYears} onChange={(e) => setMinYears(parseInt(e.target.value))}>
          {[3, 5, 7, 10, 15, 20, 25].map(y => (
            <option key={y} value={y}>{y}+ years</option>
          ))}
        </select>
        <button onClick={loadAristocrats} className="btn-refresh">Search</button>
      </div>

      <div className="aristocrats-info">
        <p>
          Found <strong>{aristocrats.length}</strong> companies with {minYears}+ years of consecutive dividend increases.
          {minYears >= 25 && ' (True Dividend Aristocrats)'}
        </p>
      </div>

      <div className="table-container">
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <SortableHeader label="Symbol" sortKey="symbol" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} />
              <SortableHeader label="Company" sortKey="name" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} />
              <SortableHeader label="Sector" sortKey="sector" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} />
              <SortableHeader label="Market Cap" sortKey="market_cap" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} align="right" />
              <SortableHeader label="Years" sortKey="years_of_growth" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} align="right" />
              <SortableHeader label="Yield" sortKey="dividend_yield" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} align="right" />
              <SortableHeader label="5Y Growth" sortKey="dividend_growth_5y" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} align="right" />
              <SortableHeader label="Annual Div" sortKey="current_annual_dividend" currentSort={aristocratsSort} onSort={handleSort(setAristocratSort)} align="right" />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAristocrats.length === 0 ? (
              <tr><td colSpan="9" className="no-data">No dividend aristocrats found</td></tr>
            ) : (
              sortedAristocrats.map((company) => (
                <tr key={company.id || company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td>{company.sector || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{formatMarketCap(company.market_cap)}</td>
                  <td className="highlight" style={{ textAlign: 'right' }}>
                    <span className="streak-badge">{company.years_of_growth || company.consecutive_increases}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(company.dividend_yield)}</td>
                  <td style={{ textAlign: 'right' }} className={company.dividend_growth_5y > 0 ? 'positive' : ''}>
                    {formatPercent(company.dividend_growth_5y)}
                  </td>
                  <td style={{ textAlign: 'right' }}>${company.current_annual_dividend?.toFixed(2) || company.avg_annual_dividend?.toFixed(2) || '-'}</td>
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
  );

  // Events view
  const renderEvents = () => (
    <div className="events-content">
      <div className="card">
        <h3>Recent Capital Allocation Events</h3>
        <div className="table-container">
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <SortableHeader label="Date" sortKey="event_date" currentSort={eventsSort} onSort={handleSort(setEventsSort)} />
                <SortableHeader label="Symbol" sortKey="symbol" currentSort={eventsSort} onSort={handleSort(setEventsSort)} />
                <SortableHeader label="Company" sortKey="company_name" currentSort={eventsSort} onSort={handleSort(setEventsSort)} />
                <th>Event</th>
                <th>Headline</th>
                <SortableHeader label="Value" sortKey="value" currentSort={eventsSort} onSort={handleSort(setEventsSort)} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedEvents.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No recent events</td></tr>
              ) : (
                sortedEvents.map((event, idx) => (
                  <tr key={event.id || idx}>
                    <td>{formatDate(event.event_date)}</td>
                    <td>
                      <Link to={`/company/${event.symbol}`} className="symbol-link">
                        {event.symbol}
                      </Link>
                    </td>
                    <td className="company-name">{event.company_name}</td>
                    <td><EventBadge type={event.event_type} /></td>
                    <td className="headline">{event.headline}</td>
                    <td style={{ textAlign: 'right' }}>{event.value_formatted || formatCurrency(event.value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Calendar view
  const renderCalendar = () => {
    const divDates = Object.keys(dividendCalendar.byDate || {});
    const earningsData = earningsCalendar.data || [];
    const earningsByDate = {};
    earningsData.forEach(e => {
      if (e.date) {
        const dateKey = e.date.split('T')[0];
        if (!earningsByDate[dateKey]) earningsByDate[dateKey] = [];
        earningsByDate[dateKey].push(e);
      }
    });
    const earnDates = Object.keys(earningsByDate);
    const allDates = [...new Set([...divDates, ...earnDates])].sort();

    const filteredDates = allDates.filter(date => {
      if (calendarTab === 'dividends') return divDates.includes(date);
      if (calendarTab === 'earnings') return earnDates.includes(date);
      return true;
    });

    const divCount = dividendCalendar.count || 0;
    const earnCount = earningsData.length || 0;

    return (
      <div className="calendar-content">
        <div className="calendar-tabs">
          <button className={`calendar-tab ${calendarTab === 'combined' ? 'active' : ''}`} onClick={() => setCalendarTab('combined')}>
            All Events
          </button>
          <button className={`calendar-tab ${calendarTab === 'dividends' ? 'active' : ''}`} onClick={() => setCalendarTab('dividends')}>
            Dividends ({divCount})
          </button>
          <button className={`calendar-tab ${calendarTab === 'earnings' ? 'active' : ''}`} onClick={() => setCalendarTab('earnings')}>
            Earnings ({earnCount})
          </button>
        </div>

        <div className="filter-bar">
          <label>Days Ahead:</label>
          <select value={calendarDays} onChange={(e) => setCalendarDays(parseInt(e.target.value))}>
            {[7, 14, 30, 60, 90].map(d => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
          <button onClick={loadCalendar} className="btn-refresh">Refresh</button>
        </div>

        {filteredDates.length === 0 ? (
          <div className="no-data-card">
            <p>No upcoming {calendarTab === 'dividends' ? 'dividend ex-dates' : calendarTab === 'earnings' ? 'earnings announcements' : 'events'} found in the next {calendarDays} days.</p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
              {calendarTab === 'dividends'
                ? 'Dividend data is fetched from company filings. Try increasing the days ahead or run a data update.'
                : calendarTab === 'earnings'
                ? 'Earnings calendar data may need to be refreshed. Check the Updates page for data sync status.'
                : 'Calendar data shows dividend ex-dates and earnings announcements. Try refreshing or increasing the time range.'}
            </p>
          </div>
        ) : (
          <div className="calendar-grid">
            {filteredDates.map(date => (
              <div key={date} className="calendar-day">
                <div className="day-header">
                  {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                <div className="day-items">
                  {(calendarTab === 'combined' || calendarTab === 'earnings') &&
                    (earningsByDate[date] || []).map((earn, idx) => (
                    <div key={`earn-${idx}`} className="calendar-item earnings-item">
                      <span className="item-type-badge earnings-badge">E</span>
                      <Link to={`/company/${earn.symbol}`} className="symbol-link">{earn.symbol}</Link>
                    </div>
                  ))}
                  {(calendarTab === 'combined' || calendarTab === 'dividends') &&
                    (dividendCalendar.byDate[date] || []).map((div, idx) => (
                    <div key={`div-${idx}`} className="calendar-item dividend-item">
                      <span className="item-type-badge dividend-badge">D</span>
                      <Link to={`/company/${div.symbol}`} className="symbol-link">{div.symbol}</Link>
                      <span className="dividend-yield">{formatPercent(div.dividend_yield)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Buybacks view
  const renderBuybacks = () => (
    <div className="buybacks-content">
      <div className="card">
        <h3>Top Buyback Companies (Latest Fiscal Year)</h3>
        <div className="table-container">
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <SortableHeader label="Symbol" sortKey="symbol" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} />
                <SortableHeader label="Company" sortKey="name" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} />
                <SortableHeader label="Sector" sortKey="sector" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} />
                <SortableHeader label="Buybacks" sortKey="buybacks_executed" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} align="right" />
                <SortableHeader label="% of FCF" sortKey="buyback_pct_of_fcf" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} align="right" />
                <SortableHeader label="Dividends" sortKey="dividends_paid" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} align="right" />
                <SortableHeader label="Total Return" sortKey="total_shareholder_return" currentSort={buybacksSort} onSort={handleSort(setBuybacksSort)} align="right" />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedBuybacks.length === 0 ? (
                <tr><td colSpan="8" className="no-data">No buyback data available</td></tr>
              ) : (
                sortedBuybacks.map((company) => (
                  <tr key={company.id || company.symbol}>
                    <td>
                      <Link to={`/company/${company.symbol}`} className="symbol-link">
                        {company.symbol}
                      </Link>
                    </td>
                    <td className="company-name">{company.name}</td>
                    <td>{company.sector || '-'}</td>
                    <td className="highlight" style={{ textAlign: 'right' }}>{formatCurrency(company.buybacks_executed)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPercent(company.buyback_pct_of_fcf)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(company.dividends_paid)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(company.total_shareholder_return)}</td>
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

      {sectorComparison.length > 0 && (
        <div className="card">
          <h3>Sector Capital Allocation Comparison</h3>
          <div className="table-container">
            <table className="data-table sortable-table">
              <thead>
                <tr>
                  <SortableHeader label="Sector" sortKey="sector" currentSort={sectorSort} onSort={handleSort(setSectorSort)} />
                  <SortableHeader label="Companies" sortKey="company_count" currentSort={sectorSort} onSort={handleSort(setSectorSort)} align="right" />
                  <SortableHeader label="Avg Total Return" sortKey="avg_total_return" currentSort={sectorSort} onSort={handleSort(setSectorSort)} align="right" />
                  <SortableHeader label="Avg Dividend %" sortKey="avg_dividend_pct" currentSort={sectorSort} onSort={handleSort(setSectorSort)} align="right" />
                  <SortableHeader label="Avg Buyback %" sortKey="avg_buyback_pct" currentSort={sectorSort} onSort={handleSort(setSectorSort)} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedSectorComparison.map((sector) => (
                  <tr key={sector.sector}>
                    <td className="sector-name">{sector.sector}</td>
                    <td style={{ textAlign: 'right' }}>{sector.company_count}</td>
                    <td className="highlight" style={{ textAlign: 'right' }}>{formatCurrency(sector.avg_total_return)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPercent(sector.avg_dividend_pct)}</td>
                    <td style={{ textAlign: 'right' }}>{formatPercent(sector.avg_buyback_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="capital-page error-state">
        <div className="error-banner">
          <span>Error loading data: {error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  // Show skeleton on initial load
  if (loading && !stats) {
    return (
      <div className="capital-page">
        <PageHeader
          title="Capital Allocation"
          subtitle="Track dividends, buybacks, and shareholder returns"
        />
        <SkeletonCapitalAllocation />
      </div>
    );
  }

  return (
    <div className="capital-page">
      <PageHeader
        title="Capital Allocation"
        subtitle="Track dividends, buybacks, and shareholder returns"
        actions={
          lastUpdated && (
            <div className="update-info">
              <span className="update-label">Data through</span>
              <span className="update-date">{lastUpdated}</span>
              {stats && (
                <span className="update-stats">
                  {stats.dividends?.total_dividend_payers?.toLocaleString() || 0} dividend payers | {stats.buybacks?.companies_with_programs?.toLocaleString() || 0} buyback companies
                </span>
              )}
            </div>
          )
        }
      />

      {/* View mode tabs */}
      <div className="view-tabs">
        <button className={viewMode === 'overview' ? 'active' : ''} onClick={() => setViewMode('overview')}>
          Overview
        </button>
        <button className={viewMode === 'yielders' ? 'active' : ''} onClick={() => setViewMode('yielders')}>
          Top Yielders
        </button>
        <button className={viewMode === 'growth' ? 'active' : ''} onClick={() => setViewMode('growth')}>
          Div Growth
        </button>
        <button className={viewMode === 'dividends' ? 'active' : ''} onClick={() => setViewMode('dividends')}>
          Aristocrats
        </button>
        <button className={viewMode === 'buybacks' ? 'active' : ''} onClick={() => setViewMode('buybacks')}>
          Buybacks
        </button>
        <button className={viewMode === 'events' ? 'active' : ''} onClick={() => setViewMode('events')}>
          Events
        </button>
        <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>
          Calendar
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Loading capital allocation data...</span>
        </div>
      )}

      {/* Content based on view mode */}
      <div className="page-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'yielders' && renderYielders()}
        {viewMode === 'growth' && renderGrowthLeaders()}
        {viewMode === 'dividends' && renderDividends()}
        {viewMode === 'buybacks' && renderBuybacks()}
        {viewMode === 'events' && renderEvents()}
        {viewMode === 'calendar' && renderCalendar()}
      </div>
    </div>
  );
}

export default CapitalAllocationPage;
