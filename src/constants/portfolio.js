// src/constants/portfolio.js
// Shared constants for portfolio management system

const TRANSACTION_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
  DIVIDEND: 'dividend',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  SPLIT: 'split',
  FEE: 'fee'
};

const ORDER_TYPES = {
  STOP_LOSS: 'stop_loss',
  TAKE_PROFIT: 'take_profit',
  LIMIT_BUY: 'limit_buy',
  LIMIT_SELL: 'limit_sell',
  TRAILING_STOP: 'trailing_stop'
};

const ORDER_STATUS = {
  ACTIVE: 'active',
  TRIGGERED: 'triggered',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

const PORTFOLIO_TYPES = {
  MANUAL: 'manual',
  CLONE: 'clone',
  ETF_MODEL: 'etf_model',
  BACKTEST: 'backtest'
};

const LOT_METHODS = {
  FIFO: 'fifo',      // First In First Out
  LIFO: 'lifo',      // Last In First Out
  HIFO: 'hifo',      // Highest In First Out (tax optimization)
  SPECIFIC: 'specific' // Specific lot selection
};

// Famous investors with their SEC CIK numbers
const FAMOUS_INVESTORS = {
  BERKSHIRE_HATHAWAY: {
    name: 'Berkshire Hathaway',
    manager: 'Warren Buffett',
    cik: '0001067983',
    investment_style: 'value',
    display_order: 1,
    description: 'The legendary value investor known for long-term quality holdings'
  },
  PERSHING_SQUARE: {
    name: 'Pershing Square Capital',
    manager: 'Bill Ackman',
    cik: '0001336528',
    investment_style: 'activist',
    display_order: 2,
    description: 'Activist investor with concentrated positions'
  },
  SCION: {
    name: 'Scion Asset Management',
    manager: 'Michael Burry',
    cik: '0001649339',
    investment_style: 'deep_value',
    display_order: 3,
    description: 'Famous for The Big Short, contrarian deep value investor'
  },
  BAUPOST: {
    name: 'Baupost Group',
    manager: 'Seth Klarman',
    cik: '0001061768',
    investment_style: 'value',
    display_order: 4,
    description: 'Deep value investor, author of Margin of Safety'
  },
  BRIDGEWATER: {
    name: 'Bridgewater Associates',
    manager: 'Ray Dalio',
    cik: '0001350694',
    investment_style: 'macro',
    display_order: 5,
    description: 'World\'s largest hedge fund, known for global macro investing'
  },
  APPALOOSA: {
    name: 'Appaloosa Management',
    manager: 'David Tepper',
    cik: '0001062449',
    investment_style: 'distressed',
    display_order: 6,
    description: 'Known for distressed debt and contrarian investing'
  },
  GREENLIGHT: {
    name: 'Greenlight Capital',
    manager: 'David Einhorn',
    cik: '0001079114',
    investment_style: 'value',
    display_order: 7,
    description: 'Value-oriented with famous short positions'
  },
  ICAHN: {
    name: 'Icahn Capital',
    manager: 'Carl Icahn',
    cik: '0000921669',
    investment_style: 'activist',
    display_order: 8,
    description: 'Legendary activist investor'
  },
  SOROS: {
    name: 'Soros Fund Management',
    manager: 'George Soros',
    cik: '0001029160',
    investment_style: 'macro',
    display_order: 9,
    description: 'Renowned global macro investor'
  },
  TIGER_GLOBAL: {
    name: 'Tiger Global Management',
    manager: 'Chase Coleman',
    cik: '0001167483',
    investment_style: 'growth',
    display_order: 10,
    description: 'Growth-focused technology investor'
  },
  VIKING_GLOBAL: {
    name: 'Viking Global Investors',
    manager: 'Andreas Halvorsen',
    cik: '0001103804',
    investment_style: 'long_short',
    display_order: 11,
    description: 'Long/short equity hedge fund'
  },
  CITADEL: {
    name: 'Citadel Advisors',
    manager: 'Ken Griffin',
    cik: '0001423053',
    investment_style: 'multi_strategy',
    display_order: 12,
    description: 'Multi-strategy hedge fund'
  },
  RENAISSANCE: {
    name: 'Renaissance Technologies',
    manager: 'Jim Simons',
    cik: '0001037389',
    investment_style: 'quant',
    display_order: 13,
    description: 'Quantitative trading pioneer'
  },
  THIRD_POINT: {
    name: 'Third Point LLC',
    manager: 'Daniel Loeb',
    cik: '0001040273',
    investment_style: 'activist',
    display_order: 14,
    description: 'Event-driven activist investor'
  },
  LONE_PINE: {
    name: 'Lone Pine Capital',
    manager: 'Stephen Mandel',
    cik: '0001061165',
    investment_style: 'growth',
    display_order: 15,
    description: 'Growth-focused equity investor'
  },
  COATUE: {
    name: 'Coatue Management',
    manager: 'Philippe Laffont',
    cik: '0001135730',
    investment_style: 'technology',
    display_order: 16,
    description: 'Technology-focused hedge fund'
  }
};

// 13F filing constants
const SEC_13F_CONFIG = {
  BASE_URL: 'https://www.sec.gov',
  DATA_URL: 'https://data.sec.gov',
  EDGAR_SEARCH: 'https://www.sec.gov/cgi-bin/browse-edgar',
  FILING_TYPE: '13F-HR',
  RATE_LIMIT_MS: 150, // SEC requires 10 requests/second max
  USER_AGENT: 'InvestmentResearchApp admin@example.com' // SEC requires: CompanyName email@domain.com format
};

// Investment categories for investor classification
const INVESTOR_STYLES = {
  VALUE: 'value',
  DEEP_VALUE: 'deep_value',
  GROWTH: 'growth',
  ACTIVIST: 'activist',
  MACRO: 'macro',
  QUANT: 'quant',
  TECHNOLOGY: 'technology',
  DISTRESSED: 'distressed',
  LONG_SHORT: 'long_short',
  MULTI_STRATEGY: 'multi_strategy'
};

// Change types for investor holdings
const HOLDING_CHANGE_TYPES = {
  NEW: 'new',
  INCREASED: 'increased',
  DECREASED: 'decreased',
  UNCHANGED: 'unchanged',
  SOLD: 'sold'
};

// Portfolio alert types
const PORTFOLIO_ALERT_TYPES = {
  DRAWDOWN_THRESHOLD: 'drawdown_threshold',     // Portfolio drops X% from high
  POSITION_CONCENTRATION: 'position_concentration', // Single position exceeds X%
  STOP_LOSS_TRIGGERED: 'stop_loss_triggered',   // Stop loss order executed
  TAKE_PROFIT_TRIGGERED: 'take_profit_triggered', // Take profit order executed
  DIVIDEND_RECEIVED: 'dividend_received',       // Dividend payment processed
  REBALANCE_NEEDED: 'rebalance_needed',         // Positions drift from targets
  DAILY_GAIN: 'daily_gain',                     // Portfolio gains X% in a day
  DAILY_LOSS: 'daily_loss',                     // Portfolio loses X% in a day
  NEW_HIGH: 'new_high',                         // Portfolio reaches new all-time high
  CASH_LOW: 'cash_low'                          // Cash balance drops below threshold
};

// Alert severity levels
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

// Default alert thresholds (can be customized per portfolio)
const DEFAULT_ALERT_THRESHOLDS = {
  [PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD]: 10,     // 10% drawdown
  [PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION]: 25, // 25% of portfolio
  [PORTFOLIO_ALERT_TYPES.DAILY_GAIN]: 5,              // 5% daily gain
  [PORTFOLIO_ALERT_TYPES.DAILY_LOSS]: 5,              // 5% daily loss
  [PORTFOLIO_ALERT_TYPES.CASH_LOW]: 1000              // $1000 cash minimum
};

module.exports = {
  TRANSACTION_TYPES,
  ORDER_TYPES,
  ORDER_STATUS,
  PORTFOLIO_TYPES,
  LOT_METHODS,
  FAMOUS_INVESTORS,
  SEC_13F_CONFIG,
  INVESTOR_STYLES,
  HOLDING_CHANGE_TYPES,
  PORTFOLIO_ALERT_TYPES,
  ALERT_SEVERITY,
  DEFAULT_ALERT_THRESHOLDS
};
