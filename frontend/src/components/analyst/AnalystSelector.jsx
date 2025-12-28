// frontend/src/components/analyst/AnalystSelector.jsx
import React from 'react';
import './AnalystSelector.css';

/**
 * Grid of analyst cards for selection
 */
export default function AnalystSelector({ analysts, selected, onSelect, loading }) {
  if (loading) {
    return (
      <div className="analyst-selector-loading">
        <div className="loading-spinner" />
        <span>Loading analysts...</span>
      </div>
    );
  }

  if (!analysts || analysts.length === 0) {
    return (
      <div className="analyst-selector-empty">
        <p>No analysts available</p>
      </div>
    );
  }

  return (
    <div className="analyst-selector">
      <div className="analyst-grid">
        {analysts.map(analyst => (
          <button
            key={analyst.id}
            className={`analyst-card ${selected === analyst.id ? 'selected' : ''}`}
            onClick={() => onSelect(analyst.id)}
            style={{
              '--analyst-color': analyst.color,
              '--analyst-color-light': `${analyst.color}20`
            }}
          >
            <div className="analyst-card-header">
              <span className="analyst-icon">{analyst.icon}</span>
              <div className="analyst-info">
                <h3 className="analyst-name">{analyst.name}</h3>
                <span className="analyst-title">{analyst.title}</span>
              </div>
            </div>

            <p className="analyst-description">{analyst.description}</p>

            <div className="analyst-tags">
              {analyst.strengths?.slice(0, 3).map((strength, i) => (
                <span key={i} className="analyst-tag">{strength}</span>
              ))}
            </div>

            <div className="analyst-influences">
              <span className="influences-label">Influenced by:</span>
              <span className="influences-list">
                {analyst.influences?.slice(0, 2).join(', ')}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
