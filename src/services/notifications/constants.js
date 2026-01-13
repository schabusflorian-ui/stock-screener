/**
 * Notification System Constants
 */

// Notification Categories
const NOTIFICATION_CATEGORIES = {
  COMPANY: 'company',
  PORTFOLIO: 'portfolio',
  WATCHLIST: 'watchlist',
  SENTIMENT: 'sentiment',
  AI: 'ai',
  SYSTEM: 'system',
  CORRELATION: 'correlation'
};

// Notification Types (examples - extensible)
const NOTIFICATION_TYPES = {
  // Company alerts
  COMPANY_VALUATION_DCF_UNDERVALUED: 'company_valuation_dcf_undervalued_25',
  COMPANY_VALUATION_DCF_DEEP_VALUE: 'company_valuation_dcf_undervalued_50',
  COMPANY_VALUATION_PE_LOW: 'company_valuation_pe_below_15',
  COMPANY_PRICE_52W_LOW: 'company_price_new_52w_low',
  COMPANY_PRICE_RSI_OVERSOLD: 'company_price_rsi_oversold',
  COMPANY_FILING_INSIDER_BUY: 'company_filing_insider_buying',
  COMPANY_COMPOSITE_QUALITY_VALUE: 'company_composite_quality_value_convergence',

  // Portfolio alerts
  PORTFOLIO_DRAWDOWN: 'portfolio_drawdown_threshold',
  PORTFOLIO_CONCENTRATION: 'portfolio_position_concentration',
  PORTFOLIO_DAILY_GAIN: 'portfolio_daily_gain',
  PORTFOLIO_DAILY_LOSS: 'portfolio_daily_loss',
  PORTFOLIO_NEW_HIGH: 'portfolio_new_high',
  PORTFOLIO_CASH_LOW: 'portfolio_cash_low',
  PORTFOLIO_STOP_LOSS: 'portfolio_stop_loss_triggered',
  PORTFOLIO_TAKE_PROFIT: 'portfolio_take_profit_triggered',
  PORTFOLIO_DIVIDEND: 'portfolio_dividend_received',

  // Watchlist alerts
  WATCHLIST_PRICE_ABOVE: 'watchlist_price_above',
  WATCHLIST_PRICE_BELOW: 'watchlist_price_below',

  // Sentiment alerts
  SENTIMENT_DIVERGENCE: 'sentiment_divergence',
  SENTIMENT_SPIKE: 'sentiment_spike',

  // AI insights
  AI_PATTERN_DETECTED: 'ai_pattern_detected',
  AI_RECOMMENDATION: 'ai_recommendation',

  // Correlation alerts
  CORRELATION_PORTFOLIO_COMPANY: 'correlation_portfolio_company',
  CORRELATION_SENTIMENT_POSITION: 'correlation_sentiment_position',

  // System
  SYSTEM_MAINTENANCE: 'system_maintenance',
  SYSTEM_DATA_UPDATE: 'system_data_update'
};

// Severity levels with display config
const SEVERITY_CONFIG = {
  critical: {
    color: '#DC2626',
    bgColor: '#FEE2E2',
    icon: 'AlertTriangle',
    label: 'Critical',
    priority: 5
  },
  warning: {
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    icon: 'AlertCircle',
    label: 'Warning',
    priority: 4
  },
  info: {
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    icon: 'Info',
    label: 'Info',
    priority: 3
  }
};

// Category display config
const CATEGORY_CONFIG = {
  company: {
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: 'Building2',
    label: 'Company'
  },
  portfolio: {
    color: '#6366F1',
    bgColor: '#E0E7FF',
    icon: 'Briefcase',
    label: 'Portfolio'
  },
  watchlist: {
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
    icon: 'Star',
    label: 'Watchlist'
  },
  sentiment: {
    color: '#EC4899',
    bgColor: '#FCE7F3',
    icon: 'TrendingUp',
    label: 'Sentiment'
  },
  ai: {
    color: '#14B8A6',
    bgColor: '#CCFBF1',
    icon: 'Sparkles',
    label: 'AI Insight'
  },
  system: {
    color: '#6B7280',
    bgColor: '#F3F4F6',
    icon: 'Settings',
    label: 'System'
  },
  correlation: {
    color: '#F97316',
    bgColor: '#FFEDD5',
    icon: 'Link',
    label: 'Correlation'
  }
};

// Default channels by severity
const DEFAULT_CHANNELS = {
  critical: ['in_app', 'email', 'push'],
  warning: ['in_app', 'email'],
  info: ['in_app']
};

// Priority levels
const PRIORITY_LEVELS = {
  HIGHEST: 5,  // Critical alerts, stop loss triggers
  HIGH: 4,     // Strong buy signals, significant drawdowns
  MEDIUM: 3,   // Buy signals, position alerts
  LOW: 2,      // Watch signals, info alerts
  LOWEST: 1    // System info, minor updates
};

// Snooze duration options
const SNOOZE_OPTIONS = [
  { label: '1 hour', value: '1h' },
  { label: '4 hours', value: '4h' },
  { label: '1 day', value: '1d' },
  { label: '1 week', value: '1w' }
];

module.exports = {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  SEVERITY_CONFIG,
  CATEGORY_CONFIG,
  DEFAULT_CHANNELS,
  PRIORITY_LEVELS,
  SNOOZE_OPTIONS
};
