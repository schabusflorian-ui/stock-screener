/**
 * ChartRenderer - Interactive inline chart rendering for PRISM AI responses
 *
 * Supports:
 * - area/line charts (price history, trends)
 * - bar charts (comparisons, metrics)
 * - pie/donut charts (sentiment distribution, allocation)
 * - Export to PNG, CSV
 * - Interactive hover states with tooltips
 * - Click-to-navigate for symbols
 * - Fullscreen mode
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MiniChart from '../../MiniChart';
import CandlestickChart from './CandlestickChart';
import ScatterPlotChart from '../../../pages/AdvancedCharts/ScatterPlotChart';
import CorrelationHeatmap from '../../../pages/AdvancedCharts/CorrelationHeatmap';
import { getCorrelationColor, formatCorrelation } from '../../../pages/AdvancedCharts/chartUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import './ChartRenderer.css';

// Icons for export buttons
const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ImageIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const TableIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Chart type icons for toggle
const CandlestickIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="9" y1="2" x2="9" y2="22" />
    <rect x="6" y="6" width="6" height="10" fill="currentColor" />
    <line x1="18" y1="4" x2="18" y2="20" />
    <rect x="15" y="8" width="6" height="8" fill="none" />
  </svg>
);

const AreaChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 18 L7 14 L11 16 L15 10 L21 12 L21 18 L3 18 Z" fill="currentColor" fillOpacity="0.3" />
    <polyline points="3 18 7 14 11 16 15 10 21 12" />
  </svg>
);

const LineChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 18 7 14 11 16 15 10 21 12" />
  </svg>
);

/**
 * Export chart as PNG image
 * Works with SVG-based Recharts by converting to canvas
 */
function exportToPNG(containerRef, title = 'chart') {
  if (!containerRef.current) return;

  const svgElement = containerRef.current.querySelector('svg');
  if (!svgElement) {
    // For non-SVG charts (like horizontal bars), use html2canvas approach
    exportDOMToPNG(containerRef.current, title);
    return;
  }

  // Clone SVG and prepare for export
  const svgClone = svgElement.cloneNode(true);

  // Resolve CSS variables to actual values for export
  const computedStyle = getComputedStyle(document.documentElement);
  const resolveCSSVar = (value) => {
    if (!value || !value.includes('var(')) return value;
    return value.replace(/var\(--([^,)]+)(?:,\s*([^)]+))?\)/g, (match, varName, fallback) => {
      const resolved = computedStyle.getPropertyValue(`--${varName}`).trim();
      return resolved || fallback || '#888';
    });
  };

  // Apply computed styles to SVG elements for export
  const applyComputedStyles = (element) => {
    if (element.nodeType !== 1) return;
    const computed = getComputedStyle(element);
    if (element.tagName === 'text') {
      element.setAttribute('fill', resolveCSSVar(computed.fill) || '#888');
    }
    if (element.tagName === 'line' || element.tagName === 'path') {
      const stroke = computed.stroke;
      if (stroke && stroke !== 'none') {
        element.setAttribute('stroke', resolveCSSVar(stroke));
      }
    }
    Array.from(element.children).forEach(applyComputedStyles);
  };
  applyComputedStyles(svgClone);

  // Add background rect
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', '#1a1a2e');
  svgClone.insertBefore(bgRect, svgClone.firstChild);

  const svgData = new XMLSerializer().serializeToString(svgClone);

  // Get dimensions
  const bbox = svgElement.getBoundingClientRect();
  const width = bbox.width || 300;
  const height = bbox.height || 150;

  // Create canvas
  const canvas = document.createElement('canvas');
  const scale = 2; // Higher resolution
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Create image from SVG
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);

    // Download
    const link = document.createElement('a');
    link.download = `${sanitizeFilename(title)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    console.error('Failed to export chart as PNG');
  };

  img.src = url;
}

/**
 * Export DOM element to PNG (fallback for non-SVG charts)
 */
function exportDOMToPNG(element, title) {
  // Simple fallback - create a styled clone and capture
  const clone = element.cloneNode(true);
  clone.style.background = '#1a1a2e';
  clone.style.padding = '10px';

  // For simple DOM charts, we'll use a basic approach
  // In production, html2canvas library would be better
  console.log('DOM-to-PNG export - consider adding html2canvas for better support');

  // Fallback: just export the data as CSV instead
  alert('PNG export for this chart type requires html2canvas. Exporting data as CSV instead.');
}

/**
 * Export chart data as CSV
 */
function exportToCSV(data, title = 'chart') {
  if (!data || data.length === 0) return;

  // Determine columns from first data item
  const firstItem = data[0];
  const columns = Object.keys(firstItem).filter(key =>
    typeof firstItem[key] !== 'object' && typeof firstItem[key] !== 'function'
  );

  // Build CSV content
  const header = columns.join(',');
  const rows = data.map(item =>
    columns.map(col => {
      const val = item[col];
      // Escape strings with commas or quotes
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    }).join(',')
  );

  const csvContent = [header, ...rows].join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${sanitizeFilename(title)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Sanitize filename for download
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 50) || 'chart';
}

/**
 * Export button dropdown component
 */
function ExportControls({ containerRef, data, title, showCSV = true }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handlePNGExport = useCallback(() => {
    exportToPNG(containerRef, title);
    setShowMenu(false);
  }, [containerRef, title]);

  const handleCSVExport = useCallback(() => {
    exportToCSV(data, title);
    setShowMenu(false);
  }, [data, title]);

  return (
    <div className="chart-export-controls" ref={menuRef}>
      <button
        className="chart-export-btn"
        onClick={() => setShowMenu(!showMenu)}
        title="Export chart"
      >
        <DownloadIcon />
      </button>
      {showMenu && (
        <div className="chart-export-menu">
          <button onClick={handlePNGExport} className="chart-export-option">
            <ImageIcon /> PNG Image
          </button>
          {showCSV && (
            <button onClick={handleCSVExport} className="chart-export-option">
              <TableIcon /> CSV Data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Color palette for charts
const COLORS = {
  primary: '#7C3AED',
  positive: '#059669',
  negative: '#DC2626',
  neutral: '#D97706',
  muted: '#94A3B8',
  palette: ['#7C3AED', '#7C3AED', '#a78bfa', '#c4b5fd', '#ddd6fe'],
  // Distinct colors for multi-series comparisons
  series: [
    '#7C3AED', // purple
    '#059669', // green
    '#D97706', // amber
    '#DC2626', // red
    '#2563EB', // blue
    '#0891B2', // cyan
    '#7C3AED', // purple variant
    '#059669', // lime/green
    '#D97706', // orange
    '#0891B2', // teal
  ]
};

const SENTIMENT_COLORS = {
  bullish: '#059669',
  bearish: '#DC2626',
  neutral: '#D97706'
};

function ChartRenderer({ chartData, width = 300, height = 120, onSymbolClick }) {
  const chartRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDataPoint, setActiveDataPoint] = useState(null);
  // Display mode for price charts: 'area', 'line', or 'candlestick'
  const [displayMode, setDisplayMode] = useState(null);
  const navigate = useNavigate();

  // Handle symbol click - navigate to company page
  const handleSymbolClick = useCallback((sym) => {
    if (onSymbolClick) {
      onSymbolClick(sym);
    } else if (sym) {
      navigate(`/company/${sym}`);
    }
  }, [navigate, onSymbolClick]);

  // Handle bar/item click
  const handleDataClick = useCallback((item) => {
    if (item?.symbol) {
      handleSymbolClick(item.symbol);
    }
  }, [handleSymbolClick]);

  // Toggle expanded/fullscreen view
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Close on escape when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  // Early returns after all hooks
  if (!chartData) return null;

  const { type, data, title, color, symbol, series } = chartData;

  // For multi-series charts, check series instead of data
  const hasData = (data && data.length > 0) || (series && series.length > 0);
  if (!hasData) return null;

  // Determine if CSV export is applicable (array data only)
  const canExportCSV = Array.isArray(data);

  // Get effective dimensions based on expanded state
  const effectiveWidth = isExpanded ? Math.min(window.innerWidth - 80, 800) : width;
  const effectiveHeight = isExpanded ? Math.min(window.innerHeight - 200, 500) : height;

  // Determine if chart has OHLC data (can show candlestick)
  const hasOHLCData = data && data.length > 0 && data[0].open !== undefined;

  // Determine effective display mode
  const effectiveDisplayMode = displayMode || type;

  // Check if this is a price-type chart that can be toggled
  const isPriceChart = type === 'area' || type === 'line' || type === 'candlestick';

  const renderChart = () => {
    // For price charts, check display mode override
    if (isPriceChart) {
      if (effectiveDisplayMode === 'candlestick' && hasOHLCData) {
        return (
          <CandlestickChart
            data={data}
            volumeData={chartData.volume}
            width={effectiveWidth}
            height={Math.max(effectiveHeight, 200)}
            title={title}
            showVolume={!!chartData.volume}
          />
        );
      }
      // Default to area/line chart
      return (
        <AreaLineChart
          data={data}
          width={effectiveWidth}
          height={effectiveHeight}
          color={color}
          title={title}
          interactive={isExpanded || effectiveHeight > 150}
        />
      );
    }

    switch (type) {
      case 'area':
      case 'line':
        return (
          <AreaLineChart
            data={data}
            width={effectiveWidth}
            height={effectiveHeight}
            color={color}
            title={title}
            interactive={isExpanded || effectiveHeight > 150}
          />
        );

      case 'bar':
        return (
          <BarChartRenderer
            data={data}
            width={effectiveWidth}
            height={effectiveHeight}
            title={title}
            onBarClick={handleDataClick}
          />
        );

      case 'horizontal_bar':
        return (
          <HorizontalBarChart
            data={data}
            width={effectiveWidth}
            height={effectiveHeight}
            title={title}
            onItemClick={handleDataClick}
          />
        );

      case 'pie':
      case 'donut':
        return (
          <PieChartRenderer
            data={data}
            width={effectiveWidth}
            height={Math.max(effectiveHeight, 150)}
            title={title}
            isDonut={type === 'donut'}
            onSliceClick={handleDataClick}
          />
        );

      case 'sentiment':
        return (
          <SentimentChart
            data={data}
            title={title}
          />
        );

      case 'multi_line':
      case 'multi_area':
      case 'comparison':
        return (
          <MultiSeriesChart
            chartData={chartData}
            width={effectiveWidth}
            height={Math.max(effectiveHeight, 200)}
            isArea={type === 'multi_area'}
            onSeriesClick={handleSymbolClick}
          />
        );

      case 'scatter':
        return (
          <ScatterPlotChart
            data={data}
            xLabel={chartData.xLabel || 'X'}
            yLabel={chartData.yLabel || 'Y'}
            companies={chartData.companies || chartData.symbols || []}
            colors={COLORS.series}
          />
        );

      case 'heatmap':
        return (
          <CorrelationHeatmap
            matrix={chartData.matrix || {}}
            labels={chartData.labels || []}
            type={chartData.correlationType || 'pearson'}
            onCellClick={(row, col) => {
              if (row && col) {
                handleSymbolClick(row);
              }
            }}
          />
        );

      case 'candlestick':
        return (
          <CandlestickChart
            data={data}
            volumeData={chartData.volume}
            width={effectiveWidth}
            height={Math.max(effectiveHeight, 200)}
            title={title}
            showVolume={!!chartData.volume}
          />
        );

      default:
        return null;
    }
  };

  // Expanded/fullscreen overlay
  if (isExpanded) {
    return (
      <div className="chart-expanded-overlay" onClick={toggleExpanded}>
        <div className="chart-expanded-container" onClick={e => e.stopPropagation()}>
          <div className="chart-expanded-header">
            {title && <div className="chart-title">{title}</div>}
            <div className="chart-expanded-actions">
              {isPriceChart && hasOHLCData && (
                <div className="chart-type-toggle">
                  <button
                    className={`chart-type-btn ${effectiveDisplayMode === 'area' || effectiveDisplayMode === 'line' ? 'active' : ''}`}
                    onClick={() => setDisplayMode('area')}
                    title="Area chart"
                  >
                    <AreaChartIcon />
                  </button>
                  <button
                    className={`chart-type-btn ${effectiveDisplayMode === 'candlestick' ? 'active' : ''}`}
                    onClick={() => setDisplayMode('candlestick')}
                    title="Candlestick chart"
                  >
                    <CandlestickIcon />
                  </button>
                </div>
              )}
              <ExportControls
                containerRef={chartRef}
                data={data}
                title={title || 'chart'}
                showCSV={canExportCSV}
              />
              <button className="chart-close-btn" onClick={toggleExpanded} title="Close (Esc)">
                <CloseIcon />
              </button>
            </div>
          </div>
          <div className="chart-expanded-content" ref={chartRef}>
            {renderChart()}
          </div>
          {symbol && (
            <div className="chart-expanded-footer">
              <button className="chart-symbol-link" onClick={() => handleSymbolClick(symbol)}>
                View {symbol} details →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render chart type toggle for price charts with OHLC data
  const renderChartTypeToggle = () => {
    if (!isPriceChart || !hasOHLCData) return null;

    return (
      <div className="chart-type-toggle">
        <button
          className={`chart-type-btn ${effectiveDisplayMode === 'area' || effectiveDisplayMode === 'line' ? 'active' : ''}`}
          onClick={() => setDisplayMode('area')}
          title="Area chart"
        >
          <AreaChartIcon />
        </button>
        <button
          className={`chart-type-btn ${effectiveDisplayMode === 'candlestick' ? 'active' : ''}`}
          onClick={() => setDisplayMode('candlestick')}
          title="Candlestick chart"
        >
          <CandlestickIcon />
        </button>
      </div>
    );
  };

  return (
    <div className="chart-renderer" ref={chartRef}>
      <div className="chart-header">
        {title && <div className="chart-title">{title}</div>}
        <div className="chart-header-actions">
          {renderChartTypeToggle()}
          <button className="chart-expand-btn" onClick={toggleExpanded} title="Expand chart">
            <ExpandIcon />
          </button>
          <ExportControls
            containerRef={chartRef}
            data={data}
            title={title || 'chart'}
            showCSV={canExportCSV}
          />
        </div>
      </div>
      <div className="chart-content">
        {renderChart()}
      </div>
      {symbol && (
        <button className="chart-symbol-link-inline" onClick={() => handleSymbolClick(symbol)}>
          View {symbol} →
        </button>
      )}
    </div>
  );
}

/**
 * Area/Line chart using MiniChart (lightweight-charts)
 */
function AreaLineChart({ data, width, height, color, interactive = false }) {
  // Transform data if needed
  const chartData = data.map(d => ({
    time: d.time || d.date || d.x,
    value: d.value ?? d.close ?? d.y
  }));

  return (
    <div className="chart-area-container">
      <MiniChart
        data={chartData}
        width={width}
        height={height}
        color={color || COLORS.primary}
        showYAxis={true}
        showTimeLabels={true}
        interactive={interactive}
      />
    </div>
  );
}

/**
 * Vertical bar chart using Recharts with click support
 */
function BarChartRenderer({ data, width, height, title, onBarClick }) {
  // Transform data for Recharts, preserving original data for clicks
  const chartData = data.map(d => ({
    name: d.name || d.label || d.symbol,
    value: d.value ?? d.y,
    fill: d.color || COLORS.primary,
    symbol: d.symbol,
    original: d
  }));

  const handleBarClick = (data, index) => {
    if (onBarClick && data?.original) {
      onBarClick(data.original);
    }
  };

  return (
    <div className="chart-bar-container">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border-color)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatValue}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            onClick={handleBarClick}
            cursor={onBarClick ? 'pointer' : 'default'}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill || COLORS.palette[index % COLORS.palette.length]}
                className="chart-bar-cell"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal bar chart for rankings/scores with click support
 */
function HorizontalBarChart({ data, width, height, onItemClick }) {
  const chartData = data.slice(0, 8).map(d => ({
    name: d.name || d.label || d.symbol,
    value: d.value ?? d.score ?? d.y,
    symbol: d.symbol,
    original: d
  }));

  const maxValue = Math.max(...chartData.map(d => d.value));

  const handleItemClick = (item) => {
    if (onItemClick && item.original) {
      onItemClick(item.original);
    }
  };

  return (
    <div className="chart-hbar-container">
      {chartData.map((item, i) => (
        <div
          key={i}
          className={`hbar-item ${onItemClick ? 'hbar-item-clickable' : ''}`}
          onClick={() => handleItemClick(item)}
        >
          <div className="hbar-label">{item.name}</div>
          <div className="hbar-bar-wrapper">
            <div
              className="hbar-bar"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.palette[1]})`
              }}
            />
            <span className="hbar-value">{formatValue(item.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pie/Donut chart for distributions with click support
 */
function PieChartRenderer({ data, width, height, isDonut, onSliceClick }) {
  const chartData = data.map((d, i) => ({
    name: d.name || d.label,
    value: d.value ?? d.y,
    color: d.color || COLORS.palette[i % COLORS.palette.length],
    symbol: d.symbol,
    original: d
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const handleSliceClick = (data) => {
    if (onSliceClick && data?.original) {
      onSliceClick(data.original);
    }
  };

  return (
    <div className="chart-pie-container">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={isDonut ? 35 : 0}
            outerRadius={55}
            paddingAngle={2}
            dataKey="value"
            onClick={handleSliceClick}
            cursor={onSliceClick ? 'pointer' : 'default'}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" className="chart-pie-cell" />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pie-legend">
        {chartData.map((entry, i) => (
          <div
            key={i}
            className={`pie-legend-item ${onSliceClick ? 'pie-legend-item-clickable' : ''}`}
            onClick={() => onSliceClick && handleSliceClick(entry)}
          >
            <span className="pie-legend-color" style={{ background: entry.color }} />
            <span className="pie-legend-label">{entry.name}</span>
            <span className="pie-legend-value">{((entry.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Sentiment distribution chart (bullish/neutral/bearish)
 */
function SentimentChart({ data, title }) {
  const bullish = data.bullish ?? data.positive ?? 0;
  const bearish = data.bearish ?? data.negative ?? 0;
  const neutral = data.neutral ?? (100 - bullish - bearish);
  const total = bullish + bearish + neutral;

  return (
    <div className="chart-sentiment-container">
      <div className="sentiment-bar">
        {bullish > 0 && (
          <div
            className="sentiment-segment bullish"
            style={{ width: `${(bullish / total) * 100}%` }}
            title={`Bullish: ${bullish.toFixed(0)}%`}
          />
        )}
        {neutral > 0 && (
          <div
            className="sentiment-segment neutral"
            style={{ width: `${(neutral / total) * 100}%` }}
            title={`Neutral: ${neutral.toFixed(0)}%`}
          />
        )}
        {bearish > 0 && (
          <div
            className="sentiment-segment bearish"
            style={{ width: `${(bearish / total) * 100}%` }}
            title={`Bearish: ${bearish.toFixed(0)}%`}
          />
        )}
      </div>
      <div className="sentiment-labels">
        <span className="sentiment-label bullish">
          <span className="sentiment-dot" style={{ background: SENTIMENT_COLORS.bullish }} />
          Bullish {bullish.toFixed(0)}%
        </span>
        <span className="sentiment-label neutral">
          <span className="sentiment-dot" style={{ background: SENTIMENT_COLORS.neutral }} />
          Neutral {neutral.toFixed(0)}%
        </span>
        <span className="sentiment-label bearish">
          <span className="sentiment-dot" style={{ background: SENTIMENT_COLORS.bearish }} />
          Bearish {bearish.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Multi-series line/area chart for comparisons
 * Supports multiple data series with normalized or absolute values
 *
 * Expected chartData format:
 * {
 *   type: 'multi_line',
 *   title: 'Price Comparison',
 *   series: [
 *     { name: 'AAPL', color: '#7C3AED', data: [{ time: '2024-01-01', value: 180 }, ...] },
 *     { name: 'MSFT', color: '#059669', data: [{ time: '2024-01-01', value: 380 }, ...] },
 *   ],
 *   normalized: true,  // Optional: normalize to percentage change
 *   baseDate: '2024-01-01', // Optional: base date for normalization
 * }
 */
function MultiSeriesChart({ chartData, width, height, isArea, onSeriesClick }) {
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const { series = [], normalized = false } = chartData;

  if (!series || series.length === 0) return null;

  // Toggle series visibility
  const toggleSeries = (name) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Handle legend item double-click to navigate to symbol
  const handleLegendDoubleClick = (name) => {
    if (onSeriesClick) {
      onSeriesClick(name);
    }
  };

  // Merge all series data into unified format for Recharts
  // { time: '2024-01-01', AAPL: 180, MSFT: 380, ... }
  const mergedData = mergeSeriesData(series, normalized);

  // Custom legend with clickable items (single click = toggle, double click = navigate)
  const renderLegend = () => (
    <div className="multi-chart-legend">
      {series.map((s, idx) => {
        const color = s.color || COLORS.series[idx % COLORS.series.length];
        const isHidden = hiddenSeries.has(s.name);
        return (
          <button
            key={s.name}
            className={`legend-item ${isHidden ? 'legend-item-hidden' : ''}`}
            onClick={() => toggleSeries(s.name)}
            onDoubleClick={() => handleLegendDoubleClick(s.name)}
            title={`Click to ${isHidden ? 'show' : 'hide'}, double-click to view ${s.name}`}
          >
            <span
              className="legend-color"
              style={{ backgroundColor: isHidden ? 'transparent' : color, borderColor: color }}
            />
            <span className="legend-name">{s.name}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="multi-chart-container">
      {renderLegend()}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={mergedData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--border-color)' }}
            tickLine={false}
            tickFormatter={(val) => formatTimeLabel(val)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => normalized ? `${val.toFixed(0)}%` : formatValue(val)}
            domain={normalized ? ['auto', 'auto'] : ['auto', 'auto']}
          />
          <Tooltip content={<MultiSeriesTooltip normalized={normalized} />} />

          {series.map((s, idx) => {
            const color = s.color || COLORS.series[idx % COLORS.series.length];
            const isHidden = hiddenSeries.has(s.name);

            return (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                hide={isHidden}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      {normalized && (
        <div className="multi-chart-note">
          Values normalized to percentage change from start
        </div>
      )}
    </div>
  );
}

/**
 * Merge multiple series into unified data format
 */
function mergeSeriesData(series, normalized) {
  // Collect all unique times
  const timeSet = new Set();
  series.forEach(s => {
    (s.data || []).forEach(d => {
      const time = d.time || d.date || d.x;
      if (time) timeSet.add(time);
    });
  });

  const times = Array.from(timeSet).sort();

  // Get base values for normalization
  const baseValues = {};
  if (normalized) {
    series.forEach(s => {
      const firstPoint = (s.data || [])[0];
      if (firstPoint) {
        baseValues[s.name] = firstPoint.value ?? firstPoint.close ?? firstPoint.y ?? 1;
      }
    });
  }

  // Build merged data
  const dataByTime = {};
  times.forEach(time => {
    dataByTime[time] = { time };
  });

  series.forEach(s => {
    (s.data || []).forEach(d => {
      const time = d.time || d.date || d.x;
      const value = d.value ?? d.close ?? d.y;
      if (time && dataByTime[time] && value !== undefined) {
        if (normalized && baseValues[s.name]) {
          // Normalize to percentage change from base
          dataByTime[time][s.name] = ((value - baseValues[s.name]) / baseValues[s.name]) * 100;
        } else {
          dataByTime[time][s.name] = value;
        }
      }
    });
  });

  return Object.values(dataByTime);
}

/**
 * Format time labels for x-axis
 */
function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  // If it's just a year (e.g., "2021", "2022"), return as-is
  if (/^\d{4}$/.test(timeStr)) return timeStr;
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Custom tooltip for multi-series charts
 */
function MultiSeriesTooltip({ active, payload, label, normalized }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip multi-tooltip">
      <div className="tooltip-label">{formatTimeLabel(label)}</div>
      {payload
        .filter(p => p.value !== undefined && p.value !== null)
        .map((p, idx) => (
          <div key={idx} className="tooltip-series-row">
            <span className="tooltip-series-color" style={{ backgroundColor: p.stroke }} />
            <span className="tooltip-series-name">{p.dataKey}</span>
            <span className="tooltip-series-value">
              {normalized ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(1)}%` : formatValue(p.value)}
            </span>
          </div>
        ))}
    </div>
  );
}

/**
 * Custom tooltip for bar charts
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      <div className="tooltip-value">{formatValue(payload[0].value)}</div>
    </div>
  );
}

/**
 * Custom tooltip for pie charts
 */
function PieTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;

  const data = payload[0];
  const percent = ((data.value / total) * 100).toFixed(1);

  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{data.name}</div>
      <div className="tooltip-value">{formatValue(data.value)} ({percent}%)</div>
    </div>
  );
}

/**
 * Format values for display
 */
function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  if (Math.abs(value) < 1 && value !== 0) return value.toFixed(2);
  return value.toFixed(1);
}

export default ChartRenderer;
