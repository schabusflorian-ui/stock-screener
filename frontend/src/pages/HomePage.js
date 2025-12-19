// frontend/src/pages/HomePage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Star,
  BarChart3,
  DollarSign,
  Award,
  Clock,
  ArrowUpRight,
  Database,
  Target,
  Shield,
  Zap,
  PieChart,
  Activity,
  Layers,
  RefreshCw,
  Bell
} from 'lucide-react';
import { statsAPI, ipoAPI, alertsAPI, pricesAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import './HomePage.css';

function HomePage() {
  const { watchlist } = useWatchlist();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [highlights, setHighlights] = useState(null);
  const [priceData, setPriceData] = useState({});
  const [upcomingIPOs, setUpcomingIPOs] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [alertSummary, setAlertSummary] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, highlightsRes, iposRes, alertsRes, alertSummaryRes] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getHighlights(),
        ipoAPI.getUpcoming().catch(() => ({ data: { ipos: [] } })),
        alertsAPI.getAlerts({ limit: 5, signals: ['strong_buy', 'buy'] }).catch(() => ({ data: { data: [] } })),
        alertsAPI.getSummary().catch(() => ({ data: { data: null } }))
      ]);

      setStats(statsRes.data);
      setHighlights(highlightsRes.data);
      setUpcomingIPOs(iposRes.data?.ipos?.slice(0, 3) || []);
      setRecentAlerts(alertsRes.data?.data?.slice(0, 4) || []);
      setAlertSummary(alertSummaryRes.data?.data || null);
      setLoading(false);

      // Load price data for all highlight companies in background
      const allSymbols = new Set();
      ['topROIC', 'bestValue', 'highestGrowth', 'strongBalance', 'dividendLeaders'].forEach(key => {
        highlightsRes.data?.[key]?.forEach(c => allSymbols.add(c.symbol));
      });

      const newPrices = {};
      await Promise.all([...allSymbols].map(async (symbol) => {
        try {
          const res = await pricesAPI.getMetrics(symbol);
          if (res?.data?.data) {
            newPrices[symbol] = res.data.data;
          }
        } catch (e) {
          // Ignore individual price fetch errors
        }
      }));
      setPriceData(newPrices);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toLocaleString() || '0';
  };

  if (loading) {
    return (
      <div className="home-page">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="loading-overlay">
          <span style={{ color: '#ef4444' }}>Error loading dashboard: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Welcome Header */}
      <header className="welcome-header">
        <div className="welcome-text">
          <h1>Fundamental Analysis</h1>
        </div>
      </header>

      {/* Stats Pills */}
      <div className="stats-pills">
        <div className="stat-pill highlight">
          <span className="pill-value">{stats?.companies?.total || 0}</span>
          <span className="pill-label">Companies</span>
        </div>
        <div className="stat-pill">
          <span className="pill-value">{stats?.dataRange?.yearsOfData || 0}</span>
          <span className="pill-label">Years</span>
          <span className="pill-detail">{stats?.dataRange?.earliestYear}–{stats?.dataRange?.latestYear}</span>
        </div>
        <div className="stat-pill">
          <span className="pill-value">{formatNumber(stats?.filings?.total || 0)}</span>
          <span className="pill-label">Filings</span>
        </div>
        <div className="stat-pill">
          <span className="pill-value">{stats?.companies?.sectors || 0}</span>
          <span className="pill-label">Sectors</span>
        </div>
        <div className="stat-pill">
          <Star size={14} className="pill-icon" />
          <span className="pill-value">{watchlist.length}</span>
          <span className="pill-label">Watchlist</span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Leaderboards Section - Primary Focus */}
        <section className="dashboard-card leaderboards-section">
          <div className="card-header">
            <h3><Award size={18} /> Market Leaders</h3>
            <Link to="/screening" className="view-all">Screen All</Link>
          </div>
          <div className="leaderboards-grid">
            {/* ROIC Leaders */}
            <div className="leaderboard-column">
              <h4><TrendingUp size={14} /> Top ROIC</h4>
              <p className="leaderboard-desc">Return on Invested Capital</p>
              {highlights?.topROIC?.map((company, idx) => {
                const price = priceData[company.symbol];
                return (
                  <Link
                    to={`/company/${company.symbol}`}
                    key={company.symbol}
                    className="leaderboard-item"
                  >
                    <span className="rank">#{idx + 1}</span>
                    <div className="company-info">
                      <span className="symbol">{company.symbol}</span>
                      {price?.last_price && <span className="price">${price.last_price.toFixed(2)}</span>}
                    </div>
                    <div className="values-col">
                      <span className="value positive">{company.roic?.toFixed(1)}%</span>
                      {price?.change_1m != null && (
                        <span className={`price-change ${price.change_1m >= 0 ? 'up' : 'down'}`}>
                          {price.change_1m >= 0 ? '+' : ''}{price.change_1m.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Best Value */}
            <div className="leaderboard-column">
              <h4><DollarSign size={14} /> Best Value</h4>
              <p className="leaderboard-desc">Earnings Yield</p>
              {highlights?.bestValue?.map((company, idx) => {
                const price = priceData[company.symbol];
                return (
                  <Link
                    to={`/company/${company.symbol}`}
                    key={company.symbol}
                    className="leaderboard-item"
                  >
                    <span className="rank">#{idx + 1}</span>
                    <div className="company-info">
                      <span className="symbol">{company.symbol}</span>
                      {price?.last_price && <span className="price">${price.last_price.toFixed(2)}</span>}
                    </div>
                    <div className="values-col">
                      <span className="value">{company.earnings_yield?.toFixed(1)}%</span>
                      {price?.change_1m != null && (
                        <span className={`price-change ${price.change_1m >= 0 ? 'up' : 'down'}`}>
                          {price.change_1m >= 0 ? '+' : ''}{price.change_1m.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Highest Growth */}
            <div className="leaderboard-column">
              <h4><Zap size={14} /> Growth Leaders</h4>
              <p className="leaderboard-desc">Revenue Growth YoY</p>
              {highlights?.highestGrowth?.map((company, idx) => {
                const price = priceData[company.symbol];
                return (
                  <Link
                    to={`/company/${company.symbol}`}
                    key={company.symbol}
                    className="leaderboard-item"
                  >
                    <span className="rank">#{idx + 1}</span>
                    <div className="company-info">
                      <span className="symbol">{company.symbol}</span>
                      {price?.last_price && <span className="price">${price.last_price.toFixed(2)}</span>}
                    </div>
                    <div className="values-col">
                      <span className="value positive">+{company.revenue_growth_yoy?.toFixed(1)}%</span>
                      {price?.change_1m != null && (
                        <span className={`price-change ${price.change_1m >= 0 ? 'up' : 'down'}`}>
                          {price.change_1m >= 0 ? '+' : ''}{price.change_1m.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Strong Balance */}
            <div className="leaderboard-column">
              <h4><Shield size={14} /> Fortress Balance</h4>
              <p className="leaderboard-desc">Low Debt, High Liquidity</p>
              {highlights?.strongBalance?.map((company, idx) => {
                const price = priceData[company.symbol];
                return (
                  <Link
                    to={`/company/${company.symbol}`}
                    key={company.symbol}
                    className="leaderboard-item"
                  >
                    <span className="rank">#{idx + 1}</span>
                    <div className="company-info">
                      <span className="symbol">{company.symbol}</span>
                      {price?.last_price && <span className="price">${price.last_price.toFixed(2)}</span>}
                    </div>
                    <div className="values-col">
                      <span className="value">{company.current_ratio?.toFixed(1)}x</span>
                      {price?.change_1m != null && (
                        <span className={`price-change ${price.change_1m >= 0 ? 'up' : 'down'}`}>
                          {price.change_1m >= 0 ? '+' : ''}{price.change_1m.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Quick Access Grid */}
        <div className="side-column">
          {/* Sector Overview */}
          <section className="dashboard-card sectors-preview">
            <div className="card-header">
              <h3><PieChart size={18} /> Coverage by Sector</h3>
              <Link to="/sectors" className="view-all">View All</Link>
            </div>
            <div className="sector-bars">
              {stats?.sectorBreakdown?.slice(0, 6).map(sector => {
                const maxCount = stats.sectorBreakdown[0]?.count || 1;
                const percent = (sector.count / maxCount) * 100;
                return (
                  <div key={sector.sector} className="sector-bar-item">
                    <div className="sector-bar-label">
                      <span className="sector-name">{sector.sector}</span>
                      <span className="sector-count">{sector.count}</span>
                    </div>
                    <div className="sector-bar-track">
                      <div
                        className="sector-bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* IPO Pipeline */}
          <section className="dashboard-card ipo-preview">
            <div className="card-header">
              <h3><Activity size={18} /> IPO Pipeline</h3>
              <Link to="/ipo" className="view-all">View Pipeline</Link>
            </div>
            {upcomingIPOs.length > 0 ? (
              <div className="ipo-list">
                {upcomingIPOs.map(ipo => (
                  <Link to={`/ipo/${ipo.id}`} key={ipo.id} className="ipo-item">
                    <div className="ipo-name">{ipo.company_name}</div>
                    <span className={`status-badge ${ipo.status?.toLowerCase()}`}>
                      {ipo.status || 'Filed'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-mini">
                <p>No upcoming IPOs tracked</p>
              </div>
            )}
          </section>

          {/* Buy Signals Widget */}
          <section className="dashboard-card alerts-preview">
            <div className="card-header">
              <h3><Bell size={18} /> Buy Signals</h3>
              <Link to="/alerts" className="view-all">
                {alertSummary?.unread > 0 && <span className="unread-count">{alertSummary.unread}</span>}
                View All
              </Link>
            </div>
            {recentAlerts.length > 0 ? (
              <div className="alerts-list-mini">
                {recentAlerts.map(alert => (
                  <Link
                    to={`/company/${alert.symbol}`}
                    key={alert.id}
                    className={`alert-item-mini signal-${alert.signal_type}`}
                  >
                    <span className="alert-signal-icon">
                      {alert.signal_type === 'strong_buy' ? '🟢' : '🔵'}
                    </span>
                    <div className="alert-item-info">
                      <span className="alert-symbol">{alert.symbol}</span>
                      <span className="alert-title-mini">{alert.title?.replace(`${alert.symbol}: `, '')}</span>
                    </div>
                    <span className={`alert-signal-badge ${alert.signal_type}`}>
                      {alert.signal_type?.replace('_', ' ')}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-mini">
                <p>No buy signals detected</p>
                <Link to="/alerts" className="run-scan-link">Run Scan</Link>
              </div>
            )}
          </section>

          {/* Dividend Leaders */}
          <section className="dashboard-card dividend-preview">
            <div className="card-header">
              <h3><DollarSign size={18} /> Dividend Leaders</h3>
              <Link to="/screening?preset=dividend" className="view-all">View All</Link>
            </div>
            <div className="dividend-list">
              {highlights?.dividendLeaders?.slice(0, 4).map(company => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="dividend-item"
                >
                  <span className="symbol">{company.symbol}</span>
                  <span className="yield">{company.dividend_yield?.toFixed(2)}%</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Quick Actions */}
        <section className="dashboard-card actions-section full-width">
          <div className="card-header">
            <h3>Analysis Tools</h3>
          </div>
          <div className="quick-actions">
            <Link to="/screening" className="action-card">
              <div className="action-icon">
                <Target size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Stock Screener</span>
                <span className="action-desc">Filter by 20+ metrics</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>

            <Link to="/sectors" className="action-card">
              <div className="action-icon">
                <BarChart3 size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Sector Analysis</span>
                <span className="action-desc">Compare industries</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>

            <Link to="/compare" className="action-card">
              <div className="action-icon">
                <Activity size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Compare</span>
                <span className="action-desc">Side-by-side analysis</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>

            <Link to="/charts" className="action-card">
              <div className="action-icon">
                <TrendingUp size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Advanced Charts</span>
                <span className="action-desc">Multi-company metrics</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>

            <Link to="/capital" className="action-card">
              <div className="action-icon">
                <DollarSign size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Capital Allocation</span>
                <span className="action-desc">Dividends & buybacks</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>

            <Link to="/insiders" className="action-card">
              <div className="action-icon">
                <Database size={24} />
              </div>
              <div className="action-info">
                <span className="action-title">Insider Trading</span>
                <span className="action-desc">Form 4 filings</span>
              </div>
              <ArrowUpRight size={16} className="action-arrow" />
            </Link>
          </div>
        </section>

        {/* Data Freshness Info */}
        <section className="dashboard-card data-info full-width">
          <div className="data-info-content">
            <div className="data-info-item">
              <Clock size={16} />
              <span>Latest filing: {stats?.dataRange?.latestFiling || 'N/A'}</span>
            </div>
            <div className="data-info-item">
              <Database size={16} />
              <span>{stats?.companies?.withMetrics || 0} companies with calculated metrics</span>
            </div>
            <div className="data-info-item">
              <RefreshCw size={16} />
              <span>{stats?.recentActivity?.updatesLast30Days || 0} updates in last 30 days</span>
            </div>
            <Link to="/updates" className="data-info-link">
              Manage Updates
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
