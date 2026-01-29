// frontend/src/components/alerts/ActionabilityFilter.jsx
// Filter component for actionability levels

import { useState } from 'react';
import { Target, Info, AlertTriangle, CheckCircle } from '../icons';
import './ActionabilityFilter.css';

const ACTIONABILITY_LEVELS = [
  {
    value: 'all',
    label: 'All Alerts',
    description: 'Show all alerts regardless of actionability',
    icon: Info,
    color: 'default'
  },
  {
    value: 'high',
    label: 'Action Required',
    description: 'Alerts requiring immediate attention',
    icon: Target,
    color: 'high',
    minScore: 0.7
  },
  {
    value: 'medium',
    label: 'Worth Investigating',
    description: 'Alerts that may warrant further review',
    icon: AlertTriangle,
    color: 'medium',
    minScore: 0.4
  },
  {
    value: 'low',
    label: 'Informational',
    description: 'Background updates and information',
    icon: CheckCircle,
    color: 'low',
    minScore: 0
  }
];

const SORT_OPTIONS = [
  { value: 'actionability', label: 'Actionability' },
  { value: 'priority', label: 'Priority' },
  { value: 'time', label: 'Most Recent' }
];

export default function ActionabilityFilter({
  selectedLevel = 'all',
  sortBy = 'actionability',
  onLevelChange,
  onSortChange,
  stats = {}
}) {
  const [showTooltip, setShowTooltip] = useState(null);

  return (
    <div className="actionability-filter">
      <div className="filter-header">
        <Target className="filter-icon" size={16} />
        <span className="filter-label">Filter by Actionability</span>
      </div>

      <div className="filter-options">
        {ACTIONABILITY_LEVELS.map((level) => {
          const IconComponent = level.icon;
          const count = stats[level.value] || 0;
          const isActive = selectedLevel === level.value;

          return (
            <button
              key={level.value}
              className={`filter-option ${level.color} ${isActive ? 'active' : ''}`}
              onClick={() => onLevelChange?.(level.value)}
              onMouseEnter={() => setShowTooltip(level.value)}
              onMouseLeave={() => setShowTooltip(null)}
              aria-pressed={isActive}
            >
              <IconComponent size={14} className="option-icon" />
              <span className="option-label">{level.label}</span>
              {level.value !== 'all' && count > 0 && (
                <span className="option-count">{count}</span>
              )}

              {showTooltip === level.value && (
                <div className="option-tooltip">
                  {level.description}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="sort-section">
        <span className="sort-label">Sort by:</span>
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => onSortChange?.(e.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Badge component for showing actionability level on individual alerts
export function ActionabilityBadge({ score, level, compact = false }) {
  const config = {
    high: { label: 'Action Required', color: 'high', icon: Target },
    medium: { label: 'Investigate', color: 'medium', icon: AlertTriangle },
    low: { label: 'Informational', color: 'low', icon: Info }
  };

  const badgeLevel = level || (score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low');
  const { label, color, icon: IconComponent } = config[badgeLevel];

  if (compact) {
    return (
      <span className={`actionability-badge compact ${color}`} title={label}>
        <IconComponent size={12} />
      </span>
    );
  }

  return (
    <span className={`actionability-badge ${color}`}>
      <IconComponent size={12} />
      <span>{label}</span>
      {score !== undefined && (
        <span className="score">({Math.round(score * 100)}%)</span>
      )}
    </span>
  );
}

// Action suggestions panel
export function ActionSuggestions({ suggestions = [] }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="action-suggestions">
      <div className="suggestions-header">
        <Target size={14} />
        <span>Suggested Actions</span>
      </div>
      <ul className="suggestions-list">
        {suggestions.map((suggestion, index) => (
          <li key={index}>{suggestion}</li>
        ))}
      </ul>
    </div>
  );
}
