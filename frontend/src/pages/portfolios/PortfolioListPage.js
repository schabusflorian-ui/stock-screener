// frontend/src/pages/portfolios/PortfolioListPage.js
import { useState, useEffect } from 'react';
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
  PieChart
} from 'lucide-react';
import { portfoliosAPI } from '../../services/api';
import CreatePortfolioModal from '../../components/portfolio/CreatePortfolioModal';
import { SkeletonPortfolioList } from '../../components/Skeleton';
import './PortfolioListPage.css';

const PORTFOLIO_TYPE_LABELS = {
  manual: 'Manual',
  clone: 'Clone',
  etf_model: 'ETF Model',
  backtest: 'Backtest'
};

const PORTFOLIO_TYPE_ICONS = {
  manual: Wallet,
  clone: Copy,
  etf_model: BarChart3,
  backtest: Target
};

function PortfolioListPage() {
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalMode, setCreateModalMode] = useState('manual');
  const [totalStats, setTotalStats] = useState(null);

  useEffect(() => {
    loadPortfolios();
  }, []);

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
        portfolioCount: acc.portfolioCount + 1
      }), { totalValue: 0, totalGain: 0, portfolioCount: 0 });

      setTotalStats(stats);
    } catch (err) {
      console.error('Error loading portfolios:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          <div className="portfolios-grid">
            {portfolios.map(portfolio => {
              const TypeIcon = PORTFOLIO_TYPE_ICONS[portfolio.type] || Wallet;
              const isPositive = (portfolio.total_gain_pct || 0) >= 0;

              return (
                <Link
                  key={portfolio.id}
                  to={`/portfolios/${portfolio.id}`}
                  className="portfolio-card"
                >
                  <div className="card-header">
                    <div className="portfolio-icon">
                      <TypeIcon size={20} />
                    </div>
                    <div className="portfolio-info">
                      <h3>{portfolio.name}</h3>
                      <span className="portfolio-type">
                        {PORTFOLIO_TYPE_LABELS[portfolio.type] || portfolio.type}
                      </span>
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
            })}

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
