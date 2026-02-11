import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries, AreaSeries } from 'lightweight-charts';
import { BarChart2, TrendingUp } from './icons';
import { useAskAI, createChartExtractor } from '../hooks';
import './MultiMetricChart.css';

// Import formatMetricValue from unified config
import { formatMetricValue as formatFromConfig, METRICS } from '../config/metrics';

// Default colors for metrics - Prism Design System
const DEFAULT_COLORS = [
  '#2563EB', // Blue (Primary)
  '#059669', // Green (Success)
  '#7C3AED', // Violet
  '#D97706', // Orange (Warning)
  '#0891B2', // Cyan
  '#DC2626', // Red
];

const TIME_RANGES = [
  { label: '3Y', periods: 3 },
  { label: '5Y', periods: 5 },
  { label: '10Y', periods: 10 },
  { label: 'All', periods: null }
];

const CHART_MODES = [
  { value: 'absolute', label: 'Absolute values (dual axis)', Icon: BarChart2 },
  { value: 'normalized', label: 'Normalized (% change)', Icon: TrendingUp }
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
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';

  if (format === 'percent') return `${num.toFixed(1)}%`;
  if (format === 'ratio') return num.toFixed(2) + 'x';

  if (format === 'currency' || format === 'currency_large') {
    const absVal = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (absVal >= 1e12) return `${sign}$${(absVal / 1e12).toFixed(1)}T`;
    if (absVal >= 1e9) return `${sign}$${(absVal / 1e9).toFixed(0)}B`;
    if (absVal >= 1e6) return `${sign}$${(absVal / 1e6).toFixed(0)}M`;
    if (absVal >= 1e3) return `${sign}$${(absVal / 1e3).toFixed(0)}K`;
    return `${sign}$${absVal.toFixed(0)}`;
  }

  if (format === 'currency_price') {
    return `$${num.toFixed(0)}`;
  }

  return num.toFixed(1);
};

// Format for legend display (more precision)
const formatLegendValue = (value, metricKey) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';

  // Use the unified config formatter
  if (metricKey && METRICS[metricKey]) {
    return formatFromConfig(num, metricKey);
  }

  // Fallback
  const absVal = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (absVal >= 1e12) return `${sign}$${(absVal / 1e12).toFixed(1)}T`;
  if (absVal >= 1e9) return `${sign}$${(absVal / 1e9).toFixed(1)}B`;
  if (absVal >= 1e6) return `${sign}$${(absVal / 1e6).toFixed(1)}M`;
  if (absVal >= 1e3) return `${sign}$${(absVal / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
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
        textColor: '#94A3B8',
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#F1F5F9', style: 0 }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          width: 1,
          color: '#94A3B8',
          style: 2,
          labelBackgroundColor: '#0F172A'
        },
        horzLine: {
          width: 1,
          color: '#94A3B8',
          style: 2,
          labelBackgroundColor: '#0F172A'
        }
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: true
      },
      leftPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        visible: chartMode === 'absolute' && largeScaleMetrics.length > 0 && smallScaleMetrics.length > 0
      },
      timeScale: {
        borderVisible: false,
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
        const n = Number(v);
        if (Number.isNaN(n)) return '-';
        if (chartMode === 'normalized') {
          return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
        }
        return formatAxisValue(n, format, isLarge);
      };

      // Determine which price scale to use
      const priceScaleId = (chartMode === 'absolute' && useDualAxis && isLarge) ? 'left' : 'right';

      // Use different chart types for left vs right axis (Prism style)
      // Left axis (large scale): solid line, Right axis (small scale): area chart
      const isRightAxis = priceScaleId === 'right';
      const useArea = useDualAxis && isRightAxis;

      // Convert hex color to rgba for area fill
      const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      let series;
      if (useArea) {
        // Area chart for right axis metrics
        series = chart.addSeries(AreaSeries, {
          lineColor: color,
          topColor: hexToRgba(color, 0.3),
          bottomColor: hexToRgba(color, 0.05),
          lineWidth: 2,
          priceScaleId: priceScaleId,
          priceFormat: {
            type: 'custom',
            formatter: priceFormatter
          },
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          lastValueVisible: false,
          priceLineVisible: false
        });
      } else {
        // Line chart for left axis metrics
        series = chart.addSeries(LineSeries, {
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
      }

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

  // Ask AI right-click support
  const askAIProps = useAskAI(createChartExtractor(() => ({
    metric: metrics.map(m => m.label || m.key).join(', '),
    companyName: title
  })));

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
    <div className="multi-metric-chart-container" {...askAIProps}>
      {/* Header Row - Legend left, Controls right */}
      <div className="mmc-header-row">
        {/* Left: Metric Legend - compact chips */}
        <div className="mmc-legend-compact">
          {metrics.map((metric, idx) => {
            const color = metric.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
            const isVisible = visibleMetrics[metric.key];
            const actualValue = getActualValue(metric, hoveredData);
            const baseValue = baseValues[metric.key];
            const metricDef = METRICS[metric.key];
            const format = metricDef?.format || metric.format;
            const isLarge = isLargeScaleMetric(metric.key, format);
            const axisLabel = useDualAxis ? (isLarge ? 'L' : 'R') : null;

            // Calculate percentage change for display
            let percentChange = null;
            if (actualValue != null && baseValue != null && baseValue !== 0) {
              percentChange = ((actualValue - baseValue) / Math.abs(baseValue)) * 100;
            }

            // Area style for right-axis metrics in dual-axis mode
            const isAreaStyle = useDualAxis && !isLarge;

            return (
              <button
                key={metric.key}
                className={`legend-chip ${isVisible ? 'active' : 'hidden'} ${isAreaStyle ? 'area-style' : ''}`}
                onClick={() => toggleMetric(metric.key)}
                style={{ '--metric-color': color }}
              >
                <span className="legend-name">
                  {metric.label}
                  {axisLabel && <span className="axis-tag">({axisLabel})</span>}
                </span>
                {actualValue !== undefined && actualValue !== null && (
                  <>
                    <span className="legend-val">{formatLegendValue(actualValue, metric.key)}</span>
                    {percentChange !== null && !Number.isNaN(Number(percentChange)) && (
                      <span className={`legend-pct ${Number(percentChange) >= 0 ? 'up' : 'down'}`}>
                        {Number(percentChange) >= 0 ? '+' : ''}{Number(percentChange).toFixed(0)}%
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Time Range + Chart Mode + Reset */}
        <div className="mmc-header-right">
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
                <mode.Icon size={14} />
              </button>
            ))}
          </div>

          <button className="reset-btn" onClick={handleResetZoom} title="Reset Zoom">
            ⟲
          </button>
        </div>
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
          <span className="axis-left">
            <span className="line-indicator solid"></span>
            Left axis: Large values (Revenue, FCF, Net Income)
          </span>
          <span className="axis-right">
            <span className="area-indicator"></span>
            Right axis: Smaller values (Price, Ratios, %)
          </span>
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
