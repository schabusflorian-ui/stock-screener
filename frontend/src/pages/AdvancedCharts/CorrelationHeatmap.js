import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { getCorrelationColor, formatCorrelation } from './chartUtils';

/**
 * CorrelationHeatmap - Displays correlation matrix as interactive heatmap
 */
function CorrelationHeatmap({ matrix, labels, type, onCellClick }) {
  // Calculate cell size based on number of labels, with min 56px and max 80px
  const cellSize = Math.max(56, Math.min(80, 480 / labels.length));

  // Get correlation strength class for styling
  const getCorrelationClass = (value, corrType) => {
    if (value === null || value === undefined || isNaN(value)) return 'neutral';

    if (corrType === 'mutual_info') {
      if (value >= 0.7) return 'strong-positive';
      if (value >= 0.4) return 'moderate-positive';
      return 'weak';
    }

    // Pearson/Spearman: -1 to +1
    if (value >= 0.7) return 'strong-positive';
    if (value >= 0.3) return 'moderate-positive';
    if (value <= -0.7) return 'strong-negative';
    if (value <= -0.3) return 'moderate-negative';
    return 'weak';
  };

  return (
    <div className="heatmap-container">
      <div className="heatmap" style={{ '--cell-size': `${cellSize}px` }}>
        {/* Column headers */}
        <div className="heatmap-row header-row">
          <div className="heatmap-cell corner"></div>
          {labels.map(label => (
            <div key={label} className="heatmap-cell col-header">{label}</div>
          ))}
        </div>

        {/* Data rows */}
        {labels.map((rowLabel, i) => (
          <div key={rowLabel} className="heatmap-row">
            <div className="heatmap-cell row-header">{rowLabel}</div>
            {labels.map((colLabel, j) => {
              const value = matrix[rowLabel]?.[colLabel];
              const color = getCorrelationColor(value, type);
              const isDiagonal = i === j;
              const strengthClass = getCorrelationClass(value, type);

              return (
                <div
                  key={colLabel}
                  className={`heatmap-cell data ${isDiagonal ? 'diagonal' : ''} correlation-${strengthClass}`}
                  style={{
                    '--cell-color': color,
                    cursor: !isDiagonal ? 'pointer' : 'default'
                  }}
                  onClick={() => !isDiagonal && onCellClick && onCellClick(rowLabel, colLabel)}
                  title={`${rowLabel} vs ${colLabel}: ${formatCorrelation(value, type)}`}
                >
                  {formatCorrelation(value, type)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Color scale legend (Prism Design System) */}
      <div className="heatmap-legend">
        {type === 'mutual_info' ? (
          <>
            <span className="legend-label">Low dependency</span>
            <div className="legend-scale mi-scale">
              <div style={{ background: '#94A3B8' }}></div>
              <div style={{ background: '#D97706' }}></div>
              <div style={{ background: '#D97706' }}></div>
              <div style={{ background: '#059669' }}></div>
              <div style={{ background: '#059669' }}></div>
            </div>
            <span className="legend-label">High dependency</span>
          </>
        ) : (
          <>
            <span className="legend-label">-1</span>
            <div className="legend-scale">
              <div style={{ background: '#DC2626' }}></div>
              <div style={{ background: '#D97706' }}></div>
              <div style={{ background: '#94A3B8' }}></div>
              <div style={{ background: '#059669' }}></div>
              <div style={{ background: '#059669' }}></div>
            </div>
            <span className="legend-label">+1</span>
          </>
        )}
      </div>
    </div>
  );
}

CorrelationHeatmap.propTypes = {
  matrix: PropTypes.object.isRequired,
  labels: PropTypes.arrayOf(PropTypes.string).isRequired,
  type: PropTypes.oneOf(['pearson', 'spearman', 'mutual_info']),
  onCellClick: PropTypes.func
};

CorrelationHeatmap.defaultProps = {
  type: 'pearson',
  onCellClick: null
};

export default memo(CorrelationHeatmap);
