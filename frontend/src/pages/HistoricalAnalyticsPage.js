// frontend/src/pages/HistoricalAnalyticsPage.js
// Historical Analytics Dashboard - Factor performance, investor patterns, decision analytics

import { useState, useEffect, useCallback, lazy, Suspense, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAskAI } from '../hooks/useAskAI';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { historicalAPI, investorsAPI } from '../services/api';
// PageHeader removed - page now has cleaner tab-only navigation
import { SkeletonTable } from '../components/Skeleton';
import {
  BarChart2, TrendingUp, PieChart, Target, User,
  ArrowUpRight, ArrowDownRight, LogOut, Plus
} from '../components/icons';
import './HistoricalAnalyticsPage.css';

const TABS = [
  { id: 'overview', label: 'Overview', Icon: BarChart2 },
  { id: 'factors', label: 'Factor Analysis', Icon: TrendingUp },
  { id: 'styles', label: 'Investment Styles', Icon: PieChart },
  { id: 'decisions', label: 'Decisions', Icon: Target },
  { id: 'investors', label: 'Investor Patterns', Icon: User }
];

// Decision type icons
const DECISION_ICONS = {
  new_position: Plus,
  increased: ArrowUpRight,
  decreased: ArrowDownRight,
  sold_out: LogOut,
  default: BarChart2
};

// Only factors with percentile data in decision_factor_context (size/volatility not yet supported)
const FACTORS = ['value', 'quality', 'momentum', 'growth'];

function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPercent(num, decimals = 1) {
  if (num === null || num === undefined) return '-';
  const value = typeof num === 'number' ? num : parseFloat(num);
  if (isNaN(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

// Capitalize investment style labels properly
function formatStyleLabel(style) {
  if (!style) return 'Unknown';
  return style
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCurrency(num) {
  if (num === null || num === undefined) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

// Decision row component with Ask AI
const DecisionRow = memo(function DecisionRow({ decision, formatCurrency, formatPercent }) {
  const d = decision;
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: d.symbol,
    label: `${d.symbol} - ${d.investor_name} ${d.decision_type}`,
    data: {
      investorName: d.investor_name,
      decisionType: d.decision_type,
      decisionDate: d.decision_date,
      positionValue: d.position_value,
      return1y: d.return_1y,
      alpha1y: d.alpha_1y
    }
  }));

  return (
    <tr {...askAIProps}>
      <td>{d.decision_date}</td>
      <td>
        <Link to={`/investors/${d.investor_id || ''}`} className="investor-link">
          {d.investor_name}
        </Link>
      </td>
      <td>
        <Link to={`/company/${d.symbol}`} className="symbol-link">
          {d.symbol}
        </Link>
      </td>
      <td>
        <span className={`decision-badge ${d.decision_type}`}>
          {d.decision_type?.replace('_', ' ')}
        </span>
      </td>
      <td>{formatCurrency(d.position_value)}</td>
      <td>{d.portfolio_weight ? `${(d.portfolio_weight * 100).toFixed(2)}%` : '-'}</td>
      <td className={d.return_1y >= 0 ? 'positive' : 'negative'}>
        {d.return_1y !== null ? formatPercent(d.return_1y * 100) : '-'}
      </td>
      <td className={d.alpha_1y >= 0 ? 'positive' : 'negative'}>
        {d.alpha_1y !== null ? formatPercent(d.alpha_1y * 100) : '-'}
      </td>
    </tr>
  );
});

// Investor card component with Ask AI
const InvestorCard = memo(function InvestorCard({ investor, isSelected, onSelect }) {
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    label: `${investor.name} - ${investor.investment_style || 'Unknown Style'}`,
    data: {
      investorName: investor.name,
      investmentStyle: investor.investment_style,
      investorId: investor.id
    }
  }));

  return (
    <div
      className={`investor-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      {...askAIProps}
    >
      <span className="inv-name">{investor.name}</span>
      <span className="inv-style">{investor.investment_style || 'Unknown'}</span>
    </div>
  );
});

export default function HistoricalAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [stats, setStats] = useState(null);
  const [factorData, setFactorData] = useState({});
  const [selectedFactor, setSelectedFactor] = useState('value');
  const [decisions, setDecisions] = useState([]);
  const [decisionFilters, setDecisionFilters] = useState({
    decision_type: '',
    sector: '',
    limit: 50
  });
  const [investors, setInvestors] = useState([]);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [investorPatterns, setInvestorPatterns] = useState(null);

  // Chart data states
  const [factorTimeseries, setFactorTimeseries] = useState(null);
  const [styleData, setStyleData] = useState(null);
  const [classifying, setClassifying] = useState(false);

  // Fetch overview stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await historicalAPI.getStats();
        setStats(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load statistics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Fetch factor data when factors tab is active
  useEffect(() => {
    if (activeTab !== 'factors') return;

    const fetchFactorData = async () => {
      try {
        setLoading(true);
        const response = await historicalAPI.getFactorPerformance(selectedFactor);
        setFactorData(prev => ({ ...prev, [selectedFactor]: response.data }));
        setError(null);
      } catch (err) {
        setError('Failed to load factor data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (!factorData[selectedFactor]) {
      fetchFactorData();
    } else {
      setLoading(false);
    }
  }, [activeTab, selectedFactor, factorData]);

  // Fetch decisions when decisions tab is active
  const fetchDecisions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await historicalAPI.getDecisions(decisionFilters);
      setDecisions(response.data.decisions || []);
      setError(null);
    } catch (err) {
      setError('Failed to load decisions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [decisionFilters]);

  useEffect(() => {
    if (activeTab === 'decisions') {
      fetchDecisions();
    }
  }, [activeTab, fetchDecisions]);

  // Fetch investors list
  useEffect(() => {
    if (activeTab !== 'investors') return;

    const fetchInvestors = async () => {
      try {
        setLoading(true);
        const response = await investorsAPI.getAll();
        setInvestors(response.data?.investors || response.data || []);
        setError(null);
      } catch (err) {
        setError('Failed to load investors');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (investors.length === 0) {
      fetchInvestors();
    }
  }, [activeTab, investors.length]);

  // Fetch investor patterns when investor selected
  useEffect(() => {
    if (!selectedInvestor) return;

    const fetchPatterns = async () => {
      try {
        setLoading(true);
        const response = await historicalAPI.getInvestorPatterns(selectedInvestor);
        setInvestorPatterns(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load investor patterns');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPatterns();
  }, [selectedInvestor]);

  // Fetch factor timeseries for charts
  useEffect(() => {
    if (activeTab !== 'factors') return;

    const fetchTimeseries = async () => {
      try {
        const response = await historicalAPI.getFactorTimeseries(selectedFactor, 'quarter');
        setFactorTimeseries(response.data);
      } catch (err) {
        console.error('Failed to load factor timeseries:', err);
      }
    };

    fetchTimeseries();
  }, [activeTab, selectedFactor]);

  // Fetch investor styles data
  useEffect(() => {
    if (activeTab !== 'styles') return;

    const fetchStyles = async () => {
      try {
        setLoading(true);
        const response = await historicalAPI.getInvestorStyles();
        setStyleData(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load style data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (!styleData) {
      fetchStyles();
    } else {
      setLoading(false);
    }
  }, [activeTab, styleData]);

  // Classify all investors
  const handleClassifyAll = async () => {
    try {
      setClassifying(true);
      const response = await historicalAPI.classifyAllInvestors(20);
      setStyleData(null); // Reset to trigger refetch
      const { classified = 0, total = 0, message } = response.data || {};
      if (total === 0 && message) {
        alert(message);
      } else {
        alert(`Classified ${classified} investors`);
      }
    } catch (err) {
      // Backend may return 500 when historical tables are missing; treat as unavailable
      const is500 = err?.response?.status === 500 || err?.status === 500;
      if (is500) {
        alert('Classification is not available. Historical investor data may not be set up yet.');
      } else {
        setError('Failed to classify investors');
        console.error(err);
      }
    } finally {
      setClassifying(false);
    }
  };

  const renderOverviewTab = () => {
    if (!stats) return <div className="loading">Loading statistics...</div>;

    const { overview, byDecisionType, topSectors } = stats;

    return (
      <div className="tab-content overview-tab">
        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{formatNumber(overview?.total_decisions)}</span>
            <span className="stat-label">Total Decisions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatNumber(overview?.unique_investors)}</span>
            <span className="stat-label">Investors Tracked</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatNumber(overview?.unique_stocks)}</span>
            <span className="stat-label">Unique Stocks</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatNumber(overview?.decisions_with_returns)}</span>
            <span className="stat-label">With Outcomes</span>
          </div>
          <div className="stat-card highlight">
            <span className={`stat-value ${overview?.avg_return_1y >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(overview?.avg_return_1y * 100)}
            </span>
            <span className="stat-label">Avg 1Y Return</span>
          </div>
        </div>

        {/* Decision Type Breakdown */}
        <div className="analytics-section">
          <h3>Decision Types</h3>
          <div className="decision-types-grid">
            {byDecisionType?.map(dt => {
              const DecisionIcon = DECISION_ICONS[dt.decision_type] || DECISION_ICONS.default;
              return (
              <div key={dt.decision_type} className="decision-type-card" data-type={dt.decision_type}>
                <span className="dt-icon">
                  <DecisionIcon size={20} />
                </span>
                <span className="dt-label">{dt.decision_type?.replace('_', ' ')}</span>
                <span className="dt-count">{formatNumber(dt.count)}</span>
              </div>
            );})}
          </div>
        </div>

        {/* Top Sectors */}
        <div className="analytics-section">
          <h3>Top Sectors by Decision Count</h3>
          <div className="sectors-table">
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Decisions</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {topSectors?.map(s => (
                  <tr key={s.sector}>
                    <td>{s.sector}</td>
                    <td>{formatNumber(s.count)}</td>
                    <td>
                      <div className="sector-bar">
                        <div
                          className="bar-fill"
                          style={{ width: `${(s.count / topSectors[0].count) * 100}%` }}
                        />
                        <span>{((s.count / overview?.total_decisions) * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Date Range */}
        <div className="analytics-section date-range">
          <h3>Data Coverage</h3>
          <p>
            From <strong>{overview?.earliest_decision}</strong> to{' '}
            <strong>{overview?.latest_decision}</strong>
          </p>
        </div>
      </div>
    );
  };

  const renderFactorsTab = () => {
    const data = factorData[selectedFactor];

    return (
      <div className="tab-content factors-tab">
        {/* Factor Selector */}
        <div className="factor-selector">
          {FACTORS.map(f => (
            <button
              key={f}
              className={`factor-btn ${selectedFactor === f ? 'active' : ''}`}
              onClick={() => setSelectedFactor(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Loading factor analysis...</div>
        ) : data ? (
          <>
            {/* Enhanced Interpretation */}
            {data.interpretation && (
              <div className="factor-interpretation-enhanced">
                <div className="interpretation-summary">
                  <span className="summary-icon">📊</span>
                  <p className="summary-text">
                    {typeof data.interpretation === 'string'
                      ? data.interpretation
                      : data.interpretation.summary}
                  </p>
                </div>
                {data.interpretation.insight && (
                  <div className="interpretation-insight">
                    <span className="insight-icon">💡</span>
                    <div>
                      <strong>What this means:</strong> {data.interpretation.insight}
                    </div>
                  </div>
                )}
                {data.interpretation.recommendation && (
                  <div className="interpretation-action">
                    <span className="action-icon">🎯</span>
                    <div>
                      <strong>Actionable insight:</strong> {data.interpretation.recommendation}
                    </div>
                  </div>
                )}
                {data.interpretation.sampleWarning && (
                  <div className="interpretation-warning">
                    <span className="warning-icon">⚠️</span>
                    {data.interpretation.sampleWarning}
                  </div>
                )}
              </div>
            )}

            {/* Factor Performance Table */}
            <div className="factor-performance-table">
              <h3>{selectedFactor.charAt(0).toUpperCase() + selectedFactor.slice(1)} Factor Performance by Quintile</h3>
              <table>
                <thead>
                  <tr>
                    <th>Quintile</th>
                    <th>Decisions</th>
                    <th>Avg Return</th>
                    <th>Avg Alpha</th>
                    <th>Beat Market %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.performance?.map(p => (
                    <tr key={p.factor_quintile}>
                      <td className="quintile-cell">
                        <span className={`quintile-badge ${p.factor_quintile.includes('Top') ? 'top' : p.factor_quintile.includes('Bottom') ? 'bottom' : ''}`}>
                          {p.factor_quintile}
                        </span>
                      </td>
                      <td>{formatNumber(p.decision_count)}</td>
                      <td className={p.avg_return_pct >= 0 ? 'positive' : 'negative'}>
                        {formatPercent(p.avg_return_pct)}
                      </td>
                      <td className={p.avg_alpha_pct >= 0 ? 'positive' : 'negative'}>
                        {formatPercent(p.avg_alpha_pct)}
                      </td>
                      <td>
                        <div className="beat-market-bar">
                          <div
                            className="bar-fill"
                            style={{ width: `${p.beat_market_pct}%` }}
                          />
                          <span>{p.beat_market_pct?.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Factor Spread Analysis */}
            {data.performance?.length >= 2 && (
              <div className="factor-spread">
                <h4>Long-Short Spread</h4>
                <p>
                  Going long top quintile and short bottom quintile on {selectedFactor} factor
                  would have generated{' '}
                  <strong className={
                    (data.performance[0]?.avg_return_pct - data.performance[data.performance.length - 1]?.avg_return_pct) >= 0
                      ? 'positive'
                      : 'negative'
                  }>
                    {formatPercent(
                      data.performance[0]?.avg_return_pct - data.performance[data.performance.length - 1]?.avg_return_pct
                    )}
                  </strong>{' '}
                  average annual return.
                </p>
              </div>
            )}

            {/* Factor Performance Over Time Chart */}
            {factorTimeseries?.data?.length > 0 && (
              <div className="analytics-section">
                <h3>Factor Performance Over Time</h3>
                <div className="chart-container" style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <LineChart data={factorTimeseries.data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => [`${value?.toFixed(1)}%`, '']}
                        contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="top" name="Top 20%" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="high" name="60-80%" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="mid" name="40-60%" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="low" name="20-40%" stroke="#D97706" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="bottom" name="Bottom 20%" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="no-data">No factor data available. Run factor enrichment first.</div>
        )}
      </div>
    );
  };

  const renderStylesTab = () => {
    const STYLE_COLORS = {
      'Value': '#059669',
      'Growth': '#2563EB',
      'Quality': '#7C3AED',
      'Momentum': '#D97706',
      'Quant': '#0891B2',
      'Technology': '#6366F1',
      'Activist': '#DC2626',
      'Long Short': '#F59E0B',
      'Multi Strategy': '#94A3B8',
      'Macro': '#14B8A6',
      'Deep Value': '#059669',
      'GARP': '#0891B2',
      'Diversified': '#94A3B8',
      'Concentrated': '#DC2626'
    };

    return (
      <div className="tab-content styles-tab">
        {/* Action Button */}
        <div className="styles-actions">
          <button
            className="classify-btn"
            onClick={handleClassifyAll}
            disabled={classifying}
          >
            {classifying ? 'Classifying...' : 'Re-classify All Investors'}
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading style data...</div>
        ) : styleData ? (
          <>
            {/* Style Performance Chart */}
            {styleData.stylePerformance?.length > 0 && (
              <div className="analytics-section">
                <h3>Investment Style Performance</h3>
                <div className="chart-container" style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <BarChart data={styleData.stylePerformance} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                      <XAxis
                        dataKey="investment_style"
                        tick={{ fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis tickFormatter={(v) => `${v?.toFixed(0)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, name) => [
                          `${typeof value === 'number' ? value.toFixed(1) : value}${name.includes('pct') || name.includes('return') || name.includes('alpha') ? '%' : ''}`,
                          name.replace(/_/g, ' ')
                        ]}
                        contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="avg_return" name="Avg Return %" fill="#2563EB">
                        {styleData.stylePerformance.map((entry, index) => (
                          <Cell key={index} fill={STYLE_COLORS[entry.investment_style] || '#64748b'} />
                        ))}
                      </Bar>
                      <Bar dataKey="avg_alpha" name="Avg Alpha %" fill="#059669" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Style Summary Table */}
            <div className="analytics-section">
              <h3>Style Performance Summary</h3>
              <div className="styles-table">
                <table>
                  <thead>
                    <tr>
                      <th>Style</th>
                      <th>Investors</th>
                      <th>Decisions</th>
                      <th>Avg Return</th>
                      <th>Avg Alpha</th>
                      <th>Beat Market %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {styleData.stylePerformance?.map(s => {
                      const styleLabel = formatStyleLabel(s.investment_style);
                      const hasSmallSample = s.investor_count < 3 || s.total_decisions < 100;
                      return (
                      <tr key={s.investment_style} className={hasSmallSample ? 'small-sample' : ''}>
                        <td>
                          <span
                            className="style-badge"
                            style={{ background: `${STYLE_COLORS[styleLabel] || '#64748b'}20`, color: STYLE_COLORS[styleLabel] || '#64748b' }}
                          >
                            {styleLabel}
                          </span>
                          {hasSmallSample && <span className="sample-warning" title="Small sample size - interpret with caution">⚠️</span>}
                        </td>
                        <td>{formatNumber(s.investor_count)}</td>
                        <td>{formatNumber(s.total_decisions)}</td>
                        <td className={s.avg_return >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(s.avg_return)}
                        </td>
                        <td className={s.avg_alpha >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(s.avg_alpha)}
                        </td>
                        <td>{s.beat_market_pct != null ? `${s.beat_market_pct.toFixed(1)}%` : '-'}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Investors by Style */}
            {styleData.investorsByStyle && Object.keys(styleData.investorsByStyle).length > 0 && (
              <div className="analytics-section">
                <h3>Top Investors by Style</h3>
                <div className="style-investors-grid">
                  {Object.entries(styleData.investorsByStyle).map(([style, investors]) => {
                    const styleLabel = formatStyleLabel(style);
                    return (
                    <div key={style} className="style-card">
                      <h4 style={{ color: STYLE_COLORS[styleLabel] || '#64748b' }}>{styleLabel}</h4>
                      <div className="style-investors">
                        {investors.slice(0, 3).map(inv => (
                          <Link
                            key={inv.id}
                            to={`/investors/${inv.id}`}
                            className="style-investor"
                          >
                            <span className="si-name">{inv.name}</span>
                            <span className={`si-alpha ${inv.avg_alpha >= 0 ? 'positive' : 'negative'}`}>
                              {formatPercent(inv.avg_alpha)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="no-data">No style data available yet.</div>
        )}
      </div>
    );
  };

  const renderDecisionsTab = () => {
    return (
      <div className="tab-content decisions-tab">
        {/* Filters */}
        <div className="decision-filters">
          <select
            value={decisionFilters.decision_type}
            onChange={e => setDecisionFilters(prev => ({ ...prev, decision_type: e.target.value }))}
          >
            <option value="">All Decision Types</option>
            <option value="new_position">New Position</option>
            <option value="increased">Increased</option>
            <option value="decreased">Decreased</option>
            <option value="sold_out">Sold Out</option>
          </select>

          <select
            value={decisionFilters.sector}
            onChange={e => setDecisionFilters(prev => ({ ...prev, sector: e.target.value }))}
          >
            <option value="">All Sectors</option>
            {stats?.topSectors?.map(s => (
              <option key={s.sector} value={s.sector}>{s.sector}</option>
            ))}
          </select>

          <select
            value={decisionFilters.limit}
            onChange={e => setDecisionFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
          >
            <option value={25}>25 results</option>
            <option value={50}>50 results</option>
            <option value={100}>100 results</option>
          </select>
        </div>

        {/* Decisions Table */}
        {loading ? (
          <div className="loading">Loading decisions...</div>
        ) : (
          <div className="decisions-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Investor</th>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Weight</th>
                  <th>1Y Return</th>
                  <th>Alpha</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map(d => (
                  <DecisionRow
                    key={d.id}
                    decision={d}
                    formatCurrency={formatCurrency}
                    formatPercent={formatPercent}
                  />
                ))}
              </tbody>
            </table>
            {decisions.length === 0 && (
              <div className="no-data">No decisions found with current filters.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderInvestorsTab = () => {
    return (
      <div className="tab-content investors-tab">
        <div className="investors-layout">
          {/* Investor List */}
          <div className="investors-list">
            <h3>Select Investor</h3>
            <div className="investor-cards">
              {investors.slice(0, 20).map(inv => (
                <InvestorCard
                  key={inv.id}
                  investor={inv}
                  isSelected={selectedInvestor === inv.id}
                  onSelect={() => setSelectedInvestor(inv.id)}
                />
              ))}
            </div>
          </div>

          {/* Investor Patterns Detail */}
          <div className="investor-patterns">
            {!selectedInvestor ? (
              <div className="select-prompt">
                <span className="prompt-icon"><User size={32} /></span>
                <h3>Select an Investor</h3>
                <p>Choose an investor to see their decision patterns</p>
              </div>
            ) : loading ? (
              <div className="loading">Loading patterns...</div>
            ) : investorPatterns ? (
              <>
                {/* Investor Header */}
                <div className="investor-header">
                  <h3>{investorPatterns.investor?.name}</h3>
                  <span className="inv-style-badge">
                    {investorPatterns.investor?.investment_style}
                  </span>
                </div>

                {/* Timing Stats */}
                {investorPatterns.patterns?.timingStats && (
                  <div className="timing-stats">
                    <div className="timing-stat">
                      <span className="ts-value">
                        {formatNumber(investorPatterns.patterns.timingStats.total_decisions)}
                      </span>
                      <span className="ts-label">Total Decisions</span>
                    </div>
                    <div className="timing-stat">
                      <span className="ts-value positive">
                        {investorPatterns.patterns.timingStats.beat_market_pct}%
                      </span>
                      <span className="ts-label">Beat Market</span>
                    </div>
                    <div className="timing-stat">
                      <span className={`ts-value ${investorPatterns.patterns.timingStats.avg_return >= 0 ? 'positive' : 'negative'}`}>
                        {formatPercent(investorPatterns.patterns.timingStats.avg_return * 100)}
                      </span>
                      <span className="ts-label">Avg Return</span>
                    </div>
                    <div className="timing-stat">
                      <span className={`ts-value ${investorPatterns.patterns.timingStats.avg_alpha >= 0 ? 'positive' : 'negative'}`}>
                        {formatPercent(investorPatterns.patterns.timingStats.avg_alpha * 100)}
                      </span>
                      <span className="ts-label">Avg Alpha</span>
                    </div>
                  </div>
                )}

                {/* Sector Preferences */}
                {investorPatterns.patterns?.sectorPreferences?.length > 0 && (
                  <div className="pattern-section">
                    <h4>Sector Preferences</h4>
                    <div className="sector-prefs">
                      {investorPatterns.patterns.sectorPreferences.map(s => (
                        <div key={s.sector} className="sector-pref">
                          <span className="sp-sector">{s.sector}</span>
                          <span className="sp-count">{s.decision_count} decisions</span>
                          <span className={`sp-return ${s.avg_return_1y >= 0 ? 'positive' : 'negative'}`}>
                            {s.avg_return_1y !== null ? formatPercent(s.avg_return_1y * 100) : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Decisions */}
                {investorPatterns.patterns?.topDecisions?.length > 0 && (
                  <div className="pattern-section">
                    <h4>Best Decisions</h4>
                    <div className="top-decisions">
                      {investorPatterns.patterns.topDecisions.slice(0, 5).map((d, i) => (
                        <div key={i} className="top-decision">
                          <Link to={`/company/${d.symbol}`} className="td-symbol">
                            {d.symbol}
                          </Link>
                          <span className="td-date">{d.decision_date}</span>
                          <span className="td-return positive">
                            {formatPercent(d.return_1y * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Worst Decisions */}
                {investorPatterns.patterns?.worstDecisions?.length > 0 && (
                  <div className="pattern-section">
                    <h4>Worst Decisions</h4>
                    <div className="worst-decisions">
                      {investorPatterns.patterns.worstDecisions.slice(0, 5).map((d, i) => (
                        <div key={i} className="worst-decision">
                          <Link to={`/company/${d.symbol}`} className="td-symbol">
                            {d.symbol}
                          </Link>
                          <span className="td-date">{d.decision_date}</span>
                          <span className="td-return negative">
                            {formatPercent(d.return_1y * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-data">No pattern data available for this investor.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="historical-analytics-page">
      {error && <div className="error-banner">{error}</div>}

      {/* Tab Navigation */}
      <div className="tab-navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon"><tab.Icon size={16} /></span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'factors' && renderFactorsTab()}
      {activeTab === 'styles' && renderStylesTab()}
      {activeTab === 'decisions' && renderDecisionsTab()}
      {activeTab === 'investors' && renderInvestorsTab()}
    </div>
  );
}
