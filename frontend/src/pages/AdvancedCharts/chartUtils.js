/**
 * Chart Utilities
 *
 * Shared calculation and formatting functions for advanced charts
 */

// Color palette for series (Prism Design System)
export const SERIES_COLORS = [
  '#2563EB', '#059669', '#7C3AED', '#D97706', '#DC2626',
  '#0891B2', '#2563EB', '#059669', '#7C3AED', '#D97706'
];

// Normalization modes
export const NORMALIZATION_MODES = [
  { value: 'absolute', label: 'Absolute Values', description: 'Show actual metric values' },
  { value: 'indexed', label: 'Indexed (Base 100)', description: 'All series start at 100 for easy comparison' },
  { value: 'percent_change', label: '% Change', description: 'Percentage change from starting point' },
  { value: 'yoy_change', label: 'YoY Change', description: 'Year-over-year change for each period' },
];

// Correlation types
export const CORRELATION_TYPES = [
  { value: 'pearson', label: 'Pearson', description: 'Linear correlation (-1 to 1)' },
  { value: 'spearman', label: 'Spearman', description: 'Rank-based correlation (monotonic relationships)' },
  { value: 'mutual_info', label: 'Mutual Information', description: 'Non-linear dependency (0 to ∞)' },
];

// Margin metrics for waterfall chart (Prism Design System)
export const MARGIN_METRICS = [
  { key: 'gross_margin', label: 'Gross', color: '#059669' },
  { key: 'operating_margin', label: 'Operating', color: '#2563EB' },
  { key: 'net_margin', label: 'Net', color: '#7C3AED' },
];

// Radar chart metrics
export const RADAR_METRICS = ['roic', 'roe', 'gross_margin', 'net_margin', 'fcf_yield', 'current_ratio'];

/**
 * Format value for comparison display
 */
export const formatCompareValue = (value, format) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  switch (format) {
    case 'percent': return `${value.toFixed(1)}%`;
    case 'ratio': return value.toFixed(2);
    default: return value.toFixed(2);
  }
};

/**
 * Calculate linear regression
 */
export function calculateLinearRegression(data) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  data.forEach((point, i) => {
    const x = i;
    const y = point.value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  let ssTotal = 0, ssResidual = 0;

  data.forEach((point, i) => {
    const predicted = slope * i + intercept;
    ssTotal += Math.pow(point.value - meanY, 2);
    ssResidual += Math.pow(point.value - predicted, 2);
  });

  const rSquared = ssTotal !== 0 ? 1 - (ssResidual / ssTotal) : 0;

  return { slope, intercept, rSquared };
}

/**
 * Align two series by common periods
 */
export function alignSeries(series1, series2) {
  if (!series1 || !series2 || series1.length === 0 || series2.length === 0) {
    return { aligned1: [], aligned2: [], periods: [] };
  }

  const map1 = new Map(series1.map(p => [p.period, p.value]));
  const map2 = new Map(series2.map(p => [p.period, p.value]));

  const commonPeriods = [...map1.keys()].filter(p => map2.has(p));

  // Filter together to ensure paired values
  const aligned1 = [];
  const aligned2 = [];
  const validPeriods = [];

  commonPeriods.forEach(p => {
    const v1 = map1.get(p);
    const v2 = map2.get(p);
    // Only include if BOTH values are valid
    if (v1 !== null && v1 !== undefined && !isNaN(v1) &&
        v2 !== null && v2 !== undefined && !isNaN(v2)) {
      aligned1.push(v1);
      aligned2.push(v2);
      validPeriods.push(p);
    }
  });

  return { aligned1, aligned2, periods: validPeriods };
}

/**
 * Calculate Pearson correlation coefficient
 */
export function calculatePearsonCorrelation(series1, series2) {
  const { aligned1, aligned2 } = alignSeries(series1, series2);
  const n = Math.min(aligned1.length, aligned2.length);
  if (n < 3) return null;

  const x = aligned1.slice(0, n);
  const y = aligned2.slice(0, n);

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0, denomX = 0, denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom !== 0 ? numerator / denom : 0;
}

/**
 * Calculate Spearman rank correlation
 */
export function calculateSpearmanCorrelation(series1, series2) {
  const { aligned1, aligned2 } = alignSeries(series1, series2);
  const n = Math.min(aligned1.length, aligned2.length);
  if (n < 3) return null;

  const x = aligned1.slice(0, n);
  const y = aligned2.slice(0, n);

  // Calculate ranks
  const getRanks = (arr) => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    sorted.forEach((item, rank) => {
      ranks[item.i] = rank + 1;
    });
    return ranks;
  };

  const ranksX = getRanks(x);
  const ranksY = getRanks(y);

  // Calculate Spearman correlation on ranks
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksX[i] - ranksY[i];
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * Calculate Mutual Information
 */
export function calculateMutualInformation(series1, series2, numBins = 5) {
  const { aligned1, aligned2 } = alignSeries(series1, series2);
  const n = Math.min(aligned1.length, aligned2.length);
  if (n < 3) return null;

  const x = aligned1.slice(0, n);
  const y = aligned2.slice(0, n);

  // Discretize into bins
  const binData = (arr) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const range = max - min || 1;
    return arr.map(v => Math.min(numBins - 1, Math.floor((v - min) / range * numBins)));
  };

  const binsX = binData(x);
  const binsY = binData(y);

  // Calculate joint and marginal probabilities
  const jointCounts = {};
  const marginalX = {};
  const marginalY = {};

  for (let i = 0; i < n; i++) {
    const bx = binsX[i];
    const by = binsY[i];
    const key = `${bx},${by}`;

    jointCounts[key] = (jointCounts[key] || 0) + 1;
    marginalX[bx] = (marginalX[bx] || 0) + 1;
    marginalY[by] = (marginalY[by] || 0) + 1;
  }

  // Calculate mutual information
  let mi = 0;
  Object.entries(jointCounts).forEach(([key, count]) => {
    const [bx, by] = key.split(',').map(Number);
    const pxy = count / n;
    const px = marginalX[bx] / n;
    const py = marginalY[by] / n;

    if (pxy > 0 && px > 0 && py > 0) {
      mi += pxy * Math.log2(pxy / (px * py));
    }
  });

  return Math.max(0, mi);
}

/**
 * Calculate variance statistics
 */
export function calculateVarianceStats(data) {
  if (!data || data.length === 0) return null;

  const values = data.map(d => d.value).filter(v => v !== null && !isNaN(v));
  if (values.length < 2) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;

  return { mean, variance, stdDev, cv, min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Calculate Year-over-Year changes
 */
export function calculateYoYChanges(data) {
  return data.slice(0, -1).map((item, i) => {
    const prevValue = data[i + 1].value;
    const change = prevValue !== 0 ? ((item.value - prevValue) / Math.abs(prevValue)) * 100 : null;
    return { ...item, yoyChange: change };
  });
}

/**
 * Get correlation color based on value (Prism Design System)
 */
export function getCorrelationColor(corr, type = 'pearson') {
  if (corr === null || isNaN(corr)) return '#94A3B8';

  if (type === 'mutual_info') {
    // MI: 0 = no dependency, higher = stronger dependency
    if (corr >= 1.5) return '#059669';
    if (corr >= 1.0) return '#059669';
    if (corr >= 0.5) return '#D97706';
    if (corr >= 0.25) return '#D97706';
    return '#94A3B8';
  }

  // Pearson/Spearman: -1 to 1
  if (corr >= 0.7) return '#059669';
  if (corr >= 0.3) return '#059669';
  if (corr >= -0.3) return '#94A3B8';
  if (corr >= -0.7) return '#D97706';
  return '#DC2626';
}

/**
 * Format correlation value for display
 */
export function formatCorrelation(value, type) {
  if (value === null || isNaN(value)) return '-';
  if (type === 'mutual_info') return value.toFixed(2);
  return value.toFixed(2);
}
