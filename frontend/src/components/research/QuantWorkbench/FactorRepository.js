// frontend/src/components/research/QuantWorkbench/FactorRepository.js
// Factor Repository - Unified view with integrated health status
// Supports table and panel views with detail popup

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader, AlertTriangle, Trash2, Eye, Copy, ToggleRight, ToggleLeft,
  Search, TrendingUp, Calculator, Sliders, Target, Activity,
  ChevronDown, ChevronUp, LayoutGrid, LayoutList, X, Info,
  CheckCircle, XCircle, Clock, RefreshCw
} from '../../icons';

// ============================================================
// STANDARD FACTOR DEFINITIONS
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

// IC thresholds for health status
const IC_THRESHOLDS = {
  STRONG: 0.03,
  MODERATE: 0.01,
  WEAK: 0
};

// ============================================================
// HELPER COMPONENTS
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

function HealthIndicator({ status, compact = false }) {
  const config = {
    healthy: { Icon: CheckCircle, color: 'var(--positive)', label: 'Healthy' },
    caution: { Icon: AlertTriangle, color: 'var(--warning)', label: 'Caution' },
    weak: { Icon: XCircle, color: 'var(--negative)', label: 'Weak' },
    unknown: { Icon: Clock, color: 'var(--text-tertiary)', label: 'Untested' }
  };
  const { Icon, color, label } = config[status] || config.unknown;

  if (compact) {
    return (
      <span className={`health-indicator compact ${status}`} title={label}>
        <Icon size={14} style={{ color }} />
      </span>
    );
  }

  return (
    <span className={`health-indicator ${status}`}>
      <Icon size={14} style={{ color }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

// ============================================================
// FACTOR DETAIL POPUP
// ============================================================
function FactorDetailPopup({ factor, onClose, onSelect }) {
  if (!factor) return null;

  const isStandard = factor.type === 'standard';
  const FactorIcon = factor.Icon || Calculator;

  return (
    <div className="factor-detail-overlay" onClick={onClose}>
      <div className="factor-detail-popup" onClick={e => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* Header */}
        <div className="popup-header">
          <div className="popup-icon">
            <FactorIcon size={24} />
          </div>
          <div className="popup-title">
            <h3>{factor.name}</h3>
            <div className="popup-badges">
              <TypeBadge type={factor.type} />
              <HealthIndicator status={factor.healthStatus} />
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="popup-description">{factor.description}</p>

        {/* Formula */}
        <div className="popup-section">
          <h4>Formula</h4>
          <code className="popup-formula">{factor.formula}</code>
        </div>

        {/* Academic Basis (Standard factors) */}
        {isStandard && factor.academicBasis && (
          <div className="popup-section">
            <h4>Academic Basis</h4>
            <p>{factor.academicBasis}</p>
          </div>
        )}

        {/* IC Range */}
        <div className="popup-section">
          <h4>IC Performance</h4>
          <div className="popup-stats">
            {isStandard ? (
              <>
                <div className="popup-stat">
                  <span className="stat-label">Expected IC Range</span>
                  <span className="stat-value">
                    {(factor.expectedIC.low * 100).toFixed(1)}% - {(factor.expectedIC.high * 100).toFixed(1)}%
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="popup-stat">
                  <span className="stat-label">IC (21d)</span>
                  <span className={`stat-value ${factor.ic21d > 0 ? 'positive' : factor.ic21d < 0 ? 'negative' : ''}`}>
                    {factor.ic21d != null ? `${(factor.ic21d * 100).toFixed(2)}%` : '-'}
                  </span>
                </div>
                <div className="popup-stat">
                  <span className="stat-label">T-Statistic</span>
                  <span className={`stat-value ${factor.tstat > 2 ? 'positive' : ''}`}>
                    {factor.tstat?.toFixed(2) || '-'}
                  </span>
                </div>
                <div className="popup-stat">
                  <span className="stat-label">IC IR</span>
                  <span className="stat-value">
                    {factor.icIR?.toFixed(2) || '-'}
                  </span>
                </div>
                <div className="popup-stat">
                  <span className="stat-label">Uniqueness</span>
                  <span className={`stat-value ${factor.uniquenessScore > 0.5 ? 'positive' : ''}`}>
                    {factor.uniquenessScore != null ? `${(factor.uniquenessScore * 100).toFixed(0)}%` : '-'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Metrics Used */}
        <div className="popup-section">
          <h4>Metrics Used</h4>
          <div className="popup-metrics">
            {(factor.metrics || factor.requiredMetrics || []).map(m => (
              <code key={m} className="metric-tag">{m}</code>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="popup-actions">
          <button className="btn-primary" onClick={() => { onSelect(factor); onClose(); }}>
            <Eye size={16} />
            Analyze Factor
          </button>
        </div>
      </div>
    </div>
  );
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
  const [healthData, setHealthData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('type');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [deleting, setDeleting] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('panels'); // 'table' or 'panels'
  const [selectedPopupFactor, setSelectedPopupFactor] = useState(null);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

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

  // Load health data for all factors
  const loadHealthData = useCallback(async (factors) => {
    setRefreshingHealth(true);
    const health = {};

    try {
      // Fetch IC stats for each factor
      await Promise.all(
        factors.map(async (factor) => {
          try {
            if (factor.type === 'custom' && factor.ic_stats) {
              // Use stored stats for custom factors
              const ic21d = factor.ic_stats?.['21'] || factor.ic_stats?.ic_21d || 0;
              const tstat = factor.ic_tstat || 0;
              health[factor.id] = {
                ic21d,
                tstat,
                icIR: factor.ic_ir || 0,
                status: getHealthStatus(ic21d, tstat)
              };
            } else if (factor.type === 'standard') {
              // For standard factors, use expected IC
              health[factor.id] = {
                ic21d: factor.expectedIC?.high || 0,
                tstat: 2.5, // Assume significant for standard
                status: factor.expectedIC?.high >= IC_THRESHOLDS.STRONG ? 'healthy' : 'caution'
              };
            } else {
              health[factor.id] = { status: 'unknown' };
            }
          } catch {
            health[factor.id] = { status: 'unknown' };
          }
        })
      );

      setHealthData(health);
    } finally {
      setRefreshingHealth(false);
    }
  }, []);

  // Calculate health status based on IC and t-stat
  const getHealthStatus = (ic, tstat) => {
    const absIC = Math.abs(ic || 0);
    const absTstat = Math.abs(tstat || 0);

    if (absIC >= IC_THRESHOLDS.STRONG && absTstat >= 2) return 'healthy';
    if (absIC >= IC_THRESHOLDS.MODERATE && absTstat >= 1.5) return 'caution';
    if (absIC > 0) return 'weak';
    return 'unknown';
  };

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  // Combine all factors into unified list
  const allFactors = useMemo(() => {
    const factors = [];
    if (showStandardFactors) factors.push(...STANDARD_FACTORS);
    const customs = customFactors.filter(f => f.type === 'custom');
    factors.push(...customs);
    if (showCombinations) {
      const combos = customFactors.filter(f => f.type === 'combination');
      factors.push(...combos);
    }
    return factors;
  }, [showStandardFactors, showCombinations, customFactors]);

  // Load health when factors change
  useEffect(() => {
    if (allFactors.length > 0) {
      loadHealthData(allFactors);
    }
  }, [allFactors, loadHealthData]);

  // Enrich factors with health data
  const enrichedFactors = useMemo(() => {
    return allFactors.map(f => ({
      ...f,
      healthStatus: healthData[f.id]?.status || 'unknown',
      ic21d: healthData[f.id]?.ic21d ?? f.icStats?.[21] ?? f.expectedIC?.high,
      tstat: healthData[f.id]?.tstat ?? f.icTstat,
      icIR: healthData[f.id]?.icIR ?? f.icIR
    }));
  }, [allFactors, healthData]);

  // Filter and sort factors
  const filteredFactors = useMemo(() => {
    let result = [...enrichedFactors];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.formula?.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query)
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter(f => f.type === typeFilter);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'type':
          const typeOrder = { standard: 0, custom: 1, combination: 2 };
          comparison = typeOrder[a.type] - typeOrder[b.type];
          if (comparison === 0) comparison = a.name.localeCompare(b.name);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'health':
          const healthOrder = { healthy: 0, caution: 1, weak: 2, unknown: 3 };
          comparison = healthOrder[a.healthStatus] - healthOrder[b.healthStatus];
          break;
        case 'ic':
          const aIC = a.ic21d ?? -999;
          const bIC = b.ic21d ?? -999;
          comparison = bIC - aIC;
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'ASC' ? comparison : -comparison;
    });

    return result;
  }, [enrichedFactors, searchQuery, typeFilter, sortBy, sortOrder]);

  // Delete custom factor
  const handleDelete = async (factorId) => {
    if (!window.confirm('Are you sure you want to delete this factor?')) return;
    setDeleting(factorId);
    try {
      const response = await fetch(`/api/factors/user/${factorId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      setCustomFactors(prev => prev.filter(f => f.id !== factorId));
    } catch (err) {
      alert('Failed to delete factor: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  // Toggle active status
  const handleToggleActive = async (factorId, currentActive) => {
    try {
      const response = await fetch(`/api/factors/user/${factorId}/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to toggle');
      setCustomFactors(prev => prev.map(f =>
        f.id === factorId ? { ...f, isActive: !currentActive } : f
      ));
    } catch (err) {
      alert('Failed to toggle: ' + err.message);
    }
  };

  // Copy formula
  const copyFormula = (formula) => {
    navigator.clipboard.writeText(formula);
  };

  // Type counts
  const typeCounts = useMemo(() => ({
    all: allFactors.length,
    standard: allFactors.filter(f => f.type === 'standard').length,
    custom: allFactors.filter(f => f.type === 'custom').length,
    combination: allFactors.filter(f => f.type === 'combination').length
  }), [allFactors]);

  // Health summary
  const healthSummary = useMemo(() => ({
    healthy: enrichedFactors.filter(f => f.healthStatus === 'healthy').length,
    caution: enrichedFactors.filter(f => f.healthStatus === 'caution').length,
    weak: enrichedFactors.filter(f => f.healthStatus === 'weak').length
  }), [enrichedFactors]);

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
      {/* Header with Health Summary */}
      <div className="repository-header">
        <div className="header-left">
          <h3>Factor Repository</h3>
          <span className="factor-count">{filteredFactors.length} factors</span>
        </div>
        <div className="header-right">
          {/* Health Summary Pills */}
          <div className="health-summary-pills">
            <span className="health-pill healthy">
              <CheckCircle size={14} />
              {healthSummary.healthy}
            </span>
            <span className="health-pill caution">
              <AlertTriangle size={14} />
              {healthSummary.caution}
            </span>
            <span className="health-pill weak">
              <XCircle size={14} />
              {healthSummary.weak}
            </span>
          </div>
          <button
            className="refresh-health-btn"
            onClick={() => loadHealthData(allFactors)}
            disabled={refreshingHealth}
            title="Refresh health data"
          >
            <RefreshCw size={14} className={refreshingHealth ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="repository-controls">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search factors..."
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

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split('-');
              setSortBy(sort);
              setSortOrder(order);
            }}
            className="sort-select"
          >
            <option value="type-ASC">Type</option>
            <option value="name-ASC">Name (A-Z)</option>
            <option value="health-ASC">Health (Best First)</option>
            <option value="ic-DESC">IC (Highest)</option>
          </select>

          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <LayoutList size={16} />
            </button>
            <button
              className={`view-btn ${viewMode === 'panels' ? 'active' : ''}`}
              onClick={() => setViewMode('panels')}
              title="Panel view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Factor List */}
      {filteredFactors.length === 0 ? (
        <div className="empty-state">
          <Search size={48} />
          <h4>No factors found</h4>
          <p>Try adjusting your search or filters.</p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="factor-table-container">
          <table className="factor-table">
            <thead>
              <tr>
                <th>Factor</th>
                <th>Type</th>
                <th className="right">IC (21d)</th>
                <th className="right">T-Stat</th>
                <th>Health</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFactors.map(factor => {
                const FactorIcon = factor.Icon || Calculator;
                return (
                  <tr
                    key={factor.id}
                    className={`factor-row ${selectedFactorId === factor.id ? 'selected' : ''}`}
                    onClick={() => setSelectedPopupFactor(factor)}
                  >
                    <td className="factor-name-cell">
                      <FactorIcon size={16} className="factor-icon" />
                      <span className="factor-name">{factor.name}</span>
                    </td>
                    <td>
                      <TypeBadge type={factor.type} />
                    </td>
                    <td className={`right mono ${factor.ic21d > 0 ? 'positive' : factor.ic21d < 0 ? 'negative' : ''}`}>
                      {factor.ic21d != null ? `${(factor.ic21d * 100).toFixed(2)}%` : '-'}
                    </td>
                    <td className={`right mono ${factor.tstat > 2 ? 'positive' : ''}`}>
                      {factor.tstat?.toFixed(2) || '-'}
                    </td>
                    <td>
                      <HealthIndicator status={factor.healthStatus} compact />
                    </td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button
                        className="action-btn"
                        onClick={() => onFactorSelect(factor)}
                        title="Analyze"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => setSelectedPopupFactor(factor)}
                        title="Details"
                      >
                        <Info size={14} />
                      </button>
                      {factor.type !== 'standard' && (
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(factor.id)}
                          disabled={deleting === factor.id}
                          title="Delete"
                        >
                          {deleting === factor.id ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Panel View */
        <div className="factor-panels">
          {filteredFactors.map(factor => {
            const FactorIcon = factor.Icon || Calculator;
            const isStandard = factor.type === 'standard';

            return (
              <div
                key={factor.id}
                className={`factor-panel ${selectedFactorId === factor.id ? 'selected' : ''} ${factor.healthStatus}`}
                onClick={() => setSelectedPopupFactor(factor)}
              >
                <div className="panel-header">
                  <div className="panel-icon">
                    <FactorIcon size={20} />
                  </div>
                  <div className="panel-title">
                    <h4>{factor.name}</h4>
                    <div className="panel-badges">
                      <TypeBadge type={factor.type} />
                      <HealthIndicator status={factor.healthStatus} compact />
                    </div>
                  </div>
                </div>

                <p className="panel-description">{factor.description}</p>

                <div className="panel-stats">
                  <div className="panel-stat">
                    <span className="stat-label">IC</span>
                    <span className={`stat-value ${factor.ic21d > 0 ? 'positive' : ''}`}>
                      {factor.ic21d != null ? `${(factor.ic21d * 100).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div className="panel-stat">
                    <span className="stat-label">T-Stat</span>
                    <span className={`stat-value ${factor.tstat > 2 ? 'positive' : ''}`}>
                      {factor.tstat?.toFixed(1) || '-'}
                    </span>
                  </div>
                  {!isStandard && factor.uniquenessScore != null && (
                    <div className="panel-stat">
                      <span className="stat-label">Unique</span>
                      <span className="stat-value">{(factor.uniquenessScore * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>

                <div className="panel-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="panel-action-btn primary"
                    onClick={() => onFactorSelect(factor)}
                  >
                    <Eye size={14} />
                    Analyze
                  </button>
                  {!isStandard && (
                    <>
                      <button
                        className={`panel-action-btn toggle ${factor.isActive ? 'active' : ''}`}
                        onClick={() => handleToggleActive(factor.id, factor.isActive)}
                        title={factor.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {factor.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button
                        className="panel-action-btn delete"
                        onClick={() => handleDelete(factor.id)}
                        disabled={deleting === factor.id}
                      >
                        {deleting === factor.id ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Popup */}
      {selectedPopupFactor && (
        <FactorDetailPopup
          factor={selectedPopupFactor}
          onClose={() => setSelectedPopupFactor(null)}
          onSelect={onFactorSelect}
        />
      )}
    </div>
  );
}

export { STANDARD_FACTORS };
