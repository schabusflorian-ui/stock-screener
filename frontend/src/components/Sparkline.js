import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import './Sparkline.css';

function Sparkline({
  data = [], // Array of { time, value }
  width = 120,
  height = 40,
  color = '#7C3AED',
  showChange = true
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  // Filter out null/undefined values and convert time to proper format
  const validData = data
    .filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value))
    .map((d, idx) => ({
      // Use index-based time if fiscal_period format isn't a valid date
      time: d.time && d.time.match(/^\d{4}-\d{2}-\d{2}/)
        ? d.time.substring(0, 10)
        : `${2000 + idx}-01-01`,
      value: d.value
    }));

  // Calculate change from filtered data
  const firstValue = validData[0]?.value;
  const lastValue = validData[validData.length - 1]?.value;
  const change = firstValue && lastValue
    ? ((lastValue - firstValue) / Math.abs(firstValue)) * 100
    : null;
  const isPositive = change !== null && change >= 0;

  // Determine color based on change
  const lineColor = showChange
    ? (isPositive ? '#059669' : '#DC2626')
    : color;

  useEffect(() => {
    if (!chartContainerRef.current || !validData.length) return;

    // Clean up previous chart safely
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
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#F1F5F9', style: 0, visible: false }
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
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
      topColor: `${lineColor}30`,
      bottomColor: 'transparent',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
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
  }, [validData, width, height, lineColor]);

  if (!data.length) {
    return <div className="sparkline-empty" style={{ width, height }} />;
  }

  return (
    <div className="sparkline-container">
      <div ref={chartContainerRef} className="sparkline-chart" />
      {showChange && change !== null && (
        <span className={`sparkline-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export default Sparkline;
