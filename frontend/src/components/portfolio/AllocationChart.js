// frontend/src/components/portfolio/AllocationChart.js
// Pie chart showing portfolio allocation by sector, position, or market cap

import React, { useState, useMemo } from 'react';
import './AllocationChart.css';

const SECTOR_COLORS = {
  'Technology': '#3b82f6',
  'Healthcare': '#22c55e',
  'Financial Services': '#f59e0b',
  'Consumer Cyclical': '#ec4899',
  'Communication Services': '#8b5cf6',
  'Industrials': '#64748b',
  'Consumer Defensive': '#14b8a6',
  'Energy': '#ef4444',
  'Utilities': '#6366f1',
  'Real Estate': '#84cc16',
  'Basic Materials': '#f97316',
  'Cash': '#94a3b8',
  'Other': '#71717a'
};

const MARKET_CAP_COLORS = {
  'Large Cap (>$10B)': '#3b82f6',
  'Mid Cap ($2B-$10B)': '#22c55e',
  'Small Cap (<$2B)': '#f59e0b',
  'Cash': '#94a3b8'
};

const DEFAULT_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6',
  '#64748b', '#14b8a6', '#ef4444', '#6366f1', '#84cc16',
  '#f97316', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9'
];

function AllocationChart({
  allocation = null,
  holdings = [],
  totalValue = 0,
  showLegend = true,
  size = 220
}) {
  const [viewType, setViewType] = useState('sector'); // 'sector', 'position', 'marketCap'

  const allocationData = useMemo(() => {
    // Prefer pre-computed allocation data from API
    if (allocation) {
      const data = [];

      if (viewType === 'sector') {
        // Add sectors
        (allocation.bySector || []).forEach((sector, i) => {
          data.push({
            name: sector.name,
            value: sector.marketValue,
            weight: sector.weight,
            count: sector.positionCount,
            color: SECTOR_COLORS[sector.name] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
          });
        });
        // Add cash if present
        if (allocation.cashWeight > 0) {
          data.push({
            name: 'Cash',
            value: allocation.cashBalance,
            weight: allocation.cashWeight,
            count: 0,
            color: SECTOR_COLORS['Cash']
          });
        }
      } else if (viewType === 'position') {
        // Show by individual positions
        (allocation.byPosition || []).forEach((pos, i) => {
          data.push({
            name: pos.symbol,
            fullName: pos.name,
            value: pos.marketValue,
            weight: pos.weight,
            shares: pos.shares,
            pnl: pos.unrealizedPnL,
            pnlPct: pos.unrealizedPnLPct,
            color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]
          });
        });
        // Add cash if present
        if (allocation.cashWeight > 0) {
          data.push({
            name: 'Cash',
            fullName: 'Cash Balance',
            value: allocation.cashBalance,
            weight: allocation.cashWeight,
            color: SECTOR_COLORS['Cash']
          });
        }
      } else if (viewType === 'marketCap') {
        // Show by market cap
        (allocation.byMarketCap || []).forEach((cap, i) => {
          data.push({
            name: cap.name,
            value: cap.marketValue,
            weight: cap.weight,
            count: cap.positionCount,
            color: MARKET_CAP_COLORS[cap.name] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
          });
        });
        // Add cash if present
        if (allocation.cashWeight > 0) {
          data.push({
            name: 'Cash',
            value: allocation.cashBalance,
            weight: allocation.cashWeight,
            count: 0,
            color: MARKET_CAP_COLORS['Cash']
          });
        }
      }

      return data.sort((a, b) => b.value - a.value);
    }

    // Fallback to calculating from holdings if no allocation data
    if (!holdings || holdings.length === 0) return [];

    if (viewType === 'sector') {
      const sectorMap = {};
      holdings.forEach(holding => {
        const sector = holding.sector || 'Other';
        if (!sectorMap[sector]) {
          sectorMap[sector] = { name: sector, value: 0, count: 0 };
        }
        sectorMap[sector].value += holding.marketValue || holding.market_value || 0;
        sectorMap[sector].count += 1;
      });

      return Object.values(sectorMap)
        .sort((a, b) => b.value - a.value)
        .map((item, i) => ({
          ...item,
          weight: totalValue ? (item.value / totalValue) * 100 : 0,
          color: SECTOR_COLORS[item.name] || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
        }));
    } else {
      return holdings
        .filter(h => h.marketValue || h.market_value)
        .sort((a, b) => (b.marketValue || b.market_value) - (a.marketValue || a.market_value))
        .slice(0, 10)
        .map((holding, i) => ({
          name: holding.symbol,
          value: holding.marketValue || holding.market_value,
          weight: totalValue ? ((holding.marketValue || holding.market_value) / totalValue) * 100 : 0,
          count: 1,
          color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]
        }));
    }
  }, [allocation, holdings, totalValue, viewType]);

  const pieSlices = useMemo(() => {
    const total = allocationData.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return [];

    let currentAngle = -90; // Start from top

    return allocationData.map(item => {
      const percentage = item.weight || (item.value / total) * 100;
      const angle = (percentage / 100) * 360;

      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Calculate SVG arc path
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const radius = size / 2 - 10;
      const centerX = size / 2;
      const centerY = size / 2;

      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = percentage >= 99.5
        ? `M ${centerX} ${centerY - radius} A ${radius} ${radius} 0 1 1 ${centerX - 0.001} ${centerY - radius} Z`
        : `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      return {
        ...item,
        percentage,
        pathData
      };
    });
  }, [allocationData, size]);

  const formatValue = (value) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const hasData = allocation || (holdings && holdings.length > 0);
  const isEmpty = !hasData || pieSlices.length === 0;

  if (isEmpty) {
    return (
      <div className="allocation-chart empty">
        <div className="empty-chart">
          <svg viewBox="0 0 100 100" width={size} height={size}>
            <circle cx="50" cy="50" r="40" fill="var(--bg-tertiary)" />
            <circle cx="50" cy="50" r="25" fill="var(--bg-primary)" />
          </svg>
          <div className="empty-message">
            <h4>No Holdings Yet</h4>
            <p>Add stocks to your portfolio to see allocation breakdown by sector, market cap, and individual positions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="allocation-chart-container">
      {/* View Type Toggle */}
      <div className="chart-view-toggle">
        <button
          className={viewType === 'sector' ? 'active' : ''}
          onClick={() => setViewType('sector')}
        >
          By Sector
        </button>
        <button
          className={viewType === 'position' ? 'active' : ''}
          onClick={() => setViewType('position')}
        >
          By Position
        </button>
        <button
          className={viewType === 'marketCap' ? 'active' : ''}
          onClick={() => setViewType('marketCap')}
        >
          By Market Cap
        </button>
      </div>

      <div className="allocation-chart horizontal">
        <div className="chart-container">
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
            {pieSlices.map((slice) => (
              <path
                key={slice.name}
                d={slice.pathData}
                fill={slice.color}
                stroke="var(--bg-primary)"
                strokeWidth="2"
                className="pie-slice"
              >
                <title>{slice.name}: {slice.percentage.toFixed(1)}%</title>
              </path>
            ))}
            {/* Center hole for donut effect */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={size / 4}
              fill="var(--bg-primary)"
            />
          </svg>

          {allocation && (
            <div className="chart-center-label">
              <span className="center-value">{allocation.positionCount || 0}</span>
              <span className="center-label">Positions</span>
            </div>
          )}
        </div>

        {showLegend && (
          <div className="chart-legend">
            {pieSlices.map((item) => (
              <div key={item.name} className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: item.color }}
                />
                <span className="legend-name" title={item.fullName || item.name}>
                  {item.name}
                </span>
                <span className="legend-value">
                  {item.percentage.toFixed(1)}%
                </span>
                <span className="legend-amount">
                  {formatValue(item.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Concentration Warning */}
      {allocation?.concentration?.isConcentrated && (
        <div className="concentration-warning">
          <span className="warning-icon">⚠️</span>
          <span>Portfolio is concentrated - top 5 positions represent {allocation.concentration.top5Weight.toFixed(1)}% of holdings</span>
        </div>
      )}
    </div>
  );
}

export default AllocationChart;
