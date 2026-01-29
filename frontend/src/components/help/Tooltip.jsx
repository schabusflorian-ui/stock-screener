// components/help/Tooltip.jsx
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { HelpCircle } from '../icons';
import './Tooltip.css';

export const HelpTooltip = ({ content, children, side = 'top', align = 'center' }) => {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children || (
            <button className="help-tooltip-trigger" aria-label="Help">
              <HelpCircle className="help-icon" />
            </button>
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="help-tooltip-content"
            sideOffset={5}
            side={side}
            align={align}
          >
            {typeof content === 'string' ? (
              <p>{content}</p>
            ) : (
              content
            )}
            <TooltipPrimitive.Arrow className="help-tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

// Metric-specific tooltip with structured info
export const MetricTooltip = ({ metric, children }) => {
  const explanation = METRIC_EXPLANATIONS[metric];

  if (!explanation) {
    return children || null;
  }

  return (
    <HelpTooltip
      content={
        <div className="metric-tooltip-content">
          <div className="metric-tooltip-title">{explanation.title}</div>
          <p className="metric-tooltip-description">{explanation.description}</p>
          {explanation.formula && (
            <div className="metric-tooltip-formula">
              <strong>Formula:</strong> {explanation.formula}
            </div>
          )}
          {explanation.interpretation && (
            <div className="metric-tooltip-interpretation">
              <strong>Interpretation:</strong> {explanation.interpretation}
            </div>
          )}
        </div>
      }
    >
      {children}
    </HelpTooltip>
  );
};

// Metric explanations library
export const METRIC_EXPLANATIONS = {
  pe_ratio: {
    title: 'P/E Ratio',
    description: 'Price-to-Earnings ratio shows how much investors pay for each dollar of earnings.',
    formula: 'Stock Price ÷ Earnings Per Share',
    interpretation: 'Lower may indicate undervaluation, higher may indicate growth expectations. Compare to industry average.',
  },
  market_cap: {
    title: 'Market Capitalization',
    description: 'Total market value of all outstanding shares.',
    formula: 'Share Price × Shares Outstanding',
    interpretation: 'Large cap (>$10B), Mid cap ($2-10B), Small cap (<$2B). Larger companies tend to be less volatile.',
  },
  dividend_yield: {
    title: 'Dividend Yield',
    description: 'Annual dividend payment as a percentage of stock price.',
    formula: 'Annual Dividends ÷ Stock Price × 100',
    interpretation: 'Higher yield means more income per dollar invested. Very high yields may indicate dividend risk.',
  },
  peg_ratio: {
    title: 'PEG Ratio',
    description: 'P/E ratio adjusted for earnings growth rate.',
    formula: 'P/E Ratio ÷ Earnings Growth Rate',
    interpretation: 'Below 1 may indicate undervaluation. Above 2 may suggest overvaluation relative to growth.',
  },
  rsi: {
    title: 'RSI (Relative Strength Index)',
    description: 'Momentum indicator measuring speed and magnitude of price changes.',
    formula: '100 - (100 ÷ (1 + Average Gain ÷ Average Loss))',
    interpretation: 'Above 70 = overbought (potential reversal down), below 30 = oversold (potential reversal up).',
  },
  beta: {
    title: 'Beta',
    description: 'Measure of stock volatility relative to the overall market.',
    formula: 'Covariance(Stock, Market) ÷ Variance(Market)',
    interpretation: 'Beta > 1: more volatile than market. Beta < 1: less volatile. Beta = 1: moves with market.',
  },
  debt_to_equity: {
    title: 'Debt-to-Equity Ratio',
    description: 'Measure of financial leverage comparing total debt to shareholder equity.',
    formula: 'Total Debt ÷ Total Equity',
    interpretation: 'Higher ratio means more debt financing. Compare to industry average. Very high may indicate risk.',
  },
  current_ratio: {
    title: 'Current Ratio',
    description: 'Liquidity measure comparing current assets to current liabilities.',
    formula: 'Current Assets ÷ Current Liabilities',
    interpretation: 'Above 1 means company can cover short-term obligations. Below 1 may indicate liquidity issues.',
  },
  roe: {
    title: 'Return on Equity (ROE)',
    description: 'Profitability measure showing how much profit a company generates with shareholders\' equity.',
    formula: 'Net Income ÷ Shareholder Equity × 100',
    interpretation: 'Higher is better. Above 15% is generally considered good. Compare to industry peers.',
  },
  gross_margin: {
    title: 'Gross Margin',
    description: 'Percentage of revenue remaining after subtracting cost of goods sold.',
    formula: '(Revenue - COGS) ÷ Revenue × 100',
    interpretation: 'Higher margins indicate pricing power and efficiency. Compare to competitors and historical trends.',
  },
  operating_margin: {
    title: 'Operating Margin',
    description: 'Percentage of revenue remaining after subtracting operating expenses.',
    formula: 'Operating Income ÷ Revenue × 100',
    interpretation: 'Measures operational efficiency. Higher is better. Compare to industry average.',
  },
  free_cash_flow: {
    title: 'Free Cash Flow',
    description: 'Cash generated after accounting for capital expenditures.',
    formula: 'Operating Cash Flow - Capital Expenditures',
    interpretation: 'Positive FCF indicates company can fund growth, pay dividends, or reduce debt.',
  },
  ev_ebitda: {
    title: 'EV/EBITDA',
    description: 'Enterprise Value to EBITDA ratio, a valuation metric.',
    formula: 'Enterprise Value ÷ EBITDA',
    interpretation: 'Lower values may indicate undervaluation. Compare across similar companies and industries.',
  },
  price_to_book: {
    title: 'Price-to-Book Ratio',
    description: 'Stock price relative to book value per share.',
    formula: 'Stock Price ÷ Book Value Per Share',
    interpretation: 'Below 1 may indicate undervaluation. Higher ratios common in growth/tech companies.',
  },
  price_to_sales: {
    title: 'Price-to-Sales Ratio',
    description: 'Stock price relative to revenue per share.',
    formula: 'Market Cap ÷ Total Revenue',
    interpretation: 'Useful for unprofitable companies. Lower may indicate better value. Compare to industry.',
  },
  eps_growth: {
    title: 'EPS Growth',
    description: 'Year-over-year earnings per share growth rate.',
    formula: '(Current EPS - Previous EPS) ÷ Previous EPS × 100',
    interpretation: 'Positive growth is good. Consistent growth over time is better than volatile growth.',
  },
  revenue_growth: {
    title: 'Revenue Growth',
    description: 'Year-over-year revenue growth rate.',
    formula: '(Current Revenue - Previous Revenue) ÷ Previous Revenue × 100',
    interpretation: 'Higher growth indicates expanding business. Look for sustainable, consistent growth.',
  },
};

// Usage in metric cards:
export const MetricCard = ({ label, value, metric, trend }) => {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        <MetricTooltip metric={metric} />
      </div>
      <div className="metric-value">
        {value}
        {trend && <span className={`metric-trend ${trend > 0 ? 'up' : 'down'}`}>{trend}%</span>}
      </div>
    </div>
  );
};
