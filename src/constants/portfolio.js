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
    cik: '0001656456',
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
  },

  // Quant/Systematic Funds
  TWO_SIGMA: {
    name: 'Two Sigma Investments',
    manager: 'John Overdeck & David Siegel',
    cik: '0001179392',
    investment_style: 'quant',
    display_order: 17,
    description: 'Quantitative hedge fund using machine learning and data science'
  },
  AQR: {
    name: 'AQR Capital Management',
    manager: 'Cliff Asness',
    cik: '0001167557',
    investment_style: 'quant',
    display_order: 18,
    description: 'Factor-based quantitative investing pioneer'
  },
  MILLENNIUM: {
    name: 'Millennium Management',
    manager: 'Israel Englander',
    cik: '0001273087',
    investment_style: 'multi_strategy',
    display_order: 19,
    description: 'Multi-strategy multi-manager hedge fund platform'
  },
  POINT72: {
    name: 'Point72 Asset Management',
    manager: 'Steven Cohen',
    cik: '0001603466',
    investment_style: 'multi_strategy',
    display_order: 20,
    description: 'Multi-strategy hedge fund (successor to SAC Capital)'
  },
  DE_SHAW: {
    name: 'D.E. Shaw & Co.',
    manager: 'David Shaw',
    cik: '0001009207',
    investment_style: 'quant',
    display_order: 21,
    description: 'Systematic computer-driven trading pioneer'
  },

  // Activist Investors
  ELLIOTT: {
    name: 'Elliott Investment Management',
    manager: 'Paul Singer',
    cik: '0001791786',
    investment_style: 'activist',
    display_order: 22,
    description: 'One of the most feared activist hedge funds'
  },
  STARBOARD: {
    name: 'Starboard Value',
    manager: 'Jeff Smith',
    cik: '0001517137',
    investment_style: 'activist',
    display_order: 23,
    description: 'Activist investor focused on operational improvements'
  },
  VALUEACT: {
    name: 'ValueAct Capital',
    manager: 'Mason Morfit',
    cik: '0001418814',
    investment_style: 'activist',
    display_order: 24,
    description: 'Long-term constructive activist investor'
  },
  TRIAN: {
    name: 'Trian Fund Management',
    manager: 'Nelson Peltz',
    cik: '0001345471',
    investment_style: 'activist',
    display_order: 25,
    description: 'Activist investor known for board representation'
  },
  SACHEM_HEAD: {
    name: 'Sachem Head Capital',
    manager: 'Scott Ferguson',
    cik: '0001582090',
    investment_style: 'activist',
    display_order: 26,
    description: 'Concentrated value-oriented activist fund'
  },
  JANA: {
    name: 'JANA Partners',
    manager: 'Barry Rosenstein',
    cik: '0001998597',
    investment_style: 'activist',
    display_order: 27,
    description: 'Activist hedge fund focused on unlocking value'
  },
  TCI: {
    name: 'TCI Fund Management',
    manager: 'Chris Hohn',
    cik: '0001647251',
    investment_style: 'activist',
    display_order: 28,
    description: 'Constructive activist with concentrated positions'
  },

  // Value Investors
  PABRAI: {
    name: 'Dalal Street LLC (Pabrai Funds)',
    manager: 'Mohnish Pabrai',
    cik: '0001549575',
    investment_style: 'deep_value',
    display_order: 29,
    description: 'Deep value investor inspired by Buffett and Munger'
  },
  HIMALAYA: {
    name: 'Himalaya Capital',
    manager: 'Li Lu',
    cik: '0001709323',
    investment_style: 'value',
    display_order: 30,
    description: 'Value investor, Charlie Munger\'s investment partner'
  },
  AQUAMARINE: {
    name: 'Aquamarine Capital',
    manager: 'Guy Spier',
    cik: '0001766596',
    investment_style: 'value',
    display_order: 31,
    description: 'Value investor, author of The Education of a Value Investor'
  },
  MARKEL_GAYNER: {
    name: 'Markel Gayner Asset Management',
    manager: 'Tom Gayner',
    cik: '0001096343',
    investment_style: 'value',
    display_order: 32,
    description: 'Long-term value investor running Markel\'s portfolio'
  },
  FAIRHOLME: {
    name: 'Fairholme Capital',
    manager: 'Bruce Berkowitz',
    cik: '0001056831',
    investment_style: 'deep_value',
    display_order: 33,
    description: 'Concentrated deep value investor'
  },

  // Growth/Tech Investors
  ARK_INVEST: {
    name: 'ARK Investment Management',
    manager: 'Cathie Wood',
    cik: '0001697748',
    investment_style: 'growth',
    display_order: 34,
    description: 'Disruptive innovation focused growth investor'
  },
  BAILLIE_GIFFORD: {
    name: 'Baillie Gifford',
    manager: 'Baillie Gifford & Co',
    cik: '0001088875',
    investment_style: 'growth',
    display_order: 35,
    description: 'Long-term growth investor from Scotland'
  },
  D1_CAPITAL: {
    name: 'D1 Capital Partners',
    manager: 'Dan Sundheim',
    cik: '0001747057',
    investment_style: 'growth',
    display_order: 36,
    description: 'Growth-focused long/short equity hedge fund'
  },

  // Tiger Cubs
  MAVERICK: {
    name: 'Maverick Capital',
    manager: 'Lee Ainslie',
    cik: '0001286654',
    investment_style: 'long_short',
    display_order: 37,
    description: 'Tiger Cub long/short equity fund'
  },
  BLUE_RIDGE: {
    name: 'Blue Ridge Capital',
    manager: 'John Griffin',
    cik: '0001056258',
    investment_style: 'long_short',
    display_order: 38,
    description: 'Tiger Cub long/short equity fund (closed 2017)'
  },
  // Macro/Multi-Strategy
  CAXTON: {
    name: 'Caxton Associates',
    manager: 'Andrew Law',
    cik: '0000872573',
    investment_style: 'macro',
    display_order: 40,
    description: 'Global macro hedge fund founded by Bruce Kovner'
  },
  WINTON: {
    name: 'Winton Group Ltd',
    manager: 'David Harding',
    cik: '0001612063',
    investment_style: 'quant',
    display_order: 41,
    description: 'Systematic quantitative investment manager'
  },
  SOROBAN: {
    name: 'Soroban Capital Partners',
    manager: 'Eric Mandelblatt',
    cik: '0001517857',
    investment_style: 'long_short',
    display_order: 42,
    description: 'Concentrated long/short equity fund'
  },
  STEADFAST: {
    name: 'Steadfast Capital Management',
    manager: 'Robert Pitts',
    cik: '0001214822',
    investment_style: 'long_short',
    display_order: 43,
    description: 'Long/short equity hedge fund'
  },

  // Distressed/Credit
  CANYON: {
    name: 'Canyon Capital Advisors',
    manager: 'Josh Friedman',
    cik: '0001074034',
    investment_style: 'distressed',
    display_order: 44,
    description: 'Multi-strategy distressed and credit investor'
  },
  OAKTREE: {
    name: 'Oaktree Capital Management',
    manager: 'Howard Marks',
    cik: '0000949509',
    investment_style: 'distressed',
    display_order: 45,
    description: 'Credit and distressed investing specialist'
  },

  // Special Cases (no 13F but notable)
  UNIVERSA: {
    name: 'Universa Investments',
    manager: 'Mark Spitznagel',
    cik: null,
    investment_style: 'tail_risk',
    display_order: 46,
    description: 'Tail-risk hedging specialist (no 13F - trades options/derivatives)'
  },
  SITUATIONAL_AWARENESS: {
    name: 'Situational Awareness LP',
    manager: 'Leopold Aschenbrenner',
    cik: '0002045724',
    investment_style: 'technology',
    display_order: 47,
    description: 'AI/compute infrastructure fund founded by ex-OpenAI researcher'
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
