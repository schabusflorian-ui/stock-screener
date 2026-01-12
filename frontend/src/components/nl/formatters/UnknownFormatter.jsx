/**
 * UnknownFormatter - Smart fallback for unmapped response types
 *
 * Tries to intelligently display unknown types:
 * 1. Check for interpretation/summary → render as markdown
 * 2. Check for array data → render as table
 * 3. Last resort: styled JSON
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Info } from 'lucide-react';
import './Formatters.css';

function UnknownFormatter({ result, onSymbolClick }) {
  const { type, ...data } = result;

  // Handle error type specifically
  if (type === 'error') {
    return (
      <div className="fmt-error">
        <AlertCircle size={18} />
        <span>{data.message || 'An error occurred'}</span>
      </div>
    );
  }

  // Try to find text content to display
  const textContent = data.interpretation || data.message || data.answer || data.text;
  if (textContent) {
    return (
      <div className="fmt-unknown-text">
        {data.symbol && (
          <div className="fmt-header">
            <span
              className="fmt-symbol"
              onClick={() => onSymbolClick?.(data.symbol)}
            >
              {data.symbol}
            </span>
            {data.name && <span className="fmt-name">{data.name}</span>}
          </div>
        )}
        <div className="fmt-text-content">
          <ReactMarkdown>{textContent}</ReactMarkdown>
        </div>
        {/* Show additional data if present */}
        {data.data && typeof data.data === 'object' && (
          <DataPreview data={data.data} />
        )}
      </div>
    );
  }

  // Check for array-like data (holdings, results, etc.)
  const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0);
  if (arrayKey) {
    return (
      <div className="fmt-unknown-list">
        {data.symbol && (
          <div className="fmt-header">
            <span className="fmt-symbol" onClick={() => onSymbolClick?.(data.symbol)}>
              {data.symbol}
            </span>
          </div>
        )}
        <h4 className="fmt-section-title">{formatLabel(arrayKey)}</h4>
        <SmartTable data={data[arrayKey]} onSymbolClick={onSymbolClick} />
      </div>
    );
  }

  // Check for metrics_by_category (common in data_response)
  if (data.metrics_by_category) {
    return (
      <div className="fmt-metrics-categories">
        {data.symbol && (
          <div className="fmt-header">
            <span className="fmt-symbol" onClick={() => onSymbolClick?.(data.symbol)}>
              {data.symbol}
            </span>
            {data.name && <span className="fmt-name">{data.name}</span>}
          </div>
        )}
        {Object.entries(data.metrics_by_category).map(([category, metrics]) => (
          <div key={category} className="fmt-metric-category">
            <h4 className="fmt-category-title">{formatLabel(category)}</h4>
            <div className="fmt-metrics-grid">
              {metrics.map((metric, i) => (
                <div key={i} className="fmt-metric-card">
                  <span className="fmt-metric-label">{metric.name}</span>
                  <span className="fmt-metric-value">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Last resort: formatted JSON with type badge
  return (
    <div className="fmt-unknown-json">
      <div className="fmt-unknown-header">
        <Info size={14} />
        <span className="fmt-type-badge">{type || 'unknown'}</span>
      </div>
      <pre className="fmt-json">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

/**
 * Smart table that tries to display array data intelligently
 */
function SmartTable({ data, onSymbolClick }) {
  if (!data || data.length === 0) return null;

  // Get columns from first item
  const firstItem = data[0];
  const columns = Object.keys(firstItem).filter(k =>
    typeof firstItem[k] !== 'object' || firstItem[k] === null
  );

  // Limit to 5 columns max
  const displayColumns = columns.slice(0, 5);

  return (
    <div className="fmt-table-wrapper">
      <table className="fmt-table">
        <thead>
          <tr>
            {displayColumns.map(col => (
              <th key={col}>{formatLabel(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((row, i) => (
            <tr key={i}>
              {displayColumns.map(col => (
                <td key={col}>
                  {col === 'symbol' ? (
                    <span
                      className="fmt-symbol-link"
                      onClick={() => onSymbolClick?.(row[col])}
                    >
                      {row[col]}
                    </span>
                  ) : (
                    formatValue(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 10 && (
        <div className="fmt-table-more">
          +{data.length - 10} more items
        </div>
      )}
    </div>
  );
}

/**
 * Preview nested data objects
 */
function DataPreview({ data }) {
  if (!data || typeof data !== 'object') return null;

  const entries = Object.entries(data).slice(0, 6);

  return (
    <div className="fmt-data-preview">
      {entries.map(([key, value]) => (
        <div key={key} className="fmt-preview-item">
          <span className="fmt-preview-label">{formatLabel(key)}</span>
          <span className="fmt-preview-value">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Format a label from snake_case or camelCase
 */
function formatLabel(str) {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default UnknownFormatter;
