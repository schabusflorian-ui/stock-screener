import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries, AreaSeries } from 'lightweight-charts';
import './MultiMetricChart.css';

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
  { value: 'overlay', label: 'Overlay', icon: '📊' },
  { value: 'stacked', label: 'Stacked', icon: '📈' }
];

function MultiMetricChart({
  data = [], // Array of { time, metric1, metric2, ... }
  metrics = [], // Array of { key, label, color, format }
  height = 400,
  title = 'Historical Performance',
  periodType = 'annual'
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef({});

  const [selectedTimeRange, setSelectedTimeRange] = useState('All');
  const [chartMode, setChartMode] = useState('overlay');
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          width: 1,
          color: '#64748b',
          style: 2,
          labelBackgroundColor: '#475569'
        },
        horzLine: {
          width: 1,
          color: '#64748b',
          style: 2,
          labelBackgroundColor: '#475569'
        }
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: false,
        rightOffset: 3,
        barSpacing: 20,
        fixLeftEdge: true,
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
        values
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
  }, [height, filteredData]);

  // Update series when data or settings change
  useEffect(() => {
    if (!chartRef.current || !filteredData.length || !metrics.length) return;

    const chart = chartRef.current;

    // Remove existing series
    Object.values(seriesRefs.current).forEach(series => {
      try { chart.removeSeries(series); } catch (e) {}
    });
    seriesRefs.current = {};

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

      // Prepare data for this metric
      const seriesData = filteredData
        .map((d, dataIdx) => ({
          time: convertPeriodToDate(d.date || d.time, dataIdx),
          value: d[metric.key]
        }))
        .filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));

      if (seriesData.length === 0) return;

      let series;
      if (chartMode === 'overlay') {
        series = chart.addSeries(LineSeries, {
          color: color,
          lineWidth: 2,
          priceFormat: {
            type: 'custom',
            formatter: (v) => {
              if (metric.format === 'percent') return `${v.toFixed(1)}%`;
              if (metric.format === 'ratio') return v.toFixed(2);
              return v.toFixed(1);
            }
          },
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 5,
          lastValueVisible: false,
          priceLineVisible: false
        });
      } else {
        // Stacked mode - use area charts
        series = chart.addSeries(AreaSeries, {
          lineColor: color,
          topColor: `${color}40`,
          bottomColor: `${color}10`,
          lineWidth: 2,
          priceFormat: {
            type: 'custom',
            formatter: (v) => {
              if (metric.format === 'percent') return `${v.toFixed(1)}%`;
              if (metric.format === 'ratio') return v.toFixed(2);
              return v.toFixed(1);
            }
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

    // Fit content
    chart.timeScale().fitContent();

  }, [filteredData, metrics, visibleMetrics, chartMode]);

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

  // Format value for display
  const formatMetricValue = useCallback((value, metric) => {
    if (value === null || value === undefined) return '-';
    if (metric?.format === 'percent') return `${value.toFixed(1)}%`;
    if (metric?.format === 'ratio') return value.toFixed(2);
    return value.toFixed(1);
  }, []);

  if (!data.length) {
    return (
      <div className="multi-metric-chart-empty">
        <p>No historical data available</p>
      </div>
    );
  }

  return (
    <div className="multi-metric-chart-container">
      {/* Header */}
      <div className="mmc-header">
        <h3>{title} ({periodType === 'annual' ? 'Annual' : 'Quarterly'})</h3>

        <div className="mmc-controls">
          {/* Time Range */}
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

          {/* Chart Mode */}
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
          const currentValue = hoveredData?.values?.[metric.key];
          const latestValue = filteredData[filteredData.length - 1]?.[metric.key];
          const displayValue = currentValue ?? latestValue;

          return (
            <button
              key={metric.key}
              className={`legend-item ${isVisible ? 'active' : 'hidden'}`}
              onClick={() => toggleMetric(metric.key)}
              style={{ '--metric-color': color }}
            >
              <span className="legend-dot"></span>
              <span className="legend-label">{metric.label}</span>
              {displayValue !== undefined && displayValue !== null && (
                <span className="legend-value">
                  {formatMetricValue(displayValue, metric)}
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

      {/* Instructions */}
      <div className="mmc-instructions">
        <span>Scroll to zoom • Drag to pan • Click legend to show/hide metrics</span>
      </div>
    </div>
  );
}

export default MultiMetricChart;
