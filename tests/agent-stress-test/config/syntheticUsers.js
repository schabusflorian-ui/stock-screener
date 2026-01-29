/**
 * Synthetic User Profiles for AI Trading Agent Stress Testing
 *
 * 10 diverse user profiles covering different trading styles,
 * risk tolerances, and configuration combinations.
 */

const SYNTHETIC_USERS = {
  // ===== USER 1: QUANT TRADER =====
  quant_trader: {
    id: 'quant_trader',
    name: 'Marcus Chen',
    description: 'Quant Trader - Heavy technical, ML features, high frequency',
    portfolio: {
      name: 'Quant Alpha Portfolio',
      initialCash: 500000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Quant Alpha Agent',
      description: 'Factor-based systematic agent with ML enhancement',
      strategy_type: 'technical',
      // Signal weights
      technical_weight: 0.35,
      sentiment_weight: 0.10,
      insider_weight: 0.05,
      fundamental_weight: 0.10,
      alternative_weight: 0.10,
      valuation_weight: 0.05,
      thirteenf_weight: 0.05,
      earnings_weight: 0.10,
      value_quality_weight: 0.10,
      // Thresholds - aggressive
      min_confidence: 0.50,
      min_signal_score: 0.20,
      // Risk parameters - aggressive
      max_position_size: 0.15,
      max_sector_exposure: 0.40,
      min_cash_reserve: 0.05,
      max_drawdown: 0.25,
      max_correlation: 0.80,
      max_daily_trades: 20,
      // Feature flags - all ML enabled
      use_optimized_weights: 1,
      use_hmm_regime: 1,
      use_ml_combiner: 1,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 0,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 30,
      // Execution - semi-automated
      auto_execute: 1,
      execution_threshold: 0.75,
      require_confirmation: 0,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['high_frequency', 'regime_change', 'volatility_spike'],
    expectedBehavior: {
      tradesPerDay: { min: 3, max: 15 },
      signalFrequency: 'high',
      riskTolerance: 'aggressive'
    }
  },

  // ===== USER 2: WARREN BUFFETT STYLE =====
  buffett_style: {
    id: 'buffett_style',
    name: 'William Graham',
    description: 'Value Investor - Buffett/Graham style, patient, long-term',
    portfolio: {
      name: 'Value Compounding Portfolio',
      initialCash: 1000000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Buffett Value Agent',
      description: 'Deep value with moat analysis and margin of safety',
      strategy_type: 'fundamental',
      // Signal weights - fundamental heavy
      technical_weight: 0.05,
      sentiment_weight: 0.05,
      insider_weight: 0.15,
      fundamental_weight: 0.30,
      alternative_weight: 0.05,
      valuation_weight: 0.25,
      thirteenf_weight: 0.05,
      earnings_weight: 0.05,
      value_quality_weight: 0.05,
      // Thresholds - very selective
      min_confidence: 0.75,
      min_signal_score: 0.50,
      // Risk parameters - conservative
      max_position_size: 0.10,
      max_sector_exposure: 0.25,
      min_cash_reserve: 0.20,
      max_drawdown: 0.15,
      max_correlation: 0.60,
      max_daily_trades: 2,
      // Feature flags
      use_optimized_weights: 0,
      use_hmm_regime: 0,
      use_ml_combiner: 0,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 1,
      pause_in_crisis: 0,
      regime_scaling_enabled: 0,
      vix_scaling_enabled: 0,
      // Execution - manual confirmation
      auto_execute: 0,
      execution_threshold: 0.90,
      require_confirmation: 1,
      // Universe - quality stocks only
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['market_crash', 'patience_test', 'value_opportunity'],
    expectedBehavior: {
      tradesPerDay: { min: 0, max: 1 },
      signalFrequency: 'low',
      riskTolerance: 'conservative'
    }
  },

  // ===== USER 3: BEGINNER INVESTOR =====
  beginner_investor: {
    id: 'beginner_investor',
    name: 'Alex Newbie',
    description: 'Beginner - DCA strategy, very low risk, high cash reserve',
    portfolio: {
      name: 'My First Portfolio',
      initialCash: 10000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Safe Start Agent',
      description: 'Conservative DCA with training wheels',
      strategy_type: 'hybrid',
      // Signal weights - balanced, slightly conservative
      technical_weight: 0.10,
      sentiment_weight: 0.10,
      insider_weight: 0.10,
      fundamental_weight: 0.15,
      alternative_weight: 0.10,
      valuation_weight: 0.15,
      thirteenf_weight: 0.10,
      earnings_weight: 0.10,
      value_quality_weight: 0.10,
      // Thresholds - very safe
      min_confidence: 0.80,
      min_signal_score: 0.60,
      // Risk parameters - very conservative
      max_position_size: 0.05,
      max_sector_exposure: 0.20,
      min_cash_reserve: 0.25,
      max_drawdown: 0.10,
      max_correlation: 0.50,
      max_daily_trades: 1,
      // Feature flags - simple
      use_optimized_weights: 0,
      use_hmm_regime: 0,
      use_ml_combiner: 0,
      use_factor_exposure: 0,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 1,
      regime_scaling_enabled: 0,
      vix_scaling_enabled: 0,
      // Execution - always confirm
      auto_execute: 0,
      execution_threshold: 0.95,
      require_confirmation: 1,
      // Universe - simple
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['first_trade', 'ui_validation', 'error_recovery'],
    expectedBehavior: {
      tradesPerDay: { min: 0, max: 1 },
      signalFrequency: 'very_low',
      riskTolerance: 'very_conservative'
    }
  },

  // ===== USER 4: MOMENTUM TRADER =====
  momentum_trader: {
    id: 'momentum_trader',
    name: 'Flash Thompson',
    description: 'Momentum Trader - Technical heavy, trend-following',
    portfolio: {
      name: 'Momentum Masters Portfolio',
      initialCash: 250000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Trend Rider Agent',
      description: 'Momentum and trend-following strategy',
      strategy_type: 'technical',
      // Signal weights
      technical_weight: 0.40,
      sentiment_weight: 0.20,
      insider_weight: 0.05,
      fundamental_weight: 0.05,
      alternative_weight: 0.10,
      valuation_weight: 0.05,
      thirteenf_weight: 0.05,
      earnings_weight: 0.05,
      value_quality_weight: 0.05,
      // Thresholds
      min_confidence: 0.55,
      min_signal_score: 0.25,
      // Risk parameters - medium-high
      max_position_size: 0.12,
      max_sector_exposure: 0.35,
      min_cash_reserve: 0.10,
      max_drawdown: 0.20,
      max_correlation: 0.75,
      max_daily_trades: 10,
      // Feature flags
      use_optimized_weights: 1,
      use_hmm_regime: 1,
      use_ml_combiner: 0,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 0,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 20,
      // Execution
      auto_execute: 1,
      execution_threshold: 0.70,
      require_confirmation: 0,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['trend_reversal', 'momentum_crash', 'breakout'],
    expectedBehavior: {
      tradesPerDay: { min: 2, max: 8 },
      signalFrequency: 'high',
      riskTolerance: 'aggressive'
    }
  },

  // ===== USER 5: SENTIMENT-DRIVEN =====
  sentiment_driven: {
    id: 'sentiment_driven',
    name: 'Sophie Sentiment',
    description: 'Sentiment-Driven - Social/news focused, event-driven',
    portfolio: {
      name: 'Sentiment Alpha Portfolio',
      initialCash: 100000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Sentiment Scanner Agent',
      description: 'News and social sentiment-driven strategy',
      strategy_type: 'sentiment',
      // Signal weights - sentiment heavy
      technical_weight: 0.10,
      sentiment_weight: 0.35,
      insider_weight: 0.05,
      fundamental_weight: 0.05,
      alternative_weight: 0.25,
      valuation_weight: 0.05,
      thirteenf_weight: 0.05,
      earnings_weight: 0.05,
      value_quality_weight: 0.05,
      // Thresholds
      min_confidence: 0.60,
      min_signal_score: 0.30,
      // Risk parameters
      max_position_size: 0.08,
      max_sector_exposure: 0.30,
      min_cash_reserve: 0.15,
      max_drawdown: 0.18,
      max_correlation: 0.65,
      max_daily_trades: 8,
      // Feature flags
      use_optimized_weights: 1,
      use_hmm_regime: 0,
      use_ml_combiner: 0,
      use_factor_exposure: 0,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 0,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 25,
      // Execution
      auto_execute: 1,
      execution_threshold: 0.72,
      require_confirmation: 0,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['news_event', 'sentiment_spike', 'social_viral'],
    expectedBehavior: {
      tradesPerDay: { min: 1, max: 6 },
      signalFrequency: 'medium-high',
      riskTolerance: 'moderate'
    }
  },

  // ===== USER 6: INSIDER FOLLOWING =====
  insider_following: {
    id: 'insider_following',
    name: 'Ian Insider',
    description: 'Insider Following - Tracks insider buys, 13F, congressional',
    portfolio: {
      name: 'Smart Money Tracker Portfolio',
      initialCash: 300000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Smart Money Agent',
      description: 'Follows insider and institutional activity',
      strategy_type: 'custom',
      // Signal weights - insider/institutional heavy
      technical_weight: 0.05,
      sentiment_weight: 0.05,
      insider_weight: 0.40,
      fundamental_weight: 0.10,
      alternative_weight: 0.15,
      valuation_weight: 0.10,
      thirteenf_weight: 0.10,
      earnings_weight: 0.03,
      value_quality_weight: 0.02,
      // Thresholds
      min_confidence: 0.65,
      min_signal_score: 0.35,
      // Risk parameters
      max_position_size: 0.10,
      max_sector_exposure: 0.30,
      min_cash_reserve: 0.10,
      max_drawdown: 0.18,
      max_correlation: 0.70,
      max_daily_trades: 5,
      // Feature flags
      use_optimized_weights: 1,
      use_hmm_regime: 0,
      use_ml_combiner: 0,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 0,
      regime_scaling_enabled: 0,
      vix_scaling_enabled: 0,
      // Execution
      auto_execute: 0,
      execution_threshold: 0.80,
      require_confirmation: 1,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['insider_cluster', 'congressional_alert', '13f_filing'],
    expectedBehavior: {
      tradesPerDay: { min: 0, max: 3 },
      signalFrequency: 'low-medium',
      riskTolerance: 'moderate'
    }
  },

  // ===== USER 7: 13F SUPER-INVESTOR =====
  super_investor: {
    id: 'super_investor',
    name: 'Charlie Follower',
    description: '13F Super-Investor - Clones famous investors',
    portfolio: {
      name: 'Super Investor Clone Portfolio',
      initialCash: 500000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Super Investor Clone Agent',
      description: 'Follows Buffett, Burry, Ackman, etc.',
      strategy_type: 'custom',
      // Signal weights - 13F heavy
      technical_weight: 0.05,
      sentiment_weight: 0.05,
      insider_weight: 0.10,
      fundamental_weight: 0.25,
      alternative_weight: 0.05,
      valuation_weight: 0.10,
      thirteenf_weight: 0.40,
      earnings_weight: 0.00,
      value_quality_weight: 0.00,
      // Thresholds
      min_confidence: 0.70,
      min_signal_score: 0.40,
      // Risk parameters - moderate
      max_position_size: 0.08,
      max_sector_exposure: 0.25,
      min_cash_reserve: 0.15,
      max_drawdown: 0.15,
      max_correlation: 0.60,
      max_daily_trades: 3,
      // Feature flags
      use_optimized_weights: 0,
      use_hmm_regime: 0,
      use_ml_combiner: 0,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 1,
      pause_in_crisis: 0,
      regime_scaling_enabled: 0,
      vix_scaling_enabled: 0,
      // Execution
      auto_execute: 0,
      execution_threshold: 0.85,
      require_confirmation: 1,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['13f_delayed', 'position_exit', 'new_filing'],
    expectedBehavior: {
      tradesPerDay: { min: 0, max: 2 },
      signalFrequency: 'low',
      riskTolerance: 'conservative'
    }
  },

  // ===== USER 8: RISK-AVERSE CONSERVATIVE =====
  risk_averse: {
    id: 'risk_averse',
    name: 'Margaret Safe',
    description: 'Risk-Averse - Ultra conservative, pause in crisis',
    portfolio: {
      name: 'Capital Preservation Portfolio',
      initialCash: 200000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Capital Guardian Agent',
      description: 'Maximum capital preservation',
      strategy_type: 'hybrid',
      // Signal weights - balanced, quality focused
      technical_weight: 0.08,
      sentiment_weight: 0.05,
      insider_weight: 0.12,
      fundamental_weight: 0.20,
      alternative_weight: 0.05,
      valuation_weight: 0.20,
      thirteenf_weight: 0.10,
      earnings_weight: 0.10,
      value_quality_weight: 0.10,
      // Thresholds - very high
      min_confidence: 0.85,
      min_signal_score: 0.65,
      // Risk parameters - ultra conservative
      max_position_size: 0.03,
      max_sector_exposure: 0.15,
      min_cash_reserve: 0.35,
      max_drawdown: 0.08,
      max_correlation: 0.40,
      max_daily_trades: 1,
      // Feature flags
      use_optimized_weights: 0,
      use_hmm_regime: 1,
      use_ml_combiner: 0,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 1,
      pause_in_crisis: 1,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 18,
      // Execution
      auto_execute: 0,
      execution_threshold: 0.95,
      require_confirmation: 1,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['crisis_pause', 'drawdown_protection', 'volatility_reduction'],
    expectedBehavior: {
      tradesPerDay: { min: 0, max: 1 },
      signalFrequency: 'very_low',
      riskTolerance: 'very_conservative'
    }
  },

  // ===== USER 9: AGGRESSIVE GROWTH =====
  aggressive_growth: {
    id: 'aggressive_growth',
    name: 'Cathy Moonshot',
    description: 'Aggressive Growth - High positions, low cash, high sector',
    portfolio: {
      name: 'Growth Rockets Portfolio',
      initialCash: 150000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Growth Rocket Agent',
      description: 'Maximum growth exposure',
      strategy_type: 'custom',
      // Signal weights - growth focused
      technical_weight: 0.20,
      sentiment_weight: 0.15,
      insider_weight: 0.05,
      fundamental_weight: 0.15,
      alternative_weight: 0.15,
      valuation_weight: 0.05,
      thirteenf_weight: 0.05,
      earnings_weight: 0.15,
      value_quality_weight: 0.05,
      // Thresholds - lower bar
      min_confidence: 0.45,
      min_signal_score: 0.15,
      // Risk parameters - very aggressive
      max_position_size: 0.20,
      max_sector_exposure: 0.50,
      min_cash_reserve: 0.03,
      max_drawdown: 0.35,
      max_correlation: 0.90,
      max_daily_trades: 25,
      // Feature flags
      use_optimized_weights: 1,
      use_hmm_regime: 1,
      use_ml_combiner: 1,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 0,
      pause_in_crisis: 0,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 40,
      // Execution
      auto_execute: 1,
      execution_threshold: 0.50,
      require_confirmation: 0,
      // Universe - growth sectors
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['full_exposure', 'sector_concentration', 'rapid_trades'],
    expectedBehavior: {
      tradesPerDay: { min: 5, max: 20 },
      signalFrequency: 'very_high',
      riskTolerance: 'very_aggressive'
    }
  },

  // ===== USER 10: HYBRID DIVERSIFIED =====
  hybrid_diversified: {
    id: 'hybrid_diversified',
    name: 'Henry Balanced',
    description: 'Hybrid Diversified - All features enabled, balanced',
    portfolio: {
      name: 'Balanced Alpha Portfolio',
      initialCash: 400000,
      currency: 'USD',
      portfolioType: 'manual'
    },
    agent: {
      name: 'Balanced Alpha Agent',
      description: 'Diversified multi-factor with all features',
      strategy_type: 'hybrid',
      // Signal weights - fully balanced (default)
      technical_weight: 0.11,
      sentiment_weight: 0.11,
      insider_weight: 0.11,
      fundamental_weight: 0.13,
      alternative_weight: 0.11,
      valuation_weight: 0.11,
      thirteenf_weight: 0.12,
      earnings_weight: 0.10,
      value_quality_weight: 0.10,
      // Thresholds - balanced
      min_confidence: 0.60,
      min_signal_score: 0.30,
      // Risk parameters - moderate
      max_position_size: 0.10,
      max_sector_exposure: 0.30,
      min_cash_reserve: 0.10,
      max_drawdown: 0.20,
      max_correlation: 0.70,
      max_daily_trades: 10,
      // Feature flags - ALL enabled
      use_optimized_weights: 1,
      use_hmm_regime: 1,
      use_ml_combiner: 1,
      use_factor_exposure: 1,
      use_probabilistic_dcf: 1,
      apply_earnings_filter: 1,
      pause_in_crisis: 1,
      regime_scaling_enabled: 1,
      vix_scaling_enabled: 1,
      vix_threshold: 25,
      // Execution
      auto_execute: 1,
      execution_threshold: 0.80,
      require_confirmation: 0,
      // Universe
      universe_type: 'all',
      region: 'US'
    },
    testScenarios: ['feature_interaction', 'regime_adaptation', 'full_system'],
    expectedBehavior: {
      tradesPerDay: { min: 1, max: 8 },
      signalFrequency: 'medium',
      riskTolerance: 'moderate'
    }
  }
};

module.exports = { SYNTHETIC_USERS };
