// frontend/src/components/ui/DataCard.js
import React from 'react';
import PropTypes from 'prop-types';
import { TrendingUp, TrendingDown, Minus } from '../icons';
import { useAskAI, createMetricExtractor } from '../../hooks';
import './DataCard.css';

/**
 * DataCard Component - Prism Design System (Stat Card)
 *
 * Displays a single metric with optional change indicator.
 * Perfect for KPIs, stats, and financial metrics.
 * Uses monospace font for numeric values for better readability.
 *
 * Format options:
 * - number: Standard number formatting
 * - currency: USD currency formatting with compact notation
 * - percent: Percentage with sign
 *
 * Prism Design Specs:
 * - White background (#FFFFFF)
 * - 12px border radius
 * - 20px padding
 * - Label: 13px, #64748B
 * - Value: 28px, #0F172A, monospace font
 * - Positive change: #059669
 * - Negative change: #DC2626
 */
function DataCard({
  label,
  value,
  change,
  format,
  icon: Icon,
  className = '',
  askAIContext = null,
  ...props
}) {
  const formattedValue = formatValue(value, format);

  let changeType = null;
  if (change !== undefined && change !== null) {
    changeType = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  }

  const ChangeIcon = changeType === 'positive'
    ? TrendingUp
    : changeType === 'negative'
    ? TrendingDown
    : Minus;

  // Ask AI context menu - only enabled if askAIContext is provided
  const askAIProps = useAskAI(
    askAIContext
      ? createMetricExtractor(() => ({
          metric: label,
          value,
          change: typeof change === 'object' ? change.value : change,
          format,
          ...askAIContext
        }))
      : null
  );

  return (
    <div className={`ui-data-card ${className}`} {...props} {...(askAIContext ? askAIProps : {})}>
      {Icon && (
        <div className="ui-data-card__icon">
          <Icon size={20} />
        </div>
      )}
      <div className="ui-data-card__content">
        <span className="ui-data-card__label">{label}</span>
        <span className="ui-data-card__value">{formattedValue}</span>
        {changeType && (
          <div className={`ui-data-card__change ui-data-card__change--${changeType}`}>
            <ChangeIcon size={14} />
            <span>{formatChange(change)}</span>
            {change.period && (
              <span className="ui-data-card__period">{change.period}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;

  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percent':
      return formatPercent(value);
    case 'number':
    default:
      return formatNumber(value);
  }
}

function formatCurrency(value) {
  const absValue = Math.abs(value);
  let formatted;

  if (absValue >= 1e12) {
    formatted = (value / 1e12).toFixed(2) + 'T';
  } else if (absValue >= 1e9) {
    formatted = (value / 1e9).toFixed(2) + 'B';
  } else if (absValue >= 1e6) {
    formatted = (value / 1e6).toFixed(2) + 'M';
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toFixed(2) + 'K';
  } else {
    formatted = value.toFixed(2);
  }

  return '$' + formatted;
}

function formatPercent(value) {
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function formatChange(change) {
  const value = typeof change === 'object' ? change.value : change;
  const absValue = Math.abs(value);
  return absValue.toFixed(2) + '%';
}

DataCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  change: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.shape({
      value: PropTypes.number.isRequired,
      period: PropTypes.string
    })
  ]),
  format: PropTypes.oneOf(['number', 'currency', 'percent']),
  icon: PropTypes.elementType,
  className: PropTypes.string,
  askAIContext: PropTypes.object // Optional context for Ask AI (e.g., { symbol: 'AAPL' })
};

export default DataCard;
