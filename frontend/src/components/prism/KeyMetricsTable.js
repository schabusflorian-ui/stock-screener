// frontend/src/components/prism/KeyMetricsTable.js
// Key Financial Metrics Table - 4-year comparison view

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './KeyMetricsTable.css';

const METRICS_CONFIG = [
  { key: 'revenue', label: 'Revenue', format: 'currency', suffix: 'B' },
  { key: 'revenueGrowth', label: 'Revenue Growth', format: 'percent', highlight: true },
  { key: 'grossMargin', label: 'Gross Margin', format: 'percent' },
  { key: 'operatingMargin', label: 'Operating Margin', format: 'percent' },
  { key: 'netMargin', label: 'Net Margin', format: 'percent' },
  { key: 'roic', label: 'ROIC', format: 'percent', highlight: true },
  { key: 'roe', label: 'ROE', format: 'percent' },
  { key: 'fcfYield', label: 'FCF Yield', format: 'percent' },
  { key: 'debtToEquity', label: 'Debt/Equity', format: 'ratio' },
  { key: 'currentRatio', label: 'Current Ratio', format: 'ratio' }
];

export function KeyMetricsTable({ metrics, years = 4 }) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return null;
  }

  // Get available years from metrics data
  const availableYears = getAvailableYears(metrics, years);

  if (availableYears.length === 0) {
    return null;
  }

  return (
    <section className="key-metrics-section">
      <div className="section-header compact">
        <h3>Key Financial Metrics</h3>
        <span className="year-range">{availableYears.length}-Year View</span>
      </div>

      <div className="metrics-table-wrapper">
        <table className="metrics-table">
          <thead>
            <tr>
              <th className="metric-name-col">Metric</th>
              {availableYears.map((year, idx) => (
                <th key={year} className={idx === 0 ? 'current-year' : ''}>
                  {idx === 0 ? 'Current' : `${idx}Y Ago`}
                  <span className="year-label">{year}</span>
                </th>
              ))}
              <th className="trend-col">Trend</th>
            </tr>
          </thead>
          <tbody>
            {METRICS_CONFIG.map(config => {
              const values = availableYears.map(year => getMetricValue(metrics, config.key, year));
              const hasData = values.some(v => v !== null && v !== undefined);

              if (!hasData) return null;

              const trend = calculateTrend(values);

              return (
                <tr key={config.key} className={config.highlight ? 'highlight-row' : ''}>
                  <td className="metric-name">{config.label}</td>
                  {values.map((value, idx) => (
                    <td
                      key={idx}
                      className={`metric-value ${idx === 0 ? 'current' : ''} ${getValueClass(value, config)}`}
                    >
                      {formatValue(value, config)}
                    </td>
                  ))}
                  <td className="trend-cell">
                    <TrendIndicator trend={trend} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrendIndicator({ trend }) {
  if (trend === 'up') {
    return (
      <span className="trend-indicator positive">
        <TrendingUp size={14} />
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="trend-indicator negative">
        <TrendingDown size={14} />
      </span>
    );
  }
  return (
    <span className="trend-indicator neutral">
      <Minus size={14} />
    </span>
  );
}

function getAvailableYears(metrics, maxYears) {
  // Try to extract years from metrics structure
  // Expecting structure like: { 2024: {...}, 2023: {...}, ... }
  // or { current: {...}, prior: {...}, ... }

  const currentYear = new Date().getFullYear();
  const years = [];

  // Check for yearly data
  for (let i = 0; i < maxYears; i++) {
    const year = currentYear - i;
    if (metrics[year] || metrics[`FY${year}`]) {
      years.push(year);
    }
  }

  // If no yearly data, try fiscal year format
  if (years.length === 0) {
    for (let i = 0; i < maxYears; i++) {
      const year = currentYear - i;
      if (metrics[`FY${year.toString().slice(-2)}`]) {
        years.push(year);
      }
    }
  }

  // If still no data, try to infer from nested structure
  if (years.length === 0 && metrics.annual) {
    return getAvailableYears(metrics.annual, maxYears);
  }

  // Fallback: if metrics has direct values, assume current year only
  if (years.length === 0 && (metrics.revenue || metrics.revenueGrowth)) {
    years.push(currentYear);
  }

  return years.sort((a, b) => b - a); // Most recent first
}

function getMetricValue(metrics, key, year) {
  // Try direct year access
  if (metrics[year]?.[key] !== undefined) {
    return metrics[year][key];
  }

  // Try FY format
  if (metrics[`FY${year}`]?.[key] !== undefined) {
    return metrics[`FY${year}`][key];
  }

  // Try direct key access (for flat structure)
  if (year === new Date().getFullYear() && metrics[key] !== undefined) {
    return metrics[key];
  }

  return null;
}

function formatValue(value, config) {
  if (value === null || value === undefined) {
    return '—';
  }

  switch (config.format) {
    case 'currency':
      const billions = value / 1e9;
      if (billions >= 1) {
        return `$${billions.toFixed(1)}${config.suffix || ''}`;
      }
      const millions = value / 1e6;
      return `$${millions.toFixed(0)}M`;

    case 'percent':
      return `${(value * 100).toFixed(1)}%`;

    case 'ratio':
      return `${value.toFixed(2)}x`;

    default:
      return value.toFixed(2);
  }
}

function getValueClass(value, config) {
  if (value === null || value === undefined) return '';

  if (config.format === 'percent' && config.key !== 'debtToEquity') {
    if (value > 0.2) return 'value-positive';
    if (value < 0) return 'value-negative';
  }

  return '';
}

function calculateTrend(values) {
  const validValues = values.filter(v => v !== null && v !== undefined);
  if (validValues.length < 2) return 'neutral';

  const current = validValues[0];
  const previous = validValues[1];

  if (current > previous * 1.05) return 'up';
  if (current < previous * 0.95) return 'down';
  return 'neutral';
}

export default KeyMetricsTable;
