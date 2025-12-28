import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { getCorrelationColor, formatCorrelation } from './chartUtils';

/**
 * CorrelationHeatmap - Displays correlation matrix as interactive heatmap
 */
function CorrelationHeatmap({ matrix, labels, type, onCellClick }) {
  const cellSize = Math.min(60, 400 / labels.length);

  return (
    <div className="heatmap-container">
      <div className="heatmap" style={{ '--cell-size': `${cellSize}px` }}>
        {/* Column headers */}
        <div className="heatmap-row header-row">
          <div className="heatmap-cell corner"></div>
          {labels.map(label => (
            <div key={label} className="heatmap-cell header">{label}</div>
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

              return (
                <div
                  key={colLabel}
                  className={`heatmap-cell data ${isDiagonal ? 'diagonal' : ''}`}
                  style={{
                    backgroundColor: isDiagonal ? 'rgba(0, 0, 0, 0.05)' : `${color}20`,
                    color: isDiagonal ? '#9ca3af' : color,
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

      {/* Color scale legend */}
      <div className="heatmap-legend">
        {type === 'mutual_info' ? (
          <>
            <span className="legend-label">Low dependency</span>
            <div className="legend-scale mi-scale">
              <div style={{ background: '#94a3b8' }}></div>
              <div style={{ background: '#f59e0b' }}></div>
              <div style={{ background: '#eab308' }}></div>
              <div style={{ background: '#84cc16' }}></div>
              <div style={{ background: '#22c55e' }}></div>
            </div>
            <span className="legend-label">High dependency</span>
          </>
        ) : (
          <>
            <span className="legend-label">-1</span>
            <div className="legend-scale">
              <div style={{ background: '#ef4444' }}></div>
              <div style={{ background: '#f59e0b' }}></div>
              <div style={{ background: '#94a3b8' }}></div>
              <div style={{ background: '#84cc16' }}></div>
              <div style={{ background: '#22c55e' }}></div>
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
