import React, { useState } from 'react';
import './MetricSelector.css';

// Define all available metrics with their metadata
export const AVAILABLE_METRICS = {
  // Profitability
  roic: { label: 'ROIC', category: 'Profitability', format: 'percent', description: 'Return on Invested Capital' },
  roe: { label: 'ROE', category: 'Profitability', format: 'percent', description: 'Return on Equity' },
  roa: { label: 'ROA', category: 'Profitability', format: 'percent', description: 'Return on Assets' },

  // Margins
  gross_margin: { label: 'Gross Margin', category: 'Margins', format: 'percent', description: 'Gross Profit / Revenue' },
  operating_margin: { label: 'Operating Margin', category: 'Margins', format: 'percent', description: 'Operating Income / Revenue' },
  net_margin: { label: 'Net Margin', category: 'Margins', format: 'percent', description: 'Net Income / Revenue' },

  // Cash Flow
  fcf: { label: 'FCF', category: 'Cash Flow', format: 'currency', description: 'Free Cash Flow' },
  fcf_yield: { label: 'FCF Yield', category: 'Cash Flow', format: 'percent', description: 'FCF / Market Cap' },
  fcf_margin: { label: 'FCF Margin', category: 'Cash Flow', format: 'percent', description: 'FCF / Revenue' },
  owner_earnings: { label: 'Owner Earnings', category: 'Cash Flow', format: 'currency', description: 'Buffett\'s preferred metric' },

  // Valuation
  pe_ratio: { label: 'P/E', category: 'Valuation', format: 'ratio', description: 'Price to Earnings' },
  pb_ratio: { label: 'P/B', category: 'Valuation', format: 'ratio', description: 'Price to Book' },
  ps_ratio: { label: 'P/S', category: 'Valuation', format: 'ratio', description: 'Price to Sales' },
  ev_ebitda: { label: 'EV/EBITDA', category: 'Valuation', format: 'ratio', description: 'Enterprise Value / EBITDA' },
  earnings_yield: { label: 'Earnings Yield', category: 'Valuation', format: 'percent', description: 'Earnings / Market Cap' },

  // Financial Health
  debt_to_equity: { label: 'Debt/Equity', category: 'Financial Health', format: 'ratio', description: 'Total Debt / Equity' },
  debt_to_assets: { label: 'Debt/Assets', category: 'Financial Health', format: 'ratio', description: 'Total Debt / Assets' },
  current_ratio: { label: 'Current Ratio', category: 'Financial Health', format: 'ratio', description: 'Current Assets / Current Liabilities' },
  quick_ratio: { label: 'Quick Ratio', category: 'Financial Health', format: 'ratio', description: 'Liquid Assets / Current Liabilities' },
  interest_coverage: { label: 'Interest Coverage', category: 'Financial Health', format: 'ratio', description: 'EBIT / Interest Expense' },

  // Growth
  revenue_growth_yoy: { label: 'Revenue Growth', category: 'Growth', format: 'percent', description: 'Year-over-Year Revenue Growth' },
  earnings_growth_yoy: { label: 'Earnings Growth', category: 'Growth', format: 'percent', description: 'Year-over-Year Earnings Growth' },
  fcf_growth_yoy: { label: 'FCF Growth', category: 'Growth', format: 'percent', description: 'Year-over-Year FCF Growth' },

  // Efficiency
  asset_turnover: { label: 'Asset Turnover', category: 'Efficiency', format: 'ratio', description: 'Revenue / Assets' }
};

// Default selected metrics for chart
export const DEFAULT_CHART_METRICS = ['roic', 'net_margin', 'fcf_yield'];

// Default selected metrics for table
export const DEFAULT_TABLE_METRICS = ['roic', 'roe', 'net_margin', 'fcf_yield', 'debt_to_equity', 'current_ratio'];

// Chart colors for metrics
export const METRIC_COLORS = {
  roic: '#8b5cf6',
  roe: '#3b82f6',
  roa: '#06b6d4',
  gross_margin: '#10b981',
  operating_margin: '#22c55e',
  net_margin: '#84cc16',
  fcf: '#eab308',
  fcf_yield: '#f59e0b',
  fcf_margin: '#f97316',
  owner_earnings: '#ef4444',
  pe_ratio: '#ec4899',
  pb_ratio: '#d946ef',
  ps_ratio: '#a855f7',
  ev_ebitda: '#8b5cf6',
  earnings_yield: '#6366f1',
  debt_to_equity: '#f43f5e',
  debt_to_assets: '#fb7185',
  current_ratio: '#14b8a6',
  quick_ratio: '#2dd4bf',
  interest_coverage: '#5eead4',
  revenue_growth_yoy: '#22d3ee',
  earnings_growth_yoy: '#38bdf8',
  fcf_growth_yoy: '#60a5fa',
  asset_turnover: '#818cf8'
};

function MetricSelector({ selectedMetrics, onChange, maxSelection = 6, mode = 'chart' }) {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [...new Set(Object.values(AVAILABLE_METRICS).map(m => m.category))];

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

  return (
    <div className="metric-selector">
      <button
        className="metric-selector-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        {mode === 'chart' ? 'Select Chart Metrics' : 'Select Table Columns'}
        ({selectedMetrics.length}/{maxSelection})
        <span className={`arrow ${isOpen ? 'open' : ''}`}>&#9660;</span>
      </button>

      {isOpen && (
        <div className="metric-selector-dropdown">
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
      )}
    </div>
  );
}

export default MetricSelector;
