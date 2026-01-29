/**
 * CandlestickChart - OHLC candlestick chart with volume
 * Uses lightweight-charts for high-performance rendering
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

// Prism Design System colors
const COLORS = {
  bullish: '#059669',
  bearish: '#DC2626',
  volume: {
    up: 'rgba(5, 150, 105, 0.5)',
    down: 'rgba(220, 38, 38, 0.5)'
  },
  grid: '#F1F5F9',
  text: '#94A3B8',
  background: 'transparent'
};

function CandlestickChart({
  data = [],
  volumeData = [],
  width = 300,
  height = 200,
  title,
  showVolume = true
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  // Format and validate OHLC data
  const formatData = useCallback(() => {
    if (!data || data.length === 0) return { candles: [], volume: [] };

    const candles = data
      .filter(d => {
        const hasOHLC = d.open !== undefined && d.high !== undefined &&
                        d.low !== undefined && d.close !== undefined;
        return hasOHLC && d.time;
      })
      .map(d => ({
        time: typeof d.time === 'string' ? d.time.substring(0, 10) : d.time,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close)
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    // Format volume data if available
    let volume = [];
    if (showVolume && volumeData && volumeData.length > 0) {
      volume = volumeData
        .filter(d => d.time && d.value !== undefined)
        .map(d => ({
          time: typeof d.time === 'string' ? d.time.substring(0, 10) : d.time,
          value: Number(d.value),
          color: d.color || COLORS.volume.up
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    } else if (showVolume && data.some(d => d.volume !== undefined)) {
      // Extract volume from main data if not provided separately
      volume = data
        .filter(d => d.time && d.volume !== undefined)
        .map(d => ({
          time: typeof d.time === 'string' ? d.time.substring(0, 10) : d.time,
          value: Number(d.volume),
          color: d.close >= d.open ? COLORS.volume.up : COLORS.volume.down
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    }

    return { candles, volume };
  }, [data, volumeData, showVolume]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const { candles, volume } = formatData();
    if (candles.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        // Chart already disposed
      }
      chartRef.current = null;
    }

    // Calculate height allocation
    const volumeHeight = showVolume && volume.length > 0 ? 0.2 : 0;
    const priceScaleMargins = {
      top: 0.05,
      bottom: volumeHeight + 0.05
    };

    const chart = createChart(chartContainerRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.background },
        textColor: COLORS.text,
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        fontSize: 10,
        attributionLogo: false
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          color: COLORS.grid,
          style: 0
        }
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: priceScaleMargins,
        autoScale: true
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        ticksVisible: false
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: '#7C3AED',
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: '#7C3AED'
        },
        horzLine: {
          color: '#7C3AED',
          width: 1,
          style: 2,
          labelBackgroundColor: '#7C3AED'
        }
      },
      handleScroll: true,
      handleScale: true
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.bullish,
      downColor: COLORS.bearish,
      borderUpColor: COLORS.bullish,
      borderDownColor: COLORS.bearish,
      wickUpColor: COLORS.bullish,
      wickDownColor: COLORS.bearish,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01
      }
    });

    candlestickSeries.setData(candles);

    // Add volume histogram if data available
    if (showVolume && volume.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: {
          type: 'volume'
        },
        priceScaleId: 'volume'
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.85,
          bottom: 0
        },
        borderVisible: false
      });

      volumeSeries.setData(volume);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
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
  }, [data, volumeData, width, height, showVolume, formatData]);

  if (!data || data.length === 0) {
    return (
      <div className="candlestick-empty" style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
        <span>No OHLC data available</span>
      </div>
    );
  }

  return (
    <div className="candlestick-chart-container">
      <div ref={chartContainerRef} className="candlestick-chart-canvas" />
    </div>
  );
}

export default CandlestickChart;