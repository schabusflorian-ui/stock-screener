import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import './MultiMetricChart.css';

// Import formatMetricValue from unified config
import { formatMetricValue as formatFromConfig, METRICS } from '../config/metrics';

// Default colors for metrics
const DEFAULT_COLORS = [
  '#8b5cf6', // Purple (ROIC)
  '#3b82f6', // Blue (ROE)
  '#22c55e', // Green (Net Margin)
  '#f59e0b', // Amber (FCF Yield)
  '#ef4444', // Red (Debt/Equity)
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#a855f7', // Violet
  '#14b8a6'  // Teal
];

const TIME_RANGES = [
  { label: '3Y', periods: 3 },
  { label: '5Y', periods: 5 },
  { label: '10Y', periods: 10 },
  { label: 'All', periods: null }
];

const CHART_MODES = [
  { value: 'absolute', label: 'Absolute values (dual axis)', icon: '📊' },
  { value: 'normalized', label: 'Normalized (% change)', icon: '📈' }
];

// Determine if a metric is "large scale" (billions) vs "small scale" (percentages, ratios, prices)
const isLargeScaleMetric = (metricKey, format) => {
  // Currency metrics that are typically in billions
  if (format === 'currency' || format === 'currency_large') {
    // These are absolute financial values (revenue, net income, FCF, etc.)
    return true;
  }
  return false;
};

// Format large numbers with units for Y-axis
const formatAxisValue = (value, format, isLargeScale) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'ratio') return value.toFixed(2) + 'x';

  if (format === 'currency' || format === 'currency_large') {
    const absVal = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absVal >= 1e12) return `${sign}$${(absVal / 1e12).toFixed(1)}T`;
    if (absVal >= 1e9) return `${sign}$${(absVal / 1e9).toFixed(0)}B`;
    if (absVal >= 1e6) return `${sign}$${(absVal / 1e6).toFixed(0)}M`;
    if (absVal >= 1e3) return `${sign}$${(absVal / 1e3).toFixed(0)}K`;
    return `${sign}$${absVal.toFixed(0)}`;
  }

  if (format === 'currency_price') {
    return `$${value.toFixed(0)}`;
  }

  return value.toFixed(1);
};

// Format for legend display (more precision)
const formatLegendValue = (value, metricKey) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  // Use the unified config formatter
  if (metricKey && METRICS[metricKey]) {
    return formatFromConfig(value, metricKey);
  }

  // Fallback
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absVal >= 1e12) return `${sign}$${(absVal / 1e12).toFixed(1)}T`;
  if (absVal >= 1e9) return `${sign}$${(absVal / 1e9).toFixed(1)}B`;
  if (absVal >= 1e6) return `${sign}$${(absVal / 1e6).toFixed(1)}M`;
  if (absVal >= 1e3) return `${sign}$${(absVal / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
};

function MultiMetricChart({
  data = [], // Array of { time, metric1, metric2, ... }
  metrics = [], // Array of { key, label, color, format }
  height = 400,
  title = 'Historical Performance',
  periodType = 'annual',
  hideTimeRange = false // Hide internal time range selector (useful when parent controls period)
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef({});

  const [selectedTimeRange, setSelectedTimeRange] = useState('All');
  const [chartMode, setChartMode] = useState('absolute'); // Default to 'absolute'
  const [visibleMetrics, setVisibleMetrics] = useState(() =>
    metrics.reduce((acc, m) => ({ ...acc, [m.key]: true }), {})
  );
  const [hoveredData, setHoveredData] = useState(null);

  // Filter data by time range (for annual/quarterly periods)
  const filteredData = useMemo(() => {
    if (!data.length) return [];

    const timeRange = TIME_RANGES.find(t => t.label === selectedTimeRange);
    if (!timeRange?.periods) return data;

    const periodsToShow = periodType === 'quarterly'
      ? timeRange.periods * 4
      : timeRange.periods;

    return data.slice(-periodsToShow);
  }, [data, selectedTimeRange, periodType]);

  // Calculate base values for normalization (first non-null value for each metric)
  const baseValues = useMemo(() => {
    const bases = {};
    metrics.forEach(metric => {
      for (const d of filteredData) {
        const val = d[metric.key];
        if (val !== null && val !== undefined && !isNaN(val) && val !== 0) {
          bases[metric.key] = val;
          break;
        }
      }
    });
    return bases;
  }, [filteredData, metrics]);

  // Categorize metrics into large-scale (left axis) and small-scale (right axis)
  // eslint-disable-next-line no-unused-vars
  const { largeScaleMetrics, smallScaleMetrics, rightAxisAllPercent } = useMemo(() => {
    const large = [];
    const small = [];
    let allPercent = true;

    metrics.forEach(metric => {
      if (!visibleMetrics[metric.key]) return;

      const metricDef = METRICS[metric.key];
      const format = metricDef?.format || metric.format;

      if (isLargeScaleMetric(metric.key, format)) {
        large.push(metric);
      } else {
        small.push({ ...metric, format });
        // Check if all small-scale metrics are percentages
        if (format !== 'percent') {
          allPercent = false;
        }
      }
    });

    // If no small-scale metrics, don't flag as all-percent
    if (small.length === 0) allPercent = false;

    return { largeScaleMetrics: large, smallScaleMetrics: small, rightAxisAllPercent: allPercent };
  }, [metrics, visibleMetrics]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: 'rgba(0, 0, 0, 0.06)' },
        horzLines: { color: 'rgba(0, 0, 0, 0.06)' }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          width: 1,
          color: '#6366f1',
          style: 2,
          labelBackgroundColor: '#6366f1'
        },
        horzLine: {
          width: 1,
          color: '#6366f1',
          style: 2,
          labelBackgroundColor: '#6366f1'
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(0, 0, 0, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: true
      },
      leftPriceScale: {
        borderColor: 'rgba(0, 0, 0, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: chartMode === 'absolute' && largeScaleMetrics.length > 0 && smallScaleMetrics.length > 0
      },
      timeScale: {
        borderColor: 'rgba(0, 0, 0, 0.1)',
        timeVisible: false,
        rightOffset: 1,
        barSpacing: 30,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      },
      width: chartContainerRef.current.clientWidth,
      height: height
    });

    chartRef.current = chart;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredData(null);
        return;
      }

      const values = {};
      param.seriesData.forEach((data, series) => {
        // Find which metric this series belongs to
        Object.entries(seriesRefs.current).forEach(([key, s]) => {
          if (s === series) {
            values[key] = data.value;
          }
        });
      });

      // Find the original data point for this time
      const timeStr = typeof param.time === 'object'
        ? `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`
        : param.time;

      const originalPoint = filteredData.find(d => d.time === timeStr);

      setHoveredData({
        time: originalPoint?.period || timeStr,
        values,
        originalPoint
      });
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // Chart already disposed
      }
    };
  }, [height, filteredData, chartMode, largeScaleMetrics.length, smallScaleMetrics.length]);

  // Update series when data or settings change
  useEffect(() => {
    if (!chartRef.current || !filteredData.length || !metrics.length) return;

    const chart = chartRef.current;

    // Remove existing series
    Object.values(seriesRefs.current).forEach(series => {
      try { chart.removeSeries(series); } catch (e) {}
    });
    seriesRefs.current = {};

    // Update left scale visibility based on mode and metrics
    const useDualAxis = chartMode === 'absolute' && largeScaleMetrics.length > 0 && smallScaleMetrics.length > 0;
    chart.applyOptions({
      leftPriceScale: {
        visible: useDualAxis
      }
    });

    // Helper to convert period string to a valid date format
    const convertPeriodToDate = (period, idx) => {
      if (!period) return `${2000 + idx}-01-01`;

      // If already in YYYY-MM-DD format, use it
      if (period.match(/^\d{4}-\d{2}-\d{2}/)) {
        return period.substring(0, 10);
      }

      // Handle FY2024, FY2023 format
      const fyMatch = period.match(/FY(\d{4})/);
      if (fyMatch) {
        return `${fyMatch[1]}-12-31`;
      }

      // Handle Q1-2024, Q2-2024 format
      const qMatch = period.match(/Q(\d)-(\d{4})/);
      if (qMatch) {
        const quarter = parseInt(qMatch[1]);
        const year = qMatch[2];
        const month = quarter * 3;
        return `${year}-${String(month).padStart(2, '0')}-28`;
      }

      // Fallback to index-based date
      return `${2000 + idx}-01-01`;
    };

    // Add series for each visible metric
    metrics.forEach((metric, idx) => {
      if (!visibleMetrics[metric.key]) return;

      const color = metric.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
      const baseValue = baseValues[metric.key];
      const metricDef = METRICS[metric.key];
      const format = metricDef?.format || metric.format;
      const isLarge = isLargeScaleMetric(metric.key, format);

      // Prepare data for this metric
      const seriesData = filteredData
        .map((d, dataIdx) => {
          const rawValue = d[metric.key];
          if (rawValue === null || rawValue === undefined || isNaN(rawValue)) {
            return null;
          }

          let displayValue;
          if (chartMode === 'normalized' && baseValue && baseValue !== 0) {
            // Show as percentage change from base
            displayValue = ((rawValue - baseValue) / Math.abs(baseValue)) * 100;
          } else {
            displayValue = rawValue;
          }

          return {
            time: convertPeriodToDate(d.date || d.time, dataIdx),
            value: displayValue
          };
        })
        .filter(d => d !== null);

      if (seriesData.length === 0) return;

      // Price formatter based on mode
      const priceFormatter = (v) => {
        if (chartMode === 'normalized') {
          return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
        }
        return formatAxisValue(v, format, isLarge);
      };

      // Determine which price scale to use
      const priceScaleId = (chartMode === 'absolute' && useDualAxis && isLarge) ? 'left' : 'right';

      const series = chart.addSeries(LineSeries, {
        color: color,
        lineWidth: 2,
        priceScaleId: priceScaleId,
        priceFormat: {
          type: 'custom',
          formatter: priceFormatter
        },
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        lastValueVisible: false,
        priceLineVisible: false
      });

      series.setData(seriesData);
      seriesRefs.current[metric.key] = series;
    });

    // Fit content to show all data
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });

  }, [filteredData, metrics, visibleMetrics, chartMode, baseValues, largeScaleMetrics, smallScaleMetrics]);

  // Update visible metrics when metrics prop changes
  useEffect(() => {
    setVisibleMetrics(metrics.reduce((acc, m) => ({ ...acc, [m.key]: true }), {}));
  }, [metrics]);

  const toggleMetric = useCallback((key) => {
    setVisibleMetrics(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  // Get the actual (non-normalized) value for display
  const getActualValue = useCallback((metric, hoveredPoint) => {
    if (!hoveredPoint?.originalPoint) {
      // Use latest value
      const latest = filteredData[filteredData.length - 1];
      return latest?.[metric.key];
    }
    return hoveredPoint.originalPoint[metric.key];
  }, [filteredData]);

  if (!data.length) {
    return (
      <div className="multi-metric-chart-empty">
        <p>No historical data available</p>
      </div>
    );
  }

  // Check if we're using dual axis
  const useDualAxis = chartMode === 'absolute' && largeScaleMetrics.length > 0 && smallScaleMetrics.length > 0;

  return (
    <div className="multi-metric-chart-container">
      {/* Header */}
      <div className="mmc-header">
        <h3>{title} ({periodType === 'annual' ? 'Annual' : 'Quarterly'})</h3>

        <div className="mmc-controls">
          {/* Time Range - can be hidden when parent controls period */}
          {!hideTimeRange && (
            <div className="time-range-buttons">
              {TIME_RANGES.map(range => (
                <button
                  key={range.label}
                  className={selectedTimeRange === range.label ? 'active' : ''}
                  onClick={() => setSelectedTimeRange(range.label)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}

          {/* Chart Mode Toggle */}
          <div className="chart-mode-buttons">
            {CHART_MODES.map(mode => (
              <button
                key={mode.value}
                className={chartMode === mode.value ? 'active' : ''}
                onClick={() => setChartMode(mode.value)}
                title={mode.label}
              >
                {mode.icon}
              </button>
            ))}
          </div>

          <button className="reset-btn" onClick={handleResetZoom} title="Reset Zoom">
            ⟲
          </button>
        </div>
      </div>

      {/* Metric Legend / Toggles */}
      <div className="mmc-legend">
        {metrics.map((metric, idx) => {
          const color = metric.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
          const isVisible = visibleMetrics[metric.key];
          const actualValue = getActualValue(metric, hoveredData);
          const baseValue = baseValues[metric.key];
          const metricDef = METRICS[metric.key];
          const format = metricDef?.format || metric.format;
          void format; // Used for metric categorization

          // Calculate percentage change for display
          let percentChange = null;
          if (actualValue != null && baseValue != null && baseValue !== 0) {
            percentChange = ((actualValue - baseValue) / Math.abs(baseValue)) * 100;
          }

          return (
            <button
              key={metric.key}
              className={`legend-item ${isVisible ? 'active' : 'hidden'}`}
              onClick={() => toggleMetric(metric.key)}
              style={{ '--metric-color': color }}
            >
              <span className="legend-dot"></span>
              <span className="legend-label">{metric.label}</span>
              {actualValue !== undefined && actualValue !== null && (
                <span className="legend-value-group">
                  <span className="legend-value">
                    {formatLegendValue(actualValue, metric.key)}
                  </span>
                  {percentChange !== null && (
                    <span className={`legend-change ${percentChange >= 0 ? 'positive' : 'negative'}`}>
                      {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hovered Period Indicator */}
      {hoveredData && (
        <div className="hover-period">
          <span>{hoveredData.time}</span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="mmc-canvas" />

      {/* Axis Description - below chart */}
      {useDualAxis && (
        <div className="mmc-axis-description">
          <span className="axis-left">← Left axis: Large values (Revenue, FCF, Net Income)</span>
          <span className="axis-right">Right axis: Smaller values (Price, Ratios, %) →</span>
        </div>
      )}

      {/* Instructions */}
      <div className="mmc-instructions">
        <span>Scroll to zoom • Drag to pan • Click legend to show/hide metrics</span>
      </div>
    </div>
  );
}

export default MultiMetricChart;
