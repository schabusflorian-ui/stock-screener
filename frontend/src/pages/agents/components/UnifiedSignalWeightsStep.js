// frontend/src/pages/agents/components/UnifiedSignalWeightsStep.js
// Enhanced Signal Weights Component with all 15 signal categories

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  MessageSquare,
  Users,
  Building2,
  Calculator,
  Briefcase,
  Zap,
  Star,
  LineChart,
  Target,
  Globe,
  Scale,
  Sparkles,
  Layers
} from '../../../components/icons';

// All 15 signal categories with descriptions
const SIGNAL_CATEGORIES = {
  // Technical Group
  technical: {
    label: 'Technical',
    description: 'RSI, MACD, moving averages, ATR, volume',
    icon: TrendingUp,
    category: 'technical',
    defaultWeight: 0.08
  },
  momentum: {
    label: 'Momentum',
    description: '12-1 momentum, 3-month momentum',
    icon: LineChart,
    category: 'technical',
    defaultWeight: 0.08
  },

  // Fundamental Group
  fundamental: {
    label: 'Fundamental',
    description: 'ROE, margins, revenue growth',
    icon: BarChart3,
    category: 'fundamental',
    defaultWeight: 0.10
  },
  valueQuality: {
    label: 'Value-Quality',
    description: 'Piotroski F-Score, Altman Z-Score',
    icon: Star,
    category: 'fundamental',
    defaultWeight: 0.08
  },
  magicFormula: {
    label: 'Magic Formula',
    description: 'Greenblatt earnings yield + ROIC',
    icon: Sparkles,
    category: 'fundamental',
    defaultWeight: 0.02
  },

  // Sentiment Group
  sentiment: {
    label: 'Sentiment',
    description: 'Reddit, StockTwits sentiment',
    icon: MessageSquare,
    category: 'sentiment',
    defaultWeight: 0.07
  },
  analyst: {
    label: 'Analyst',
    description: 'Price targets, ratings changes',
    icon: Target,
    category: 'sentiment',
    defaultWeight: 0.06
  },

  // Alternative Data Group
  insider: {
    label: 'Insider Trading',
    description: 'Form 4 filings, cluster detection',
    icon: Users,
    category: 'alternative',
    defaultWeight: 0.10
  },
  congressional: {
    label: 'Congressional',
    description: 'Congress trades, bipartisan signals',
    icon: Building2,
    category: 'alternative',
    defaultWeight: 0.08
  },
  thirteenF: {
    label: '13F Holdings',
    description: 'Super-investor position changes',
    icon: Briefcase,
    category: 'alternative',
    defaultWeight: 0.08
  },
  alternative: {
    label: 'Alternative Data',
    description: 'Short interest, gov contracts',
    icon: Globe,
    category: 'alternative',
    defaultWeight: 0.04
  },
  contrarian: {
    label: 'Contrarian',
    description: 'Insider buys during drawdowns',
    icon: Scale,
    category: 'alternative',
    defaultWeight: 0.02
  },

  // Valuation Group
  valuation: {
    label: 'Valuation',
    description: 'DCF, intrinsic value, margin of safety',
    icon: Calculator,
    category: 'valuation',
    defaultWeight: 0.10
  },
  earningsMomentum: {
    label: 'Earnings Momentum',
    description: 'Beat/miss streaks, surprises',
    icon: Zap,
    category: 'valuation',
    defaultWeight: 0.06
  },

  // Factor Group
  factorScores: {
    label: 'Factor Scores',
    description: 'Value, Quality, Momentum, Growth, Size',
    icon: Layers,
    category: 'factors',
    defaultWeight: 0.03
  }
};

// Signal category groups for organization
const SIGNAL_GROUPS = [
  {
    name: 'Technical Signals',
    description: 'Price and momentum-based indicators',
    signals: ['technical', 'momentum'],
    color: '#2563EB'
  },
  {
    name: 'Fundamental Signals',
    description: 'Company quality and value metrics',
    signals: ['fundamental', 'valueQuality', 'magicFormula'],
    color: '#059669'
  },
  {
    name: 'Sentiment Signals',
    description: 'Market sentiment and analyst views',
    signals: ['sentiment', 'analyst'],
    color: '#D97706'
  },
  {
    name: 'Alternative Data',
    description: 'Smart money and insider activity',
    signals: ['insider', 'congressional', 'thirteenF', 'alternative', 'contrarian'],
    color: '#7C3AED'
  },
  {
    name: 'Valuation Signals',
    description: 'Fair value and earnings analysis',
    signals: ['valuation', 'earningsMomentum'],
    color: '#ec4899'
  },
  {
    name: 'Factor Analysis',
    description: 'Systematic factor exposures',
    signals: ['factorScores'],
    color: '#64748b'
  }
];

// Preset configurations
const PRESETS = {
  balanced: {
    name: 'Balanced Hybrid',
    description: 'Equal weighting across all signal types',
    weights: {
      technical: 0.08, fundamental: 0.10, sentiment: 0.07,
      insider: 0.10, congressional: 0.08, valuation: 0.10,
      thirteenF: 0.08, earningsMomentum: 0.07, valueQuality: 0.08,
      momentum: 0.08, analyst: 0.06, alternative: 0.04,
      contrarian: 0.02, magicFormula: 0.02, factorScores: 0.02
    }
  },
  value: {
    name: 'Value Investor',
    description: 'Buffett-style fundamentals focus',
    weights: {
      technical: 0.02, fundamental: 0.20, sentiment: 0.02,
      insider: 0.12, congressional: 0.05, valuation: 0.20,
      thirteenF: 0.10, earningsMomentum: 0.05, valueQuality: 0.15,
      momentum: 0.02, analyst: 0.02, alternative: 0.02,
      contrarian: 0.01, magicFormula: 0.01, factorScores: 0.01
    }
  },
  smartMoney: {
    name: 'Smart Money Tracker',
    description: 'Follow insiders and famous investors',
    weights: {
      technical: 0.05, fundamental: 0.10, sentiment: 0.05,
      insider: 0.25, congressional: 0.20, valuation: 0.05,
      thirteenF: 0.20, earningsMomentum: 0.02, valueQuality: 0.03,
      momentum: 0.02, analyst: 0.02, alternative: 0.01,
      contrarian: 0.00, magicFormula: 0.00, factorScores: 0.00
    }
  },
  momentum: {
    name: 'Momentum Growth',
    description: 'Ride momentum for growth stocks',
    weights: {
      technical: 0.20, fundamental: 0.05, sentiment: 0.10,
      insider: 0.05, congressional: 0.02, valuation: 0.02,
      thirteenF: 0.05, earningsMomentum: 0.20, valueQuality: 0.02,
      momentum: 0.20, analyst: 0.05, alternative: 0.02,
      contrarian: 0.00, magicFormula: 0.00, factorScores: 0.02
    }
  },
  contrarian: {
    name: 'Contrarian Value',
    description: 'Buy unloved stocks with insider support',
    weights: {
      technical: 0.05, fundamental: 0.15, sentiment: 0.02,
      insider: 0.20, congressional: 0.05, valuation: 0.15,
      thirteenF: 0.05, earningsMomentum: 0.03, valueQuality: 0.10,
      momentum: 0.00, analyst: 0.00, alternative: 0.05,
      contrarian: 0.15, magicFormula: 0.00, factorScores: 0.00
    }
  }
};

function UnifiedSignalWeightsStep({
  weights,
  onChange,
  onWeightChange,  // Alternative prop name from CreateAgentPage
  onPresetSelect,
  onPresetApply    // Alternative prop name from CreateAgentPage
}) {
  const [activeGroup, setActiveGroup] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Support both prop naming conventions
  const handleWeightsUpdate = onChange || onWeightChange;
  const handlePresetUpdate = onPresetSelect || onPresetApply;

  // Calculate total weight
  const totalWeight = Object.values(weights || {}).reduce((sum, w) => sum + (w || 0), 0);
  const isValid = Math.abs(totalWeight - 1) < 0.05;

  // Handle individual weight change
  const handleWeightChange = (signal, value) => {
    if (handleWeightsUpdate) {
      handleWeightsUpdate({ ...weights, [signal]: parseFloat(value) || 0 });
    }
  };

  // Handle preset selection
  const handlePresetClick = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      if (handlePresetUpdate) {
        handlePresetUpdate(preset.weights);
      } else if (handleWeightsUpdate) {
        handleWeightsUpdate(preset.weights);
      }
    }
  };

  // Normalize weights to sum to 1
  const normalizeWeights = () => {
    if (totalWeight === 0 || !handleWeightsUpdate) return;
    const normalized = {};
    Object.keys(weights).forEach(key => {
      normalized[key] = weights[key] / totalWeight;
    });
    handleWeightsUpdate(normalized);
  };

  return (
    <div className="unified-signal-weights">
      {/* Presets Section */}
      <div className="presets-section">
        <h3>Strategy Presets</h3>
        <p className="presets-description">Choose a preset or customize weights below</p>
        <div className="presets-grid">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className="preset-card"
              onClick={() => handlePresetClick(key)}
            >
              <div className="preset-name">{preset.name}</div>
              <div className="preset-description">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Weight Summary */}
      <div className={`weight-summary ${isValid ? 'valid' : 'invalid'}`}>
        <div className="summary-bar">
          <div className="summary-text">
            Total Weight: <strong>{(totalWeight * 100).toFixed(1)}%</strong>
            {!isValid && <span className="warning"> (should be ~100%)</span>}
          </div>
          <button className="normalize-btn" onClick={normalizeWeights}>
            Normalize to 100%
          </button>
        </div>
        <div className="weight-bar">
          {SIGNAL_GROUPS.map((group, idx) => {
            const groupWeight = group.signals.reduce((sum, s) => sum + (weights[s] || 0), 0);
            if (groupWeight === 0) return null;
            return (
              <div
                key={idx}
                className="weight-segment"
                style={{
                  width: `${groupWeight * 100}%`,
                  backgroundColor: group.color
                }}
                title={`${group.name}: ${(groupWeight * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="weight-legend">
          {SIGNAL_GROUPS.map((group, idx) => {
            const groupWeight = group.signals.reduce((sum, s) => sum + (weights[s] || 0), 0);
            if (groupWeight === 0) return null;
            return (
              <div key={idx} className="legend-item">
                <span className="legend-color" style={{ backgroundColor: group.color }} />
                <span className="legend-label">{group.name.split(' ')[0]}</span>
                <span className="legend-value">{(groupWeight * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal Groups */}
      <div className="signal-groups">
        {SIGNAL_GROUPS.map((group, groupIdx) => {
          const isExpanded = activeGroup === groupIdx || showAdvanced;
          const groupWeight = group.signals.reduce((sum, s) => sum + (weights[s] || 0), 0);

          return (
            <div key={groupIdx} className="signal-group">
              <div
                className="group-header"
                onClick={() => setActiveGroup(isExpanded ? null : groupIdx)}
                style={{ borderLeftColor: group.color }}
              >
                <div className="group-info">
                  <h4>{group.name}</h4>
                  <p>{group.description}</p>
                </div>
                <div className="group-weight">
                  <span className="weight-value">{(groupWeight * 100).toFixed(0)}%</span>
                  <span className="expand-icon">{isExpanded ? '−' : '+'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="group-signals">
                  {group.signals.map(signalKey => {
                    const signal = SIGNAL_CATEGORIES[signalKey];
                    const SignalIcon = signal.icon;
                    const value = weights[signalKey] || 0;

                    return (
                      <div key={signalKey} className="signal-row">
                        <div className="signal-info">
                          <SignalIcon size={18} className="signal-icon" />
                          <div className="signal-text">
                            <span className="signal-label">{signal.label}</span>
                            <span className="signal-description">{signal.description}</span>
                          </div>
                        </div>
                        <div className="signal-control">
                          <input
                            type="range"
                            min="0"
                            max="0.30"
                            step="0.01"
                            value={value}
                            onChange={(e) => handleWeightChange(signalKey, e.target.value)}
                            className="weight-slider"
                            style={{
                              '--slider-color': group.color,
                              '--slider-progress': `${(value / 0.30) * 100}%`
                            }}
                          />
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={(value * 100).toFixed(0)}
                            onChange={(e) => handleWeightChange(signalKey, parseFloat(e.target.value) / 100)}
                            className="weight-input"
                          />
                          <span className="weight-percent">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show All Toggle */}
      <button
        className="show-all-btn"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? 'Collapse All Groups' : 'Expand All Groups'}
      </button>
    </div>
  );
}

export default UnifiedSignalWeightsStep;
export { SIGNAL_CATEGORIES, SIGNAL_GROUPS, PRESETS };
