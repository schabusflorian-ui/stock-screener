// frontend/src/components/company/MultiLensAnalysis.js
// Multi-Lens Analysis Component - Professional, Neutral Tone
import React from 'react';
import {
  DollarSign,
  Award,
  Shield,
  TrendingUp,
  Banknote,
  Rocket,
  HelpCircle
} from '../icons';
import './MultiLensAnalysis.css';

// Lens configuration
const LENSES = [
  {
    key: 'value',
    icon: DollarSign,
    label: 'Value',
    description: 'Price relative to fundamentals',
    metrics: ['pe_ratio', 'pb_ratio', 'fcf_yield'],
    metricLabels: { pe_ratio: 'P/E', pb_ratio: 'P/B', fcf_yield: 'FCF Yield' }
  },
  {
    key: 'quality',
    icon: Award,
    label: 'Quality',
    description: 'Business quality and returns',
    metrics: ['piotroski', 'roic', 'roe'],
    metricLabels: { piotroski: 'F-Score', roic: 'ROIC', roe: 'ROE' }
  },
  {
    key: 'risk',
    icon: Shield,
    label: 'Risk',
    description: 'Financial health and leverage',
    metrics: ['altman_z', 'debt_to_equity', 'interest_coverage'],
    metricLabels: { altman_z: 'Z-Score', debt_to_equity: 'D/E', interest_coverage: 'Int. Cov.' }
  },
  {
    key: 'momentum',
    icon: TrendingUp,
    label: 'Momentum',
    description: 'Price trend strength',
    metrics: ['momentum_percentile', 'price_change_6m', 'relative_strength'],
    metricLabels: { momentum_percentile: 'Percentile', price_change_6m: '6M Change', relative_strength: 'RS' }
  },
  {
    key: 'income',
    icon: Banknote,
    label: 'Income',
    description: 'Dividend characteristics',
    metrics: ['dividend_yield', 'payout_ratio', 'dividend_growth'],
    metricLabels: { dividend_yield: 'Yield', payout_ratio: 'Payout', dividend_growth: 'Growth' }
  },
  {
    key: 'growth',
    icon: Rocket,
    label: 'Growth',
    description: 'Revenue and earnings growth',
    metrics: ['growth_percentile', 'revenue_growth_yoy', 'earnings_growth'],
    metricLabels: { growth_percentile: 'Percentile', revenue_growth_yoy: 'Rev. Growth', earnings_growth: 'EPS Growth' }
  }
];

// Convert percentile to letter grade
function percentileToGrade(percentile) {
  if (percentile === null || percentile === undefined) return { grade: 'N/A', class: 'na' };
  if (percentile >= 90) return { grade: 'A+', class: 'excellent' };
  if (percentile >= 80) return { grade: 'A', class: 'excellent' };
  if (percentile >= 70) return { grade: 'B', class: 'good' };
  if (percentile >= 60) return { grade: 'B-', class: 'good' };
  if (percentile >= 50) return { grade: 'C', class: 'average' };
  if (percentile >= 40) return { grade: 'C-', class: 'below-average' };
  return { grade: 'D', class: 'poor' };
}

// Convert Piotroski score to grade (0-9 scale)
function piotroskiToGrade(score) {
  if (score === null || score === undefined) return { grade: 'N/A', class: 'na' };
  if (score >= 8) return { grade: 'A+', class: 'excellent' };
  if (score >= 7) return { grade: 'A', class: 'excellent' };
  if (score >= 5) return { grade: 'B', class: 'good' };
  if (score >= 4) return { grade: 'C', class: 'average' };
  if (score >= 2) return { grade: 'D', class: 'below-average' };
  return { grade: 'F', class: 'poor' };
}

// Convert Altman Z-Score to grade
function altmanToGrade(zscore) {
  if (zscore === null || zscore === undefined) return { grade: 'N/A', class: 'na' };
  if (zscore >= 3.0) return { grade: 'A', class: 'excellent' };
  if (zscore >= 2.7) return { grade: 'B', class: 'good' };
  if (zscore >= 1.8) return { grade: 'C', class: 'average' };
  return { grade: 'D', class: 'poor' };
}

// Format metric value - professional, neutral presentation
function formatMetricValue(key, value) {
  if (value === null || value === undefined) return 'N/A';

  switch (key) {
    case 'pe_ratio':
    case 'pb_ratio':
      return `${value.toFixed(1)}x`;
    case 'fcf_yield':
    case 'roic':
    case 'roe':
    case 'dividend_yield':
    case 'payout_ratio':
    case 'dividend_growth':
    case 'revenue_growth_yoy':
    case 'earnings_growth':
    case 'price_change_6m':
      return `${value >= 0 ? '' : ''}${(value * 100).toFixed(1)}%`;
    case 'momentum_percentile':
    case 'growth_percentile':
      return `${value.toFixed(0)}th`;
    case 'debt_to_equity':
      return `${value.toFixed(2)}`;
    case 'interest_coverage':
      return `${value.toFixed(1)}x`;
    case 'piotroski':
      return `${value}/9`;
    case 'altman_z':
      return value.toFixed(2);
    case 'relative_strength':
      return value.toFixed(0);
    default:
      return typeof value === 'number' ? value.toFixed(2) : value;
  }
}

// Generate lens-specific professional insight (neutral, factual tone)
function getLensInsight(lensKey, data) {
  if (!data) return null;

  switch (lensKey) {
    case 'value': {
      const pe = data.pe_ratio;
      const pb = data.pb_ratio;
      if (pe && pb) {
        if (pe < 15 && pb < 2) return 'Trades at a discount to typical market multiples';
        if (pe > 25 || pb > 4) return 'Multiples above market averages';
        return 'Multiples near market median';
      }
      return null;
    }
    case 'quality': {
      const piotroski = data.piotroski;
      const roic = data.roic;
      // Backend stores ROIC as percentage (15 = 15%), not decimal
      if (piotroski >= 7 && roic > 15) return 'High F-Score with strong capital returns';
      if (piotroski <= 3) return 'F-Score indicates financial stress signals';
      if (roic > 20) return `ROIC of ${roic.toFixed(0)}% exceeds cost of capital`;
      return null;
    }
    case 'risk': {
      const altman = data.altman_z;
      const de = data.debt_to_equity;
      if (altman >= 3) return 'Balance sheet indicates low distress probability';
      if (altman < 1.8) return 'Z-Score below safe threshold';
      if (de > 2) return 'Elevated leverage relative to equity';
      return null;
    }
    case 'momentum': {
      const percentile = data.momentum_percentile;
      if (percentile >= 80) return 'Price trend ranks in top quintile';
      if (percentile <= 20) return 'Price trend ranks in bottom quintile';
      return null;
    }
    case 'income': {
      const yield_ = data.dividend_yield;
      const payout = data.payout_ratio;
      if (!yield_ || yield_ === 0) return 'No current dividend';
      // Backend stores payout_ratio as decimal (0.8 = 80%)
      if (payout && payout > 0.8) return 'Payout ratio above sustainable threshold';
      // Backend stores dividend_yield as percentage (4 = 4%)
      if (yield_ > 4) return `Yield of ${yield_.toFixed(1)}% above market average`;
      return null;
    }
    case 'growth': {
      const revGrowth = data.revenue_growth_yoy;
      // Backend stores growth as percentage (20 = 20%)
      if (revGrowth > 20) return `Revenue growth of ${revGrowth.toFixed(0)}% YoY`;
      if (revGrowth < 0) return 'Revenue declined year-over-year';
      return null;
    }
    default:
      return null;
  }
}

// Get lens grade from data
function getLensGrade(lensKey, data, factorData) {
  if (!data && !factorData) return { grade: 'N/A', class: 'na' };

  switch (lensKey) {
    case 'value':
      return factorData?.value_percentile
        ? percentileToGrade(factorData.value_percentile)
        : { grade: 'N/A', class: 'na' };
    case 'quality':
      return data?.piotroski
        ? piotroskiToGrade(data.piotroski)
        : { grade: 'N/A', class: 'na' };
    case 'risk':
      return data?.altman_z
        ? altmanToGrade(data.altman_z)
        : { grade: 'N/A', class: 'na' };
    case 'momentum':
      return factorData?.momentum_percentile
        ? percentileToGrade(factorData.momentum_percentile)
        : { grade: 'N/A', class: 'na' };
    case 'income':
      // No direct percentile, use yield-based assessment
      const yield_ = data?.dividend_yield || 0;
      if (yield_ === 0) return { grade: 'N/A', class: 'na' };
      if (yield_ >= 0.04) return { grade: 'A', class: 'excellent' };
      if (yield_ >= 0.02) return { grade: 'B', class: 'good' };
      return { grade: 'C', class: 'average' };
    case 'growth':
      return factorData?.growth_percentile
        ? percentileToGrade(factorData.growth_percentile)
        : { grade: 'N/A', class: 'na' };
    default:
      return { grade: 'N/A', class: 'na' };
  }
}

// Lens Card Component
function LensCard({ lens, analysisData, factorData }) {
  const Icon = lens.icon;
  const gradeInfo = getLensGrade(lens.key, analysisData, factorData);
  const insight = getLensInsight(lens.key, { ...analysisData, ...factorData });

  // Merge data sources for metric values
  const mergedData = { ...analysisData, ...factorData };

  return (
    <div className={`lens-card lens-card--${gradeInfo.class}`}>
      <div className="lens-card__header">
        <div className="lens-card__icon">
          <Icon size={18} />
        </div>
        <div className="lens-card__title">
          <span className="lens-card__label">{lens.label}</span>
          <span className="lens-card__description">{lens.description}</span>
        </div>
        <div className={`lens-card__grade lens-card__grade--${gradeInfo.class}`}>
          {gradeInfo.grade}
        </div>
      </div>

      <div className="lens-card__metrics">
        {lens.metrics.slice(0, 3).map(metricKey => {
          const value = mergedData?.[metricKey];
          return (
            <div key={metricKey} className="lens-card__metric">
              <span className="lens-card__metric-label">{lens.metricLabels[metricKey]}</span>
              <span className="lens-card__metric-value">{formatMetricValue(metricKey, value)}</span>
            </div>
          );
        })}
      </div>

      {insight && (
        <div className="lens-card__insight">
          {insight}
        </div>
      )}
    </div>
  );
}

function MultiLensAnalysis({
  symbol,
  analysisData = null,
  factorData = null,
  loading = false
}) {
  if (loading) {
    return (
      <div className="multi-lens-analysis">
        <div className="multi-lens-analysis__header">
          <h3>Multi-Lens Analysis</h3>
        </div>
        <div className="multi-lens-analysis__grid">
          {LENSES.map(lens => (
            <div key={lens.key} className="lens-card lens-card--loading">
              <div className="skeleton-content">
                <div className="skeleton-line wide" />
                <div className="skeleton-line medium" />
                <div className="skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Check if we have any data
  const hasData = analysisData || factorData;

  if (!hasData) {
    return (
      <div className="multi-lens-analysis">
        <div className="multi-lens-analysis__header">
          <h3>Multi-Lens Analysis</h3>
        </div>
        <div className="multi-lens-analysis__empty">
          <HelpCircle size={24} />
          <span>Analysis data not available for {symbol}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-lens-analysis">
      <div className="multi-lens-analysis__header">
        <h3>Multi-Lens Analysis</h3>
        <span className="multi-lens-analysis__subtitle">
          Factor-based assessment across six investment dimensions
        </span>
      </div>

      <div className="multi-lens-analysis__grid">
        {LENSES.map(lens => (
          <LensCard
            key={lens.key}
            lens={lens}
            analysisData={analysisData}
            factorData={factorData}
          />
        ))}
      </div>
    </div>
  );
}

export default MultiLensAnalysis;
