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
  Search,
  Info,
  Activity,
  Brain
} from '../../components/icons';
import { investorsAPI, prismAPI } from '../../services/api';
import PortfolioInsightsPanel from '../../components/portfolio/PortfolioInsightsPanel';
import CloneModal from '../../components/investors/CloneModal';
import PortfolioPerformanceChart from '../../components/investors/PortfolioPerformanceChart';
import PortfolioReturnsChart from '../../components/investors/PortfolioReturnsChart';
import { SkeletonInvestorDetail } from '../../components/Skeleton';
import { AskAIProvider } from '../../hooks';
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

// Maps investment_style key to badge-style-* class name
const getStyleBadgeClass = (style) => {
  const styleMap = {
    value: 'badge-style-value',
    deep_value: 'badge-style-deep-value',
    growth: 'badge-style-growth',
    activist: 'badge-style-activist',
    macro: 'badge-style-macro',
    quant: 'badge-style-quant',
    technology: 'badge-style-technology',
    distressed: 'badge-style-distressed',
    long_short: 'badge-style-long-short',
    multi_strategy: 'badge-style-multi-strategy'
  };
  return styleMap[style] || 'badge-style-multi-strategy';
};

// Sector colors matching portfolio AllocationChart for consistency - using CSS variables
const SECTOR_COLORS = {
  'Technology': 'var(--color-ai-violet)',
  'Healthcare': 'var(--positive)',
  'Financial Services': 'var(--info)',
  'Consumer Cyclical': 'var(--color-ai-violet)',
  'Communication Services': 'var(--color-ai-cyan)',
  'Industrials': 'var(--text-secondary)',
  'Consumer Defensive': 'var(--positive)',
  'Energy': 'var(--warning-dark)',
  'Utilities': 'var(--info)',
  'Real Estate': 'var(--positive)',
  'Basic Materials': 'var(--warning-dark)',
  'Cash': 'var(--text-secondary)',
  'ETF': 'var(--color-ai-violet)',
  'Other': 'var(--text-secondary)'
};

const DEFAULT_COLORS = [
  'var(--info)', 'var(--positive)', 'var(--color-ai-violet)', 'var(--warning-dark)', 'var(--negative)',
  'var(--color-ai-cyan)', 'var(--info)', 'var(--positive)', 'var(--warning-dark)', 'var(--positive)',
  'var(--color-ai-violet)', 'var(--text-secondary)', 'var(--positive)', 'var(--color-ai-cyan)', 'var(--color-ai-violet)'
];

// Helper to get sector color
const getSectorColor = (sectorName, index) => {
  return SECTOR_COLORS[sectorName] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
};

// Tooltip component (matches portfolio page)
function Tooltip({ text, children }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <div className="tooltip-content">{text}</div>
    </div>
  );
}

// About Investor Card - displays bio, description, and links
function AboutInvestorCard({ investor }) {
  if (!investor) return null;

  // Format AUM for display
  const formatAUM = (billions) => {
    if (!billions) return null;
    if (billions >= 1000) return `$${(billions / 1000).toFixed(1)}T`;
    if (billions >= 1) return `$${billions.toFixed(0)}B`;
    return `$${(billions * 1000).toFixed(0)}M`;
  };

  return (
    <div className="overview-card about-investor-card">
      <div className="about-header">
        {investor.image_url ? (
          <img
            src={investor.image_url}
            alt={investor.name}
            className="investor-image"
          />
        ) : (
          <div className="investor-avatar about-avatar">
            {investor.name?.charAt(0) || 'I'}
          </div>
        )}
        <div className="about-header-content">
          <h3><Info size={16} /> About {investor.name}</h3>
          {investor.wikipedia_url && (
            <a
              href={investor.wikipedia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="wikipedia-link"
            >
              <ExternalLink size={14} />
              Wikipedia
            </a>
          )}
        </div>
      </div>

      {/* Key Facts Grid */}
      {(investor.fund_type || investor.inception_year || investor.headquarters || investor.aum_billions) && (
        <div className="investor-key-facts">
          {investor.fund_type && (
            <div className="key-fact">
              <span className="key-fact-label">Fund Type</span>
              <span className="key-fact-value">{investor.fund_type}</span>
            </div>
          )}
          {investor.inception_year && (
            <div className="key-fact">
              <span className="key-fact-label">Active Since</span>
              <span className="key-fact-value">{investor.inception_year}</span>
            </div>
          )}
          {investor.headquarters && (
            <div className="key-fact">
              <span className="key-fact-label">Headquarters</span>
              <span className="key-fact-value">{investor.headquarters}</span>
            </div>
          )}
          {investor.aum_billions && (
            <div className="key-fact">
              <span className="key-fact-label">Est. AUM</span>
              <span className="key-fact-value">{formatAUM(investor.aum_billions)}</span>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div className="about-content">
        {investor.description ? (
          <p>{investor.description}</p>
        ) : (
          <p className="placeholder-text">
            No description available for this investor.
          </p>
        )}
      </div>

      {/* Investment Philosophy */}
      {investor.investment_philosophy && (
        <div className="investment-philosophy-section">
          <h4>Investment Philosophy</h4>
          <p>{investor.investment_philosophy}</p>
        </div>
      )}

      {/* Notable Achievements */}
      {investor.notable_achievements && (
        <div className="notable-achievements-section">
          <h4>Notable Achievements</h4>
          <p>{investor.notable_achievements}</p>
        </div>
      )}

      {/* Investment Style Badge */}
      {investor.investment_style && (
        <div className="investment-style-section">
          <span className="style-label">Investment Style:</span>
          <span className={`style-badge ${getStyleBadgeClass(investor.investment_style)}`}>
            {STYLE_LABELS[investor.investment_style] || investor.investment_style}
          </span>
        </div>
      )}
    </div>
  );
}

// Key Metrics Card - surfaces hidden metrics
function InvestorKeyMetricsCard({ holdings, returns }) {
  // Calculate win rate (positions with positive returns since entry)
  const holdingsWithEntryData = holdings.filter(h => h.entry_gain_loss_pct !== null);
  const positivePositions = holdingsWithEntryData.filter(h => h.entry_gain_loss_pct > 0).length;
  const winRate = holdingsWithEntryData.length > 0
    ? (positivePositions / holdingsWithEntryData.length) * 100
    : null;

  // Calculate average holding period
  const holdingsWithPeriod = holdings.filter(h => h.holding_period_days && h.holding_period_days > 0);
  const avgHoldingPeriod = holdingsWithPeriod.length > 0
    ? holdingsWithPeriod.reduce((sum, h) => sum + h.holding_period_days, 0) / holdingsWithPeriod.length
    : null;

  // Format holding period
  const formatHoldingPeriod = (days) => {
    if (!days) return '-';
    if (days > 365) return `${(days / 365).toFixed(1)} yrs`;
    if (days > 30) return `${Math.round(days / 30)} mo`;
    return `${Math.round(days)} days`;
  };

  // Calculate top 5 concentration
  const top5Concentration = holdings.slice(0, 5).reduce((sum, h) => sum + (h.portfolio_weight || 0), 0);

  return (
    <div className="overview-card metrics-card-compact">
      <h3><BarChart3 size={16} /> Key Metrics</h3>
      <div className="metrics-grid-compact">
        <Tooltip text="Excess return vs S&P 500 benchmark">
          <div className="metric-compact">
            <span className="metric-label">Alpha</span>
            <span className={`metric-value ${returns?.alpha >= 0 ? 'positive' : returns?.alpha < 0 ? 'negative' : ''}`}>
              {returns?.alpha !== undefined && returns?.alpha !== null
                ? `${returns.alpha >= 0 ? '+' : ''}${returns.alpha.toFixed(1)}%`
                : '-'}
            </span>
          </div>
        </Tooltip>

        <Tooltip text="Percentage of positions with positive returns since entry">
          <div className="metric-compact">
            <span className="metric-label">Win Rate</span>
            <span className={`metric-value ${winRate && winRate >= 50 ? 'positive' : ''}`}>
              {winRate !== null ? `${winRate.toFixed(0)}%` : '-'}
            </span>
          </div>
        </Tooltip>

        <Tooltip text="Average time positions have been held">
          <div className="metric-compact">
            <span className="metric-label">Avg Hold</span>
            <span className="metric-value">
              {formatHoldingPeriod(avgHoldingPeriod)}
            </span>
          </div>
        </Tooltip>

        <Tooltip text="Annualized portfolio return">
          <div className="metric-compact">
            <span className="metric-label">Ann. Return</span>
            <span className={`metric-value ${returns?.annualizedReturn >= 0 ? 'positive' : returns?.annualizedReturn < 0 ? 'negative' : ''}`}>
              {returns?.annualizedReturn !== undefined && returns?.annualizedReturn !== null
                ? `${returns.annualizedReturn >= 0 ? '+' : ''}${returns.annualizedReturn.toFixed(1)}%`
                : '-'}
            </span>
          </div>
        </Tooltip>

        <Tooltip text="Total number of unique positions">
          <div className="metric-compact">
            <span className="metric-label">Positions</span>
            <span className="metric-value">{holdings.length}</span>
          </div>
        </Tooltip>

        <Tooltip text="Concentration in top 5 holdings">
          <div className="metric-compact">
            <span className="metric-label">Top 5 %</span>
            <span className={`metric-value ${top5Concentration > 50 ? 'negative' : ''}`}>
              {top5Concentration.toFixed(0)}%
            </span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
}

// Allocation Overview Card - shows top positions and sectors
function AllocationOverviewCard({ holdings, stats }) {
  return (
    <div className="overview-card allocation-overview-card">
      <h3><PieChart size={16} /> Allocation</h3>
      <div className="allocation-split">
        {/* Top Positions */}
        <div className="top-positions-section">
          <h4>Top Positions</h4>
          {holdings.slice(0, 5).map((pos, i) => (
            <div key={i} className="position-bar-row">
              <span className="position-rank">{i + 1}</span>
              {pos.symbol ? (
                <Link to={`/company/${pos.symbol}`} className="position-symbol">
                  {pos.symbol}
                </Link>
              ) : (
                <span className="position-cusip">{pos.cusip}</span>
              )}
              <div className="weight-bar-container">
                <div
                  className="weight-bar-fill"
                  style={{ width: `${Math.min((pos.portfolio_weight || 0) * 2, 100)}%` }}
                />
              </div>
              <span className="weight-value">
                {pos.portfolio_weight?.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* Sector Breakdown */}
        <div className="sector-breakdown-section">
          <h4>By Sector</h4>
          {stats?.sectorAllocation?.slice(0, 5).map((sector, idx) => (
            <div key={idx} className="sector-row-compact">
              <span className="sector-name-compact">{sector.sector || 'Unknown'}</span>
              <span className="sector-weight-compact">{sector.total_weight?.toFixed(1)}%</span>
            </div>
          )) || <p className="no-data">Sector data not available</p>}
        </div>
      </div>

      {/* Concentration Warning */}
      {holdings[0] && holdings[0].portfolio_weight > 25 && (
        <div className="concentration-warning">
          <Activity size={14} />
          <span>High concentration: {holdings[0].symbol || holdings[0].cusip} at {holdings[0].portfolio_weight.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

// Performance & Risk Card - shows returns and risk metrics
function PerformanceRiskCard({ holdings, returns }) {
  // Calculate portfolio-level metrics from holdings
  const validHoldings = holdings.filter(h => h.gain_loss_pct !== null);
  const weightedReturn = validHoldings.reduce((sum, h) => {
    return sum + (h.gain_loss_pct * (h.portfolio_weight / 100));
  }, 0);

  // Calculate volatility estimate (std dev of position returns)
  const mean = validHoldings.length > 0
    ? validHoldings.reduce((sum, h) => sum + h.gain_loss_pct, 0) / validHoldings.length
    : 0;
  const variance = validHoldings.length > 1
    ? validHoldings.reduce((sum, h) => sum + Math.pow(h.gain_loss_pct - mean, 2), 0) / validHoldings.length
    : 0;
  const volatility = Math.sqrt(variance);

  // Win rate calculation
  const winners = validHoldings.filter(h => h.gain_loss_pct > 0).length;
  const winRate = validHoldings.length > 0 ? (winners / validHoldings.length) * 100 : null;

  // Top 5 concentration
  const top5Concentration = holdings.slice(0, 5).reduce((sum, h) => sum + (h.portfolio_weight || 0), 0);

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className="overview-card performance-risk-card">
      <h3><Activity size={16} /> Performance & Risk</h3>
      <div className="perf-risk-grid">
        <div className="perf-section">
          <h4>Returns</h4>
          <div className="perf-metrics">
            <div className="perf-metric">
              <span className="label">Since Filing</span>
              <span className={`value ${weightedReturn >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(weightedReturn)}
              </span>
            </div>
            <div className="perf-metric">
              <span className="label">Volatility</span>
              <span className="value">{volatility.toFixed(1)}%</span>
            </div>
            <div className="perf-metric">
              <span className="label">Alpha</span>
              <span className={`value ${(returns?.alpha || 0) >= 0 ? 'positive' : 'negative'}`}>
                {returns?.alpha !== undefined ? formatPercent(returns.alpha) : '-'}
              </span>
            </div>
            <div className="perf-metric">
              <span className="label">Win Rate</span>
              <span className={`value ${winRate && winRate >= 50 ? 'positive' : ''}`}>
                {winRate !== null ? `${winRate.toFixed(0)}%` : '-'}
              </span>
            </div>
          </div>
        </div>
        <div className="risk-section">
          <h4>Risk Factors</h4>
          <div className="risk-metrics">
            <div className="risk-metric">
              <span className="label">Positions</span>
              <span className="value">{holdings.length}</span>
            </div>
            <div className={`risk-metric ${top5Concentration > 50 ? '' : 'good'}`}>
              <span className="label">Top 5 Conc.</span>
              <span className="value">{top5Concentration.toFixed(1)}%</span>
            </div>
            <div className="risk-metric">
              <span className="label">Ann. Return</span>
              <span className={`value ${(returns?.annualizedReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
                {returns?.annualizedReturn !== undefined ? formatPercent(returns.annualizedReturn) : '-'}
              </span>
            </div>
            <div className="risk-metric">
              <span className="label">Top Pos.</span>
              <span className="value">{holdings[0]?.portfolio_weight?.toFixed(1) || '-'}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// PRISM Health Card - Aggregated portfolio quality score for investor holdings
function InvestorPRISMHealthCard({ holdings, prismScores, totalValue }) {
  // Calculate weighted average PRISM score
  const holdingsWithScores = holdings.filter(h => h.symbol && prismScores[h.symbol]);

  if (holdingsWithScores.length === 0) {
    return (
      <div className="overview-card prism-health-card">
        <h3><Brain size={16} /> PRISM Health</h3>
        <p className="no-data">PRISM scores loading or not available for holdings</p>
      </div>
    );
  }

  // Calculate value-weighted average score using portfolio_weight
  const totalWeight = holdingsWithScores.reduce((sum, h) => sum + (h.portfolio_weight || 0), 0);
  const weightedScore = holdingsWithScores.reduce((sum, h) => {
    const weight = (h.portfolio_weight || 0) / totalWeight;
    return sum + (prismScores[h.symbol] * weight);
  }, 0);

  // Coverage: what % of portfolio value has PRISM scores
  const scoredWeight = holdingsWithScores.reduce((sum, h) => sum + (h.portfolio_weight || 0), 0);
  const coverage = scoredWeight;

  // Score distribution
  const excellent = holdingsWithScores.filter(h => prismScores[h.symbol] >= 4).length;
  const good = holdingsWithScores.filter(h => prismScores[h.symbol] >= 3 && prismScores[h.symbol] < 4).length;
  const fair = holdingsWithScores.filter(h => prismScores[h.symbol] >= 2 && prismScores[h.symbol] < 3).length;
  const poor = holdingsWithScores.filter(h => prismScores[h.symbol] < 2).length;

  const getHealthClass = (score) => {
    if (score >= 4) return 'excellent';
    if (score >= 3) return 'good';
    if (score >= 2) return 'fair';
    return 'poor';
  };

  return (
    <div className="overview-card prism-health-card">
      <h3><Brain size={16} /> PRISM Health</h3>
      <div className="prism-health-content">
        <div className="prism-main-score">
          <span className={`prism-score-value ${getHealthClass(weightedScore)}`}>
            {weightedScore.toFixed(1)}
          </span>
          <span className="prism-score-max">/5</span>
        </div>
        <div className="prism-score-label">Portfolio Quality Score</div>
        <div className="prism-coverage">
          {coverage.toFixed(0)}% of holdings covered ({holdingsWithScores.length}/{holdings.length})
        </div>
      </div>
      <div className="prism-distribution">
        <div className="prism-dist-row">
          <span className="prism-dist-label excellent">Excellent (4+)</span>
          <span className="prism-dist-count">{excellent}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label good">Good (3-4)</span>
          <span className="prism-dist-count">{good}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label fair">Fair (2-3)</span>
          <span className="prism-dist-count">{fair}</span>
        </div>
        <div className="prism-dist-row">
          <span className="prism-dist-label poor">Poor (&lt;2)</span>
          <span className="prism-dist-count">{poor}</span>
        </div>
      </div>
      <div className="prism-holdings-preview">
        {holdingsWithScores.slice(0, 4).map((h, idx) => (
          <div key={idx} className="prism-holding-item">
            <span className="prism-holding-symbol">{h.symbol}</span>
            <span className={`prism-holding-score ${getHealthClass(prismScores[h.symbol])}`}>
              {prismScores[h.symbol].toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestorDetailPage() {
  console.log('[InvestorDetailPage] Component mounting...');
  const { id } = useParams();
  console.log('[InvestorDetailPage] ID from params:', id);
  const [investor, setInvestor] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [changes, setChanges] = useState(null);
  const [stats, setStats] = useState(null);
  const [returns, setReturns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortBy, setSortBy] = useState('market_value');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [prismScores, setPrismScores] = useState({});

  useEffect(() => {
    loadInvestor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load PRISM scores for investor holdings
  useEffect(() => {
    const loadPrismScores = async () => {
      if (holdings.length === 0) return;

      const newScores = {};
      // Load PRISM scores in parallel for holdings with symbols (exclude CUSIPs only)
      await Promise.all(holdings.slice(0, 20).map(async (h) => {
        if (!h.symbol) return; // Skip holdings without symbols
        try {
          const prismRes = await prismAPI.getReport(h.symbol);
          if (prismRes?.success && prismRes?.report?.scorecard?.overallScore) {
            newScores[h.symbol] = prismRes.report.scorecard.overallScore;
          }
        } catch (e) {
          // PRISM data not available for this symbol
        }
      }));

      setPrismScores(newScores);
    };

    loadPrismScores();
  }, [holdings]);

  const loadInvestor = async () => {
    console.log('[InvestorDetailPage] loadInvestor called for id:', id);
    try {
      setLoading(true);
      console.log('[InvestorDetailPage] Fetching data...');
      const [investorRes, holdingsRes, changesRes, statsRes, returnsRes] = await Promise.all([
        investorsAPI.get(id),
        investorsAPI.getHoldings(id, { limit: 500, sortBy, sortOrder }),
        investorsAPI.getChanges(id),
        investorsAPI.getStats(id),
        investorsAPI.getReturns(id, 20).catch(() => ({ data: null }))
      ]);

      console.log('[InvestorDetailPage] Data fetched successfully');
      console.log('[InvestorDetailPage] investorRes:', investorRes?.data);
      setInvestor(investorRes.data.investor);
      const rawHoldings = holdingsRes.data.holdings;
      const rawChanges = changesRes.data.changes;
      setHoldings(Array.isArray(rawHoldings) ? rawHoldings : []);
      setBreakdown(holdingsRes.data.breakdown || null);
      setChanges(Array.isArray(rawChanges) ? rawChanges : []);
      setStats(statsRes.data.stats);
      setReturns(returnsRes.data?.summary || null);
      console.log('[InvestorDetailPage] State updated');
    } catch (err) {
      console.error('[InvestorDetailPage] Error loading investor:', err);
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
      investorsAPI.getHoldings(id, { limit: 500, sortBy, sortOrder })
        .then(res => {
          const raw = res.data.holdings;
          setHoldings(Array.isArray(raw) ? raw : []);
        });
    }
  }, [sortBy, sortOrder, id, investor]);

  const formatValue = (value) => {
    if (!value) return '-';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
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
        <SkeletonInvestorDetail />
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
        <div className="header-inner">
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
                <span className={`style-badge ${getStyleBadgeClass(investor.investment_style)}`}>
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
                href={investor.latest_filing_url || `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${investor.cik?.replace(/^0+/, '') || ''}&type=13F-HR&dateb=&owner=include&count=40`}
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
            <Tooltip text="Total portfolio value from latest 13F filing">
              <div className="stat-item main">
                <DollarSign size={16} />
                <div>
                  <span className="stat-label">Portfolio Value</span>
                  <span className="stat-value">{formatValue(investor.latest_portfolio_value)}</span>
                </div>
              </div>
            </Tooltip>
            <Tooltip text="Number of unique stock positions">
              <div className="stat-item">
                <BarChart3 size={16} />
                <div>
                  <span className="stat-label">Positions</span>
                  <span className="stat-value">{investor.latest_positions_count || '-'}</span>
                </div>
              </div>
            </Tooltip>
            <Tooltip text="Date of most recent 13F-HR filing">
              <div className="stat-item">
                <Calendar size={16} />
                <div>
                  <span className="stat-label">Last Filing</span>
                  <span className="stat-value">{formatDate(investor.latest_filing_date)}</span>
                </div>
              </div>
            </Tooltip>
            {returns && (
              <Tooltip text={`Annualized return vs S&P 500 (Alpha: ${returns.alpha >= 0 ? '+' : ''}${returns.alpha?.toFixed(1)}%)`}>
                <div className={`stat-item ${returns.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                  {returns.annualizedReturn >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  <div>
                    <span className="stat-label">Ann. Return</span>
                    <span className="stat-value">
                      {returns.annualizedReturn >= 0 ? '+' : ''}{returns.annualizedReturn?.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </Tooltip>
            )}
            {changes && (
              <>
                <Tooltip text="New positions added since previous filing">
                  <div className="stat-item positive">
                    <TrendingUp size={16} />
                    <div>
                      <span className="stat-label">New</span>
                      <span className="stat-value">{changes.new?.length || 0}</span>
                    </div>
                  </div>
                </Tooltip>
                <Tooltip text="Positions completely sold since previous filing">
                  <div className="stat-item negative">
                    <TrendingDown size={16} />
                    <div>
                      <span className="stat-label">Sold</span>
                      <span className="stat-value">{changes.sold?.length || 0}</span>
                    </div>
                  </div>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs-inner">
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
      </div>

      {/* Content */}
      <div className="detail-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="overview-section">
            <div className="overview-grid">
              {/* Row 1: About This Investor - Full Width */}
              <AboutInvestorCard investor={investor} />

              {/* Row 2: Key Metrics + Allocation Overview */}
              <InvestorKeyMetricsCard holdings={holdings} returns={returns} />
              <AllocationOverviewCard holdings={holdings} stats={stats} />

              {/* Row 3: Performance & Risk + Activity Summary */}
              <PerformanceRiskCard holdings={holdings} returns={returns} />

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

              {/* Row 4: PRISM Health + AI Insights */}
              <InvestorPRISMHealthCard
                holdings={holdings}
                prismScores={prismScores}
                totalValue={investor?.latest_portfolio_value || 0}
              />

              <div className="overview-card ai-insights-compact">
                <PortfolioInsightsPanel
                  portfolio={{
                    name: investor?.name,
                    total_value: investor?.latest_portfolio_value,
                    positions_count: holdings.length
                  }}
                  holdings={holdings.map(h => ({
                    symbol: h.symbol,
                    current_value: h.market_value,
                    unrealized_gain_pct: h.gain_loss_pct,
                    sector: h.sector
                  }))}
                  performance={{
                    totalReturnPct: returns?.annualizedReturn,
                    alpha: returns?.alpha
                  }}
                  riskMetrics={{
                    alpha: returns?.alpha
                  }}
                  allocation={{
                    sectors: stats?.sectorAllocation?.map(s => ({
                      name: s.sector,
                      weight: s.total_weight
                    }))
                  }}
                  compact={true}
                />
              </div>

              {/* Row 5: Top Holdings Preview - Full Width */}
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
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="performance-section">
            {/* Portfolio Returns vs S&P 500 Benchmark */}
            <AskAIProvider value={{ type: 'chart', label: `${investor?.name} Returns`, metric: 'investor_returns' }}>
              <PortfolioReturnsChart
                investorId={id}
                investorName={investor?.name}
              />
            </AskAIProvider>

            {/* Historical Portfolio Value Chart */}
            <div style={{ marginTop: '2rem' }}>
              <AskAIProvider value={{ type: 'chart', label: `${investor?.name} Portfolio Value`, metric: 'investor_portfolio_value' }}>
                <PortfolioPerformanceChart
                  investorId={id}
                  investorName={investor?.name}
                />
              </AskAIProvider>
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
              <h2 className="section-label">Current Holdings</h2>
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

            {/* Portfolio Breakdown by Asset Type */}
            {breakdown && (breakdown.put.count > 0 || breakdown.call.count > 0) && (
              <div className="portfolio-breakdown">
                <div className="breakdown-card stock">
                  <div className="breakdown-icon">
                    <Briefcase size={20} />
                  </div>
                  <div className="breakdown-content">
                    <span className="breakdown-label">Stocks</span>
                    <span className="breakdown-value">{formatValue(breakdown.stock.value)}</span>
                    <span className="breakdown-meta">
                      {breakdown.stock.count} positions · {breakdown.stock.weight.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {breakdown.call.count > 0 && (
                  <div className="breakdown-card call">
                    <div className="breakdown-icon call">
                      <TrendingUp size={20} />
                    </div>
                    <div className="breakdown-content">
                      <span className="breakdown-label">Call Options</span>
                      <span className="breakdown-value">{formatValue(breakdown.call.value)}</span>
                      <span className="breakdown-meta">
                        {breakdown.call.count} positions · {breakdown.call.weight.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
                {breakdown.put.count > 0 && (
                  <div className="breakdown-card put">
                    <div className="breakdown-icon put">
                      <TrendingDown size={20} />
                    </div>
                    <div className="breakdown-content">
                      <span className="breakdown-label">Put Options</span>
                      <span className="breakdown-value">{formatValue(breakdown.put.value)}</span>
                      <span className="breakdown-meta">
                        {breakdown.put.count} positions · {breakdown.put.weight.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                          <div className="symbol-row">
                            {holding.symbol ? (
                              <Link to={`/company/${holding.symbol}`} className="symbol-link">
                                {holding.symbol}
                              </Link>
                            ) : (
                              <span className="cusip">{holding.cusip}</span>
                            )}
                            {holding.option_type && (
                              <span className={`option-badge ${holding.option_type.toLowerCase()}`}>
                                {holding.option_type}
                              </span>
                            )}
                          </div>
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

            {/* Holdings Summary */}
            {holdings.length > 0 && (
              <div className="holdings-summary">
                <div className="summary-item">
                  <span className="summary-label">Filing Value</span>
                  <span className="summary-value">
                    {formatValue(holdings.reduce((sum, h) => sum + (h.market_value || 0), 0))}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Current Value</span>
                  <span className="summary-value">
                    {formatValue(holdings.reduce((sum, h) => sum + (h.current_value || 0), 0))}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Total Gain/Loss</span>
                  <span className={`summary-value ${holdings.reduce((sum, h) => sum + (h.gain_loss_value || 0), 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatValue(holdings.reduce((sum, h) => sum + (h.gain_loss_value || 0), 0))}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Winners / Losers</span>
                  <span className="summary-value">
                    <span className="positive">{holdings.filter(h => h.gain_loss_pct > 0).length}</span>
                    {' / '}
                    <span className="negative">{holdings.filter(h => h.gain_loss_pct < 0).length}</span>
                  </span>
                </div>
              </div>
            )}
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
                          <div className="symbol-row">
                            {h.symbol ? (
                              <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                            ) : (
                              <span className="cusip">{h.cusip}</span>
                            )}
                            {h.option_type && (
                              <span className={`option-badge ${h.option_type.toLowerCase()}`}>{h.option_type}</span>
                            )}
                          </div>
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
                          <div className="symbol-row">
                            {h.symbol ? (
                              <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                            ) : (
                              <span className="cusip">{h.cusip}</span>
                            )}
                            {h.option_type && (
                              <span className={`option-badge ${h.option_type.toLowerCase()}`}>{h.option_type}</span>
                            )}
                          </div>
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
                          <div className="symbol-row">
                            {h.symbol ? (
                              <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                            ) : (
                              <span className="cusip">{h.cusip}</span>
                            )}
                            {h.option_type && (
                              <span className={`option-badge ${h.option_type.toLowerCase()}`}>{h.option_type}</span>
                            )}
                          </div>
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
                          <div className="symbol-row">
                            {h.symbol ? (
                              <Link to={`/company/${h.symbol}`} className="symbol-link">{h.symbol}</Link>
                            ) : (
                              <span className="cusip">{h.cusip}</span>
                            )}
                            {h.option_type && (
                              <span className={`option-badge ${h.option_type.toLowerCase()}`}>{h.option_type}</span>
                            )}
                          </div>
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
              <h2 className="section-label">Sector Breakdown</h2>
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
                      const color = getSectorColor(sector.sector, idx);

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
                        style={{ backgroundColor: getSectorColor(sector.sector, idx) }}
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
              <h2 className="section-label">By Allocation</h2>
              <div className="sector-chart">
                {stats.sectorAllocation?.slice(0, 8).map((sector, idx) => {
                  const color = getSectorColor(sector.sector, idx);
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
              <h2 className="section-label">Top 10 Holdings</h2>
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
