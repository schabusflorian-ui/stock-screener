// frontend/src/components/MiniChart.js
// Enhanced mini chart with optional axes for valuation displays
import { useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import { useAskAI, createChartExtractor } from '../hooks';
import './MiniChart.css';

const MiniChart = memo(function MiniChart({
  data = [], // Array of { time/date, value }
  width = 180,
  height = 60,
  color = '#7C3AED',
  showYAxis = true,
  showTimeLabels = true,
  formatValue = (v) => v?.toFixed(1),
  unit = '',
  interactive = false, // Enable zoom/pan for larger chart contexts
  // Note: Ask AI context is now inherited from parent AskAIProvider automatically
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  // Memoize data transformation - only recalculate when data changes
  const validData = useMemo(() => {
    return data
      .filter(d => {
        const val = d.value ?? d.close;
        return val !== null && val !== undefined && !isNaN(val);
      })
      .map((d, idx) => {
        // Handle different time formats
        const timeStr = d.time || d.date;
        let formattedTime;

        if (timeStr && typeof timeStr === 'string' && timeStr.match(/^\d{4}-\d{2}-\d{2}/)) {
          formattedTime = timeStr.substring(0, 10);
        } else if (timeStr && timeStr instanceof Date) {
          formattedTime = timeStr.toISOString().substring(0, 10);
        } else {
          // Fallback to index-based dates
          const date = new Date();
          date.setMonth(date.getMonth() - (data.length - 1 - idx));
          formattedTime = date.toISOString().substring(0, 10);
        }

        return {
          time: formattedTime,
          value: d.value ?? d.close
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [data]);

  // Memoize derived values
  const { minValue, maxValue, lineColor } = useMemo(() => {
    if (validData.length === 0) {
      return { minValue: 0, maxValue: 0, lineColor: '#059669' };
    }
    const values = validData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const firstValue = validData[0]?.value;
    const lastValue = validData[validData.length - 1]?.value;
    const isPositive = lastValue >= firstValue;
    return {
      minValue: min,
      maxValue: max,
      lineColor: isPositive ? '#059669' : '#DC2626'
    };
  }, [validData]);

  // Stabilize formatter to prevent unnecessary chart recreation
  const stableFormatValue = useCallback(formatValue, []);

  useEffect(() => {
    if (!chartContainerRef.current || !validData.length) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        // Chart already disposed
      }
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        fontSize: 9,
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          visible: showYAxis,
          color: '#F1F5F9',
          style: 0
        }
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.15 },
        mode: 0,
        autoScale: true
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: false,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: false,
        ticksVisible: false
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false }
      },
      handleScroll: interactive,
      handleScale: interactive,
      width: width,
      height: height
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: lineColor,
      topColor: `${lineColor}15`,
      bottomColor: 'transparent',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price) => stableFormatValue(price) + unit
      }
    });

    areaSeries.setData(validData);
    chart.timeScale().fitContent();

    chartRef.current = chart;

    return () => {
      try {
        chart.remove();
      } catch (e) {
        // Chart already disposed
      }
    };
  // Reduced dependencies - only include values that affect chart rendering
  }, [validData, width, height, lineColor, showYAxis, interactive, stableFormatValue, unit]);

  // Memoize year labels calculation
  const yearLabels = useMemo(() => {
    if (!showTimeLabels || validData.length < 2) return null;
    const firstDate = validData[0]?.time;
    const lastDate = validData[validData.length - 1]?.time;
    if (!firstDate || !lastDate) return null;

    const firstYear = firstDate.substring(0, 4);
    const lastYear = lastDate.substring(0, 4);

    // For short data ranges, show month-year
    const firstMonth = new Date(firstDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const lastMonth = new Date(lastDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    return { firstYear, lastYear, firstMonth, lastMonth };
  }, [validData, showTimeLabels]);

  // Memoize Ask AI context to prevent unnecessary hook updates
  const chartExtractor = useMemo(() => createChartExtractor(() => ({
    chartValue: validData[validData.length - 1]?.value,
    unit: unit || undefined
  })), [validData, unit]);

  // Ask AI right-click support - inherits context from parent AskAIProvider automatically
  const askAIProps = useAskAI(chartExtractor);

  if (!data.length || validData.length < 2) {
    return (
      <div className="mini-chart-empty" style={{ width, height }}>
        <span>No data</span>
      </div>
    );
  }

  return (
    <div className="mini-chart-container" {...askAIProps}>
      <div ref={chartContainerRef} className="mini-chart-canvas" />
      {showYAxis && (
        <div className="mini-chart-range">
          <span className="mini-chart-max">{formatValue(maxValue)}{unit}</span>
          <span className="mini-chart-min">{formatValue(minValue)}{unit}</span>
        </div>
      )}
      {showTimeLabels && yearLabels && (
        <div className="mini-chart-time-axis">
          <span className="mini-chart-time-label">{yearLabels.firstMonth}</span>
          <span className="mini-chart-time-label">{yearLabels.lastMonth}</span>
        </div>
      )}
    </div>
  );
});

export default MiniChart;
