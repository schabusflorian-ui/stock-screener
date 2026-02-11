/**
 * Input Validator for Natural Language Queries
 *
 * Provides security and UX validation for user queries:
 * - SQL injection detection
 * - XSS attack detection
 * - Input length limits
 * - Empty query detection
 * - Gibberish detection
 * - Invalid symbol validation
 * - Invalid metric validation
 */

// Maximum allowed query length
const MAX_QUERY_LENGTH = 500;

// Minimum word count for valid queries
const MIN_WORDS = 1;

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(select|insert|update|delete|drop|alter|create|truncate|exec|execute)\b.*\b(from|into|table|database)\b)/i,
  /(\bunion\b.*\bselect\b)/i,
  /(--|#|\/\*|\*\/|;)\s*(drop|delete|truncate|alter)/i,
  /'\s*(or|and)\s*['"]?\d*['"]?\s*=\s*['"]?\d*['"]?/i,
  /'\s*(or|and)\s*['"]?[a-z]+['"]?\s*=\s*['"]?[a-z]+['"]?/i,
  /(\bexec\b|\bexecute\b)\s*\(/i,
  /\b(xp_|sp_)\w+/i,
  /;\s*(drop|delete|insert|update|select)\b/i
];

// XSS attack patterns
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<script[\s\S]*?>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,  // onclick=, onmouseover=, etc.
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[\s\S]*?>/gi,
  /<img[\s\S]*?onerror/gi,
  /data:\s*text\/html/gi,
  /expression\s*\(/gi,
  /eval\s*\(/gi
];

// Common English words for gibberish detection
const COMMON_WORDS = new Set([
  // Articles and prepositions
  'a', 'an', 'the', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'of',
  // Pronouns
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'they', 'their', 'it', 'its',
  // Verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'show', 'find', 'get', 'give', 'tell', 'compare', 'calculate', 'screen', 'list',
  'search', 'look', 'display', 'fetch', 'analyze', 'check', 'view', 'pay', 'payers',
  // Question words
  'what', 'which', 'who', 'where', 'when', 'why', 'how',
  // Conjunctions
  'and', 'or', 'but', 'if', 'than', 'that', 'this', 'these', 'those',
  // Common adjectives
  'good', 'best', 'top', 'high', 'low', 'big', 'small', 'large', 'more', 'less',
  'most', 'least', 'all', 'any', 'some', 'other', 'new', 'old', 'same', 'different',
  'safe', 'risky', 'stable', 'volatile', 'cheap', 'expensive', 'fast', 'slow',
  // Finance terms
  'stock', 'stocks', 'company', 'companies', 'market', 'price', 'value', 'growth',
  'dividend', 'dividends', 'earnings', 'revenue', 'profit', 'margin', 'ratio',
  'pe', 'pb', 'ps', 'roe', 'roa', 'roic', 'eps', 'fcf', 'dcf', 'ebitda', 'ebit',
  'yield', 'return', 'returns', 'risk', 'volatility', 'beta', 'alpha', 'sharpe',
  'portfolio', 'holdings', 'position', 'investment', 'investor', 'investors',
  'buy', 'sell', 'hold', 'undervalued', 'overvalued', 'sector', 'industry',
  'factor', 'factors', 'score', 'scores', 'momentum', 'quality', 'sentiment',
  'technical', 'fundamental', 'analyst', 'rating', 'target', 'estimate',
  'moat', 'intrinsic', 'safety', 'buffett', 'graham', 'burry', 'ackman',
  'aristocrat', 'aristocrats', 'king', 'kings', 'payer', 'monthly', 'quarterly',
  'annual', 'annually', 'weekly', 'daily', 'yearly',
  // Common modifiers
  'about', 'me', 'please', 'now', 'today', 'yesterday', 'week', 'month', 'year',
  'percent', 'percentage', 'above', 'below', 'over', 'under', 'between',
  // Additional finance terms
  'cap', 'capitalization', 'equity', 'debt', 'asset', 'assets', 'liability',
  'cash', 'flow', 'income', 'balance', 'sheet', 'statement', 'filing', 'report',
  'quarter', 'fiscal', 'trailing', 'forward', 'ttm', 'ytd', 'mtd',
  'bull', 'bear', 'bullish', 'bearish', 'neutral', 'sideways',
  'long', 'short', 'hedge', 'hedging', 'exposure', 'correlation',
  'outperform', 'underperform', 'overweight', 'underweight', 'equal',
  'energy', 'technology', 'healthcare', 'financial', 'consumer', 'industrial',
  'utility', 'utilities', 'materials', 'real', 'estate', 'communication',
  'esg', 'sustainable', 'green', 'clean', 'carbon', 'governance', 'social',
  'insider', 'insiders', 'institutional', 'retail', 'ownership'
]);

// Valid metrics list
const VALID_METRICS = new Set([
  // Valuation
  'pe', 'pe ratio', 'p/e', 'p/e ratio', 'price to earnings',
  'pb', 'pb ratio', 'p/b', 'p/b ratio', 'price to book',
  'ps', 'ps ratio', 'p/s', 'p/s ratio', 'price to sales',
  'ev/ebitda', 'ev ebitda', 'enterprise value',
  'peg', 'peg ratio', 'price earnings growth',
  // Profitability
  'roe', 'return on equity',
  'roa', 'return on assets',
  'roic', 'return on invested capital',
  'profit margin', 'net margin', 'gross margin', 'operating margin',
  // Growth
  'revenue growth', 'earnings growth', 'eps growth', 'sales growth',
  'cagr', 'growth rate',
  // Financial health
  'debt to equity', 'debt/equity', 'd/e',
  'current ratio', 'quick ratio',
  'interest coverage',
  // Dividends
  'dividend yield', 'yield', 'payout ratio', 'dividend growth',
  // Cash flow
  'fcf', 'free cash flow', 'operating cash flow', 'cash flow',
  // Size
  'market cap', 'market capitalization', 'enterprise value',
  // Technical
  'rsi', 'macd', 'sma', 'ema', 'bollinger',
  'support', 'resistance', 'volume', 'volatility',
  '52 week high', '52 week low', '52-week high', '52-week low',
  // Risk
  'beta', 'alpha', 'sharpe', 'sharpe ratio', 'sortino', 'sortino ratio',
  'max drawdown', 'drawdown', 'var', 'value at risk',
  // Factors
  'momentum', 'quality', 'value', 'size', 'low volatility',
  'factor score', 'factor scores', 'factor loading', 'factor loadings',
  // Other
  'ebitda', 'ebit', 'nopat', 'wacc', 'dcf', 'intrinsic value',
  'book value', 'tangible book value', 'nav', 'eps',
  'price', 'close', 'open', 'high', 'low'
]);

/**
 * Validate a query for security issues and UX problems
 *
 * @param {string} query - The user's query
 * @param {Object} options - Validation options
 * @returns {Object} - { valid: boolean, error?: string, code?: string, sanitized?: string }
 */
function validateQuery(query, options = {}) {
  const {
    maxLength = MAX_QUERY_LENGTH,
    checkSecurity = true,
    checkGibberish = true,
    strictMode = false
  } = options;

  // 1. Empty query check
  if (!query || typeof query !== 'string') {
    return {
      valid: false,
      error: 'Please enter a query',
      code: 'EMPTY_QUERY'
    };
  }

  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return {
      valid: false,
      error: 'Please enter a query',
      code: 'EMPTY_QUERY'
    };
  }

  // 2. Length check
  if (trimmedQuery.length > maxLength) {
    return {
      valid: false,
      error: `Query is too long. Maximum ${maxLength} characters allowed.`,
      code: 'QUERY_TOO_LONG',
      sanitized: trimmedQuery.substring(0, maxLength)
    };
  }

  // 3. SQL injection check
  if (checkSecurity) {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(trimmedQuery)) {
        return {
          valid: false,
          error: 'Invalid query format detected',
          code: 'SQL_INJECTION_DETECTED'
        };
      }
    }
  }

  // 4. XSS check
  if (checkSecurity) {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(trimmedQuery)) {
        return {
          valid: false,
          error: 'Invalid query format detected',
          code: 'XSS_DETECTED'
        };
      }
    }
  }

  // 5. Gibberish detection
  if (checkGibberish) {
    const gibberishResult = detectGibberish(trimmedQuery);
    if (gibberishResult.isGibberish) {
      return {
        valid: false,
        error: "I couldn't understand that query. Please try rephrasing with clearer terms.",
        code: 'GIBBERISH_DETECTED',
        details: gibberishResult.reason
      };
    }
  }

  // All checks passed
  return {
    valid: true,
    sanitized: sanitizeQuery(trimmedQuery)
  };
}

/**
 * Detect if a query is gibberish (random characters)
 *
 * @param {string} query - The query to check
 * @returns {Object} - { isGibberish: boolean, reason?: string }
 */
function detectGibberish(query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  // Single word queries need special handling
  if (words.length === 1) {
    const word = words[0];
    // Allow single valid stock symbols (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/i.test(word)) {
      return { isGibberish: false };
    }
    // Allow single common words
    if (COMMON_WORDS.has(word.toLowerCase())) {
      return { isGibberish: false };
    }
    // Check for excessive repeated characters
    if (/(.)\1{3,}/.test(word)) {
      return { isGibberish: true, reason: 'Repeated characters detected' };
    }
  }

  // For multi-word queries, check if at least 30% are recognizable
  let recognizedCount = 0;
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/gi, '').toLowerCase();
    if (cleanWord.length === 0) continue;

    // Check if it's a common word
    if (COMMON_WORDS.has(cleanWord)) {
      recognizedCount++;
      continue;
    }

    // Check if it looks like a stock symbol (1-5 uppercase)
    if (/^[A-Z]{1,5}$/i.test(cleanWord) && cleanWord.length <= 5) {
      recognizedCount++;
      continue;
    }

    // Check for excessive consonant clusters (sign of gibberish)
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(cleanWord)) {
      return { isGibberish: true, reason: 'Unrecognizable word pattern' };
    }
  }

  const recognitionRatio = words.length > 0 ? recognizedCount / words.length : 0;

  if (recognitionRatio < 0.3 && words.length > 2) {
    return {
      isGibberish: true,
      reason: `Only ${Math.round(recognitionRatio * 100)}% of words recognized`
    };
  }

  return { isGibberish: false };
}

/**
 * Sanitize a query for safe processing
 *
 * @param {string} query - The query to sanitize
 * @returns {string} - Sanitized query
 */
function sanitizeQuery(query) {
  // Remove any HTML tags
  let sanitized = query.replace(/<[^>]*>/g, '');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Validate a stock symbol
 *
 * @param {string} symbol - The symbol to validate
 * @param {Object} db - Database connection for existence check
 * @returns {Object} - { valid: boolean, error?: string }
 */
async function validateSymbol(symbol, db = null) {
  if (!symbol || typeof symbol !== 'string') {
    return { valid: false, error: 'Symbol is required' };
  }

  const cleanSymbol = symbol.toUpperCase().trim();

  // Basic format check (1-5 letters, optionally with dots for some exchanges)
  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(cleanSymbol)) {
    return {
      valid: false,
      error: `Invalid symbol format: ${symbol}`,
      code: 'INVALID_SYMBOL_FORMAT'
    };
  }

  // Database existence check if provided
  if (db) {
    try {
      const result = await db.query('SELECT id FROM companies WHERE symbol = $1', [cleanSymbol]);
      const company = result.rows?.[0];
      if (!company) {
        return {
          valid: false,
          error: `Symbol not found: ${cleanSymbol}. Please check the ticker symbol and try again.`,
          code: 'SYMBOL_NOT_FOUND'
        };
      }
    } catch (error) {
      // Database error - don't block the query
      console.warn(`[InputValidator] Database check failed for ${cleanSymbol}:`, error.message);
    }
  }

  return { valid: true, symbol: cleanSymbol };
}

/**
 * Validate a metric name
 *
 * @param {string} metric - The metric to validate
 * @returns {Object} - { valid: boolean, error?: string, suggestion?: string }
 */
function validateMetric(metric) {
  if (!metric || typeof metric !== 'string') {
    return { valid: false, error: 'Metric name is required' };
  }

  const cleanMetric = metric.toLowerCase().trim();

  // Check if it's a valid metric
  if (VALID_METRICS.has(cleanMetric)) {
    return { valid: true, metric: cleanMetric };
  }

  // Try to find a close match (simple fuzzy matching)
  const suggestions = [];
  for (const validMetric of VALID_METRICS) {
    if (validMetric.includes(cleanMetric) || cleanMetric.includes(validMetric)) {
      suggestions.push(validMetric);
    }
  }

  if (suggestions.length > 0) {
    return {
      valid: false,
      error: `Unknown metric: "${metric}"`,
      code: 'INVALID_METRIC',
      suggestions: suggestions.slice(0, 3)
    };
  }

  return {
    valid: false,
    error: `Unknown metric: "${metric}". Please use a valid financial metric like PE ratio, ROE, dividend yield, etc.`,
    code: 'INVALID_METRIC'
  };
}

/**
 * Extract and validate symbols from a query
 *
 * @param {string} query - The query to extract symbols from
 * @param {Object} db - Database connection
 * @returns {Object} - { symbols: string[], invalid: string[] }
 */
async function extractAndValidateSymbols(query, db = null) {
  // Match uppercase words that look like tickers (1-5 chars)
  const potentialSymbols = query.match(/\b[A-Z]{1,5}\b/g) || [];

  // Exclude common words that aren't tickers
  const excludeWords = new Set([
    'I', 'A', 'TO', 'THE', 'AND', 'OR', 'FOR', 'IN', 'ON', 'AT', 'IS',
    'IT', 'BE', 'AS', 'BY', 'ARE', 'WAS', 'BUT', 'NOT', 'YOU', 'ALL',
    'PE', 'PB', 'PS', 'EPS', 'ROE', 'ROA', 'ROI', 'ROIC', 'FCF', 'DCF',
    'NOPAT', 'EBIT', 'EBITDA', 'EV', 'WACC', 'CAGR', 'NPV', 'IRR',
    'CEO', 'CFO', 'IPO', 'ETF', 'GDP', 'CPI', 'VIX', 'AI', 'ML',
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'
  ]);

  const validSymbols = [];
  const invalidSymbols = [];

  for (const symbol of potentialSymbols) {
    if (excludeWords.has(symbol)) continue;
    if (symbol.length < 2) continue;

    const result = await validateSymbol(symbol, db);
    if (result.valid) {
      validSymbols.push(result.symbol);
    } else if (result.code === 'SYMBOL_NOT_FOUND') {
      invalidSymbols.push(symbol);
    }
  }

  return {
    symbols: [...new Set(validSymbols)],
    invalid: [...new Set(invalidSymbols)]
  };
}

/**
 * Extract potential metric names from a query and check for invalid ones
 *
 * @param {string} query - The query to check
 * @returns {Object} - { valid: boolean, invalidMetrics: string[], error?: string }
 */
function checkForInvalidMetrics(query) {
  const queryLower = query.toLowerCase();

  // Patterns that indicate a metric is being requested
  const metricPatterns = [
    // "show me the X factor" or "what is the X score"
    /(?:show|get|what(?:'s| is)?|display|find)\s+(?:me\s+)?(?:the\s+)?(\w+)\s+(?:factor|score|ratio|metric)/gi,
    // "X factor for AAPL" or "X score of MSFT"
    /\b(\w+)\s+(?:factor|score|ratio)\s+(?:for|of)\b/gi,
    // "factor/score/metric called X"
    /(?:factor|score|metric|ratio)\s+(?:called|named)\s+["']?(\w+)["']?/gi,
    // "the X factor" at the end
    /\bthe\s+(\w+)\s+factor\b/gi
  ];

  const potentialMetrics = new Set();

  for (const pattern of metricPatterns) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(queryLower)) !== null) {
      const metric = match[1];
      if (metric && metric.length > 2) {
        potentialMetrics.add(metric);
      }
    }
  }

  // Check each potential metric
  const invalidMetrics = [];
  for (const metric of potentialMetrics) {
    // Skip if it's a known valid metric
    if (VALID_METRICS.has(metric)) continue;

    // Skip common non-metric words that might appear in these patterns
    const skipWords = new Set(['the', 'this', 'that', 'its', 'their', 'your', 'overall', 'total', 'current']);
    if (skipWords.has(metric)) continue;

    // Skip common non-metric words
    if (COMMON_WORDS.has(metric)) continue;

    // Allow compound valid metrics (e.g., "sharpe" from "sharpe ratio")
    const validPartials = ['sharpe', 'sortino', 'treynor', 'calmar', 'piotroski', 'altman', 'graham'];
    if (validPartials.includes(metric)) continue;

    // This appears to be an invalid metric name
    invalidMetrics.push(metric);
  }

  if (invalidMetrics.length > 0) {
    return {
      valid: false,
      invalidMetrics,
      error: `Unknown metric: "${invalidMetrics[0]}". Valid metrics include: PE ratio, ROE, dividend yield, Sharpe ratio, momentum, quality, etc.`,
      code: 'INVALID_METRIC'
    };
  }

  return { valid: true };
}

/**
 * Check for symbols that look like stock tickers but don't exist
 * Only flags symbols that are clearly intended as tickers (e.g., explicit ticker references)
 *
 * @param {string} query - The query to check
 * @param {Object} db - Database connection
 * @returns {Object} - { valid: boolean, invalidSymbols: string[], error?: string }
 */
async function checkForInvalidSymbols(query, db = null) {
  // More restrictive patterns - only match when clearly a ticker lookup
  const lookupPatterns = [
    // Possessive form: "AAPL's price", "MSFT's PE ratio"
    /\b([A-Z]{2,5})(?:'s|')\s+(?:price|pe|pb|ps|value|margin|growth|dividend|stock|shares|earnings|revenue)/gi,
    // "for AAPL", "about MSFT" - but not at start of common phrases
    /(?:for|about|of|analyze|check)\s+([A-Z]{2,5})(?:\s|$|,|\?)/g,
    // "Is XYZZY a good" pattern (asking about specific ticker)
    /\bIs\s+([A-Z]{2,5})\s+(?:a good|undervalued|overvalued|worth|going)/gi
  ];

  // Extensive list of false positives
  const falsePositives = new Set([
    // Common English words (2-5 letters uppercase)
    'IS', 'A', 'AN', 'THE', 'FOR', 'OF', 'TO', 'IN', 'ON', 'AT', 'BY', 'IT', 'ME',
    'ARE', 'WAS', 'HAS', 'HAD', 'CAN', 'MAY', 'NOW', 'ALL', 'ANY', 'NEW', 'OLD',
    'TOP', 'BIG', 'LOW', 'HIGH', 'BEST', 'MOST', 'SOME', 'MANY', 'GOOD', 'SAFE',
    'SHOW', 'FIND', 'GET', 'LIST', 'GIVE', 'TELL', 'LOOK', 'WITH', 'WIDE', 'WHAT',
    // Financial metrics/terms
    'PE', 'PB', 'PS', 'EPS', 'ROE', 'ROA', 'ROI', 'ROIC', 'FCF', 'DCF', 'ETF', 'IPO',
    'EBIT', 'VIX', 'GDP', 'CPI', 'FED', 'SEC', 'WACC', 'CAGR', 'NPV', 'IRR', 'NAV',
    // Titles and abbreviations
    'AI', 'ML', 'US', 'UK', 'EU', 'CEO', 'CFO', 'COO', 'CTO', 'VP', 'SVP', 'EVP',
    'LLC', 'INC', 'LTD', 'PLC', 'SA', 'AG', 'NV', 'SE',
    // Common company name words that aren't tickers
    'APPLE', 'GOOGLE', 'META', 'TESLA', 'AMAZON', 'INTEL', 'CISCO', 'ORACLE'
  ]);

  const potentialSymbols = new Set();

  for (const pattern of lookupPatterns) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(query)) !== null) {
      const symbol = match[1].toUpperCase();
      if (!falsePositives.has(symbol) && symbol.length >= 2 && symbol.length <= 5) {
        potentialSymbols.add(symbol);
      }
    }
  }

  if (potentialSymbols.size === 0 || !db) {
    return { valid: true };
  }

  // Check each symbol against database
  const invalidSymbols = [];
  for (const symbol of potentialSymbols) {
    try {
      const result = await db.query('SELECT id FROM companies WHERE symbol = $1', [symbol]);
      const company = result.rows?.[0];
      if (!company) {
        invalidSymbols.push(symbol);
      }
    } catch (error) {
      // Database error - don't block
      console.warn(`[InputValidator] DB check failed for ${symbol}:`, error.message);
    }
  }

  if (invalidSymbols.length > 0) {
    return {
      valid: false,
      invalidSymbols,
      error: `Unknown stock symbol: "${invalidSymbols[0]}". Please check the ticker and try again.`,
      code: 'SYMBOL_NOT_FOUND'
    };
  }

  return { valid: true };
}

module.exports = {
  validateQuery,
  validateSymbol,
  validateMetric,
  detectGibberish,
  sanitizeQuery,
  extractAndValidateSymbols,
  checkForInvalidMetrics,
  checkForInvalidSymbols,
  VALID_METRICS,
  MAX_QUERY_LENGTH
};
