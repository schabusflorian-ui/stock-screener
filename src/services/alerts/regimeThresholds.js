// src/services/alerts/regimeThresholds.js
// Regime-aware threshold adjustments for smart alert filtering

const { getDatabaseAsync } = require('../../database');

/**
 * Market Regimes:
 * - BULL: Strong uptrend, low volatility
 * - BEAR: Downtrend, elevated uncertainty
 * - SIDEWAYS: Range-bound, mixed signals
 * - HIGH_VOL: High volatility regardless of direction
 * - CRISIS: Extreme fear/selling, VIX > 30
 */

const REGIMES = {
  BULL: 'BULL',
  BEAR: 'BEAR',
  SIDEWAYS: 'SIDEWAYS',
  HIGH_VOL: 'HIGH_VOL',
  CRISIS: 'CRISIS'
};

/**
 * Threshold adjustments by regime
 * - threshold: Override the default threshold (e.g., RSI 30 -> 20 in crisis)
 * - priorityMod: Adjust priority by this amount (-1 to reduce, +1 to boost)
 * - suppress: If true, suppress this alert type entirely in this regime
 */
const REGIME_THRESHOLD_MULTIPLIERS = {
  [REGIMES.CRISIS]: {
    // In crisis, raise thresholds (reduce sensitivity) - everything is oversold
    rsi_oversold: { threshold: 20, priorityMod: -1 },
    rsi_deeply_oversold: { threshold: 15, priorityMod: 0 },
    significant_drop_5d: { threshold: 25, priorityMod: -1 },
    significant_drop_1m: { threshold: 40, priorityMod: -1 },
    near_52w_low: { priorityMod: -1 },
    new_52w_low: { priorityMod: -1 },
    crossed_below_sma200: { priorityMod: -2 },

    // But insider buying in crisis is MORE significant (contrarian)
    insider_buying: { priorityMod: +1 },
    insider_buying_cluster: { priorityMod: +1 },
    large_insider_buy: { priorityMod: +1 },

    // Valuation signals less urgent in crisis (everything is "cheap")
    dcf_undervalued_25: { priorityMod: -1 },
    pe_below_15: { priorityMod: -1 },
    pb_below_1: { priorityMod: -1 }
  },

  [REGIMES.HIGH_VOL]: {
    // High volatility - raise technical thresholds
    rsi_oversold: { threshold: 25, priorityMod: 0 },
    significant_drop_5d: { threshold: 20, priorityMod: 0 },
    crossed_below_sma200: { priorityMod: -1 },

    // Insider buying still important
    insider_buying_cluster: { priorityMod: +1 }
  },

  [REGIMES.BEAR]: {
    // In bear market, price alerts less urgent (downtrend is expected)
    rsi_oversold: { priorityMod: -1 },
    significant_drop_5d: { priorityMod: -1 },
    significant_drop_1m: { priorityMod: -1 },
    near_52w_low: { priorityMod: -1 },
    new_52w_low: { priorityMod: 0 }, // Still somewhat important

    // Valuation signals less actionable in bear
    dcf_undervalued_25: { priorityMod: -1 },
    dcf_undervalued_50: { priorityMod: 0 }, // Deep value still notable
    pe_below_15: { priorityMod: -1 },

    // Warnings more important in bear
    red_flag_cluster: { priorityMod: +1 },
    fcf_turned_negative: { priorityMod: +1 },
    debt_warning: { priorityMod: +1 }
  },

  [REGIMES.BULL]: {
    // In bull market, value alerts more significant (rare)
    dcf_undervalued_25: { threshold: 20, priorityMod: +1 },
    dcf_undervalued_50: { priorityMod: +1 },
    pe_below_15: { threshold: 12, priorityMod: +1 },
    pe_below_10: { priorityMod: +1 },

    // Technical oversold signals more actionable (potential buying opportunity)
    rsi_oversold: { priorityMod: +1 },
    rsi_deeply_oversold: { priorityMod: +1 },

    // Price drops are more notable in bull (idiosyncratic)
    significant_drop_5d: { priorityMod: +1 },
    significant_drop_1m: { priorityMod: +1 }
  },

  [REGIMES.SIDEWAYS]: {
    // Default thresholds apply
  }
};

/**
 * Get the adjusted threshold for an alert code in a given regime
 */
function getAdjustedThreshold(alertCode, defaultThreshold, regime) {
  const regimeAdjustments = REGIME_THRESHOLD_MULTIPLIERS[regime] || {};
  const adjustment = regimeAdjustments[alertCode];

  if (adjustment?.threshold !== undefined) {
    return adjustment.threshold;
  }
  return defaultThreshold;
}

/**
 * Get the adjusted priority for an alert in a given regime
 */
function getAdjustedPriority(alertCode, basePriority, regime) {
  const regimeAdjustments = REGIME_THRESHOLD_MULTIPLIERS[regime] || {};
  const adjustment = regimeAdjustments[alertCode];

  if (adjustment?.priorityMod !== undefined) {
    return Math.max(1, Math.min(5, basePriority + adjustment.priorityMod));
  }
  return basePriority;
}

/**
 * Check if an alert should be suppressed in a given regime
 */
function shouldSuppress(alertCode, regime) {
  const regimeAdjustments = REGIME_THRESHOLD_MULTIPLIERS[regime] || {};
  const adjustment = regimeAdjustments[alertCode];

  return adjustment?.suppress === true;
}

/**
 * Get regime context label for an alert description
 */
function getRegimeContextLabel(regime, additionalContext = {}) {
  const labels = [];

  switch (regime) {
    case REGIMES.CRISIS:
      labels.push('During market stress');
      break;
    case REGIMES.HIGH_VOL:
      labels.push('In high volatility');
      break;
    case REGIMES.BEAR:
      labels.push('In bearish market');
      break;
    case REGIMES.BULL:
      labels.push('In bullish market');
      break;
    case REGIMES.SIDEWAYS:
      labels.push('In sideways market');
      break;
  }

  if (additionalContext.vix && additionalContext.vix > 25) {
    labels.push(`VIX: ${additionalContext.vix.toFixed(0)}`);
  }

  if (additionalContext.isIdiosyncratic) {
    labels.push('Idiosyncratic move');
  } else if (additionalContext.isIdiosyncratic === false) {
    labels.push('With market');
  }

  return labels.length > 0 ? `[${labels.join(', ')}]` : '';
}

/**
 * Check if a price move is idiosyncratic (company-specific) vs market-wide
 */
function isIdiosyncraticMove(companyChange, marketChange, threshold = 1.5) {
  // If company dropped significantly more than market, it's idiosyncratic
  // Example: Company -15%, Market -5% -> idiosyncratic
  // Example: Company -10%, Market -8% -> with market

  if (marketChange >= 0) {
    // Market is flat or up, any significant company drop is idiosyncratic
    return companyChange < -5;
  }

  // Both are negative - compare magnitude
  return companyChange < marketChange * threshold;
}

/**
 * Apply regime adjustments to an alert
 */
function applyRegimeAdjustments(alert, regime, context = {}) {
  const adjustedAlert = { ...alert };

  // Check if alert should be suppressed
  if (shouldSuppress(alert.alert_code, regime)) {
    return null;
  }

  // Adjust priority
  adjustedAlert.priority = getAdjustedPriority(
    alert.alert_code,
    alert.priority,
    regime
  );

  // Store adjusted priority separately
  adjustedAlert.adjusted_priority = adjustedAlert.priority;
  adjustedAlert.original_priority = alert.priority;

  // Add regime context to data
  adjustedAlert.data = {
    ...alert.data,
    marketRegime: regime,
    regimeAdjustment: adjustedAlert.priority - alert.priority
  };

  // Add context label to description
  const contextLabel = getRegimeContextLabel(regime, context);
  if (contextLabel) {
    adjustedAlert.description = `${alert.description} ${contextLabel}`;
    adjustedAlert.data.marketContext = contextLabel;
  }

  return adjustedAlert;
}

/**
 * Get the current market regime from the database
 */
async function getCurrentRegime() {
  try {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM market_regime_history
      WHERE valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP
      ORDER BY detected_at DESC
      LIMIT 1
    `);

    const regime = result.rows[0];
    if (regime) {
      return {
        regime: regime.regime,
        score: regime.regime_score,
        vix: regime.vix,
        sp500Change1w: regime.sp500_change_1w,
        sp500Change1m: regime.sp500_change_1m,
        breadthRatio: regime.breadth_ratio,
        detectedAt: regime.detected_at
      };
    }
  } catch (err) {
    console.warn('[RegimeThresholds] Error fetching regime:', err.message);
  }

  // Default to sideways if no regime data
  return {
    regime: REGIMES.SIDEWAYS,
    score: 0.5,
    vix: null,
    detectedAt: null
  };
}

/**
 * Record a new regime detection
 */
async function recordRegime(regimeData) {
  const {
    regime,
    regimeScore = null,
    vix = null,
    sp500Change1w = null,
    sp500Change1m = null,
    breadthRatio = null
  } = regimeData;

  try {
    const database = await getDatabaseAsync();

    // Invalidate previous regime
    await database.query(`
      UPDATE market_regime_history
      SET valid_until = CURRENT_TIMESTAMP
      WHERE valid_until IS NULL
    `);

    // Insert new regime
    await database.query(`
      INSERT INTO market_regime_history (
        regime, regime_score, vix,
        sp500_change_1w, sp500_change_1m, breadth_ratio,
        detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [regime, regimeScore, vix, sp500Change1w, sp500Change1m, breadthRatio]);

    return true;
  } catch (err) {
    console.error('[RegimeThresholds] Error recording regime:', err.message);
    return false;
  }
}

module.exports = {
  REGIMES,
  REGIME_THRESHOLD_MULTIPLIERS,
  getAdjustedThreshold,
  getAdjustedPriority,
  shouldSuppress,
  getRegimeContextLabel,
  isIdiosyncraticMove,
  applyRegimeAdjustments,
  getCurrentRegime,
  recordRegime
};
