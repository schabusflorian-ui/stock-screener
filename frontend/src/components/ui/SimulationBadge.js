// frontend/src/components/ui/SimulationBadge.js
// Visual indicator for paper trading / simulated content

import React from 'react';
import PropTypes from 'prop-types';
import { FlaskConical, TestTube, CircleDot } from '../icons';
import './SimulationBadge.css';

/**
 * SimulationBadge Component
 *
 * Displays a prominent visual indicator that content is simulated/paper trading.
 * Critical for regulatory compliance - ensures users understand they are not
 * dealing with real money or actual investment transactions.
 *
 * @param {string} variant - Display variant: 'badge', 'banner', 'corner', 'inline'
 * @param {string} size - Size: 'sm', 'md', 'lg'
 * @param {string} label - Custom label text (default: 'Paper Trading')
 * @param {boolean} showIcon - Whether to show the icon
 * @param {string} className - Additional CSS classes
 */
const SimulationBadge = ({
  variant = 'badge',
  size = 'md',
  label = 'Paper Trading',
  showIcon = true,
  className = ''
}) => {
  const sizeConfig = {
    sm: { iconSize: 12, fontSize: '0.65rem' },
    md: { iconSize: 14, fontSize: '0.75rem' },
    lg: { iconSize: 18, fontSize: '0.875rem' }
  };

  const config = sizeConfig[size] || sizeConfig.md;
  const Icon = FlaskConical;

  // Corner ribbon style
  if (variant === 'corner') {
    return (
      <div className={`simulation-badge simulation-badge--corner simulation-badge--${size} ${className}`}>
        <div className="simulation-badge__ribbon">
          {showIcon && <Icon size={config.iconSize} />}
          <span>{label}</span>
        </div>
      </div>
    );
  }

  // Banner style - full width
  if (variant === 'banner') {
    return (
      <div className={`simulation-badge simulation-badge--banner simulation-badge--${size} ${className}`}>
        {showIcon && <Icon size={config.iconSize} />}
        <span className="simulation-badge__label">{label}</span>
        <span className="simulation-badge__description">
          No real money involved. Simulated results do not predict actual performance.
        </span>
      </div>
    );
  }

  // Inline style - within text
  if (variant === 'inline') {
    return (
      <span className={`simulation-badge simulation-badge--inline simulation-badge--${size} ${className}`}>
        {showIcon && <CircleDot size={config.iconSize} />}
        <span>{label}</span>
      </span>
    );
  }

  // Default: Badge style
  return (
    <span className={`simulation-badge simulation-badge--badge simulation-badge--${size} ${className}`}>
      {showIcon && <TestTube size={config.iconSize} />}
      <span>{label}</span>
    </span>
  );
};

SimulationBadge.propTypes = {
  variant: PropTypes.oneOf(['badge', 'banner', 'corner', 'inline']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  label: PropTypes.string,
  showIcon: PropTypes.bool,
  className: PropTypes.string
};

export default SimulationBadge;
