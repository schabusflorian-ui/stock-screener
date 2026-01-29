// tests/stress/personas.js
// 10 Synthetic User Personas for AI Agents Stress Testing

const PERSONAS = {
  quantTrader: {
    id: 'quant_trader',
    name: 'Marcus Chen',
    description: 'Quant Trader - Factor-based systematic investor',
    preferredAnalyst: 'quant',
    nlQueries: [
      { query: 'Screen for stocks with Sharpe ratio > 1', expectSuccess: true, category: 'screening' },
      { query: 'Show factor scores for NVDA', expectSuccess: true, category: 'lookup' },
      { query: 'Compare AAPL vs MSFT on risk metrics', expectSuccess: true, category: 'compare' },
      { query: 'Find stocks with momentum > 70th percentile', expectSuccess: true, category: 'screening' },
      { query: 'Show me the blorp factor for AAPL', expectSuccess: false, category: 'edge_invalid_metric' }
    ],
    analystQuestions: [
      { question: 'What are the factor scores for AAPL?', expectSuccess: true, testKnowledge: false },
      { question: 'How should I size this position based on volatility?', expectSuccess: true, testKnowledge: false },
      { question: 'How would AQR analyze this stock systematically?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['factor', 'systematic', 'quantitative'] },
      { question: 'What does the information ratio tell us about this strategy?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['alpha', 'risk-adjusted', 'sharpe'] }
    ]
  },

  valueInvestor: {
    id: 'value_investor',
    name: 'Warren Graham',
    description: 'Value Investor - Buffett/Graham style deep value',
    preferredAnalyst: 'value',
    nlQueries: [
      { query: 'Find undervalued stocks with wide moats', expectSuccess: true, category: 'screening' },
      { query: "What is AAPL's margin of safety?", expectSuccess: true, category: 'lookup' },
      { query: "Show me Buffett's holdings", expectSuccess: true, category: 'investor' },
      { query: 'Calculate intrinsic value for MSFT', expectSuccess: true, category: 'calculate' },
      { query: 'Is XYZZY a good value?', expectSuccess: false, category: 'edge_invalid_symbol' }
    ],
    analystQuestions: [
      { question: 'Does Apple have a durable competitive moat?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['moat', 'competitive advantage', 'durable'] },
      { question: 'Is management allocating capital effectively?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['capital allocation', 'return on equity'] },
      { question: 'Would Buffett buy this company? What would Munger say about the moat?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['buffett', 'munger', 'moat', 'intrinsic value'] },
      { question: 'What is the margin of safety at current prices?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['margin of safety', 'intrinsic value', 'fair price'] }
    ]
  },

  beginnerInvestor: {
    id: 'beginner_investor',
    name: 'Alex Newbie',
    description: 'Beginner Investor - Learning, makes mistakes',
    preferredAnalyst: 'value', // Start with basics
    nlQueries: [
      { query: 'What is a P/E ratio?', expectSuccess: true, category: 'educational' },
      { query: 'Is Apple a good stock?', expectSuccess: true, category: 'lookup' },
      { query: 'Show me divident stocks', expectSuccess: true, category: 'edge_typo' }, // Typo test
      { query: 'I have $1000, what should I buy?', expectSuccess: true, category: 'edge_vague' },
      { query: 'asdfjkl;asdfjkl;', expectSuccess: false, category: 'edge_gibberish' }
    ],
    analystQuestions: [
      { question: 'Can you explain what this means in simple terms?', expectSuccess: true, testKnowledge: false },
      { question: 'Which is better, AAPL or GOOGL?', expectSuccess: true, testKnowledge: false },
      { question: 'What should a beginner invest in?', expectSuccess: true, testKnowledge: false }
    ]
  },

  dayTrader: {
    id: 'day_trader',
    name: 'Flash Thompson',
    description: 'Day Trader - Technical, short-term focus',
    preferredAnalyst: 'quant',
    nlQueries: [
      { query: 'Show RSI for NVDA', expectSuccess: true, category: 'technical' },
      { query: 'MACD crossover signals', expectSuccess: true, category: 'technical' },
      { query: 'Most volatile tech stocks', expectSuccess: true, category: 'screening' },
      { query: 'Stocks near 52-week high', expectSuccess: true, category: 'screening' },
      { query: 'Current market sentiment', expectSuccess: true, category: 'sentiment' }
    ],
    analystQuestions: [
      { question: "What's the technical setup for TSLA?", expectSuccess: true, testKnowledge: false },
      { question: 'How should I systematically size this position?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['position sizing', 'volatility', 'systematic'] },
      { question: 'What momentum signals are you seeing?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['momentum', 'factor'] }
    ]
  },

  riskAverseRetiree: {
    id: 'risk_averse_retiree',
    name: 'Margaret Safe',
    description: 'Risk-Averse Retiree - Conservative, income focused',
    preferredAnalyst: 'value',
    nlQueries: [
      { query: 'High dividend yield safe stocks', expectSuccess: true, category: 'screening' },
      { query: 'Low volatility dividend stocks', expectSuccess: true, category: 'screening' },
      { query: 'What is the max drawdown for KO?', expectSuccess: true, category: 'risk' },
      { query: 'Stocks with 10+ years dividend growth', expectSuccess: true, category: 'screening' },
      { query: 'Is this stock too risky?', expectSuccess: true, category: 'edge_vague' }
    ],
    analystQuestions: [
      { question: 'Is this dividend safe for retirement? What would Graham say?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['margin of safety', 'durable'] },
      { question: "What's the downside risk and capital preservation?", expectSuccess: true, testKnowledge: true, expectedKeywords: ['capital allocation', 'moat'] },
      { question: 'Does this company have a durable competitive advantage?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['moat', 'competitive advantage', 'durable'] }
    ]
  },

  aggressiveGrowth: {
    id: 'aggressive_growth',
    name: 'Cathy Moonshot',
    description: 'Aggressive Growth Investor - High-growth tech focus',
    preferredAnalyst: 'growth',
    nlQueries: [
      { query: 'Fastest growing tech stocks', expectSuccess: true, category: 'screening' },
      { query: 'Stocks with 50%+ revenue growth', expectSuccess: true, category: 'screening' },
      { query: 'AI stocks with growth potential', expectSuccess: true, category: 'screening' },
      { query: 'Is NVDA overvalued?', expectSuccess: true, category: 'valuation' },
      { query: 'Compare NVDA, AMD, INTC growth', expectSuccess: true, category: 'compare' }
    ],
    analystQuestions: [
      { question: 'How large is the total addressable market?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['tam', 'total addressable market', 'market opportunity'] },
      { question: 'Is this company a potential ten-bagger like Lynch would identify?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['lynch', 'ten-bagger', 'growth'] },
      { question: 'What are the network effects and scalability here?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['network effects', 'scalable', 'disruptive'] }
    ]
  },

  contrarianInvestor: {
    id: 'contrarian_investor',
    name: 'Michael Contrary',
    description: 'Contrarian Investor - Goes against the crowd',
    preferredAnalyst: 'contrarian',
    nlQueries: [
      { query: 'Most hated stocks right now', expectSuccess: true, category: 'sentiment' },
      { query: 'Stocks down 50% from highs', expectSuccess: true, category: 'screening' },
      { query: 'Heavily shorted stocks', expectSuccess: true, category: 'screening' },
      { query: 'Insider buying in beaten-down stocks', expectSuccess: true, category: 'insider' },
      { query: 'Is this a value trap or opportunity?', expectSuccess: true, category: 'edge_vague' }
    ],
    analystQuestions: [
      { question: 'Is the pessimism overdone here? What would Howard Marks say?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['marks', 'pessimism', 'sentiment', 'second-level thinking'] },
      { question: 'Is this a contrarian opportunity like Burry found in 2008?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['burry', 'contrarian', 'asymmetric'] },
      { question: 'What catalyst could drive mean reversion?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['catalyst', 'mean reversion', 'sentiment'] }
    ]
  },

  dividendInvestor: {
    id: 'dividend_investor',
    name: 'Income Irving',
    description: 'Dividend Investor - Income and yield focused',
    preferredAnalyst: 'value',
    nlQueries: [
      { query: 'Highest dividend yield safe stocks', expectSuccess: true, category: 'screening' },
      { query: 'Dividend aristocrats', expectSuccess: true, category: 'screening' },
      { query: 'Stocks with sustainable payout ratio', expectSuccess: true, category: 'screening' },
      { query: 'Monthly dividend payers', expectSuccess: true, category: 'screening' },
      { query: 'Compare KO, PEP, PG dividends', expectSuccess: true, category: 'compare' }
    ],
    analystQuestions: [
      { question: 'Is this dividend sustainable with a margin of safety?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['margin of safety', 'capital allocation'] },
      { question: "What's the owner earnings and how does it support dividends?", expectSuccess: true, testKnowledge: true, expectedKeywords: ['owner earnings', 'return on equity'] },
      { question: 'Would Buffett consider this a wonderful company at a fair price?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['buffett', 'wonderful company', 'fair price'] }
    ]
  },

  esgInvestor: {
    id: 'esg_investor',
    name: 'Green Greta',
    description: 'ESG Investor - Sustainable and responsible investing',
    preferredAnalyst: 'growth',
    nlQueries: [
      { query: 'Stocks with high ESG scores', expectSuccess: true, category: 'screening' },
      { query: 'Clean energy stocks', expectSuccess: true, category: 'screening' },
      { query: 'Companies with good governance', expectSuccess: true, category: 'screening' },
      { query: 'Low carbon footprint stocks', expectSuccess: true, category: 'screening' },
      { query: 'Compare ESG scores MSFT vs GOOGL', expectSuccess: true, category: 'compare' }
    ],
    analystQuestions: [
      { question: 'What is the total addressable market for clean tech?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['tam', 'market opportunity', 'disruptive'] },
      { question: 'Is this company positioned to scale sustainably?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['scalable', 'network effects'] },
      { question: 'What growth path does this company have for market penetration?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['market penetration', 'revenue growth'] }
    ]
  },

  optionsTrader: {
    id: 'options_trader',
    name: 'Nikolai Volatility',
    description: 'Options Trader - Volatility and derivatives focus',
    preferredAnalyst: 'tailrisk',
    nlQueries: [
      { query: 'Implied volatility for NVDA', expectSuccess: true, category: 'volatility' },
      { query: 'Current VIX level and trend', expectSuccess: true, category: 'market' },
      { query: 'Most volatile stocks for options', expectSuccess: true, category: 'screening' },
      { query: 'Best hedges for market downturn', expectSuccess: true, category: 'strategy' },
      { query: 'Tail risk analysis', expectSuccess: true, category: 'risk' }
    ],
    analystQuestions: [
      { question: 'What would Taleb say about the tail risks here?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['taleb', 'tail risk', 'black swan', 'fat tails'] },
      { question: 'Is this company antifragile or fragile? How does it benefit from disorder?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['antifragile', 'fragile', 'convexity', 'optionality'] },
      { question: 'How would Spitznagel structure a barbell portfolio here?', expectSuccess: true, testKnowledge: true, expectedKeywords: ['spitznagel', 'barbell', 'tail risk', 'convexity'] }
    ]
  }
};

// Edge cases to test across all personas
const EDGE_CASES = [
  { query: '', category: 'edge_empty', expectSuccess: false, description: 'Empty query' },
  { query: 'SELECT * FROM users; DROP TABLE users;--', category: 'edge_sql_injection', expectSuccess: false, description: 'SQL injection attempt' },
  { query: '<script>alert("xss")</script>', category: 'edge_xss', expectSuccess: false, description: 'XSS attempt' },
  { query: 'a'.repeat(2000), category: 'edge_long_input', expectSuccess: false, description: 'Very long input (2000 chars)' },
  { query: 'Show me stocks with PE ratio', category: 'edge_context_loss', expectSuccess: true, description: 'Query without prior context' },
  { query: 'What about it?', category: 'edge_no_context', expectSuccess: true, description: 'Follow-up without context' }
];

module.exports = { PERSONAS, EDGE_CASES };
