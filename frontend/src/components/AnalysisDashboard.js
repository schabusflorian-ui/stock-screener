// frontend/src/components/AnalysisDashboard.js
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { companyAPI } from '../services/api';
import { DCFValuation } from './DCFValuation';
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

// Quality Scores Section
function QualityScores({ piotroski, altmanZ }) {
  // Handle missing data - determine if we have valid scores
  const hasPiotroski = piotroski && piotroski.score !== null && piotroski.score !== undefined;
  const hasAltmanZ = altmanZ && altmanZ.score !== null && altmanZ.score !== undefined;

  const piotroskiColor = hasPiotroski
    ? (piotroski.score >= 7 ? '#22c55e' : piotroski.score >= 5 ? '#f59e0b' : '#ef4444')
    : '#9ca3af';

  const altmanColor = hasAltmanZ
    ? (altmanZ.zone === 'safe' ? '#22c55e' : altmanZ.zone === 'grey' ? '#f59e0b' : '#ef4444')
    : '#9ca3af';

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
      <h3>Quality Scores</h3>
      <div className="scores-grid">
        {/* Piotroski F-Score */}
        <div className="score-card">
          <div className="score-header">
            <h4>Piotroski F-Score</h4>
            <div className="score-display" style={{ '--score-color': piotroskiColor }}>
              <span className="score-value">{hasPiotroski ? piotroski.score : '-'}</span>
              <span className="score-max">/9</span>
            </div>
          </div>

          {hasPiotroski && (
            <div className="score-gauge">
              <div className="gauge-track">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className={`gauge-segment ${i < piotroski.score ? 'filled' : ''}`}
                    style={{
                      backgroundColor: i < piotroski.score ? piotroskiColor : 'rgba(0,0,0,0.08)'
                    }}
                  />
                ))}
              </div>
              <div className="gauge-labels">
                <span>Weak</span>
                <span>Strong</span>
              </div>
            </div>
          )}

          <p className="score-interpretation">
            {hasPiotroski ? piotroski.interpretation : 'Insufficient data to calculate score'}
          </p>

          {hasPiotroski && Object.keys(piotroskiComponents).length > 0 && (
            <div className="score-components">
              <div className="component-group">
                <span className="group-label">Profitability</span>
                <div className="component-items">
                  {['positiveNetIncome', 'positiveROA', 'positiveCFO', 'cfoGreaterThanNetIncome'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    return (
                      <div key={key} className={`component-item ${!hasData ? 'no-data' : piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                        <span className="check">{!hasData ? '?' : piotroskiComponents[key] ? '✓' : '✗'}</span>
                        <span>{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="component-group">
                <span className="group-label">Leverage & Liquidity</span>
                <div className="component-items">
                  {['decreasingLeverage', 'increasingCurrentRatio', 'noNewShares'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    return (
                      <div key={key} className={`component-item ${!hasData ? 'no-data' : piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                        <span className="check">{!hasData ? '?' : piotroskiComponents[key] ? '✓' : '✗'}</span>
                        <span>{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="component-group">
                <span className="group-label">Operating Efficiency</span>
                <div className="component-items">
                  {['increasingGrossMargin', 'increasingAssetTurnover'].map(key => {
                    const hasData = piotroskiComponents[key] !== undefined;
                    return (
                      <div key={key} className={`component-item ${!hasData ? 'no-data' : piotroskiComponents[key] ? 'pass' : 'fail'}`}>
                        <span className="check">{!hasData ? '?' : piotroskiComponents[key] ? '✓' : '✗'}</span>
                        <span>{componentLabels[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!hasPiotroski && (
            <div className="no-score-data">
              <span className="no-data-icon">📊</span>
              <p>Score unavailable - requires multiple periods of financial data</p>
            </div>
          )}
        </div>

        {/* Altman Z-Score */}
        <div className="score-card">
          <div className="score-header">
            <h4>Altman Z-Score</h4>
            <div className="score-display" style={{ '--score-color': altmanColor }}>
              <span className="score-value">{hasAltmanZ ? altmanZ.score.toFixed(2) : '-'}</span>
            </div>
          </div>

          <p className="score-interpretation">
            {hasAltmanZ ? altmanZ.interpretation : 'Insufficient data to calculate score'}
          </p>

          {hasAltmanZ && (
            <div className="z-score-meter">
              <div className="meter-track">
                <div className="zone distress">Distress</div>
                <div className="zone grey">Grey</div>
                <div className="zone safe">Safe</div>
              </div>
              <div
                className="meter-marker"
                style={{
                  left: `${Math.min(100, Math.max(0, (altmanZ.score / 5) * 100))}%`
                }}
              >
                <span>{altmanZ.score.toFixed(1)}</span>
              </div>
              <div className="meter-scale">
                <span>0</span>
                <span className="threshold">1.8</span>
                <span className="threshold">3.0</span>
                <span>5+</span>
              </div>
            </div>
          )}

          {hasAltmanZ && altmanZ.components && (
            <div className="z-components">
              <div className="z-component">
                <span className="label">Working Capital/Assets</span>
                <span className="value">{safePercent(altmanZ.components.workingCapitalRatio)}</span>
              </div>
              <div className="z-component">
                <span className="label">Retained Earnings/Assets</span>
                <span className="value">{safePercent(altmanZ.components.retainedEarningsRatio)}</span>
              </div>
              <div className="z-component">
                <span className="label">EBIT/Assets</span>
                <span className="value">{safePercent(altmanZ.components.ebitRatio)}</span>
              </div>
              <div className="z-component">
                <span className="label">Market Cap/Liabilities</span>
                <span className="value">{safeRatio(altmanZ.components.marketToDebtRatio)}</span>
              </div>
              <div className="z-component">
                <span className="label">Sales/Assets</span>
                <span className="value">{safeRatio(altmanZ.components.assetTurnover)}</span>
              </div>
            </div>
          )}

          {!hasAltmanZ && (
            <div className="no-score-data">
              <span className="no-data-icon">📉</span>
              <p>Score unavailable - requires complete balance sheet and income data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Capital Allocation Section
function CapitalAllocation({ data }) {
  if (!data || data.length === 0) {
    return <div className="no-data">No capital allocation data available</div>;
  }

  const chartData = [...data].reverse().map(d => ({
    period: d.period.substring(0, 4),
    Dividends: Math.abs(d.dividends) / 1e9,
    Buybacks: Math.abs(d.buybacks) / 1e9,
    CapEx: Math.abs(d.capex) / 1e9,
    Acquisitions: Math.abs(d.acquisitions) / 1e9,
    'Debt Repayment': Math.abs(d.debtRepayment) / 1e9
  }));

  const latestData = data[0];
  const totalReturned = Math.abs(latestData.dividends) + Math.abs(latestData.buybacks);
  const fcf = latestData.freeCashFlow;

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
            <Bar dataKey="Dividends" stackId="a" fill="#22c55e" />
            <Bar dataKey="Buybacks" stackId="a" fill="#3b82f6" />
            <Bar dataKey="CapEx" stackId="b" fill="#8b5cf6" />
            <Bar dataKey="Acquisitions" stackId="b" fill="#f59e0b" />
            <Bar dataKey="Debt Repayment" stackId="b" fill="#64748b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="allocation-breakdown">
        <h4>Latest Period Breakdown</h4>
        <div className="breakdown-bars">
          {[
            { label: 'Dividends', value: latestData.dividends, color: '#22c55e' },
            { label: 'Buybacks', value: latestData.buybacks, color: '#3b82f6' },
            { label: 'CapEx', value: latestData.capex, color: '#8b5cf6' },
            { label: 'Acquisitions', value: latestData.acquisitions, color: '#f59e0b' },
            { label: 'Debt Repayment', value: latestData.debtRepayment, color: '#64748b' }
          ].map(item => {
            const absValue = Math.abs(item.value);
            const maxValue = Math.max(
              Math.abs(latestData.dividends),
              Math.abs(latestData.buybacks),
              Math.abs(latestData.capex),
              Math.abs(latestData.acquisitions),
              Math.abs(latestData.debtRepayment)
            ) || 1;
            const width = (absValue / maxValue) * 100;

            return (
              <div key={item.label} className="breakdown-row">
                <span className="breakdown-label">{item.label}</span>
                <div className="breakdown-bar-track">
                  <div
                    className="breakdown-bar-fill"
                    style={{ width: `${width}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="breakdown-value">{formatCurrency(item.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Valuation Summary with Gauge
function ValuationSummary({ latestMetrics, valuationHistory }) {
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
    if (score === null) return { label: 'N/A', color: '#6b7280' };
    if (score < 30) return { label: 'Attractive', color: '#22c55e' };
    if (score < 50) return { label: 'Fair', color: '#84cc16' };
    if (score < 70) return { label: 'Full', color: '#f59e0b' };
    return { label: 'Expensive', color: '#ef4444' };
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
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="33%" stopColor="#84cc16" />
                <stop offset="66%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
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
}

// Valuation History Section with Multi-Select
function ValuationHistory({ data, latestMetrics }) {
  const metrics = [
    { key: 'pe_ratio', label: 'P/E', fullLabel: 'Price / Earnings', color: '#6366f1' },
    { key: 'pb_ratio', label: 'P/B', fullLabel: 'Price / Book', color: '#8b5cf6' },
    { key: 'ps_ratio', label: 'P/S', fullLabel: 'Price / Sales', color: '#a855f7' },
    { key: 'ev_ebitda', label: 'EV/EBITDA', fullLabel: 'EV / EBITDA', color: '#3b82f6' },
    { key: 'fcf_yield', label: 'FCF Yield', fullLabel: 'FCF Yield %', color: '#22c55e' },
    { key: 'earnings_yield', label: 'Earn Yield', fullLabel: 'Earnings Yield %', color: '#14b8a6' },
    { key: 'dividend_yield', label: 'Div Yield', fullLabel: 'Dividend Yield %', color: '#f59e0b' }
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
}

// Peer Comparison Section
function PeerComparison({ peers, sectorAverage, currentCompany, latestMetrics }) {
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
      const aVal = a[sortBy] ?? -Infinity;
      const bVal = b[sortBy] ?? -Infinity;
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [peers, sortBy, sortDir]);

  const columns = [
    { key: 'symbol', label: 'Symbol', format: v => v },
    { key: 'market_cap', label: 'Market Cap', format: formatCurrency },
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

    // Get top 8 peers by market cap for the chart
    const topPeers = [...peers]
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
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
              <Bar dataKey="roic" name="ROIC" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              <Bar dataKey="roe" name="ROE" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              <Bar dataKey="net_margin" name="Net Margin" fill="#22c55e" radius={[0, 4, 4, 0]} />
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
                        {col.format(peer[col.key])}
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
}

// DCF Calculator
// eslint-disable-next-line no-unused-vars
function DCFCalculator({ latestMetrics, companyName }) {
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
}

// ============ MAIN COMPONENT ============

function AnalysisDashboard({ symbol, periodType = 'annual', initialSection = 'quality' }) {
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
}

export default AnalysisDashboard;
