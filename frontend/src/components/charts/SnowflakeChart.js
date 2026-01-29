// frontend/src/components/charts/SnowflakeChart.js
import { useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { useAskAI, createChartExtractor } from '../../hooks';
import './SnowflakeChart.css';

// Prism Design System chart colors
const DIMENSIONS = [
  { key: 'value', label: 'Value', color: '#2563EB', description: 'P/E, P/B, PEG ratios vs peers' },
  { key: 'growth', label: 'Growth', color: '#059669', description: 'Revenue & earnings growth' },
  { key: 'past', label: 'Past', color: '#D97706', description: 'Historical performance' },
  { key: 'health', label: 'Health', color: '#7C3AED', description: 'Financial stability' },
  { key: 'dividend', label: 'Dividend', color: '#0891B2', description: 'Yield and growth' },
];

// Calculate scores based on metrics
function calculateScores(metrics, sectorAvg) {
  if (!metrics) {
    return DIMENSIONS.map(d => ({ ...d, score: 0, maxScore: 6 }));
  }

  // Value Score (0-6): Lower P/E, P/B relative to sector is better
  const valueScore = (() => {
    let score = 0;
    const pe = metrics.pe_ratio;
    const pb = metrics.pb_ratio;
    const avgPe = sectorAvg?.avg_pe || 25;
    const avgPb = sectorAvg?.avg_pb || 3;

    if (pe && pe < avgPe * 0.7) score += 2;
    else if (pe && pe < avgPe) score += 1;

    if (pb && pb < avgPb * 0.7) score += 2;
    else if (pb && pb < avgPb) score += 1;

    if (metrics.fcf_yield && metrics.fcf_yield > 5) score += 2;
    else if (metrics.fcf_yield && metrics.fcf_yield > 2) score += 1;

    return Math.min(score, 6);
  })();

  // Growth Score (0-6): Revenue and earnings growth
  const growthScore = (() => {
    let score = 0;
    const revGrowth = metrics.revenue_growth_yoy;
    const epsGrowth = metrics.eps_growth_yoy;

    if (revGrowth && revGrowth > 20) score += 2;
    else if (revGrowth && revGrowth > 10) score += 1.5;
    else if (revGrowth && revGrowth > 5) score += 1;

    if (epsGrowth && epsGrowth > 25) score += 2;
    else if (epsGrowth && epsGrowth > 10) score += 1.5;
    else if (epsGrowth && epsGrowth > 0) score += 1;

    // Bonus for high ROIC indicating reinvestment potential
    if (metrics.roic && metrics.roic > 15) score += 2;
    else if (metrics.roic && metrics.roic > 10) score += 1;

    return Math.min(score, 6);
  })();

  // Past Performance Score (0-6): ROE and margin consistency
  const pastScore = (() => {
    let score = 0;
    const roe = metrics.roe;
    const avgRoe = sectorAvg?.avg_roe || 15;

    if (roe && roe > avgRoe * 1.5) score += 3;
    else if (roe && roe > avgRoe) score += 2;
    else if (roe && roe > avgRoe * 0.7) score += 1;

    if (metrics.net_margin && metrics.net_margin > 20) score += 2;
    else if (metrics.net_margin && metrics.net_margin > 10) score += 1.5;
    else if (metrics.net_margin && metrics.net_margin > 5) score += 1;

    return Math.min(score, 6);
  })();

  // Financial Health Score (0-6): Debt levels and liquidity
  const healthScore = (() => {
    let score = 0;
    const debtToEquity = metrics.debt_to_equity;

    if (debtToEquity !== null && debtToEquity !== undefined) {
      if (debtToEquity < 0.3) score += 3;
      else if (debtToEquity < 0.5) score += 2.5;
      else if (debtToEquity < 1) score += 2;
      else if (debtToEquity < 2) score += 1;
    }

    if (metrics.current_ratio && metrics.current_ratio > 2) score += 1.5;
    else if (metrics.current_ratio && metrics.current_ratio > 1.5) score += 1;

    if (metrics.interest_coverage && metrics.interest_coverage > 10) score += 1.5;
    else if (metrics.interest_coverage && metrics.interest_coverage > 5) score += 1;

    return Math.min(score, 6);
  })();

  // Dividend Score (0-6): Yield and sustainability
  const dividendScore = (() => {
    let score = 0;
    const divYield = metrics.dividend_yield;

    if (divYield && divYield > 3) score += 3;
    else if (divYield && divYield > 2) score += 2;
    else if (divYield && divYield > 1) score += 1;
    else if (!divYield || divYield === 0) score += 0;

    // Payout ratio - sustainable dividends
    if (metrics.payout_ratio && metrics.payout_ratio < 60 && metrics.payout_ratio > 0) score += 2;
    else if (metrics.payout_ratio && metrics.payout_ratio < 80 && metrics.payout_ratio > 0) score += 1;

    // No dividend but strong buybacks count for 2
    if ((!divYield || divYield === 0) && metrics.fcf_yield && metrics.fcf_yield > 5) score += 2;

    return Math.min(score, 6);
  })();

  return [
    { ...DIMENSIONS[0], score: valueScore, maxScore: 6 },
    { ...DIMENSIONS[1], score: growthScore, maxScore: 6 },
    { ...DIMENSIONS[2], score: pastScore, maxScore: 6 },
    { ...DIMENSIONS[3], score: healthScore, maxScore: 6 },
    { ...DIMENSIONS[4], score: dividendScore, maxScore: 6 },
  ];
}

function getScoreColor(score) {
  if (score >= 5) return 'var(--positive)';
  if (score >= 3) return 'var(--warning)';
  return 'var(--negative)';
}

function getOverallInterpretation(total) {
  if (total >= 25) return { label: 'Excellent', color: 'var(--positive)' };
  if (total >= 20) return { label: 'Good', color: 'var(--positive)' };
  if (total >= 15) return { label: 'Average', color: 'var(--warning)' };
  if (total >= 10) return { label: 'Below Average', color: 'var(--warning)' };
  return { label: 'Poor', color: 'var(--negative)' };
}

function SnowflakeChart({ metrics, sectorAverage, size = 'medium', showLegend = true }) {
  const scores = useMemo(() => calculateScores(metrics, sectorAverage), [metrics, sectorAverage]);

  const chartData = scores.map(s => ({
    dimension: s.label,
    score: s.score,
    fullMark: s.maxScore,
    color: s.color,
    description: s.description
  }));

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const maxScore = scores.reduce((sum, s) => sum + s.maxScore, 0);
  const interpretation = getOverallInterpretation(totalScore);

  const sizeConfig = {
    small: { height: 180, fontSize: 10 },
    medium: { height: 280, fontSize: 12 },
    large: { height: 350, fontSize: 14 }
  };

  const config = sizeConfig[size] || sizeConfig.medium;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="snowflake-tooltip">
          <div className="tooltip-header" style={{ color: data.color }}>
            {data.dimension}
          </div>
          <div className="tooltip-score">
            {data.score.toFixed(1)} / {data.fullMark}
          </div>
          <div className="tooltip-desc">{data.description}</div>
        </div>
      );
    }
    return null;
  };

  // Ask AI right-click support
  const askAIProps = useAskAI(createChartExtractor(() => ({
    symbol: metrics?.symbol,
    metric: 'snowflake_analysis',
    companyName: 'Quality Analysis'
  })));

  return (
    <div className={`snowflake-chart size-${size}`} {...askAIProps}>
      <div className="snowflake-wrapper">
        <ResponsiveContainer width="100%" height={config.height}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid
              gridType="polygon"
              stroke="var(--border-primary)"
              strokeOpacity={0.5}
            />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: 'var(--text-secondary)', fontSize: config.fontSize }}
              tickLine={false}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 6]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="var(--brand-primary)"
              fill="var(--brand-primary)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Center score display */}
        <div className="snowflake-center">
          <span className="center-score" style={{ color: interpretation.color }}>
            {totalScore.toFixed(0)}
          </span>
          <span className="center-max">/{maxScore}</span>
        </div>
      </div>

      {/* Overall interpretation */}
      <div className="snowflake-summary">
        <span className="summary-label">Overall:</span>
        <span className="summary-value" style={{ color: interpretation.color }}>
          {interpretation.label}
        </span>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="snowflake-legend">
          {scores.map(s => (
            <div key={s.key} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              <span className="legend-label">{s.label}</span>
              <span className="legend-score" style={{ color: getScoreColor(s.score) }}>
                {s.score.toFixed(0)}/6
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SnowflakeChart;
