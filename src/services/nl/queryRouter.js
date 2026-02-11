/**
 * Query Router - Decides between LLM path and fast handler path
 *
 * Conservative routing strategy:
 * - Use LLM for: follow-ups, calculations, complex reasoning, low-confidence queries
 * - Use fast handlers for: simple lookups, basic screening, when LLM unavailable
 */

const { getLLMHandler } = require('./llmHandler');
const {
  validateQuery,
  extractAndValidateSymbols,
  sanitizeQuery,
  checkForInvalidMetrics,
  checkForInvalidSymbols
} = require('./inputValidator');

/**
 * Patterns that indicate we should use the LLM
 */
const LLM_PATTERNS = {
  // Calculations and derived metrics
  calculation: /\b(calculate|compute|what would|what is the|nopat|wacc|dcf|intrinsic value|graham|fair value|worth)\b/i,

  // Risk metrics and technical calculations
  riskMetrics: /\b(sharpe|sortino|alpha|beta|volatility|risk[\s-]?adjusted|drawdown|correlation)\b/i,

  // Methodology and data source questions
  methodology: /\b(methodology|how (is|are|do you) (it|they|this|the|you) calculat|walk me through|data source|where (does|do) (the|your) data)\b/i,

  // Complex reasoning questions
  reasoning: /\b(why|should i|is it|are they|better|worse|recommend|think about|opinion|outlook|analysis)\b/i,

  // Comparisons requiring analysis
  comparison: /\b(compare|versus|vs\.?|which is|better than|difference between)\b/i,

  // Questions about implications
  implications: /\b(what does|what do|mean|imply|suggest|indicate|tell us)\b/i,

  // Follow-up patterns
  followUp: /\b(it|that|this|the stock|the company|those|these)\b/i,

  // Follow-up refinements - user wants to modify previous query parameters
  refinement: /\b(lower|higher|change|adjust|modify|increase|decrease|instead|rather|make it|set it|to \d+)/i,

  // Explanations
  explanation: /\b(explain|how does|what is a|define|understand)\b/i,

  // Multi-part questions
  multiPart: /\band\b.*\?|,\s*(and|also|plus)/i,

  // Broad/exploratory questions
  exploratory: /\b(give me|show me|tell me about|what do you think|insights|overview|summary)\b/i
};

/**
 * Patterns that indicate fast handler is sufficient
 */
const FAST_PATH_PATTERNS = {
  // Simple price/metric lookups
  simpleLookup: /^(what'?s?|show me|get|tell me)\s+[A-Z]{1,5}'?s?\s+(price|pe|pb|market cap|revenue|earnings|roe|roic)/i,

  // Direct symbol queries
  directSymbol: /^[A-Z]{1,5}\s+(price|pe|pb|ratio|margin|growth)/i,

  // Basic screening with clear criteria
  basicScreen: /^(show me|find|list|get)\s+(undervalued|overvalued|dividend|growth|value)\s+(stocks?|companies)/i,

  // Investor holdings (simple query)
  investorSimple: /^what does\s+(buffett|burry|ackman|dalio)\s+own/i
};

/**
 * Determine if a query should use the LLM path
 *
 * @param {string} query - User's query
 * @param {Object} context - Context including conversation history
 * @returns {Object} - { useLLM: boolean, reason: string }
 */
function shouldUseLLM(query, context = {}) {
  const queryLower = query.toLowerCase();

  // Check if LLM handler is available
  const llmHandler = getLLMHandler();
  if (!llmHandler.isAvailable()) {
    return {
      useLLM: false,
      reason: 'LLM not available (no API key configured)'
    };
  }

  // 1. Always use LLM for follow-up questions in a conversation
  if (context.conversation_id && context.message_count > 0) {
    // Check if query references previous context
    if (LLM_PATTERNS.followUp.test(query) && !hasExplicitSymbol(query)) {
      return {
        useLLM: true,
        reason: 'Follow-up question requiring conversation context'
      };
    }

    // Check for refinement/modification requests (e.g., "lower to 10%")
    if (LLM_PATTERNS.refinement.test(query)) {
      return {
        useLLM: true,
        reason: 'Follow-up refinement - modifying previous query parameters'
      };
    }
  }

  // 1b. Short queries that look like refinements should always go to LLM if in conversation
  if (context.conversation_id && context.message_count > 0) {
    // Very short queries (< 5 words) in a conversation are likely follow-ups
    const wordCount = query.split(/\s+/).length;
    if (wordCount < 5 && !hasExplicitSymbol(query)) {
      return {
        useLLM: true,
        reason: 'Short follow-up query requiring context'
      };
    }
  }

  // 2. Check for calculation requests
  if (LLM_PATTERNS.calculation.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Calculation or derived metric request'
    };
  }

  // 2b. Check for risk metrics (Sharpe, Sortino, alpha, beta, etc.)
  if (LLM_PATTERNS.riskMetrics.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Risk metrics calculation request'
    };
  }

  // 2c. Check for methodology/data source questions
  if (LLM_PATTERNS.methodology.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Methodology or data source question'
    };
  }

  // 3. Check for complex reasoning questions
  if (LLM_PATTERNS.reasoning.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Question requires reasoning or analysis'
    };
  }

  // 4. Check for comparison requests (beyond simple side-by-side)
  if (LLM_PATTERNS.comparison.test(queryLower) && query.includes('?')) {
    return {
      useLLM: true,
      reason: 'Comparison requiring analysis'
    };
  }

  // 5. Check for explanation requests
  if (LLM_PATTERNS.explanation.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Explanation or definition request'
    };
  }

  // 6. Check for implication questions
  if (LLM_PATTERNS.implications.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Question about implications or meaning'
    };
  }

  // 7. Multi-part questions benefit from LLM
  if (LLM_PATTERNS.multiPart.test(query)) {
    return {
      useLLM: true,
      reason: 'Multi-part question'
    };
  }

  // 7b. Exploratory/broad questions need LLM to decide what data is relevant
  if (LLM_PATTERNS.exploratory.test(queryLower)) {
    return {
      useLLM: true,
      reason: 'Exploratory question requiring intelligent data selection'
    };
  }

  // 8. Long questions (>10 words) often need LLM
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 10 && query.includes('?')) {
    return {
      useLLM: true,
      reason: 'Complex question (long query)'
    };
  }

  // 9. Check for fast-path patterns - if matched, use handler
  for (const [name, pattern] of Object.entries(FAST_PATH_PATTERNS)) {
    if (pattern.test(query)) {
      return {
        useLLM: false,
        reason: `Fast path: ${name}`
      };
    }
  }

  // 10. Default: use LLM for questions, handlers for commands
  if (query.includes('?')) {
    return {
      useLLM: true,
      reason: 'Question format - using LLM for comprehensive answer'
    };
  }

  // Default to fast path for commands/statements
  return {
    useLLM: false,
    reason: 'Command/statement - using fast handler'
  };
}

/**
 * Check if query contains an explicit stock symbol
 */
function hasExplicitSymbol(query) {
  // Match uppercase words that look like tickers (1-5 chars)
  const matches = query.match(/\b[A-Z]{1,5}\b/g);
  if (!matches) return false;

  // Exclude common words
  const excludeWords = new Set([
    'I', 'A', 'TO', 'THE', 'AND', 'OR', 'FOR', 'IN', 'ON', 'AT', 'IS',
    'IT', 'BE', 'AS', 'BY', 'ARE', 'WAS', 'BUT', 'NOT', 'YOU', 'ALL',
    'PE', 'PB', 'PS', 'EPS', 'ROE', 'ROA', 'ROI', 'ROIC', 'FCF', 'DCF',
    'NOPAT', 'EBIT', 'EBITDA', 'EV', 'WACC', 'CAGR', 'NPV', 'IRR',
    'CEO', 'CFO', 'IPO', 'ETF', 'GDP', 'CPI', 'VIX', 'AI', 'ML'
  ]);

  return matches.some(m => m.length >= 2 && !excludeWords.has(m));
}

/**
 * Route a query to either LLM or fast handler
 *
 * @param {string} query - User's query
 * @param {Object} context - Context including conversation history
 * @returns {Object} - Routing decision with metadata
 */
async function routeQuery(query, context = {}) {
  // 1. Validate input first (security + UX checks)
  const validation = validateQuery(query);
  if (!validation.valid) {
    console.log(`[QueryRouter] Query rejected: ${validation.code} - "${query?.slice(0, 30)}..."`);
    return {
      success: false,
      error: validation.error,
      code: validation.code,
      details: validation.details,
      routing: {
        path: 'rejected',
        reason: validation.code
      }
    };
  }

  // Use sanitized query from here on
  const sanitizedQuery = validation.sanitized || query;

  // 2. Check for invalid metrics (semantic validation)
  const metricCheck = checkForInvalidMetrics(sanitizedQuery);
  if (!metricCheck.valid) {
    console.log(`[QueryRouter] Query rejected: ${metricCheck.code} - "${sanitizedQuery.slice(0, 30)}..."`);
    return {
      success: false,
      error: metricCheck.error,
      code: metricCheck.code,
      invalidMetrics: metricCheck.invalidMetrics,
      routing: {
        path: 'rejected',
        reason: metricCheck.code
      }
    };
  }

  // 3. Check for invalid symbols (semantic validation)
  if (context.db) {
    const symbolCheck = await checkForInvalidSymbols(sanitizedQuery, context.db);
    if (!symbolCheck.valid) {
      console.log(`[QueryRouter] Query rejected: ${symbolCheck.code} - "${sanitizedQuery.slice(0, 30)}..."`);
      return {
        success: false,
        error: symbolCheck.error,
        code: symbolCheck.code,
        invalidSymbols: symbolCheck.invalidSymbols,
        routing: {
          path: 'rejected',
          reason: symbolCheck.code
        }
      };
    }
  }

  const decision = shouldUseLLM(sanitizedQuery, context);

  console.log(`[QueryRouter] Query: "${sanitizedQuery.slice(0, 50)}..." -> ${decision.useLLM ? 'LLM' : 'Handler'} (${decision.reason})`);

  if (decision.useLLM) {
    const llmHandler = getLLMHandler();

    // Build conversation history from context
    const conversationHistory = context.history || [];

    // Process with LLM (use sanitized query)
    const result = await llmHandler.processQuery(sanitizedQuery, conversationHistory, context);

    // If LLM failed, mark for fallback
    if (!result.success && result.fallback) {
      return {
        ...result,
        routing: {
          path: 'llm_failed',
          reason: decision.reason,
          fallback_to_handler: true
        }
      };
    }

    return {
      ...result,
      routing: {
        path: 'llm',
        reason: decision.reason
      }
    };
  }

  // Return indicator to use fast handler
  return {
    useFastHandler: true,
    routing: {
      path: 'handler',
      reason: decision.reason
    }
  };
}

module.exports = {
  shouldUseLLM,
  routeQuery,
  hasExplicitSymbol
};
