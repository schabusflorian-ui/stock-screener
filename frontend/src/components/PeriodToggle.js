import React, { useState } from 'react';
import './PeriodToggle.css';

function PeriodToggle({ value, onChange, availablePeriods = [], dataSource = 'sec' }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const periods = [
    { key: 'annual', label: 'Annual' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'ttm', label: 'TTM' }
  ];

  const getCount = (periodType) => {
    const found = availablePeriods.find(p => p.period_type === periodType);
    return found ? found.count : 0;
  };

  const isEUCompany = dataSource === 'xbrl';

  return (
    <div className="period-toggle-container">
      <div className="period-toggle">
        {periods.map(period => {
          const isDisabled = getCount(period.key) === 0;
          const showQuarterlyTooltip = period.key === 'quarterly' && isDisabled && isEUCompany;

          return (
            <div
              key={period.key}
              className="period-btn-wrapper"
              onMouseEnter={() => showQuarterlyTooltip && setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <button
                className={`period-btn ${value === period.key ? 'active' : ''}`}
                onClick={() => onChange(period.key)}
                disabled={isDisabled}
              >
                {period.label}
                {availablePeriods.length > 0 && (
                  <span className="period-count">({getCount(period.key)})</span>
                )}
              </button>
              {showQuarterlyTooltip && showTooltip && (
                <div className="period-tooltip">
                  European companies report annually (XBRL), not quarterly like US companies (SEC)
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isEUCompany && (
        <span className="data-source-badge xbrl">EU/UK Data</span>
      )}
    </div>
  );
}

export default PeriodToggle;
