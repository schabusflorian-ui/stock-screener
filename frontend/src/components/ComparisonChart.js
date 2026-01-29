import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import { useAskAI, createChartExtractor } from '../hooks';
import './ComparisonChart.css';

// Prism Design System chart colors (in order of preference)
const SERIES_COLORS = [
  '#2563EB', // Primary Blue
  '#059669', // Success Green
  '#D97706', // Warning Orange
  '#DC2626', // Danger Red
  '#7C3AED', // Violet
  '#0891B2', // Cyan
];

// Prism chart configuration for Lightweight Charts
const PRISM_CHART_CONFIG = {
  layout: {
    textColor: '#94A3B8',
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
  grid: {
    color: '#F1F5F9',
  },
  crosshair: {
    lineColor: '#94A3B8',
    labelBgColor: '#0F172A',
  },
};

const TIME_RANGES = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: 'All', months: null }
];

const NORMALIZATION_MODES = [
  { value: 'absolute', label: 'Absolute Values' },
  { value: 'percent', label: '% Change from Start' },
  { value: 'indexed', label: 'Indexed (Base 100)' }
];

function ComparisonChart({
  series = [], // Array of { name, symbol, data: [{ time, value }], color? }
  title = 'Comparison',
  height = 450,
  formatValue = (v) => v?.toFixed(2),
  yAxisLabel = '',
  onSeriesToggle = null
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef([]);

  const [selectedTimeRange, setSelectedTimeRange] = useState('All');
  const [normalization, setNormalization] = useState('absolute');
  const [visibleSeries, setVisibleSeries] = useState(() =>
    series.reduce((acc, s, idx) => ({ ...acc, [idx]: true }), {})
  );
  const [hoveredValues, setHoveredValues] = useState(null);

  // Filter data by time range
  const getFilteredData = useCallback((rawData, months) => {
    if (!months || !rawData?.length) return rawData || [];

    const now = new Date();
    const cutoff = new Date(now.setMonth(now.getMonth() - months));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return rawData.filter(d => d.time >= cutoffStr);
  }, []);

  // Normalize data based on mode
  const normalizeData = useCallback((data, mode) => {
    if (!data?.length) return [];

    if (mode === 'absolute') {
      return data;
    }

    const baseValue = data[0].value;
    if (baseValue === 0) return data;

    if (mode === 'percent') {
      return data.map(d => ({
        time: d.time,
        value: ((d.value - baseValue) / Math.abs(baseValue)) * 100
      }));
    }

    if (mode === 'indexed') {
      return data.map(d => ({
        time: d.time,
        value: (d.value / baseValue) * 100
      }));
    }

    return data;
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: PRISM_CHART_CONFIG.layout.textColor,
        fontFamily: PRISM_CHART_CONFIG.layout.fontFamily,
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: PRISM_CHART_CONFIG.grid.color, style: 0 }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          width: 1,
          color: PRISM_CHART_CONFIG.crosshair.lineColor,
          style: 2,
          labelBackgroundColor: PRISM_CHART_CONFIG.crosshair.labelBgColor
        },
        horzLine: {
          width: 1,
          color: PRISM_CHART_CONFIG.crosshair.lineColor,
          style: 2,
          labelBackgroundColor: PRISM_CHART_CONFIG.crosshair.labelBgColor
        }
      },
      rightPriceScale: {
        borderColor: PRISM_CHART_CONFIG.grid.color,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: PRISM_CHART_CONFIG.grid.color,
        timeVisible: true,
        rightOffset: 5,
        barSpacing: 8,
        fixLeftEdge: true
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

    // Handle crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredValues(null);
        return;
      }

      const values = {};
      param.seriesData.forEach((data, series) => {
        const idx = seriesRefs.current.indexOf(series);
        if (idx !== -1) {
          values[idx] = data.value;
        }
      });
      setHoveredValues({ time: param.time, values });
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // Chart already disposed
      }
    };
  }, [height]);

  // Update series when data or settings change
  useEffect(() => {
    if (!chartRef.current || !series.length) return;

    const chart = chartRef.current;
    const timeRange = TIME_RANGES.find(t => t.label === selectedTimeRange);

    // Remove existing series
    seriesRefs.current.forEach(s => {
      try { chart.removeSeries(s); } catch (e) {}
    });
    seriesRefs.current = [];

    // Add each visible series
    series.forEach((s, idx) => {
      if (!visibleSeries[idx]) return;

      const filteredData = getFilteredData(s.data, timeRange?.months);
      const normalizedData = normalizeData(filteredData, normalization);

      if (!normalizedData.length) return;

      const color = s.color || SERIES_COLORS[idx % SERIES_COLORS.length];
      const lineSeries = chart.addSeries(LineSeries, {
        color: color,
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: (v) => {
            if (normalization === 'percent') return `${v.toFixed(1)}%`;
            if (normalization === 'indexed') return v.toFixed(1);
            return formatValue(v);
          }
        },
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5
      });

      lineSeries.setData(normalizedData);
      seriesRefs.current.push(lineSeries);
    });

    // Fit content
    chart.timeScale().fitContent();

  }, [series, selectedTimeRange, normalization, visibleSeries, getFilteredData, normalizeData, formatValue]);

  // Update visible series when series prop changes
  useEffect(() => {
    setVisibleSeries(series.reduce((acc, s, idx) => ({ ...acc, [idx]: true }), {}));
  }, [series]);

  const handleToggleSeries = (idx) => {
    setVisibleSeries(prev => {
      const newState = { ...prev, [idx]: !prev[idx] };
      if (onSeriesToggle) {
        onSeriesToggle(idx, newState[idx]);
      }
      return newState;
    });
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  // Ask AI right-click support
  const askAIProps = useAskAI(createChartExtractor(() => ({
    symbol: series.map(s => s.symbol || s.name).join(', '),
    metric: 'comparison',
    companyName: title,
    period: selectedTimeRange
  })));

  if (!series.length) {
    return (
      <div className="comparison-chart-empty">
        <p>No series to compare. Select at least one stock or metric.</p>
      </div>
    );
  }

  return (
    <div className="comparison-chart-container" {...askAIProps}>
      {/* Header */}
      <div className="comparison-header">
        <div className="comparison-title">
          <h4>{title}</h4>
          {yAxisLabel && <span className="y-axis-label">{yAxisLabel}</span>}
        </div>

        <div className="comparison-controls">
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

          {/* Normalization Mode */}
          <select
            className="normalization-select"
            value={normalization}
            onChange={(e) => setNormalization(e.target.value)}
          >
            {NORMALIZATION_MODES.map(mode => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>

          <button className="reset-zoom-btn" onClick={handleResetZoom} title="Reset Zoom">
            ⟲
          </button>
        </div>
      </div>

      {/* Series Legend */}
      <div className="series-legend">
        {series.map((s, idx) => (
          <button
            key={idx}
            className={`legend-item ${visibleSeries[idx] ? 'active' : 'hidden'}`}
            onClick={() => handleToggleSeries(idx)}
            style={{
              '--series-color': s.color || SERIES_COLORS[idx % SERIES_COLORS.length]
            }}
          >
            <span className="legend-color"></span>
            <span className="legend-name">{s.name || s.symbol}</span>
            {hoveredValues?.values?.[idx] !== undefined && (
              <span className="legend-value">
                {normalization === 'percent'
                  ? `${hoveredValues.values[idx].toFixed(1)}%`
                  : normalization === 'indexed'
                  ? hoveredValues.values[idx].toFixed(1)
                  : formatValue(hoveredValues.values[idx])
                }
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="comparison-canvas" />

      {/* Normalization Explanation */}
      <div className="normalization-info">
        {normalization === 'percent' && (
          <span>Showing percentage change from the first visible data point</span>
        )}
        {normalization === 'indexed' && (
          <span>All values indexed to 100 at the first visible data point</span>
        )}
        {normalization === 'absolute' && (
          <span>Showing actual metric values</span>
        )}
      </div>

      {/* Instructions */}
      <div className="chart-instructions">
        <span>Click legend items to show/hide • Scroll to zoom • Drag to pan</span>
      </div>
    </div>
  );
}

export default ComparisonChart;
