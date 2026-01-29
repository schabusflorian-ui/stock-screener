/**
 * ContextMenu - Right-click "Ask AI" floating menu
 *
 * Features:
 * - Shows contextual AI query suggestions
 * - Custom question option
 * - AI-themed styling with sparkle icon
 * - Auto-positions within viewport
 * - Error boundary to prevent crashes from propagating
 */

import React, { Component, useEffect, useRef } from 'react';
import { Edit3, MessageCircle, ChevronRight } from 'lucide-react';
import { PrismSparkle } from '../icons';
import { useContextMenu } from '../../context/ContextMenuContext';
import './ContextMenu.css';

/**
 * Error boundary to catch and handle errors in the context menu
 */
class ContextMenuErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ContextMenu error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Silently fail - don't show broken menu
      return null;
    }
    return this.props.children;
  }
}

function ContextMenu() {
  const {
    isOpen,
    position,
    contextData,
    suggestions,
    selectSuggestion,
    askCustomQuestion
  } = useContextMenu();

  const menuRef = useRef(null);
  const firstItemRef = useRef(null);

  // Focus first menu item when menu opens
  useEffect(() => {
    if (isOpen && firstItemRef.current) {
      firstItemRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation within menu
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
      const currentIndex = Array.from(items || []).indexOf(document.activeElement);
      const nextIndex = (currentIndex + 1) % (items?.length || 1);
      items?.[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
      const currentIndex = Array.from(items || []).indexOf(document.activeElement);
      const prevIndex = currentIndex <= 0 ? (items?.length || 1) - 1 : currentIndex - 1;
      items?.[prevIndex]?.focus();
    } else if (e.key === 'Tab') {
      // Trap focus within menu
      e.preventDefault();
    }
  };

  if (!isOpen) return null;

  // Format context label for display
  const getContextLabel = () => {
    if (!contextData) return null;

    const { symbol, companyName, metric, label, type } = contextData;

    if (symbol) {
      if (companyName) return `${companyName} (${symbol})`;
      return symbol;
    }
    if (label) return label;
    if (metric) return metric.replace(/_/g, ' ');
    if (type) return type.replace(/_/g, ' ');
    return null;
  };

  const contextLabel = getContextLabel();

  return (
    <div
      ref={menuRef}
      id="prism-context-menu"
      className="context-menu"
      role="menu"
      aria-label={`Ask PRISM${contextLabel ? ` about ${contextLabel}` : ''}`}
      style={{
        left: position.x,
        top: position.y
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="context-menu-header" aria-hidden="true">
        <div className="context-menu-header-icon">
          <PrismSparkle size={16} />
        </div>
        <div className="context-menu-header-content">
          <div className="context-menu-header-title">Ask PRISM</div>
          {contextLabel && (
            <div className="context-menu-header-hint">About: {contextLabel}</div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      <div className="context-menu-suggestions" role="group" aria-label="Suggested questions">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion, index) => (
            <button
              key={index}
              ref={index === 0 ? firstItemRef : null}
              className="context-menu-suggestion"
              role="menuitem"
              tabIndex={0}
              onClick={() => selectSuggestion(suggestion)}
              aria-label={`Ask: ${suggestion}`}
            >
              <span className="context-menu-suggestion-icon" aria-hidden="true">
                <MessageCircle size={14} />
              </span>
              <span className="context-menu-suggestion-text">{suggestion}</span>
              <span className="context-menu-suggestion-arrow" aria-hidden="true">
                <ChevronRight size={14} />
              </span>
            </button>
          ))
        ) : (
          <div className="context-menu-no-suggestions" role="status">
            No suggestions available
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="context-menu-divider" role="separator" aria-hidden="true" />

      {/* Footer with custom question */}
      <div className="context-menu-footer">
        <button
          className="context-menu-custom"
          role="menuitem"
          tabIndex={0}
          onClick={askCustomQuestion}
          aria-label="Ask a custom question"
        >
          <span className="context-menu-custom-icon" aria-hidden="true">
            <Edit3 size={14} />
          </span>
          <span>Custom question...</span>
          <span className="context-menu-shortcut" aria-hidden="true">⏎</span>
        </button>
      </div>
    </div>
  );
}

// Wrap with error boundary for safety
function ContextMenuWithErrorBoundary() {
  return (
    <ContextMenuErrorBoundary>
      <ContextMenu />
    </ContextMenuErrorBoundary>
  );
}

export default ContextMenuWithErrorBoundary;
