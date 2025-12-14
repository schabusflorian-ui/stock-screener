import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import './FinancialChart.css';

// Calculate Simple Moving Average
const calculateSMA = (data, period) => {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    result.push({
      time: data[i].time,
      value: sum / period
    });
  }
  return result;
};

// Calculate Exponential Moving Average
const calculateEMA = (data, period) => {
  const result = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].value;
  }
  let prevEMA = sum / period;
  result.push({ time: data[period - 1].time, value: prevEMA });

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    const ema = (data[i].value - prevEMA) * multiplier + prevEMA;
    result.push({ time: data[i].time, value: ema });
    prevEMA = ema;
  }
  return result;
};

// Color schemes for different metrics
const METRIC_COLORS = {
  roic: { line: '#8b5cf6', area: 'rgba(139, 92, 246, 0.1)' },
  roe: { line: '#3b82f6', area: 'rgba(59, 130, 246, 0.1)' },
  net_margin: { line: '#22c55e', area: 'rgba(34, 197, 94, 0.1)' },
  gross_margin: { line: '#10b981', area: 'rgba(16, 185, 129, 0.1)' },
  operating_margin: { line: '#14b8a6', area: 'rgba(20, 184, 166, 0.1)' },
  fcf_yield: { line: '#f59e0b', area: 'rgba(245, 158, 11, 0.1)' },
  debt_to_equity: { line: '#ef4444', area: 'rgba(239, 68, 68, 0.1)' },
  current_ratio: { line: '#06b6d4', area: 'rgba(6, 182, 212, 0.1)' },
  revenue_growth: { line: '#ec4899', area: 'rgba(236, 72, 153, 0.1)' },
  earnings_growth: { line: '#a855f7', area: 'rgba(168, 85, 247, 0.1)' },
  default: { line: '#64748b', area: 'rgba(100, 116, 139, 0.1)' }
};

const TIME_RANGES = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: 'All', months: null }
];

const CHART_TYPES = [
  { value: 'area', label: 'Area' },
  { value: 'line', label: 'Line' },
  { value: 'histogram', label: 'Bars' }
];

function FinancialChart({
  data = [],
  title = '',
  metric = 'default',
  height = 400,
  showTimeRangeButtons = true,
  showChartTypeSelector = true,
  showIndicators = true,
  showVolume = false,
  volumeData = [],
  formatValue = (v) => v?.toFixed(2),
  yAxisLabel = '',
  comparisonData = [], // Array of { name, data, color } for overlays
  onTimeRangeChange = null
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const indicatorSeriesRef = useRef([]);
  const comparisonSeriesRef = useRef([]);

  const [selectedTimeRange, setSelectedTimeRange] = useState('All');
  const [chartType, setChartType] = useState('area');
  const [indicators, setIndicators] = useState({ sma20: false, sma50: false, ema20: false });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filter data by time range
  const getFilteredData = useCallback((rawData, months) => {
    if (!months || !rawData.length) return rawData;

    const now = new Date();
    const cutoff = new Date(now.setMonth(now.getMonth() - months));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return rawData.filter(d => d.time >= cutoffStr);
  }, []);

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
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: '#8b5cf6',
          style: 2,
          labelBackgroundColor: '#8b5cf6'
        },
        horzLine: {
          width: 1,
          color: '#8b5cf6',
          style: 2,
          labelBackgroundColor: '#8b5cf6'
        }
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: {
          top: 0.1,
          bottom: showVolume ? 0.25 : 0.1
        }
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 12,
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

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // Chart already disposed
      }
    };
  }, [height, showVolume]);

  // Update series when data or settings change
  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    const chart = chartRef.current;
    const colors = METRIC_COLORS[metric] || METRIC_COLORS.default;

    // Get filtered data based on time range
    const timeRange = TIME_RANGES.find(t => t.label === selectedTimeRange);
    const filteredData = getFilteredData(data, timeRange?.months);

    // Remove existing series
    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
    }
    indicatorSeriesRef.current.forEach(series => {
      try { chart.removeSeries(series); } catch (e) {}
    });
    indicatorSeriesRef.current = [];
    comparisonSeriesRef.current.forEach(series => {
      try { chart.removeSeries(series); } catch (e) {}
    });
    comparisonSeriesRef.current = [];

    // Create main series based on chart type
    let mainSeries;
    if (chartType === 'area') {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: colors.line,
        topColor: colors.area,
        bottomColor: 'transparent',
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: formatValue
        }
      });
    } else if (chartType === 'line') {
      mainSeries = chart.addSeries(LineSeries, {
        color: colors.line,
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: formatValue
        }
      });
    } else if (chartType === 'histogram') {
      mainSeries = chart.addSeries(HistogramSeries, {
        color: colors.line,
        priceFormat: {
          type: 'custom',
          formatter: formatValue
        }
      });
    }

    mainSeries.setData(filteredData);
    mainSeriesRef.current = mainSeries;

    // Add comparison series
    comparisonData.forEach((comparison, idx) => {
      const compFilteredData = getFilteredData(comparison.data, timeRange?.months);
      const compSeries = chart.addSeries(LineSeries, {
        color: comparison.color || `hsl(${idx * 60}, 70%, 50%)`,
        lineWidth: 2,
        lineStyle: 2, // Dashed
        priceFormat: {
          type: 'custom',
          formatter: formatValue
        }
      });
      compSeries.setData(compFilteredData);
      comparisonSeriesRef.current.push(compSeries);
    });

    // Add indicators
    if (showIndicators && filteredData.length > 20) {
      if (indicators.sma20) {
        const sma20Data = calculateSMA(filteredData, 20);
        const sma20Series = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: 2,
          priceFormat: { type: 'custom', formatter: formatValue }
        });
        sma20Series.setData(sma20Data);
        indicatorSeriesRef.current.push(sma20Series);
      }

      if (indicators.sma50 && filteredData.length > 50) {
        const sma50Data = calculateSMA(filteredData, 50);
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          priceFormat: { type: 'custom', formatter: formatValue }
        });
        sma50Series.setData(sma50Data);
        indicatorSeriesRef.current.push(sma50Series);
      }

      if (indicators.ema20) {
        const ema20Data = calculateEMA(filteredData, 20);
        const ema20Series = chart.addSeries(LineSeries, {
          color: '#22c55e',
          lineWidth: 1,
          lineStyle: 2,
          priceFormat: { type: 'custom', formatter: formatValue }
        });
        ema20Series.setData(ema20Data);
        indicatorSeriesRef.current.push(ema20Series);
      }
    }

    // Add volume histogram if provided
    if (showVolume && volumeData.length) {
      const filteredVolume = getFilteredData(volumeData, timeRange?.months);
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#3b82f6',
        priceFormat: {
          type: 'volume'
        },
        priceScaleId: 'volume',
        scaleMargins: {
          top: 0.8,
          bottom: 0
        }
      });
      volumeSeries.setData(filteredVolume.map(v => ({
        ...v,
        color: v.value >= 0 ? '#22c55e80' : '#ef444480'
      })));
    }

    // Fit content
    chart.timeScale().fitContent();

    // Notify parent of time range change
    if (onTimeRangeChange) {
      onTimeRangeChange(selectedTimeRange, filteredData);
    }

  }, [data, chartType, selectedTimeRange, indicators, metric, formatValue, showIndicators, showVolume, volumeData, comparisonData, getFilteredData, onTimeRangeChange]);

  const handleTimeRangeClick = (range) => {
    setSelectedTimeRange(range);
  };

  const handleIndicatorToggle = (indicator) => {
    setIndicators(prev => ({
      ...prev,
      [indicator]: !prev[indicator]
    }));
  };

  const handleFullscreen = () => {
    if (!chartContainerRef.current) return;

    if (!isFullscreen) {
      if (chartContainerRef.current.parentElement.requestFullscreen) {
        chartContainerRef.current.parentElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  if (!data.length) {
    return (
      <div className="financial-chart-empty">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className={`financial-chart-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="chart-header">
        <div className="chart-title">
          {title && <h4>{title}</h4>}
          {yAxisLabel && <span className="y-axis-label">{yAxisLabel}</span>}
        </div>

        <div className="chart-controls">
          {/* Time Range Buttons */}
          {showTimeRangeButtons && (
            <div className="time-range-buttons">
              {TIME_RANGES.map(range => (
                <button
                  key={range.label}
                  className={selectedTimeRange === range.label ? 'active' : ''}
                  onClick={() => handleTimeRangeClick(range.label)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}

          {/* Chart Type Selector */}
          {showChartTypeSelector && (
            <div className="chart-type-selector">
              {CHART_TYPES.map(type => (
                <button
                  key={type.value}
                  className={chartType === type.value ? 'active' : ''}
                  onClick={() => setChartType(type.value)}
                  title={type.label}
                >
                  {type.label}
                </button>
              ))}
            </div>
          )}

          {/* Indicators Dropdown */}
          {showIndicators && data.length > 20 && (
            <div className="indicators-dropdown">
              <button className="indicators-trigger">
                📊 Indicators
              </button>
              <div className="indicators-menu">
                <label>
                  <input
                    type="checkbox"
                    checked={indicators.sma20}
                    onChange={() => handleIndicatorToggle('sma20')}
                  />
                  <span className="indicator-color sma20"></span>
                  SMA 20
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={indicators.sma50}
                    onChange={() => handleIndicatorToggle('sma50')}
                  />
                  <span className="indicator-color sma50"></span>
                  SMA 50
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={indicators.ema20}
                    onChange={() => handleIndicatorToggle('ema20')}
                  />
                  <span className="indicator-color ema20"></span>
                  EMA 20
                </label>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="chart-actions">
            <button onClick={handleResetZoom} title="Reset Zoom">
              ⟲
            </button>
            <button onClick={handleFullscreen} title="Fullscreen">
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>
        </div>
      </div>

      {/* Legend for comparison series */}
      {comparisonData.length > 0 && (
        <div className="chart-legend">
          <div className="legend-item main">
            <span className="legend-color" style={{ background: METRIC_COLORS[metric]?.line || METRIC_COLORS.default.line }}></span>
            <span>Primary</span>
          </div>
          {comparisonData.map((comp, idx) => (
            <div key={idx} className="legend-item">
              <span className="legend-color" style={{ background: comp.color || `hsl(${idx * 60}, 70%, 50%)` }}></span>
              <span>{comp.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Indicator Legend */}
      {showIndicators && (indicators.sma20 || indicators.sma50 || indicators.ema20) && (
        <div className="indicator-legend">
          {indicators.sma20 && (
            <div className="legend-item">
              <span className="legend-line sma20"></span>
              <span>SMA 20</span>
            </div>
          )}
          {indicators.sma50 && (
            <div className="legend-item">
              <span className="legend-line sma50"></span>
              <span>SMA 50</span>
            </div>
          )}
          {indicators.ema20 && (
            <div className="legend-item">
              <span className="legend-line ema20"></span>
              <span>EMA 20</span>
            </div>
          )}
        </div>
      )}

      {/* Chart Container */}
      <div ref={chartContainerRef} className="chart-canvas" />

      {/* Instructions */}
      <div className="chart-instructions">
        <span>Scroll to zoom • Drag to pan • Double-click to reset</span>
      </div>
    </div>
  );
}

export default FinancialChart;
