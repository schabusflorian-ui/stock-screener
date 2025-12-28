/**
 * UNIFIED METRICS CONFIGURATION
 *
 * This is the SINGLE SOURCE OF TRUTH for all metric definitions across the application.
 * All components should import from this file instead of defining their own metric lists.
 *
 * When adding a new metric:
 * 1. Add it to METRICS object below
 * 2. The metric will automatically appear in all metric selectors, tables, and charts
 *
 * Metric Properties:
 * - key: Unique identifier matching backend field name
 * - label: Display name for UI
 * - shortLabel: Abbreviated label for compact displays (optional, defaults to label)
 * - category: Category for grouping in selectors
 * - format: 'percent' | 'ratio' | 'currency' | 'currency_price' | 'currency_large' | 'number' | 'text' | 'date'
 * - description: Tooltip/help text
 * - higherBetter: true | false | null (null = neutral, used for color coding comparisons)
 * - colorThresholds: { good: number, bad: number } for table cell coloring (optional)
 * - color: Default chart color (optional, auto-assigned if not specified)
 * - hasHistorical: true if we have historical time-series data per fiscal period, false otherwise
 */

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

export const METRICS = {
  // ─────────────────────────────────────────────────────────────────────────
  // PRICE & MARKET DATA
  // ─────────────────────────────────────────────────────────────────────────
  stock_price: {
    label: 'Stock Price',
    category: 'Price',
    format: 'currency_price',
    description: 'Current stock price',
    higherBetter: null,
    hasHistorical: false, // Current snapshot only
    color: '#059669'
  },
  current_price: {
    label: 'Current Price',
    category: 'Price',
    format: 'currency_price',
    description: 'Latest stock price',
    higherBetter: null,
    hasHistorical: false, // Current snapshot only
    color: '#059669'
  },
  market_cap: {
    label: 'Market Cap',
    category: 'Price',
    format: 'currency_large',
    description: 'Total market capitalization',
    higherBetter: null,
    hasHistorical: true, // shares_outstanding × price at fiscal period end
    color: '#3b82f6'
  },
  enterprise_value: {
    label: 'Enterprise Value',
    category: 'Price',
    format: 'currency_large',
    description: 'Market Cap + Debt - Cash',
    higherBetter: null,
    hasHistorical: true, // market_cap + debt - cash per fiscal period
    color: '#6366f1'
  },
  beta: {
    label: 'Beta',
    category: 'Price',
    format: 'ratio',
    description: 'Stock volatility vs market',
    higherBetter: null,
    hasHistorical: false, // Current snapshot only
    color: '#8b5cf6'
  },

  // Price Changes
  change_1d: {
    label: '1D Change',
    shortLabel: '1D',
    category: 'Price Performance',
    format: 'percent',
    description: '1 day price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#10b981'
  },
  change_1w: {
    label: '1W Change',
    shortLabel: '1W',
    category: 'Price Performance',
    format: 'percent',
    description: '1 week price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#22c55e'
  },
  change_1m: {
    label: '1M Change',
    shortLabel: '1M',
    category: 'Price Performance',
    format: 'percent',
    description: '1 month price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#84cc16'
  },
  change_3m: {
    label: '3M Change',
    shortLabel: '3M',
    category: 'Price Performance',
    format: 'percent',
    description: '3 month price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#eab308'
  },
  change_ytd: {
    label: 'YTD Change',
    shortLabel: 'YTD',
    category: 'Price Performance',
    format: 'percent',
    description: 'Year-to-date price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#f59e0b'
  },
  change_1y: {
    label: '1Y Change',
    shortLabel: '1Y',
    category: 'Price Performance',
    format: 'percent',
    description: '1 year price change',
    higherBetter: true,
    hasHistorical: false, // Point-in-time calculation
    color: '#f97316'
  },
  high_52w: {
    label: '52W High',
    category: 'Price Performance',
    format: 'currency_price',
    description: '52 week high',
    higherBetter: null,
    hasHistorical: false, // Rolling window calculation
    color: '#22c55e'
  },
  low_52w: {
    label: '52W Low',
    category: 'Price Performance',
    format: 'currency_price',
    description: '52 week low',
    higherBetter: null,
    hasHistorical: false, // Rolling window calculation
    color: '#ef4444'
  },
  from_52w_high: {
    label: 'From 52W High',
    category: 'Price Performance',
    format: 'percent',
    description: 'Distance from 52 week high',
    higherBetter: false,
    hasHistorical: false, // Point-in-time calculation
    color: '#f43f5e'
  },

  // Alpha (vs S&P 500) - Performance relative to market benchmark
  // Alpha can be viewed as a time series via the /api/indices/alpha/timeseries/:symbol endpoint
  alpha_1d: {
    label: 'Alpha 1D',
    shortLabel: 'α 1D',
    category: 'Alpha',
    format: 'percent',
    description: '1 day return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 1, bad: -1 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#7c3aed'
  },
  alpha_1w: {
    label: 'Alpha 1W',
    shortLabel: 'α 1W',
    category: 'Alpha',
    format: 'percent',
    description: '1 week return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 2, bad: -2 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#8b5cf6'
  },
  alpha_1m: {
    label: 'Alpha 1M',
    shortLabel: 'α 1M',
    category: 'Alpha',
    format: 'percent',
    description: '1 month return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 3, bad: -3 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#a855f7'
  },
  alpha_3m: {
    label: 'Alpha 3M',
    shortLabel: 'α 3M',
    category: 'Alpha',
    format: 'percent',
    description: '3 month return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 5, bad: -5 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#c084fc'
  },
  alpha_6m: {
    label: 'Alpha 6M',
    shortLabel: 'α 6M',
    category: 'Alpha',
    format: 'percent',
    description: '6 month return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 8, bad: -8 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#d946ef'
  },
  alpha_ytd: {
    label: 'Alpha YTD',
    shortLabel: 'α YTD',
    category: 'Alpha',
    format: 'percent',
    description: 'Year-to-date return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 10, bad: -10 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#e879f9'
  },
  alpha_1y: {
    label: 'Alpha 1Y',
    shortLabel: 'α 1Y',
    category: 'Alpha',
    format: 'percent',
    description: '1 year return vs S&P 500 (SPY)',
    higherBetter: true,
    colorThresholds: { good: 15, bad: -15 },
    hasHistorical: true, // Time series available via alpha/timeseries API
    color: '#f472b6'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FINANCIALS (ABSOLUTE VALUES)
  // ─────────────────────────────────────────────────────────────────────────
  revenue: {
    label: 'Revenue',
    category: 'Financials',
    format: 'currency',
    description: 'Total Revenue',
    higherBetter: true,
    hasHistorical: true, // From financial statements per fiscal period
    color: '#3b82f6'
  },
  net_income: {
    label: 'Net Income',
    category: 'Financials',
    format: 'currency',
    description: 'Net Income (Earnings)',
    higherBetter: true,
    hasHistorical: true, // From financial statements per fiscal period
    color: '#10b981'
  },
  operating_income: {
    label: 'Operating Income',
    category: 'Financials',
    format: 'currency',
    description: 'Operating Income',
    higherBetter: true,
    hasHistorical: true, // From financial statements per fiscal period
    color: '#8b5cf6'
  },
  gross_profit: {
    label: 'Gross Profit',
    category: 'Financials',
    format: 'currency',
    description: 'Gross Profit',
    higherBetter: true,
    hasHistorical: true, // From financial statements per fiscal period
    color: '#06b6d4'
  },
  ebitda: {
    label: 'EBITDA',
    category: 'Financials',
    format: 'currency',
    description: 'Earnings Before Interest, Taxes, Depreciation & Amortization',
    higherBetter: true,
    hasHistorical: true, // From financial statements per fiscal period
    color: '#f59e0b'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PROFITABILITY
  // ─────────────────────────────────────────────────────────────────────────
  roic: {
    label: 'ROIC',
    category: 'Profitability',
    format: 'percent',
    description: 'Return on Invested Capital',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 8 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#8b5cf6'
  },
  roe: {
    label: 'ROE',
    category: 'Profitability',
    format: 'percent',
    description: 'Return on Equity',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 8 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#3b82f6'
  },
  roa: {
    label: 'ROA',
    category: 'Profitability',
    format: 'percent',
    description: 'Return on Assets',
    higherBetter: true,
    colorThresholds: { good: 10, bad: 5 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#06b6d4'
  },
  roce: {
    label: 'ROCE',
    category: 'Profitability',
    format: 'percent',
    description: 'Return on Capital Employed',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 8 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#0ea5e9'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MARGINS
  // ─────────────────────────────────────────────────────────────────────────
  gross_margin: {
    label: 'Gross Margin',
    category: 'Margins',
    format: 'percent',
    description: 'Gross Profit / Revenue',
    higherBetter: true,
    colorThresholds: { good: 40, bad: 20 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#10b981'
  },
  operating_margin: {
    label: 'Operating Margin',
    category: 'Margins',
    format: 'percent',
    description: 'Operating Income / Revenue',
    higherBetter: true,
    colorThresholds: { good: 20, bad: 10 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#22c55e'
  },
  net_margin: {
    label: 'Net Margin',
    category: 'Margins',
    format: 'percent',
    description: 'Net Income / Revenue',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 5 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#84cc16'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CASH FLOW
  // ─────────────────────────────────────────────────────────────────────────
  fcf: {
    label: 'Free Cash Flow',
    shortLabel: 'FCF',
    category: 'Cash Flow',
    format: 'currency',
    description: 'Free Cash Flow',
    higherBetter: true,
    hasHistorical: true, // From cash flow statements per fiscal period
    color: '#eab308'
  },
  fcf_yield: {
    label: 'FCF Yield',
    category: 'Cash Flow',
    format: 'percent',
    description: 'Free Cash Flow / Market Cap',
    higherBetter: true,
    colorThresholds: { good: 5, bad: 2 },
    hasHistorical: false, // Requires current market cap
    color: '#f59e0b'
  },
  fcf_margin: {
    label: 'FCF Margin',
    category: 'Cash Flow',
    format: 'percent',
    description: 'Free Cash Flow / Revenue',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 5 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#f97316'
  },
  owner_earnings: {
    label: 'Owner Earnings',
    category: 'Cash Flow',
    format: 'currency',
    description: "Buffett's preferred metric: Net Income + D&A - CapEx",
    higherBetter: true,
    hasHistorical: true, // Calculated per fiscal period
    color: '#ef4444'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VALUATION
  // ─────────────────────────────────────────────────────────────────────────
  pe_ratio: {
    label: 'P/E Ratio',
    shortLabel: 'P/E',
    category: 'Valuation',
    format: 'ratio',
    description: 'Price to Earnings',
    higherBetter: false,
    colorThresholds: { good: 15, bad: 30, inverse: true },
    hasHistorical: false, // Requires current market price
    color: '#ec4899'
  },
  pb_ratio: {
    label: 'P/B Ratio',
    shortLabel: 'P/B',
    category: 'Valuation',
    format: 'ratio',
    description: 'Price to Book Value',
    higherBetter: false,
    colorThresholds: { good: 1.5, bad: 4, inverse: true },
    hasHistorical: false, // Requires current market price
    color: '#d946ef'
  },
  ps_ratio: {
    label: 'P/S Ratio',
    shortLabel: 'P/S',
    category: 'Valuation',
    format: 'ratio',
    description: 'Price to Sales',
    higherBetter: false,
    colorThresholds: { good: 2, bad: 8, inverse: true },
    hasHistorical: false, // Requires current market price
    color: '#a855f7'
  },
  ev_ebitda: {
    label: 'EV/EBITDA',
    category: 'Valuation',
    format: 'ratio',
    description: 'Enterprise Value / EBITDA',
    higherBetter: false,
    colorThresholds: { good: 10, bad: 20, inverse: true },
    hasHistorical: false, // Requires current EV (market cap based)
    color: '#8b5cf6'
  },
  peg_ratio: {
    label: 'PEG Ratio',
    shortLabel: 'PEG',
    category: 'Valuation',
    format: 'ratio',
    description: 'P/E / Earnings Growth Rate (<1 = undervalued)',
    higherBetter: false,
    colorThresholds: { good: 1, bad: 2, inverse: true },
    hasHistorical: false, // Requires current P/E
    color: '#c026d3'
  },
  pegy_ratio: {
    label: 'PEGY Ratio',
    shortLabel: 'PEGY',
    category: 'Valuation',
    format: 'ratio',
    description: 'P/E / (Earnings Growth + Dividend Yield)',
    higherBetter: false,
    colorThresholds: { good: 1, bad: 2, inverse: true },
    hasHistorical: false, // Requires current P/E
    color: '#db2777'
  },
  earnings_yield: {
    label: 'Earnings Yield',
    category: 'Valuation',
    format: 'percent',
    description: 'Earnings / Market Cap (inverse of P/E)',
    higherBetter: true,
    colorThresholds: { good: 8, bad: 3 },
    hasHistorical: false, // Requires current market cap
    color: '#6366f1'
  },
  tobins_q: {
    label: "Tobin's Q",
    category: 'Valuation',
    format: 'ratio',
    description: '(Market Cap + Debt) / Total Assets',
    higherBetter: false,
    hasHistorical: false, // Requires current market cap
    color: '#7c3aed'
  },
  graham_number: {
    label: 'Graham Number',
    category: 'Valuation',
    format: 'currency_price',
    description: 'Benjamin Graham intrinsic value: √(22.5 × EPS × BVPS)',
    higherBetter: null,
    hasHistorical: true, // Calculated from EPS and BVPS per period
    color: '#059669'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SHAREHOLDER RETURNS
  // ─────────────────────────────────────────────────────────────────────────
  dividend_yield: {
    label: 'Dividend Yield',
    category: 'Shareholder Returns',
    format: 'percent',
    description: 'Annual Dividends / Market Cap',
    higherBetter: true,
    colorThresholds: { good: 3, bad: 0 },
    hasHistorical: false, // Requires current market cap
    color: '#dc2626'
  },
  buyback_yield: {
    label: 'Buyback Yield',
    category: 'Shareholder Returns',
    format: 'percent',
    description: 'Share Repurchases / Market Cap',
    higherBetter: true,
    colorThresholds: { good: 2, bad: 0 },
    hasHistorical: false, // Requires current market cap
    color: '#2563eb'
  },
  shareholder_yield: {
    label: 'Shareholder Yield',
    category: 'Shareholder Returns',
    format: 'percent',
    description: 'Dividends + Buybacks / Market Cap',
    higherBetter: true,
    colorThresholds: { good: 5, bad: 1 },
    hasHistorical: false, // Requires current market cap
    color: '#7c2d12'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FINANCIAL HEALTH
  // ─────────────────────────────────────────────────────────────────────────
  debt_to_equity: {
    label: 'Debt/Equity',
    shortLabel: 'D/E',
    category: 'Financial Health',
    format: 'ratio',
    description: 'Total Debt / Equity',
    higherBetter: false,
    colorThresholds: { good: 0.5, bad: 2, inverse: true },
    hasHistorical: true, // Calculated per fiscal period
    color: '#f43f5e'
  },
  debt_to_assets: {
    label: 'Debt/Assets',
    shortLabel: 'D/A',
    category: 'Financial Health',
    format: 'ratio',
    description: 'Total Debt / Assets',
    higherBetter: false,
    colorThresholds: { good: 0.3, bad: 0.6, inverse: true },
    hasHistorical: true, // Calculated per fiscal period
    color: '#fb7185'
  },
  current_ratio: {
    label: 'Current Ratio',
    category: 'Financial Health',
    format: 'ratio',
    description: 'Current Assets / Current Liabilities',
    higherBetter: true,
    colorThresholds: { good: 1.5, bad: 1 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#14b8a6'
  },
  quick_ratio: {
    label: 'Quick Ratio',
    category: 'Financial Health',
    format: 'ratio',
    description: 'Liquid Assets / Current Liabilities',
    higherBetter: true,
    colorThresholds: { good: 1, bad: 0.5 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#2dd4bf'
  },
  interest_coverage: {
    label: 'Interest Coverage',
    category: 'Financial Health',
    format: 'ratio',
    description: 'EBIT / Interest Expense',
    higherBetter: true,
    colorThresholds: { good: 5, bad: 2 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#5eead4'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GROWTH
  // ─────────────────────────────────────────────────────────────────────────
  revenue_growth_yoy: {
    label: 'Revenue Growth YoY',
    shortLabel: 'Rev YoY',
    category: 'Growth',
    format: 'percent',
    description: 'Year-over-Year Revenue Growth',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 0 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#22d3ee'
  },
  earnings_growth_yoy: {
    label: 'Earnings Growth YoY',
    shortLabel: 'Earn YoY',
    category: 'Growth',
    format: 'percent',
    description: 'Year-over-Year Earnings Growth',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 0 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#38bdf8'
  },
  fcf_growth_yoy: {
    label: 'FCF Growth YoY',
    category: 'Growth',
    format: 'percent',
    description: 'Year-over-Year Free Cash Flow Growth',
    higherBetter: true,
    colorThresholds: { good: 15, bad: 0 },
    hasHistorical: true, // Calculated per fiscal period
    color: '#60a5fa'
  },
  revenue_growth_qoq: {
    label: 'Revenue Growth QoQ',
    shortLabel: 'Rev QoQ',
    category: 'Growth',
    format: 'percent',
    description: 'Quarter-over-Quarter Revenue Growth',
    higherBetter: true,
    hasHistorical: true, // Calculated per fiscal period
    color: '#0ea5e9'
  },
  earnings_growth_qoq: {
    label: 'Earnings Growth QoQ',
    shortLabel: 'Earn QoQ',
    category: 'Growth',
    format: 'percent',
    description: 'Quarter-over-Quarter Earnings Growth',
    higherBetter: true,
    hasHistorical: true, // Calculated per fiscal period
    color: '#0284c7'
  },
  revenue_cagr_3y: {
    label: 'Revenue CAGR 3Y',
    category: 'Growth',
    format: 'percent',
    description: '3-Year Compound Annual Revenue Growth',
    higherBetter: true,
    colorThresholds: { good: 10, bad: 0 },
    hasHistorical: false, // Rolling calculation, not per-period
    color: '#06b6d4'
  },
  revenue_cagr_5y: {
    label: 'Revenue CAGR 5Y',
    category: 'Growth',
    format: 'percent',
    description: '5-Year Compound Annual Revenue Growth',
    higherBetter: true,
    colorThresholds: { good: 10, bad: 0 },
    hasHistorical: false, // Rolling calculation, not per-period
    color: '#0891b2'
  },
  earnings_cagr_3y: {
    label: 'Earnings CAGR 3Y',
    category: 'Growth',
    format: 'percent',
    description: '3-Year Compound Annual Earnings Growth',
    higherBetter: true,
    colorThresholds: { good: 10, bad: 0 },
    hasHistorical: false, // Rolling calculation, not per-period
    color: '#0d9488'
  },
  earnings_cagr_5y: {
    label: 'Earnings CAGR 5Y',
    category: 'Growth',
    format: 'percent',
    description: '5-Year Compound Annual Earnings Growth',
    higherBetter: true,
    colorThresholds: { good: 10, bad: 0 },
    hasHistorical: false, // Rolling calculation, not per-period
    color: '#059669'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EFFICIENCY & DUPONT ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────
  asset_turnover: {
    label: 'Asset Turnover',
    category: 'Efficiency',
    format: 'ratio',
    description: 'Revenue / Assets',
    higherBetter: true,
    hasHistorical: true, // Calculated per fiscal period
    color: '#818cf8'
  },
  equity_multiplier: {
    label: 'Equity Multiplier',
    category: 'Efficiency',
    format: 'ratio',
    description: 'Total Assets / Equity (leverage)',
    higherBetter: null,
    hasHistorical: true, // Calculated per fiscal period
    color: '#a78bfa'
  },
  dupont_roe: {
    label: 'DuPont ROE',
    category: 'Efficiency',
    format: 'percent',
    description: 'Net Margin × Asset Turnover × Equity Multiplier',
    higherBetter: true,
    hasHistorical: true, // Calculated per fiscal period
    color: '#c084fc'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RISK METRICS
  // ─────────────────────────────────────────────────────────────────────────
  max_drawdown_1y: {
    label: 'Max Drawdown 1Y',
    shortLabel: 'DD 1Y',
    category: 'Risk',
    format: 'percent',
    description: 'Maximum peak-to-trough decline over 1 year',
    higherBetter: false,
    hasHistorical: false, // Rolling window calculation
    color: '#ef4444'
  },
  max_drawdown_3y: {
    label: 'Max Drawdown 3Y',
    shortLabel: 'DD 3Y',
    category: 'Risk',
    format: 'percent',
    description: 'Maximum peak-to-trough decline over 3 years',
    higherBetter: false,
    hasHistorical: false, // Rolling window calculation
    color: '#dc2626'
  },
  max_drawdown_5y: {
    label: 'Max Drawdown 5Y',
    shortLabel: 'DD 5Y',
    category: 'Risk',
    format: 'percent',
    description: 'Maximum peak-to-trough decline over 5 years',
    higherBetter: false,
    hasHistorical: false, // Rolling window calculation
    color: '#b91c1c'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // QUALITY SCORE
  // ─────────────────────────────────────────────────────────────────────────
  quality_score: {
    label: 'Quality Score',
    category: 'Quality',
    format: 'number',
    description: 'Composite quality score (0-100)',
    higherBetter: true,
    colorThresholds: { good: 70, bad: 40 },
    hasHistorical: false, // Current composite score
    color: '#8b5cf6'
  },
  data_quality_score: {
    label: 'Data Quality',
    category: 'Quality',
    format: 'number',
    description: 'Data completeness score',
    higherBetter: true,
    hasHistorical: false, // Current data quality assessment
    color: '#6366f1'
  }
};

// ============================================================================
// CATEGORY DEFINITIONS (for organized display)
// ============================================================================

export const METRIC_CATEGORIES = {
  price: {
    label: 'Price',
    metrics: ['stock_price', 'current_price', 'market_cap', 'enterprise_value', 'beta']
  },
  pricePerformance: {
    label: 'Price Performance',
    metrics: ['change_1d', 'change_1w', 'change_1m', 'change_3m', 'change_ytd', 'change_1y', 'high_52w', 'low_52w', 'from_52w_high']
  },
  alpha: {
    label: 'Alpha (vs S&P 500)',
    metrics: ['alpha_1d', 'alpha_1w', 'alpha_1m', 'alpha_3m', 'alpha_6m', 'alpha_ytd', 'alpha_1y']
  },
  financials: {
    label: 'Financials',
    metrics: ['revenue', 'net_income', 'operating_income', 'gross_profit', 'ebitda']
  },
  profitability: {
    label: 'Profitability',
    metrics: ['roic', 'roe', 'roa', 'roce']
  },
  margins: {
    label: 'Margins',
    metrics: ['gross_margin', 'operating_margin', 'net_margin']
  },
  cashFlow: {
    label: 'Cash Flow',
    metrics: ['fcf', 'fcf_yield', 'fcf_margin', 'owner_earnings']
  },
  valuation: {
    label: 'Valuation',
    metrics: ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda', 'peg_ratio', 'pegy_ratio', 'earnings_yield', 'tobins_q', 'graham_number']
  },
  shareholderReturns: {
    label: 'Shareholder Returns',
    metrics: ['dividend_yield', 'buyback_yield', 'shareholder_yield']
  },
  financialHealth: {
    label: 'Financial Health',
    metrics: ['debt_to_equity', 'debt_to_assets', 'current_ratio', 'quick_ratio', 'interest_coverage']
  },
  growth: {
    label: 'Growth',
    metrics: ['revenue_growth_yoy', 'earnings_growth_yoy', 'fcf_growth_yoy', 'revenue_growth_qoq', 'earnings_growth_qoq', 'revenue_cagr_3y', 'revenue_cagr_5y', 'earnings_cagr_3y', 'earnings_cagr_5y']
  },
  efficiency: {
    label: 'Efficiency',
    metrics: ['asset_turnover', 'equity_multiplier', 'dupont_roe']
  },
  risk: {
    label: 'Risk',
    metrics: ['max_drawdown_1y', 'max_drawdown_3y', 'max_drawdown_5y']
  },
  quality: {
    label: 'Quality',
    metrics: ['quality_score', 'data_quality_score']
  }
};

// ============================================================================
// DEFAULT SELECTIONS
// ============================================================================

export const DEFAULT_CHART_METRICS = ['stock_price', 'revenue', 'fcf'];
export const DEFAULT_TABLE_METRICS = ['roic', 'roe', 'net_margin', 'fcf_yield', 'debt_to_equity', 'current_ratio'];
export const DEFAULT_COMPARE_METRICS = ['roic', 'roe', 'gross_margin', 'net_margin', 'fcf_yield', 'peg_ratio', 'debt_to_equity', 'current_ratio', 'revenue_growth_yoy', 'dividend_yield'];
export const DEFAULT_SCREENING_COLUMNS = ['symbol', 'name', 'sector', 'roic', 'roe', 'net_margin', 'fcf_yield', 'pe_ratio', 'debt_to_equity', 'revenue_growth_yoy'];
export const RADAR_METRICS = ['roic', 'roe', 'gross_margin', 'net_margin', 'fcf_yield', 'current_ratio'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get metric definition by key
 */
export const getMetric = (key) => METRICS[key] || null;

/**
 * Get metric label (uses shortLabel if available)
 */
export const getMetricLabel = (key, useShort = false) => {
  const metric = METRICS[key];
  if (!metric) return key;
  return useShort && metric.shortLabel ? metric.shortLabel : metric.label;
};

/**
 * Get all metrics as an array with keys
 */
export const getMetricsArray = () => {
  return Object.entries(METRICS).map(([key, metric]) => ({
    key,
    ...metric
  }));
};

/**
 * Get metrics grouped by category
 */
export const getMetricsByCategory = () => {
  const result = {};
  for (const [catKey, catDef] of Object.entries(METRIC_CATEGORIES)) {
    result[catKey] = {
      label: catDef.label,
      metrics: catDef.metrics.map(key => ({
        key,
        ...METRICS[key]
      })).filter(m => m.label) // Filter out undefined metrics
    };
  }
  return result;
};

/**
 * Get metrics for a specific category
 */
export const getCategoryMetrics = (categoryKey) => {
  const category = METRIC_CATEGORIES[categoryKey];
  if (!category) return [];
  return category.metrics.map(key => ({
    key,
    ...METRICS[key]
  })).filter(m => m.label);
};

/**
 * Get all unique categories from METRICS
 */
export const getCategories = () => {
  return [...new Set(Object.values(METRICS).map(m => m.category))];
};

/**
 * Get metric color
 */
export const getMetricColor = (key) => {
  return METRICS[key]?.color || '#6b7280';
};

/**
 * Format a metric value based on its format type
 */
export const formatMetricValue = (value, key) => {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return '-';
  }

  const metric = METRICS[key];
  const format = metric?.format || 'number';

  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    case 'currency_price':
      return `$${value.toFixed(2)}`;
    case 'currency_large':
      if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      return `$${value.toFixed(0)}`;
    case 'number':
      return value.toFixed(1);
    case 'text':
    case 'date':
      return value;
    default:
      return typeof value === 'number' ? value.toFixed(2) : value;
  }
};

/**
 * Get color class for a metric value based on thresholds
 */
export const getMetricColorClass = (value, key) => {
  if (value === null || value === undefined) return '';

  const metric = METRICS[key];
  if (!metric?.colorThresholds) return '';

  const { good, bad, inverse } = metric.colorThresholds;

  if (inverse) {
    // Lower is better (e.g., P/E ratio)
    if (value <= good) return 'positive';
    if (value >= bad) return 'negative';
    return 'neutral';
  } else {
    // Higher is better (e.g., ROIC)
    if (value >= good) return 'positive';
    if (value <= bad) return 'negative';
    return 'neutral';
  }
};

/**
 * Check if a metric exists
 */
export const hasMetric = (key) => key in METRICS;

/**
 * Get all metric keys
 */
export const getAllMetricKeys = () => Object.keys(METRICS);

/**
 * Check if a metric has historical data available
 */
export const hasHistoricalData = (key) => {
  const metric = METRICS[key];
  return metric?.hasHistorical === true;
};

/**
 * Get all metrics that have historical data
 */
export const getHistoricalMetrics = () => {
  return Object.entries(METRICS)
    .filter(([_, metric]) => metric.hasHistorical === true)
    .map(([key, metric]) => ({ key, ...metric }));
};

/**
 * Get all metrics that do NOT have historical data
 */
export const getNonHistoricalMetrics = () => {
  return Object.entries(METRICS)
    .filter(([_, metric]) => metric.hasHistorical === false)
    .map(([key, metric]) => ({ key, ...metric }));
};

/**
 * Convert to METRIC_CATEGORIES format used by ComparePage (for backwards compatibility)
 */
export const getComparePageCategories = () => {
  const result = {};
  for (const [catKey, catDef] of Object.entries(METRIC_CATEGORIES)) {
    result[catKey] = {
      label: catDef.label,
      metrics: catDef.metrics.map(key => {
        const metric = METRICS[key];
        if (!metric) return null;
        return {
          key,
          label: metric.label,
          format: metric.format,
          description: metric.description,
          higherBetter: metric.higherBetter
        };
      }).filter(Boolean)
    };
  }
  return result;
};

// Export colors map for backwards compatibility with MetricSelector
export const METRIC_COLORS = Object.fromEntries(
  Object.entries(METRICS).map(([key, metric]) => [key, metric.color || '#6b7280'])
);
