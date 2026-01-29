// frontend/src/components/research/QuantWorkbench/FactorRepository.js
// Factor Repository - Unified view of standard, custom, and combination factors

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader, AlertTriangle, Trash2, Eye, Copy, ToggleRight, ToggleLeft,
  Search, Filter, TrendingUp, Calculator, Sliders, Target, Activity,
  ChevronDown, ChevronUp
} from '../../icons';

// ============================================================
// STANDARD FACTOR DEFINITIONS
// These are the 6 core factors available to all users
// ============================================================
const STANDARD_FACTORS = [
  {
    id: 'value',
    name: 'Value',
    formula: '(earnings_yield + fcf_yield) / 2 - (pe_ratio_zscore + pb_ratio_zscore) / 2',
    description: 'Identifies undervalued stocks based on P/E, P/B, earnings yield, and FCF yield',
    higherIsBetter: true,
    type: 'standard',
    category: 'value',
    Icon: Calculator,
    metrics: ['pe_ratio', 'pb_ratio', 'earnings_yield', 'fcf_yield'],
    academicBasis: 'Fama-French HML factor',
    expectedIC: { low: 0.02, high: 0.04 }
  },
  {
    id: 'quality',
    name: 'Quality',
    formula: '(roe + roic + operating_margin) / 3 * (1 - debt_to_equity_zscore)',
    description: 'Measures company quality via profitability, margins, and balance sheet strength',
    higherIsBetter: true,
    type: 'standard',
    category: 'quality',
    Icon: Target,
    metrics: ['roe', 'roic', 'roa', 'operating_margin', 'net_margin', 'current_ratio', 'interest_coverage'],
    academicBasis: 'Novy-Marx Gross Profitability, Asness QMJ',
    expectedIC: { low: 0.015, high: 0.03 }
  },
  {
    id: 'momentum',
    name: 'Momentum',
    formula: 'return_12m * 0.5 + return_6m * 0.3 + return_3m * 0.2',
    description: 'Captures price momentum over 3, 6, and 12 month horizons',
    higherIsBetter: true,
    type: 'standard',
    category: 'momentum',
    Icon: TrendingUp,
    metrics: ['return_1m', 'return_3m', 'return_6m', 'return_12m'],
    academicBasis: 'Jegadeesh-Titman momentum',
    expectedIC: { low: 0.03, high: 0.06 }
  },
  {
    id: 'growth',
    name: 'Growth',
    formula: '(revenue_growth_yoy + earnings_growth_yoy + fcf_growth_yoy) / 3',
    description: 'Measures business growth via revenue, earnings, and cash flow growth rates',
    higherIsBetter: true,
    type: 'standard',
    category: 'growth',
    Icon: Activity,
    metrics: ['revenue_growth_yoy', 'earnings_growth_yoy', 'fcf_growth_yoy'],
    academicBasis: 'Growth investing fundamentals',
    expectedIC: { low: 0.01, high: 0.025 }
  },
  {
    id: 'size',
    name: 'Size (Small Cap)',
    formula: '-1 * market_cap_zscore',
    description: 'Small cap factor - favors smaller companies (negative market cap rank)',
    higherIsBetter: true,
    type: 'standard',
    category: 'size',
    Icon: Sliders,
    metrics: ['market_cap'],
    academicBasis: 'Fama-French SMB factor',
    expectedIC: { low: 0.005, high: 0.02 }
  },
  {
    id: 'volatility',
    name: 'Low Volatility',
    formula: '-1 * (volatility_252d * 0.7 + beta * 0.3)',
    description: 'Low volatility anomaly - favors stocks with lower price volatility and beta',
    higherIsBetter: true,
    type: 'standard',
    category: 'volatility',
    Icon: Activity,
    metrics: ['volatility_60d', 'volatility_252d', 'beta'],
    academicBasis: 'Low volatility anomaly (Baker, Bradley, Wurgler)',
    expectedIC: { low: 0.01, high: 0.025 }
  }
];

// ============================================================
// TYPE BADGE COMPONENT
// ============================================================
function TypeBadge({ type }) {
  const config = {
    standard: { label: 'Standard', className: 'type-standard' },
    custom: { label: 'Custom', className: 'type-custom' },
    combination: { label: 'Combination', className: 'type-combination' }
  };

  const { label, className } = config[type] || config.custom;

  return <span className={`type-badge ${className}`}>{label}</span>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FactorRepository({
  onFactorSelect,
  selectedFactorId,
  showStandardFactors = true,
  showCombinations = true
}) {
  const [customFactors, setCustomFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('type');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [deleting, setDeleting] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedStandardFactors, setExpandedStandardFactors] = useState({});

  // Load custom factors from API
  const loadFactors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/factors/user?sortBy=created_at&order=DESC&includeInactive=true`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load factors');
      }

      // Mark custom factors with type
      const customWithType = (data.data || []).map(f => ({
        ...f,
        type: f.isCombination ? 'combination' : 'custom'
      }));

      setCustomFactors(customWithType);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  // Combine all factors into unified list
  const allFactors = useMemo(() => {
    const factors = [];

    // Add standard factors if enabled
    if (showStandardFactors) {
      factors.push(...STANDARD_FACTORS);
    }

    // Add custom factors
    const customs = customFactors.filter(f => f.type === 'custom');
    factors.push(...customs);

    // Add combinations if enabled
    if (showCombinations) {
      const combos = customFactors.filter(f => f.type === 'combination');
      factors.push(...combos);
    }

    return factors;
  }, [showStandardFactors, showCombinations, customFactors]);

  // Filter and sort factors
  const filteredFactors = useMemo(() => {
    let result = [...allFactors];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.formula?.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query) ||
        f.metrics?.some(m => m.toLowerCase().includes(query))
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter(f => f.type === typeFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'type':
          // Standard first, then custom, then combination
          const typeOrder = { standard: 0, custom: 1, combination: 2 };
          comparison = typeOrder[a.type] - typeOrder[b.type];
          if (comparison === 0) comparison = a.name.localeCompare(b.name);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created_at':
          // Standard factors don't have createdAt, put them first
          if (!a.createdAt && !b.createdAt) comparison = a.name.localeCompare(b.name);
          else if (!a.createdAt) comparison = -1;
          else if (!b.createdAt) comparison = 1;
          else comparison = new Date(b.createdAt) - new Date(a.createdAt);
          break;
        case 'ic':
          const aIC = a.icStats?.[21] ?? a.expectedIC?.high ?? -999;
          const bIC = b.icStats?.[21] ?? b.expectedIC?.high ?? -999;
          comparison = bIC - aIC;
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'ASC' ? comparison : -comparison;
    });

    return result;
  }, [allFactors, searchQuery, typeFilter, sortBy, sortOrder]);

  // Delete custom factor
  const handleDelete = async (factorId) => {
    if (!window.confirm('Are you sure you want to delete this factor? This action cannot be undone.')) {
      return;
    }

    setDeleting(factorId);

    try {
      const response = await fetch(`/api/factors/user/${factorId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete factor');
      }

      setCustomFactors(prev => prev.filter(f => f.id !== factorId));
    } catch (err) {
      alert('Failed to delete factor: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  // Toggle active status for custom factors
  const handleToggleActive = async (factorId, currentActive) => {
    try {
      const response = await fetch(`/api/factors/user/${factorId}/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to toggle active status');
      }

      setCustomFactors(prev => prev.map(f =>
        f.id === factorId ? { ...f, isActive: !currentActive } : f
      ));
    } catch (err) {
      alert('Failed to toggle active status: ' + err.message);
    }
  };

  // Copy formula to clipboard
  const copyFormula = (formula) => {
    navigator.clipboard.writeText(formula);
  };

  // Toggle expanded state for standard factors
  const toggleExpanded = (factorId) => {
    setExpandedStandardFactors(prev => ({
      ...prev,
      [factorId]: !prev[factorId]
    }));
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get quality badge
  const getQualityBadge = (factor) => {
    // For standard factors, use expected IC
    if (factor.type === 'standard') {
      if (factor.expectedIC?.high >= 0.03) {
        return <span className="quality-badge strong">Strong</span>;
      }
      return <span className="quality-badge moderate">Moderate</span>;
    }

    // For custom factors, use actual stats
    if (!factor.icTstat) {
      return <span className="quality-badge untested">Untested</span>;
    }

    if (factor.icTstat > 2 && factor.wfe > 0.5 && factor.uniquenessScore > 0.3) {
      return <span className="quality-badge strong">Strong</span>;
    } else if (factor.icTstat > 1.5 && factor.wfe > 0.3) {
      return <span className="quality-badge moderate">Moderate</span>;
    } else if (factor.icTstat > 1) {
      return <span className="quality-badge weak">Weak</span>;
    }
    return <span className="quality-badge untested">Untested</span>;
  };

  // Count by type
  const typeCounts = useMemo(() => ({
    all: allFactors.length,
    standard: allFactors.filter(f => f.type === 'standard').length,
    custom: allFactors.filter(f => f.type === 'custom').length,
    combination: allFactors.filter(f => f.type === 'combination').length
  }), [allFactors]);

  if (loading && customFactors.length === 0) {
    return (
      <div className="factor-repository loading">
        <Loader size={24} className="spin" />
        <span>Loading factors...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="factor-repository error">
        <AlertTriangle size={24} />
        <span>{error}</span>
        <button onClick={loadFactors}>Retry</button>
      </div>
    );
  }

  return (
    <div className="factor-repository">
      {/* Header with Search and Filters */}
      <div className="repository-header">
        <div className="header-title">
          <h4>All Factors</h4>
          <span className="factor-count">{filteredFactors.length} of {allFactors.length} factors</span>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="repository-controls">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search factors by name, formula, or metrics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-controls">
          {/* Type Filter Pills */}
          <div className="type-pills">
            {['all', 'standard', 'custom', 'combination'].map(type => (
              <button
                key={type}
                className={`type-pill ${typeFilter === type ? 'active' : ''}`}
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                <span className="pill-count">{typeCounts[type]}</span>
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split('-');
              setSortBy(sort);
              setSortOrder(order);
            }}
            className="sort-select"
          >
            <option value="type-ASC">Type (Standard First)</option>
            <option value="name-ASC">Name (A-Z)</option>
            <option value="name-DESC">Name (Z-A)</option>
            <option value="created_at-DESC">Newest First</option>
            <option value="ic-DESC">Best IC First</option>
          </select>
        </div>
      </div>

      {/* Factor List */}
      {filteredFactors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Search size={48} />
          </div>
          <h4>No factors found</h4>
          <p>
            {searchQuery || typeFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Create your first custom factor using the Configure tab.'}
          </p>
        </div>
      ) : (
        <div className="factor-list">
          {filteredFactors.map(factor => {
            const isStandard = factor.type === 'standard';
            const isExpanded = expandedStandardFactors[factor.id];
            const FactorIcon = factor.Icon || Calculator;

            return (
              <div
                key={factor.id}
                className={`factor-card ${selectedFactorId === factor.id ? 'selected' : ''} ${factor.isActive ? 'active' : ''} ${factor.type}`}
              >
                <div className="factor-main">
                  <div className="factor-header">
                    <div className="factor-name-row">
                      <div className="factor-icon-name">
                        <FactorIcon size={18} className="factor-icon" />
                        <h5>{factor.name}</h5>
                      </div>
                      <div className="factor-badges">
                        <TypeBadge type={factor.type} />
                        {getQualityBadge(factor)}
                        {factor.isActive && <span className="active-badge">Active</span>}
                      </div>
                    </div>

                    <div className="factor-formula">
                      <code>{factor.formula}</code>
                      <button
                        className="copy-btn"
                        onClick={() => copyFormula(factor.formula)}
                        title="Copy formula"
                      >
                        <Copy size={14} />
                      </button>
                    </div>

                    {factor.description && (
                      <p className="factor-description">{factor.description}</p>
                    )}
                  </div>

                  {/* Standard Factor Expandable Details */}
                  {isStandard && (
                    <button
                      className="expand-toggle"
                      onClick={() => toggleExpanded(factor.id)}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {isExpanded ? 'Less details' : 'More details'}
                    </button>
                  )}

                  {isStandard && isExpanded && (
                    <div className="standard-details">
                      <div className="detail-row">
                        <span className="detail-label">Academic Basis:</span>
                        <span className="detail-value">{factor.academicBasis}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Expected IC Range:</span>
                        <span className="detail-value">
                          {(factor.expectedIC.low * 100).toFixed(1)}% - {(factor.expectedIC.high * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Metrics Used:</span>
                        <span className="detail-value metrics-list">
                          {factor.metrics.map(m => (
                            <code key={m}>{m}</code>
                          ))}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Stats for Custom Factors */}
                  {!isStandard && factor.icStats && (
                    <div className="factor-stats">
                      <div className="stat">
                        <span className="stat-label">IC (21d)</span>
                        <span className={`stat-value ${factor.icStats?.[21] > 0 ? 'positive' : factor.icStats?.[21] < 0 ? 'negative' : ''}`}>
                          {factor.icStats?.[21] != null ? `${(factor.icStats[21] * 100).toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">T-Stat</span>
                        <span className={`stat-value ${factor.icTstat > 2 ? 'positive' : ''}`}>
                          {factor.icTstat?.toFixed(2) || '-'}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Uniqueness</span>
                        <span className={`stat-value ${factor.uniquenessScore > 0.5 ? 'positive' : factor.uniquenessScore < 0.3 ? 'negative' : ''}`}>
                          {factor.uniquenessScore != null ? `${(factor.uniquenessScore * 100).toFixed(0)}%` : '-'}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">WFE</span>
                        <span className={`stat-value ${factor.wfe > 0.5 ? 'positive' : factor.wfe < 0.3 ? 'negative' : ''}`}>
                          {factor.wfe != null ? `${(factor.wfe * 100).toFixed(0)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Meta for Custom Factors */}
                  {!isStandard && (
                    <div className="factor-meta">
                      {factor.requiredMetrics && (
                        <span className="meta-item">
                          Uses: {factor.requiredMetrics.join(', ')}
                        </span>
                      )}
                      {factor.createdAt && (
                        <span className="meta-item">
                          Created: {formatDate(factor.createdAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="factor-actions">
                  <button
                    className="action-btn analyze"
                    onClick={() => onFactorSelect(factor)}
                    title="Select for analysis"
                  >
                    <Eye size={16} />
                  </button>
                  {!isStandard && (
                    <>
                      <button
                        className={`action-btn toggle ${factor.isActive ? 'active' : ''}`}
                        onClick={() => handleToggleActive(factor.id, factor.isActive)}
                        title={factor.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {factor.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(factor.id)}
                        disabled={deleting === factor.id}
                        title="Delete factor"
                      >
                        {deleting === factor.id ? <Loader size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="repository-legend">
        <h5>Factor Types</h5>
        <div className="legend-items">
          <div className="legend-item">
            <TypeBadge type="standard" />
            <span>Pre-built factors based on academic research</span>
          </div>
          <div className="legend-item">
            <TypeBadge type="custom" />
            <span>Your own factor formulas from metrics</span>
          </div>
          <div className="legend-item">
            <TypeBadge type="combination" />
            <span>Weighted combinations of multiple factors</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export standard factors for use in other components
export { STANDARD_FACTORS };
