/**
 * Shared PropTypes definitions
 *
 * Centralized type definitions for commonly used props across components.
 */

import PropTypes from 'prop-types';

/**
 * Company object shape
 */
export const CompanyShape = PropTypes.shape({
  id: PropTypes.number,
  symbol: PropTypes.string.isRequired,
  name: PropTypes.string,
  sector: PropTypes.string,
  industry: PropTypes.string,
  cik: PropTypes.string,
  sic_code: PropTypes.string,
  fiscal_year_end: PropTypes.string
});

/**
 * Price data shape
 */
export const PriceDataShape = PropTypes.shape({
  date: PropTypes.string.isRequired,
  open: PropTypes.number,
  high: PropTypes.number,
  low: PropTypes.number,
  close: PropTypes.number.isRequired,
  volume: PropTypes.number
});

/**
 * Metrics shape
 */
export const MetricsShape = PropTypes.shape({
  period: PropTypes.string,
  roic: PropTypes.number,
  roe: PropTypes.number,
  fcf_yield: PropTypes.number,
  pe_ratio: PropTypes.number,
  net_margin: PropTypes.number,
  operating_margin: PropTypes.number,
  debt_to_equity: PropTypes.number,
  current_ratio: PropTypes.number
});

/**
 * Sentiment analysis shape
 */
export const SentimentShape = PropTypes.shape({
  signal: PropTypes.string,
  score: PropTypes.number,
  weighted_sentiment: PropTypes.number,
  post_count: PropTypes.number,
  positive_count: PropTypes.number,
  negative_count: PropTypes.number,
  neutral_count: PropTypes.number
});

/**
 * Analyst data shape
 */
export const AnalystShape = PropTypes.shape({
  recommendation: PropTypes.string,
  targetPrice: PropTypes.number,
  currentPrice: PropTypes.number,
  upside: PropTypes.number,
  buyPercent: PropTypes.number,
  holdPercent: PropTypes.number,
  sellPercent: PropTypes.number,
  totalAnalysts: PropTypes.number
});

/**
 * Insider transaction shape
 */
export const InsiderTransactionShape = PropTypes.shape({
  id: PropTypes.number,
  insider_name: PropTypes.string,
  insider_title: PropTypes.string,
  transaction_type: PropTypes.string,
  transaction_date: PropTypes.string,
  shares: PropTypes.number,
  price_per_share: PropTypes.number,
  total_value: PropTypes.number
});

/**
 * Dividend data shape
 */
export const DividendShape = PropTypes.shape({
  annual_dividend: PropTypes.number,
  dividend_yield: PropTypes.number,
  payout_ratio: PropTypes.number,
  dividend_growth_5y: PropTypes.number,
  years_of_growth: PropTypes.number,
  ex_date: PropTypes.string,
  payment_date: PropTypes.string
});

/**
 * Portfolio shape
 */
export const PortfolioShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  cash_balance: PropTypes.number,
  total_value: PropTypes.number,
  created_at: PropTypes.string
});

/**
 * Holding shape
 */
export const HoldingShape = PropTypes.shape({
  id: PropTypes.number,
  symbol: PropTypes.string.isRequired,
  shares: PropTypes.number.isRequired,
  avg_cost: PropTypes.number,
  current_price: PropTypes.number,
  market_value: PropTypes.number,
  gain_loss: PropTypes.number,
  gain_loss_pct: PropTypes.number
});

/**
 * DCF valuation shape
 */
export const DCFValuationShape = PropTypes.shape({
  intrinsic_value: PropTypes.number,
  current_price: PropTypes.number,
  upside: PropTypes.number,
  margin_of_safety: PropTypes.number,
  assumptions: PropTypes.shape({
    discount_rate: PropTypes.number,
    terminal_growth: PropTypes.number,
    growth_rate: PropTypes.number
  })
});

/**
 * Time period options
 */
export const TimePeriods = PropTypes.oneOf([
  '1d', '5d', '1w', '1m', '3m', '6m', '1y', '2y', '5y', 'ytd', 'max'
]);

/**
 * Sort direction
 */
export const SortDirection = PropTypes.oneOf(['asc', 'desc', 'ASC', 'DESC']);

/**
 * Common callback prop types
 */
export const Callbacks = {
  onRefresh: PropTypes.func,
  onError: PropTypes.func,
  onSuccess: PropTypes.func,
  onChange: PropTypes.func,
  onClick: PropTypes.func,
  onSelect: PropTypes.func,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func
};

export default {
  CompanyShape,
  PriceDataShape,
  MetricsShape,
  SentimentShape,
  AnalystShape,
  InsiderTransactionShape,
  DividendShape,
  PortfolioShape,
  HoldingShape,
  DCFValuationShape,
  TimePeriods,
  SortDirection,
  Callbacks
};
