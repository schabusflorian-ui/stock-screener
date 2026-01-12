// src/api/routes/nlQuery.js
/**
 * Natural Language Query API Routes
 *
 * Provides endpoints for processing natural language investment queries.
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database');

const database = db.getDatabase();

// Python service for NL processing
let pythonProcess = null;
let requestQueue = new Map();
let requestIdCounter = 0;

/**
 * Start the Python NL service
 */
let pythonReady = false;
let pythonReadyResolve = null;

function startPythonService() {
  const pythonPath = process.env.PYTHON_PATH || 'python3';
  const scriptPath = path.join(__dirname, '../../services/nl/server.py');

  pythonReady = false;

  pythonProcess = spawn(pythonPath, [scriptPath], {
    cwd: path.join(__dirname, '../../..'),
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  let buffer = '';

  pythonProcess.stdout.on('data', (data) => {
    buffer += data.toString();

    // Process complete JSON lines
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);

          // Handle ready signal
          if (response.status === 'ready') {
            console.log('NL Python service ready');
            pythonReady = true;
            if (pythonReadyResolve) {
              pythonReadyResolve();
              pythonReadyResolve = null;
            }
            continue;
          }

          const resolver = requestQueue.get(response.request_id);
          if (resolver) {
            resolver(response);
            requestQueue.delete(response.request_id);
          }
        } catch (e) {
          console.error('Failed to parse Python response:', e);
        }
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('NL Python service error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    console.log(`NL Python service exited with code ${code}`);
    pythonProcess = null;
    pythonReady = false;
    // Reject any pending requests
    for (const [id, resolver] of requestQueue.entries()) {
      resolver({ success: false, error: 'Service crashed' });
    }
    requestQueue.clear();
  });

  console.log('NL Python service started');
}

/**
 * Send a request to the Python service
 */
async function sendToPython(action, data, timeout = 30000) {
  // Start service if not running
  if (!pythonProcess) {
    startPythonService();
  }

  // Wait for Python service to be ready (LLM router initialization can take 10+ seconds)
  if (!pythonReady) {
    await new Promise((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        pythonReadyResolve = null;
        reject(new Error('Python service startup timeout'));
      }, 20000); // 20 second startup timeout

      pythonReadyResolve = () => {
        clearTimeout(readyTimeout);
        resolve();
      };

      // If already ready by the time we check
      if (pythonReady) {
        clearTimeout(readyTimeout);
        resolve();
      }
    });
  }

  const requestId = `req_${++requestIdCounter}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requestQueue.delete(requestId);
      reject(new Error('Request timeout'));
    }, timeout);

    requestQueue.set(requestId, (response) => {
      clearTimeout(timer);
      resolve(response);
    });

    const request = JSON.stringify({
      request_id: requestId,
      action,
      ...data
    });

    pythonProcess.stdin.write(request + '\n');
  });
}

// Company name to ticker mapping for fallback
const COMPANY_TO_TICKER = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'meta': 'META', 'facebook': 'META', 'nvidia': 'NVDA',
  'tesla': 'TSLA', 'netflix': 'NFLX', 'costco': 'COST', 'walmart': 'WMT',
  'disney': 'DIS', 'nike': 'NKE', 'starbucks': 'SBUX', 'visa': 'V',
  'mastercard': 'MA', 'paypal': 'PYPL', 'intel': 'INTC', 'amd': 'AMD',
  'adobe': 'ADBE', 'salesforce': 'CRM', 'jpmorgan': 'JPM', 'goldman': 'GS',
  'berkshire': 'BRK.B', 'coca cola': 'KO', 'coke': 'KO', 'pepsi': 'PEP',
  'boeing': 'BA', 'uber': 'UBER', 'airbnb': 'ABNB', 'palantir': 'PLTR',
  'snowflake': 'SNOW', 'zoom': 'ZM', 'shopify': 'SHOP', 'spotify': 'SPOT',
};

// Synonym expansion for better intent detection
const SYNONYMS = {
  'cheap': 'undervalued', 'expensive': 'overvalued', 'bargain': 'undervalued',
  'giant': 'large cap', 'big companies': 'large cap', 'tiny': 'small cap',
  'money-making': 'profitable', 'quality': 'high quality',
  'fast growing': 'high growth', 'booming': 'high growth', 'exploding': 'high growth',
  'safe': 'stable', 'risky': 'volatile', 'income stocks': 'dividend',
  'passive income': 'dividend', 'give me': 'show me', 'i want': 'show me',
  'looking for': 'find', 'get me': 'show me', 'list': 'show me',
  'whats up with': "what's driving", 'how come': 'why', 'reason for': 'why',
  'head to head': 'compare', 'side by side': 'compare', 'which is better': 'compare',
};

// Common typo corrections
const TYPO_CORRECTIONS = {
  'divident': 'dividend', 'dividned': 'dividend', 'reveue': 'revenue',
  'revnue': 'revenue', 'margni': 'margin', 'marign': 'margin',
  'earings': 'earnings', 'grwoth': 'growth', 'growht': 'growth',
  'valuaton': 'valuation', 'comprae': 'compare', 'comapre': 'compare',
  'similiar': 'similar', 'simlar': 'similar', 'histroical': 'historical',
  'techonology': 'technology', 'finacial': 'financial',
};

/**
 * Pre-process query for better understanding
 */
function preprocessQuery(query) {
  let processed = query.toLowerCase();

  // Fix typos
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    processed = processed.replace(new RegExp(typo, 'gi'), correction);
  }

  // Expand synonyms
  for (const [synonym, canonical] of Object.entries(SYNONYMS)) {
    if (processed.includes(synonym)) {
      processed = processed + ` ${canonical}`;
    }
  }

  return processed;
}

/**
 * Resolve company names to tickers
 */
function resolveCompanyNames(query) {
  const queryLower = query.toLowerCase();
  const resolved = [];

  for (const [name, ticker] of Object.entries(COMPANY_TO_TICKER)) {
    if (queryLower.includes(name)) {
      resolved.push({ name, ticker });
    }
  }

  return resolved;
}

/**
 * Mock implementation for when Python service is unavailable
 * Returns responses with natural confirmation and confidence indicators
 */
function getMockResponse(query) {
  const preprocessed = preprocessQuery(query);
  const companyResolutions = resolveCompanyNames(query);

  // Detect intent from keywords (now using preprocessed query)
  let intent = 'unknown';
  let confidence = 0.3;

  // More comprehensive intent patterns - ordered by specificity
  // INVESTOR intent - check first (most specific)
  if (/buffett|burry|dalio|ackman|icahn|soros|druckenmiller|tepper|cohen|einhorn|loeb|klarman|marks|berkshire|bridgewater|pershing|scion|13f filing|holdings of|portfolio of/.test(preprocessed)) {
    intent = 'investor';
    confidence = 0.85;
  } else if (/my portfolio|portfolio analysis|portfolio performance|analyze portfolio|portfolio holdings/.test(preprocessed)) {
    intent = 'portfolio';
    confidence = 0.85;
  } else if (/compare|vs\b|versus|head to head|side by side|difference between/.test(preprocessed)) {
    intent = 'compare';
    confidence = 0.8;
  } else if (/like|similar|peers|competitors|alternatives/.test(preprocessed)) {
    intent = 'similarity';
    confidence = 0.75;
  } else if (/history|over time|years|trend|changed|historical|since \d{4}/.test(preprocessed)) {
    intent = 'historical';
    confidence = 0.75;
  } else if (/driving|behind|why|what's causing|reason|factors/.test(preprocessed)) {
    intent = 'driver';
    confidence = 0.7;
  } else if (/top \d+|best|worst|highest|lowest|ranking/.test(preprocessed)) {
    intent = 'ranking';
    confidence = 0.8;
  } else if (/show me|find|screen|filter|list|give me|get me|looking for|i want|search for/.test(preprocessed) &&
             /stocks?|companies|securities/.test(preprocessed)) {
    // Only match SCREEN if there's a mention of stocks/companies
    intent = 'screen';
    confidence = 0.7;
  } else if (/what's|what is|tell me about|info|details|show me \w+ data/.test(preprocessed)) {
    intent = 'lookup';
    confidence = 0.6;
  }
  // If no pattern matched confidently, stay with 'unknown' (default)

  // Extract symbols - uppercase words that look like tickers
  const symbolMatch = query.match(/\b([A-Z]{1,5})\b/g);
  // Exclude common words AND financial metrics
  const excludeWords = new Set([
    // Common English words
    'I', 'A', 'TO', 'THE', 'AND', 'OR', 'FOR', 'IN', 'ON', 'AT', 'IS',
    'IT', 'BE', 'AS', 'BY', 'ARE', 'WAS', 'BUT', 'NOT', 'YOU', 'ALL', 'TOP', 'VS',
    'GET', 'SHOW', 'FIND', 'MY', 'NO', 'UP', 'DO', 'GO', 'ME', 'WE', 'AN', 'AM',
    // Financial metrics (NOT stock symbols)
    'PE', 'PB', 'PS', 'EPS', 'ROE', 'ROA', 'ROI', 'ROIC', 'FCF', 'DCF',
    'NOPAT', 'EBIT', 'EBITDA', 'EV', 'WACC', 'CAGR', 'NPV', 'IRR',
    'YOY', 'QOQ', 'TTM', 'FY', 'MRQ', 'LTM', 'NTM', 'FWD',
    // Business acronyms
    'ETF', 'IPO', 'CEO', 'CFO', 'COO', 'CTO', 'USA', 'USD', 'EUR', 'GBP', 'CAD',
    'SEC', 'GDP', 'CPI', 'FED', 'API'
  ]);
  const potentialSymbols = symbolMatch ?
    symbolMatch.filter(s => s.length >= 2 && !excludeWords.has(s)) : [];

  // Add company name resolutions
  for (const { ticker } of companyResolutions) {
    if (!potentialSymbols.includes(ticker)) {
      potentialSymbols.push(ticker);
    }
  }

  // Build natural confirmation message
  let confirmation = buildConfirmation(intent, potentialSymbols, companyResolutions);

  // Determine confidence level and reason
  const { level: confidenceLevel, reason: confidenceReason } = assessConfidence(
    intent, confidence, potentialSymbols, companyResolutions
  );

  // Generate context-aware follow-up suggestions
  const suggestions = buildFollowUpSuggestions(intent, potentialSymbols);

  return {
    success: true,
    intent,
    result: {
      type: 'processed_response',
      message: `Processed query: "${query}"`,
      detected_intent: intent,
      symbols: potentialSymbols.slice(0, 5),
      company_resolutions: companyResolutions.map(r => `${r.name} → ${r.ticker}`),
    },
    query_interpretation: `Intent: ${intent}` +
      (potentialSymbols.length ? ` | Symbols: ${potentialSymbols.join(', ')}` : ''),
    suggestions,
    confirmation,
    confidence: confidenceLevel,
    confidence_reason: confidenceReason
  };
}

/**
 * Build a natural confirmation message
 */
function buildConfirmation(intent, symbols, companyResolutions) {
  const symbol = symbols[0] || (companyResolutions[0]?.ticker);

  switch (intent) {
    case 'lookup':
      return symbol
        ? `Getting information about ${symbol}...`
        : 'Looking up stock information...';

    case 'screen':
      return 'Screening for stocks matching your criteria...';

    case 'compare':
      if (symbols.length >= 2) {
        return `Comparing ${symbols[0]} with ${symbols[1]}...`;
      }
      return symbol
        ? `Finding comparisons for ${symbol}...`
        : 'Setting up a comparison...';

    case 'similarity':
      return symbol
        ? `Finding stocks similar to ${symbol}...`
        : 'Searching for similar stocks...';

    case 'historical':
      return symbol
        ? `Analyzing ${symbol}'s historical performance...`
        : 'Looking at historical trends...';

    case 'driver':
      return symbol
        ? `Identifying what's driving ${symbol}'s performance...`
        : 'Analyzing performance drivers...';

    case 'ranking':
      return 'Ranking stocks by your specified criteria...';

    default:
      return 'Processing your question...';
  }
}

/**
 * Assess confidence level and provide a reason
 */
function assessConfidence(intent, rawConfidence, symbols, companyResolutions) {
  if (intent === 'unknown') {
    return {
      level: 'low',
      reason: "I wasn't sure what you were asking for"
    };
  }

  const hasSymbols = symbols.length > 0 || companyResolutions.length > 0;

  if (rawConfidence >= 0.75 && hasSymbols) {
    return {
      level: 'high',
      reason: 'Good data coverage for this query'
    };
  } else if (rawConfidence >= 0.6) {
    if (!hasSymbols && !['screen', 'ranking'].includes(intent)) {
      return {
        level: 'medium',
        reason: 'No specific stock identified - using general search'
      };
    }
    return {
      level: 'medium',
      reason: 'Basic analysis mode (Python service not available)'
    };
  } else {
    return {
      level: 'low',
      reason: 'Limited understanding of this query type'
    };
  }
}

/**
 * Build natural follow-up suggestions based on context
 */
function buildFollowUpSuggestions(intent, symbols) {
  const symbol = symbols[0];

  if (intent === 'unknown') {
    return [
      'Try: "Show me undervalued tech stocks"',
      'Or: "Compare AAPL to MSFT"',
      'Or: "What\'s driving NVDA\'s growth?"'
    ];
  }

  if (intent === 'lookup' && symbol) {
    return [
      `How does ${symbol} compare to competitors?`,
      `Find stocks similar to ${symbol}`,
      `${symbol}'s revenue trend over 5 years`
    ];
  }

  if (intent === 'screen') {
    return [
      'Narrow results by adding more filters',
      'Sort by a different metric',
      'Compare the top results'
    ];
  }

  if (intent === 'compare' && symbols.length >= 2) {
    return [
      'Which is better for dividends?',
      'Compare their growth rates',
      'Look at valuation metrics'
    ];
  }

  if (intent === 'similarity' && symbol) {
    return [
      `Compare ${symbol} to the similar stocks`,
      `What's driving ${symbol}'s performance?`,
      'Screen for stocks with similar characteristics'
    ];
  }

  // Default suggestions
  return [
    'Ask about a specific stock (e.g., AAPL)',
    'Screen for stocks with specific criteria',
    'Compare two or more companies'
  ];
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/nl/query
 * Process a natural language query with conversation memory
 */
router.post('/query', async (req, res) => {
  try {
    const { query, context, conversation_id, session_id } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    // Get or create conversation for memory
    let conversation = null;
    let conversationContext = null;
    let resolvedQuery = query;
    let contextResolved = false;

    try {
      conversation = getOrCreateConversation(conversation_id, session_id);

      // Get context from previous messages
      if (conversation.message_count > 0) {
        conversationContext = getConversationContext(conversation.id);

        // Resolve pronouns and references using conversation history
        const resolution = resolveContextualReferences(query, conversationContext);
        if (resolution.resolved) {
          resolvedQuery = resolution.query;
          contextResolved = true;
          console.log(`Resolved query: "${query}" -> "${resolvedQuery}"`);
        }
      }
    } catch (convError) {
      console.warn('Conversation tracking error (non-fatal):', convError.message);
    }

    // Merge conversation context with provided context
    const enrichedContext = {
      ...context,
      conversation_id: conversation?.id,
      last_symbol: conversationContext?.last_symbol,
      recent_symbols: conversationContext?.recent_symbols,
    };

    // Try Python service first
    let response;
    try {
      response = await sendToPython('query', {
        query: resolvedQuery,
        context: enrichedContext,
        conversation_history: conversation?.id ? getConversationHistory(conversation.id, 3) : []
      });
    } catch (e) {
      console.warn('Python service unavailable, using mock:', e.message);
      response = getMockResponse(resolvedQuery);
    }

    // Store the message in conversation history
    try {
      if (conversation) {
        // Store user query - extract symbols from various possible locations
        let symbols = response.result?.symbols || response.result?.detected_symbols || [];
        // Also check for single symbol in result
        if (symbols.length === 0 && response.result?.symbol) {
          symbols = [response.result.symbol];
        }
        // Check query_interpretation for symbols
        if (symbols.length === 0 && response.query_interpretation) {
          const match = response.query_interpretation.match(/Symbols:\s*([A-Z, ]+)/);
          if (match) {
            symbols = match[1].split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length <= 5);
          }
        }
        storeMessage(
          conversation.id,
          'user',
          query, // Store original query, not resolved
          response.intent,
          symbols,
          response.result?.entities
        );

        // Store assistant response summary
        const responseSummary = response.result?.summary ||
          response.confirmation ||
          `${response.intent} response`;
        storeMessage(
          conversation.id,
          'assistant',
          responseSummary,
          response.intent,
          symbols,
          null
        );
      }
    } catch (storeError) {
      console.warn('Failed to store message (non-fatal):', storeError.message);
    }

    // Add conversation info to response
    response.conversation_id = conversation?.id;
    if (contextResolved) {
      response.context_resolved = {
        original_query: query,
        resolved_query: resolvedQuery,
        using_symbol: conversationContext?.last_symbol
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('NL query error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process query'
    });
  }
});

/**
 * POST /api/nl/classify
 * Classify a query without executing
 */
router.post('/classify', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    try {
      const response = await sendToPython('classify', { query });
      return res.json(response);
    } catch (e) {
      // Mock classification
      const mockResp = getMockResponse(query);
      return res.json({
        success: true,
        intent: mockResp.intent,
        entities: { symbols: mockResp.result.potential_symbols },
        confidence: 0.5
      });
    }
  } catch (error) {
    console.error('Classification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to classify query'
    });
  }
});

/**
 * GET /api/nl/examples
 * Get example queries by intent type
 */
router.get('/examples', (req, res) => {
  res.json({
    screen: [
      "Show me undervalued tech stocks",
      "Find high dividend stocks with low debt",
      "Top 10 stocks by revenue growth",
      "Small cap growth stocks",
      "Quality companies with strong margins"
    ],
    lookup: [
      "What's AAPL's P/E ratio?",
      "Show me NVDA's market cap",
      "Tell me about MSFT",
      "GOOGL revenue growth"
    ],
    compare: [
      "Compare AAPL to MSFT",
      "How does NVDA compare to AMD?",
      "GOOGL vs META on valuation",
      "Compare tech giants"
    ],
    historical: [
      "How has AAPL's revenue changed over 5 years?",
      "Show TSLA's margin history",
      "NVDA's growth trend",
      "Compare current to 3 years ago"
    ],
    similarity: [
      "Find stocks like COST",
      "What's similar to AAPL?",
      "Stocks with similar profile to NVDA",
      "Companies like MSFT"
    ],
    driver: [
      "What's driving NVDA's growth?",
      "Explain AAPL's profitability",
      "Why is TSLA's margin declining?",
      "Revenue drivers for AMZN"
    ]
  });
});

/**
 * GET /api/nl/suggestions
 * Get context-aware query suggestions with natural language
 */
router.get('/suggestions', (req, res) => {
  const { symbol, page, sector, previousQuery } = req.query;

  let suggestions = [];
  let greeting = null;

  // Build natural, context-aware suggestions
  if (symbol) {
    // We're on a company page - make suggestions about this company
    const companyGreetings = [
      `I can help you analyze ${symbol}. Try asking:`,
      `Want to learn more about ${symbol}? Here are some ideas:`,
      `Exploring ${symbol}? You might want to ask:`
    ];
    greeting = companyGreetings[Math.floor(Math.random() * companyGreetings.length)];

    suggestions = [
      `Is ${symbol} fairly valued right now?`,
      `What companies are similar to ${symbol}?`,
      `How has ${symbol}'s revenue grown over the past 5 years?`,
      `What's driving ${symbol}'s margins?`,
      `Compare ${symbol} to its main competitors`,
      `What would ${symbol} be worth at 20x earnings?`
    ];

    // Shuffle and pick 4
    suggestions = shuffleArray(suggestions).slice(0, 4);

  } else if (page === 'screening' || page === 'screener') {
    greeting = "Looking for stocks? Try these searches:";
    suggestions = [
      "Find undervalued tech stocks with strong margins",
      "Show me dividend stocks with low debt",
      "Small cap growth companies under $10B market cap",
      "Quality stocks with ROE above 20%"
    ];

  } else if (page === 'comparison' || page === 'compare') {
    greeting = "Ready to compare? Some ideas:";
    suggestions = [
      "Compare AAPL and MSFT on valuation",
      "Which is better - AMD or NVDA?",
      "Compare the top 3 cloud companies",
      "GOOGL vs META - who wins on growth?"
    ];

  } else if (sector) {
    greeting = `Exploring ${sector}? Try asking:`;
    suggestions = [
      `What are the best ${sector} stocks?`,
      `Show me undervalued ${sector} companies`,
      `Compare top ${sector} stocks by profitability`,
      `Which ${sector} stocks have the highest dividends?`
    ];

  } else {
    // Default suggestions - vary them to feel fresh
    const defaultSuggestionSets = [
      [
        "Show me undervalued tech stocks",
        "What's driving NVDA's incredible growth?",
        "Compare AAPL to MSFT",
        "Find high-dividend stocks with growing revenue"
      ],
      [
        "Which stocks are similar to COST?",
        "Top 10 stocks by profit margin",
        "Is TSLA overvalued or undervalued?",
        "Compare the FAANG stocks on valuation"
      ],
      [
        "Find quality growth stocks",
        "What would AMZN be worth at 25x earnings?",
        "Show me stable dividend payers",
        "Which bank stocks look cheap?"
      ]
    ];
    suggestions = defaultSuggestionSets[Math.floor(Math.random() * defaultSuggestionSets.length)];
    greeting = "What would you like to explore?";
  }

  res.json({
    suggestions,
    greeting,
    context: { symbol, page, sector }
  });
});

// Helper to shuffle an array
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// Conversation Memory Functions
// =============================================================================

/**
 * Get or create a conversation
 */
function getOrCreateConversation(conversationId, sessionId) {
  if (conversationId) {
    // Check if conversation exists
    const existing = database.prepare(
      'SELECT * FROM nl_conversations WHERE id = ?'
    ).get(conversationId);

    if (existing) {
      return existing;
    }
  }

  // Create new conversation
  const newId = conversationId || uuidv4();
  database.prepare(`
    INSERT INTO nl_conversations (id, session_id, created_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(newId, sessionId || 'anonymous');

  return { id: newId, session_id: sessionId, message_count: 0 };
}

/**
 * Get conversation history (last N messages)
 */
function getConversationHistory(conversationId, limit = 5) {
  return database.prepare(`
    SELECT role, content, intent, symbols, entities, timestamp
    FROM nl_messages
    WHERE conversation_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(conversationId, limit).reverse(); // Reverse to get chronological order
}

/**
 * Store a message in conversation history
 */
function storeMessage(conversationId, role, content, intent, symbols, entities) {
  database.prepare(`
    INSERT INTO nl_messages (conversation_id, role, content, intent, symbols, entities)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    role,
    content,
    intent,
    JSON.stringify(symbols || []),
    JSON.stringify(entities || {})
  );

  // Update conversation metadata
  const lastSymbol = symbols && symbols.length > 0 ? symbols[0] : null;
  database.prepare(`
    UPDATE nl_conversations
    SET updated_at = CURRENT_TIMESTAMP,
        last_symbol = COALESCE(?, last_symbol),
        last_intent = COALESCE(?, last_intent),
        message_count = message_count + 1
    WHERE id = ?
  `).run(lastSymbol, intent, conversationId);
}

/**
 * Get context from previous messages for follow-up queries
 */
function getConversationContext(conversationId) {
  const conversation = database.prepare(
    'SELECT last_symbol, last_intent FROM nl_conversations WHERE id = ?'
  ).get(conversationId);

  if (!conversation) return null;

  // Get recent symbols from messages
  const recentMessages = database.prepare(`
    SELECT symbols, intent
    FROM nl_messages
    WHERE conversation_id = ? AND role = 'user'
    ORDER BY timestamp DESC
    LIMIT 3
  `).all(conversationId);

  const recentSymbols = [];
  for (const msg of recentMessages) {
    try {
      const symbols = JSON.parse(msg.symbols || '[]');
      for (const s of symbols) {
        if (!recentSymbols.includes(s)) {
          recentSymbols.push(s);
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  return {
    last_symbol: conversation.last_symbol,
    last_intent: conversation.last_intent,
    recent_symbols: recentSymbols.slice(0, 5),
  };
}

/**
 * Resolve pronouns and references using conversation context
 */
function resolveContextualReferences(query, conversationContext) {
  if (!conversationContext || !conversationContext.last_symbol) {
    return { query, resolved: false };
  }

  const lastSymbol = conversationContext.last_symbol;
  let modifiedQuery = query;
  let resolved = false;

  // Patterns that reference previous context
  const pronounPatterns = [
    /\b(it|its|it's)\b/gi,
    /\b(the stock|this stock|that stock)\b/gi,
    /\b(the company|this company|that company)\b/gi,
    /\b(them|they|their)\b/gi,
  ];

  // Check if query has pronouns but no explicit stock symbol
  // Exclude common non-symbol uppercase words like PE, EPS, ROE, RSI, etc.
  const commonTerms = ['PE', 'EPS', 'ROE', 'ROA', 'ROIC', 'RSI', 'ATR', 'MACD', 'SMA', 'EMA', 'EBITDA', 'CEO', 'CFO', 'IPO', 'ETF', 'GDP', 'CPI', 'VIX', 'YTD', 'QTD', 'TTM', 'YOY', 'MOM', 'USA', 'USD', 'EUR', 'GBP', 'JPY', 'AI', 'ML', 'API', 'CEO'];
  const hasExplicitSymbol = (() => {
    const matches = query.match(/\b[A-Z]{1,5}\b/g) || [];
    // Filter out common non-symbol terms
    const potentialSymbols = matches.filter(m => !commonTerms.includes(m));
    return potentialSymbols.length > 0;
  })();

  if (!hasExplicitSymbol) {
    for (const pattern of pronounPatterns) {
      if (pattern.test(query)) {
        modifiedQuery = query.replace(pattern, lastSymbol);
        resolved = true;
        break;
      }
    }

    // Also handle queries that start with comparison/follow-up words
    const followUpPatterns = [
      /^(and|also|what about|how about|now show|now compare)/i,
      /^(compare it|compare them)/i,
      /^(how does it|how do they)/i,
    ];

    for (const pattern of followUpPatterns) {
      if (pattern.test(query) && !hasExplicitSymbol) {
        // Append the last symbol context
        modifiedQuery = `${query} for ${lastSymbol}`;
        resolved = true;
        break;
      }
    }
  }

  return { query: modifiedQuery, resolved, original: query };
}

/**
 * GET /api/nl/health
 * Check NL service health
 */
router.get('/health', (req, res) => {
  res.json({
    status: pythonProcess ? 'running' : 'stopped',
    pendingRequests: requestQueue.size
  });
});

/**
 * GET /api/nl/conversation/:id
 * Get conversation history
 */
router.get('/conversation/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const conversation = database.prepare(
      'SELECT * FROM nl_conversations WHERE id = ?'
    ).get(id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = getConversationHistory(id, parseInt(limit));

    res.json({
      conversation,
      messages,
      message_count: messages.length
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * DELETE /api/nl/conversation/:id
 * Clear/delete a conversation
 */
router.delete('/conversation/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Delete messages first (foreign key)
    database.prepare('DELETE FROM nl_messages WHERE conversation_id = ?').run(id);

    // Delete conversation
    const result = database.prepare('DELETE FROM nl_conversations WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * POST /api/nl/conversation/new
 * Start a new conversation (optionally clearing an old one)
 */
router.post('/conversation/new', (req, res) => {
  try {
    const { session_id, clear_previous } = req.body;

    // Optionally clear previous conversations for this session
    if (clear_previous && session_id) {
      database.prepare(`
        DELETE FROM nl_messages WHERE conversation_id IN (
          SELECT id FROM nl_conversations WHERE session_id = ?
        )
      `).run(session_id);
      database.prepare('DELETE FROM nl_conversations WHERE session_id = ?').run(session_id);
    }

    // Create new conversation
    const conversation = getOrCreateConversation(null, session_id);

    res.json({
      conversation_id: conversation.id,
      message: 'New conversation started'
    });
  } catch (error) {
    console.error('New conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

module.exports = router;
