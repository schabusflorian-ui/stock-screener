// frontend/src/pages/investors/InvestorListPage.js
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  DollarSign,
  Calendar,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  Briefcase,
  BarChart3,
  Plus,
  Award,
  Activity,
  Percent,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  LayoutList,
  ExternalLink,
  IconButton,
  TrendingUp,
  FileText
} from '../../components/icons';
import { investorsAPI, indicesAPI } from '../../services/api';
import { SkeletonInvestorList } from '../../components/Skeleton';
import './InvestorListPage.css';

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
  multi_strategy: 'Multi-Strategy',
  tail_risk: 'Tail Risk'
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
    multi_strategy: 'badge-style-multi-strategy',
    tail_risk: 'badge-style-tail-risk'
  };
  return styleMap[style] || 'badge-style-multi-strategy';
};

function InvestorListPage() {
  console.log('[InvestorListPage] Component mounting...');
  const [investors, setInvestors] = useState([]);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [styleFilter, setStyleFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [sortConfig, setSortConfig] = useState({ key: 'latest_portfolio_value', direction: 'desc' });
  const [addInvestorForm, setAddInvestorForm] = useState({
    name: '',
    fund_name: '',
    cik: '',
    investment_style: 'value',
    description: ''
  });
  const [cikSearchQuery, setCikSearchQuery] = useState('');
  const [cikSearchResults, setCikSearchResults] = useState([]);
  const [searchingCIK, setSearchingCIK] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    console.log('[InvestorListPage] loadData called');
    try {
      setLoading(true);
      console.log('[InvestorListPage] Fetching investors and indices...');
      // Use getMarket() instead of getAll() - returns ETF-based indices (SPY, QQQ, DIA)
      // with current prices from daily_prices table instead of stale market_index_prices
      const [investorsRes, indicesRes] = await Promise.all([
        investorsAPI.getAll(),
        indicesAPI.getMarket().catch(() => ({ data: [] }))
      ]);
      console.log('[InvestorListPage] Data received:', {
        investorsCount: investorsRes?.data?.investors?.length,
        indicesCount: indicesRes?.data?.length
      });

      setInvestors(investorsRes.data.investors || []);

      // Calculate aggregate benchmark data
      const totalPortfolioValue = investorsRes.data.investors.reduce((sum, inv) =>
        sum + (inv.latest_portfolio_value || 0), 0);
      const avgPositions = investorsRes.data.investors.length > 0
        ? investorsRes.data.investors.reduce((sum, inv) => sum + (inv.latest_positions_count || 0), 0) / investorsRes.data.investors.length
        : 0;

      // Handle response structure for getMarket() - returns array directly or { data: [...] }
      const indices = indicesRes.data?.data || indicesRes.data || [];

      setBenchmarkData({
        totalAUM: totalPortfolioValue,
        avgPositions: avgPositions,
        totalInvestors: investorsRes.data.investors.length,
        indices: indices.slice(0, 4) // Get top 4 indices for comparison
      });
    } catch (err) {
      console.error('Error loading investors:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    try {
      setRefreshing(true);
      await investorsAPI.fetchAll13F();
      // Start polling for updates
      setTimeout(loadData, 5000);
    } catch (err) {
      console.error('Error refreshing 13F data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearchCIK = async () => {
    if (!cikSearchQuery || cikSearchQuery.length < 3) {
      alert('Please enter at least 3 characters to search');
      return;
    }

    try {
      setSearchingCIK(true);
      const response = await investorsAPI.searchCIK(cikSearchQuery);
      setCikSearchResults(response.data.results || []);
    } catch (err) {
      console.error('Error searching CIK:', err);
      alert('Failed to search: ' + err.message);
    } finally {
      setSearchingCIK(false);
    }
  };

  const handleSelectCIK = (result) => {
    setAddInvestorForm({
      ...addInvestorForm,
      cik: result.cik,
      fund_name: result.name
    });
    setCikSearchResults([]);
    setCikSearchQuery('');
  };

  const handleAddInvestor = async (e) => {
    e.preventDefault();
    try {
      await investorsAPI.create(addInvestorForm);
      setShowAddModal(false);
      setAddInvestorForm({
        name: '',
        fund_name: '',
        cik: '',
        investment_style: 'value',
        description: ''
      });
      setCikSearchQuery('');
      setCikSearchResults([]);
      loadData();
    } catch (err) {
      console.error('Error adding investor:', err);
      alert('Failed to add investor: ' + err.message);
    }
  };

  const filteredInvestors = investors.filter(inv => {
    const matchesSearch = inv.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.fund_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStyle = styleFilter === 'all' || inv.investment_style === styleFilter;
    return matchesSearch && matchesStyle;
  });

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

  const sortedInvestors = useMemo(() => {
    const sorted = [...filteredInvestors];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle null/undefined
      if (aVal == null) aVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;
      if (bVal == null) bVal = sortConfig.key === 'name' ? 'zzz' : -Infinity;

      // String comparison for name and fund_name
      if (sortConfig.key === 'name' || sortConfig.key === 'fund_name' || sortConfig.key === 'investment_style') {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      // Date comparison
      if (sortConfig.key === 'latest_filing_date') {
        aVal = new Date(aVal).getTime() || 0;
        bVal = new Date(bVal).getTime() || 0;
      }

      // Numeric comparison
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [filteredInvestors, sortConfig]);

  const formatValue = (value) => {
    if (!value) return '-';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
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

  if (loading) {
    return (
      <div className="investor-list-page">
        <SkeletonInvestorList />
      </div>
    );
  }

  if (error) {
    return (
      <div className="investor-list-page">
        <div className="error-container">
          <p>Error loading data: {error}</p>
          <button onClick={loadData} className="btn btn-primary">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="investor-list-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-title">
            <Users size={28} />
            <div>
              <h1>Famous Investors</h1>
              <p className="header-subtitle">
                Track portfolios of legendary investors via SEC 13F filings
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
              {refreshing ? 'Fetching...' : 'Refresh 13F'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              Add Investor
            </button>
          </div>
        </div>

        {/* Summary Stats - matching Portfolio page style */}
        {benchmarkData && investors.length > 0 && (
          <div className="summary-stats">
            <div className="summary-stat">
              <Users size={20} />
              <div>
                <span className="stat-label">Investors</span>
                <span className="stat-value">{benchmarkData.totalInvestors}</span>
              </div>
            </div>
            <div className="summary-stat">
              <DollarSign size={20} />
              <div>
                <span className="stat-label">Total AUM</span>
                <span className="stat-value">{formatValue(benchmarkData.totalAUM)}</span>
              </div>
            </div>
            <div className="summary-stat">
              <BarChart3 size={20} />
              <div>
                <span className="stat-label">Avg Positions</span>
                <span className="stat-value">{Math.round(benchmarkData.avgPositions)}</span>
              </div>
            </div>
            <div className="summary-stat">
              <Award size={20} />
              <div>
                <span className="stat-label">Top Style</span>
                <span className="stat-value">
                  {STYLE_LABELS[Object.entries(investors.reduce((acc, inv) => {
                    acc[inv.investment_style] = (acc[inv.investment_style] || 0) + 1;
                    return acc;
                  }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]] || '-'}
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="page-content">

        {/* Filters */}
        <div className="filters-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search investors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Filter size={16} />
            <select
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
            >
              <option value="all">All Styles</option>
              {Object.entries(STYLE_LABELS).map(([key, label]) => (
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

        {/* Investors List */}
        <div className="investors-main">
          {/* Table View */}
          {viewMode === 'table' && (
            <div className="investors-table-container">
              <table className="investors-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>
                      <span>Investor</span>
                      {getSortIcon('name')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('investment_style')}>
                      <span>Style</span>
                      {getSortIcon('investment_style')}
                    </th>
                    <th className="sortable right" onClick={() => handleSort('latest_portfolio_value')}>
                      <span>Portfolio Value</span>
                      {getSortIcon('latest_portfolio_value')}
                    </th>
                    <th className="sortable right" onClick={() => handleSort('latest_positions_count')}>
                      <span>Positions</span>
                      {getSortIcon('latest_positions_count')}
                    </th>
                    <th className="sortable right" onClick={() => handleSort('latest_filing_date')}>
                      <span>Last Filing</span>
                      {getSortIcon('latest_filing_date')}
                    </th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvestors.map(investor => (
                    <tr key={investor.id}>
                      <td>
                        <Link to={`/investors/${investor.id}`} className="investor-link">
                          <div className="investor-avatar-sm">
                            {investor.name?.charAt(0) || 'I'}
                          </div>
                          <div className="investor-name-cell">
                            <span className="investor-name">{investor.name}</span>
                            <span className="fund-name">{investor.fund_name}</span>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span className={`investor-tag-sm ${getStyleBadgeClass(investor.investment_style)}`}>
                          {STYLE_LABELS[investor.investment_style] || investor.investment_style}
                        </span>
                      </td>
                      <td className="right value-cell">
                        {formatValue(investor.latest_portfolio_value)}
                      </td>
                      <td className="right">
                        {investor.latest_positions_count || '-'}
                      </td>
                      <td className="right date-cell">
                        {formatDate(investor.latest_filing_date)}
                      </td>
                      <td className="actions-cell">
                        <Link
                          to={`/investors/${investor.id}`}
                          className="action-btn"
                          title="View details"
                        >
                          <ChevronRight size={16} />
                        </Link>
                        {investor.cik && (
                          <a
                            href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${investor.cik}&type=13F-HR`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-btn"
                            title="SEC Filing"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Card View */}
          {viewMode === 'cards' && (
            <div className="investor-cards">
              {sortedInvestors.map(investor => (
                <Link
                  key={investor.id}
                  to={`/investors/${investor.id}`}
                  className="investor-card"
                >
                  <div className="card-header">
                    <div className="investor-avatar">
                      {investor.name?.charAt(0) || 'I'}
                    </div>
                    <div className="investor-info">
                      <h3>{investor.name}</h3>
                      <div className="investor-tags">
                        <span className={`investor-tag ${getStyleBadgeClass(investor.investment_style)}`}>
                          {STYLE_LABELS[investor.investment_style] || investor.investment_style}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={20} className="card-arrow" />
                  </div>

                  <div className="card-value">
                    <span className="value-label">Portfolio Value</span>
                    <span className="value-amount">{formatValue(investor.latest_portfolio_value)}</span>
                  </div>

                  <div className="card-performance">
                    <div className="performance-item neutral">
                      <FileText size={14} />
                      <span className="performance-value">
                        {investor.latest_positions_count || 0} Holdings
                      </span>
                      <span className="performance-label">
                        {investor.fund_name}
                      </span>
                    </div>
                  </div>

                  <div className="card-stats">
                    {investor.cik && (
                      <div className="stat-item">
                        <Briefcase size={14} />
                        <span>CIK: {investor.cik}</span>
                      </div>
                    )}
                  </div>

                  <div className="card-footer">
                    <Calendar size={12} />
                    <span>Last Filing {formatDate(investor.latest_filing_date)}</span>
                  </div>
                </Link>
              ))}

              {/* Add New Card */}
              <button
                className="investor-card add-card"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={32} />
                <span>Add Investor</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Investor Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Famous Investor</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddInvestor} className="investor-form">
              <div className="form-group">
                <label>Investor Name *</label>
                <input
                  type="text"
                  required
                  value={addInvestorForm.name}
                  onChange={(e) => setAddInvestorForm({...addInvestorForm, name: e.target.value})}
                  placeholder="Warren Buffett"
                />
              </div>
              <div className="form-group">
                <label>Fund Name *</label>
                <input
                  type="text"
                  required
                  value={addInvestorForm.fund_name}
                  onChange={(e) => setAddInvestorForm({...addInvestorForm, fund_name: e.target.value})}
                  placeholder="Berkshire Hathaway"
                />
              </div>
              <div className="form-group">
                <label>CIK Number *</label>
                <div className="cik-search-container">
                  <div className="search-input-group">
                    <input
                      type="text"
                      value={cikSearchQuery}
                      onChange={(e) => setCikSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchCIK())}
                      placeholder="Search by investor/fund name..."
                      className="cik-search-input"
                    />
                    <button
                      type="button"
                      onClick={handleSearchCIK}
                      disabled={searchingCIK || cikSearchQuery.length < 3}
                      className="btn-search-cik"
                    >
                      {searchingCIK ? <RefreshCw size={16} className="spinning" /> : <Search size={16} />}
                      Search
                    </button>
                  </div>
                  {cikSearchResults.length > 0 && (
                    <div className="cik-search-results">
                      {cikSearchResults.map((result, idx) => (
                        <div
                          key={idx}
                          className={`cik-result-item ${result.confidence === 'high' ? 'high-confidence' : ''}`}
                          onClick={() => handleSelectCIK(result)}
                        >
                          <div className="cik-result-name">{result.name}</div>
                          <div className="cik-result-cik">CIK: {result.cik}</div>
                          {result.confidence === 'high' && (
                            <span className="confidence-badge">Likely 13F Filer</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={addInvestorForm.cik}
                  onChange={(e) => setAddInvestorForm({...addInvestorForm, cik: e.target.value})}
                  placeholder="0001067983"
                  className="cik-manual-input"
                />
                <span className="form-hint">Search above or enter CIK manually</span>
              </div>
              <div className="form-group">
                <label>Investment Style</label>
                <select
                  value={addInvestorForm.investment_style}
                  onChange={(e) => setAddInvestorForm({...addInvestorForm, investment_style: e.target.value})}
                >
                  {Object.entries(STYLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={addInvestorForm.description}
                  onChange={(e) => setAddInvestorForm({...addInvestorForm, description: e.target.value})}
                  placeholder="Known for value investing and long-term holdings..."
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Plus size={16} />
                  Add Investor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvestorListPage;
