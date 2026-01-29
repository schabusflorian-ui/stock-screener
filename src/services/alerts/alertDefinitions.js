// src/services/alerts/alertDefinitions.js
// Alert type definitions for the signal system

const ALERT_DEFINITIONS = {

  // ==========================================
  // VALUATION ALERTS (Primary Focus)
  // ==========================================

  valuation: {
    dcf_undervalued_25: {
      name: 'DCF Undervalued 25%',
      description: 'Price dropped below 75% of intrinsic value',
      signal: 'bullish',
      priority: 4,
      cooldownHours: 168,      // 7 days - slow-moving signal
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.7,  // Clear action: consider buying
      getMessage: (data) => `Trading at ${data.discount?.toFixed(0)}% discount to intrinsic value ($${data.intrinsic?.toFixed(2)})`
    },

    dcf_undervalued_50: {
      name: 'DCF Deeply Undervalued',
      description: 'Price dropped below 50% of intrinsic value',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 336,      // 14 days - rare signal
      expiryHours: 672,        // 28 days
      actionabilityBase: 0.9,  // Strong action signal
      getMessage: (data) => `Trading at ${data.discount?.toFixed(0)}% discount - significant margin of safety`
    },

    pe_below_15: {
      name: 'P/E Below 15 (Graham)',
      description: 'P/E ratio dropped below Graham threshold',
      signal: 'bullish',
      priority: 3,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.5,  // Worth investigating
      getMessage: (data) => `P/E ratio at ${data.pe?.toFixed(1)} (below Graham threshold of 15)`
    },

    pe_below_10: {
      name: 'P/E Below 10',
      description: 'P/E ratio very low',
      signal: 'strong_bullish',
      priority: 4,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.7,
      getMessage: (data) => `P/E ratio at ${data.pe?.toFixed(1)} - potentially deep value`
    },

    pb_below_1: {
      name: 'P/B Below 1',
      description: 'Trading below book value',
      signal: 'bullish',
      priority: 4,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.6,
      getMessage: (data) => `Price/Book at ${data.pb?.toFixed(2)} - trading below liquidation value`
    },

    fcf_yield_above_10: {
      name: 'FCF Yield Above 10%',
      description: 'Free cash flow yield exceeds 10%',
      signal: 'bullish',
      priority: 4,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.6,
      getMessage: (data) => `FCF Yield at ${data.fcfYield?.toFixed(1)}% - strong cash generation vs price`
    },

    fcf_yield_above_15: {
      name: 'FCF Yield Above 15%',
      description: 'Exceptional free cash flow yield',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 336,      // 14 days
      expiryHours: 672,        // 28 days
      actionabilityBase: 0.8,
      getMessage: (data) => `FCF Yield at ${data.fcfYield?.toFixed(1)}% - notable valuation metric`
    },

    pe_below_5yr_avg: {
      name: 'P/E Below 5-Year Average',
      description: 'Valuation compressed vs historical',
      signal: 'watch',
      priority: 3,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.4,  // Informational
      getMessage: (data) => `P/E at ${data.pe?.toFixed(1)} vs 5yr avg of ${data.avgPe?.toFixed(1)}`
    },

    entered_screener: {
      name: 'Entered Value Screener',
      description: 'Company newly qualifies for a value screen',
      signal: 'bullish',
      priority: 4,
      cooldownHours: 168,      // 7 days per screener
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.6,
      getMessage: (data) => `Now qualifies for "${data.screenerName}" screen`
    },

    exited_screener: {
      name: 'Exited Value Screener',
      description: 'Company no longer qualifies for a screen',
      signal: 'info',
      priority: 2,
      cooldownHours: 168,      // 7 days
      expiryHours: 72,         // 3 days - less important
      actionabilityBase: 0.2,  // Low actionability
      getMessage: (data) => `No longer qualifies for "${data.screenerName}" screen`
    }
  },

  // ==========================================
  // FUNDAMENTAL ALERTS
  // ==========================================

  fundamental: {
    roic_crossed_15: {
      name: 'ROIC Crossed 15%',
      description: 'Return on invested capital exceeded quality threshold',
      signal: 'watch',
      priority: 3,
      cooldownHours: 720,      // 30 days - quarterly data
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.4,  // Informational
      getMessage: (data) => `ROIC improved to ${data.roic?.toFixed(1)}% (quality threshold)`
    },

    roic_crossed_20: {
      name: 'ROIC Crossed 20%',
      description: 'Exceptional return on invested capital',
      signal: 'watch',
      priority: 4,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.5,
      getMessage: (data) => `ROIC at ${data.roic?.toFixed(1)}% - exceptional capital efficiency`
    },

    roic_deteriorated: {
      name: 'ROIC Deterioration',
      description: 'ROIC dropped significantly',
      signal: 'warning',
      priority: 3,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.5,  // Review position
      getMessage: (data) => `ROIC dropped from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    margin_expansion: {
      name: 'Margin Expansion',
      description: 'Operating margin improved significantly',
      signal: 'watch',
      priority: 2,
      cooldownHours: 720,      // 30 days - quarterly
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.3,  // Informational
      getMessage: (data) => `Operating margin expanded from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    margin_compression: {
      name: 'Margin Compression',
      description: 'Operating margin declined significantly',
      signal: 'warning',
      priority: 3,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.5,  // Review position
      getMessage: (data) => `Operating margin compressed from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    debt_improved: {
      name: 'Debt Level Improved',
      description: 'Debt/Equity dropped below quality threshold',
      signal: 'watch',
      priority: 2,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.3,  // Informational
      getMessage: (data) => `Debt/Equity improved to ${data.debtEquity?.toFixed(2)} (below 0.5)`
    },

    debt_warning: {
      name: 'Debt Level Warning',
      description: 'Debt/Equity increased significantly',
      signal: 'warning',
      priority: 3,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.5,  // Review position
      getMessage: (data) => `Debt/Equity increased to ${data.current?.toFixed(2)} from ${data.previous?.toFixed(2)}`
    },

    fcf_turned_positive: {
      name: 'FCF Turned Positive',
      description: 'Free cash flow became positive',
      signal: 'watch',
      priority: 3,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.5,
      getMessage: (data) => `FCF turned positive at $${(data.fcf / 1e6).toFixed(0)}M`
    },

    fcf_turned_negative: {
      name: 'FCF Warning',
      description: 'Free cash flow turned negative',
      signal: 'warning',
      priority: 4,
      cooldownHours: 720,      // 30 days
      expiryHours: 720,        // 30 days
      actionabilityBase: 0.6,  // Requires attention
      getMessage: (data) => `FCF turned negative - cash burn of $${Math.abs(data.fcf / 1e6).toFixed(0)}M`
    }
  },

  // ==========================================
  // PRICE ALERTS (Buy-Focused)
  // ==========================================

  price: {
    near_52w_low: {
      name: 'Near 52-Week Low',
      description: 'Price within 10% of 52-week low',
      signal: 'watch',
      priority: 3,
      cooldownHours: 168,      // 7 days - don't alert every day it's low
      expiryHours: 72,         // 3 days - price can change fast
      actionabilityBase: 0.4,  // Worth watching but not urgent
      getMessage: (data) => `Trading at $${data.price?.toFixed(2)}, within 10% of 52w low ($${data.low52w?.toFixed(2)})`
    },

    new_52w_low: {
      name: 'New 52-Week Low',
      description: 'Price hit new 52-week low',
      signal: 'watch',
      priority: 4,
      cooldownHours: 72,       // 3 days - important to know
      expiryHours: 48,         // 2 days
      actionabilityBase: 0.6,  // May want to investigate
      getMessage: (data) => `Hit new 52-week low at $${data.price?.toFixed(2)}`
    },

    rsi_oversold: {
      name: 'RSI Oversold',
      description: 'RSI dropped below 30',
      signal: 'watch',
      priority: 2,
      cooldownHours: 48,       // 2 days - technical signal
      expiryHours: 24,         // 1 day - very short-term
      actionabilityBase: 0.4,  // Technical indicator only
      getMessage: (data) => `RSI at ${data.rsi?.toFixed(0)} - technically oversold`
    },

    rsi_deeply_oversold: {
      name: 'RSI Deeply Oversold',
      description: 'RSI dropped below 20',
      signal: 'watch',
      priority: 3,
      cooldownHours: 48,       // 2 days
      expiryHours: 24,         // 1 day
      actionabilityBase: 0.5,  // More significant
      getMessage: (data) => `RSI at ${data.rsi?.toFixed(0)} - deeply oversold`
    },

    crossed_below_sma200: {
      name: 'Below 200 SMA',
      description: 'Price crossed below 200-day moving average',
      signal: 'watch',
      priority: 2,
      cooldownHours: 168,      // 7 days - trend change signal
      expiryHours: 72,         // 3 days
      actionabilityBase: 0.3,  // Trend indicator
      getMessage: (data) => `Price ($${data.price?.toFixed(2)}) crossed below 200 SMA ($${data.sma200?.toFixed(2)})`
    },

    significant_drop_5d: {
      name: 'Significant Price Drop (5 days)',
      description: 'Price dropped more than 15% in 5 days',
      signal: 'watch',
      priority: 3,
      cooldownHours: 120,      // 5 days - matches the signal period
      expiryHours: 48,         // 2 days
      actionabilityBase: 0.5,  // Worth investigating
      getMessage: (data) => `Down ${Math.abs(data.change)?.toFixed(1)}% in 5 days - notable price movement`
    },

    significant_drop_1m: {
      name: 'Significant Price Drop (1 month)',
      description: 'Price dropped more than 25% in 1 month',
      signal: 'watch',
      priority: 3,
      cooldownHours: 336,      // 14 days
      expiryHours: 72,         // 3 days
      actionabilityBase: 0.5,  // Worth investigating
      getMessage: (data) => `Down ${Math.abs(data.change)?.toFixed(1)}% in 1 month - notable price movement`
    }
  },

  // ==========================================
  // FILING/INSIDER ALERTS
  // ==========================================

  filing: {
    insider_buying_cluster: {
      name: 'Insider Buying Cluster',
      description: 'Multiple insiders buying recently',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 168,      // 7 days - important signal
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.9,  // Strong action signal - investigate
      getMessage: (data) => `${data.count} insiders bought in last ${data.days} days - significant insider activity`
    },

    insider_buying: {
      name: 'Insider Buying',
      description: 'Insider purchased shares',
      signal: 'bullish',
      priority: 3,
      cooldownHours: 24,       // 1 day - keep responsive
      expiryHours: 72,         // 3 days
      actionabilityBase: 0.7,  // Worth investigating
      getMessage: (data) => `${data.insiderName} (${data.title}) bought $${(data.value / 1000).toFixed(0)}K in shares`
    },

    insider_selling_cluster: {
      name: 'Insider Selling Cluster',
      description: 'Multiple insiders selling recently',
      signal: 'warning',
      priority: 4,
      cooldownHours: 168,      // 7 days
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.7,  // Review position
      getMessage: (data) => `${data.count} insiders sold in last ${data.days} days - notable insider activity`
    },

    large_insider_buy: {
      name: 'Large Insider Purchase',
      description: 'Significant insider purchase detected',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 168,      // 7 days - rare event
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.9,  // Strong signal
      getMessage: (data) => `${data.insiderName} bought $${(data.value / 1e6).toFixed(1)}M - notable insider activity`
    }
  },

  // ==========================================
  // COMPOSITE ALERTS (Highest Value)
  // ==========================================

  composite: {
    quality_value_convergence: {
      name: 'Quality + Value Convergence',
      description: 'High-quality company trading at value prices',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 336,      // 14 days - rare, high-value signal
      expiryHours: 672,        // 28 days
      actionabilityBase: 0.9,  // Strong action: consider buying
      getMessage: (data) => `Quality metrics (ROIC ${data.roic?.toFixed(0)}%) combined with ${data.discount?.toFixed(0)}% valuation discount and low debt`
    },

    fallen_angel: {
      name: 'Fallen Angel',
      description: 'Former quality company now trading cheap',
      signal: 'bullish',
      priority: 4,
      cooldownHours: 336,      // 14 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.8,  // Worth investigating
      getMessage: (data) => `Quality company down ${data.dropPct?.toFixed(0)}% from highs - fundamentals metrics stable`
    },

    triple_bullish_signal: {
      name: 'Triple Bullish Signal',
      description: 'Multiple valuation metrics align',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 168,      // 7 days
      expiryHours: 336,        // 14 days
      actionabilityBase: 0.85, // Strong signal
      getMessage: (data) => `${data.count} bullish indicators: ${data.signals?.join(', ')}`
    },

    accumulation_zone: {
      name: 'Accumulation Zone',
      description: 'Oversold with insider buying',
      signal: 'strong_bullish',
      priority: 5,
      cooldownHours: 168,      // 7 days
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.9,  // Strong convergence signal
      getMessage: (data) => 'RSI oversold + insider buying + quality fundamentals detected'
    },

    red_flag_cluster: {
      name: 'Red Flag Cluster',
      description: 'Multiple warning signals detected',
      signal: 'warning',
      priority: 5,
      cooldownHours: 168,      // 7 days
      expiryHours: 168,        // 7 days
      actionabilityBase: 0.8,  // Requires attention
      getMessage: (data) => `${data.count} warnings: ${data.warnings?.join(', ')}`
    }
  }
};

// Signal type colors and icons for UI
// Note: Using "bullish/bearish" terminology instead of "buy/sell" for regulatory compliance
const SIGNAL_CONFIG = {
  strong_bullish: {
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: '🟢',
    label: 'Strong Bullish'
  },
  bullish: {
    color: '#059669',
    bgColor: '#ECFDF5',
    icon: '🔵',
    label: 'Bullish'
  },
  watch: {
    color: '#6366F1',
    bgColor: '#E0E7FF',
    icon: '👁️',
    label: 'Watch'
  },
  warning: {
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    icon: '⚠️',
    label: 'Warning'
  },
  bearish: {
    color: '#EF4444',
    bgColor: '#FEE2E2',
    icon: '🔴',
    label: 'Bearish'
  },
  strong_bearish: {
    color: '#DC2626',
    bgColor: '#FEE2E2',
    icon: '🔴',
    label: 'Strong Bearish'
  },
  info: {
    color: '#6B7280',
    bgColor: '#F3F4F6',
    icon: 'ℹ️',
    label: 'Info'
  },
  // Legacy mappings for backwards compatibility
  strong_buy: {
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: '🟢',
    label: 'Strong Bullish'
  },
  buy: {
    color: '#059669',
    bgColor: '#ECFDF5',
    icon: '🔵',
    label: 'Bullish'
  },
  sell: {
    color: '#EF4444',
    bgColor: '#FEE2E2',
    icon: '🔴',
    label: 'Bearish'
  },
  strong_sell: {
    color: '#DC2626',
    bgColor: '#FEE2E2',
    icon: '🔴',
    label: 'Strong Bearish'
  }
};

// Alert type colors
const ALERT_TYPE_CONFIG = {
  valuation: { color: '#10B981', label: 'Valuation' },
  fundamental: { color: '#6366F1', label: 'Fundamental' },
  price: { color: '#3B82F6', label: 'Price' },
  filing: { color: '#8B5CF6', label: 'Filing' },
  composite: { color: '#EC4899', label: 'Composite' },
  custom: { color: '#6B7280', label: 'Custom' }
};

// Helper to get alert definition by code
function getAlertDefinition(alertCode) {
  for (const [type, alerts] of Object.entries(ALERT_DEFINITIONS)) {
    if (alerts[alertCode]) {
      return { type, ...alerts[alertCode] };
    }
  }
  return null;
}

// Get cooldown hours for an alert code (default: 24 hours)
function getCooldownHours(alertCode) {
  const def = getAlertDefinition(alertCode);
  return def?.cooldownHours || 24;
}

// Get expiry hours for an alert code (default: 72 hours)
function getExpiryHours(alertCode) {
  const def = getAlertDefinition(alertCode);
  return def?.expiryHours || 72;
}

// Get actionability base score for an alert code (default: 0.5)
function getActionabilityBase(alertCode) {
  const def = getAlertDefinition(alertCode);
  return def?.actionabilityBase || 0.5;
}

// Default cooldown hours by alert type category
const DEFAULT_COOLDOWNS = {
  valuation: 168,      // 7 days
  fundamental: 720,    // 30 days (quarterly)
  price: 48,           // 2 days
  filing: 24,          // 1 day (keep responsive)
  composite: 168       // 7 days
};

// Maximum alerts per symbol per week (prevents flooding)
const MAX_ALERTS_PER_SYMBOL_PER_WEEK = 5;

module.exports = {
  ALERT_DEFINITIONS,
  SIGNAL_CONFIG,
  ALERT_TYPE_CONFIG,
  getAlertDefinition,
  getCooldownHours,
  getExpiryHours,
  getActionabilityBase,
  DEFAULT_COOLDOWNS,
  MAX_ALERTS_PER_SYMBOL_PER_WEEK
};
