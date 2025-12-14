import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { companyAPI } from '../services/api';
import { PeriodToggle } from '../components';
import './AdvancedChartsPage.css';

// Color palette for series
const SERIES_COLORS = [
  '#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#f97316', '#a855f7', '#14b8a6'
];

// Available metrics for charting
const CHART_METRICS = [
  { key: 'roic', label: 'ROIC', format: 'percent', category: 'Profitability' },
  { key: 'roe', label: 'ROE', format: 'percent', category: 'Profitability' },
  { key: 'roa', label: 'ROA', format: 'percent', category: 'Profitability' },
  { key: 'gross_margin', label: 'Gross Margin', format: 'percent', category: 'Margins' },
  { key: 'operating_margin', label: 'Operating Margin', format: 'percent', category: 'Margins' },
  { key: 'net_margin', label: 'Net Margin', format: 'percent', category: 'Margins' },
  { key: 'fcf_yield', label: 'FCF Yield', format: 'percent', category: 'Cash Flow' },
  { key: 'fcf_margin', label: 'FCF Margin', format: 'percent', category: 'Cash Flow' },
  { key: 'debt_to_equity', label: 'Debt/Equity', format: 'ratio', category: 'Leverage' },
  { key: 'current_ratio', label: 'Current Ratio', format: 'ratio', category: 'Liquidity' },
  { key: 'revenue_growth_yoy', label: 'Revenue Growth YoY', format: 'percent', category: 'Growth' },
  { key: 'earnings_growth_yoy', label: 'Earnings Growth YoY', format: 'percent', category: 'Growth' },
  { key: 'asset_turnover', label: 'Asset Turnover', format: 'ratio', category: 'Efficiency' },
];

// Normalization modes
const NORMALIZATION_MODES = [
  { value: 'absolute', label: 'Absolute Values', description: 'Show actual metric values' },
  { value: 'indexed', label: 'Indexed (Base 100)', description: 'All series start at 100 for easy comparison' },
  { value: 'percent_change', label: '% Change', description: 'Percentage change from starting point' },
  { value: 'yoy_change', label: 'YoY Change', description: 'Year-over-year change for each period' },
];

// Correlation types
const CORRELATION_TYPES = [
  { value: 'pearson', label: 'Pearson', description: 'Linear correlation (-1 to 1)' },
  { value: 'spearman', label: 'Spearman', description: 'Rank-based correlation (monotonic relationships)' },
  { value: 'mutual_info', label: 'Mutual Information', description: 'Non-linear dependency (0 to ∞)' },
];

// Time ranges
const TIME_RANGES = [
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
  { label: 'All', years: null },
];

// ============ STATISTICAL FUNCTIONS ============

// Linear regression helper
function calculateLinearRegression(data) {
  if (!data || data.length < 2) return null;

  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  data.forEach((point, i) => {
    sumX += i;
    sumY += point.value;
    sumXY += i * point.value;
    sumXX += i * i;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  data.forEach((point, i) => {
    const predicted = intercept + slope * i;
    ssRes += Math.pow(point.value - predicted, 2);
    ssTot += Math.pow(point.value - yMean, 2);
  });
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

  const trendLine = data.map((point, i) => ({
    time: point.time,
    value: intercept + slope * i
  }));

  const startValue = data[0].value;
  const endValue = data[data.length - 1].value;
  const years = data.length - 1;
  const cagr = startValue !== 0 && years > 0
    ? (Math.pow(endValue / startValue, 1 / years) - 1) * 100
    : 0;

  return { slope, intercept, rSquared, trendLine, cagr };
}

// Align two series by time
function alignSeries(series1, series2) {
  const timeMap = new Map();
  series1.forEach(p => timeMap.set(p.time, { v1: p.value }));
  series2.forEach(p => {
    if (timeMap.has(p.time)) {
      timeMap.get(p.time).v2 = p.value;
    }
  });
  return Array.from(timeMap.entries())
    .filter(([, p]) => p.v1 !== undefined && p.v2 !== undefined)
    .map(([time, p]) => ({ time, v1: p.v1, v2: p.v2 }));
}

// Pearson correlation
function calculatePearsonCorrelation(series1, series2) {
  const paired = alignSeries(series1, series2);
  if (paired.length < 3) return null;

  const n = paired.length;
  const mean1 = paired.reduce((s, p) => s + p.v1, 0) / n;
  const mean2 = paired.reduce((s, p) => s + p.v2, 0) / n;

  let numerator = 0, denom1 = 0, denom2 = 0;
  paired.forEach(p => {
    const d1 = p.v1 - mean1;
    const d2 = p.v2 - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  });

  const denominator = Math.sqrt(denom1 * denom2);
  return denominator === 0 ? 0 : numerator / denominator;
}

// Spearman rank correlation
function calculateSpearmanCorrelation(series1, series2) {
  const paired = alignSeries(series1, series2);
  if (paired.length < 3) return null;

  // Convert to ranks
  const getRanks = (arr, key) => {
    const sorted = [...arr].sort((a, b) => a[key] - b[key]);
    const ranks = new Map();
    sorted.forEach((item, i) => {
      ranks.set(arr.indexOf(item), i + 1);
    });
    // Handle ties with average rank
    const valueGroups = {};
    arr.forEach((item, i) => {
      const val = item[key];
      if (!valueGroups[val]) valueGroups[val] = [];
      valueGroups[val].push(i);
    });
    Object.values(valueGroups).forEach(indices => {
      if (indices.length > 1) {
        const avgRank = indices.reduce((s, i) => s + ranks.get(i), 0) / indices.length;
        indices.forEach(i => ranks.set(i, avgRank));
      }
    });
    return arr.map((_, i) => ranks.get(i));
  };

  const ranks1 = getRanks(paired, 'v1');
  const ranks2 = getRanks(paired, 'v2');

  // Calculate Pearson on ranks
  const n = paired.length;
  const mean1 = ranks1.reduce((s, r) => s + r, 0) / n;
  const mean2 = ranks2.reduce((s, r) => s + r, 0) / n;

  let numerator = 0, denom1 = 0, denom2 = 0;
  for (let i = 0; i < n; i++) {
    const d1 = ranks1[i] - mean1;
    const d2 = ranks2[i] - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  return denominator === 0 ? 0 : numerator / denominator;
}

// Mutual Information (discretized)
function calculateMutualInformation(series1, series2, numBins = 5) {
  const paired = alignSeries(series1, series2);
  if (paired.length < 10) return null; // Need more data for MI

  // Discretize values into bins
  const discretize = (values, bins) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map(v => Math.min(bins - 1, Math.floor((v - min) / range * bins)));
  };

  const v1s = paired.map(p => p.v1);
  const v2s = paired.map(p => p.v2);
  const bins1 = discretize(v1s, numBins);
  const bins2 = discretize(v2s, numBins);

  const n = paired.length;

  // Joint and marginal distributions
  const jointCounts = {};
  const marginal1 = {};
  const marginal2 = {};

  for (let i = 0; i < n; i++) {
    const key = `${bins1[i]},${bins2[i]}`;
    jointCounts[key] = (jointCounts[key] || 0) + 1;
    marginal1[bins1[i]] = (marginal1[bins1[i]] || 0) + 1;
    marginal2[bins2[i]] = (marginal2[bins2[i]] || 0) + 1;
  }

  // Calculate MI
  let mi = 0;
  Object.entries(jointCounts).forEach(([key, count]) => {
    const [b1, b2] = key.split(',').map(Number);
    const pxy = count / n;
    const px = marginal1[b1] / n;
    const py = marginal2[b2] / n;
    if (pxy > 0 && px > 0 && py > 0) {
      mi += pxy * Math.log2(pxy / (px * py));
    }
  });

  return Math.max(0, mi); // MI is always non-negative
}

// Calculate variance and standard deviation
function calculateVarianceStats(data) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const coeffVar = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0; // CV as percentage
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return { mean, variance, stdDev, coeffVar, min, max, range, n };
}

// Calculate YoY changes
function calculateYoYChanges(data) {
  if (!data || data.length < 2) return [];
  return data.slice(1).map((point, i) => {
    const prevValue = data[i].value;
    const change = prevValue !== 0 ? ((point.value - prevValue) / Math.abs(prevValue)) * 100 : 0;
    return { time: point.time, value: change };
  });
}

// Get color for correlation value
function getCorrelationColor(corr, type = 'pearson') {
  if (corr === null || corr === undefined) return '#64748b';

  if (type === 'mutual_info') {
    // MI scale: 0 = no dependency, higher = more dependency
    if (corr >= 1.5) return '#22c55e';
    if (corr >= 1.0) return '#84cc16';
    if (corr >= 0.5) return '#eab308';
    if (corr >= 0.2) return '#f59e0b';
    return '#94a3b8';
  }

  // Pearson/Spearman scale: -1 to 1
  if (corr > 0.7) return '#22c55e';
  if (corr > 0.3) return '#84cc16';
  if (corr > -0.3) return '#94a3b8';
  if (corr > -0.7) return '#f59e0b';
  return '#ef4444';
}

// Format correlation value
function formatCorrelation(value, type) {
  if (value === null || value === undefined) return '-';
  if (type === 'mutual_info') return value.toFixed(3);
  return value.toFixed(2);
}

// ============ COMPONENTS ============

// Correlation Heatmap Component
function CorrelationHeatmap({ matrix, labels, type, onCellClick }) {
  const cellSize = Math.min(60, 400 / labels.length);

  return (
    <div className="heatmap-container">
      <div className="heatmap" style={{ '--cell-size': `${cellSize}px` }}>
        {/* Column headers */}
        <div className="heatmap-row header-row">
          <div className="heatmap-cell corner"></div>
          {labels.map(label => (
            <div key={label} className="heatmap-cell header">{label}</div>
          ))}
        </div>

        {/* Data rows */}
        {labels.map((rowLabel, i) => (
          <div key={rowLabel} className="heatmap-row">
            <div className="heatmap-cell row-header">{rowLabel}</div>
            {labels.map((colLabel, j) => {
              const value = matrix[rowLabel]?.[colLabel];
              const color = getCorrelationColor(value, type);
              const isDiagonal = i === j;

              return (
                <div
                  key={colLabel}
                  className={`heatmap-cell data ${isDiagonal ? 'diagonal' : ''}`}
                  style={{
                    backgroundColor: isDiagonal ? '#1e293b' : `${color}30`,
                    color: isDiagonal ? '#64748b' : color,
                    cursor: !isDiagonal ? 'pointer' : 'default'
                  }}
                  onClick={() => !isDiagonal && onCellClick && onCellClick(rowLabel, colLabel)}
                  title={`${rowLabel} vs ${colLabel}: ${formatCorrelation(value, type)}`}
                >
                  {formatCorrelation(value, type)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Color scale legend */}
      <div className="heatmap-legend">
        {type === 'mutual_info' ? (
          <>
            <span className="legend-label">Low dependency</span>
            <div className="legend-scale mi-scale">
              <div style={{ background: '#94a3b8' }}></div>
              <div style={{ background: '#f59e0b' }}></div>
              <div style={{ background: '#eab308' }}></div>
              <div style={{ background: '#84cc16' }}></div>
              <div style={{ background: '#22c55e' }}></div>
            </div>
            <span className="legend-label">High dependency</span>
          </>
        ) : (
          <>
            <span className="legend-label">-1</span>
            <div className="legend-scale">
              <div style={{ background: '#ef4444' }}></div>
              <div style={{ background: '#f59e0b' }}></div>
              <div style={{ background: '#94a3b8' }}></div>
              <div style={{ background: '#84cc16' }}></div>
              <div style={{ background: '#22c55e' }}></div>
            </div>
            <span className="legend-label">+1</span>
          </>
        )}
      </div>
    </div>
  );
}

// Scatter Plot Component
function ScatterPlot({ data, xLabel, yLabel, companies, colors }) {
  if (!data || data.length === 0) {
    return <div className="empty-scatter">No data available for scatter plot</div>;
  }

  // Calculate regression line
  const xValues = data.map(d => d.x);
  const yValues = data.map(d => d.y);
  const n = data.length;
  const xMean = xValues.reduce((s, v) => s + v, 0) / n;
  const yMean = yValues.reduce((s, v) => s + v, 0) / n;

  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
    denominator += Math.pow(xValues[i] - xMean, 2);
  }
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const regressionLine = [
    { x: xMin, y: intercept + slope * xMin },
    { x: xMax, y: intercept + slope * xMax }
  ];

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="x"
          type="number"
          name={xLabel}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          label={{ value: xLabel, position: 'bottom', fill: '#94a3b8', fontSize: 12 }}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={yLabel}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          label={{ value: yLabel, angle: -90, position: 'left', fill: '#94a3b8', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem' }}
          formatter={(value, name) => [value?.toFixed(2), name]}
          labelFormatter={(_, payload) => payload[0]?.payload?.label || ''}
        />
        <ReferenceLine
          segment={regressionLine}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
        <Scatter data={data} fill="#8b5cf6">
          {data.map((entry, index) => {
            const companyIdx = companies.indexOf(entry.symbol);
            return (
              <Cell
                key={index}
                fill={colors[companyIdx % colors.length] || '#8b5cf6'}
              />
            );
          })}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Variance Cards Component
function VarianceAnalysis({ companies, varianceData, metricLabel, colors }) {
  const maxCoeffVar = Math.max(...Object.values(varianceData).map(v => v?.coeffVar || 0));

  return (
    <div className="variance-grid">
      {companies.map((symbol, idx) => {
        const stats = varianceData[symbol];
        if (!stats) return null;

        const volatilityLevel = stats.coeffVar > 50 ? 'high' : stats.coeffVar > 25 ? 'medium' : 'low';

        return (
          <div
            key={symbol}
            className="variance-card"
            style={{ '--card-color': colors[idx % colors.length] }}
          >
            <div className="variance-header">
              <span className="variance-symbol">{symbol}</span>
              <span className={`volatility-badge ${volatilityLevel}`}>
                {volatilityLevel === 'high' ? 'High Vol' : volatilityLevel === 'medium' ? 'Med Vol' : 'Low Vol'}
              </span>
            </div>

            <div className="variance-stats">
              <div className="variance-stat">
                <span className="stat-label">Mean</span>
                <span className="stat-value">{stats.mean.toFixed(2)}</span>
              </div>
              <div className="variance-stat">
                <span className="stat-label">Std Dev</span>
                <span className="stat-value">{stats.stdDev.toFixed(2)}</span>
              </div>
              <div className="variance-stat">
                <span className="stat-label">Variance</span>
                <span className="stat-value">{stats.variance.toFixed(2)}</span>
              </div>
              <div className="variance-stat highlight">
                <span className="stat-label">Coeff. of Var.</span>
                <span className="stat-value">{stats.coeffVar.toFixed(1)}%</span>
              </div>
              <div className="variance-stat">
                <span className="stat-label">Range</span>
                <span className="stat-value">{stats.min.toFixed(1)} → {stats.max.toFixed(1)}</span>
              </div>
              <div className="variance-stat">
                <span className="stat-label">Observations</span>
                <span className="stat-value">{stats.n}</span>
              </div>
            </div>

            {/* Visual bar for relative volatility */}
            <div className="volatility-bar-container">
              <div
                className="volatility-bar"
                style={{
                  width: `${maxCoeffVar > 0 ? (stats.coeffVar / maxCoeffVar) * 100 : 0}%`,
                  backgroundColor: colors[idx % colors.length]
                }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ MAIN COMPONENT ============

function AdvancedChartsPage() {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [companyData, setCompanyData] = useState({});
  const [selectedMetric, setSelectedMetric] = useState('roic');
  const [secondaryMetric, setSecondaryMetric] = useState('');
  const [periodType, setPeriodType] = useState('annual');
  const [normalization, setNormalization] = useState('absolute');
  const [timeRange, setTimeRange] = useState('All');
  const [showTrendLines, setShowTrendLines] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overlay');
  const [correlationType, setCorrelationType] = useState('pearson');
  const [selectedScatterPair, setSelectedScatterPair] = useState(null);

  // Chart refs
  const mainChartRef = useRef(null);
  const mainChartContainerRef = useRef(null);
  const seriesRefs = useRef([]);
  const trendSeriesRefs = useRef([]);

  // Load companies for search
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const response = await companyAPI.getAll();
        setAllCompanies(response.data.companies || []);
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
  }, []);

  // Search companies
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const query = searchQuery.toUpperCase();
    const results = allCompanies
      .filter(c =>
        c.symbol.toUpperCase().includes(query) ||
        c.name?.toUpperCase().includes(query)
      )
      .filter(c => !selectedCompanies.includes(c.symbol))
      .slice(0, 8);
    setSearchResults(results);
  }, [searchQuery, allCompanies, selectedCompanies]);

  // Load company metrics
  const loadCompanyMetrics = useCallback(async (symbol) => {
    try {
      const metricsRes = await companyAPI.getMetrics(symbol, { limit: 20, periodType });
      return metricsRes.data.metrics;
    } catch (error) {
      console.error(`Error loading metrics for ${symbol}:`, error);
      return [];
    }
  }, [periodType]);

  // Add company
  const addCompany = async (symbol) => {
    if (selectedCompanies.length >= 10) {
      alert('Maximum 10 companies can be compared');
      return;
    }
    if (selectedCompanies.includes(symbol)) return;

    setLoading(true);
    setSelectedCompanies(prev => [...prev, symbol]);
    setSearchQuery('');
    setSearchResults([]);

    const metrics = await loadCompanyMetrics(symbol);
    setCompanyData(prev => ({ ...prev, [symbol]: metrics }));
    setLoading(false);
  };

  // Remove company
  const removeCompany = (symbol) => {
    setSelectedCompanies(prev => prev.filter(s => s !== symbol));
    setCompanyData(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });
    if (selectedScatterPair?.includes(symbol)) {
      setSelectedScatterPair(null);
    }
  };

  // Reload data when period changes
  useEffect(() => {
    const reloadAll = async () => {
      if (selectedCompanies.length === 0) return;
      setLoading(true);
      const newData = {};
      for (const symbol of selectedCompanies) {
        newData[symbol] = await loadCompanyMetrics(symbol);
      }
      setCompanyData(newData);
      setLoading(false);
    };
    reloadAll();
  }, [periodType, selectedCompanies, loadCompanyMetrics]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const result = {};
    const range = TIME_RANGES.find(r => r.label === timeRange);
    const cutoffDate = range?.years
      ? new Date(new Date().setFullYear(new Date().getFullYear() - range.years)).toISOString().split('T')[0]
      : null;

    selectedCompanies.forEach(symbol => {
      const metrics = companyData[symbol] || [];
      let data = metrics
        .filter(m => m[selectedMetric] !== null && m[selectedMetric] !== undefined)
        .map(m => ({ time: m.fiscal_period, value: m[selectedMetric] }))
        .filter(d => !cutoffDate || d.time >= cutoffDate)
        .sort((a, b) => a.time.localeCompare(b.time));

      if (data.length === 0) {
        result[symbol] = { data: [], normalized: [], trendLine: null, stats: null, variance: null };
        return;
      }

      // Apply normalization
      let normalized = data;
      if (normalization === 'indexed' && data.length > 0) {
        const baseValue = data[0].value;
        normalized = baseValue !== 0
          ? data.map(d => ({ time: d.time, value: (d.value / baseValue) * 100 }))
          : data;
      } else if (normalization === 'percent_change' && data.length > 0) {
        const baseValue = data[0].value;
        normalized = baseValue !== 0
          ? data.map(d => ({ time: d.time, value: ((d.value - baseValue) / Math.abs(baseValue)) * 100 }))
          : data;
      } else if (normalization === 'yoy_change') {
        normalized = calculateYoYChanges(data);
      }

      const regression = calculateLinearRegression(data);
      const variance = calculateVarianceStats(data);

      result[symbol] = {
        data,
        normalized,
        trendLine: regression?.trendLine,
        stats: regression ? {
          rSquared: regression.rSquared,
          cagr: regression.cagr,
          slope: regression.slope
        } : null,
        variance
      };
    });

    return result;
  }, [selectedCompanies, companyData, selectedMetric, normalization, timeRange]);

  // Secondary metric data
  const secondaryData = useMemo(() => {
    if (!secondaryMetric) return {};

    const result = {};
    selectedCompanies.forEach(symbol => {
      const metrics = companyData[symbol] || [];
      const data = metrics
        .filter(m => m[secondaryMetric] !== null && m[secondaryMetric] !== undefined)
        .map(m => ({ time: m.fiscal_period, value: m[secondaryMetric] }))
        .sort((a, b) => a.time.localeCompare(b.time));
      result[symbol] = data;
    });
    return result;
  }, [selectedCompanies, companyData, secondaryMetric]);

  // Correlation matrix (for selected correlation type)
  const correlationMatrix = useMemo(() => {
    if (activeTab !== 'correlation' || selectedCompanies.length < 2) return null;

    const calcFunc = correlationType === 'pearson' ? calculatePearsonCorrelation :
                     correlationType === 'spearman' ? calculateSpearmanCorrelation :
                     calculateMutualInformation;

    const matrix = {};
    selectedCompanies.forEach(s1 => {
      matrix[s1] = {};
      selectedCompanies.forEach(s2 => {
        if (s1 === s2) {
          matrix[s1][s2] = correlationType === 'mutual_info' ? null : 1;
        } else {
          const data1 = chartData[s1]?.data || [];
          const data2 = chartData[s2]?.data || [];
          matrix[s1][s2] = calcFunc(data1, data2);
        }
      });
    });
    return matrix;
  }, [activeTab, selectedCompanies, chartData, correlationType]);

  // Metric correlation matrix (all metrics for first company)
  const metricCorrelationMatrix = useMemo(() => {
    if (activeTab !== 'correlation' || selectedCompanies.length === 0) return null;

    const symbol = selectedCompanies[0];
    const metrics = companyData[symbol] || [];
    if (metrics.length < 3) return null;

    const calcFunc = correlationType === 'pearson' ? calculatePearsonCorrelation :
                     correlationType === 'spearman' ? calculateSpearmanCorrelation :
                     calculateMutualInformation;

    const metricsToUse = CHART_METRICS.slice(0, 8); // Limit to 8 for readability
    const matrix = {};

    metricsToUse.forEach(metric1 => {
      const label1 = metric1.label;
      const key1 = metric1.key;
      matrix[label1] = {};

      const data1 = metrics
        .filter(m => m[key1] !== null && m[key1] !== undefined)
        .map(m => ({ time: m.fiscal_period, value: m[key1] }));

      metricsToUse.forEach(metric2 => {
        const label2 = metric2.label;
        const key2 = metric2.key;

        if (key1 === key2) {
          matrix[label1][label2] = correlationType === 'mutual_info' ? null : 1;
        } else {
          const data2 = metrics
            .filter(m => m[key2] !== null && m[key2] !== undefined)
            .map(m => ({ time: m.fiscal_period, value: m[key2] }));
          matrix[label1][label2] = calcFunc(data1, data2);
        }
      });
    });

    return matrix;
  }, [activeTab, selectedCompanies, companyData, correlationType]);

  // Scatter plot data
  const scatterData = useMemo(() => {
    if (!selectedScatterPair || selectedScatterPair.length !== 2) return null;

    const [s1, s2] = selectedScatterPair;
    const data1 = chartData[s1]?.data || [];
    const data2 = chartData[s2]?.data || [];
    const aligned = alignSeries(data1, data2);

    return aligned.map(p => ({
      x: p.v1,
      y: p.v2,
      symbol: `${s1}/${s2}`,
      label: p.time,
      time: p.time
    }));
  }, [selectedScatterPair, chartData]);

  // Metric scatter data (primary vs secondary for all companies)
  const metricScatterData = useMemo(() => {
    if (!secondaryMetric) return null;

    const points = [];
    selectedCompanies.forEach(symbol => {
      const primary = chartData[symbol]?.data || [];
      const secondary = secondaryData[symbol] || [];
      const aligned = alignSeries(primary, secondary);

      aligned.forEach(p => {
        points.push({
          x: p.v1,
          y: p.v2,
          symbol,
          label: `${symbol} (${p.time})`
        });
      });
    });

    return points;
  }, [selectedCompanies, chartData, secondaryData, secondaryMetric]);

  // Variance data for all companies
  const varianceData = useMemo(() => {
    const result = {};
    selectedCompanies.forEach(symbol => {
      result[symbol] = chartData[symbol]?.variance;
    });
    return result;
  }, [selectedCompanies, chartData]);

  // Initialize/update main chart
  useEffect(() => {
    if (!mainChartContainerRef.current || activeTab === 'correlation') return;

    if (mainChartRef.current) {
      try { mainChartRef.current.remove(); } catch (e) {}
    }
    seriesRefs.current = [];
    trendSeriesRefs.current = [];

    const chart = createChart(mainChartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
        fontFamily: "'Inter', sans-serif",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: '#64748b', style: 2, labelBackgroundColor: '#475569' },
        horzLine: { color: '#64748b', style: 2, labelBackgroundColor: '#475569' }
      },
      rightPriceScale: { borderColor: '#334155', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#334155', timeVisible: true, rightOffset: 5 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: mainChartContainerRef.current.clientWidth,
      height: 450
    });

    mainChartRef.current = chart;

    selectedCompanies.forEach((symbol, idx) => {
      const data = chartData[symbol]?.normalized || [];
      if (data.length === 0) return;

      const color = SERIES_COLORS[idx % SERIES_COLORS.length];

      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: (v) => {
            if (normalization === 'indexed') return v.toFixed(1);
            if (normalization === 'percent_change' || normalization === 'yoy_change') return `${v.toFixed(1)}%`;
            const metric = CHART_METRICS.find(m => m.key === selectedMetric);
            return metric?.format === 'percent' ? `${v.toFixed(1)}%` : v.toFixed(2);
          }
        },
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5
      });
      series.setData(data);
      seriesRefs.current.push({ symbol, series });

      if (showTrendLines && chartData[symbol]?.trendLine) {
        let trendData = chartData[symbol].trendLine;
        if (normalization === 'indexed' && chartData[symbol].data.length > 0) {
          const baseValue = chartData[symbol].data[0].value;
          trendData = baseValue !== 0
            ? trendData.map(d => ({ time: d.time, value: (d.value / baseValue) * 100 }))
            : trendData;
        } else if (normalization === 'percent_change' && chartData[symbol].data.length > 0) {
          const baseValue = chartData[symbol].data[0].value;
          trendData = baseValue !== 0
            ? trendData.map(d => ({ time: d.time, value: ((d.value - baseValue) / Math.abs(baseValue)) * 100 }))
            : trendData;
        }

        const trendSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: 2,
          crosshairMarkerVisible: false
        });
        trendSeries.setData(trendData);
        trendSeriesRefs.current.push({ symbol, series: trendSeries });
      }
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (mainChartContainerRef.current && mainChartRef.current) {
        mainChartRef.current.applyOptions({ width: mainChartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch (e) {}
    };
  }, [selectedCompanies, chartData, normalization, showTrendLines, selectedMetric, activeTab]);

  const metricInfo = CHART_METRICS.find(m => m.key === selectedMetric);
  const secondaryMetricInfo = CHART_METRICS.find(m => m.key === secondaryMetric);

  return (
    <div className="advanced-charts-page">
      <div className="page-header">
        <div>
          <h1>Advanced Charts</h1>
          <p>Multi-company overlays, correlation analysis, and variance metrics</p>
        </div>
      </div>

      {/* Company Search */}
      <div className="company-search">
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Add company (up to 10)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map(c => (
                <div key={c.symbol} className="search-result" onClick={() => addCompany(c.symbol)}>
                  <span className="symbol">{c.symbol}</span>
                  <span className="name">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="selected-companies">
          {selectedCompanies.map((symbol, idx) => (
            <div
              key={symbol}
              className="company-tag"
              style={{ '--tag-color': SERIES_COLORS[idx % SERIES_COLORS.length] }}
            >
              <span className="tag-dot"></span>
              <span className="tag-symbol">{symbol}</span>
              <button className="tag-remove" onClick={() => removeCompany(symbol)}>×</button>
            </div>
          ))}
        </div>
      </div>

      {selectedCompanies.length > 0 && (
        <>
          {/* Tab Navigation */}
          <div className="chart-tabs">
            <button className={activeTab === 'overlay' ? 'active' : ''} onClick={() => setActiveTab('overlay')}>
              Overlay Chart
            </button>
            <button className={activeTab === 'yoy' ? 'active' : ''} onClick={() => setActiveTab('yoy')}>
              YoY Analysis
            </button>
            <button className={activeTab === 'correlation' ? 'active' : ''} onClick={() => setActiveTab('correlation')}>
              Correlation
            </button>
            <button className={activeTab === 'variance' ? 'active' : ''} onClick={() => setActiveTab('variance')}>
              Variance
            </button>
          </div>

          {/* Controls */}
          <div className="chart-controls">
            <div className="control-group">
              <label>Metric</label>
              <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
                {Object.entries(
                  CHART_METRICS.reduce((acc, m) => {
                    if (!acc[m.category]) acc[m.category] = [];
                    acc[m.category].push(m);
                    return acc;
                  }, {})
                ).map(([category, metrics]) => (
                  <optgroup key={category} label={category}>
                    {metrics.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {activeTab === 'correlation' && (
              <>
                <div className="control-group">
                  <label>Correlation Type</label>
                  <select value={correlationType} onChange={(e) => setCorrelationType(e.target.value)}>
                    {CORRELATION_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="control-group">
                  <label>Compare Metric</label>
                  <select value={secondaryMetric} onChange={(e) => setSecondaryMetric(e.target.value)}>
                    <option value="">Select for scatter...</option>
                    {CHART_METRICS.filter(m => m.key !== selectedMetric).map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(activeTab === 'overlay' || activeTab === 'yoy') && (
              <div className="control-group">
                <label>Normalization</label>
                <select value={normalization} onChange={(e) => setNormalization(e.target.value)}>
                  {NORMALIZATION_MODES.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="control-group">
              <label>Period</label>
              <PeriodToggle
                value={periodType}
                onChange={setPeriodType}
                availablePeriods={[
                  { period_type: 'annual', count: 1 },
                  { period_type: 'quarterly', count: 1 }
                ]}
              />
            </div>

            <div className="control-group time-range">
              <label>Time Range</label>
              <div className="range-buttons">
                {TIME_RANGES.map(range => (
                  <button
                    key={range.label}
                    className={timeRange === range.label ? 'active' : ''}
                    onClick={() => setTimeRange(range.label)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {(activeTab === 'overlay' || activeTab === 'yoy') && (
              <div className="control-group">
                <label>Options</label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showTrendLines}
                    onChange={(e) => setShowTrendLines(e.target.checked)}
                  />
                  Show Trend Lines
                </label>
              </div>
            )}
          </div>

          {loading ? (
            <div className="loading">Loading chart data...</div>
          ) : (
            <>
              {/* Overlay/YoY Chart */}
              {(activeTab === 'overlay' || activeTab === 'yoy') && (
                <div className="main-chart-section">
                  <div className="chart-header">
                    <h3>
                      {metricInfo?.label || selectedMetric}
                      {normalization !== 'absolute' && ` (${NORMALIZATION_MODES.find(m => m.value === normalization)?.label})`}
                    </h3>
                    <span className="chart-subtitle">
                      {NORMALIZATION_MODES.find(m => m.value === normalization)?.description}
                    </span>
                  </div>

                  <div className="chart-legend">
                    {selectedCompanies.map((symbol, idx) => {
                      const stats = chartData[symbol]?.stats;
                      return (
                        <div key={symbol} className="legend-item">
                          <span className="legend-color" style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}></span>
                          <span className="legend-symbol">{symbol}</span>
                          {stats && showTrendLines && (
                            <span className="legend-stats">
                              <span title="CAGR">CAGR: {stats.cagr >= 0 ? '+' : ''}{stats.cagr.toFixed(1)}%</span>
                              <span title="R²">R²: {stats.rSquared.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div ref={mainChartContainerRef} className="chart-canvas"></div>
                  <div className="chart-instructions">Scroll to zoom • Drag to pan</div>
                </div>
              )}

              {/* Correlation Tab */}
              {activeTab === 'correlation' && (
                <div className="correlation-section">
                  {/* Correlation Type Info */}
                  <div className="correlation-info">
                    <strong>{CORRELATION_TYPES.find(t => t.value === correlationType)?.label}:</strong>{' '}
                    {CORRELATION_TYPES.find(t => t.value === correlationType)?.description}
                  </div>

                  {/* Company Correlation Heatmap */}
                  <div className="correlation-card">
                    <h3>Company Correlation Heatmap ({metricInfo?.label})</h3>
                    <p className="card-description">
                      Click a cell to view scatter plot for that pair
                    </p>

                    {correlationMatrix && selectedCompanies.length >= 2 ? (
                      <CorrelationHeatmap
                        matrix={correlationMatrix}
                        labels={selectedCompanies}
                        type={correlationType}
                        onCellClick={(s1, s2) => setSelectedScatterPair([s1, s2])}
                      />
                    ) : (
                      <p className="empty-message">Add at least 2 companies to see correlations</p>
                    )}
                  </div>

                  {/* Scatter Plot for Selected Pair */}
                  {selectedScatterPair && scatterData && (
                    <div className="correlation-card">
                      <div className="card-header-row">
                        <h3>Scatter Plot: {selectedScatterPair[0]} vs {selectedScatterPair[1]}</h3>
                        <button className="close-btn" onClick={() => setSelectedScatterPair(null)}>×</button>
                      </div>
                      <p className="card-description">
                        Each point represents the same time period for both companies
                      </p>
                      <ScatterPlot
                        data={scatterData}
                        xLabel={`${selectedScatterPair[0]} ${metricInfo?.label}`}
                        yLabel={`${selectedScatterPair[1]} ${metricInfo?.label}`}
                        companies={selectedCompanies}
                        colors={SERIES_COLORS}
                      />
                    </div>
                  )}

                  {/* Metric Correlation Heatmap (for first company) */}
                  {metricCorrelationMatrix && (
                    <div className="correlation-card">
                      <h3>Metric Correlation Heatmap ({selectedCompanies[0]})</h3>
                      <p className="card-description">
                        How different metrics correlate within {selectedCompanies[0]}
                      </p>
                      <CorrelationHeatmap
                        matrix={metricCorrelationMatrix}
                        labels={CHART_METRICS.slice(0, 8).map(m => m.label)}
                        type={correlationType}
                      />
                    </div>
                  )}

                  {/* Metric Scatter Plot */}
                  {secondaryMetric && metricScatterData && (
                    <div className="correlation-card">
                      <h3>Metric Scatter: {metricInfo?.label} vs {secondaryMetricInfo?.label}</h3>
                      <p className="card-description">
                        All companies plotted together, color-coded
                      </p>
                      <ScatterPlot
                        data={metricScatterData}
                        xLabel={metricInfo?.label}
                        yLabel={secondaryMetricInfo?.label}
                        companies={selectedCompanies}
                        colors={SERIES_COLORS}
                      />

                      {/* Per-company correlation values */}
                      <div className="metric-corr-summary">
                        {selectedCompanies.map((symbol, idx) => {
                          const primary = chartData[symbol]?.data || [];
                          const secondary = secondaryData[symbol] || [];
                          const calcFunc = correlationType === 'pearson' ? calculatePearsonCorrelation :
                                          correlationType === 'spearman' ? calculateSpearmanCorrelation :
                                          calculateMutualInformation;
                          const corr = calcFunc(primary, secondary);
                          const color = getCorrelationColor(corr, correlationType);

                          return (
                            <div key={symbol} className="corr-summary-item">
                              <span className="corr-dot" style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}></span>
                              <span className="corr-symbol">{symbol}</span>
                              <span className="corr-value" style={{ color }}>{formatCorrelation(corr, correlationType)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Variance Tab */}
              {activeTab === 'variance' && (
                <div className="variance-section">
                  <div className="section-header">
                    <h3>Variance Analysis: {metricInfo?.label}</h3>
                    <p className="section-description">
                      Coefficient of Variation (CV) = Standard Deviation / Mean. Higher CV indicates more volatility relative to the average.
                    </p>
                  </div>

                  <VarianceAnalysis
                    companies={selectedCompanies}
                    varianceData={varianceData}
                    metricLabel={metricInfo?.label}
                    colors={SERIES_COLORS}
                  />

                  {/* Variance Comparison Bar Chart */}
                  <div className="variance-comparison">
                    <h4>Relative Volatility Comparison</h4>
                    <div className="variance-bars">
                      {selectedCompanies
                        .map((symbol, idx) => ({
                          symbol,
                          idx,
                          cv: varianceData[symbol]?.coeffVar || 0
                        }))
                        .sort((a, b) => b.cv - a.cv)
                        .map(({ symbol, idx, cv }) => (
                          <div key={symbol} className="variance-bar-row">
                            <span className="bar-label">{symbol}</span>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${Math.min(100, cv)}%`,
                                  backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length]
                                }}
                              ></div>
                            </div>
                            <span className="bar-value">{cv.toFixed(1)}%</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Summary */}
              {showTrendLines && (activeTab === 'overlay' || activeTab === 'yoy') && (
                <div className="stats-summary">
                  <h3>Trend Analysis Summary</h3>
                  <div className="stats-grid">
                    {selectedCompanies.map((symbol, idx) => {
                      const stats = chartData[symbol]?.stats;
                      const latestData = chartData[symbol]?.data;
                      const latestValue = latestData?.[latestData.length - 1]?.value;
                      const firstValue = latestData?.[0]?.value;

                      return (
                        <div
                          key={symbol}
                          className="stats-card"
                          style={{ '--card-color': SERIES_COLORS[idx % SERIES_COLORS.length] }}
                        >
                          <div className="stats-header">
                            <span className="stats-symbol">{symbol}</span>
                          </div>
                          <div className="stats-body">
                            <div className="stat-item">
                              <span className="stat-label">Latest</span>
                              <span className="stat-value">
                                {latestValue !== undefined
                                  ? metricInfo?.format === 'percent' ? `${latestValue.toFixed(1)}%` : latestValue.toFixed(2)
                                  : '-'}
                              </span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Start</span>
                              <span className="stat-value">
                                {firstValue !== undefined
                                  ? metricInfo?.format === 'percent' ? `${firstValue.toFixed(1)}%` : firstValue.toFixed(2)
                                  : '-'}
                              </span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">CAGR</span>
                              <span className={`stat-value ${stats?.cagr >= 0 ? 'positive' : 'negative'}`}>
                                {stats ? `${stats.cagr >= 0 ? '+' : ''}${stats.cagr.toFixed(1)}%` : '-'}
                              </span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">R²</span>
                              <span className="stat-value">{stats ? stats.rSquared.toFixed(3) : '-'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {selectedCompanies.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📈</div>
          <h3>Advanced Charting Workspace</h3>
          <p>Search and add companies above to start analyzing</p>

          <div className="features-grid">
            <div className="feature">
              <span className="feature-icon">🔀</span>
              <h4>Multi-Company Overlay</h4>
              <p>Compare up to 10 companies on the same chart</p>
            </div>
            <div className="feature">
              <span className="feature-icon">🗺️</span>
              <h4>Correlation Heatmap</h4>
              <p>Pearson, Spearman, and Mutual Information</p>
            </div>
            <div className="feature">
              <span className="feature-icon">📊</span>
              <h4>Scatter Plots</h4>
              <p>Visualize metric relationships with regression lines</p>
            </div>
            <div className="feature">
              <span className="feature-icon">📉</span>
              <h4>Variance Analysis</h4>
              <p>Compare volatility with coefficient of variation</p>
            </div>
          </div>

          <div className="quick-start">
            <span>Quick start:</span>
            <div className="quick-buttons">
              <button onClick={() => { addCompany('AAPL'); addCompany('MSFT'); addCompany('GOOGL'); }}>
                Tech Giants
              </button>
              <button onClick={() => { addCompany('JPM'); addCompany('BAC'); addCompany('WFC'); }}>
                Big Banks
              </button>
              <button onClick={() => { addCompany('JNJ'); addCompany('PFE'); addCompany('UNH'); }}>
                Healthcare
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdvancedChartsPage;
