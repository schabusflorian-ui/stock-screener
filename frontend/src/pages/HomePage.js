// frontend/src/pages/HomePage.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  RefreshCw,
  Bell
} from 'lucide-react';
// Note: Layers import removed - not currently used
import { statsAPI, ipoAPI, alertsAPI, pricesAPI, indicesAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import { useFormatters } from '../hooks/useFormatters';
import { Sparkline } from '../components';
import { NLQueryBar } from '../components/nl';
import {
  PageHeader,
  Section,
  Card,
  Grid,
  Badge,
  Callout
} from '../components/ui';
import './HomePage.css';

function HomePage() {
  const { watchlist } = useWatchlist();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [highlights, setHighlights] = useState(null);
  const [priceData, setPriceData] = useState({});
  const [upcomingIPOs, setUpcomingIPOs] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [alertSummary, setAlertSummary] = useState(null);
  const [marketIndices, setMarketIndices] = useState([]);
  const [indexPriceHistory, setIndexPriceHistory] = useState({});

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, highlightsRes, iposRes, alertsRes, alertSummaryRes, indicesRes] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getHighlights(),
        ipoAPI.getUpcoming().catch(() => ({ data: { ipos: [] } })),
        alertsAPI.getAlerts({ limit: 5, signals: ['strong_buy', 'buy'] }).catch(() => ({ data: { data: [] } })),
        alertsAPI.getSummary().catch(() => ({ data: { data: null } })),
        indicesAPI.getAll().catch(() => ({ data: { data: [] } }))
      ]);

      setStats(statsRes.data);
      setHighlights(highlightsRes.data);
      setUpcomingIPOs(iposRes.data?.ipos?.slice(0, 3) || []);
      setRecentAlerts(alertsRes.data?.data?.slice(0, 4) || []);
      setAlertSummary(alertSummaryRes.data?.data || null);
      // Filter out Russell 2000 (RUT) from dashboard - show only SPX, DJI, NDX
      const indices = (indicesRes.data?.data || []).filter(idx => idx.short_name !== 'RUT');
      setMarketIndices(indices);
      setLoading(false);

      // Load index price history for sparklines in background
      if (indices.length > 0) {
        const indexSymbols = indices.slice(0, 3).map(idx => idx.symbol);
        const priceHistoryPromises = indexSymbols.map(async (symbol) => {
          try {
            const res = await indicesAPI.getPrices(symbol, '1m');
            return { symbol, data: res.data?.data || [] };
          } catch (e) {
            return { symbol, data: [] };
          }
        });
        const results = await Promise.all(priceHistoryPromises);
        const historyMap = {};
        results.forEach(({ symbol, data }) => {
          historyMap[symbol] = data.map(d => ({ time: d.date, value: d.close })).reverse();
        });
        setIndexPriceHistory(historyMap);
      }

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

  // Use preference-aware number formatting
  const formatNumber = (num) => fmt.number(num, { compact: true });

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
        <Callout type="error" title="Error loading dashboard">
          {error}
        </Callout>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Welcome Header */}
      <PageHeader title="Fundamental Analysis" />

      {/* Natural Language Query Bar */}
      <Section>
        <NLQueryBar
          placeholder="Ask anything... e.g., 'Show me undervalued tech stocks' or 'Compare AAPL to MSFT'"
          context={{ page: 'home' }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
        />
      </Section>

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

      {/* Market Indices Section */}
      {marketIndices.length > 0 && (
        <Section
          title={<><Activity size={18} /> Market Overview</>}
          action={{ label: 'View All Indices', onClick: () => navigate('/sectors') }}
        >
          <Card variant="glass" padding="lg">
            <div className="index-date-header">
              {marketIndices[0]?.last_price_date && new Date(marketIndices[0].last_price_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <Grid cols={3} gap="md">
              {marketIndices.slice(0, 3).map(index => (
                <div key={index.symbol} className="index-card">
                  <div className="index-header">
                    <span className="index-name">{index.short_name || index.name}</span>
                    <Badge variant={index.change_1d_pct >= 0 ? 'green' : 'red'}>
                      {index.change_1d_pct >= 0 ? '+' : ''}{index.change_1d_pct?.toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="index-main-row">
                    <div className="index-price">
                      {index.last_price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                    <div className="index-sparkline">
                      {indexPriceHistory[index.symbol]?.length > 0 && (
                        <Sparkline
                          data={indexPriceHistory[index.symbol]}
                          width={100}
                          height={36}
                          showChange={false}
                          color={index.change_1m >= 0 ? '#10b981' : '#ef4444'}
                        />
                      )}
                    </div>
                  </div>
                  <div className="index-metrics">
                    <div className="index-metric">
                      <span className="metric-label">1W</span>
                      <span className={`metric-value ${index.change_1w >= 0 ? 'positive' : 'negative'}`}>
                        {index.change_1w >= 0 ? '+' : ''}{index.change_1w?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="index-metric">
                      <span className="metric-label">1M</span>
                      <span className={`metric-value ${index.change_1m >= 0 ? 'positive' : 'negative'}`}>
                        {index.change_1m >= 0 ? '+' : ''}{index.change_1m?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="index-metric">
                      <span className="metric-label">YTD</span>
                      <span className={`metric-value ${index.change_ytd >= 0 ? 'positive' : 'negative'}`}>
                        {index.change_ytd >= 0 ? '+' : ''}{index.change_ytd?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="index-metric">
                      <span className="metric-label">52W High</span>
                      <span className={`metric-value ${index.pct_from_52w_high <= -5 ? 'negative' : ''}`}>
                        {index.pct_from_52w_high?.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </Grid>
          </Card>
        </Section>
      )}

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Leaderboards Section */}
        <Section
          title={<><Award size={18} /> Market Leaders</>}
          action={{ label: 'Screen All', onClick: () => navigate('/screening') }}
        >
          <Card variant="glass" padding="lg">
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
                        {price?.alpha_1m != null ? (
                          <span className={`alpha-badge ${price.alpha_1m >= 0 ? 'positive' : 'negative'}`}>
                            {price.alpha_1m >= 0 ? '+' : ''}{price.alpha_1m.toFixed(1)}% α
                          </span>
                        ) : price?.change_1m != null && (
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
                        {price?.alpha_1m != null ? (
                          <span className={`alpha-badge ${price.alpha_1m >= 0 ? 'positive' : 'negative'}`}>
                            {price.alpha_1m >= 0 ? '+' : ''}{price.alpha_1m.toFixed(1)}% α
                          </span>
                        ) : price?.change_1m != null && (
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
                        {price?.alpha_1m != null ? (
                          <span className={`alpha-badge ${price.alpha_1m >= 0 ? 'positive' : 'negative'}`}>
                            {price.alpha_1m >= 0 ? '+' : ''}{price.alpha_1m.toFixed(1)}% α
                          </span>
                        ) : price?.change_1m != null && (
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
                        {price?.alpha_1m != null ? (
                          <span className={`alpha-badge ${price.alpha_1m >= 0 ? 'positive' : 'negative'}`}>
                            {price.alpha_1m >= 0 ? '+' : ''}{price.alpha_1m.toFixed(1)}% α
                          </span>
                        ) : price?.change_1m != null && (
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
          </Card>
        </Section>

        {/* Side Column */}
        <div className="side-column">
          {/* Sector Overview */}
          <Section
            title={<><PieChart size={18} /> Coverage by Sector</>}
            action={{ label: 'View All', onClick: () => navigate('/sectors') }}
          >
            <Card variant="glass" padding="md">
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
            </Card>
          </Section>

          {/* IPO Pipeline */}
          <Section
            title={<><Activity size={18} /> IPO Pipeline</>}
            action={{ label: 'View Pipeline', onClick: () => navigate('/ipo') }}
          >
            <Card variant="glass" padding="md">
              {upcomingIPOs.length > 0 ? (
                <div className="ipo-list">
                  {upcomingIPOs.map(ipo => (
                    <Link to={`/ipo/${ipo.id}`} key={ipo.id} className="ipo-item">
                      <div className="ipo-name">{ipo.company_name}</div>
                      <Badge variant={ipo.status?.toLowerCase() === 'priced' ? 'green' : 'blue'}>
                        {ipo.status || 'Filed'}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-mini">
                  <p>No upcoming IPOs tracked</p>
                </div>
              )}
            </Card>
          </Section>

          {/* Buy Signals Widget */}
          <Section
            title={<><Bell size={18} /> Buy Signals</>}
            action={{
              label: alertSummary?.unread > 0 ? `(${alertSummary.unread}) View All` : 'View All',
              onClick: () => navigate('/alerts')
            }}
          >
            <Card variant="glass" padding="md">
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
                      <Badge variant={alert.signal_type === 'strong_buy' ? 'green' : 'blue'} size="sm">
                        {alert.signal_type?.replace('_', ' ')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-mini">
                  <p>No buy signals detected</p>
                  <Link to="/alerts" className="run-scan-link">Run Scan</Link>
                </div>
              )}
            </Card>
          </Section>

          {/* Dividend Leaders */}
          <Section
            title={<><DollarSign size={18} /> Dividend Leaders</>}
            action={{ label: 'View All', onClick: () => navigate('/screening?preset=dividend') }}
          >
            <Card variant="glass" padding="md">
              <div className="dividend-list">
                {highlights?.dividendLeaders?.slice(0, 4).map(company => (
                  <Link
                    to={`/company/${company.symbol}`}
                    key={company.symbol}
                    className="dividend-item"
                  >
                    <span className="symbol">{company.symbol}</span>
                    <Badge variant="green">{company.dividend_yield?.toFixed(2)}%</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          </Section>
        </div>

        {/* Quick Actions */}
        <Section title="Analysis Tools" className="full-width">
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
        </Section>

        {/* Data Freshness Info */}
        <Card variant="base" padding="md" className="data-info full-width">
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
        </Card>
      </div>
    </div>
  );
}

export default HomePage;
