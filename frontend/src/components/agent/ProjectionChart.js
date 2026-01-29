// frontend/src/components/agent/ProjectionChart.js
// Portfolio projection chart for beginner strategy agents

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Info,
  DollarSign,
  Calendar,
  Target
} from '../icons';
import { agentsAPI } from '../../services/api';
import { useAskAI, createChartExtractor } from '../../hooks';
import Card from '../ui/Card';
import Button from '../ui/Button';
import './ProjectionChart.css';

const YEARS_OPTIONS = [1, 3, 5, 10, 20];
const RETURN_SCENARIOS = {
  conservative: { rate: 0.05, label: 'Conservative (5%)' },
  moderate: { rate: 0.08, label: 'Moderate (8%)' },
  optimistic: { rate: 0.10, label: 'Optimistic (10%)' }
};

function ProjectionChart({ agentId, config, initialValue = 0 }) {
  const [years, setYears] = useState(10);
  const [scenario, setScenario] = useState('moderate');
  const [loading, setLoading] = useState(false);
  const [projection, setProjection] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const strategyType = config?.strategy_type;

  // Calculate projection locally based on strategy config
  const localProjection = useMemo(() => {
    if (!config) return null;

    const returnRate = RETURN_SCENARIOS[scenario].rate;
    let annualContribution = 0;

    switch (strategyType) {
      case 'dca': {
        const frequency = config.frequency || 'monthly';
        const amount = config.amount || 0;
        const frequencyMultiplier = {
          daily: 252, // Trading days
          weekly: 52,
          biweekly: 26,
          monthly: 12,
          quarterly: 4
        };
        annualContribution = amount * (frequencyMultiplier[frequency] || 12);
        break;
      }
      case 'value_averaging': {
        // Use min/max contribution average
        const minC = config.min_contribution || 100;
        const maxC = config.max_contribution || 2000;
        const avgC = (minC + maxC) / 2;
        const freq = config.review_frequency === 'quarterly' ? 4 : 12;
        annualContribution = avgC * freq;
        break;
      }
      case 'lump_dca': {
        // Initial lump sum + DCA period
        const totalAmount = config.total_amount || 0;
        const lumpPct = config.lump_sum_pct || 0.5;
        const dcaMonths = config.dca_months || 6;
        // After DCA period, assume no more contributions
        annualContribution = 0;
        break;
      }
      default:
        annualContribution = 0;
    }

    // Generate projection data points
    const dataPoints = [];
    let currentValue = initialValue;

    for (let year = 0; year <= years; year++) {
      dataPoints.push({
        year,
        value: currentValue,
        contributed: initialValue + (annualContribution * year)
      });

      // Apply returns and add contribution
      if (year < years) {
        currentValue = currentValue * (1 + returnRate) + annualContribution;
      }
    }

    // Handle lump_dca special case
    if (strategyType === 'lump_dca' && config.total_amount) {
      const totalAmount = config.total_amount;
      dataPoints[0] = {
        year: 0,
        value: initialValue + totalAmount,
        contributed: initialValue + totalAmount
      };
      // Recalculate from there
      currentValue = initialValue + totalAmount;
      for (let year = 1; year <= years; year++) {
        currentValue = currentValue * (1 + returnRate);
        dataPoints[year] = {
          year,
          value: currentValue,
          contributed: initialValue + totalAmount
        };
      }
    }

    return {
      dataPoints,
      finalValue: dataPoints[dataPoints.length - 1].value,
      totalContributed: dataPoints[dataPoints.length - 1].contributed,
      totalGrowth: dataPoints[dataPoints.length - 1].value - dataPoints[dataPoints.length - 1].contributed
    };
  }, [config, strategyType, initialValue, years, scenario]);

  const formatCurrency = (value) => {
    if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    }
    if (value >= 1e3) {
      return `$${(value / 1e3).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatFullCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // SVG Chart dimensions
  const chartWidth = 600;
  const chartHeight = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const maxValue = localProjection ? Math.max(...localProjection.dataPoints.map(d => d.value)) * 1.1 : 100000;
  const xScale = (year) => padding.left + (year / years) * innerWidth;
  const yScale = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  // Generate path
  const generatePath = (dataPoints, accessor) => {
    return dataPoints.map((point, i) => {
      const x = xScale(point.year);
      const y = yScale(accessor(point));
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  // Generate area path
  const generateArea = (dataPoints, accessor) => {
    const path = generatePath(dataPoints, accessor);
    const lastX = xScale(years);
    const firstX = xScale(0);
    const bottomY = yScale(0);
    return `${path} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    value: t * maxValue,
    y: yScale(t * maxValue)
  }));

  // X-axis ticks
  const xTicks = [];
  const tickInterval = years <= 5 ? 1 : years <= 10 ? 2 : 5;
  for (let i = 0; i <= years; i += tickInterval) {
    xTicks.push({ year: i, x: xScale(i) });
  }

  // Ask AI right-click support - must be called before any early returns
  const askAIProps = useAskAI(createChartExtractor(() => ({
    metric: 'portfolio_projection',
    value: projection?.finalValue,
    companyName: 'Portfolio Projection'
  })));

  if (!localProjection) {
    return (
      <Card variant="glass" className="projection-chart">
        <Card.Header>
          <TrendingUp size={18} />
          <h3>Portfolio Projection</h3>
        </Card.Header>
        <Card.Content>
          <div className="projection-chart__empty">
            <Info size={32} />
            <p>Unable to generate projection</p>
          </div>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="projection-chart" {...askAIProps}>
      <Card.Header>
        <TrendingUp size={18} />
        <h3>Portfolio Projection</h3>
      </Card.Header>
      <Card.Content>
        {/* Controls */}
        <div className="projection-chart__controls">
          <div className="projection-chart__control">
            <label>Time Horizon</label>
            <div className="projection-chart__buttons">
              {YEARS_OPTIONS.map(y => (
                <button
                  key={y}
                  className={`projection-chart__btn ${years === y ? 'active' : ''}`}
                  onClick={() => setYears(y)}
                >
                  {y}yr
                </button>
              ))}
            </div>
          </div>

          <div className="projection-chart__control">
            <label>Return Scenario</label>
            <div className="projection-chart__buttons">
              {Object.entries(RETURN_SCENARIOS).map(([key, { label }]) => (
                <button
                  key={key}
                  className={`projection-chart__btn ${scenario === key ? 'active' : ''}`}
                  onClick={() => setScenario(key)}
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="projection-chart__container">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="projection-chart__svg"
          >
            {/* Grid lines */}
            <g className="projection-chart__grid">
              {yTicks.map((tick, i) => (
                <line
                  key={i}
                  x1={padding.left}
                  y1={tick.y}
                  x2={chartWidth - padding.right}
                  y2={tick.y}
                  stroke="var(--border-secondary)"
                  strokeDasharray="4,4"
                />
              ))}
            </g>

            {/* Contributed area (base) - FT-style 0.15 opacity */}
            <path
              d={generateArea(localProjection.dataPoints, d => d.contributed)}
              fill="rgba(124, 58, 237, 0.15)"
              className="projection-chart__area-contributed"
            />

            {/* Portfolio value area (growth on top) - FT-style 0.15 opacity */}
            <path
              d={generateArea(localProjection.dataPoints, d => d.value)}
              fill="rgba(5, 150, 105, 0.15)"
              className="projection-chart__area-value"
            />

            {/* Contributed line */}
            <path
              d={generatePath(localProjection.dataPoints, d => d.contributed)}
              fill="none"
              stroke="#7C3AED"
              strokeWidth="2"
              strokeDasharray="6,4"
              className="projection-chart__line-contributed"
            />

            {/* Portfolio value line */}
            <path
              d={generatePath(localProjection.dataPoints, d => d.value)}
              fill="none"
              stroke="#059669"
              strokeWidth="3"
              className="projection-chart__line-value"
            />

            {/* Data points */}
            {localProjection.dataPoints.map((point, i) => (
              <g key={i}>
                <circle
                  cx={xScale(point.year)}
                  cy={yScale(point.value)}
                  r={hoveredPoint === i ? 6 : 4}
                  fill="#059669"
                  stroke="var(--bg-primary)"
                  strokeWidth="2"
                  className="projection-chart__point"
                  onMouseEnter={() => setHoveredPoint(i)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            ))}

            {/* Y-axis labels */}
            {yTicks.map((tick, i) => (
              <text
                key={i}
                x={padding.left - 10}
                y={tick.y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="projection-chart__axis-label"
                fill="var(--text-tertiary)"
                fontSize="11"
              >
                {formatCurrency(tick.value)}
              </text>
            ))}

            {/* X-axis labels */}
            {xTicks.map((tick, i) => (
              <text
                key={i}
                x={tick.x}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                className="projection-chart__axis-label"
                fill="var(--text-tertiary)"
                fontSize="11"
              >
                Year {tick.year}
              </text>
            ))}

            {/* Hover tooltip */}
            {hoveredPoint !== null && (
              <g>
                <rect
                  x={xScale(localProjection.dataPoints[hoveredPoint].year) - 60}
                  y={yScale(localProjection.dataPoints[hoveredPoint].value) - 50}
                  width="120"
                  height="40"
                  fill="var(--bg-elevated)"
                  stroke="var(--border-primary)"
                  rx="4"
                />
                <text
                  x={xScale(localProjection.dataPoints[hoveredPoint].year)}
                  y={yScale(localProjection.dataPoints[hoveredPoint].value) - 35}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="12"
                  fontWeight="600"
                >
                  {formatFullCurrency(localProjection.dataPoints[hoveredPoint].value)}
                </text>
                <text
                  x={xScale(localProjection.dataPoints[hoveredPoint].year)}
                  y={yScale(localProjection.dataPoints[hoveredPoint].value) - 20}
                  textAnchor="middle"
                  fill="var(--text-tertiary)"
                  fontSize="10"
                >
                  Year {localProjection.dataPoints[hoveredPoint].year}
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="projection-chart__legend">
          <div className="projection-chart__legend-item">
            <span className="projection-chart__legend-color" style={{ backgroundColor: '#059669' }} />
            <span>Portfolio Value</span>
          </div>
          <div className="projection-chart__legend-item">
            <span className="projection-chart__legend-color" style={{ backgroundColor: '#7C3AED' }} />
            <span>Total Contributed</span>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="projection-chart__summary">
          <div className="projection-chart__summary-item">
            <Target size={16} />
            <div className="projection-chart__summary-content">
              <span className="projection-chart__summary-label">Projected Value</span>
              <span className="projection-chart__summary-value highlight">
                {formatFullCurrency(localProjection.finalValue)}
              </span>
            </div>
          </div>
          <div className="projection-chart__summary-item">
            <DollarSign size={16} />
            <div className="projection-chart__summary-content">
              <span className="projection-chart__summary-label">Total Contributed</span>
              <span className="projection-chart__summary-value">
                {formatFullCurrency(localProjection.totalContributed)}
              </span>
            </div>
          </div>
          <div className="projection-chart__summary-item">
            <TrendingUp size={16} />
            <div className="projection-chart__summary-content">
              <span className="projection-chart__summary-label">Investment Growth</span>
              <span className="projection-chart__summary-value positive">
                +{formatFullCurrency(localProjection.totalGrowth)}
              </span>
            </div>
          </div>
        </div>

        <div className="projection-chart__disclaimer">
          <Info size={14} />
          <span>
            Projections are estimates based on assumed {RETURN_SCENARIOS[scenario].label.toLowerCase()} returns.
            Actual results will vary. Past performance does not guarantee future results.
          </span>
        </div>
      </Card.Content>
    </Card>
  );
}

export default ProjectionChart;
