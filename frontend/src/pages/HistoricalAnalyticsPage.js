// frontend/src/pages/HistoricalAnalyticsPage.js
// Historical Analytics Dashboard - Factor performance, investor patterns, decision analytics

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { historicalAPI, investorsAPI } from '../services/api';
import { PageHeader } from '../components/ui';
import { SkeletonTable } from '../components/Skeleton';
import './HistoricalAnalyticsPage.css';

// Lazy load MacroDashboard
const MacroDashboard = lazy(() => import('../components/research/MacroDashboard'));

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'macro', label: 'Macro', icon: '🌐' },
  { id: 'factors', label: 'Factor Analysis', icon: '📈' },
  { id: 'styles', label: 'Investment Styles', icon: '🎨' },
  { id: 'decisions', label: 'Decisions', icon: '🎯' },
  { id: 'investors', label: 'Investor Patterns', icon: '👤' }
];

const FACTORS = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility'];

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

function formatCurrency(num) {
  if (num === null || num === undefined) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

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
      alert(`Classified ${response.data.classified} investors`);
    } catch (err) {
      setError('Failed to classify investors');
      console.error(err);
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
            {byDecisionType?.map(dt => (
              <div key={dt.decision_type} className="decision-type-card">
                <span className="dt-icon">
                  {dt.decision_type === 'new_position' ? '🆕' :
                   dt.decision_type === 'increased' ? '📈' :
                   dt.decision_type === 'decreased' ? '📉' :
                   dt.decision_type === 'sold_out' ? '🚪' : '📊'}
                </span>
                <span className="dt-label">{dt.decision_type?.replace('_', ' ')}</span>
                <span className="dt-count">{formatNumber(dt.count)}</span>
              </div>
            ))}
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
            {/* Interpretation */}
            {data.interpretation && (
              <div className="factor-interpretation">
                <p>{data.interpretation}</p>
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
                      <Line type="monotone" dataKey="top" name="Top 20%" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="high" name="60-80%" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="mid" name="40-60%" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="low" name="20-40%" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="bottom" name="Bottom 20%" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
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
      'Value': '#10b981',
      'Growth': '#3b82f6',
      'Quality': '#a855f7',
      'Momentum': '#f59e0b',
      'GARP': '#06b6d4',
      'Diversified': '#64748b',
      'Concentrated': '#ec4899'
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
                      <Bar dataKey="avg_return" name="Avg Return %" fill="#3b82f6">
                        {styleData.stylePerformance.map((entry, index) => (
                          <Cell key={index} fill={STYLE_COLORS[entry.investment_style] || '#64748b'} />
                        ))}
                      </Bar>
                      <Bar dataKey="avg_alpha" name="Avg Alpha %" fill="#10b981" />
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
                    {styleData.stylePerformance?.map(s => (
                      <tr key={s.investment_style}>
                        <td>
                          <span
                            className="style-badge"
                            style={{ background: `${STYLE_COLORS[s.investment_style] || '#64748b'}20`, color: STYLE_COLORS[s.investment_style] || '#64748b' }}
                          >
                            {s.investment_style}
                          </span>
                        </td>
                        <td>{formatNumber(s.investor_count)}</td>
                        <td>{formatNumber(s.total_decisions)}</td>
                        <td className={s.avg_return >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(s.avg_return)}
                        </td>
                        <td className={s.avg_alpha >= 0 ? 'positive' : 'negative'}>
                          {formatPercent(s.avg_alpha)}
                        </td>
                        <td>{s.beat_market_pct?.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Investors by Style */}
            {styleData.investorsByStyle && Object.keys(styleData.investorsByStyle).length > 0 && (
              <div className="analytics-section">
                <h3>Top Investors by Style</h3>
                <div className="style-investors-grid">
                  {Object.entries(styleData.investorsByStyle).map(([style, investors]) => (
                    <div key={style} className="style-card">
                      <h4 style={{ color: STYLE_COLORS[style] || '#64748b' }}>{style}</h4>
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
                  ))}
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
                  <tr key={d.id}>
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
                <div
                  key={inv.id}
                  className={`investor-card ${selectedInvestor === inv.id ? 'selected' : ''}`}
                  onClick={() => setSelectedInvestor(inv.id)}
                >
                  <span className="inv-name">{inv.name}</span>
                  <span className="inv-style">{inv.investment_style || 'Unknown'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Investor Patterns Detail */}
          <div className="investor-patterns">
            {!selectedInvestor ? (
              <div className="select-prompt">
                <span className="prompt-icon">👤</span>
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
      <PageHeader
        title="Historical Analytics"
        subtitle="Factor performance, investor patterns, and decision analysis"
      />

      {error && <div className="error-banner">{error}</div>}

      {/* Tab Navigation */}
      <div className="tab-navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'macro' && (
        <div className="tab-content macro-tab">
          <Suspense fallback={<SkeletonTable rows={6} />}>
            <MacroDashboard />
          </Suspense>
        </div>
      )}
      {activeTab === 'factors' && renderFactorsTab()}
      {activeTab === 'styles' && renderStylesTab()}
      {activeTab === 'decisions' && renderDecisionsTab()}
      {activeTab === 'investors' && renderInvestorsTab()}
    </div>
  );
}
