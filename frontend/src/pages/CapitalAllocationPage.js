// frontend/src/pages/CapitalAllocationPage.js
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { capitalAPI } from '../services/api';
import { WatchlistButton } from '../components';
import './CapitalAllocationPage.css';

// Format currency values
const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '-';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

// Format percentage
const formatPercent = (value) => {
  if (!value || isNaN(value)) return '-';
  return `${value.toFixed(1)}%`;
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

// Colors for charts
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

function CapitalAllocationPage() {
  // View mode
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'dividends', 'buybacks', 'events', 'calendar'

  // Data states
  const [topYield, setTopYield] = useState([]);
  const [aristocrats, setAristocrats] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [dividendCalendar, setDividendCalendar] = useState({ list: [], byDate: {} });
  const [sectorComparison, setSectorComparison] = useState([]);
  const [stats, setStats] = useState(null);

  // Filters
  const [minYears, setMinYears] = useState(10);
  const [calendarDays, setCalendarDays] = useState(30);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [topYieldRes, statsRes, sectorRes] = await Promise.all([
        capitalAPI.getTopYield(20),
        capitalAPI.getStats(),
        capitalAPI.getSectorComparison()
      ]);

      setTopYield(topYieldRes.data.companies || []);
      setStats(statsRes.data || null);
      setSectorComparison(sectorRes.data.sectors || []);
    } catch (err) {
      console.error('Error loading capital data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load dividend aristocrats
  const loadAristocrats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getDividendAristocrats(minYears);
      setAristocrats(res.data.companies || []);
    } catch (err) {
      console.error('Error loading aristocrats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  // Load dividend calendar
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await capitalAPI.getDividendCalendar(calendarDays);
      setDividendCalendar(res.data || { list: [], byDate: {} });
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
    } else if (viewMode === 'events') {
      loadEvents();
    } else if (viewMode === 'calendar') {
      loadCalendar();
    }
  }, [viewMode, loadAristocrats, loadEvents, loadCalendar]);

  // Overview view
  const renderOverview = () => (
    <div className="overview-content">
      {/* Stats cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.buybacks?.companies_with_programs || 0}</span>
            <span className="stat-label">Companies with Buybacks</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.buybacks?.active_programs || 0}</span>
            <span className="stat-label">Active Programs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatCurrency(stats.buybacks?.total_authorized)}</span>
            <span className="stat-label">Total Authorized</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.dividends?.dividend_payers || 0}</span>
            <span className="stat-label">Dividend Payers</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-value">{stats.dividends?.max_streak || 0}</span>
            <span className="stat-label">Max Increase Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.topShareholderYield?.length || 0}</span>
            <span className="stat-label">Top Yielders Tracked</span>
          </div>
        </div>
      )}

      {/* Sector comparison chart */}
      {sectorComparison.length > 0 && (
        <div className="card chart-card">
          <h3>Shareholder Yield by Sector</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectorComparison.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis type="category" dataKey="sector" width={120} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                formatter={(value) => `${value?.toFixed(2)}%`}
              />
              <Bar dataKey="avg_shareholder_yield" name="Avg Shareholder Yield" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top shareholder yield table */}
      <div className="card">
        <h3>Top Shareholder Yield</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Shareholder Yield</th>
                <th>Dividend %</th>
                <th>Buyback %</th>
                <th>Total Return</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topYield.length === 0 ? (
                <tr><td colSpan="7" className="no-data">No data available</td></tr>
              ) : (
                topYield.map((company) => (
                  <tr key={company.id || company.symbol}>
                    <td>
                      <Link to={`/company/${company.symbol}`} className="symbol-link">
                        {company.symbol}
                      </Link>
                    </td>
                    <td className="company-name">{company.name}</td>
                    <td className="highlight">{formatPercent(company.shareholder_yield)}</td>
                    <td>{formatPercent(company.dividend_pct_of_fcf)}</td>
                    <td>{formatPercent(company.buyback_pct_of_fcf)}</td>
                    <td>{formatCurrency(company.total_shareholder_return)}</td>
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

  // Dividends view
  const renderDividends = () => (
    <div className="dividends-content">
      <div className="filter-bar">
        <label>Minimum Years of Increases:</label>
        <select value={minYears} onChange={(e) => setMinYears(parseInt(e.target.value))}>
          {[5, 10, 15, 20, 25].map(y => (
            <option key={y} value={y}>{y}+ years</option>
          ))}
        </select>
        <button onClick={loadAristocrats} className="btn-refresh">Search</button>
      </div>

      <div className="aristocrats-info">
        <p>
          Found <strong>{aristocrats.length}</strong> companies with {minYears}+ consecutive years of dividend increases.
        </p>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Consecutive Increases</th>
              <th>Latest Dividend</th>
              <th>Ex-Dividend Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {aristocrats.length === 0 ? (
              <tr><td colSpan="6" className="no-data">No dividend aristocrats found</td></tr>
            ) : (
              aristocrats.map((company) => (
                <tr key={company.id || company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td className="highlight streak">
                    <span className="streak-badge">{company.consecutive_increases} years</span>
                  </td>
                  <td>${company.dividend_amount?.toFixed(4) || '-'}</td>
                  <td>{formatDate(company.ex_dividend_date)}</td>
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Company</th>
                <th>Event</th>
                <th>Headline</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No recent events</td></tr>
              ) : (
                recentEvents.map((event, idx) => (
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
                    <td>{event.value_formatted || formatCurrency(event.value)}</td>
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
    const dates = Object.keys(dividendCalendar.byDate || {}).sort();

    return (
      <div className="calendar-content">
        <div className="filter-bar">
          <label>Days Ahead:</label>
          <select value={calendarDays} onChange={(e) => setCalendarDays(parseInt(e.target.value))}>
            {[7, 14, 30, 60, 90].map(d => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
          <button onClick={loadCalendar} className="btn-refresh">Refresh</button>
        </div>

        <div className="calendar-info">
          <p>
            <strong>{dividendCalendar.count || 0}</strong> upcoming ex-dividend dates in the next {calendarDays} days.
          </p>
        </div>

        {dates.length === 0 ? (
          <div className="no-data-card">No upcoming dividends found</div>
        ) : (
          <div className="calendar-grid">
            {dates.map(date => (
              <div key={date} className="calendar-day">
                <div className="day-header">
                  {new Date(date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                <div className="day-items">
                  {(dividendCalendar.byDate[date] || []).map((div, idx) => (
                    <div key={idx} className="dividend-item">
                      <Link to={`/company/${div.symbol}`} className="symbol-link">
                        {div.symbol}
                      </Link>
                      <span className="dividend-amount">${div.dividend_amount?.toFixed(4)}</span>
                      {div.is_increase ? <span className="increase-badge">↑</span> : null}
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

  // Buybacks view (using sector comparison data)
  const renderBuybacks = () => (
    <div className="buybacks-content">
      {sectorComparison.length > 0 && (
        <div className="card chart-card">
          <h3>Capital Return by Sector</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={sectorComparison.filter(s => s.avg_dividend_pct || s.avg_buyback_pct).slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="sector" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                formatter={(value) => `${value?.toFixed(1)}%`}
              />
              <Legend />
              <Bar dataKey="avg_dividend_pct" name="Avg Dividend %" fill="#10b981" />
              <Bar dataKey="avg_buyback_pct" name="Avg Buyback %" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <h3>Sector Capital Allocation Comparison</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sector</th>
                <th>Companies</th>
                <th>Avg Shareholder Yield</th>
                <th>Avg Dividend %</th>
                <th>Avg Buyback %</th>
                <th>Avg Payout Ratio</th>
              </tr>
            </thead>
            <tbody>
              {sectorComparison.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No sector data available</td></tr>
              ) : (
                sectorComparison.map((sector) => (
                  <tr key={sector.sector}>
                    <td className="sector-name">{sector.sector}</td>
                    <td>{sector.company_count}</td>
                    <td className="highlight">{formatPercent(sector.avg_shareholder_yield)}</td>
                    <td>{formatPercent(sector.avg_dividend_pct)}</td>
                    <td>{formatPercent(sector.avg_buyback_pct)}</td>
                    <td>{formatPercent(sector.avg_payout_ratio)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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

  return (
    <div className="capital-page">
      <div className="page-header">
        <h1>Capital Allocation</h1>
        <p className="subtitle">Track dividends, buybacks, and shareholder returns</p>
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
          className={viewMode === 'dividends' ? 'active' : ''}
          onClick={() => setViewMode('dividends')}
        >
          Dividend Aristocrats
        </button>
        <button
          className={viewMode === 'buybacks' ? 'active' : ''}
          onClick={() => setViewMode('buybacks')}
        >
          Buybacks
        </button>
        <button
          className={viewMode === 'events' ? 'active' : ''}
          onClick={() => setViewMode('events')}
        >
          Events
        </button>
        <button
          className={viewMode === 'calendar' ? 'active' : ''}
          onClick={() => setViewMode('calendar')}
        >
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
        {viewMode === 'dividends' && renderDividends()}
        {viewMode === 'buybacks' && renderBuybacks()}
        {viewMode === 'events' && renderEvents()}
        {viewMode === 'calendar' && renderCalendar()}
      </div>
    </div>
  );
}

export default CapitalAllocationPage;
