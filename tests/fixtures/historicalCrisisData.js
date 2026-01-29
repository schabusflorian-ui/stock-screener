/**
 * Historical Crisis Return Data for Stress Testing
 *
 * Data synthesized from actual market behavior during major crises.
 * Useful for testing Kelly Criterion robustness under extreme conditions.
 */

// Helper to generate crisis-style returns
function generateCrisisReturns(options = {}) {
  const {
    totalDrawdown = -0.30,
    duration = 60,
    dailyVolatility = 0.03,
    pattern = 'linear', // 'linear', 'vshape', 'grinding', 'sudden'
    seed = null
  } = options;

  const returns = [];
  const avgDailyReturn = Math.log(1 + totalDrawdown) / duration;

  // Simple pseudo-random for reproducibility
  let rng = seed || Math.random() * 1000;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };

  for (let i = 0; i < duration; i++) {
    let baseReturn = avgDailyReturn;

    if (pattern === 'vshape') {
      // Sharp decline then recovery
      const midpoint = duration / 2;
      if (i < midpoint) {
        baseReturn = avgDailyReturn * 2; // Faster decline
      } else {
        baseReturn = -avgDailyReturn * 0.5; // Slower recovery
      }
    } else if (pattern === 'sudden') {
      // Most of the drop in first few days
      if (i < 5) {
        baseReturn = totalDrawdown / 5;
      } else {
        baseReturn = 0;
      }
    } else if (pattern === 'grinding') {
      // Slow persistent decline
      baseReturn = avgDailyReturn * (1 + 0.2 * Math.sin(i * 0.3));
    }

    // Add volatility noise
    const noise = (random() - 0.5) * 2 * dailyVolatility;
    returns.push(baseReturn + noise);
  }

  return returns;
}

// Generate normal market returns for comparison
function generateNormalReturns(options = {}) {
  const {
    n = 252,
    dailyMean = 0.0003, // ~7.5% annual
    dailyStd = 0.01, // ~16% annual vol
    seed = null
  } = options;

  const returns = [];
  let rng = seed || Math.random() * 1000;

  // Box-Muller for normal distribution
  for (let i = 0; i < n; i++) {
    rng = (rng * 9301 + 49297) % 233280;
    const u1 = rng / 233280;
    rng = (rng * 9301 + 49297) % 233280;
    const u2 = rng / 233280;
    const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
    returns.push(dailyMean + dailyStd * z);
  }

  return returns;
}

module.exports = {
  // ============================================
  // 2008 Global Financial Crisis
  // Sep 15, 2008 (Lehman) - Mar 9, 2009 (bottom)
  // ============================================

  GFC_2008: {
    name: 'Global Financial Crisis 2008',
    period: { start: '2008-09-15', end: '2009-03-09' },
    description: 'Lehman Brothers collapse to market bottom',

    SP500: {
      totalReturn: -0.50,
      maxDrawdown: -0.57,
      peakVIX: 80.86,
      avgDailyVol: 0.035,
      worstDay: -0.0947, // Oct 15, 2008
      tradingDays: 120,
      returns: generateCrisisReturns({
        totalDrawdown: -0.50,
        duration: 120,
        dailyVolatility: 0.035,
        pattern: 'grinding',
        seed: 2008
      })
    },

    FINANCIALS: {
      totalReturn: -0.70,
      maxDrawdown: -0.80,
      avgDailyVol: 0.055,
      returns: generateCrisisReturns({
        totalDrawdown: -0.70,
        duration: 120,
        dailyVolatility: 0.055,
        pattern: 'grinding',
        seed: 20081
      })
    },

    // Expected Kelly behavior
    expectedBehavior: {
      shouldDetectFatTails: true,
      expectedKurtosis: { min: 5, max: 15 },
      kellyRecommendation: 'avoid_or_minimal',
      regimeDetection: 'bear_high_vol'
    }
  },

  // ============================================
  // COVID-19 Crash (Feb-Mar 2020)
  // Feb 19, 2020 (peak) - Mar 23, 2020 (bottom)
  // ============================================

  COVID_2020: {
    name: 'COVID-19 Crash',
    period: { start: '2020-02-19', end: '2020-03-23' },
    description: 'Fastest 30%+ decline in history',

    SP500: {
      totalReturn: -0.34,
      maxDrawdown: -0.34,
      peakVIX: 82.69, // March 16, 2020
      avgDailyVol: 0.048,
      worstDay: -0.1198, // March 16, 2020
      tradingDays: 23,
      returns: generateCrisisReturns({
        totalDrawdown: -0.34,
        duration: 23,
        dailyVolatility: 0.05,
        pattern: 'sudden',
        seed: 2020
      })
    },

    // Recovery period (Mar 23 - Aug 2020)
    RECOVERY: {
      totalReturn: 0.52,
      tradingDays: 110,
      returns: generateCrisisReturns({
        totalDrawdown: 0.52, // Positive = recovery
        duration: 110,
        dailyVolatility: 0.02,
        pattern: 'vshape',
        seed: 20201
      })
    },

    expectedBehavior: {
      shouldDetectFatTails: true,
      expectedKurtosis: { min: 8, max: 20 },
      kellyRecommendation: 'minimal',
      regimeDetection: 'bear_high_vol',
      vixThreshold: 50
    }
  },

  // ============================================
  // 2022 Fed Rate Shock
  // Jan 2022 - Oct 2022
  // ============================================

  RATE_SHOCK_2022: {
    name: 'Fed Rate Shock 2022',
    period: { start: '2022-01-03', end: '2022-10-12' },
    description: 'Sustained decline from rate hikes',

    NASDAQ: {
      totalReturn: -0.35,
      maxDrawdown: -0.35,
      peakVIX: 36.45,
      avgDailyVol: 0.018,
      tradingDays: 200,
      returns: generateCrisisReturns({
        totalDrawdown: -0.35,
        duration: 200,
        dailyVolatility: 0.018,
        pattern: 'grinding',
        seed: 2022
      })
    },

    GROWTH_STOCKS: {
      totalReturn: -0.45,
      avgDailyVol: 0.022,
      returns: generateCrisisReturns({
        totalDrawdown: -0.45,
        duration: 200,
        dailyVolatility: 0.022,
        pattern: 'grinding',
        seed: 20221
      })
    },

    expectedBehavior: {
      shouldDetectFatTails: false, // More normal distribution
      kellyRecommendation: 'negative_or_avoid',
      regimeDetection: 'bear_low_vol'
    }
  },

  // ============================================
  // Flash Crash Scenarios
  // ============================================

  FLASH_CRASH_2010: {
    name: 'Flash Crash May 6, 2010',
    period: { start: '2010-05-06', end: '2010-05-06' },
    description: 'Intraday: -9.2% in minutes, recovered same day',

    // Simulated intraday-style returns (5-min bars scaled to daily equivalent)
    intradayReturns: [0.001, 0.002, -0.092, 0.085, 0.002, 0.001],

    expectedBehavior: {
      shouldDetectFatTails: true,
      expectedKurtosis: { min: 15 },
      extremeVolatility: true
    }
  },

  // ============================================
  // Normal Market Periods (for comparison)
  // ============================================

  NORMAL_BULL: {
    name: 'Normal Bull Market',
    description: 'Typical bull market conditions',
    returns: generateNormalReturns({
      n: 252,
      dailyMean: 0.0004, // ~10% annual
      dailyStd: 0.01, // ~16% annual vol
      seed: 1000
    }),

    expectedBehavior: {
      shouldDetectFatTails: false,
      expectedKurtosis: { min: 2.5, max: 4 },
      kellyRecommendation: 'standard',
      regimeDetection: 'bull_low_vol'
    }
  },

  NORMAL_FLAT: {
    name: 'Normal Sideways Market',
    description: 'Range-bound market',
    returns: generateNormalReturns({
      n: 252,
      dailyMean: 0.0001, // ~2.5% annual
      dailyStd: 0.008, // ~13% annual vol
      seed: 1001
    })
  },

  // ============================================
  // Helper functions
  // ============================================

  generateCrisisReturns,
  generateNormalReturns,

  // Calculate statistics from returns
  calculateStats: function(returns) {
    const n = returns.length;
    if (n === 0) return null;

    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    // Skewness
    const m3 = returns.reduce((sum, r) => sum + ((r - mean) / std) ** 3, 0) / n;

    // Kurtosis (excess)
    const m4 = returns.reduce((sum, r) => sum + ((r - mean) / std) ** 4, 0) / n;
    const kurtosis = m4 - 3;

    // Annualize
    const annualReturn = mean * 252;
    const annualVol = std * Math.sqrt(252);

    // Max drawdown (simple)
    let peak = 1;
    let maxDD = 0;
    let cumulative = 1;
    for (const r of returns) {
      cumulative *= (1 + r);
      peak = Math.max(peak, cumulative);
      const dd = (peak - cumulative) / peak;
      maxDD = Math.max(maxDD, dd);
    }

    return {
      n,
      mean,
      std,
      variance,
      skewness: m3,
      kurtosis,
      annualReturn,
      annualVol,
      maxDrawdown: -maxDD,
      sharpe: annualReturn / annualVol
    };
  },

  // Detect if returns exhibit fat tails
  hasFatTails: function(returns, threshold = 4) {
    const stats = this.calculateStats(returns);
    return stats && stats.kurtosis > threshold;
  }
};
