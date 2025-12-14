// frontend/src/components/MetricsBarChart.js
import './MetricsBarChart.css';

/**
 * Horizontal bar chart for comparing metrics across sectors/industries
 *
 * Props:
 * - data: array of { name, value, color? }
 * - metric: string (for label)
 * - format: 'percent' | 'ratio' | 'currency'
 * - maxValue: number (optional, auto-calculated if not provided)
 * - height: number (optional, per bar height)
 * - colorScale: 'gradient' | 'threshold' | 'single'
 * - thresholds: { good, bad } for threshold coloring
 */
function MetricsBarChart({
  data = [],
  metric = '',
  format = 'percent',
  maxValue = null,
  height = 24,
  colorScale = 'gradient',
  thresholds = null,
  onClick
}) {
  if (!data.length) return null;

  // Calculate max for scaling
  const values = data.map(d => d.value).filter(v => v != null);
  const calculatedMax = Math.max(...values, 0);
  const max = maxValue || calculatedMax || 100;

  // Format value
  const formatValue = (value) => {
    if (value == null) return '-';
    switch (format) {
      case 'percent': return `${value.toFixed(1)}%`;
      case 'ratio': return value.toFixed(2);
      case 'currency': return `$${value.toFixed(1)}B`;
      default: return value.toFixed(1);
    }
  };

  // Get bar color
  const getBarColor = (value, index) => {
    if (!value && value !== 0) return '#334155';

    if (colorScale === 'threshold' && thresholds) {
      if (value >= thresholds.good) return '#22c55e';
      if (value <= thresholds.bad) return '#ef4444';
      return '#f59e0b';
    }

    if (colorScale === 'single') {
      return '#8b5cf6';
    }

    // Gradient based on position
    const colors = [
      '#8b5cf6', '#a78bfa', '#7c3aed', '#6366f1',
      '#818cf8', '#60a5fa', '#3b82f6', '#2563eb'
    ];
    return colors[index % colors.length];
  };

  // Calculate bar width percentage
  const getBarWidth = (value) => {
    if (!value && value !== 0) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  };

  return (
    <div className="metrics-bar-chart">
      {metric && <div className="chart-label">{metric}</div>}
      <div className="bars-container">
        {data.map((item, idx) => (
          <div
            key={item.name || idx}
            className={`bar-row ${onClick ? 'clickable' : ''}`}
            onClick={() => onClick && onClick(item)}
          >
            <div className="bar-name" title={item.name}>
              {item.name}
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${getBarWidth(item.value)}%`,
                  height: `${height}px`,
                  backgroundColor: item.color || getBarColor(item.value, idx)
                }}
              />
              <span className="bar-value">{formatValue(item.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MetricsBarChart;
