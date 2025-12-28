import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './MetricSelector.css';

// Import from unified metrics configuration
import {
  METRICS,
  METRIC_COLORS,
  DEFAULT_CHART_METRICS,
  DEFAULT_TABLE_METRICS
} from '../config/metrics';

// Re-export for backwards compatibility
export { METRICS as AVAILABLE_METRICS, METRIC_COLORS, DEFAULT_CHART_METRICS, DEFAULT_TABLE_METRICS };

// Convert METRICS to AVAILABLE_METRICS format for backwards compatibility
const AVAILABLE_METRICS = METRICS;

function MetricSelector({ selectedMetrics, onChange, maxSelection = 6, mode = 'chart' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const categories = [...new Set(Object.values(AVAILABLE_METRICS).map(m => m.category))];

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 400; // min-width from CSS
      const viewportWidth = window.innerWidth;

      // Calculate left position - align to right edge of button if it would overflow
      // Use viewport-relative coordinates since we're using position: fixed
      let leftPos = rect.left;
      if (leftPos + dropdownWidth > viewportWidth - 20) {
        // Align to right edge of button instead
        leftPos = rect.right - dropdownWidth;
      }
      // Ensure it doesn't go off the left edge
      leftPos = Math.max(10, leftPos);

      setDropdownPosition({
        top: rect.bottom + 8, // Just below the button, no scroll offset needed for fixed positioning
        left: leftPos
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleMetric = (metricKey) => {
    if (selectedMetrics.includes(metricKey)) {
      onChange(selectedMetrics.filter(m => m !== metricKey));
    } else if (selectedMetrics.length < maxSelection) {
      onChange([...selectedMetrics, metricKey]);
    }
  };

  const selectAll = (category) => {
    const categoryMetrics = Object.entries(AVAILABLE_METRICS)
      .filter(([_, m]) => m.category === category)
      .map(([key]) => key);
    const newSelection = [...new Set([...selectedMetrics, ...categoryMetrics])].slice(0, maxSelection);
    onChange(newSelection);
  };

  const clearCategory = (category) => {
    const categoryMetrics = Object.entries(AVAILABLE_METRICS)
      .filter(([_, m]) => m.category === category)
      .map(([key]) => key);
    onChange(selectedMetrics.filter(m => !categoryMetrics.includes(m)));
  };

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="metric-selector-dropdown metric-selector-portal"
      style={{
        position: 'fixed',
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        zIndex: 99999
      }}
    >
      <div className="selected-metrics">
        {selectedMetrics.map(key => (
          <span
            key={key}
            className="selected-tag"
            style={{ borderColor: METRIC_COLORS[key] }}
            onClick={() => toggleMetric(key)}
          >
            {AVAILABLE_METRICS[key]?.label || key}
            <span className="remove">x</span>
          </span>
        ))}
      </div>

      <div className="metric-categories">
        {categories.map(category => (
          <div key={category} className="metric-category">
            <div className="category-header">
              <span className="category-name">{category}</span>
              <div className="category-actions">
                <button onClick={() => selectAll(category)}>All</button>
                <button onClick={() => clearCategory(category)}>Clear</button>
              </div>
            </div>
            <div className="metric-options">
              {Object.entries(AVAILABLE_METRICS)
                .filter(([_, m]) => m.category === category)
                .map(([key, metric]) => (
                  <label
                    key={key}
                    className={`metric-option ${selectedMetrics.includes(key) ? 'selected' : ''}`}
                    title={metric.description}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(key)}
                      onChange={() => toggleMetric(key)}
                      disabled={!selectedMetrics.includes(key) && selectedMetrics.length >= maxSelection}
                    />
                    <span
                      className="metric-color"
                      style={{ backgroundColor: METRIC_COLORS[key] }}
                    />
                    {metric.label}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="metric-selector">
      <button
        ref={buttonRef}
        className="metric-selector-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        {mode === 'chart' ? 'Select Chart Metrics' : 'Select Table Columns'}
        ({selectedMetrics.length}/{maxSelection})
        <span className={`arrow ${isOpen ? 'open' : ''}`}>&#9660;</span>
      </button>

      {isOpen && createPortal(dropdownContent, document.body)}
    </div>
  );
}

export default MetricSelector;
