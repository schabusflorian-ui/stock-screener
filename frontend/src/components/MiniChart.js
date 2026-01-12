// frontend/src/components/MiniChart.js
// Enhanced mini chart with optional axes for valuation displays
import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import './MiniChart.css';

function MiniChart({
  data = [], // Array of { time/date, value }
  width = 180,
  height = 60,
  color = '#8b5cf6',
  showYAxis = true,
  showTimeLabels = true,
  formatValue = (v) => v?.toFixed(1),
  unit = ''
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  // Filter and format data
  const validData = data
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

  // Calculate min/max for axis labels
  const values = validData.map(d => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  // Determine color based on trend
  const firstValue = validData[0]?.value;
  const lastValue = validData[validData.length - 1]?.value;
  const isPositive = lastValue >= firstValue;
  const lineColor = isPositive ? '#22c55e' : '#ef4444';

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
        textColor: 'var(--text-tertiary)',
        fontSize: 9,
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          visible: showYAxis,
          color: 'rgba(255, 255, 255, 0.05)',
          style: 1
        }
      },
      rightPriceScale: {
        visible: false, // Use custom labels instead of built-in
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.15 }, // Extra bottom margin for time axis
        mode: 0,
        autoScale: true
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: false, // Use custom time labels instead of built-in
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
      handleScroll: false,
      handleScale: false,
      width: width,
      height: height
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: lineColor,
      topColor: `${lineColor}25`,
      bottomColor: 'transparent',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price) => formatValue(price) + unit
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
  }, [validData, width, height, lineColor, showYAxis, showTimeLabels, formatValue, unit]);

  // Extract year labels from data
  const getYearLabels = () => {
    if (validData.length < 2) return null;
    const firstDate = validData[0]?.time;
    const lastDate = validData[validData.length - 1]?.time;
    if (!firstDate || !lastDate) return null;

    const firstYear = firstDate.substring(0, 4);
    const lastYear = lastDate.substring(0, 4);

    // For short data ranges, show month-year
    const firstMonth = new Date(firstDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const lastMonth = new Date(lastDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    return { firstYear, lastYear, firstMonth, lastMonth };
  };

  const yearLabels = showTimeLabels ? getYearLabels() : null;

  if (!data.length || validData.length < 2) {
    return (
      <div className="mini-chart-empty" style={{ width, height }}>
        <span>No data</span>
      </div>
    );
  }

  return (
    <div className="mini-chart-container">
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
}

export default MiniChart;
