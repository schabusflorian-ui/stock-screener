// src/services/factors/factorExposure.js
// Factor Exposure Analysis - Decompose returns into factor contributions

const { getDatabaseAsync } = require('../../database');

/**
 * FactorExposureAnalyzer - Analyze portfolio factor exposures
 *
 * Decomposes portfolio returns into contributions from:
 * - Market (beta)
 * - Value (book-to-market, earnings yield)
 * - Size (market cap)
 * - Momentum (12-1 month returns)
 * - Quality (profitability, investment)
 * - Volatility (low-vol premium)
 *
 * Key questions answered:
 * - Is alpha real or just factor exposure in disguise?
 * - Which factors are you implicitly betting on?
 * - Is the portfolio crowded in popular factors?
 */

class FactorExposureAnalyzer {
  /**
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.config = {
      lookbackDays: config.lookbackDays || 252, // 1 year
      riskFreeRate: config.riskFreeRate || 0.05, // 5% annual
      minDataPoints: config.minDataPoints || 60, // ~3 months
      ...config
    };

    // Factor definitions (Fama-French style)
    this.factors = [
      'market',      // Market excess return
      'value',       // HML (High minus Low book-to-market)
      'size',        // SMB (Small minus Big)
      'momentum',    // UMD (Up minus Down)
      'quality',     // RMW (Robust minus Weak profitability)
      'investment'   // CMA (Conservative minus Aggressive investment)
    ];

    console.log('📊 Factor Exposure Analyzer initialized');
  }

  /**
   * Calculate factor exposures for a single stock
   * @param {string} symbol Stock symbol
   * @param {number} lookbackDays Analysis period
   * @returns {Object} Factor exposures and statistics
   */
  async analyzeStock(symbol, lookbackDays = null) {
    const database = await getDatabaseAsync();
    const days = lookbackDays || this.config.lookbackDays;

    // Get stock data
    const metricsResult = await database.query(`
      SELECT
        c.id,
        c.symbol,
        c.market_cap,
        c.sector,
        cm.pe_ratio,
        cm.pb_ratio as price_to_book,
        cm.roe,
        cm.net_margin as profit_margin,
        cm.revenue_growth_yoy as revenue_growth,
        cm.debt_to_equity
      FROM companies c
      LEFT JOIN calculated_metrics cm ON cm.company_id = c.id
      WHERE c.symbol = $1
    `, [symbol]);

    const metrics = metricsResult.rows[0];
    if (!metrics) {
      throw new Error(`Company not found: ${symbol}`);
    }

    const returnsResult = await database.query(`
      SELECT
        date as price_date,
        close,
        LAG(close, 1) OVER (ORDER BY date) as prev_close,
        LAG(close, 21) OVER (ORDER BY date) as prev_21d,
        LAG(close, 63) OVER (ORDER BY date) as prev_63d,
        LAG(close, 252) OVER (ORDER BY date) as prev_252d
      FROM daily_prices
      WHERE company_id = (SELECT id FROM companies WHERE symbol = $1)
        AND date >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $2
      ORDER BY date
    `, [symbol, days]);

    const returns = returnsResult.rows;
    if (returns.length < this.config.minDataPoints) {
      throw new Error(`Insufficient price data for ${symbol}`);
    }

    // Calculate daily returns
    const stockReturns = returns
      .filter(r => r.prev_close)
      .map(r => ({
        date: r.price_date,
        return: (r.close - r.prev_close) / r.prev_close,
        mom21d: r.prev_21d ? (r.close - r.prev_21d) / r.prev_21d : null,
        mom252d: r.prev_252d ? (r.close - r.prev_252d) / r.prev_252d : null
      }));

    // Get market returns
    const marketDataResult = await database.query(`
      SELECT
        date as price_date,
        close,
        LAG(close, 1) OVER (ORDER BY date) as prev_close
      FROM daily_prices
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'SPY')
        AND date >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
      ORDER BY date
    `, [days]);

    const marketData = marketDataResult.rows;
    const marketReturns = new Map(
      marketData
        .filter(r => r.prev_close)
        .map(r => [r.price_date, (r.close - r.prev_close) / r.prev_close])
    );

    // Calculate factor scores based on characteristics
    const factorScores = this._calculateFactorScores(metrics);

    // Calculate regression-based exposures
    const regressionResults = await this._runFactorRegression(stockReturns, marketReturns);

    // Calculate factor contributions
    const contributions = this._calculateContributions(
      factorScores,
      regressionResults,
      stockReturns
    );

    return {
      symbol,
      analysisDate: new Date().toISOString().split('T')[0],
      lookbackDays: days,
      dataPoints: stockReturns.length,

      // Characteristic-based factor scores (-1 to +1)
      factorScores,

      // Regression-based exposures (betas)
      exposures: regressionResults.betas,

      // Factor contributions to return
      contributions,

      // Statistical quality
      regressionStats: {
        rSquared: regressionResults.rSquared,
        alpha: regressionResults.alpha,
        alphaAnnualized: regressionResults.alpha * 252,
        residualVol: regressionResults.residualVol,
        informationRatio: regressionResults.informationRatio
      },

      // Interpretation
      interpretation: this._interpretExposures(factorScores, regressionResults)
    };
  }

  /**
   * Analyze factor exposures for a portfolio
   * @param {number} portfolioId Portfolio ID
   * @returns {Object} Portfolio factor analysis
   */
  async analyzePortfolio(portfolioId) {
    const database = await getDatabaseAsync();

    // Get portfolio positions
    const positionsResult = await database.query(`
      SELECT
        pp.symbol,
        pp.quantity,
        pp.current_price,
        pp.quantity * pp.current_price as market_value
      FROM portfolio_positions pp
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);

    const positions = positionsResult.rows;

    if (positions.length === 0) {
      throw new Error('Portfolio has no positions');
    }

    // Calculate total value and weights
    const totalValue = positions.reduce((sum, p) => sum + p.market_value, 0);
    const weights = new Map(
      positions.map(p => [p.symbol, p.market_value / totalValue])
    );

    // Analyze each position
    const positionAnalyses = [];
    const aggregatedScores = {
      value: 0,
      size: 0,
      momentum: 0,
      quality: 0,
      investment: 0
    };
    const aggregatedExposures = {
      market: 0,
      value: 0,
      size: 0,
      momentum: 0,
      quality: 0
    };

    for (const position of positions) {
      try {
        const analysis = await this.analyzeStock(position.symbol);
        const weight = weights.get(position.symbol);

        positionAnalyses.push({
          symbol: position.symbol,
          weight: (weight * 100).toFixed(2) + '%',
          factorScores: analysis.factorScores,
          exposures: analysis.exposures
        });

        // Aggregate weighted scores
        for (const factor of Object.keys(aggregatedScores)) {
          if (analysis.factorScores[factor] !== undefined) {
            aggregatedScores[factor] += weight * analysis.factorScores[factor];
          }
        }

        // Aggregate weighted exposures
        for (const factor of Object.keys(aggregatedExposures)) {
          if (analysis.exposures[factor] !== undefined) {
            aggregatedExposures[factor] += weight * analysis.exposures[factor];
          }
        }
      } catch (err) {
        console.warn(`Could not analyze ${position.symbol}:`, err.message);
      }
    }

    // Calculate factor tilts relative to market
    const factorTilts = this._calculateFactorTilts(aggregatedScores);

    // Estimate factor crowding
    const crowding = this._estimateFactorCrowding(aggregatedScores);

    return {
      portfolioId,
      analysisDate: new Date().toISOString().split('T')[0],
      positionCount: positions.length,
      totalValue,

      // Weighted average factor scores
      factorScores: aggregatedScores,

      // Weighted average factor exposures (betas)
      exposures: aggregatedExposures,

      // Factor tilts vs. market
      factorTilts,

      // Factor crowding assessment
      crowding,

      // Position-level breakdown
      positions: positionAnalyses,

      // Interpretation
      interpretation: this._interpretPortfolioExposures(
        aggregatedScores,
        aggregatedExposures,
        factorTilts,
        crowding
      )
    };
  }

  /**
   * Calculate characteristic-based factor scores
   */
  _calculateFactorScores(metrics) {
    const scores = {};

    // Value score (based on P/B and P/E)
    // Lower = more value
    if (metrics.price_to_book) {
      const pbScore = metrics.price_to_book < 1.5 ? 1 :
                      metrics.price_to_book < 3 ? 0.5 :
                      metrics.price_to_book < 5 ? 0 :
                      metrics.price_to_book < 10 ? -0.5 : -1;

      const peScore = metrics.pe_ratio && metrics.pe_ratio > 0 ?
        (metrics.pe_ratio < 10 ? 1 :
         metrics.pe_ratio < 15 ? 0.5 :
         metrics.pe_ratio < 25 ? 0 :
         metrics.pe_ratio < 40 ? -0.5 : -1) : 0;

      scores.value = (pbScore + peScore) / 2;
    } else {
      scores.value = 0;
    }

    // Size score (based on market cap)
    // Positive = smaller company
    if (metrics.market_cap) {
      scores.size = metrics.market_cap < 2e9 ? 1 :      // Small cap
                    metrics.market_cap < 10e9 ? 0.5 :   // Mid cap
                    metrics.market_cap < 100e9 ? 0 :    // Large cap
                    metrics.market_cap < 500e9 ? -0.5 : // Mega cap
                    -1;                                  // Giant
    } else {
      scores.size = 0;
    }

    // Quality score (based on ROE and profit margin)
    if (metrics.roe !== null || metrics.profit_margin !== null) {
      const roeScore = metrics.roe ?
        (metrics.roe > 25 ? 1 :
         metrics.roe > 15 ? 0.5 :
         metrics.roe > 10 ? 0 :
         metrics.roe > 0 ? -0.5 : -1) : 0;

      const marginScore = metrics.profit_margin ?
        (metrics.profit_margin > 20 ? 1 :
         metrics.profit_margin > 10 ? 0.5 :
         metrics.profit_margin > 5 ? 0 :
         metrics.profit_margin > 0 ? -0.5 : -1) : 0;

      scores.quality = (roeScore + marginScore) / 2;
    } else {
      scores.quality = 0;
    }

    // Investment score (based on revenue growth - proxy for capex intensity)
    // Conservative = low growth/investment
    if (metrics.revenue_growth !== null) {
      scores.investment = metrics.revenue_growth < 5 ? 0.5 :    // Conservative
                          metrics.revenue_growth < 15 ? 0 :     // Moderate
                          metrics.revenue_growth < 30 ? -0.3 :  // Growth
                          -0.5;                                  // Aggressive
    } else {
      scores.investment = 0;
    }

    // Momentum score will be calculated from returns
    scores.momentum = 0; // Placeholder, calculated separately

    return scores;
  }

  /**
   * Run factor regression to get exposure betas
   */
  async _runFactorRegression(stockReturns, marketReturns) {
    const database = await getDatabaseAsync();

    // Align stock and market returns
    const aligned = stockReturns.filter(r => marketReturns.has(r.date));

    if (aligned.length < 30) {
      return {
        betas: { market: 1, value: 0, size: 0, momentum: 0, quality: 0 },
        rSquared: 0,
        alpha: 0,
        residualVol: 0,
        informationRatio: 0
      };
    }

    // Get factor returns for the date range
    const dates = aligned.map(r => r.date);
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const factorReturnsResult = await database.query(`
      SELECT date, mkt_rf, smb, hml, umd, qmj
      FROM daily_factor_returns
      WHERE date >= $1 AND date <= $2
      ORDER BY date
    `, [minDate, maxDate]);

    const factorReturns = factorReturnsResult.rows;

    // Create factor returns map
    const factorMap = new Map();
    factorReturns.forEach(fr => {
      factorMap.set(fr.date, {
        mkt: fr.mkt_rf,
        smb: fr.smb,
        hml: fr.hml,
        umd: fr.umd,
        qmj: fr.qmj
      });
    });

    // Align stock returns with factor returns
    const alignedWithFactors = aligned.filter(r => factorMap.has(r.date));

    // If we don't have enough factor returns, fall back to simple market regression
    if (alignedWithFactors.length < 30) {
      const y = aligned.map(r => r.return);
      const x = aligned.map(r => marketReturns.get(r.date));

      const n = y.length;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

      const marketBeta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const alpha = (sumY - marketBeta * sumX) / n;

      const residuals = y.map((yi, i) => yi - alpha - marketBeta * x[i]);
      const residualVar = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
      const residualVol = Math.sqrt(residualVar) * Math.sqrt(252);

      const yMean = sumY / n;
      const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
      const ssResidual = residuals.reduce((sum, r) => sum + r * r, 0);
      const rSquared = 1 - ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

      return {
        betas: { market: marketBeta, value: 0, size: 0, momentum: 0, quality: 0 },
        rSquared,
        alpha: alpha * 252,
        residualVol,
        informationRatio: residualVol > 0 ? (alpha * 252) / residualVol : 0
      };
    }

    // Prepare data for multi-factor regression
    // Y = alpha + beta_mkt * MKT + beta_smb * SMB + beta_hml * HML + beta_umd * UMD + beta_qmj * QMJ + epsilon
    const y = alignedWithFactors.map(r => r.return);
    const n = y.length;

    // Build factor matrix (each row is [1, mkt, smb, hml, umd, qmj])
    const X = alignedWithFactors.map(r => {
      const factors = factorMap.get(r.date);
      return [1, factors.mkt, factors.smb, factors.hml, factors.umd, factors.qmj];
    });

    // Run multi-factor OLS regression using normal equations: β = (X'X)^-1 X'y
    const betas = this._multipleRegression(X, y);

    if (!betas) {
      // Regression failed, return defaults
      return {
        betas: { market: 1, value: 0, size: 0, momentum: 0, quality: 0 },
        rSquared: 0,
        alpha: 0,
        residualVol: 0,
        informationRatio: 0
      };
    }

    const [alpha, betaMkt, betaSmb, betaHml, betaUmd, betaQmj] = betas;

    // Calculate residuals and R-squared
    const predictions = X.map((xi, i) =>
      xi[0] * alpha + xi[1] * betaMkt + xi[2] * betaSmb + xi[3] * betaHml + xi[4] * betaUmd + xi[5] * betaQmj
    );
    const residuals = y.map((yi, i) => yi - predictions[i]);

    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const ssResidual = residuals.reduce((sum, r) => sum + r * r, 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    const residualVar = ssResidual / (n - 6); // n - k where k = number of parameters
    const residualVol = Math.sqrt(residualVar) * Math.sqrt(252);

    const alphaAnnualized = alpha * 252;
    const informationRatio = residualVol > 0 ? alphaAnnualized / residualVol : 0;

    return {
      betas: {
        market: betaMkt,
        value: betaHml,      // HML (high minus low book/market)
        size: betaSmb,       // SMB (small minus big)
        momentum: betaUmd,   // UMD (up minus down)
        quality: betaQmj     // QMJ (quality minus junk)
      },
      rSquared,
      alpha: alphaAnnualized,
      residualVol,
      informationRatio
    };
  }

  /**
   * Multiple linear regression using normal equations
   * Returns coefficients [intercept, beta1, beta2, ...]
   */
  _multipleRegression(X, y) {
    try {
      const n = X.length;
      const k = X[0].length;

      // Compute X'X (k x k matrix)
      const XtX = Array(k).fill(0).map(() => Array(k).fill(0));
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          for (let row = 0; row < n; row++) {
            XtX[i][j] += X[row][i] * X[row][j];
          }
        }
      }

      // Compute X'y (k x 1 vector)
      const Xty = Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        for (let row = 0; row < n; row++) {
          Xty[i] += X[row][i] * y[row];
        }
      }

      // Solve (X'X)β = X'y using Gaussian elimination
      const betas = this._gaussianElimination(XtX, Xty);
      return betas;
    } catch (e) {
      return null;
    }
  }

  /**
   * Gaussian elimination to solve Ax = b
   */
  _gaussianElimination(A, b) {
    const n = b.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    // Back substitution
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }

    return x;
  }

  /**
   * Calculate factor contributions to return
   */
  _calculateContributions(factorScores, regressionResults, stockReturns) {
    const totalReturn = stockReturns.length > 1
      ? stockReturns.reduce((sum, r) => sum + r.return, 0)
      : 0;

    // Estimate factor contributions
    // This is simplified - real analysis needs factor return data
    const marketContrib = regressionResults.betas.market * (totalReturn * 0.6); // Assume 60% market-driven
    const alphaContrib = totalReturn - marketContrib;

    return {
      total: totalReturn,
      market: marketContrib,
      alpha: alphaContrib,
      factorExplained: marketContrib,
      unexplained: alphaContrib,
      breakdown: {
        marketBeta: (marketContrib * 100).toFixed(2) + '%',
        idiosyncratic: (alphaContrib * 100).toFixed(2) + '%'
      }
    };
  }

  /**
   * Calculate factor tilts relative to market average
   */
  _calculateFactorTilts(scores) {
    // Market neutral is approximately 0 for all factors
    const tilts = {};

    for (const [factor, score] of Object.entries(scores)) {
      if (Math.abs(score) > 0.3) {
        tilts[factor] = {
          direction: score > 0 ? 'overweight' : 'underweight',
          magnitude: Math.abs(score) > 0.6 ? 'strong' : 'moderate',
          score
        };
      } else {
        tilts[factor] = {
          direction: 'neutral',
          magnitude: 'minimal',
          score
        };
      }
    }

    return tilts;
  }

  /**
   * Estimate factor crowding risk
   */
  _estimateFactorCrowding(scores) {
    const crowdedFactors = [];

    // Value and momentum tend to be crowded factors
    if (scores.value > 0.5) {
      crowdedFactors.push({
        factor: 'value',
        risk: 'HIGH',
        note: 'Heavy value tilt - vulnerable to value unwind'
      });
    }

    if (scores.momentum > 0.4) {
      crowdedFactors.push({
        factor: 'momentum',
        risk: 'MODERATE',
        note: 'Momentum exposure - risk of momentum crash'
      });
    }

    if (scores.quality > 0.5) {
      crowdedFactors.push({
        factor: 'quality',
        risk: 'LOW',
        note: 'Quality tilt - historically more defensive'
      });
    }

    if (scores.size > 0.5) {
      crowdedFactors.push({
        factor: 'size',
        risk: 'MODERATE',
        note: 'Small cap tilt - liquidity risk in stress'
      });
    }

    const overallRisk = crowdedFactors.filter(f => f.risk === 'HIGH').length > 0 ? 'HIGH' :
                        crowdedFactors.filter(f => f.risk === 'MODERATE').length > 1 ? 'MODERATE' :
                        'LOW';

    return {
      overallRisk,
      crowdedFactors,
      diversificationScore: this._calculateDiversificationScore(scores)
    };
  }

  /**
   * Calculate factor diversification score
   */
  _calculateDiversificationScore(scores) {
    // Penalize concentrated factor bets
    const scoreValues = Object.values(scores).filter(s => s !== undefined);
    if (scoreValues.length === 0) return 50;

    const avgAbsScore = scoreValues.reduce((sum, s) => sum + Math.abs(s), 0) / scoreValues.length;

    // Higher score = more diversified (less concentrated factor bets)
    return Math.max(0, Math.min(100, (1 - avgAbsScore) * 100));
  }

  /**
   * Interpret single stock exposures
   */
  _interpretExposures(factorScores, regressionResults) {
    const interpretations = [];

    // Market beta interpretation
    const beta = regressionResults.betas.market;
    if (beta > 1.3) {
      interpretations.push('High market sensitivity (beta > 1.3) - amplifies market moves');
    } else if (beta < 0.7) {
      interpretations.push('Defensive stock (beta < 0.7) - less sensitive to market');
    }

    // Alpha interpretation
    if (regressionResults.alpha > 0.0002) {
      interpretations.push(`Positive alpha detected (${(regressionResults.alpha * 252 * 100).toFixed(2)}% annualized)`);
    } else if (regressionResults.alpha < -0.0002) {
      interpretations.push(`Negative alpha warning (${(regressionResults.alpha * 252 * 100).toFixed(2)}% annualized)`);
    }

    // Factor tilts
    if (factorScores.value > 0.5) {
      interpretations.push('Strong value characteristics (low P/B, P/E)');
    } else if (factorScores.value < -0.5) {
      interpretations.push('Growth/expensive characteristics (high P/B, P/E)');
    }

    if (factorScores.quality > 0.5) {
      interpretations.push('High quality metrics (strong ROE, margins)');
    } else if (factorScores.quality < -0.3) {
      interpretations.push('Lower quality metrics - monitor fundamentals');
    }

    // R-squared interpretation
    if (regressionResults.rSquared < 0.3) {
      interpretations.push('Low market correlation - idiosyncratic risk dominates');
    } else if (regressionResults.rSquared > 0.8) {
      interpretations.push('High market correlation - returns largely explained by market');
    }

    return interpretations;
  }

  /**
   * Interpret portfolio-level exposures
   */
  _interpretPortfolioExposures(scores, exposures, tilts, crowding) {
    const interpretations = [];

    // Overall beta
    if (exposures.market > 1.2) {
      interpretations.push('Portfolio is leveraged to market (beta > 1.2)');
    } else if (exposures.market < 0.8) {
      interpretations.push('Portfolio is defensive relative to market (beta < 0.8)');
    }

    // Factor tilts
    const strongTilts = Object.entries(tilts)
      .filter(([_, t]) => t.magnitude === 'strong')
      .map(([f, t]) => `${t.direction} ${f}`);

    if (strongTilts.length > 0) {
      interpretations.push(`Strong factor tilts: ${strongTilts.join(', ')}`);
    }

    // Crowding risk
    if (crowding.overallRisk === 'HIGH') {
      interpretations.push('WARNING: High factor crowding risk - vulnerable to factor rotations');
    }

    // Diversification
    if (crowding.diversificationScore < 40) {
      interpretations.push('Concentrated factor bets detected - consider diversifying');
    } else if (crowding.diversificationScore > 70) {
      interpretations.push('Well-diversified factor exposure');
    }

    // Alpha assessment
    if (exposures.market > 0.9 && exposures.market < 1.1 && scores.value < 0.2 && scores.value > -0.2) {
      interpretations.push('Portfolio closely tracks market - limited alpha opportunity');
    }

    return interpretations;
  }

  /**
   * Get factor exposure summary for quick assessment
   */
  async getQuickSummary(symbol) {
    try {
      const analysis = await this.analyzeStock(symbol);

      // Determine dominant factor and style
      const factorScores = analysis.factorScores;
      const factors = ['value', 'quality', 'momentum', 'size'];
      let dominantFactor = null;
      let maxScore = 0;

      for (const factor of factors) {
        const score = Math.abs(factorScores[factor] || 0);
        if (score > maxScore) {
          maxScore = score;
          dominantFactor = factor.charAt(0).toUpperCase() + factor.slice(1);
        }
      }

      // Determine investment style
      let style = 'blend';
      const valueScore = factorScores.value || 0;
      const growthScore = -(factorScores.value || 0); // Growth is inverse of value
      const qualityScore = factorScores.quality || 0;

      if (valueScore > 0.3) {
        style = qualityScore > 0.3 ? 'quality-value' : 'deep-value';
      } else if (growthScore > 0.3) {
        style = qualityScore > 0.3 ? 'quality-growth' : 'growth';
      } else if (qualityScore > 0.3) {
        style = 'quality';
      }

      return {
        symbol,
        marketBeta: analysis.exposures.market.toFixed(2),
        dominantFactor,
        style,
        factorProfile: {
          value: this._scoreToLabel(analysis.factorScores.value),
          size: this._scoreToLabel(analysis.factorScores.size),
          quality: this._scoreToLabel(analysis.factorScores.quality),
          momentum: this._scoreToLabel(analysis.factorScores.momentum)
        },
        alphaAnnualized: (analysis.regressionStats.alphaAnnualized * 100).toFixed(2) + '%',
        rSquared: (analysis.regressionStats.rSquared * 100).toFixed(1) + '%'
      };
    } catch (err) {
      return { symbol, error: err.message };
    }
  }

  _scoreToLabel(score) {
    if (score > 0.5) return 'HIGH';
    if (score > 0.2) return 'MODERATE';
    if (score > -0.2) return 'NEUTRAL';
    if (score > -0.5) return 'LOW';
    return 'VERY_LOW';
  }
}

module.exports = {
  FactorExposureAnalyzer
};
