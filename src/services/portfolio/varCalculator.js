// src/services/portfolio/varCalculator.js
// Value at Risk Calculator - Parametric, Historical, and Monte Carlo methods
// Complements existing EVT metrics in advancedKelly.js

/**
 * VaR Calculator with multiple methodologies
 * - Historical Simulation (already in advancedKelly, extended here)
 * - Parametric (Variance-Covariance)
 * - Monte Carlo Simulation
 * - Incremental/Marginal VaR for portfolio decomposition
 */
class VaRCalculator {
  constructor(options = {}) {
    this.confidenceLevels = options.confidenceLevels || [0.95, 0.99];
    this.horizons = options.horizons || [1, 5, 10, 21]; // days
    this.mcSimulations = options.mcSimulations || 10000;
  }

  /**
   * Calculate comprehensive VaR report for a portfolio
   * @param {Array} returns - Array of daily portfolio returns
   * @param {number} portfolioValue - Current portfolio value
   * @param {Object} options - Additional options
   */
  calculateVaR(returns, portfolioValue, options = {}) {
    if (!returns || returns.length < 30) {
      return { error: 'Insufficient data - need at least 30 return observations' };
    }

    const result = {
      portfolioValue,
      dataPoints: returns.length,
      calculatedAt: new Date().toISOString(),
      historical: {},
      parametric: {},
      monteCarlo: {},
      comparison: {},
      backtestMetrics: null,
    };

    // Calculate for each confidence level and horizon
    for (const confidence of this.confidenceLevels) {
      for (const horizon of this.horizons) {
        const key = `${Math.round(confidence * 100)}_${horizon}d`;

        // Historical VaR
        const histVaR = this._historicalVaR(returns, confidence, horizon);
        result.historical[key] = {
          varPercent: histVaR.var,
          varDollar: histVaR.var * portfolioValue,
          cvarPercent: histVaR.cvar,
          cvarDollar: histVaR.cvar * portfolioValue,
        };

        // Parametric VaR
        const paramVaR = this._parametricVaR(returns, confidence, horizon);
        result.parametric[key] = {
          varPercent: paramVaR.var,
          varDollar: paramVaR.var * portfolioValue,
          cvarPercent: paramVaR.cvar,
          cvarDollar: paramVaR.cvar * portfolioValue,
        };

        // Monte Carlo VaR
        const mcVaR = this._monteCarloVaR(returns, confidence, horizon);
        result.monteCarlo[key] = {
          varPercent: mcVaR.var,
          varDollar: mcVaR.var * portfolioValue,
          cvarPercent: mcVaR.cvar,
          cvarDollar: mcVaR.cvar * portfolioValue,
          paths: mcVaR.pathStats,
        };

        // Compare methods
        result.comparison[key] = {
          historicalVaR: histVaR.var,
          parametricVaR: paramVaR.var,
          monteCarloVaR: mcVaR.var,
          maxVaR: Math.min(histVaR.var, paramVaR.var, mcVaR.var), // Most conservative (most negative)
          avgVaR: (histVaR.var + paramVaR.var + mcVaR.var) / 3,
          spread: Math.abs(Math.max(histVaR.var, paramVaR.var, mcVaR.var) - Math.min(histVaR.var, paramVaR.var, mcVaR.var)),
        };
      }
    }

    // Add risk summary
    result.summary = this._generateSummary(result, returns);

    return result;
  }

  /**
   * Historical Simulation VaR
   * Uses actual historical returns, scaled to horizon
   */
  _historicalVaR(returns, confidence, horizon) {
    const n = returns.length;
    const sorted = [...returns].sort((a, b) => a - b);

    // Scale to horizon using square-root-of-time rule
    const sqrtHorizon = Math.sqrt(horizon);

    // VaR at confidence level
    const varIndex = Math.floor(n * (1 - confidence));
    const var1d = sorted[varIndex];
    const varHorizon = var1d * sqrtHorizon;

    // CVaR (Expected Shortfall) - average of losses beyond VaR
    const tailReturns = sorted.slice(0, varIndex + 1);
    const cvar1d = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
    const cvarHorizon = cvar1d * sqrtHorizon;

    return {
      var: Math.round(varHorizon * 10000) / 10000,
      cvar: Math.round(cvarHorizon * 10000) / 10000,
    };
  }

  /**
   * Parametric (Variance-Covariance) VaR
   * Assumes normal distribution - fast but underestimates tail risk
   */
  _parametricVaR(returns, confidence, horizon) {
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Z-scores for confidence levels
    const zScores = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326,
      0.995: 2.576,
    };
    const z = zScores[confidence] || this._normalInverse(1 - confidence);

    // Scale to horizon
    const sqrtHorizon = Math.sqrt(horizon);
    const varHorizon = -(mean * horizon - z * stdDev * sqrtHorizon);

    // CVaR for normal distribution: E[X | X < -VaR]
    // For normal: CVaR = μ + σ * φ(z) / (1-Φ(z)) where φ is pdf and Φ is cdf
    const pdfZ = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const cvar1d = -(mean - stdDev * pdfZ / (1 - confidence));
    const cvarHorizon = cvar1d * sqrtHorizon;

    return {
      var: Math.round(-varHorizon * 10000) / 10000,
      cvar: Math.round(-cvarHorizon * 10000) / 10000,
      inputs: { mean, stdDev, z },
    };
  }

  /**
   * Monte Carlo VaR
   * Simulates many paths using historical distribution characteristics
   * Can capture non-normality through bootstrap or fitted distributions
   */
  _monteCarloVaR(returns, confidence, horizon) {
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1));

    // Calculate skewness and kurtosis for better simulation
    const skewness = returns.reduce((s, r) => s + Math.pow((r - mean) / stdDev, 3), 0) / n;
    const kurtosis = returns.reduce((s, r) => s + Math.pow((r - mean) / stdDev, 4), 0) / n;

    // Simulate paths
    const simulatedReturns = [];

    for (let i = 0; i < this.mcSimulations; i++) {
      let pathReturn = 0;

      for (let d = 0; d < horizon; d++) {
        // Use bootstrap (resample from historical) for better tail capture
        if (kurtosis > 4) {
          // Fat tails detected - use bootstrap
          const randomIdx = Math.floor(Math.random() * n);
          pathReturn += returns[randomIdx];
        } else {
          // Near-normal - use parametric with slight adjustment
          const z = this._boxMullerRandom();
          const adjustedReturn = mean + stdDev * z;
          pathReturn += adjustedReturn;
        }
      }

      simulatedReturns.push(pathReturn);
    }

    // Sort and find VaR
    simulatedReturns.sort((a, b) => a - b);
    const varIndex = Math.floor(this.mcSimulations * (1 - confidence));
    const varValue = simulatedReturns[varIndex];

    // CVaR
    const tailReturns = simulatedReturns.slice(0, varIndex + 1);
    const cvarValue = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;

    // Path statistics
    const pathStats = {
      minPath: Math.round(Math.min(...simulatedReturns) * 10000) / 100,
      maxPath: Math.round(Math.max(...simulatedReturns) * 10000) / 100,
      medianPath: Math.round(simulatedReturns[Math.floor(this.mcSimulations / 2)] * 10000) / 100,
      usedBootstrap: kurtosis > 4,
    };

    return {
      var: Math.round(varValue * 10000) / 10000,
      cvar: Math.round(cvarValue * 10000) / 10000,
      pathStats,
    };
  }

  /**
   * Calculate Incremental VaR - how much each position contributes to total VaR
   * @param {Array} positions - Array of {symbol, weight, returns}
   * @param {number} portfolioValue - Total portfolio value
   * @param {number} confidence - Confidence level (e.g., 0.95)
   */
  calculateIncrementalVaR(positions, portfolioValue, confidence = 0.95) {
    if (!positions || positions.length === 0) {
      return { error: 'No positions provided' };
    }

    // Calculate portfolio returns
    const minLength = Math.min(...positions.map(p => p.returns?.length || 0));
    if (minLength < 30) {
      return { error: 'Insufficient return data' };
    }

    const portfolioReturns = [];
    for (let i = 0; i < minLength; i++) {
      let dayReturn = 0;
      for (const pos of positions) {
        dayReturn += pos.weight * (pos.returns[i] || 0);
      }
      portfolioReturns.push(dayReturn);
    }

    // Full portfolio VaR
    const fullVaR = this._historicalVaR(portfolioReturns, confidence, 1);

    // Calculate marginal VaR for each position
    const results = [];

    for (const pos of positions) {
      // Portfolio without this position (reweighted)
      const otherPositions = positions.filter(p => p.symbol !== pos.symbol);
      const totalOtherWeight = otherPositions.reduce((s, p) => s + p.weight, 0);

      if (totalOtherWeight > 0) {
        const excludedReturns = [];
        for (let i = 0; i < minLength; i++) {
          let dayReturn = 0;
          for (const other of otherPositions) {
            dayReturn += (other.weight / totalOtherWeight) * (other.returns[i] || 0);
          }
          excludedReturns.push(dayReturn);
        }

        const excludedVaR = this._historicalVaR(excludedReturns, confidence, 1);
        const incrementalVaR = fullVaR.var - excludedVaR.var;

        results.push({
          symbol: pos.symbol,
          weight: pos.weight,
          incrementalVaR: Math.round(incrementalVaR * 10000) / 100,
          incrementalVaRDollar: Math.round(incrementalVaR * portfolioValue),
          riskContribution: Math.round((incrementalVaR / fullVaR.var) * 10000) / 100,
          isDiversifying: incrementalVaR > 0, // Positive means adding risk
        });
      }
    }

    // Sort by risk contribution
    results.sort((a, b) => b.incrementalVaR - a.incrementalVaR);

    return {
      portfolioVaR: {
        percent: Math.round(fullVaR.var * 10000) / 100,
        dollar: Math.round(fullVaR.var * portfolioValue),
      },
      positionContributions: results,
      largestRiskContributor: results[0]?.symbol,
      bestDiversifier: results[results.length - 1]?.symbol,
    };
  }

  /**
   * Stress test VaR under different scenarios
   */
  stressTestVaR(returns, portfolioValue, scenarios = null) {
    const defaultScenarios = [
      { name: '2008 Crisis', multiplier: 3.0, description: 'Volatility 3x normal' },
      { name: 'Flash Crash', multiplier: 2.0, tailShock: -0.10, description: '10% instant drop' },
      { name: 'COVID March 2020', multiplier: 2.5, description: 'Elevated volatility' },
      { name: 'Moderate Stress', multiplier: 1.5, description: '50% higher volatility' },
    ];

    const testScenarios = scenarios || defaultScenarios;
    const results = [];

    // Base case
    const baseVaR = this._historicalVaR(returns, 0.99, 1);
    results.push({
      scenario: 'Base Case',
      varPercent: Math.round(baseVaR.var * 10000) / 100,
      varDollar: Math.round(baseVaR.var * portfolioValue),
      cvarPercent: Math.round(baseVaR.cvar * 10000) / 100,
      cvarDollar: Math.round(baseVaR.cvar * portfolioValue),
    });

    // Stress scenarios
    for (const scenario of testScenarios) {
      let stressedReturns = returns.map(r => r * scenario.multiplier);

      // Add tail shock if specified
      if (scenario.tailShock) {
        stressedReturns = stressedReturns.map(r => r + (Math.random() < 0.05 ? scenario.tailShock : 0));
      }

      const stressedVaR = this._historicalVaR(stressedReturns, 0.99, 1);

      results.push({
        scenario: scenario.name,
        description: scenario.description,
        varPercent: Math.round(stressedVaR.var * 10000) / 100,
        varDollar: Math.round(stressedVaR.var * portfolioValue),
        cvarPercent: Math.round(stressedVaR.cvar * 10000) / 100,
        cvarDollar: Math.round(stressedVaR.cvar * portfolioValue),
        increaseFromBase: Math.round((stressedVaR.var / baseVaR.var - 1) * 100),
      });
    }

    return {
      portfolioValue,
      stressTests: results,
      worstCase: results.reduce((worst, r) => r.varDollar < worst.varDollar ? r : worst, results[0]),
    };
  }

  /**
   * Generate human-readable summary
   */
  _generateSummary(result, returns) {
    const key95_1d = '95_1d';
    const key99_1d = '99_1d';

    const hist95 = result.historical[key95_1d];
    const hist99 = result.historical[key99_1d];
    const mc99 = result.monteCarlo[key99_1d];

    // Calculate kurtosis for fat tail warning
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n);
    const kurtosis = stdDev > 0 ? returns.reduce((s, r) => s + Math.pow((r - mean) / stdDev, 4), 0) / n : 3;

    return {
      dailyVaR95: `${Math.round(hist95.varPercent * -10000) / 100}%`,
      dailyVaR99: `${Math.round(hist99.varPercent * -10000) / 100}%`,
      dailyCVaR99: `${Math.round(hist99.cvarPercent * -10000) / 100}%`,
      interpretation: `With 95% confidence, daily loss should not exceed ${Math.round(hist95.varDollar * -1).toLocaleString()}. ` +
        `In worst 1% of days, expect average loss of ${Math.round(hist99.cvarDollar * -1).toLocaleString()}.`,
      fatTailWarning: kurtosis > 4
        ? 'WARNING: Fat tails detected. Parametric VaR likely underestimates risk. Use Monte Carlo or Historical.'
        : null,
      methodRecommendation: kurtosis > 4 ? 'Monte Carlo (bootstrap)' : 'Parametric (faster)',
      kurtosis: Math.round(kurtosis * 100) / 100,
    };
  }

  // Helper: Box-Muller transform for normal random numbers
  _boxMullerRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Helper: Approximate inverse normal CDF
  _normalInverse(p) {
    // Rational approximation for inverse normal CDF
    const a = [
      -3.969683028665376e1,
      2.209460984245205e2,
      -2.759285104469687e2,
      1.383577518672690e2,
      -3.066479806614716e1,
      2.506628277459239e0,
    ];
    const b = [
      -5.447609879822406e1,
      1.615858368580409e2,
      -1.556989798598866e2,
      6.680131188771972e1,
      -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3,
      -3.223964580411365e-1,
      -2.400758277161838e0,
      -2.549732539343734e0,
      4.374664141464968e0,
      2.938163982698783e0,
    ];
    const d = [
      7.784695709041462e-3,
      3.224671290700398e-1,
      2.445134137142996e0,
      3.754408661907416e0,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q, r;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
  }
}

module.exports = { VaRCalculator };
