// frontend/src/components/prism/WhatMatters.js
// 5 Key Drivers component

import { Zap, TrendingUp, TrendingDown } from 'lucide-react';
import './WhatMatters.css';

export function WhatMatters({ drivers }) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="what-matters empty">
        <p>Key drivers not yet identified</p>
      </div>
    );
  }

  return (
    <div className="what-matters">
      <div className="drivers-list">
        {drivers.map((driver, index) => (
          <DriverCard key={index} driver={driver} index={index + 1} />
        ))}
      </div>
    </div>
  );
}

function DriverCard({ driver, index }) {
  const {
    name,
    description,
    bullCase,
    bearCase,
    impact,
    category
  } = driver;

  return (
    <div className="driver-card">
      <div className="driver-header">
        <div className="driver-number">
          <Zap size={12} />
          <span>{index}</span>
        </div>
        <h4 className="driver-name">{name}</h4>
        {category && (
          <span className={`driver-category ${category.toLowerCase()}`}>
            {category}
          </span>
        )}
      </div>

      {description && (
        <p className="driver-description">{description}</p>
      )}

      <div className="driver-scenarios">
        {bullCase && (
          <div className="scenario bull">
            <div className="scenario-label">
              <TrendingUp size={14} />
              <span>Bull</span>
            </div>
            <p>{bullCase}</p>
          </div>
        )}
        {bearCase && (
          <div className="scenario bear">
            <div className="scenario-label">
              <TrendingDown size={14} />
              <span>Bear</span>
            </div>
            <p>{bearCase}</p>
          </div>
        )}
      </div>

      {impact && (
        <div className="driver-impact">
          <span className="impact-label">Impact:</span>
          <ImpactIndicator level={impact} />
        </div>
      )}
    </div>
  );
}

function ImpactIndicator({ level }) {
  // level can be 'high', 'medium', 'low' or a number 1-5
  let normalizedLevel;
  if (typeof level === 'string') {
    normalizedLevel = level.toLowerCase() === 'high' ? 3 :
      level.toLowerCase() === 'medium' ? 2 : 1;
  } else {
    normalizedLevel = Math.ceil((level / 5) * 3);
  }

  return (
    <div className="impact-indicator">
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={`impact-bar ${i <= normalizedLevel ? 'filled' : ''}`}
        />
      ))}
      <span className="impact-text">
        {normalizedLevel === 3 ? 'High' : normalizedLevel === 2 ? 'Medium' : 'Low'}
      </span>
    </div>
  );
}

export default WhatMatters;
