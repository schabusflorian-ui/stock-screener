// frontend/src/pages/investors/InvestorDetailPage.js
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  BarChart3,
  Briefcase,
  Calendar,
  Copy,
  ExternalLink,
  PieChart,
  ChevronDown,
  ChevronUp,
  Filter,
  Search
} from 'lucide-react';
import { investorsAPI } from '../../services/api';
import CloneModal from '../../components/investors/CloneModal';
import PortfolioPerformanceChart from '../../components/investors/PortfolioPerformanceChart';
import PortfolioReturnsChart from '../../components/investors/PortfolioReturnsChart';
import './InvestorDetailPage.css';

const STYLE_LABELS = {
  value: 'Value',
  deep_value: 'Deep Value',
  growth: 'Growth',
  activist: 'Activist',
  macro: 'Macro',
  quant: 'Quantitative',
  technology: 'Technology',
  distressed: 'Distressed',
  long_short: 'Long/Short',
  multi_strategy: 'Multi-Strategy'
};

function InvestorDetailPage() {
  const { id } = useParams();
  const [investor, setInvestor] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [changes, setChanges] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortBy, setSortBy] = useState('market_value');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvestor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadInvestor = async () => {
    try {
      setLoading(true);
      const [investorRes, holdingsRes, changesRes, statsRes] = await Promise.all([
        investorsAPI.get(id),
        investorsAPI.getHoldings(id, { sortBy, sortOrder }),
        investorsAPI.getChanges(id),
        investorsAPI.getStats(id)
      ]);

      setInvestor(investorRes.data.investor);
      setHoldings(holdingsRes.data.holdings || []);
      setChanges(changesRes.data.changes);
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Error loading investor:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh13F = async () => {
    try {
      setRefreshing(true);
      await investorsAPI.fetch13F(id);
      await loadInvestor();
    } catch (err) {
      console.error('Error refreshing 13F:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  useEffect(() => {
    if (investor) {
      investorsAPI.getHoldings(id, { sortBy, sortOrder })
        .then(res => setHoldings(res.data.holdings || []));
    }
  }, [sortBy, sortOrder, id, investor]);

  const formatValue = (value) => {
    if (!value) return '-';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getChangeIcon = (changeType) => {
    switch (changeType) {
      case 'new':
      case 'increased':
        return <TrendingUp size={14} className="change-icon positive" />;
      case 'decreased':
      case 'sold':
        return <TrendingDown size={14} className="change-icon negative" />;
      default:
        return <Minus size={14} className="change-icon neutral" />;
    }
  };

  const filteredHoldings = holdings.filter(h =>
    h.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.security_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    h.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="investor-detail-page">
        <div className="loading-container">
          <RefreshCw className="loading-spinner" size={32} />
          <p>Loading investor data...</p>
        </div>
      </div>
    );
  }

  if (error || !investor) {
    return (
      <div className="investor-detail-page">
        <div className="error-container">
          <p>Error loading investor: {error || 'Not found'}</p>
          <Link to="/investors" className="btn btn-secondary">
            <ArrowLeft size={16} /> Back to Investors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="investor-detail-page">
      {/* Header */}
      <header className="detail-header">
        <Link to="/investors" className="back-link">
          <ArrowLeft size={18} />
          Back to Investors
        </Link>

        <div className="header-main">
          <div className="investor-identity">
            <div className="investor-avatar large">
              {investor.name?.charAt(0) || 'I'}
            </div>
            <div className="investor-title">
              <h1>{investor.name}</h1>
              <p className="fund-name">{investor.fund_name}</p>
              <span className="style-badge">
                {STYLE_LABELS[investor.investment_style] || investor.investment_style}
              </span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={handleRefresh13F}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
              {refreshing ? 'Fetching...' : 'Refresh 13F'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowCloneModal(true)}
            >
              <Copy size={16} />
              Clone Portfolio
            </button>
            <a
              href={investor.latest_filing_url || `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${investor.cik}&type=13F-HR&dateb=&owner=include&count=40`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              <ExternalLink size={16} />
              SEC Filing
            </a>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <DollarSign size={16} />
            <div>
              <span className="stat-label">Portfolio Value</span>
              <span className="stat-value">{formatValue(investor.latest_portfolio_value)}</span>
            </div>
          </div>
          <div className="stat-item">
            <BarChart3 size={16} />
            <div>
              <span className="stat-label">Positions</span>
              <span className="stat-value">{investor.latest_positions_count || '-'}</span>
            </div>
          </div>
          <div className="stat-item">
            <Calendar size={16} />
            <div>
              <span className="stat-label">Last Filing</span>
              <span className="stat-value">{formatDate(investor.latest_filing_date)}</span>
            </div>
          </div>
          {changes && (
            <>
              <div className="stat-item positive">
                <TrendingUp size={16} />
                <div>
                  <span className="stat-label">New Positions</span>
                  <span className="stat-value">{changes.new?.length || 0}</span>
                </div>
              </div>
              <div className="stat-item negative">
                <TrendingDown size={16} />
                <div>
                  <span className="stat-label">Sold</span>
                  <span className="stat-value">{changes.sold?.length || 0}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 size={16} />
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            <TrendingUp size={16} />
            Performance
          </button>
          <button
            className={`tab ${activeTab === 'holdings' ? 'active' : ''}`}
            onClick={() => setActiveTab('holdings')}
          >
            <Briefcase size={16} />
            Holdings
          </button>
          <button
            className={`tab ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <Calendar size={16} />
            Activity
          </button>
          <button
            className={`tab ${activeTab === 'allocation' ? 'active' : ''}`}
            onClick={() => setActiveTab('allocation')}
          >
            <PieChart size={16} />
            Allocation
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="detail-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="overview-section">
            {/* Key Metrics Grid */}
            <div className="overview-metrics">
              <div className="metric-card primary">
                <DollarSign size={24} />
                <div className="metric-content">
                  <span className="metric-value">{formatValue(investor.latest_portfolio_value)}</span>
                  <span className="metric-label">Portfolio Value</span>
                </div>
              </div>
              <div className="metric-card">
                <Briefcase size={24} />
                <div className="metric-content">
                  <span className="metric-value">{investor.latest_positions_count || holdings.length}</span>
                  <span className="metric-label">Positions</span>
                </div>
              </div>
              <div className="metric-card">
                <PieChart size={24} />
                <div className="metric-content">
                  <span className="metric-value">{stats.sectorAllocation?.length || 0}</span>
                  <span className="metric-label">Sectors</span>
                </div>
              </div>
              <div className="metric-card">
                <Calendar size={24} />
                <div className="metric-content">
                  <span className="metric-value">{investor.latest_filing_date || 'N/A'}</span>
                  <span className="metric-label">Last Filing</span>
                </div>
              </div>
            </div>

            {/* Diversification Stats */}
            <div className="overview-row">
              <div className="overview-card">
                <h3>Diversification Analysis</h3>
                <div className="diversification-stats">
                  <div className="div-stat">
                    <span className="div-label">Top 5 Concentration</span>
                    <span className="div-value">
                      {holdings.slice(0, 5).reduce((sum, h) => sum + (h.portfolio_weight || 0), 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="div-stat">
                    <span className="div-label">Top 10 Concentration</span>
                    <span className="div-value">
                      {holdings.slice(0, 10).reduce((sum, h) => sum + (h.portfolio_weight || 0), 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="div-stat">
                    <span className="div-label">Largest Position</span>
                    <span className="div-value">
                      {holdings[0]?.symbol || 'N/A'} ({holdings[0]?.portfolio_weight?.toFixed(1) || 0}%)
                    </span>
                  </div>
                  <div className="div-stat">
                    <span className="div-label">Avg Position Size</span>
                    <span className="div-value">
                      {(holdings.reduce((sum, h) => sum + (h.portfolio_weight || 0), 0) / holdings.length || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="overview-card">
                <h3>Activity Summary</h3>
                <div className="activity-summary">
                  <div className="activity-stat positive">
                    <TrendingUp size={18} />
                    <span className="activity-count">{changes?.new?.length || 0}</span>
                    <span className="activity-label">New Positions</span>
                  </div>
                  <div className="activity-stat positive">
                    <TrendingUp size={18} />
                    <span className="activity-count">{changes?.increased?.length || 0}</span>
                    <span className="activity-label">Increased</span>
                  </div>
                  <div className="activity-stat negative">
                    <TrendingDown size={18} />
                    <span className="activity-count">{changes?.decreased?.length || 0}</span>
                    <span className="activity-label">Decreased</span>
                  </div>
                  <div className="activity-stat negative">
                    <TrendingDown size={18} />
                    <span className="activity-count">{changes?.sold?.length || 0}</span>
                    <span className="activity-label">Sold</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Holdings Preview */}
            <div className="overview-card full-width">
              <div className="card-header">
                <h3>Top 10 Holdings</h3>
                <button className="text-link" onClick={() => setActiveTab('holdings')}>
                  View All →
                </button>
              </div>
              <div className="top-holdings-grid">
                {holdings.slice(0, 10).map((h, idx) => (
                  <div key={idx} className="top-holding-item">
                    <span className="holding-rank">{idx + 1}</span>
                    <div className="holding-details">
                      {h.symbol ? (
                        <Link to={`/company/${h.symbol}`} className="holding-symbol">{h.symbol}</Link>
                      ) : (
                        <span className="holding-cusip">{h.cusip}</span>
                      )}
                      <span className="holding-name">{h.company_name || h.security_name}</span>
                    </div>
                    <div className="holding-stats">
                      <span className="holding-weight">{h.portfolio_weight?.toFixed(2)}%</span>
                      <span className="holding-value">{formatValue(h.market_value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="performance-section">
            {/* Portfolio Returns vs S&P 500 Benchmark */}
            <PortfolioReturnsChart
              investorId={id}
              investorName={investor?.name}
            />

            {/* Historical Portfolio Value Chart */}
            <div style={{ marginTop: '2rem' }}>
              <PortfolioPerformanceChart
                investorId={id}
                investorName={investor?.name}
              />
            </div>

            {/* Entry Point Performance Summary - Since First Appearance */}
            <div className="performance-header" style={{ marginTop: '2rem' }}>
              <h3>Since Entry (First Appearance)</h3>
              <p className="perf-description">Performance from when position first appeared in 13F filings</p>
            </div>
            <div className="performance-summary">
              <div className="perf-card primary">
                <div className="perf-card-header">
                  <span className="perf-label">Portfolio Performance</span>
                  <span className="perf-period">Since Entry</span>
                </div>
                <div className="perf-value-row">
                  <span className={`perf-value ${(() => {
                    const validHoldings = holdings.filter(h => h.entry_gain_loss_pct !== null);
                    if (validHoldings.length === 0) return '';
                    const weightedReturn = validHoldings.reduce((sum, h) => sum + (h.entry_gain_loss_pct * (h.portfolio_weight / 100)), 0);
                    return weightedReturn >= 0 ? 'positive' : 'negative';
                  })()}`}>
                    {(() => {
                      const validHoldings = holdings.filter(h => h.entry_gain_loss_pct !== null);
                      if (validHoldings.length === 0) return 'N/A';
                      const weightedReturn = validHoldings.reduce((sum, h) => {
                        return sum + (h.entry_gain_loss_pct * (h.portfolio_weight / 100));
                      }, 0);
                      return `${weightedReturn >= 0 ? '+' : ''}${weightedReturn.toFixed(2)}%`;
                    })()}
                  </span>
                  <span className="perf-subtext">Weighted Return Since Entry</span>
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Best Long-Term</span>
                </div>
                <div className="perf-value-row">
                  {(() => {
                    const best = [...holdings].filter(h => h.entry_gain_loss_pct !== null).sort((a, b) => b.entry_gain_loss_pct - a.entry_gain_loss_pct)[0];
                    if (!best) return <span className="perf-value">N/A</span>;
                    return (
                      <>
                        <span className="perf-symbol">{best.symbol || best.cusip}</span>
                        <span className="perf-value positive">+{best.entry_gain_loss_pct?.toFixed(1)}%</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Worst Long-Term</span>
                </div>
                <div className="perf-value-row">
                  {(() => {
                    const worst = [...holdings].filter(h => h.entry_gain_loss_pct !== null).sort((a, b) => a.entry_gain_loss_pct - b.entry_gain_loss_pct)[0];
                    if (!worst) return <span className="perf-value">N/A</span>;
                    return (
                      <>
                        <span className="perf-symbol">{worst.symbol || worst.cusip}</span>
                        <span className="perf-value negative">{worst.entry_gain_loss_pct?.toFixed(1)}%</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Avg Holding Period</span>
                </div>
                <div className="perf-value-row">
                  <span className="perf-value">
                    {(() => {
                      const validHoldings = holdings.filter(h => h.holding_period_days !== null);
                      if (validHoldings.length === 0) return 'N/A';
                      const avgDays = validHoldings.reduce((sum, h) => sum + h.holding_period_days, 0) / validHoldings.length;
                      if (avgDays > 365) return `${(avgDays / 365).toFixed(1)} yrs`;
                      return `${Math.round(avgDays)} days`;
                    })()}
                  </span>
                  <span className="perf-subtext">Average Hold Time</span>
                </div>
              </div>
            </div>

            {/* Recent Performance - Since Filing */}
            <div className="performance-header secondary">
              <h3>Since Latest Filing</h3>
              <p className="perf-description">Performance since {formatDate(investor?.latest_filing_date)}</p>
            </div>
            <div className="performance-summary">
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Filing Return</span>
                </div>
                <div className="perf-value-row">
                  <span className={`perf-value ${(() => {
                    const validHoldings = holdings.filter(h => h.gain_loss_pct !== null);
                    if (validHoldings.length === 0) return '';
                    const weightedReturn = validHoldings.reduce((sum, h) => sum + (h.gain_loss_pct * (h.portfolio_weight / 100)), 0);
                    return weightedReturn >= 0 ? 'positive' : 'negative';
                  })()}`}>
                    {(() => {
                      const validHoldings = holdings.filter(h => h.gain_loss_pct !== null);
                      if (validHoldings.length === 0) return 'N/A';
                      const weightedReturn = validHoldings.reduce((sum, h) => {
                        return sum + (h.gain_loss_pct * (h.portfolio_weight / 100));
                      }, 0);
                      return `${weightedReturn >= 0 ? '+' : ''}${weightedReturn.toFixed(2)}%`;
                    })()}
                  </span>
                  <span className="perf-subtext">Since Filing</span>
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Best Recent</span>
                </div>
                <div className="perf-value-row">
                  {(() => {
                    const best = [...holdings].filter(h => h.gain_loss_pct !== null).sort((a, b) => b.gain_loss_pct - a.gain_loss_pct)[0];
                    if (!best) return <span className="perf-value">N/A</span>;
                    return (
                      <>
                        <span className="perf-symbol">{best.symbol || best.cusip}</span>
                        <span className="perf-value positive">+{best.gain_loss_pct?.toFixed(1)}%</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Worst Recent</span>
                </div>
                <div className="perf-value-row">
                  {(() => {
                    const worst = [...holdings].filter(h => h.gain_loss_pct !== null).sort((a, b) => a.gain_loss_pct - b.gain_loss_pct)[0];
                    if (!worst) return <span className="perf-value">N/A</span>;
                    return (
                      <>
                        <span className="perf-symbol">{worst.symbol || worst.cusip}</span>
                        <span className="perf-value negative">{worst.gain_loss_pct?.toFixed(1)}%</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="perf-card">
                <div className="perf-card-header">
                  <span className="perf-label">Winners/Losers</span>
                </div>
                <div className="perf-value-row">
                  <span className="perf-ratio">
                    <span className="positive">{holdings.filter(h => h.gain_loss_pct > 0).length}</span>
                    <span className="divider">/</span>
                    <span className="negative">{holdings.filter(h => h.gain_loss_pct < 0).length}</span>
                  </span>
                  <span className="perf-subtext">
                    {holdings.filter(h => h.gain_loss_pct === null).length > 0 &&
                      `(${holdings.filter(h => h.gain_loss_pct === null).length} no data)`}
                  </span>
                </div>
              </div>
            </div>

            {/* Top Winners */}
            <div className="performance-lists">
              <div className="perf-list-card">
                <h3><TrendingUp size={18} className="positive" /> Top Gainers</h3>
                <div className="perf-list">
                  {[...holdings]
                    .filter(h => h.gain_loss_pct !== null && h.gain_loss_pct > 0)
                    .sort((a, b) => b.gain_loss_pct - a.gain_loss_pct)
                    .slice(0, 10)
                    .map((h, idx) => (
                      <div key={idx} className="perf-list-item">
                        <span className="perf-rank">{idx + 1}</span>
                        <div className="perf-stock-info">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="perf-stock-symbol">{h.symbol}</Link>
                          ) : (
                            <span className="perf-stock-cusip">{h.cusip}</span>
                          )}
                          <span className="perf-stock-name">{h.company_name || h.security_name}</span>
                        </div>
                        <div className="perf-stock-return positive">
                          <span className="return-pct">+{h.gain_loss_pct.toFixed(1)}%</span>
                          <span className="return-value">+{formatValue(h.gain_loss_value)}</span>
                        </div>
                      </div>
                    ))}
                  {holdings.filter(h => h.gain_loss_pct > 0).length === 0 && (
                    <div className="perf-empty">No gainers with price data</div>
                  )}
                </div>
              </div>

              <div className="perf-list-card">
                <h3><TrendingDown size={18} className="negative" /> Top Losers</h3>
                <div className="perf-list">
                  {[...holdings]
                    .filter(h => h.gain_loss_pct !== null && h.gain_loss_pct < 0)
                    .sort((a, b) => a.gain_loss_pct - b.gain_loss_pct)
                    .slice(0, 10)
                    .map((h, idx) => (
                      <div key={idx} className="perf-list-item">
                        <span className="perf-rank">{idx + 1}</span>
                        <div className="perf-stock-info">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="perf-stock-symbol">{h.symbol}</Link>
                          ) : (
                            <span className="perf-stock-cusip">{h.cusip}</span>
                          )}
                          <span className="perf-stock-name">{h.company_name || h.security_name}</span>
                        </div>
                        <div className="perf-stock-return negative">
                          <span className="return-pct">{h.gain_loss_pct.toFixed(1)}%</span>
                          <span className="return-value">{formatValue(h.gain_loss_value)}</span>
                        </div>
                      </div>
                    ))}
                  {holdings.filter(h => h.gain_loss_pct < 0).length === 0 && (
                    <div className="perf-empty">No losers with price data</div>
                  )}
                </div>
              </div>
            </div>

            {/* Performance Note */}
            <div className="performance-note">
              <p>
                <strong>Note:</strong> Performance is calculated from the 13F filing date ({formatDate(investor?.latest_filing_date)})
                to the most recent price data available. This represents how positions have performed since they were disclosed,
                not since the investor's actual purchase date (which is not disclosed in 13F filings).
              </p>
            </div>
          </div>
        )}

        {activeTab === 'holdings' && (
          <div className="holdings-section">
            <div className="section-header">
              <h2>Current Holdings</h2>
              <div className="section-controls">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search holdings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="holdings-table-wrapper">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('security_name')} className="sortable">
                      Security
                      {sortBy === 'security_name' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th onClick={() => handleSort('shares')} className="sortable right">
                      Shares
                      {sortBy === 'shares' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th onClick={() => handleSort('market_value')} className="sortable right">
                      Filing Value
                      {sortBy === 'market_value' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th className="right">Current Price</th>
                    <th onClick={() => handleSort('gain_loss_pct')} className="sortable right">
                      Return
                      {sortBy === 'gain_loss_pct' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th onClick={() => handleSort('entry_gain_loss_pct')} className="sortable right">
                      Since Entry
                      {sortBy === 'entry_gain_loss_pct' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th onClick={() => handleSort('portfolio_weight')} className="sortable right">
                      Weight
                      {sortBy === 'portfolio_weight' && (sortOrder === 'ASC' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.map((holding, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="security-cell">
                          {holding.symbol ? (
                            <Link to={`/company/${holding.symbol}`} className="symbol-link">
                              {holding.symbol}
                            </Link>
                          ) : (
                            <span className="cusip">{holding.cusip}</span>
                          )}
                          <span className="security-name">
                            {holding.company_name || holding.security_name}
                          </span>
                        </div>
                      </td>
                      <td className="right">
                        {holding.shares?.toLocaleString() || '-'}
                      </td>
                      <td className="right">
                        <div className="value-cell-stack">
                          <span className="primary-value">{formatValue(holding.market_value)}</span>
                          {holding.filing_price && (
                            <span className="secondary-value">@ ${holding.filing_price.toFixed(2)}</span>
                          )}
                        </div>
                      </td>
                      <td className="right">
                        {holding.current_price ? (
                          <div className="value-cell-stack">
                            <span className="primary-value">${holding.current_price.toFixed(2)}</span>
                            {holding.current_value && (
                              <span className="secondary-value">{formatValue(holding.current_value)}</span>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td className={`right ${holding.gain_loss_pct > 0 ? 'positive' : holding.gain_loss_pct < 0 ? 'negative' : ''}`}>
                        {holding.gain_loss_pct !== null ? (
                          <div className="return-cell">
                            <span className="return-pct">
                              {holding.gain_loss_pct >= 0 ? '+' : ''}{holding.gain_loss_pct.toFixed(1)}%
                            </span>
                            {holding.gain_loss_value && (
                              <span className="return-value">
                                {holding.gain_loss_value >= 0 ? '+' : ''}{formatValue(holding.gain_loss_value)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td className={`right ${holding.entry_gain_loss_pct > 0 ? 'positive' : holding.entry_gain_loss_pct < 0 ? 'negative' : ''}`}>
                        {holding.entry_gain_loss_pct !== null ? (
                          <div className="entry-return">
                            <span className="entry-pct">
                              {holding.entry_gain_loss_pct >= 0 ? '+' : ''}{holding.entry_gain_loss_pct.toFixed(1)}%
                            </span>
                            <span className="entry-date-small">
                              {holding.first_filing_date ? formatDate(holding.first_filing_date) : ''}
                              {holding.holding_period_days ? ` (${holding.holding_period_days > 365 ? `${(holding.holding_period_days / 365).toFixed(1)}y` : `${holding.holding_period_days}d`})` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td className="right">
                        <div className="weight-cell">
                          <span>{holding.portfolio_weight?.toFixed(2)}%</span>
                          <div className="weight-bar">
                            <div
                              className="weight-fill"
                              style={{ width: `${Math.min(holding.portfolio_weight * 2, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`change-badge ${holding.change_type}`}>
                          {getChangeIcon(holding.change_type)}
                          {holding.change_type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'activity' && changes && (
          <div className="changes-section">
            {/* Changes Summary Stats */}
            <div className="changes-summary">
              <div className="summary-stat new">
                <TrendingUp size={18} />
                <span className="stat-number">{changes.new?.length || 0}</span>
                <span className="stat-label">New</span>
              </div>
              <div className="summary-stat increased">
                <TrendingUp size={18} />
                <span className="stat-number">{changes.increased?.length || 0}</span>
                <span className="stat-label">Increased</span>
              </div>
              <div className="summary-stat decreased">
                <TrendingDown size={18} />
                <span className="stat-number">{changes.decreased?.length || 0}</span>
                <span className="stat-label">Decreased</span>
              </div>
              <div className="summary-stat sold">
                <TrendingDown size={18} />
                <span className="stat-number">{changes.sold?.length || 0}</span>
                <span className="stat-label">Sold</span>
              </div>
            </div>

            {/* Changes Table */}
            <div className="changes-table-wrapper">
              <table className="changes-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Security</th>
                    <th className="right">Shares</th>
                    <th className="right">Change</th>
                    <th className="right">Value</th>
                    <th className="right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {/* New Positions */}
                  {changes.new?.map((h, idx) => (
                    <tr key={`new-${idx}`} className="row-new">
                      <td>
                        <span className="type-badge new">NEW</span>
                      </td>
                      <td>
                        <div className="security-cell">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                          ) : (
                            <span className="cusip">{h.cusip}</span>
                          )}
                          <span className="security-name">{h.company_name || h.security_name}</span>
                        </div>
                      </td>
                      <td className="right">{h.shares?.toLocaleString() || '-'}</td>
                      <td className="right positive">New Position</td>
                      <td className="right">{formatValue(h.market_value)}</td>
                      <td className="right">{h.portfolio_weight?.toFixed(2)}%</td>
                    </tr>
                  ))}

                  {/* Increased Positions */}
                  {changes.increased?.map((h, idx) => (
                    <tr key={`inc-${idx}`} className="row-increased">
                      <td>
                        <span className="type-badge increased">+</span>
                      </td>
                      <td>
                        <div className="security-cell">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                          ) : (
                            <span className="cusip">{h.cusip}</span>
                          )}
                          <span className="security-name">{h.company_name || h.security_name}</span>
                        </div>
                      </td>
                      <td className="right">{h.shares?.toLocaleString() || '-'}</td>
                      <td className="right positive">+{h.shares_change_pct?.toFixed(1)}%</td>
                      <td className="right">{formatValue(h.market_value)}</td>
                      <td className="right">{h.portfolio_weight?.toFixed(2)}%</td>
                    </tr>
                  ))}

                  {/* Decreased Positions */}
                  {changes.decreased?.map((h, idx) => (
                    <tr key={`dec-${idx}`} className="row-decreased">
                      <td>
                        <span className="type-badge decreased">-</span>
                      </td>
                      <td>
                        <div className="security-cell">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                          ) : (
                            <span className="cusip">{h.cusip}</span>
                          )}
                          <span className="security-name">{h.company_name || h.security_name}</span>
                        </div>
                      </td>
                      <td className="right">{h.shares?.toLocaleString() || '-'}</td>
                      <td className="right negative">{h.shares_change_pct?.toFixed(1)}%</td>
                      <td className="right">{formatValue(h.market_value)}</td>
                      <td className="right">{h.portfolio_weight?.toFixed(2)}%</td>
                    </tr>
                  ))}

                  {/* Sold Positions */}
                  {changes.sold?.map((h, idx) => (
                    <tr key={`sold-${idx}`} className="row-sold">
                      <td>
                        <span className="type-badge sold">SOLD</span>
                      </td>
                      <td>
                        <div className="security-cell">
                          {h.symbol ? (
                            <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                          ) : (
                            <span className="cusip">{h.cusip}</span>
                          )}
                          <span className="security-name">{h.company_name || h.security_name}</span>
                        </div>
                      </td>
                      <td className="right">{h.prev_shares?.toLocaleString() || '-'}</td>
                      <td className="right negative">-100%</td>
                      <td className="right">-</td>
                      <td className="right">-</td>
                    </tr>
                  ))}

                  {/* Empty State */}
                  {(!changes.new?.length && !changes.increased?.length &&
                    !changes.decreased?.length && !changes.sold?.length) && (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        No changes in the latest filing
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'allocation' && stats && (
          <div className="sectors-section">
            {/* Pie Chart */}
            <div className="sector-pie-container">
              <h2>Sector Breakdown</h2>
              <div className="pie-wrapper">
                <svg className="pie-chart-svg" viewBox="0 0 100 100">
                  {(() => {
                    const sectors = stats.sectorAllocation?.filter(s => s.total_weight > 0) || [];
                    const total = sectors.reduce((sum, s) => sum + s.total_weight, 0);
                    let cumulativeAngle = 0;
                    const radius = 40;
                    const circumference = 2 * Math.PI * radius;

                    return sectors.map((sector, idx) => {
                      const percentage = sector.total_weight / total;
                      const dashLength = percentage * circumference;
                      const dashOffset = -cumulativeAngle * circumference / 100;
                      const color = `hsl(${(idx * 40 + 200) % 360}, 65%, 55%)`;

                      cumulativeAngle += sector.total_weight;

                      return (
                        <circle
                          key={idx}
                          className="pie-segment"
                          cx="50"
                          cy="50"
                          r={radius}
                          stroke={color}
                          strokeWidth="20"
                          strokeDasharray={`${dashLength} ${circumference}`}
                          strokeDashoffset={dashOffset}
                        />
                      );
                    });
                  })()}
                </svg>

                <div className="pie-legend">
                  {stats.sectorAllocation?.slice(0, 6).map((sector, idx) => (
                    <div key={idx} className="legend-item">
                      <span
                        className="legend-color"
                        style={{ backgroundColor: `hsl(${(idx * 40 + 200) % 360}, 65%, 55%)` }}
                      />
                      <span className="legend-label">{sector.sector || 'Unknown'}</span>
                      <span className="legend-value">{sector.total_weight?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sector Bar Chart */}
            <div className="sector-bars-container">
              <h2>By Allocation</h2>
              <div className="sector-chart">
                {stats.sectorAllocation?.slice(0, 8).map((sector, idx) => {
                  const color = `hsl(${(idx * 40 + 200) % 360}, 65%, 55%)`;
                  const maxWeight = stats.sectorAllocation[0]?.total_weight || 100;
                  return (
                    <div key={idx} className="sector-bar-row">
                      <span className="sector-rank" style={{ backgroundColor: color }}>
                        {idx + 1}
                      </span>
                      <div className="sector-label">
                        <span className="sector-name">{sector.sector || 'Unknown'}</span>
                        <span className="sector-positions">{sector.positions} position{sector.positions !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="sector-bar">
                        <div
                          className="sector-fill"
                          style={{
                            width: `${(sector.total_weight / maxWeight) * 100}%`,
                            backgroundColor: color
                          }}
                        />
                      </div>
                      <div className="sector-stats">
                        <span className="sector-weight">{sector.total_weight?.toFixed(1)}%</span>
                        <span className="sector-value">{formatValue(sector.total_value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Holdings - Full Width */}
            <div className="top-holdings-container" style={{ gridColumn: '1 / -1' }}>
              <h2>Top 10 Holdings</h2>
              <div className="top-holdings">
                {stats.topPositions?.map((pos, idx) => (
                  <div key={idx} className="top-holding">
                    <span className="holding-rank">{idx + 1}</span>
                    <div className="holding-info">
                      {pos.symbol ? (
                        <Link to={`/company/${pos.symbol}`} className="holding-symbol">
                          {pos.symbol}
                        </Link>
                      ) : (
                        <span>{pos.security_name}</span>
                      )}
                      <span className="holding-name">{pos.company_name || pos.security_name}</span>
                    </div>
                    <div className="holding-weight">{pos.portfolio_weight?.toFixed(2)}%</div>
                    <div className="holding-value">{formatValue(pos.market_value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clone Modal */}
      {showCloneModal && (
        <CloneModal
          investor={investor}
          onClose={() => setShowCloneModal(false)}
        />
      )}
    </div>
  );
}

export default InvestorDetailPage;
