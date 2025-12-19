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
      signal: 'buy',
      priority: 4,
      getMessage: (data) => `Trading at ${data.discount?.toFixed(0)}% discount to intrinsic value ($${data.intrinsic?.toFixed(2)})`
    },

    dcf_undervalued_50: {
      name: 'DCF Deeply Undervalued',
      description: 'Price dropped below 50% of intrinsic value',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `Trading at ${data.discount?.toFixed(0)}% discount - significant margin of safety`
    },

    pe_below_15: {
      name: 'P/E Below 15 (Graham)',
      description: 'P/E ratio dropped below Graham threshold',
      signal: 'buy',
      priority: 3,
      getMessage: (data) => `P/E ratio at ${data.pe?.toFixed(1)} (below Graham threshold of 15)`
    },

    pe_below_10: {
      name: 'P/E Below 10',
      description: 'P/E ratio very low',
      signal: 'strong_buy',
      priority: 4,
      getMessage: (data) => `P/E ratio at ${data.pe?.toFixed(1)} - potentially deep value`
    },

    pb_below_1: {
      name: 'P/B Below 1',
      description: 'Trading below book value',
      signal: 'buy',
      priority: 4,
      getMessage: (data) => `Price/Book at ${data.pb?.toFixed(2)} - trading below liquidation value`
    },

    fcf_yield_above_10: {
      name: 'FCF Yield Above 10%',
      description: 'Free cash flow yield exceeds 10%',
      signal: 'buy',
      priority: 4,
      getMessage: (data) => `FCF Yield at ${data.fcfYield?.toFixed(1)}% - strong cash generation vs price`
    },

    fcf_yield_above_15: {
      name: 'FCF Yield Above 15%',
      description: 'Exceptional free cash flow yield',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `FCF Yield at ${data.fcfYield?.toFixed(1)}% - exceptional value`
    },

    pe_below_5yr_avg: {
      name: 'P/E Below 5-Year Average',
      description: 'Valuation compressed vs historical',
      signal: 'watch',
      priority: 3,
      getMessage: (data) => `P/E at ${data.pe?.toFixed(1)} vs 5yr avg of ${data.avgPe?.toFixed(1)}`
    },

    entered_screener: {
      name: 'Entered Value Screener',
      description: 'Company newly qualifies for a value screen',
      signal: 'buy',
      priority: 4,
      getMessage: (data) => `Now qualifies for "${data.screenerName}" screen`
    },

    exited_screener: {
      name: 'Exited Value Screener',
      description: 'Company no longer qualifies for a screen',
      signal: 'info',
      priority: 2,
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
      getMessage: (data) => `ROIC improved to ${data.roic?.toFixed(1)}% (quality threshold)`
    },

    roic_crossed_20: {
      name: 'ROIC Crossed 20%',
      description: 'Exceptional return on invested capital',
      signal: 'watch',
      priority: 4,
      getMessage: (data) => `ROIC at ${data.roic?.toFixed(1)}% - exceptional capital efficiency`
    },

    roic_deteriorated: {
      name: 'ROIC Deterioration',
      description: 'ROIC dropped significantly',
      signal: 'warning',
      priority: 3,
      getMessage: (data) => `ROIC dropped from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    margin_expansion: {
      name: 'Margin Expansion',
      description: 'Operating margin improved significantly',
      signal: 'watch',
      priority: 2,
      getMessage: (data) => `Operating margin expanded from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    margin_compression: {
      name: 'Margin Compression',
      description: 'Operating margin declined significantly',
      signal: 'warning',
      priority: 3,
      getMessage: (data) => `Operating margin compressed from ${data.previous?.toFixed(1)}% to ${data.current?.toFixed(1)}%`
    },

    debt_improved: {
      name: 'Debt Level Improved',
      description: 'Debt/Equity dropped below quality threshold',
      signal: 'watch',
      priority: 2,
      getMessage: (data) => `Debt/Equity improved to ${data.debtEquity?.toFixed(2)} (below 0.5)`
    },

    debt_warning: {
      name: 'Debt Level Warning',
      description: 'Debt/Equity increased significantly',
      signal: 'warning',
      priority: 3,
      getMessage: (data) => `Debt/Equity increased to ${data.current?.toFixed(2)} from ${data.previous?.toFixed(2)}`
    },

    fcf_turned_positive: {
      name: 'FCF Turned Positive',
      description: 'Free cash flow became positive',
      signal: 'watch',
      priority: 3,
      getMessage: (data) => `FCF turned positive at $${(data.fcf / 1e6).toFixed(0)}M`
    },

    fcf_turned_negative: {
      name: 'FCF Warning',
      description: 'Free cash flow turned negative',
      signal: 'warning',
      priority: 4,
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
      getMessage: (data) => `Trading at $${data.price?.toFixed(2)}, within 10% of 52w low ($${data.low52w?.toFixed(2)})`
    },

    new_52w_low: {
      name: 'New 52-Week Low',
      description: 'Price hit new 52-week low',
      signal: 'watch',
      priority: 4,
      getMessage: (data) => `Hit new 52-week low at $${data.price?.toFixed(2)}`
    },

    rsi_oversold: {
      name: 'RSI Oversold',
      description: 'RSI dropped below 30',
      signal: 'watch',
      priority: 2,
      getMessage: (data) => `RSI at ${data.rsi?.toFixed(0)} - technically oversold`
    },

    rsi_deeply_oversold: {
      name: 'RSI Deeply Oversold',
      description: 'RSI dropped below 20',
      signal: 'watch',
      priority: 3,
      getMessage: (data) => `RSI at ${data.rsi?.toFixed(0)} - deeply oversold`
    },

    crossed_below_sma200: {
      name: 'Below 200 SMA',
      description: 'Price crossed below 200-day moving average',
      signal: 'watch',
      priority: 2,
      getMessage: (data) => `Price ($${data.price?.toFixed(2)}) crossed below 200 SMA ($${data.sma200?.toFixed(2)})`
    },

    significant_drop_5d: {
      name: 'Significant Price Drop (5 days)',
      description: 'Price dropped more than 15% in 5 days',
      signal: 'watch',
      priority: 3,
      getMessage: (data) => `Down ${Math.abs(data.change)?.toFixed(1)}% in 5 days - potential opportunity`
    },

    significant_drop_1m: {
      name: 'Significant Price Drop (1 month)',
      description: 'Price dropped more than 25% in 1 month',
      signal: 'watch',
      priority: 3,
      getMessage: (data) => `Down ${Math.abs(data.change)?.toFixed(1)}% in 1 month - potential opportunity`
    }
  },

  // ==========================================
  // FILING/INSIDER ALERTS
  // ==========================================

  filing: {
    insider_buying_cluster: {
      name: 'Insider Buying Cluster',
      description: 'Multiple insiders buying recently',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `${data.count} insiders bought in last ${data.days} days - strong signal`
    },

    insider_buying: {
      name: 'Insider Buying',
      description: 'Insider purchased shares',
      signal: 'buy',
      priority: 3,
      getMessage: (data) => `${data.insiderName} (${data.title}) bought $${(data.value / 1000).toFixed(0)}K in shares`
    },

    insider_selling_cluster: {
      name: 'Insider Selling Cluster',
      description: 'Multiple insiders selling recently',
      signal: 'warning',
      priority: 4,
      getMessage: (data) => `${data.count} insiders sold in last ${data.days} days - caution`
    },

    large_insider_buy: {
      name: 'Large Insider Purchase',
      description: 'Significant insider purchase detected',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `${data.insiderName} bought $${(data.value / 1e6).toFixed(1)}M - significant conviction`
    }
  },

  // ==========================================
  // COMPOSITE ALERTS (Highest Value)
  // ==========================================

  composite: {
    quality_value_convergence: {
      name: 'Quality + Value Convergence',
      description: 'High-quality company trading at value prices',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `Quality company (ROIC ${data.roic?.toFixed(0)}%) at ${data.discount?.toFixed(0)}% discount with low debt`
    },

    fallen_angel: {
      name: 'Fallen Angel',
      description: 'Former quality company now trading cheap',
      signal: 'buy',
      priority: 4,
      getMessage: (data) => `Quality company down ${data.dropPct?.toFixed(0)}% from highs - fundamentals intact`
    },

    triple_buy_signal: {
      name: 'Triple Buy Signal',
      description: 'Multiple valuation metrics align',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `${data.count} buy signals: ${data.signals?.join(', ')}`
    },

    accumulation_zone: {
      name: 'Accumulation Zone',
      description: 'Oversold with insider buying',
      signal: 'strong_buy',
      priority: 5,
      getMessage: (data) => `RSI oversold + insider buying + quality fundamentals`
    },

    red_flag_cluster: {
      name: 'Red Flag Cluster',
      description: 'Multiple warning signals detected',
      signal: 'warning',
      priority: 5,
      getMessage: (data) => `${data.count} warnings: ${data.warnings?.join(', ')}`
    }
  }
};

// Signal type colors and icons for UI
const SIGNAL_CONFIG = {
  strong_buy: {
    color: '#10B981',
    bgColor: '#D1FAE5',
    icon: '🟢',
    label: 'Strong Buy'
  },
  buy: {
    color: '#059669',
    bgColor: '#ECFDF5',
    icon: '🔵',
    label: 'Buy'
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
  info: {
    color: '#6B7280',
    bgColor: '#F3F4F6',
    icon: 'ℹ️',
    label: 'Info'
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

module.exports = {
  ALERT_DEFINITIONS,
  SIGNAL_CONFIG,
  ALERT_TYPE_CONFIG
};
