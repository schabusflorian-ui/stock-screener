// frontend/src/pages/portfolios/PortfolioListPage.js
import { useState, useEffect, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Calendar,
  ChevronRight,
  RefreshCw,
  Wallet,
  Target,
  Copy,
  PieChart,
  IconButton,
  Search,
  Filter,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from '../../components/icons';
import { portfoliosAPI } from '../../services/api';
import CreatePortfolioModal from '../../components/portfolio/CreatePortfolioModal';
import { SkeletonPortfolioList } from '../../components/Skeleton';
import './PortfolioListPage.css';

const PORTFOLIO_TYPE_LABELS = {
  manual: 'Manual',
  clone: 'Manual',  // Clone portfolios show as Manual unless famous investor
  etf_model: 'ETF',
  backtest: 'Manual',
  bot: 'AI',
  agent_managed: 'AI'
};

const PORTFOLIO_TYPE_ICONS = {
  manual: Wallet,
  clone: Copy,
  etf_model: BarChart3,
  backtest: Target,
  bot: Target,
  agent_managed: Target
};

// Tag color schemes for different portfolio types
const PORTFOLIO_TAG_STYLES = {
  manual: 'tag-manual',
  clone: 'tag-manual',  // Clone portfolios use manual style unless famous investor
  etf_model: 'tag-etf',
  backtest: 'tag-manual',
  bot: 'tag-ai',
  agent_managed: 'tag-ai'
};

// Check if portfolio is a famous investor clone
const getFamousInvestorTag = (name) => {
  const famousInvestors = [
    'Warren Buffett', 'Buffett',
    'Michael Burry', 'Burry',
    'Ray Dalio', 'Dalio',
    'Bill Ackman', 'Ackman',
    'Carl Icahn', 'Icahn',
    'Daniel Loeb', 'Loeb',
    'David Einhorn', 'Einhorn',
    'Seth Klarman', 'Klarman',
    'Howard Marks', 'Marks',
    'George Soros', 'Soros'
  ];

  const lowerName = name.toLowerCase();
  for (const investor of famousInvestors) {
    if (lowerName.includes(investor.toLowerCase())) {
      return investor;
    }
  }
  return null;
};

// Format helpers
const formatValue = (value) => {
  if (!value && value !== 0) return '-';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Memoized PortfolioCard component to prevent re-renders
const PortfolioCard = memo(function PortfolioCard({ portfolio }) {
  const portfolioType = portfolio.portfolio_type || portfolio.type || 'manual';
  const TypeIcon = PORTFOLIO_TYPE_ICONS[portfolioType] || Wallet;
  const isPositive = (portfolio.total_gain_pct || 0) >= 0;
  const tagStyle = PORTFOLIO_TAG_STYLES[portfolioType] || 'tag-manual';
  const famousInvestor = getFamousInvestorTag(portfolio.name);

  // Determine which tag to show - famous investor replaces manual/clone tag
  const showTypeTag = portfolioType === 'etf_model' || portfolioType === 'bot' || portfolioType === 'agent_managed';
  const typeLabel = PORTFOLIO_TYPE_LABELS[portfolioType] || 'Manual';

  return (
    <Link
      to={`/portfolios/${portfolio.id}`}
      className="portfolio-card"
    >
      <div className="card-header">
        <IconButton
          icon={TypeIcon}
          colorScheme="portfolio"
          size="small"
          className="portfolio-icon-btn"
        />
        <div className="portfolio-info">
          <h3>{portfolio.name}</h3>
          <div className="portfolio-tags">
            {famousInvestor ? (
              <span className="portfolio-tag tag-famous">
                Famous Investor
              </span>
            ) : showTypeTag ? (
              <span className={`portfolio-tag ${tagStyle}`}>
                {typeLabel}
              </span>
            ) : (
              <span className="portfolio-tag tag-manual">
                Manual
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={20} className="card-arrow" />
      </div>

      <div className="card-value">
        <span className="value-label">Total Value</span>
        <span className="value-amount">{formatValue(portfolio.total_value)}</span>
      </div>

      <div className="card-performance">
        <div className={`performance-item ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span className="performance-value">
            {formatPercent(portfolio.total_gain_pct)}
          </span>
          <span className="performance-amount">
            ({formatValue(portfolio.total_gain)})
          </span>
        </div>
      </div>

      <div className="card-stats">
        <div className="stat-item">
          <BarChart3 size={14} />
          <span>{portfolio.positions_count || 0} positions</span>
        </div>
        <div className="stat-item">
          <Wallet size={14} />
          <span>{formatValue(portfolio.cash_balance)} cash</span>
        </div>
      </div>

      <div className="card-footer">
        <Calendar size={12} />
        <span>Updated {formatDate(portfolio.updated_at)}</span>
      </div>
    </Link>
  );
});

// Type filter labels
const TYPE_FILTER_OPTIONS = {
  all: 'All Types',
  manual: 'Manual',
  famous: 'Famous Investor',
  etf_model: 'ETF',
  bot: 'AI'
};

function PortfolioListPage() {
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalMode, setCreateModalMode] = useState('manual');
  const [totalStats, setTotalStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [sortConfig, setSortConfig] = useState({ key: 'total_value', direction: 'desc' });

  useEffect(() => {
    loadPortfolios();
  }, []);

  // Filtering logic
  const filteredPortfolios = useMemo(() => {
    return portfolios.filter(portfolio => {
      const matchesSearch = portfolio.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const portfolioType = portfolio.portfolio_type || portfolio.type || 'manual';
      const isFamousInvestor = getFamousInvestorTag(portfolio.name) !== null;

      let matchesType = false;
      if (typeFilter === 'all') {
        matchesType = true;
      } else if (typeFilter === 'famous') {
        matchesType = isFamousInvestor;
      } else if (typeFilter === 'manual') {
        // Manual excludes famous investors (they're clones)
        matchesType = portfolioType === 'manual' && !isFamousInvestor;
      } else if (typeFilter === 'bot') {
        // AI filter should match both 'bot' and 'agent_managed' types
        matchesType = portfolioType === 'bot' || portfolioType === 'agent_managed';
      } else {
        matchesType = portfolioType === typeFilter;
      }

      return matchesSearch && matchesType;
    });
  }, [portfolios, searchTerm, typeFilter]);

  // Sorting logic
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} />;
    return sortConfig.direction === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />;
  };

  const sortedPortfolios = useMemo(() => {
    const sorted = [...filteredPortfolios];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle null/undefined
      if (aVal == null) aVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;
      if (bVal == null) bVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;

      // String comparison for name
      if (sortConfig.key === 'name') {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      // Date comparison
      if (sortConfig.key === 'updated_at') {
        aVal = new Date(aVal).getTime() || 0;
        bVal = new Date(bVal).getTime() || 0;
      }

      // Numeric comparison
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [filteredPortfolios, sortConfig]);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      const res = await portfoliosAPI.getAll();
      const portfolioList = res.data.portfolios || [];
      setPortfolios(portfolioList);

      // Calculate total stats
      const stats = portfolioList.reduce((acc, p) => ({
        totalValue: acc.totalValue + (p.total_value || 0),
        totalGain: acc.totalGain + (p.total_gain || 0),
        totalCost: acc.totalCost + ((p.total_value || 0) - (p.total_gain || 0)),
        portfolioCount: acc.portfolioCount + 1
      }), { totalValue: 0, totalGain: 0, totalCost: 0, portfolioCount: 0 });

      // Calculate aggregated performance percentage
      stats.totalGainPct = stats.totalCost > 0
        ? ((stats.totalGain / stats.totalCost) * 100)
        : 0;

      setTotalStats(stats);
    } catch (err) {
      console.error('Error loading portfolios:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="portfolio-list-page">
        <SkeletonPortfolioList />
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-list-page">
        <div className="error-container">
          <p>Error loading portfolios: {error}</p>
          <button onClick={loadPortfolios} className="btn btn-primary">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-list-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-title">
            <Briefcase size={28} />
            <div>
              <h1>My Portfolios</h1>
              <p className="header-subtitle">
                Track, manage, and simulate your investment portfolios
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCreateModalMode('clone');
                setShowCreateModal(true);
              }}
            >
              <Copy size={16} />
              Clone Investor
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCreateModalMode('etf_model');
                setShowCreateModal(true);
              }}
            >
              <PieChart size={16} />
              ETF Model
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setCreateModalMode('manual');
                setShowCreateModal(true);
              }}
            >
              <Plus size={16} />
              New Portfolio
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {totalStats && portfolios.length > 0 && (
          <div className="summary-stats">
            <div className="summary-stat">
              <Briefcase size={20} />
              <div>
                <span className="stat-label">Portfolios</span>
                <span className="stat-value">{totalStats.portfolioCount}</span>
              </div>
            </div>
            <div className="summary-stat">
              <DollarSign size={20} />
              <div>
                <span className="stat-label">Total Value</span>
                <span className="stat-value">{formatValue(totalStats.totalValue)}</span>
              </div>
            </div>
            <div className={`summary-stat ${totalStats.totalGain >= 0 ? 'positive' : 'negative'}`}>
              {totalStats.totalGain >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <div>
                <span className="stat-label">Total Gain/Loss</span>
                <span className="stat-value">{formatValue(totalStats.totalGain)}</span>
              </div>
            </div>
            <div className={`summary-stat ${totalStats.totalGainPct >= 0 ? 'positive' : 'negative'}`}>
              {totalStats.totalGainPct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <div>
                <span className="stat-label">Avg. Return</span>
                <span className="stat-value">{formatPercent(totalStats.totalGainPct)}</span>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="page-content">
        {portfolios.length === 0 ? (
          <div className="empty-state">
            <Briefcase size={64} className="empty-icon" />
            <h2>No portfolios yet</h2>
            <p>Create your first portfolio to start tracking your investments</p>
            <div className="empty-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCreateModalMode('manual');
                  setShowCreateModal(true);
                }}
              >
                <Plus size={16} />
                Create Portfolio
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCreateModalMode('etf_model');
                  setShowCreateModal(true);
                }}
              >
                <PieChart size={16} />
                ETF Model
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCreateModalMode('clone');
                  setShowCreateModal(true);
                }}
              >
                <Copy size={16} />
                Clone Investor
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters Bar */}
            <div className="filters-bar">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search portfolios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  {Object.entries(TYPE_FILTER_OPTIONS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="view-toggle">
                <button
                  className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table view"
                >
                  <LayoutList size={18} />
                </button>
                <button
                  className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  title="Card view"
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
            </div>

            {/* Table View */}
            {viewMode === 'table' && (
              <div className="portfolios-table-container">
                <table className="portfolios-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('name')}>
                        <span>Portfolio</span>
                        {getSortIcon('name')}
                      </th>
                      <th>Type</th>
                      <th className="sortable right" onClick={() => handleSort('total_value')}>
                        <span>Total Value</span>
                        {getSortIcon('total_value')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('total_gain_pct')}>
                        <span>Return</span>
                        {getSortIcon('total_gain_pct')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('positions_count')}>
                        <span>Positions</span>
                        {getSortIcon('positions_count')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('cash_balance')}>
                        <span>Cash</span>
                        {getSortIcon('cash_balance')}
                      </th>
                      <th className="sortable right" onClick={() => handleSort('updated_at')}>
                        <span>Updated</span>
                        {getSortIcon('updated_at')}
                      </th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPortfolios.map(portfolio => {
                      const portfolioType = portfolio.portfolio_type || portfolio.type || 'manual';
                      const TypeIcon = PORTFOLIO_TYPE_ICONS[portfolioType] || Wallet;
                      const isPositive = (portfolio.total_gain_pct || 0) >= 0;
                      const famousInvestor = getFamousInvestorTag(portfolio.name);
                      const tagStyle = famousInvestor ? 'tag-famous' : (PORTFOLIO_TAG_STYLES[portfolioType] || 'tag-manual');
                      const tagLabel = famousInvestor ? 'Famous Investor' : (PORTFOLIO_TYPE_LABELS[portfolioType] || 'Manual');

                      return (
                        <tr key={portfolio.id}>
                          <td>
                            <Link to={`/portfolios/${portfolio.id}`} className="portfolio-link">
                              <div className="portfolio-avatar-sm">
                                <TypeIcon size={16} />
                              </div>
                              <span className="portfolio-name">{portfolio.name}</span>
                            </Link>
                          </td>
                          <td>
                            <span className={`portfolio-tag-sm ${tagStyle}`}>
                              {tagLabel}
                            </span>
                          </td>
                          <td className="right value-cell">
                            {formatValue(portfolio.total_value)}
                          </td>
                          <td className={`right ${isPositive ? 'positive' : 'negative'}`}>
                            {formatPercent(portfolio.total_gain_pct)}
                          </td>
                          <td className="right">
                            {portfolio.positions_count || 0}
                          </td>
                          <td className="right">
                            {formatValue(portfolio.cash_balance)}
                          </td>
                          <td className="right date-cell">
                            {formatDate(portfolio.updated_at)}
                          </td>
                          <td className="actions-cell">
                            <Link
                              to={`/portfolios/${portfolio.id}`}
                              className="action-btn"
                              title="View details"
                            >
                              <ChevronRight size={16} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Card View */}
            {viewMode === 'cards' && (
              <div className="portfolios-grid">
                {sortedPortfolios.map(portfolio => (
                  <PortfolioCard key={portfolio.id} portfolio={portfolio} />
                ))}

                {/* Add New Card */}
                <button
                  className="portfolio-card add-card"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={32} />
                  <span>New Portfolio</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreatePortfolioModal
          initialMode={createModalMode}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newPortfolio) => {
            setPortfolios([...portfolios, newPortfolio]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

export default PortfolioListPage;
