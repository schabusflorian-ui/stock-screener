// frontend/src/components/portfolio/MonteCarloChartComponents.js
// SVG chart components for Monte Carlo simulation panel

import React from 'react';

// Fan Chart Component - SVG-based confidence band visualization
export function FanChart({ data, goal, initial, years, hoveredYear, setHoveredYear }) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 280;
  const padding = { top: 20, right: 60, bottom: 40, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find data range for scaling (based on actual data only)
  const actualDataMax = Math.max(...data.map(d => d.p95));
  const actualDataMin = Math.min(...data.map(d => d.p5));

  // Only include goal in axis if it's within 50% of actual data max
  const goalInRange = goal && goal <= actualDataMax * 1.5;
  const dataMax = goalInRange ? Math.max(actualDataMax, goal) : actualDataMax;
  const dataMin = Math.min(actualDataMin, initial || actualDataMin);

  const generateNiceTicks = (min, max, targetTicks = 5) => {
    if (max <= min) max = min + 1000;
    const range = max - min;
    const roughStep = range / (targetTicks - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;
    let niceStep;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;
    const niceMin = Math.floor(min / niceStep) * niceStep;
    const niceMax = Math.ceil(max * 1.05 / niceStep) * niceStep;
    const ticks = [];
    for (let tick = niceMin; tick <= niceMax; tick += niceStep) ticks.push(tick);
    if (ticks.length > 8) {
      const skipFactor = Math.ceil(ticks.length / 6);
      return { ticks: ticks.filter((_, i) => i % skipFactor === 0 || i === ticks.length - 1), niceMin, niceMax };
    }
    return { ticks, niceMin, niceMax };
  };

  const { ticks: yTicks, niceMin, niceMax } = generateNiceTicks(Math.max(0, dataMin * 0.95), dataMax * 1.05);
  const minValue = niceMin;
  const maxValue = niceMax;

  const xScale = (year) => padding.left + (year / years) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  const generateBandPath = (data, lowKey, highKey) => {
    const upperPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.year)} ${yScale(d[highKey])}`).join(' ');
    const lowerPath = data.slice().reverse().map((d) => `L ${xScale(d.year)} ${yScale(d[lowKey])}`).join(' ');
    return `${upperPath} ${lowerPath} Z`;
  };

  const generateLinePath = (data, key) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.year)} ${yScale(d[key])}`).join(' ');

  const formatAxisValue = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return millions >= 10 ? `$${millions.toFixed(0)}M` : `$${millions.toFixed(1)}M`;
    }
    if (value >= 1000) {
      const thousands = value / 1000;
      return thousands >= 100 ? `$${thousands.toFixed(0)}K` : `$${thousands.toFixed(0)}K`;
    }
    return `$${value.toLocaleString()}`;
  };

  const generateYearTicks = (totalYears) => {
    if (totalYears <= 10) {
      const step = totalYears <= 5 ? 1 : 2;
      return Array.from({ length: Math.floor(totalYears / step) + 1 }, (_, i) => i * step);
    }
    if (totalYears <= 20) {
      return Array.from({ length: Math.floor(totalYears / 5) + 1 }, (_, i) => i * 5);
    }
    return Array.from({ length: Math.floor(totalYears / 10) + 1 }, (_, i) => i * 10);
  };

  const xTicks = generateYearTicks(years);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="fan-chart-svg">
      <g className="grid-lines">
        {yTicks.map((tick, i) => (
          <line key={`y-${i}`} x1={padding.left} y1={yScale(tick)} x2={width - padding.right} y2={yScale(tick)} stroke="var(--border-color)" strokeDasharray="3,3" opacity="0.5" />
        ))}
      </g>
      <path d={generateBandPath(data, 'p5', 'p95')} fill="var(--info-muted)" className="band-outer" />
      <path d={generateBandPath(data, 'p25', 'p75')} fill="var(--color-ai-violet-muted, rgba(124, 58, 237, 0.25))" className="band-inner" />
      {goal > 0 && goal <= maxValue && (
        <line x1={padding.left} y1={yScale(goal)} x2={width - padding.right} y2={yScale(goal)} stroke="var(--success-color)" strokeWidth="2" strokeDasharray="8,4" className="goal-line" />
      )}
      <line x1={padding.left} y1={yScale(initial)} x2={width - padding.right} y2={yScale(initial)} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
      <path d={generateLinePath(data, 'p50')} fill="none" stroke="var(--accent-primary)" strokeWidth="3" className="median-line" />
      <g className="y-axis">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="var(--border-color)" />
        {yTicks.map((tick, i) => (
          <g key={`y-tick-${i}`}>
            <text x={padding.left - 10} y={yScale(tick)} textAnchor="end" alignmentBaseline="middle" fontSize="11" fill="var(--text-tertiary)">{formatAxisValue(tick)}</text>
          </g>
        ))}
      </g>
      <g className="x-axis">
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="var(--border-color)" />
        {xTicks.map((tick, i) => (
          <text key={`x-tick-${i}`} x={xScale(tick)} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">Year {tick}</text>
        ))}
      </g>
      {data.map((d, i) => (
        <rect key={`hover-${i}`} x={xScale(d.year) - chartWidth / data.length / 2} y={padding.top} width={chartWidth / data.length} height={chartHeight} fill="transparent" onMouseEnter={() => setHoveredYear(i)} onMouseLeave={() => setHoveredYear(null)} style={{ cursor: 'crosshair' }} />
      ))}
      {hoveredYear !== null && data[hoveredYear] && (
        <g className="hover-indicator">
          <line x1={xScale(data[hoveredYear].year)} y1={padding.top} x2={xScale(data[hoveredYear].year)} y2={height - padding.bottom} stroke="var(--text-primary)" strokeWidth="1" strokeDasharray="4,2" opacity="0.6" />
          <circle cx={xScale(data[hoveredYear].year)} cy={yScale(data[hoveredYear].p50)} r="5" fill="var(--accent-primary)" stroke="white" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

// Distribution Chart Component - Visual bell curve representation
export function DistributionChart({ p5, p25, p50, p75, p95, mean }) {
  const width = 500;
  const height = 100;
  const padding = 20;
  const minVal = p5 * 0.9;
  const maxVal = p95 * 1.1;
  const range = maxVal - minVal;
  const getX = (val) => padding + ((val - minVal) / range) * (width - 2 * padding);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="distribution-svg">
      <rect x={getX(p5)} y={height / 2 - 4} width={getX(p95) - getX(p5)} height={8} rx={4} fill="var(--bg-tertiary)" />
      <rect x={getX(p25)} y={height / 2 - 12} width={getX(p75) - getX(p25)} height={24} rx={4} fill="var(--info-muted)" />
      <g>
        <line x1={getX(p5)} y1={height / 2 - 20} x2={getX(p5)} y2={height / 2 + 20} stroke="var(--danger-color)" strokeWidth="2" />
        <text x={getX(p5)} y={height / 2 + 35} textAnchor="middle" fontSize="10" fill="var(--danger-color)">5th</text>
        <line x1={getX(p25)} y1={height / 2 - 16} x2={getX(p25)} y2={height / 2 + 16} stroke="var(--warning-color)" strokeWidth="2" />
        <line x1={getX(p50)} y1={height / 2 - 24} x2={getX(p50)} y2={height / 2 + 24} stroke="var(--accent-primary)" strokeWidth="3" />
        <circle cx={getX(p50)} cy={height / 2} r="6" fill="var(--accent-primary)" />
        <text x={getX(p50)} y={15} textAnchor="middle" fontSize="11" fill="var(--accent-primary)" fontWeight="600">Median</text>
        <line x1={getX(p75)} y1={height / 2 - 16} x2={getX(p75)} y2={height / 2 + 16} stroke="var(--success-color)" strokeWidth="2" />
        <line x1={getX(p95)} y1={height / 2 - 20} x2={getX(p95)} y2={height / 2 + 20} stroke="var(--success-color)" strokeWidth="2" />
        <text x={getX(p95)} y={height / 2 + 35} textAnchor="middle" fontSize="10" fill="var(--success-color)">95th</text>
      </g>
      {mean && (
        <g>
          <polygon points={`${getX(mean)},${height / 2 - 28} ${getX(mean) - 5},${height / 2 - 36} ${getX(mean) + 5},${height / 2 - 36}`} fill="var(--text-secondary)" />
          <text x={getX(mean)} y={height / 2 - 42} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">Mean</text>
        </g>
      )}
    </svg>
  );
}
