// src/services/portfolio/efficientFrontier.js
// Markowitz Mean-Variance Optimization with Efficient Frontier
// Provides optimal portfolio weights given expected returns and covariance

/**
 * Efficient Frontier Calculator
 * Implements Markowitz Mean-Variance Optimization with constraints
 */
class EfficientFrontierCalculator {
  constructor(options = {}) {
    this.riskFreeRate = options.riskFreeRate || 0.05; // 5% annual
    this.frontierPoints = options.frontierPoints || 50;
    this.maxIterations = options.maxIterations || 1000;
    this.tolerance = options.tolerance || 1e-8;
  }

  /**
   * Calculate the efficient frontier
   * @param {Array} assets - Array of {symbol, expectedReturn, returns}
   * @param {Object} constraints - {minWeight, maxWeight, sectorLimits, etc}
   */
  calculateFrontier(assets, constraints = {}) {
    if (!assets || assets.length < 2) {
      return { error: 'Need at least 2 assets for optimization' };
    }

    const n = assets.length;
    const minWeight = constraints.minWeight || 0;
    const maxWeight = constraints.maxWeight || 1;
    const longOnly = constraints.longOnly !== false;

    // Calculate expected returns and covariance matrix
    const { expectedReturns, covMatrix } = this._prepareInputs(assets);

    // Find min and max return portfolios
    const minReturnPort = this._minimumVariancePortfolio(expectedReturns, covMatrix, minWeight, maxWeight);
    const maxReturnPort = this._maximumReturnPortfolio(expectedReturns, minWeight, maxWeight);

    // Generate efficient frontier points
    const frontier = [];
    const returnRange = maxReturnPort.expectedReturn - minReturnPort.expectedReturn;

    for (let i = 0; i < this.frontierPoints; i++) {
      const targetReturn = minReturnPort.expectedReturn + (returnRange * i / (this.frontierPoints - 1));

      const portfolio = this._optimizeForReturn(
        expectedReturns,
        covMatrix,
        targetReturn,
        minWeight,
        maxWeight
      );

      if (portfolio) {
        const sharpe = (portfolio.expectedReturn - this.riskFreeRate) / portfolio.volatility;
        frontier.push({
          ...portfolio,
          sharpeRatio: Math.round(sharpe * 1000) / 1000,
          weights: portfolio.weights.map((w, idx) => ({
            symbol: assets[idx].symbol,
            weight: Math.round(w * 10000) / 10000,
          })),
        });
      }
    }

    // Find key portfolios
    const minVariancePortfolio = frontier.reduce((min, p) =>
      p.volatility < min.volatility ? p : min, frontier[0]);

    const maxSharpePortfolio = frontier.reduce((max, p) =>
      p.sharpeRatio > max.sharpeRatio ? p : max, frontier[0]);

    // Calculate Capital Market Line
    const cml = this._calculateCML(maxSharpePortfolio);

    return {
      frontier,
      keyPortfolios: {
        minimumVariance: minVariancePortfolio,
        maximumSharpe: maxSharpePortfolio,
        maximumReturn: frontier[frontier.length - 1],
      },
      capitalMarketLine: cml,
      inputs: {
        assets: assets.map(a => a.symbol),
        expectedReturns: expectedReturns.map(r => Math.round(r * 10000) / 100),
        correlationMatrix: this._covToCorr(covMatrix),
      },
    };
  }

  /**
   * Find the optimal portfolio given a target volatility
   */
  optimizeForVolatility(assets, targetVolatility, constraints = {}) {
    const { expectedReturns, covMatrix } = this._prepareInputs(assets);
    const minWeight = constraints.minWeight || 0;
    const maxWeight = constraints.maxWeight || 1;

    // Binary search on return to find target volatility
    let lowReturn = Math.min(...expectedReturns);
    let highReturn = Math.max(...expectedReturns);

    for (let iter = 0; iter < 50; iter++) {
      const midReturn = (lowReturn + highReturn) / 2;
      const portfolio = this._optimizeForReturn(expectedReturns, covMatrix, midReturn, minWeight, maxWeight);

      if (!portfolio) break;

      if (Math.abs(portfolio.volatility - targetVolatility) < 0.001) {
        return {
          ...portfolio,
          weights: portfolio.weights.map((w, idx) => ({
            symbol: assets[idx].symbol,
            weight: Math.round(w * 10000) / 10000,
          })),
        };
      }

      if (portfolio.volatility < targetVolatility) {
        lowReturn = midReturn;
      } else {
        highReturn = midReturn;
      }
    }

    return { error: 'Could not find portfolio with target volatility' };
  }

  /**
   * Optimize for maximum Sharpe ratio
   */
  optimizeForSharpe(assets, constraints = {}) {
    const frontier = this.calculateFrontier(assets, constraints);
    if (frontier.error) return frontier;
    return frontier.keyPortfolios.maximumSharpe;
  }

  /**
   * Optimize for minimum variance
   */
  optimizeForMinVariance(assets, constraints = {}) {
    const { expectedReturns, covMatrix } = this._prepareInputs(assets);
    const minWeight = constraints.minWeight || 0;
    const maxWeight = constraints.maxWeight || 1;

    const result = this._minimumVariancePortfolio(expectedReturns, covMatrix, minWeight, maxWeight);

    return {
      ...result,
      weights: result.weights.map((w, idx) => ({
        symbol: assets[idx].symbol,
        weight: Math.round(w * 10000) / 10000,
      })),
    };
  }

  /**
   * Black-Litterman model - combine market equilibrium with views
   * @param {Array} assets - Asset data
   * @param {Array} views - Array of {asset, expectedReturn, confidence}
   * @param {Object} marketCaps - {symbol: marketCap} for equilibrium weights
   */
  blackLitterman(assets, views, marketCaps = {}) {
    const { expectedReturns, covMatrix } = this._prepareInputs(assets);
    const n = assets.length;

    // Calculate market cap weights (if not provided, use equal)
    const totalMarketCap = Object.values(marketCaps).reduce((s, v) => s + v, 0) || n;
    const marketWeights = assets.map(a => (marketCaps[a.symbol] || 1) / totalMarketCap);

    // Implied equilibrium returns (reverse optimization)
    const delta = 2.5; // Risk aversion coefficient
    const equilibriumReturns = this._matVecMult(covMatrix, marketWeights).map(r => r * delta);

    // Tau - scaling factor for uncertainty in equilibrium
    const tau = 0.05;

    // Build views matrix P and view returns Q
    const P = [];
    const Q = [];
    const omega = []; // View uncertainty

    for (const view of views) {
      const assetIdx = assets.findIndex(a => a.symbol === view.asset);
      if (assetIdx === -1) continue;

      const pRow = new Array(n).fill(0);
      pRow[assetIdx] = 1;
      P.push(pRow);
      Q.push(view.expectedReturn);

      // Uncertainty based on confidence
      const uncertainty = (1 - view.confidence) * covMatrix[assetIdx][assetIdx] * tau;
      omega.push(uncertainty);
    }

    if (P.length === 0) {
      // No views - return equilibrium
      return {
        blendedReturns: equilibriumReturns.map(r => Math.round(r * 10000) / 100),
        weights: marketWeights.map((w, idx) => ({
          symbol: assets[idx].symbol,
          weight: Math.round(w * 10000) / 10000,
        })),
        source: 'equilibrium (no views provided)',
      };
    }

    // Black-Litterman formula
    // E[R] = [(τΣ)^-1 + P'Ω^-1P]^-1 × [(τΣ)^-1π + P'Ω^-1Q]

    // Simplified: blend equilibrium with views based on confidence
    const blendedReturns = equilibriumReturns.map((eqRet, idx) => {
      const viewIdx = P.findIndex(row => row[idx] === 1);
      if (viewIdx !== -1) {
        const viewRet = Q[viewIdx];
        const confidence = views[viewIdx].confidence;
        return eqRet * (1 - confidence) + viewRet * confidence;
      }
      return eqRet;
    });

    // Optimize with blended returns
    const modifiedAssets = assets.map((a, idx) => ({
      ...a,
      expectedReturn: blendedReturns[idx],
    }));

    const result = this.optimizeForSharpe(modifiedAssets);

    return {
      blendedReturns: blendedReturns.map(r => Math.round(r * 10000) / 100),
      equilibriumReturns: equilibriumReturns.map(r => Math.round(r * 10000) / 100),
      ...result,
      views: views.map(v => ({
        asset: v.asset,
        viewReturn: Math.round(v.expectedReturn * 10000) / 100,
        confidence: v.confidence,
      })),
    };
  }

  // ============================================
  // INTERNAL OPTIMIZATION METHODS
  // ============================================

  _prepareInputs(assets) {
    const n = assets.length;

    // Use provided expected returns or calculate from historical
    const expectedReturns = assets.map(a => {
      if (a.expectedReturn !== undefined) return a.expectedReturn;
      if (a.returns && a.returns.length > 0) {
        return a.returns.reduce((s, r) => s + r, 0) / a.returns.length * 252; // Annualized
      }
      return 0.10; // Default 10%
    });

    // Calculate covariance matrix from returns
    const minLength = Math.min(...assets.filter(a => a.returns).map(a => a.returns.length));
    const covMatrix = [];

    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (assets[i].returns && assets[j].returns) {
          const cov = this._covariance(
            assets[i].returns.slice(0, minLength),
            assets[j].returns.slice(0, minLength)
          ) * 252; // Annualize
          covMatrix[i][j] = cov;
        } else {
          covMatrix[i][j] = i === j ? 0.04 : 0.01; // Default values
        }
      }
    }

    return { expectedReturns, covMatrix };
  }

  _covariance(x, y) {
    const n = Math.min(x.length, y.length);
    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0;
    for (let i = 0; i < n; i++) {
      cov += (x[i] - meanX) * (y[i] - meanY);
    }
    return cov / (n - 1);
  }

  _minimumVariancePortfolio(expectedReturns, covMatrix, minWeight, maxWeight) {
    const n = expectedReturns.length;

    // Start with equal weights
    let weights = new Array(n).fill(1 / n);

    // Gradient descent for minimum variance
    const lr = 0.01;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Gradient of variance w.r.t. weights: 2 * Σ * w
      const gradient = this._matVecMult(covMatrix, weights).map(g => g * 2);

      // Update weights
      const newWeights = weights.map((w, i) => {
        let updated = w - lr * gradient[i];
        updated = Math.max(minWeight, Math.min(maxWeight, updated));
        return updated;
      });

      // Normalize to sum to 1
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);

      // Check convergence
      const change = Math.max(...gradient.map(Math.abs));
      if (change < this.tolerance) break;
    }

    const volatility = Math.sqrt(this._portfolioVariance(weights, covMatrix));
    const expectedReturn = this._portfolioReturn(weights, expectedReturns);

    return {
      weights,
      volatility: Math.round(volatility * 10000) / 10000,
      expectedReturn: Math.round(expectedReturn * 10000) / 10000,
    };
  }

  _maximumReturnPortfolio(expectedReturns, minWeight, maxWeight) {
    const n = expectedReturns.length;
    const weights = new Array(n).fill(minWeight);

    // Allocate to highest return asset
    const maxReturnIdx = expectedReturns.indexOf(Math.max(...expectedReturns));
    const remainingWeight = 1 - minWeight * (n - 1);
    weights[maxReturnIdx] = Math.min(maxWeight, remainingWeight);

    // Normalize
    const sum = weights.reduce((a, b) => a + b, 0);
    const normalized = weights.map(w => w / sum);

    return {
      weights: normalized,
      expectedReturn: Math.max(...expectedReturns),
    };
  }

  _optimizeForReturn(expectedReturns, covMatrix, targetReturn, minWeight, maxWeight) {
    const n = expectedReturns.length;

    // Start with weights proportional to expected returns
    let weights = expectedReturns.map(r => Math.max(0, r));
    const sumW = weights.reduce((a, b) => a + b, 0);
    weights = sumW > 0 ? weights.map(w => w / sumW) : new Array(n).fill(1 / n);

    // Lagrangian optimization with penalty for return constraint
    const lr = 0.01;
    const returnPenalty = 100;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const currentReturn = this._portfolioReturn(weights, expectedReturns);
      const returnGap = currentReturn - targetReturn;

      // Gradient = 2Σw + λ(r - target)*μ
      const varGradient = this._matVecMult(covMatrix, weights).map(g => g * 2);
      const returnGradient = expectedReturns.map(r => -returnPenalty * returnGap * r);

      const gradient = varGradient.map((g, i) => g + returnGradient[i]);

      // Update
      const newWeights = weights.map((w, i) => {
        let updated = w - lr * gradient[i];
        updated = Math.max(minWeight, Math.min(maxWeight, updated));
        return updated;
      });

      // Normalize
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);

      if (Math.abs(returnGap) < 0.001) break;
    }

    const volatility = Math.sqrt(this._portfolioVariance(weights, covMatrix));
    const expectedReturnActual = this._portfolioReturn(weights, expectedReturns);

    return {
      weights,
      volatility: Math.round(volatility * 10000) / 10000,
      expectedReturn: Math.round(expectedReturnActual * 10000) / 10000,
    };
  }

  _portfolioVariance(weights, covMatrix) {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    return variance;
  }

  _portfolioReturn(weights, expectedReturns) {
    return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
  }

  _matVecMult(matrix, vector) {
    return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
  }

  _covToCorr(covMatrix) {
    const n = covMatrix.length;
    const stdDevs = covMatrix.map((row, i) => Math.sqrt(row[i]));
    const corrMatrix = [];

    for (let i = 0; i < n; i++) {
      corrMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        corrMatrix[i][j] = Math.round(covMatrix[i][j] / (stdDevs[i] * stdDevs[j]) * 100) / 100;
      }
    }
    return corrMatrix;
  }

  _calculateCML(tangencyPortfolio) {
    // Capital Market Line: E(R) = Rf + (E(Rm) - Rf) / σm * σ
    const slope = (tangencyPortfolio.expectedReturn - this.riskFreeRate) / tangencyPortfolio.volatility;

    return {
      riskFreeRate: this.riskFreeRate,
      slope: Math.round(slope * 1000) / 1000,
      tangencyPortfolio: {
        expectedReturn: tangencyPortfolio.expectedReturn,
        volatility: tangencyPortfolio.volatility,
      },
      equation: `E(R) = ${(this.riskFreeRate * 100).toFixed(1)}% + ${slope.toFixed(2)} × σ`,
    };
  }
}

module.exports = { EfficientFrontierCalculator };
