// frontend/src/components/analyst/AnalystSelector.jsx
import React from 'react';
import {
  BarChart2, TrendingUp, RefreshCcw, Calculator, Zap, Monitor, Bot
} from '../icons';
import './AnalystSelector.css';

// Analyst ID to Prism icon mapping with unique gradients
const ANALYST_CONFIG = {
  value: {
    Icon: BarChart2,
    gradient: 'linear-gradient(135deg, #059669 0%, #0891b2 100%)' // Emerald to Cyan (stability, value)
  },
  growth: {
    Icon: TrendingUp,
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)' // Violet to Blue (innovation, growth)
  },
  contrarian: {
    Icon: RefreshCcw,
    gradient: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)' // Red to Orange (bold, contrarian)
  },
  quant: {
    Icon: Calculator,
    gradient: 'linear-gradient(135deg, #2563eb 0%, #0891b2 100%)' // Blue to Cyan (analytical, precise)
  },
  tailrisk: {
    Icon: Zap,
    gradient: 'linear-gradient(135deg, #9333ea 0%, #c026d3 100%)' // Purple to Fuchsia (volatility, energy)
  },
  tech: {
    Icon: Monitor,
    gradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' // Cyan to Teal (tech, digital)
  },
  default: {
    Icon: Bot,
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)' // Default violet
  }
};

// Helper to get analyst icon component
const getAnalystIcon = (analystId, size = 24) => {
  const config = ANALYST_CONFIG[analystId] || ANALYST_CONFIG.default;
  const IconComponent = config.Icon;
  return <IconComponent size={size} />;
};

// Helper to get analyst gradient
const getAnalystGradient = (analystId) => {
  const config = ANALYST_CONFIG[analystId] || ANALYST_CONFIG.default;
  return config.gradient;
};

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
              '--analyst-color-light': `${analyst.color}20`,
              '--analyst-icon-gradient': getAnalystGradient(analyst.id)
            }}
          >
            <div className="analyst-card-header">
              <span className="analyst-icon">{getAnalystIcon(analyst.id, 26)}</span>
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
