// frontend/src/components/SectorAlphaHeatmap.js
// Heatmap visualization showing sector alpha vs benchmark

import React, { useMemo } from 'react';
import './SectorAlphaHeatmap.css';

const PERIOD_OPTIONS = [
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' }
];

function SectorAlphaHeatmap({
  sectorData = [],
  benchmarkReturns = {},
  period = '1m',
  onPeriodChange,
  height = 400
}) {
  // Calculate alpha for each sector
  const alphaData = useMemo(() => {
    const benchmarkReturn = benchmarkReturns[period] || 0;

    return sectorData
      .map(sector => {
        const sectorReturn = sector[`change_${period}`] || sector.avg_return || 0;
        const alpha = sectorReturn - benchmarkReturn;

        return {
          name: sector.sector || sector.name,
          return: sectorReturn,
          benchmarkReturn,
          alpha,
          marketCap: sector.total_market_cap_b || sector.market_cap || 0,
          companyCount: sector.company_count || 0
        };
      })
      .sort((a, b) => b.alpha - a.alpha);
  }, [sectorData, benchmarkReturns, period]);

  // Calculate color intensity based on alpha value
  const getAlphaColor = (alpha) => {
    const maxAlpha = 15; // Normalize to +/- 15%
    const intensity = Math.min(Math.abs(alpha) / maxAlpha, 1);

    if (alpha >= 0) {
      // Purple gradient for outperformance
      const r = Math.round(139 - (intensity * 50));
      const g = Math.round(92 - (intensity * 40));
      const b = Math.round(246);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Orange gradient for underperformance
      const r = Math.round(249);
      const g = Math.round(115 - (intensity * 50));
      const b = Math.round(22);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Get text color based on background intensity
  const getTextColor = (alpha) => {
    const intensity = Math.min(Math.abs(alpha) / 15, 1);
    return intensity > 0.5 ? 'white' : 'var(--text-primary)';
  };

  if (!sectorData.length) {
    return (
      <div className="sector-alpha-heatmap empty">
        <p>No sector data available</p>
      </div>
    );
  }

  return (
    <div className="sector-alpha-heatmap">
      <div className="heatmap-header">
        <div className="heatmap-title">
          <h3>Sector Alpha vs S&P 500</h3>
          <span className="heatmap-subtitle">
            Benchmark return: {benchmarkReturns[period]?.toFixed(2) || 0}%
          </span>
        </div>
        {onPeriodChange && (
          <div className="period-selector">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`period-btn ${period === opt.value ? 'active' : ''}`}
                onClick={() => onPeriodChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="heatmap-container" style={{ minHeight: height }}>
        <div className="heatmap-grid">
          {alphaData.map(sector => (
            <div
              key={sector.name}
              className="heatmap-cell"
              style={{
                backgroundColor: getAlphaColor(sector.alpha),
                color: getTextColor(sector.alpha),
                // Size based on market cap (optional - can be uniform)
                flex: `1 1 ${Math.max(100 / Math.min(alphaData.length, 6), 10)}%`
              }}
            >
              <div className="cell-name">{sector.name}</div>
              <div className="cell-alpha">
                {sector.alpha >= 0 ? '+' : ''}{sector.alpha.toFixed(1)}%
              </div>
              <div className="cell-details">
                <span className="cell-return">
                  Return: {sector.return >= 0 ? '+' : ''}{sector.return.toFixed(1)}%
                </span>
                <span className="cell-companies">
                  {sector.companyCount} companies
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <div className="legend-item underperform">
          <div className="legend-color" style={{ background: 'linear-gradient(to right, #f97316, #fdba74)' }}></div>
          <span>Underperform</span>
        </div>
        <div className="legend-neutral">
          <span>0%</span>
        </div>
        <div className="legend-item outperform">
          <div className="legend-color" style={{ background: 'linear-gradient(to right, #c4b5fd, #8b5cf6)' }}></div>
          <span>Outperform</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="heatmap-summary">
        <div className="summary-item">
          <span className="summary-label">Best Alpha</span>
          <span className="summary-value outperform">
            {alphaData[0]?.name}: +{alphaData[0]?.alpha?.toFixed(1)}%
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Worst Alpha</span>
          <span className="summary-value underperform">
            {alphaData[alphaData.length - 1]?.name}: {alphaData[alphaData.length - 1]?.alpha?.toFixed(1)}%
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Outperforming</span>
          <span className="summary-value">
            {alphaData.filter(s => s.alpha > 0).length} of {alphaData.length} sectors
          </span>
        </div>
      </div>
    </div>
  );
}

export default SectorAlphaHeatmap;
