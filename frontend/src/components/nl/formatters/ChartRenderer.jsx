/**
 * ChartRenderer - Inline chart rendering for chat responses
 *
 * Supports:
 * - area/line charts (price history, trends)
 * - bar charts (comparisons, metrics)
 * - pie/donut charts (sentiment distribution, allocation)
 */

import React from 'react';
import MiniChart from '../../MiniChart';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './ChartRenderer.css';

// Color palette for charts
const COLORS = {
  primary: '#6366f1',
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#f59e0b',
  muted: '#6b7280',
  palette: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
};

const SENTIMENT_COLORS = {
  bullish: '#22c55e',
  bearish: '#ef4444',
  neutral: '#f59e0b'
};

function ChartRenderer({ chartData, width = 300, height = 120 }) {
  if (!chartData) return null;

  const { type, data, title, color } = chartData;

  if (!data || data.length === 0) return null;

  const renderChart = () => {
    switch (type) {
      case 'area':
      case 'line':
        return (
          <AreaLineChart
            data={data}
            width={width}
            height={height}
            color={color}
            title={title}
          />
        );

      case 'bar':
        return (
          <BarChartRenderer
            data={data}
            width={width}
            height={height}
            title={title}
          />
        );

      case 'horizontal_bar':
        return (
          <HorizontalBarChart
            data={data}
            width={width}
            height={height}
            title={title}
          />
        );

      case 'pie':
      case 'donut':
        return (
          <PieChartRenderer
            data={data}
            width={width}
            height={Math.max(height, 150)}
            title={title}
            isDonut={type === 'donut'}
          />
        );

      case 'sentiment':
        return (
          <SentimentChart
            data={data}
            title={title}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="chart-renderer">
      {title && <div className="chart-title">{title}</div>}
      {renderChart()}
    </div>
  );
}

/**
 * Area/Line chart using MiniChart (lightweight-charts)
 */
function AreaLineChart({ data, width, height, color }) {
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
      />
    </div>
  );
}

/**
 * Vertical bar chart using Recharts
 */
function BarChartRenderer({ data, width, height, title }) {
  // Transform data for Recharts
  const chartData = data.map(d => ({
    name: d.name || d.label || d.symbol,
    value: d.value ?? d.y,
    fill: d.color || COLORS.primary
  }));

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
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill || COLORS.palette[index % COLORS.palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal bar chart for rankings/scores
 */
function HorizontalBarChart({ data, width, height }) {
  const chartData = data.slice(0, 8).map(d => ({
    name: d.name || d.label || d.symbol,
    value: d.value ?? d.score ?? d.y
  }));

  const maxValue = Math.max(...chartData.map(d => d.value));

  return (
    <div className="chart-hbar-container">
      {chartData.map((item, i) => (
        <div key={i} className="hbar-item">
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
 * Pie/Donut chart for distributions
 */
function PieChartRenderer({ data, width, height, isDonut }) {
  const chartData = data.map((d, i) => ({
    name: d.name || d.label,
    value: d.value ?? d.y,
    color: d.color || COLORS.palette[i % COLORS.palette.length]
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

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
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pie-legend">
        {chartData.map((entry, i) => (
          <div key={i} className="pie-legend-item">
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
