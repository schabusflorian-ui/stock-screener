import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * VarianceAnalysis - Shows variance statistics for each company
 */
function VarianceAnalysis({ companies, varianceData, metricLabel, colors }) {
  const maxCoeffVar = useMemo(() => {
    return Math.max(...Object.values(varianceData).map(v => v?.coeffVar || 0));
  }, [varianceData]);

  return (
    <div className="variance-cards">
      {companies.map((symbol, idx) => {
        const data = varianceData[symbol];
        if (!data) return null;

        const barWidth = maxCoeffVar > 0 ? (data.coeffVar / maxCoeffVar) * 100 : 0;

        return (
          <div key={symbol} className="variance-card">
            <div className="variance-header">
              <span
                className="company-color"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="company-symbol">{symbol}</span>
            </div>

            <div className="variance-stats">
              <div className="stat-row">
                <span className="stat-label">Mean</span>
                <span className="stat-value">{data.mean?.toFixed(2)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Std Dev</span>
                <span className="stat-value">{data.stdDev?.toFixed(2)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Range</span>
                <span className="stat-value">
                  {data.min?.toFixed(1)} - {data.max?.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="coeff-var">
              <div className="cv-header">
                <span>Coefficient of Variation</span>
                <span className="cv-value">{data.coeffVar?.toFixed(1)}%</span>
              </div>
              <div className="cv-bar-track">
                <div
                  className="cv-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: colors[idx % colors.length]
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

VarianceAnalysis.propTypes = {
  companies: PropTypes.arrayOf(PropTypes.string).isRequired,
  varianceData: PropTypes.object.isRequired,
  metricLabel: PropTypes.string,
  colors: PropTypes.arrayOf(PropTypes.string)
};

VarianceAnalysis.defaultProps = {
  metricLabel: 'Metric',
  colors: ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444']
};

export default memo(VarianceAnalysis);
