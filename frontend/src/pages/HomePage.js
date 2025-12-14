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
  ArrowDownRight,
  Sparkles,
  Target,
  Shield
} from 'lucide-react';
import { companyAPI, metricsAPI, ipoAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import { SnowflakeChart } from '../components/charts';
import './HomePage.css';

function HomePage() {
  const { watchlist } = useWatchlist();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ companies: 0, dataYears: 0 });
  const [leaderboards, setLeaderboards] = useState({
    roic: [],
    value: [],
    quality: []
  });
  const [topMovers, setTopMovers] = useState({ gainers: [], losers: [] });
  const [upcomingIPOs, setUpcomingIPOs] = useState([]);
  const [watchlistData, setWatchlistData] = useState([]);
  const [featuredCompany, setFeaturedCompany] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadWatchlistData = async () => {
    try {
      const watchlistPromises = watchlist.slice(0, 6).map(item =>
        companyAPI.getOne(item.symbol).catch(() => null)
      );
      const results = await Promise.all(watchlistPromises);
      const validResults = results
        .filter(r => r !== null)
        .map(r => r.data);
      setWatchlistData(validResults);
    } catch (error) {
      console.error('Error loading watchlist data:', error);
    }
  };

  // Load watchlist company details when watchlist changes
  useEffect(() => {
    if (watchlist.length > 0) {
      loadWatchlistData();
    } else {
      setWatchlistData([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  const loadDashboardData = async () => {
    try {
      const [
        companiesRes,
        roicLeaders,
        valueLeaders,
        qualityLeaders,
        iposRes
      ] = await Promise.all([
        companyAPI.getAll(),
        metricsAPI.getLeaderboard('roic', 5),
        metricsAPI.getLeaderboard('earnings_yield', 5),
        metricsAPI.getLeaderboard('roe', 5),
        ipoAPI.getUpcoming().catch(() => ({ data: { ipos: [] } }))
      ]);

      const companies = companiesRes.data.companies;

      setStats({
        companies: companies.length,
        dataYears: companies.reduce((sum, c) => sum + (c.years_of_data || 0), 0)
      });

      setLeaderboards({
        roic: roicLeaders.data.leaderboard || [],
        value: valueLeaders.data.leaderboard || [],
        quality: qualityLeaders.data.leaderboard || []
      });

      // Simulate top movers (in real app, this would come from price data)
      const sortedByROIC = [...companies].sort((a, b) => (b.latest_roic || 0) - (a.latest_roic || 0));
      setTopMovers({
        gainers: sortedByROIC.slice(0, 5).map(c => ({
          ...c,
          change: Math.random() * 8 + 1 // Simulated daily change
        })),
        losers: sortedByROIC.slice(-5).reverse().map(c => ({
          ...c,
          change: -(Math.random() * 8 + 1) // Simulated daily change
        }))
      });

      setUpcomingIPOs(iposRes.data?.ipos?.slice(0, 4) || []);

      // Set featured company (highest ROIC)
      if (roicLeaders.data.leaderboard?.length > 0) {
        const featured = roicLeaders.data.leaderboard[0];
        setFeaturedCompany(featured);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="home-page">
        <div className="dashboard-loading">
          <div className="loading-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <BarChart3 size={16} />
          <span className="stat-value">{stats.companies}</span>
          <span className="stat-label">Companies</span>
        </div>
        <div className="stat-item">
          <Clock size={16} />
          <span className="stat-value">{stats.dataYears}</span>
          <span className="stat-label">Years of Data</span>
        </div>
        <div className="stat-item">
          <Target size={16} />
          <span className="stat-value">20+</span>
          <span className="stat-label">Metrics</span>
        </div>
        <div className="stat-item">
          <Star size={16} />
          <span className="stat-value">{watchlist.length}</span>
          <span className="stat-label">Watchlist</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Watchlist Section */}
        <section className="dashboard-card watchlist-section">
          <div className="card-header">
            <h3><Star size={18} /> Your Watchlist</h3>
            <Link to="/watchlist" className="view-all">View All</Link>
          </div>
          {watchlistData.length > 0 ? (
            <div className="watchlist-items">
              {watchlistData.map(company => (
                <Link
                  to={`/company/${company.company?.symbol}`}
                  key={company.company?.symbol}
                  className="watchlist-item"
                >
                  <div className="watchlist-symbol">{company.company?.symbol}</div>
                  <div className="watchlist-name">{company.company?.name}</div>
                  <div className="watchlist-metrics">
                    <span className="metric-badge roic">
                      ROIC {company.latest_metrics?.roic?.toFixed(1) || '-'}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Star size={24} />
              <p>No companies in watchlist</p>
              <Link to="/screening" className="add-link">Find companies to watch</Link>
            </div>
          )}
        </section>

        {/* Featured Company with Snowflake */}
        {featuredCompany && (
          <section className="dashboard-card featured-section">
            <div className="card-header">
              <h3><Sparkles size={18} /> Top Performer</h3>
            </div>
            <Link to={`/company/${featuredCompany.symbol}`} className="featured-content">
              <div className="featured-info">
                <div className="featured-symbol">{featuredCompany.symbol}</div>
                <div className="featured-name">{featuredCompany.name}</div>
                <div className="featured-sector">{featuredCompany.sector}</div>
                <div className="featured-metric">
                  <span className="metric-label">ROIC</span>
                  <span className="metric-value positive">{featuredCompany.roic?.toFixed(1)}%</span>
                </div>
              </div>
              <div className="featured-chart">
                <SnowflakeChart
                  metrics={{
                    pe_ratio: featuredCompany.pe_ratio,
                    pb_ratio: featuredCompany.pb_ratio,
                    revenue_growth: featuredCompany.revenue_growth,
                    earnings_growth: featuredCompany.earnings_growth,
                    roic: featuredCompany.roic,
                    roe: featuredCompany.roe,
                    current_ratio: featuredCompany.current_ratio,
                    debt_to_equity: featuredCompany.debt_to_equity,
                    dividend_yield: featuredCompany.dividend_yield,
                    payout_ratio: featuredCompany.payout_ratio
                  }}
                  size="small"
                  showLegend={false}
                />
              </div>
            </Link>
          </section>
        )}

        {/* Top Movers */}
        <section className="dashboard-card movers-section">
          <div className="card-header">
            <h3><TrendingUp size={18} /> Top Performers</h3>
          </div>
          <div className="movers-grid">
            <div className="movers-column gainers">
              <h4><ArrowUpRight size={14} /> Highest ROIC</h4>
              {topMovers.gainers.map(company => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="mover-item"
                >
                  <span className="mover-symbol">{company.symbol}</span>
                  <span className="mover-change positive">
                    {company.latest_roic?.toFixed(1) || '-'}%
                  </span>
                </Link>
              ))}
            </div>
            <div className="movers-column losers">
              <h4><ArrowDownRight size={14} /> Needs Attention</h4>
              {topMovers.losers.map(company => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="mover-item"
                >
                  <span className="mover-symbol">{company.symbol}</span>
                  <span className="mover-change negative">
                    {company.latest_roic?.toFixed(1) || '-'}%
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Leaderboards */}
        <section className="dashboard-card leaderboard-section">
          <div className="card-header">
            <h3><Award size={18} /> Leaderboards</h3>
            <Link to="/screening" className="view-all">Screen All</Link>
          </div>
          <div className="leaderboards-grid">
            {/* ROIC Leaders */}
            <div className="leaderboard-column">
              <h4><BarChart3 size={14} /> Highest ROIC</h4>
              {leaderboards.roic.map((company, idx) => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="leaderboard-item"
                >
                  <span className="rank">#{idx + 1}</span>
                  <span className="symbol">{company.symbol}</span>
                  <span className="value">{company.roic?.toFixed(1)}%</span>
                </Link>
              ))}
            </div>

            {/* Value Leaders */}
            <div className="leaderboard-column">
              <h4><DollarSign size={14} /> Best Value</h4>
              {leaderboards.value.map((company, idx) => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="leaderboard-item"
                >
                  <span className="rank">#{idx + 1}</span>
                  <span className="symbol">{company.symbol}</span>
                  <span className="value">{company.earnings_yield?.toFixed(1)}%</span>
                </Link>
              ))}
            </div>

            {/* Quality Leaders */}
            <div className="leaderboard-column">
              <h4><Shield size={14} /> Quality (ROE)</h4>
              {leaderboards.quality.map((company, idx) => (
                <Link
                  to={`/company/${company.symbol}`}
                  key={company.symbol}
                  className="leaderboard-item"
                >
                  <span className="rank">#{idx + 1}</span>
                  <span className="symbol">{company.symbol}</span>
                  <span className="value">{company.roe?.toFixed(1)}%</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Upcoming IPOs */}
        <section className="dashboard-card ipos-section">
          <div className="card-header">
            <h3><Sparkles size={18} /> IPO Pipeline</h3>
            <Link to="/ipo" className="view-all">View Pipeline</Link>
          </div>
          {upcomingIPOs.length > 0 ? (
            <div className="ipo-items">
              {upcomingIPOs.map(ipo => (
                <Link
                  to={`/ipo/${ipo.id}`}
                  key={ipo.id}
                  className="ipo-item"
                >
                  <div className="ipo-info">
                    <div className="ipo-name">{ipo.company_name}</div>
                    <div className="ipo-sector">{ipo.sector || 'Technology'}</div>
                  </div>
                  <div className="ipo-status">
                    <span className={`status-badge ${ipo.status?.toLowerCase()}`}>
                      {ipo.status || 'Filed'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={24} />
              <p>No upcoming IPOs</p>
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <section className="dashboard-card actions-section">
          <div className="card-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="quick-actions">
            <Link to="/screening" className="action-button">
              <Target size={20} />
              <span>Screen Stocks</span>
            </Link>
            <Link to="/sectors" className="action-button">
              <BarChart3 size={20} />
              <span>Sector Analysis</span>
            </Link>
            <Link to="/compare" className="action-button">
              <TrendingUp size={20} />
              <span>Compare</span>
            </Link>
            <Link to="/ipo" className="action-button">
              <Sparkles size={20} />
              <span>IPO Pipeline</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
