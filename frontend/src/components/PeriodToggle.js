import React from 'react';
import './PeriodToggle.css';

function PeriodToggle({ value, onChange, availablePeriods = [] }) {
  const periods = [
    { key: 'annual', label: 'Annual' },
    { key: 'quarterly', label: 'Quarterly' }
  ];

  const getCount = (periodType) => {
    const found = availablePeriods.find(p => p.period_type === periodType);
    return found ? found.count : 0;
  };

  return (
    <div className="period-toggle">
      {periods.map(period => (
        <button
          key={period.key}
          className={`period-btn ${value === period.key ? 'active' : ''}`}
          onClick={() => onChange(period.key)}
          disabled={getCount(period.key) === 0}
        >
          {period.label}
          {availablePeriods.length > 0 && (
            <span className="period-count">({getCount(period.key)})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default PeriodToggle;
