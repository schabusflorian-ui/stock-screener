// frontend/src/components/AnalysisDashboard.js
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Target, AlertTriangle, TrendingUp, TrendingDown, Loader } from './icons';
import { companyAPI, simulateAPI } from '../services/api';
import { DCFValuation } from './DCFValuation';
import AddToPortfolioButton from './portfolio/AddToPortfolioButton';
import './AnalysisDashboard.css';

// Format helpers
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
};

const formatRatio = (value) => {
  if (value === null || value === undefined) return '-';
  return value.toFixed(2);
};

// ============ SUB-COMPONENTS ============

// Quality Scores Section - memoized to prevent re-renders when parent updates
const QualityScores = memo(function QualityScores({ piotroski, altmanZ }) {
  // Handle missing data - determine if we have valid scores
  const hasPiotroski = piotroski && piotroski.score !== null && piotroski.score !== undefined;
  const hasAltmanZ = altmanZ && altmanZ.score !== null && altmanZ.score !== undefined;

  const piotroskiColor = hasPiotroski
    ? (piotroski.score >= 7 ? '#059669' : piotroski.score >= 5 ? '#D97706' : '#DC2626')
    : '#94A3B8';

  const altmanColor = hasAltmanZ
    ? (altmanZ.zone === 'safe' ? '#059669' : altmanZ.zone === 'grey' ? '#D97706' : '#DC2626')
    : '#94A3B8';

  const piotroskiComponents = piotroski?.components || {};
  const componentLabels = {
    positiveNetIncome: 'Positive Net Income',
    positiveROA: 'Positive ROA',
    positiveCFO: 'Positive Operating CF',
    cfoGreaterThanNetIncome: 'CFO > Net Income',
    decreasingLeverage: 'Decreasing Debt',
    increasingCurrentRatio: 'Improving Liquidity',
    noNewShares: 'No Dilution',
    increasingGrossMargin: 'Improving Margins',
    increasingAssetTurnover: 'Improving Efficiency'
  };

  // Safe number formatting
  const safePercent = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `${(val * 100).toFixed(1)}%`;
  };

  const safeRatio = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `${val.toFixed(2)}x`;
  };

  return (
    <div className="quality-scores-section">
      {/* Score Summary Cards - Top Row */}
      <div className="scores-summary-row">
        <div className="score-summary-card" style={{ '--score-color': piotroskiColor }}>
          <div className="score-summary-header">
            <span className="score-title">Piotroski F-Score</span>
            <span className="score-badge">{hasPiotroski ? (piotroski.score >= 7 ? 'Strong' : piotroski.score >= 5 ? 'Neutral' : 'Weak') : 'N/A'}</span>
          </div>
          <div className="score-summary-value">
            <span className="big-score">{hasPiotroski ? piotroski.score : '-'}</span>
            <span className="score-max">/9</span>
          </div>
          {hasPiotroski && (
            <div className="score-mini-gauge">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="mini-segment"
                  style={{ backgroundColor: i < piotroski.score ? piotroskiColor : 'rgba(0,0,0,0.1)' }}
                />
              ))}
            </div>
          )}
          <p className="score-summary-desc">
            {hasPiotroski ? piotroski.interpretation : 'Insufficient data'}
          </p>
        </div>

        <div className="score-summary-card" style={{ '--score-color': altmanColor }}>
          <div className="score-summary-header">
            <span className="score-title">Altman Z-Score</span>
            <span className="score-badge">{hasAltmanZ ? (altmanZ.zone === 'safe' ? 'Safe' : altmanZ.zone === 'grey' ? 'Grey Zone' : 'Distress') : 'N/A'}</span>
          </div>
          <div className="score-summary-value">
            <span className="big-score">{hasAltmanZ ? altmanZ.score.toFixed(1) : '-'}</span>
          </div>
          {hasAltmanZ && (
            <div className="z-mini-meter">
              <div className="z-mini-track">
                <div className="z-mini-zone distress"></div>
                <div className="z-mini-zone grey"></div>
                <div className="z-mini-zone safe"></div>
                <div className="z-mini-marker" style={{ left: `${Math.min(100, Math.max(0, (altmanZ.score / 5) * 100))}%` }}></div>
              </div>
              <div className="z-mini-labels">
                <span>0</span>
                <span>1.8</span>
                <span>3.0</span>
                <span>5+</span>
              </div>
            </div>
          )}
          <p className="score-summary-desc">
            {hasAltmanZ ? altmanZ.interpretation : 'Insufficient data'}
          </p>
        </div>
      </div>

      {/* Detail Panels - Bottom Row */}
      <div className="scores-detail-row">
        {/* Piotroski Components */}
        {hasPiotroski && Object.keys(piotroskiComponents).length > 0 && (
          <div className="score-detail-panel">
            <h4>Piotroski Components</h4>
            <div className="component-groups-horizontal">
              <div className="component-group-box">
                <span className="group-box-label">Profitability</span>
                <div className="component-list">
                  {['positiveNetIncome', 'positiveROA', 'positiveCFO', 'cfoGreaterThanNetIncome'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    const passed = piotroskiComponents[key];
                    return (
                      <div key={key} className={`component-row ${!hasData ? 'no-data' : passed ? 'pass' : 'fail'}`}>
                        <span className="component-check">{!hasData ? '?' : passed ? '✓' : '✗'}</span>
                        <span className="component-name">{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="component-group-box">
                <span className="group-box-label">Leverage & Liquidity</span>
                <div className="component-list">
                  {['decreasingLeverage', 'increasingCurrentRatio', 'noNewShares'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    const passed = piotroskiComponents[key];
                    return (
                      <div key={key} className={`component-row ${!hasData ? 'no-data' : passed ? 'pass' : 'fail'}`}>
                        <span className="component-check">{!hasData ? '?' : passed ? '✓' : '✗'}</span>
                        <span className="component-name">{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="component-group-box">
                <span className="group-box-label">Efficiency</span>
                <div className="component-list">
                  {['increasingGrossMargin', 'increasingAssetTurnover'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    const passed = piotroskiComponents[key];
                    return (
                      <div key={key} className={`component-row ${!hasData ? 'no-data' : passed ? 'pass' : 'fail'}`}>
                        <span className="component-check">{!hasData ? '?' : passed ? '✓' : '✗'}</span>
                        <span className="component-name">{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Z-Score Components */}
        {hasAltmanZ && altmanZ.components && (
          <div className="score-detail-panel">
            <h4>Z-Score Components</h4>
            <div className="z-components-grid">
              <div className="z-component-card">
                <span className="z-comp-label">Working Capital / Assets</span>
                <span className="z-comp-value">{safePercent(altmanZ.components.workingCapitalRatio)}</span>
              </div>
              <div className="z-component-card">
                <span className="z-comp-label">Retained Earnings / Assets</span>
                <span className="z-comp-value">{safePercent(altmanZ.components.retainedEarningsRatio)}</span>
              </div>
              <div className="z-component-card">
                <span className="z-comp-label">EBIT / Assets</span>
                <span className="z-comp-value">{safePercent(altmanZ.components.ebitRatio)}</span>
              </div>
              <div className="z-component-card">
                <span className="z-comp-label">Market Cap / Liabilities</span>
                <span className="z-comp-value">{safeRatio(altmanZ.components.marketToDebtRatio)}</span>
              </div>
              <div className="z-component-card">
                <span className="z-comp-label">Sales / Assets</span>
                <span className="z-comp-value">{safeRatio(altmanZ.components.assetTurnover)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* No data states */}
      {!hasPiotroski && !hasAltmanZ && (
        <div className="no-score-data">
          <span className="no-data-icon">📊</span>
          <p>Quality scores unavailable - requires complete financial data</p>
        </div>
      )}
    </div>
  );
});

// Capital Allocation Section - memoized
const CapitalAllocation = memo(function CapitalAllocation({ data }) {
  // Memoize chart data transformation to prevent recalculation on every render
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].reverse().map(d => ({
      period: d.period.substring(0, 4),
      Dividends: Math.abs(d.dividends) / 1e9,
      Buybacks: Math.abs(d.buybacks) / 1e9,
      CapEx: Math.abs(d.capex) / 1e9,
      Acquisitions: Math.abs(d.acquisitions) / 1e9,
      'Debt Repayment': Math.abs(d.debtRepayment) / 1e9
    }));
  }, [data]);

  // Memoize derived values
  const { latestData, totalReturned, fcf, breakdownItems } = useMemo(() => {
    if (!data || data.length === 0) return { latestData: null, totalReturned: 0, fcf: 0, breakdownItems: [] };
    const latest = data[0];
    const maxValue = Math.max(
      Math.abs(latest.dividends),
      Math.abs(latest.buybacks),
      Math.abs(latest.capex),
      Math.abs(latest.acquisitions),
      Math.abs(latest.debtRepayment)
    ) || 1;

    const items = [
      { label: 'Dividends', value: latest.dividends, color: '#059669' },
      { label: 'Buybacks', value: latest.buybacks, color: '#2563EB' },
      { label: 'CapEx', value: latest.capex, color: '#7C3AED' },
      { label: 'Acquisitions', value: latest.acquisitions, color: '#D97706' },
      { label: 'Debt Repayment', value: latest.debtRepayment, color: '#94A3B8' }
    ].map(item => ({
      ...item,
      width: (Math.abs(item.value) / maxValue) * 100
    }));

    return {
      latestData: latest,
      totalReturned: Math.abs(latest.dividends) + Math.abs(latest.buybacks),
      fcf: latest.freeCashFlow,
      breakdownItems: items
    };
  }, [data]);

  if (!data || data.length === 0) {
    return <div className="no-data">No capital allocation data available</div>;
  }

  return (
    <div className="capital-allocation-section">
      <h3>Capital Allocation</h3>

      <div className="allocation-summary">
        <div className="summary-stat">
          <span className="label">Free Cash Flow</span>
          <span className={`value ${fcf >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(fcf)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="label">Shareholder Returns</span>
          <span className="value">{formatCurrency(-totalReturned)}</span>
        </div>
        <div className="summary-stat">
          <span className="label">Payout Ratio</span>
          <span className="value">
            {fcf > 0 ? formatPercent((totalReturned / fcf) * 100) : '-'}
          </span>
        </div>
      </div>

      <div className="allocation-chart">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v.toFixed(0)}B`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value) => [`$${value.toFixed(1)}B`, '']}
            />
            <Legend />
            <Bar dataKey="Dividends" stackId="a" fill="#059669" />
            <Bar dataKey="Buybacks" stackId="a" fill="#2563EB" />
            <Bar dataKey="CapEx" stackId="b" fill="#7C3AED" />
            <Bar dataKey="Acquisitions" stackId="b" fill="#D97706" />
            <Bar dataKey="Debt Repayment" stackId="b" fill="#94A3B8" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="allocation-breakdown">
        <h4>Latest Period Breakdown</h4>
        <div className="breakdown-bars">
          {breakdownItems.map(item => (
            <div key={item.label} className="breakdown-row">
              <span className="breakdown-label">{item.label}</span>
              <div className="breakdown-bar-track">
                <div
                  className="breakdown-bar-fill"
                  style={{ width: `${item.width}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="breakdown-value">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// Valuation Summary with Gauge - memoized
const ValuationSummary = memo(function ValuationSummary({ latestMetrics, valuationHistory }) {
  // Calculate valuation score (0-100, where lower is more attractive)
  const calculateValuationScore = () => {
    let score = 50; // Neutral starting point
    let factors = 0;

    // P/E contribution (lower is better, <15 = cheap, >30 = expensive)
    if (latestMetrics?.pe_ratio && latestMetrics.pe_ratio > 0) {
      const peScore = latestMetrics.pe_ratio < 15 ? 20 : latestMetrics.pe_ratio < 20 ? 35 : latestMetrics.pe_ratio < 30 ? 55 : 75;
      score += peScore - 50;
      factors++;
    }

    // P/B contribution (lower is better, <1.5 = cheap, >4 = expensive)
    if (latestMetrics?.pb_ratio && latestMetrics.pb_ratio > 0) {
      const pbScore = latestMetrics.pb_ratio < 1.5 ? 20 : latestMetrics.pb_ratio < 3 ? 40 : latestMetrics.pb_ratio < 5 ? 60 : 80;
      score += pbScore - 50;
      factors++;
    }

    // PEG contribution (lower is better, <1 = undervalued)
    if (latestMetrics?.peg_ratio && latestMetrics.peg_ratio > 0) {
      const pegScore = latestMetrics.peg_ratio < 1 ? 15 : latestMetrics.peg_ratio < 1.5 ? 35 : latestMetrics.peg_ratio < 2 ? 55 : 75;
      score += pegScore - 50;
      factors++;
    }

    // FCF Yield contribution (higher is better, >8% = attractive)
    if (latestMetrics?.fcf_yield) {
      const fcfScore = latestMetrics.fcf_yield > 8 ? 20 : latestMetrics.fcf_yield > 5 ? 35 : latestMetrics.fcf_yield > 2 ? 55 : 75;
      score += fcfScore - 50;
      factors++;
    }

    if (factors === 0) return null;
    return Math.max(0, Math.min(100, score / factors * 2));
  };

  const valuationScore = calculateValuationScore();
  const getScoreLabel = (score) => {
    if (score === null) return { label: 'N/A', color: '#94A3B8' };
    if (score < 30) return { label: 'Attractive', color: '#059669' };
    if (score < 50) return { label: 'Fair', color: '#059669' };
    if (score < 70) return { label: 'Full', color: '#D97706' };
    return { label: 'Expensive', color: '#DC2626' };
  };

  const { label: scoreLabel, color: scoreColor } = getScoreLabel(valuationScore);

  // Key valuation metrics
  const valuationMetrics = [
    { key: 'pe_ratio', label: 'P/E Ratio', value: latestMetrics?.pe_ratio, benchmark: 20, inverse: true },
    { key: 'pb_ratio', label: 'P/B Ratio', value: latestMetrics?.pb_ratio, benchmark: 3, inverse: true },
    { key: 'ps_ratio', label: 'P/S Ratio', value: latestMetrics?.ps_ratio, benchmark: 3, inverse: true },
    { key: 'ev_ebitda', label: 'EV/EBITDA', value: latestMetrics?.ev_ebitda, benchmark: 12, inverse: true },
    { key: 'peg_ratio', label: 'PEG Ratio', value: latestMetrics?.peg_ratio, benchmark: 1, inverse: true },
    { key: 'fcf_yield', label: 'FCF Yield', value: latestMetrics?.fcf_yield, benchmark: 5, inverse: false, isPercent: true },
    { key: 'earnings_yield', label: 'Earnings Yield', value: latestMetrics?.earnings_yield, benchmark: 5, inverse: false, isPercent: true },
    { key: 'dividend_yield', label: 'Dividend Yield', value: latestMetrics?.dividend_yield, benchmark: 2, inverse: false, isPercent: true }
  ];

  return (
    <div className="valuation-summary-section">
      <h3>Valuation Overview</h3>

      {/* Valuation Gauge */}
      <div className="valuation-gauge-container">
        <div className="valuation-gauge">
          <svg viewBox="0 0 200 120" className="gauge-svg">
            {/* Background arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Gradient sections */}
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="33%" stopColor="#059669" />
                <stop offset="66%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#DC2626" />
              </linearGradient>
            </defs>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.3"
            />
            {/* Needle */}
            {valuationScore !== null && (
              <g transform={`rotate(${-90 + (valuationScore / 100) * 180}, 100, 100)`}>
                <line x1="100" y1="100" x2="100" y2="35" stroke={scoreColor} strokeWidth="3" strokeLinecap="round" />
                <circle cx="100" cy="100" r="8" fill={scoreColor} />
              </g>
            )}
          </svg>
          <div className="gauge-labels">
            <span className="gauge-label-left">Cheap</span>
            <span className="gauge-label-right">Expensive</span>
          </div>
        </div>
        <div className="gauge-value" style={{ color: scoreColor }}>
          <span className="gauge-score">{valuationScore !== null ? valuationScore.toFixed(0) : '-'}</span>
          <span className="gauge-label">{scoreLabel}</span>
        </div>
      </div>

      {/* Valuation Metrics Grid */}
      <div className="valuation-metrics-grid">
        {valuationMetrics.map(metric => {
          if (metric.value === null || metric.value === undefined) return null;

          const isGood = metric.inverse ? metric.value < metric.benchmark : metric.value > metric.benchmark;

          return (
            <div key={metric.key} className="valuation-metric-card">
              <div className="metric-label">{metric.label}</div>
              <div className="metric-value">
                {metric.isPercent ? formatPercent(metric.value) : formatRatio(metric.value)}
              </div>
              <div className={`metric-comparison ${isGood ? 'positive' : 'negative'}`}>
                vs {metric.isPercent ? formatPercent(metric.benchmark) : formatRatio(metric.benchmark)} avg
                <span className="comparison-arrow">{isGood ? '↓' : '↑'}</span>
              </div>
            </div>
          );
        }).filter(Boolean)}
      </div>
    </div>
  );
});

// Valuation History Section with Multi-Select - memoized
const ValuationHistory = memo(function ValuationHistory({ data, latestMetrics }) {
  const metrics = [
    { key: 'pe_ratio', label: 'P/E', fullLabel: 'Price / Earnings', color: '#7C3AED' },
    { key: 'pb_ratio', label: 'P/B', fullLabel: 'Price / Book', color: '#7C3AED' },
    { key: 'ps_ratio', label: 'P/S', fullLabel: 'Price / Sales', color: '#2563EB' },
    { key: 'ev_ebitda', label: 'EV/EBITDA', fullLabel: 'EV / EBITDA', color: '#2563EB' },
    { key: 'fcf_yield', label: 'FCF Yield', fullLabel: 'FCF Yield %', color: '#059669' },
    { key: 'earnings_yield', label: 'Earn Yield', fullLabel: 'Earnings Yield %', color: '#0891B2' },
    { key: 'dividend_yield', label: 'Div Yield', fullLabel: 'Dividend Yield %', color: '#D97706' }
  ];

  const [selectedMetrics, setSelectedMetrics] = useState(['pe_ratio', 'pb_ratio']);

  const toggleMetric = (key) => {
    setSelectedMetrics(prev => {
      if (prev.includes(key)) {
        // Don't allow deselecting the last metric
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  if (!data || data.length === 0) {
    return <div className="no-data">No valuation history available</div>;
  }

  // Prepare chart data with all selected metrics
  const chartData = [...data].reverse().map(d => {
    const point = { period: d.period };
    metrics.forEach(m => {
      point[m.key] = d[m.key];
    });
    return point;
  });

  // Calculate stats for each selected metric
  const metricStats = selectedMetrics.map(key => {
    const metricInfo = metrics.find(m => m.key === key);
    const values = chartData.map(d => d[key]).filter(v => v !== null && v !== undefined);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const current = values[values.length - 1] || 0;
    const isYield = key.includes('yield');
    return { key, metricInfo, avg, current, isYield };
  });

  return (
    <div className="valuation-history-section">
      <div className="valuation-header">
        <div className="section-title-group">
          <h3>Historical Valuation Metrics</h3>
          <p className="section-subtitle">Compare valuation multiples over time</p>
        </div>
      </div>

      {/* Metric Toggle Checkboxes */}
      <div className="metric-toggles">
        {metrics.map(m => {
          const isSelected = selectedMetrics.includes(m.key);
          return (
            <label
              key={m.key}
              className={`metric-toggle ${isSelected ? 'active' : ''}`}
              style={{ '--metric-color': m.color }}
              title={m.fullLabel}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleMetric(m.key)}
              />
              <span className="toggle-checkbox">
                <svg className="check-icon" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span className="toggle-label">{m.label}</span>
            </label>
          );
        })}
      </div>

      {/* Stats for selected metrics */}
      <div className="valuation-stats-grid">
        {metricStats.map(({ key, metricInfo, avg, current, isYield }) => {
          const vsAvg = avg > 0 ? ((current - avg) / avg * 100) : 0;
          const isBetter = isYield ? current > avg : current < avg;

          return (
            <div key={key} className="metric-stat-card" style={{ '--card-color': metricInfo.color }}>
              <div className="stat-card-header">
                <div className="stat-color-indicator" style={{ backgroundColor: metricInfo.color }}></div>
                <div className="stat-metric-name">{metricInfo.fullLabel}</div>
              </div>
              <div className="stat-card-body">
                <div className="stat-current-group">
                  <span className="stat-label">Current</span>
                  <span className="stat-current">{isYield ? formatPercent(current) : formatRatio(current)}</span>
                </div>
                <div className="stat-avg-group">
                  <span className="stat-label">Average</span>
                  <span className="stat-avg">{isYield ? formatPercent(avg) : formatRatio(avg)}</span>
                </div>
              </div>
              <div className={`stat-vs-badge ${isBetter ? 'positive' : 'negative'}`}>
                <span className="vs-label">vs Avg</span>
                <span className="vs-value">{vsAvg > 0 ? '+' : ''}{vsAvg.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-line Chart */}
      <div className="valuation-chart-wrapper">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
            <defs>
              {selectedMetrics.map(key => {
                const metricInfo = metrics.find(m => m.key === key);
                return (
                  <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricInfo.color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={metricInfo.color} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis
              dataKey="period"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.08)' }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.98)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: '10px 14px'
              }}
              itemStyle={{ fontSize: '12px', padding: '3px 0' }}
              labelStyle={{ fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}
              formatter={(value, name) => {
                const metricInfo = metrics.find(m => m.key === name);
                const isYield = name.includes('yield');
                return [isYield ? formatPercent(value) : formatRatio(value), metricInfo?.fullLabel || name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '15px' }}
              iconType="circle"
              formatter={(value) => {
                const metricInfo = metrics.find(m => m.key === value);
                return metricInfo?.fullLabel || value;
              }}
            />
            {selectedMetrics.map(key => {
              const metricInfo = metrics.find(m => m.key === key);
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={metricInfo.color}
                  strokeWidth={2.5}
                  dot={{ fill: metricInfo.color, strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: metricInfo.color, strokeWidth: 2, stroke: '#fff' }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Insight note */}
      <div className="valuation-note">
        <p>Click metrics above to show/hide. Lower P/E, P/B, P/S, EV/EBITDA is cheaper. Higher yield metrics are better.</p>
      </div>
    </div>
  );
});

// Peer Comparison Section - memoized
const PeerComparison = memo(function PeerComparison({ peers, sectorAverage, currentCompany, latestMetrics }) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('market_cap');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedView, setSelectedView] = useState('table'); // 'table' or 'chart'

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  const sortedPeers = useMemo(() => {
    if (!peers) return [];
    return [...peers].sort((a, b) => {
      // For market_cap, prefer USD-normalized value for cross-currency comparison
      const getVal = (p) => {
        if (sortBy === 'market_cap') {
          return p.market_cap_usd ?? p.market_cap ?? -Infinity;
        }
        return p[sortBy] ?? -Infinity;
      };
      const aVal = getVal(a);
      const bVal = getVal(b);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [peers, sortBy, sortDir]);

  const columns = [
    { key: 'symbol', label: 'Symbol', format: v => v },
    // Use USD-normalized market cap for accurate cross-currency comparison
    { key: 'market_cap', label: 'Market Cap (USD)', format: (v, peer) => formatCurrency(peer?.market_cap_usd ?? v) },
    { key: 'roic', label: 'ROIC', format: formatPercent },
    { key: 'roe', label: 'ROE', format: formatPercent },
    { key: 'net_margin', label: 'Net Margin', format: formatPercent },
    { key: 'pe_ratio', label: 'P/E', format: formatRatio },
    { key: 'pb_ratio', label: 'P/B', format: formatRatio },
    { key: 'debt_to_equity', label: 'D/E', format: formatRatio }
  ];

  // Comparison metrics for sector average
  const comparisonMetrics = [
    { label: 'ROIC', key: 'roic', value: latestMetrics?.roic, avg: sectorAverage?.avg_roic, higherBetter: true },
    { label: 'ROE', key: 'roe', value: latestMetrics?.roe, avg: sectorAverage?.avg_roe, higherBetter: true },
    { label: 'Net Margin', key: 'net_margin', value: latestMetrics?.net_margin, avg: sectorAverage?.avg_net_margin, higherBetter: true },
    { label: 'Gross Margin', key: 'gross_margin', value: latestMetrics?.gross_margin, avg: sectorAverage?.avg_gross_margin, higherBetter: true },
    { label: 'FCF Yield', key: 'fcf_yield', value: latestMetrics?.fcf_yield, avg: sectorAverage?.avg_fcf_yield, higherBetter: true },
    { label: 'P/E Ratio', key: 'pe_ratio', value: latestMetrics?.pe_ratio, avg: sectorAverage?.avg_pe, higherBetter: false },
    { label: 'P/B Ratio', key: 'pb_ratio', value: latestMetrics?.pb_ratio, avg: sectorAverage?.avg_pb, higherBetter: false },
    { label: 'Debt/Equity', key: 'debt_to_equity', value: latestMetrics?.debt_to_equity, avg: sectorAverage?.avg_de, higherBetter: false }
  ].filter(m => m.value != null && m.avg != null);

  // Prepare chart data for peer comparison
  const peerChartData = useMemo(() => {
    if (!peers || peers.length === 0) return [];

    // Get top 8 peers by USD-normalized market cap for the chart
    const topPeers = [...peers]
      .sort((a, b) => (b.market_cap_usd ?? b.market_cap ?? 0) - (a.market_cap_usd ?? a.market_cap ?? 0))
      .slice(0, 8);

    return topPeers.map(peer => ({
      name: peer.symbol,
      roic: peer.roic || 0,
      roe: peer.roe || 0,
      net_margin: peer.net_margin || 0
    }));
  }, [peers]);

  return (
    <div className="peer-comparison-section">
      <div className="peer-header">
        <h3>Peer Comparison</h3>
        <div className="view-toggle">
          <button
            className={selectedView === 'table' ? 'active' : ''}
            onClick={() => setSelectedView('table')}
          >
            Table
          </button>
          <button
            className={selectedView === 'chart' ? 'active' : ''}
            onClick={() => setSelectedView('chart')}
          >
            Chart
          </button>
        </div>
      </div>

      {/* Sector Average Comparison Cards */}
      {sectorAverage && comparisonMetrics.length > 0 && (
        <div className="sector-comparison-enhanced">
          <h4>vs Sector Average ({sectorAverage.company_count} companies)</h4>
          <div className="comparison-cards-grid">
            {comparisonMetrics.map(item => {
              const diff = item.higherBetter
                ? ((item.value - item.avg) / Math.abs(item.avg) * 100)
                : ((item.avg - item.value) / item.avg * 100);
              const isPositive = diff > 0;
              const isPercent = ['roic', 'roe', 'net_margin', 'gross_margin', 'fcf_yield'].includes(item.key);

              return (
                <div key={item.key} className={`comparison-card ${isPositive ? 'positive' : 'negative'}`}>
                  <div className="card-label">{item.label}</div>
                  <div className="card-values">
                    <span className="card-current">
                      {isPercent ? formatPercent(item.value) : formatRatio(item.value)}
                    </span>
                    <span className="card-vs">vs</span>
                    <span className="card-avg">
                      {isPercent ? formatPercent(item.avg) : formatRatio(item.avg)}
                    </span>
                  </div>
                  <div className={`card-diff ${isPositive ? 'positive' : 'negative'}`}>
                    {isPositive ? '▲' : '▼'} {Math.abs(diff).toFixed(0)}% {isPositive ? 'better' : 'worse'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart View */}
      {selectedView === 'chart' && peerChartData.length > 0 && (
        <div className="peer-chart-container">
          <h4>Profitability Comparison</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={peerChartData} layout="vertical" margin={{ top: 10, right: 30, left: 60, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={50} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '8px'
                }}
                formatter={(value) => [`${value.toFixed(1)}%`]}
              />
              <Legend />
              <Bar dataKey="roic" name="ROIC" fill="#7C3AED" radius={[0, 4, 4, 0]} />
              <Bar dataKey="roe" name="ROE" fill="#2563EB" radius={[0, 4, 4, 0]} />
              <Bar dataKey="net_margin" name="Net Margin" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table View */}
      {selectedView === 'table' && sortedPeers.length > 0 && (
        <div className="peers-table-container">
          <h4>Industry Peers</h4>
          <div className="table-scroll-container">
            <table className="peers-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={sortBy === col.key ? 'sorted' : ''}
                    >
                      {col.label}
                      {sortBy === col.key && (
                        <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPeers.map(peer => (
                  <tr
                    key={peer.symbol}
                    onClick={() => navigate(`/company/${peer.symbol}`)}
                    className="clickable"
                  >
                    {columns.map(col => (
                      <td key={col.key} className={col.key === 'symbol' ? 'symbol-cell' : ''}>
                        {col.format(peer[col.key], peer)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!peers || peers.length === 0) && (
        <p className="no-peers">No peer companies found in this industry</p>
      )}
    </div>
  );
});

// DCF Calculator - memoized
// eslint-disable-next-line no-unused-vars
const DCFCalculator = memo(function DCFCalculator({ latestMetrics, companyName }) {
  const [inputs, setInputs] = useState({
    fcf: latestMetrics?.fcf || 0,
    growthRate: 10,
    terminalGrowth: 3,
    discountRate: 10,
    years: 10
  });

  const results = useMemo(() => {
    const { fcf, growthRate, terminalGrowth, discountRate, years } = inputs;
    if (fcf <= 0) return null;

    let pvCashFlows = 0;
    const projectedCashFlows = [];

    for (let i = 1; i <= years; i++) {
      const projectedFCF = fcf * Math.pow(1 + growthRate / 100, i);
      const discountFactor = Math.pow(1 + discountRate / 100, i);
      const pvFCF = projectedFCF / discountFactor;
      pvCashFlows += pvFCF;
      projectedCashFlows.push({
        year: i,
        fcf: projectedFCF,
        pv: pvFCF
      });
    }

    // Terminal value
    const terminalFCF = fcf * Math.pow(1 + growthRate / 100, years) * (1 + terminalGrowth / 100);
    const terminalValue = terminalFCF / (discountRate / 100 - terminalGrowth / 100);
    const pvTerminal = terminalValue / Math.pow(1 + discountRate / 100, years);

    const enterpriseValue = pvCashFlows + pvTerminal;

    return {
      pvCashFlows,
      pvTerminal,
      enterpriseValue,
      projectedCashFlows
    };
  }, [inputs]);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  return (
    <div className="dcf-calculator-section">
      <h3>DCF Calculator</h3>
      <p className="dcf-disclaimer">Simple DCF model for educational purposes. Not investment advice.</p>

      <div className="dcf-inputs">
        <div className="input-group">
          <label>Base FCF ($M)</label>
          <input
            type="number"
            value={inputs.fcf / 1e6}
            onChange={(e) => handleInputChange('fcf', e.target.value * 1e6)}
          />
        </div>
        <div className="input-group">
          <label>Growth Rate (%)</label>
          <input
            type="number"
            value={inputs.growthRate}
            onChange={(e) => handleInputChange('growthRate', e.target.value)}
            min="0"
            max="50"
          />
        </div>
        <div className="input-group">
          <label>Terminal Growth (%)</label>
          <input
            type="number"
            value={inputs.terminalGrowth}
            onChange={(e) => handleInputChange('terminalGrowth', e.target.value)}
            min="0"
            max="5"
          />
        </div>
        <div className="input-group">
          <label>Discount Rate (%)</label>
          <input
            type="number"
            value={inputs.discountRate}
            onChange={(e) => handleInputChange('discountRate', e.target.value)}
            min="5"
            max="20"
          />
        </div>
        <div className="input-group">
          <label>Projection Years</label>
          <input
            type="number"
            value={inputs.years}
            onChange={(e) => handleInputChange('years', e.target.value)}
            min="5"
            max="15"
          />
        </div>
      </div>

      {results && (
        <div className="dcf-results">
          <div className="result-card primary">
            <span className="result-label">Implied Enterprise Value</span>
            <span className="result-value">{formatCurrency(results.enterpriseValue)}</span>
          </div>
          <div className="result-breakdown">
            <div className="result-item">
              <span>PV of Cash Flows</span>
              <span>{formatCurrency(results.pvCashFlows)}</span>
            </div>
            <div className="result-item">
              <span>PV of Terminal Value</span>
              <span>{formatCurrency(results.pvTerminal)}</span>
            </div>
            <div className="result-item">
              <span>Terminal Value %</span>
              <span>{((results.pvTerminal / results.enterpriseValue) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {!results && inputs.fcf <= 0 && (
        <div className="dcf-no-fcf">
          <p>Negative or zero FCF - DCF not applicable</p>
        </div>
      )}
    </div>
  );
});

// Position Sizing Section for Equity Analysis (reserved for future use) - memoized
// eslint-disable-next-line no-unused-vars
const PositionSizingSection = memo(function PositionSizingSection({ symbol, companyName, currentPrice }) {
  const [kellyData, setKellyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadKellyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await simulateAPI.analyzeSingleHolding(symbol, {
        period: '3y',
        riskFreeRate: 0.05
      });
      const data = res.data.data || res.data;
      if (data?.error) {
        setError(data.error);
      } else {
        setKellyData(data);
      }
    } catch (err) {
      console.error('Failed to load Kelly data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    loadKellyData();
  }, [loadKellyData]);

  if (loading) {
    return (
      <div className="position-sizing-section">
        <div className="loading-state">
          <Loader className="spinning" size={24} />
          <span>Analyzing position sizing...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="position-sizing-section">
        <div className="error-state">
          <AlertTriangle size={24} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!kellyData) {
    return (
      <div className="position-sizing-section">
        <div className="no-data">Insufficient historical data for position sizing analysis</div>
      </div>
    );
  }

  const recommended = kellyData.kelly?.recommended;
  const stats = kellyData.statistics;
  const tailRisk = kellyData.tailRisk;
  const benchmark = kellyData.benchmarkComparison;

  return (
    <div className="position-sizing-section">
      <h3><Target size={18} /> Position Sizing Analysis</h3>
      <p className="section-description">
        Kelly Criterion-based sizing recommendation using {kellyData.period || '3 years'} of historical data
      </p>

      {/* Main Recommendation Card */}
      <div className="sizing-recommendation-card">
        <div className="recommendation-header">
          <div className="recommendation-main">
            <span className="rec-label">Recommended Position Size</span>
            <span className="rec-value">{((recommended?.fraction || 0) * 100).toFixed(0)}%</span>
            <span className="rec-name">{recommended?.label || 'Kelly'}</span>
          </div>
          <div className="recommendation-action">
            <AddToPortfolioButton
              symbol={symbol}
              companyName={companyName}
              currentPrice={currentPrice}
            />
          </div>
        </div>
        <p className="recommendation-reason">{recommended?.reason}</p>
      </div>

      {/* Stats Grid */}
      <div className="sizing-stats-grid">
        <div className="sizing-stat-card">
          <div className="stat-header">
            <TrendingUp size={16} />
            <span>Performance</span>
          </div>
          <div className="stat-rows">
            <div className="stat-row">
              <span>Annual Return</span>
              <span className={stats?.annualReturn >= 0 ? 'positive' : 'negative'}>
                {stats?.annualReturn >= 0 ? '+' : ''}{stats?.annualReturn}%
              </span>
            </div>
            <div className="stat-row">
              <span>Win Rate</span>
              <span>{stats?.winRate}%</span>
            </div>
            <div className="stat-row">
              <span>Sharpe Ratio</span>
              <span className={stats?.sharpeRatio >= 1 ? 'positive' : ''}>{stats?.sharpeRatio}</span>
            </div>
            <div className="stat-row">
              <span>Volatility</span>
              <span>{stats?.annualVolatility}%</span>
            </div>
          </div>
        </div>

        <div className="sizing-stat-card">
          <div className="stat-header">
            <AlertTriangle size={16} />
            <span>Tail Risk</span>
          </div>
          <div className="stat-rows">
            <div className="stat-row">
              <span>VaR 95%</span>
              <span className="negative">{tailRisk?.var95}%</span>
            </div>
            <div className="stat-row">
              <span>VaR 99%</span>
              <span className="negative">{tailRisk?.var99}%</span>
            </div>
            <div className="stat-row">
              <span>Max Daily Loss</span>
              <span className="negative">{tailRisk?.maxObservedLoss}%</span>
            </div>
            <div className="stat-row">
              <span>Fat Tails</span>
              <span className={tailRisk?.isFatTailed ? 'negative' : 'positive'}>
                {tailRisk?.isFatTailed ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {benchmark && (
          <div className="sizing-stat-card">
            <div className="stat-header">
              <TrendingDown size={16} />
              <span>vs {benchmark.benchmark}</span>
            </div>
            <div className="stat-rows">
              <div className="stat-row">
                <span>Beta</span>
                <span>{benchmark.beta}</span>
              </div>
              <div className="stat-row">
                <span>Alpha</span>
                <span className={benchmark.alpha > 0 ? 'positive' : 'negative'}>
                  {benchmark.alpha > 0 ? '+' : ''}{benchmark.alpha}%
                </span>
              </div>
              <div className="stat-row">
                <span>Correlation</span>
                <span>{benchmark.correlation}</span>
              </div>
              <div className="stat-row">
                <span>Excess Return</span>
                <span className={benchmark.excessReturn > 0 ? 'positive' : 'negative'}>
                  {benchmark.excessReturn > 0 ? '+' : ''}{benchmark.excessReturn}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Risk Warning */}
      {tailRisk?.warning && (
        <div className="sizing-warning">
          <AlertTriangle size={16} />
          <span>{tailRisk.warning}</span>
        </div>
      )}

      {/* Position Size Analysis Table */}
      {kellyData.fractionAnalysis && (
        <div className="fraction-analysis-section">
          <h4>Position Size Scenarios</h4>
          <table className="fraction-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Expected Return</th>
                <th>Volatility</th>
                <th>Max DD Est.</th>
                <th>Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {kellyData.fractionAnalysis.map(f => (
                <tr
                  key={f.fraction}
                  className={f.fraction === recommended?.fraction ? 'highlighted' : ''}
                >
                  <td>{(f.fraction * 100).toFixed(0)}% Kelly</td>
                  <td className={f.expectedReturn >= 0 ? 'positive' : 'negative'}>
                    {f.expectedReturn >= 0 ? '+' : ''}{f.expectedReturn?.toFixed(1)}%
                  </td>
                  <td>{f.expectedVolatility?.toFixed(1)}%</td>
                  <td className="negative">-{f.expectedMaxDrawdown?.toFixed(1)}%</td>
                  <td>
                    <span className={`risk-badge ${f.riskOf50pctDrawdown > 20 ? 'high' : f.riskOf50pctDrawdown > 10 ? 'medium' : 'low'}`}>
                      {f.riskOf50pctDrawdown > 20 ? 'High' : f.riskOf50pctDrawdown > 10 ? 'Medium' : 'Low'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="sizing-note">
        <p>Position sizing recommendations are based on historical data and the Kelly Criterion.
        Past performance doesn't guarantee future results. Consider your personal risk tolerance
        and portfolio diversification when making investment decisions.</p>
      </div>
    </div>
  );
});

// ============ MAIN COMPONENT ============

const AnalysisDashboard = memo(function AnalysisDashboard({ symbol, periodType = 'annual', initialSection = 'quality', companyName, currentPrice }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(initialSection);

  // Update active section when initialSection changes (e.g., from DCF click)
  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await companyAPI.getAnalysis(symbol, { periodType });
        setData(response.data);
      } catch (err) {
        console.error('Failed to load analysis:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      loadAnalysis();
    }
  }, [symbol, periodType]);

  if (loading) {
    return <div className="analysis-loading">Loading analysis...</div>;
  }

  if (error) {
    return <div className="analysis-error">Failed to load analysis: {error}</div>;
  }

  if (!data) {
    return <div className="analysis-error">No analysis data available</div>;
  }

  const sections = [
    { id: 'quality', label: 'Quality' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'capital', label: 'Capital' },
    { id: 'peers', label: 'Peers' },
    { id: 'dcf', label: 'DCF' }
  ];

  return (
    <div className="analysis-dashboard">
      <div className="analysis-nav">
        {sections.map(section => (
          <button
            key={section.id}
            className={activeSection === section.id ? 'active' : ''}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="analysis-content">
        {activeSection === 'quality' && (
          <QualityScores
            piotroski={data.qualityScores?.piotroski}
            altmanZ={data.qualityScores?.altmanZ}
          />
        )}

        {activeSection === 'capital' && (
          <CapitalAllocation data={data.capitalAllocation} />
        )}

        {activeSection === 'valuation' && (
          <>
            <ValuationSummary
              latestMetrics={data.latestMetrics}
              valuationHistory={data.valuationHistory}
            />
            <ValuationHistory data={data.valuationHistory} latestMetrics={data.latestMetrics} />
          </>
        )}

        {activeSection === 'peers' && (
          <PeerComparison
            peers={data.peerComparison?.peers}
            sectorAverage={data.peerComparison?.sectorAverage}
            currentCompany={data.company}
            latestMetrics={data.latestMetrics}
          />
        )}

        {activeSection === 'dcf' && (
          <DCFValuation symbol={symbol} />
        )}
      </div>
    </div>
  );
});

export default AnalysisDashboard;
