// frontend/src/components/prism/PRISMScore.js
// Circular gauge component for PRISM Score display

import { useMemo } from 'react';
import './PRISMScore.css';

export function PRISMScore({ score, confidenceLevel = 'MEDIUM', size = 'large' }) {
  const normalizedScore = Math.min(10, Math.max(0, score || 0));

  const { rating, color, description } = useMemo(() => {
    if (normalizedScore >= 8) {
      return {
        rating: 'Excellent',
        color: 'var(--color-success)',
        description: 'Strong investment opportunity'
      };
    } else if (normalizedScore >= 6) {
      return {
        rating: 'Good',
        color: 'var(--color-primary)',
        description: 'Above average investment'
      };
    } else if (normalizedScore >= 4) {
      return {
        rating: 'Fair',
        color: 'var(--color-warning)',
        description: 'Average risk/reward profile'
      };
    } else {
      return {
        rating: 'Poor',
        color: 'var(--color-danger)',
        description: 'Below average investment'
      };
    }
  }, [normalizedScore]);

  // Calculate arc path for the circular gauge
  const radius = size === 'large' ? 70 : 45;
  const strokeWidth = size === 'large' ? 10 : 6;
  const circumference = 2 * Math.PI * radius;
  const progress = (normalizedScore / 10) * circumference;
  const center = radius + strokeWidth;
  const svgSize = (radius + strokeWidth) * 2;

  return (
    <div className={`prism-score-gauge ${size}`}>
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          opacity="0.3"
        />

        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          transform={`rotate(-90 ${center} ${center})`}
          className="score-arc"
        />

        {/* Score text */}
        <text
          x={center}
          y={center - 8}
          textAnchor="middle"
          className="score-value"
          fill="var(--color-text)"
        >
          {score ? score.toFixed(1) : '—'}
        </text>

        <text
          x={center}
          y={center + 12}
          textAnchor="middle"
          className="score-label"
          fill="var(--color-text-secondary)"
        >
          / 10
        </text>
      </svg>

      <div className="score-details">
        <div className="score-rating" style={{ color }}>
          {rating}
        </div>
        <div className="score-description">
          {description}
        </div>
        <div className={`score-confidence confidence-${confidenceLevel?.toLowerCase()}`}>
          <span className="confidence-dots">
            <span className="dot filled" />
            <span className={`dot ${confidenceLevel !== 'LOW' ? 'filled' : ''}`} />
            <span className={`dot ${confidenceLevel === 'HIGH' ? 'filled' : ''}`} />
          </span>
          <span className="confidence-label">
            {confidenceLevel} Confidence
          </span>
        </div>
      </div>
    </div>
  );
}

export default PRISMScore;
