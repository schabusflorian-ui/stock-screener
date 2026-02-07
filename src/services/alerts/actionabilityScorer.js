// src/services/alerts/actionabilityScorer.js
// Scores alerts by actionability - "What can the user DO about this?"

const { getDatabaseAsync } = require('../../database');
const { getActionabilityBase } = require('./alertDefinitions');

/**
 * Base actionability scores by alert code
 * Scale: 0.0 (purely informational) to 1.0 (strong action implied)
 */
const BASE_ACTIONABILITY_SCORES = {
  // High actionability - clear action implied
  'insider_buying_cluster': 0.9,      // Investigate/consider buying
  'quality_value_convergence': 0.9,   // Strong buy consideration
  'accumulation_zone': 0.9,           // Strong buy zone
  'large_insider_buy': 0.9,           // Significant signal
  'stop_loss_triggered': 1.0,         // Review stop loss
  'take_profit_triggered': 1.0,       // Review take profit

  // Medium-high actionability
  'dcf_undervalued_50': 0.8,          // Deep value opportunity
  'dcf_undervalued_25': 0.7,          // Value opportunity
  'fallen_angel': 0.8,                // Quality at discount
  'triple_bullish_signal': 0.85,      // Multiple confirming signals
  'insider_buying': 0.7,              // Worth investigating

  // Medium actionability
  'pe_below_10': 0.7,                 // Deep value metric
  'pb_below_1': 0.6,                  // Below book value
  'fcf_yield_above_15': 0.7,          // Strong cash yield
  'new_52w_low': 0.6,                 // Potential opportunity
  'red_flag_cluster': 0.8,            // Review/reduce position

  // Lower actionability - informational
  'pe_below_15': 0.5,                 // Standard value metric
  'fcf_yield_above_10': 0.5,          // Good cash yield
  'roic_crossed_20': 0.5,             // Quality indicator
  'rsi_oversold': 0.4,                // Technical only
  'rsi_deeply_oversold': 0.5,         // More significant technical

  // Low actionability - monitoring
  'near_52w_low': 0.4,                // Watch for opportunity
  'crossed_below_sma200': 0.3,        // Trend indicator
  'margin_expansion': 0.3,            // Business update
  'roic_crossed_15': 0.4,             // Quality threshold
  'pe_below_5yr_avg': 0.4,            // Historical comparison

  // Minimal actionability - informational
  'entered_screener': 0.4,            // Added to list
  'exited_screener': 0.2,             // Removed from list
  'debt_improved': 0.3,               // Balance sheet update
  'significant_drop_5d': 0.5,         // Price move
  'significant_drop_1m': 0.5          // Price move
};

/**
 * Action suggestions by alert type
 */
const ACTION_SUGGESTIONS = {
  // Strong buy signals
  'quality_value_convergence': [
    'Review fundamentals for any concerns',
    'Consider adding to position',
    'Check recent news for any red flags'
  ],
  'dcf_undervalued_50': [
    'Evaluate margin of safety',
    'Review DCF model assumptions',
    'Consider staged entry'
  ],
  'dcf_undervalued_25': [
    'Review valuation methodology',
    'Compare to peers',
    'Consider starting a position'
  ],
  'accumulation_zone': [
    'Multiple signals align - strong entry zone',
    'Review fundamentals before entry',
    'Consider position sizing'
  ],

  // Insider signals
  'insider_buying_cluster': [
    'Review insider transaction history',
    'Check for upcoming catalysts',
    'Investigate company outlook'
  ],
  'insider_buying': [
    'Research insider rationale',
    'Review recent company news',
    'Check insider track record'
  ],
  'large_insider_buy': [
    'Significant insider conviction',
    'Review company thoroughly',
    'Check for regulatory filings'
  ],
  'insider_selling_cluster': [
    'Investigate selling rationale',
    'Review position sizing',
    'Check for scheduled sales vs discretionary'
  ],

  // Technical signals
  'rsi_oversold': [
    'Check if move is idiosyncratic or market-wide',
    'Wait for reversal confirmation',
    'Review fundamental support for price'
  ],
  'rsi_deeply_oversold': [
    'Technical bounce likely',
    'Review reason for decline',
    'Consider if fundamentals support recovery'
  ],
  'new_52w_low': [
    'Investigate cause of decline',
    'Check if fundamentals justify price',
    'Review competitive position'
  ],

  // Warning signals
  'red_flag_cluster': [
    'Review position sizing',
    'Consider setting stop-loss',
    'Evaluate exit strategy'
  ],
  'fcf_turned_negative': [
    'Review cash position',
    'Assess burn rate sustainability',
    'Check management commentary'
  ],
  'debt_warning': [
    'Review debt covenants',
    'Check refinancing risk',
    'Assess interest coverage'
  ],
  'margin_compression': [
    'Investigate cause of compression',
    'Review competitive dynamics',
    'Check management guidance'
  ],

  // Default
  'default': [
    'Review the signal in context',
    'Check recent company news',
    'Evaluate against your investment thesis'
  ]
};

class ActionabilityScorer {
  constructor() {
    this.baseScores = BASE_ACTIONABILITY_SCORES;
    this.actionSuggestions = ACTION_SUGGESTIONS;
  }

  /**
   * Calculate actionability score for an alert
   */
  calculate(alert, userContext = {}) {
    // Get base score from definition or lookup
    let score = getActionabilityBase(alert.alert_code) ||
                this.baseScores[alert.alert_code] ||
                0.5;

    // Apply contextual adjustments

    // Boost if in portfolio (you own it)
    if (userContext.portfolioRelevance && userContext.portfolioRelevance > 1.0) {
      score += 0.1;
    }

    // Boost if on watchlist (you're watching it)
    if (alert.data?.isWatchlist || userContext.isWatchlist) {
      score += 0.1;
    }

    // Boost if part of a cluster (multiple signals)
    if (alert.cluster_id) {
      score += 0.1;
    }

    // Boost for high priority
    if (alert.priority >= 5) {
      score += 0.05;
    }

    // Reduce if not idiosyncratic (market-wide move)
    if (alert.data?.isIdiosyncratic === false) {
      score -= 0.2;
    }

    // Reduce for expired or old alerts
    if (alert.triggered_at) {
      const hoursOld = (Date.now() - new Date(alert.triggered_at).getTime()) / (1000 * 60 * 60);
      if (hoursOld > 72) {
        score -= 0.1;
      }
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get action suggestions for an alert
   */
  getSuggestions(alertCode) {
    return this.actionSuggestions[alertCode] ||
           this.actionSuggestions['default'];
  }

  /**
   * Categorize actionability score
   */
  categorize(score) {
    if (score >= 0.7) return { level: 'high', label: 'Action Recommended' };
    if (score >= 0.4) return { level: 'medium', label: 'Worth Investigating' };
    return { level: 'low', label: 'Informational' };
  }

  /**
   * Enrich an alert with actionability data
   */
  enrich(alert, userContext = {}) {
    const score = this.calculate(alert, userContext);
    const category = this.categorize(score);
    const suggestions = this.getSuggestions(alert.alert_code);

    return {
      ...alert,
      actionability_score: score,
      actionability_level: category.level,
      actionability_label: category.label,
      action_suggestions: suggestions,
      data: {
        ...alert.data,
        actionability: {
          score,
          level: category.level,
          suggestions
        }
      }
    };
  }

  /**
   * Filter alerts by actionability level
   */
  filterByActionability(alerts, minLevel = 'medium') {
    const thresholds = { high: 0.7, medium: 0.4, low: 0 };
    const minScore = thresholds[minLevel] || 0;

    return alerts.filter(alert => {
      const score = alert.actionability_score || this.calculate(alert);
      return score >= minScore;
    });
  }

  /**
   * Sort alerts by actionability (highest first)
   */
  sortByActionability(alerts) {
    return [...alerts].sort((a, b) => {
      const scoreA = a.actionability_score || this.calculate(a);
      const scoreB = b.actionability_score || this.calculate(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Get user context for actionability calculation
   */
  async getUserContext(userId = 'default', companyId = null) {
    const context = {
      portfolioRelevance: 1.0,
      isWatchlist: false,
      positionSize: null
    };

    if (!companyId) return context;

    try {
      const database = await getDatabaseAsync();

      // Check if company is in watchlist
      const watchlistResult = await database.query(`
        SELECT 1 FROM watchlist
        WHERE company_id = $1 AND (user_id = $2 OR user_id IS NULL)
        LIMIT 1
      `, [companyId, userId]);

      context.isWatchlist = watchlistResult.rows.length > 0;

      // Check portfolio position
      const positionResult = await database.query(`
        SELECT
          pp.shares * pp.current_price as value,
          p.current_value as portfolio_value
        FROM portfolio_positions pp
        JOIN portfolios p ON pp.portfolio_id = p.id
        WHERE pp.company_id = $1 AND p.user_id = $2
        LIMIT 1
      `, [companyId, userId]);

      if (positionResult.rows.length > 0) {
        const position = positionResult.rows[0];
        if (position.portfolio_value > 0) {
          const weight = position.value / position.portfolio_value;
          context.positionSize = weight;

          // Calculate portfolio relevance multiplier
          if (weight >= 0.10) context.portfolioRelevance = 2.0;
          else if (weight >= 0.05) context.portfolioRelevance = 1.5;
          else if (weight >= 0.02) context.portfolioRelevance = 1.2;
          else context.portfolioRelevance = 1.0;
        }
      }

    } catch (err) {
      console.warn('[ActionabilityScorer] Error fetching user context:', err.message);
    }

    return context;
  }
}

module.exports = {
  ActionabilityScorer,
  BASE_ACTIONABILITY_SCORES,
  ACTION_SUGGESTIONS
};
