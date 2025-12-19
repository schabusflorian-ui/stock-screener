import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './MetricSelector.css';

// Define all available metrics with their metadata
export const AVAILABLE_METRICS = {
  // Stock Price
  stock_price: { label: 'Stock Price', category: 'Price', format: 'currency', description: 'Stock price at period end' },

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
  tobins_q: { label: "Tobin's Q", category: 'Valuation', format: 'ratio', description: '(Market Cap + Debt) / Total Assets' },
  graham_number: { label: 'Graham Number', category: 'Valuation', format: 'currency', description: 'Benjamin Graham intrinsic value: √(22.5 × EPS × BVPS)' },

  // Shareholder Returns
  dividend_yield: { label: 'Dividend Yield', category: 'Shareholder Returns', format: 'percent', description: 'Annual Dividends / Market Cap' },
  buyback_yield: { label: 'Buyback Yield', category: 'Shareholder Returns', format: 'percent', description: 'Share Repurchases / Market Cap' },
  shareholder_yield: { label: 'Shareholder Yield', category: 'Shareholder Returns', format: 'percent', description: 'Dividends + Buybacks / Market Cap' },

  // Financial Health
  debt_to_equity: { label: 'Debt/Equity', category: 'Financial Health', format: 'ratio', description: 'Total Debt / Equity' },
  debt_to_assets: { label: 'Debt/Assets', category: 'Financial Health', format: 'ratio', description: 'Total Debt / Assets' },
  current_ratio: { label: 'Current Ratio', category: 'Financial Health', format: 'ratio', description: 'Current Assets / Current Liabilities' },
  quick_ratio: { label: 'Quick Ratio', category: 'Financial Health', format: 'ratio', description: 'Liquid Assets / Current Liabilities' },
  interest_coverage: { label: 'Interest Coverage', category: 'Financial Health', format: 'ratio', description: 'EBIT / Interest Expense' },

  // Growth (Year-over-Year)
  revenue_growth_yoy: { label: 'Revenue Growth YoY', category: 'Growth', format: 'percent', description: 'Year-over-Year Revenue Growth' },
  earnings_growth_yoy: { label: 'Earnings Growth YoY', category: 'Growth', format: 'percent', description: 'Year-over-Year Earnings Growth' },
  fcf_growth_yoy: { label: 'FCF Growth YoY', category: 'Growth', format: 'percent', description: 'Year-over-Year FCF Growth' },
  // Growth (Quarter-over-Quarter)
  revenue_growth_qoq: { label: 'Revenue Growth QoQ', category: 'Growth', format: 'percent', description: 'Quarter-over-Quarter Revenue Growth' },
  earnings_growth_qoq: { label: 'Earnings Growth QoQ', category: 'Growth', format: 'percent', description: 'Quarter-over-Quarter Earnings Growth' },
  // Growth (CAGR - Compound Annual Growth Rate)
  revenue_cagr_3y: { label: 'Revenue CAGR 3Y', category: 'Growth', format: 'percent', description: '3-Year Compound Annual Revenue Growth' },
  revenue_cagr_5y: { label: 'Revenue CAGR 5Y', category: 'Growth', format: 'percent', description: '5-Year Compound Annual Revenue Growth' },
  earnings_cagr_3y: { label: 'Earnings CAGR 3Y', category: 'Growth', format: 'percent', description: '3-Year Compound Annual Earnings Growth' },
  earnings_cagr_5y: { label: 'Earnings CAGR 5Y', category: 'Growth', format: 'percent', description: '5-Year Compound Annual Earnings Growth' },

  // Efficiency
  asset_turnover: { label: 'Asset Turnover', category: 'Efficiency', format: 'ratio', description: 'Revenue / Assets' },

  // DuPont Analysis
  equity_multiplier: { label: 'Equity Multiplier', category: 'DuPont Analysis', format: 'ratio', description: 'Total Assets / Equity (leverage)' },
  dupont_roe: { label: 'DuPont ROE', category: 'DuPont Analysis', format: 'percent', description: 'Net Margin × Asset Turnover × Equity Multiplier' },

  // Risk Metrics
  max_drawdown_1y: { label: 'Max Drawdown 1Y', category: 'Risk', format: 'percent', description: 'Maximum peak-to-trough decline over 1 year' },
  max_drawdown_3y: { label: 'Max Drawdown 3Y', category: 'Risk', format: 'percent', description: 'Maximum peak-to-trough decline over 3 years' },
  max_drawdown_5y: { label: 'Max Drawdown 5Y', category: 'Risk', format: 'percent', description: 'Maximum peak-to-trough decline over 5 years' }
};

// Default selected metrics for chart (stock_price first when available)
export const DEFAULT_CHART_METRICS = ['stock_price', 'roic', 'net_margin'];

// Default selected metrics for table
export const DEFAULT_TABLE_METRICS = ['roic', 'roe', 'net_margin', 'fcf_yield', 'debt_to_equity', 'current_ratio'];

// Chart colors for metrics
export const METRIC_COLORS = {
  stock_price: '#059669',  // Green for price
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
  tobins_q: '#7c3aed',
  graham_number: '#059669',
  dividend_yield: '#dc2626',
  buyback_yield: '#2563eb',
  shareholder_yield: '#7c2d12',
  debt_to_equity: '#f43f5e',
  debt_to_assets: '#fb7185',
  current_ratio: '#14b8a6',
  quick_ratio: '#2dd4bf',
  interest_coverage: '#5eead4',
  revenue_growth_yoy: '#22d3ee',
  earnings_growth_yoy: '#38bdf8',
  fcf_growth_yoy: '#60a5fa',
  revenue_growth_qoq: '#0ea5e9',
  earnings_growth_qoq: '#0284c7',
  revenue_cagr_3y: '#06b6d4',
  revenue_cagr_5y: '#0891b2',
  earnings_cagr_3y: '#0d9488',
  earnings_cagr_5y: '#059669',
  asset_turnover: '#818cf8',
  equity_multiplier: '#a78bfa',
  dupont_roe: '#c084fc',
  // Risk
  max_drawdown_1y: '#ef4444',
  max_drawdown_3y: '#dc2626',
  max_drawdown_5y: '#b91c1c'
};

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
