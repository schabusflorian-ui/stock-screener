// frontend/src/components/prism/PRISMSectionHeader.js
// Unified Section Header Component for Tier 1 Bank Report Styling

import { ChevronDown, ChevronRight } from 'lucide-react';
import './PRISMSectionHeader.css';

/**
 * PRISMSectionHeader - Consistent section header for all PRISM report sections
 *
 * @param {Object} props
 * @param {React.Element} props.icon - Lucide icon (18px)
 * @param {string} props.title - Section title
 * @param {string} [props.subtitle] - Optional subtitle
 * @param {React.Element} [props.badge] - Optional right-aligned badge
 * @param {boolean} [props.collapsible] - Whether section can collapse
 * @param {boolean} [props.expanded] - Collapse state (required if collapsible)
 * @param {Function} [props.onToggle] - Toggle handler (required if collapsible)
 * @param {'violet'|'emerald'|'blue'|'gold'|'warning'|'info'|'muted'} [props.accentColor] - Icon background color
 */
export function PRISMSectionHeader({
  icon,
  title,
  subtitle,
  badge,
  collapsible = false,
  expanded = true,
  onToggle,
  accentColor = 'violet'
}) {
  const HeaderTag = collapsible ? 'button' : 'div';

  const handleClick = () => {
    if (collapsible && onToggle) {
      onToggle();
    }
  };

  return (
    <HeaderTag
      className={`prism-section-header ${collapsible ? 'collapsible' : ''} ${expanded ? 'expanded' : ''}`}
      onClick={collapsible ? handleClick : undefined}
      type={collapsible ? 'button' : undefined}
    >
      <div className="header-left">
        <div className={`header-icon ${accentColor}`}>
          {icon}
        </div>
        <div className="header-text">
          <h3 className="header-title">{title}</h3>
          {subtitle && <span className="header-subtitle">{subtitle}</span>}
        </div>
      </div>

      <div className="header-right">
        {badge && <div className="header-badge">{badge}</div>}
        {collapsible && (
          <div className="header-toggle">
            {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        )}
      </div>
    </HeaderTag>
  );
}

export default PRISMSectionHeader;
