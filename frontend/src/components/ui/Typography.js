// frontend/src/components/ui/Typography.js

/**
 * PRISM Typography Components
 *
 * Premium typography components following the Prism Design System.
 * Includes Heading, Text, Label, and MonoNumber components.
 *
 * Usage:
 *   import { Heading, Text, Label, MonoNumber } from '../components/ui/Typography';
 *
 *   <Heading level={1}>Portfolio Overview</Heading>
 *   <Text variant="secondary">Last updated 5 minutes ago</Text>
 *   <Label>Performance Metrics</Label>
 *   <MonoNumber value={1234.56} format="currency" trend="positive" />
 */

import React from 'react';
import PropTypes from 'prop-types';
import './Typography.css';

/* =============================================================================
   HEADING COMPONENT
   ============================================================================= */

/**
 * Heading component for page and section titles.
 *
 * @param {1|2|3} level - Heading level (h1, h2, h3)
 * @param {boolean} withMargin - Add bottom margin
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Heading content
 */
export function Heading({
  level = 1,
  withMargin = false,
  className = '',
  children,
  ...props
}) {
  const Tag = `h${level}`;
  const classes = [
    'prism-heading',
    `prism-heading--h${level}`,
    withMargin && 'prism-heading--with-margin',
    className
  ].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  );
}

Heading.propTypes = {
  level: PropTypes.oneOf([1, 2, 3]),
  withMargin: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

/* =============================================================================
   TEXT COMPONENT
   ============================================================================= */

/**
 * Text component for body content with various variants.
 *
 * @param {'body'|'secondary'|'muted'} variant - Text style variant
 * @param {'xs'|'sm'|'base'|'md'|'lg'} size - Font size
 * @param {'normal'|'medium'|'semibold'|'bold'} weight - Font weight
 * @param {'left'|'center'|'right'} align - Text alignment
 * @param {boolean} truncate - Enable text truncation
 * @param {number} clamp - Number of lines to clamp (2 or 3)
 * @param {'p'|'span'|'div'} as - HTML element to render
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Text content
 */
export function Text({
  variant = 'body',
  size,
  weight,
  align,
  truncate = false,
  clamp,
  as: Component = 'p',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'prism-text',
    `prism-text--${variant}`,
    size && `prism-text--${size}`,
    weight && `prism-text--${weight}`,
    align && `prism-text--${align}`,
    truncate && 'prism-text--truncate',
    clamp && `prism-text--clamp-${clamp}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}

Text.propTypes = {
  variant: PropTypes.oneOf(['body', 'secondary', 'muted']),
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'md', 'lg']),
  weight: PropTypes.oneOf(['normal', 'medium', 'semibold', 'bold']),
  align: PropTypes.oneOf(['left', 'center', 'right']),
  truncate: PropTypes.bool,
  clamp: PropTypes.oneOf([2, 3]),
  as: PropTypes.oneOf(['p', 'span', 'div']),
  className: PropTypes.string,
  children: PropTypes.node
};

/* =============================================================================
   LABEL COMPONENT
   ============================================================================= */

/**
 * Label component for section headers with gold color and uppercase styling.
 * Following Prism Design System section label specs.
 *
 * @param {boolean} withMargin - Add bottom margin for sections
 * @param {'span'|'div'|'p'} as - HTML element to render
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Label content
 */
export function Label({
  withMargin = false,
  as: Component = 'span',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'prism-label',
    withMargin && 'prism-label--with-margin',
    className
  ].filter(Boolean).join(' ');

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}

Label.propTypes = {
  withMargin: PropTypes.bool,
  as: PropTypes.oneOf(['span', 'div', 'p']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

/* =============================================================================
   MONO NUMBER COMPONENT
   ============================================================================= */

/**
 * Formats a number based on the specified format type.
 */
function formatNumber(value, format, options = {}) {
  if (value === null || value === undefined || isNaN(value)) {
    return '--';
  }

  const {
    decimals = 2,
    currency = 'USD',
    compact = false,
    showSign = false
  } = options;

  const absValue = Math.abs(value);
  const sign = value >= 0 ? (showSign ? '+' : '') : '-';

  switch (format) {
    case 'currency':
      if (compact && absValue >= 1e9) {
        return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
      } else if (compact && absValue >= 1e6) {
        return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
      } else if (compact && absValue >= 1e3) {
        return `${sign}$${(absValue / 1e3).toFixed(1)}K`;
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay: showSign ? 'always' : 'auto'
      }).format(value);

    case 'percent':
      return `${sign}${absValue.toFixed(decimals)}%`;

    case 'ratio':
      return `${sign}${absValue.toFixed(decimals)}x`;

    case 'integer':
      if (compact && absValue >= 1e9) {
        return `${sign}${(absValue / 1e9).toFixed(1)}B`;
      } else if (compact && absValue >= 1e6) {
        return `${sign}${(absValue / 1e6).toFixed(1)}M`;
      } else if (compact && absValue >= 1e3) {
        return `${sign}${(absValue / 1e3).toFixed(1)}K`;
      }
      return `${sign}${Math.round(absValue).toLocaleString('en-US')}`;

    case 'decimal':
    default:
      return `${sign}${absValue.toFixed(decimals)}`;
  }
}

/**
 * MonoNumber component for displaying numeric values with monospace font.
 * Supports formatting for currency, percentages, ratios, and more.
 *
 * @param {number} value - The numeric value to display
 * @param {'decimal'|'currency'|'percent'|'ratio'|'integer'} format - Number format
 * @param {'positive'|'negative'|'warning'|'muted'} trend - Semantic color
 * @param {'xs'|'sm'|'base'|'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'} size - Font size
 * @param {'normal'|'medium'|'semibold'|'bold'} weight - Font weight
 * @param {'left'|'center'|'right'} align - Text alignment
 * @param {boolean} showIndicator - Show trend indicator arrows
 * @param {number} decimals - Number of decimal places
 * @param {string} currency - Currency code for currency format
 * @param {boolean} compact - Use compact notation (1.2M, 3.4B)
 * @param {boolean} showSign - Always show +/- sign
 * @param {'span'|'div'|'p'} as - HTML element to render
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Optional children (overrides value)
 */
export function MonoNumber({
  value,
  format = 'decimal',
  trend,
  size,
  weight,
  align,
  showIndicator = false,
  decimals = 2,
  currency = 'USD',
  compact = false,
  showSign = false,
  as: Component = 'span',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'prism-mono-number',
    'prism-mono-number--default',
    size && `prism-mono-number--${size}`,
    weight && `prism-mono-number--${weight}`,
    trend && `prism-mono-number--${trend}`,
    showIndicator && trend && 'prism-mono-number--with-indicator',
    align && `prism-mono-number--${align}`,
    className
  ].filter(Boolean).join(' ');

  const displayValue = children !== undefined
    ? children
    : formatNumber(value, format, { decimals, currency, compact, showSign });

  return (
    <Component className={classes} {...props}>
      {displayValue}
    </Component>
  );
}

MonoNumber.propTypes = {
  value: PropTypes.number,
  format: PropTypes.oneOf(['decimal', 'currency', 'percent', 'ratio', 'integer']),
  trend: PropTypes.oneOf(['positive', 'negative', 'warning', 'muted']),
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']),
  weight: PropTypes.oneOf(['normal', 'medium', 'semibold', 'bold']),
  align: PropTypes.oneOf(['left', 'center', 'right']),
  showIndicator: PropTypes.bool,
  decimals: PropTypes.number,
  currency: PropTypes.string,
  compact: PropTypes.bool,
  showSign: PropTypes.bool,
  as: PropTypes.oneOf(['span', 'div', 'p']),
  className: PropTypes.string,
  children: PropTypes.node
};

/* =============================================================================
   DEFAULT EXPORT
   ============================================================================= */

export default {
  Heading,
  Text,
  Label,
  MonoNumber
};
