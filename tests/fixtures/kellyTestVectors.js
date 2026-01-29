/**
 * Academic Test Vectors for Kelly Criterion
 *
 * Sources:
 * - Thorp, E.O. (1969). "Optimal Gambling Systems for Favorable Games"
 * - MacLean, Thorp, Ziemba (2011). "The Kelly Capital Growth Investment Criterion"
 * - Poundstone, W. (2005). "Fortune's Formula"
 */

module.exports = {
  // ============================================
  // Classic Kelly Formula Tests: f* = (bp - q) / b
  // ============================================

  CLASSIC_KELLY: {
    // Fair coin with 2:1 odds (Thorp example)
    fairCoin2to1: {
      description: 'Fair coin with 2:1 payoff (classic Thorp example)',
      winRate: 0.5,
      avgWin: 2,
      avgLoss: 1,
      expectedKelly: 0.25, // (2*0.5 - 0.5) / 2 = 0.25
      tolerance: 0.0001
    },

    // Biased coin 60% win, even odds
    biasedCoinEvenOdds: {
      description: '60% win rate with even odds',
      winRate: 0.6,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: 0.20, // (1*0.6 - 0.4) / 1 = 0.20
      tolerance: 0.0001
    },

    // Blackjack card counter edge (Thorp)
    blackjackCounter: {
      description: 'Card counter with 2% edge',
      winRate: 0.51,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: 0.02, // (1*0.51 - 0.49) / 1 = 0.02
      tolerance: 0.001
    },

    // High payoff, low probability
    lotteryStyle: {
      description: 'Lottery-style bet: 2% win rate, 100:1 payoff',
      winRate: 0.02,
      avgWin: 100,
      avgLoss: 1,
      expectedKelly: 0.0102, // (100*0.02 - 0.98) / 100 = 0.0102
      tolerance: 0.001
    },

    // Frequent small wins
    frequentSmallWins: {
      description: 'High frequency, small payoff: 95% win, 0.1:1 payoff',
      winRate: 0.95,
      avgWin: 0.1,
      avgLoss: 1,
      expectedKelly: 0.45, // (0.1*0.95 - 0.05) / 0.1 = 0.45
      tolerance: 0.01
    },

    // Break-even game
    breakEven: {
      description: 'Break-even game (50% win, even odds)',
      winRate: 0.5,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: 0, // (1*0.5 - 0.5) / 1 = 0
      tolerance: 0.0001
    },

    // Losing game
    losingGame: {
      description: 'Losing game (40% win, even odds)',
      winRate: 0.4,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: -0.2, // (1*0.4 - 0.6) / 1 = -0.2
      tolerance: 0.0001
    }
  },

  // ============================================
  // Continuous Kelly Formula: f* = (mu - r) / sigma^2
  // ============================================

  CONTINUOUS_KELLY: {
    // Typical stock scenario
    typicalStock: {
      description: 'Stock with 15% return, 5% rf, 20% vol',
      annualReturn: 0.15,
      riskFreeRate: 0.05,
      annualVolatility: 0.20,
      expectedKelly: 2.5, // (0.15 - 0.05) / 0.04 = 2.5
      tolerance: 0.01
    },

    // S&P 500 historical average
    sp500Historical: {
      description: 'S&P 500 historical: 10% return, 2% rf, 15% vol',
      annualReturn: 0.10,
      riskFreeRate: 0.02,
      annualVolatility: 0.15,
      expectedKelly: 3.556, // (0.10 - 0.02) / 0.0225 = 3.556
      tolerance: 0.01
    },

    // Low volatility stock
    lowVolStock: {
      description: 'Low vol stock: 8% return, 4% rf, 10% vol',
      annualReturn: 0.08,
      riskFreeRate: 0.04,
      annualVolatility: 0.10,
      expectedKelly: 4.0, // (0.08 - 0.04) / 0.01 = 4.0
      tolerance: 0.01
    },

    // High volatility stock
    highVolStock: {
      description: 'High vol stock: 20% return, 5% rf, 40% vol',
      annualReturn: 0.20,
      riskFreeRate: 0.05,
      annualVolatility: 0.40,
      expectedKelly: 0.9375, // (0.20 - 0.05) / 0.16 = 0.9375
      tolerance: 0.01
    },

    // Negative excess return
    negativeExcess: {
      description: 'Return below risk-free (3% return, 5% rf)',
      annualReturn: 0.03,
      riskFreeRate: 0.05,
      annualVolatility: 0.20,
      expectedKelly: -0.5, // (0.03 - 0.05) / 0.04 = -0.5
      tolerance: 0.01
    }
  },

  // ============================================
  // Multi-Asset Kelly: f* = Sigma^(-1) * mu
  // ============================================

  MULTI_ASSET_KELLY: {
    // Two uncorrelated assets with equal stats
    twoUncorrelatedEqual: {
      description: 'Two uncorrelated assets with equal stats',
      returns: [0.10, 0.10],
      volatilities: [0.20, 0.20],
      correlation: 0,
      // f_i = mu_i / sigma_i^2 for uncorrelated
      expectedWeights: [2.5, 2.5], // 0.10 / 0.04 = 2.5
      tolerance: 0.1
    },

    // Two uncorrelated assets with different stats
    twoUncorrelatedDifferent: {
      description: 'Two uncorrelated assets with different stats',
      returns: [0.10, 0.08],
      volatilities: [0.20, 0.15],
      correlation: 0,
      expectedWeights: [2.5, 3.556], // [0.10/0.04, 0.08/0.0225]
      tolerance: 0.1
    },

    // Two positively correlated assets
    twoPositivelyCorrelated: {
      description: 'Two assets with 50% correlation',
      returns: [0.10, 0.08],
      volatilities: [0.20, 0.15],
      correlation: 0.5,
      // Need analytical 2x2 inverse calculation
      // Cov = [[0.04, 0.015], [0.015, 0.0225]]
      // det = 0.04*0.0225 - 0.015^2 = 0.0006
      // inv = [[0.0225, -0.015], [-0.015, 0.04]] / 0.0006
      //     = [[37.5, -25], [-25, 66.67]]
      // f = inv * mu = [[37.5, -25], [-25, 66.67]] * [0.10, 0.08]
      //   = [37.5*0.10 - 25*0.08, -25*0.10 + 66.67*0.08]
      //   = [3.75 - 2.0, -2.5 + 5.33]
      //   = [1.75, 2.83]
      expectedWeights: [1.75, 2.83],
      tolerance: 0.1
    },

    // Two negatively correlated assets (diversification)
    twoNegativelyCorrelated: {
      description: 'Two assets with -50% correlation',
      returns: [0.10, 0.08],
      volatilities: [0.20, 0.15],
      correlation: -0.5,
      // Cov = [[0.04, -0.015], [-0.015, 0.0225]]
      // det = 0.04*0.0225 - (-0.015)^2 = 0.0006
      // Same det but different sign in off-diagonal
      // inv = [[0.0225, 0.015], [0.015, 0.04]] / 0.0006
      //     = [[37.5, 25], [25, 66.67]]
      // f = [[37.5, 25], [25, 66.67]] * [0.10, 0.08]
      //   = [3.75 + 2.0, 2.5 + 5.33]
      //   = [5.75, 7.83]
      expectedWeights: [5.75, 7.83],
      tolerance: 0.2
    },

    // Three uncorrelated assets
    threeUncorrelated: {
      description: 'Three uncorrelated assets',
      returns: [0.12, 0.10, 0.08],
      volatilities: [0.25, 0.20, 0.15],
      correlations: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      expectedWeights: [1.92, 2.5, 3.56], // mu_i / sigma_i^2
      tolerance: 0.1
    }
  },

  // ============================================
  // Edge Cases
  // ============================================

  EDGE_CASES: {
    // Perfect game
    perfectWinRate: {
      description: '100% win rate',
      winRate: 1.0,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: 1.0,
      tolerance: 0.0001
    },

    // Zero win rate
    zeroWinRate: {
      description: '0% win rate',
      winRate: 0,
      avgWin: 2,
      avgLoss: 1,
      expectedKelly: -0.5, // (2*0 - 1) / 2 = -0.5
      tolerance: 0.0001
    },

    // Very high payoff
    veryHighPayoff: {
      description: 'Extreme payoff ratio (1000:1)',
      winRate: 0.01,
      avgWin: 1000,
      avgLoss: 1,
      expectedKelly: 0.00901, // (1000*0.01 - 0.99) / 1000
      tolerance: 0.001
    },

    // Nearly break-even
    almostBreakEven: {
      description: 'Nearly break-even game',
      winRate: 0.501,
      avgWin: 1,
      avgLoss: 1,
      expectedKelly: 0.002, // Tiny edge
      tolerance: 0.001
    }
  },

  // ============================================
  // Helper function to calculate expected Kelly
  // ============================================

  calculateClassicKelly: function(winRate, avgWin, avgLoss) {
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - p;
    return (b * p - q) / b;
  },

  calculateContinuousKelly: function(annualReturn, riskFreeRate, annualVolatility) {
    if (annualVolatility === 0) return 0;
    const variance = annualVolatility * annualVolatility;
    return (annualReturn - riskFreeRate) / variance;
  },

  // Calculate 2x2 matrix inverse for verification
  invert2x2: function(matrix) {
    const [[a, b], [c, d]] = matrix;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-10) {
      return null; // Singular
    }
    return [
      [d / det, -b / det],
      [-c / det, a / det]
    ];
  },

  // Build covariance matrix from volatilities and correlation
  buildCovMatrix2x2: function(vol1, vol2, correlation) {
    return [
      [vol1 * vol1, correlation * vol1 * vol2],
      [correlation * vol1 * vol2, vol2 * vol2]
    ];
  }
};
