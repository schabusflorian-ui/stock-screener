// src/services/factors/factorAttribution.js
// Factor Attribution System - Asness/AQR-inspired factor decomposition
// Decomposes portfolio returns into factor contributions to identify true alpha

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * FactorAttribution - Fama-French style factor decomposition
 *
 * Implements:
 * - Daily factor return calculation (MKT, SMB, HML, UMD, QMJ, BAB)
 * - Rolling regression for factor exposure
 * - Return attribution to identify alpha sources
 */
class FactorAttribution {
  /**
   * Constructor - no longer takes db parameter
   */
  constructor() {
    this._initializeTables();
    console.log('📊 FactorAttribution initialized');
  }

  async _initializeTables() {
    const database = await getDatabaseAsync();
    const isPostgres = isUsingPostgres();
    const idType = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';

    await database.query(`
      CREATE TABLE IF NOT EXISTS daily_factor_returns (
        id ${idType},
        date TEXT NOT NULL UNIQUE,
        mkt_rf DOUBLE PRECISION,
        smb DOUBLE PRECISION,
        hml DOUBLE PRECISION,
        umd DOUBLE PRECISION,
        qmj DOUBLE PRECISION,
        bab DOUBLE PRECISION,
        rf DOUBLE PRECISION,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await database.query(`
      CREATE TABLE IF NOT EXISTS backtest_factor_exposures (
        id ${idType},
        backtest_id INTEGER,
        date TEXT NOT NULL,
        window_days INTEGER,
        alpha_daily DOUBLE PRECISION,
        alpha_annualized DOUBLE PRECISION,
        alpha_tstat DOUBLE PRECISION,
        beta_mkt DOUBLE PRECISION,
        beta_smb DOUBLE PRECISION,
        beta_hml DOUBLE PRECISION,
        beta_umd DOUBLE PRECISION,
        beta_qmj DOUBLE PRECISION,
        beta_bab DOUBLE PRECISION,
        r_squared DOUBLE PRECISION,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async _getSPYPrices(date, limit) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT dp.date, dp.close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'SPY' AND dp.date <= $1
      ORDER BY dp.date DESC
      LIMIT $2
    `, [date, limit]);
    return result.rows;
  }

  async _getStocksByMarketCap() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT c.id, c.symbol, c.market_cap
      FROM companies c
      WHERE c.market_cap > 0
      ORDER BY c.market_cap DESC
    `);
    return result.rows;
  }

  async _getPriceHistory(companyId, date, limit) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = $1 AND date <= $2
      ORDER BY date DESC
      LIMIT $3
    `, [companyId, date, limit]);
    return result.rows;
  }

  async _getMetrics(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT pe_ratio, pb_ratio, roe, debt_to_equity
      FROM calculated_metrics
      WHERE company_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [companyId]);
    return result.rows[0];
  }

  async _storeFactorReturns(date, mkt_rf, smb, hml, umd, qmj, bab, rf) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO daily_factor_returns (
        date, mkt_rf, smb, hml, umd, qmj, bab, rf
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (date) DO UPDATE SET
        mkt_rf = EXCLUDED.mkt_rf,
        smb = EXCLUDED.smb,
        hml = EXCLUDED.hml,
        umd = EXCLUDED.umd,
        qmj = EXCLUDED.qmj,
        bab = EXCLUDED.bab,
        rf = EXCLUDED.rf
    `, [date, mkt_rf, smb, hml, umd, qmj, bab, rf]);
  }

  async _storeExposures(backtestId, date, windowDays, alphaDaily, alphaAnnualized, alphaTstat, betaMkt, betaSmb, betaHml, betaUmd, betaQmj, betaBab, rSquared) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO backtest_factor_exposures (
        backtest_id, date, window_days, alpha_daily, alpha_annualized,
        alpha_tstat, beta_mkt, beta_smb, beta_hml, beta_umd, beta_qmj, beta_bab, r_squared
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [backtestId, date, windowDays, alphaDaily, alphaAnnualized, alphaTstat, betaMkt, betaSmb, betaHml, betaUmd, betaQmj, betaBab, rSquared]);
  }

  async _getFactorReturns(startDate, endDate) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM daily_factor_returns
      WHERE date BETWEEN $1 AND $2
      ORDER BY date ASC
    `, [startDate, endDate]);
    return result.rows;
  }

  /**
   * Calculate daily factor returns for a given date
   * @param {string} date - Date to calculate factors for
   * @returns {Object} Factor returns
   */
  async calculateDailyFactorReturns(date) {
    // Get market return (SPY as proxy)
    const mktReturn = await this._calculateMarketReturn(date);

    // Get SMB (Small minus Big)
    const smbReturn = await this._calculateSMB(date);

    // Get HML (High minus Low book/market)
    const hmlReturn = await this._calculateHML(date);

    // Get UMD (Up minus Down momentum - 12-1 month)
    const umdReturn = await this._calculateUMD(date);

    // Get QMJ (Quality minus Junk)
    const qmjReturn = await this._calculateQMJ(date);

    // Get BAB (Betting Against Beta)
    const babReturn = await this._calculateBAB(date);

    // Risk-free rate approximation (0.02% daily ≈ 5% annual)
    const rf = 0.0002;

    const factors = {
      date,
      mkt_rf: mktReturn - rf,
      smb: smbReturn,
      hml: hmlReturn,
      umd: umdReturn,
      qmj: qmjReturn,
      bab: babReturn,
      rf
    };

    // Store to database
    await this._storeFactorReturns(
      date, factors.mkt_rf, factors.smb, factors.hml,
      factors.umd, factors.qmj, factors.bab, factors.rf
    );

    return factors;
  }

  async _calculateMarketReturn(date) {
    const prices = await this._getSPYPrices(date, 2);
    if (prices.length < 2) return 0;
    return (prices[0].price - prices[1].price) / prices[1].price;
  }

  async _calculateSMB(date) {
    // Small minus Big: return of small cap - return of large cap
    const stocks = await this._getStocksByMarketCap();
    if (stocks.length < 20) return 0;

    const quintile = Math.floor(stocks.length / 5);
    const smallCap = stocks.slice(-quintile); // Bottom 20%
    const largeCap = stocks.slice(0, quintile); // Top 20%

    const smallReturn = await this._calculatePortfolioReturn(smallCap, date);
    const largeReturn = await this._calculatePortfolioReturn(largeCap, date);

    return smallReturn - largeReturn;
  }

  async _calculateHML(date) {
    // High minus Low book/market (value)
    const stocks = await this._getStocksByMarketCap();

    // Score by book/market (inverse of P/B)
    const scoredPromises = stocks.map(async (s) => {
      const metrics = await this._getMetrics(s.id);
      const pbRatio = metrics?.pb_ratio || 2;
      return { ...s, bookMarket: 1 / Math.max(pbRatio, 0.1) };
    });
    const scored = (await Promise.all(scoredPromises)).filter(s => s.bookMarket > 0);

    scored.sort((a, b) => b.bookMarket - a.bookMarket);

    const quintile = Math.floor(scored.length / 5);
    const highBM = scored.slice(0, quintile); // Value stocks
    const lowBM = scored.slice(-quintile); // Growth stocks

    const valueReturn = await this._calculatePortfolioReturn(highBM, date);
    const growthReturn = await this._calculatePortfolioReturn(lowBM, date);

    return valueReturn - growthReturn;
  }

  async _calculateUMD(date) {
    // Up minus Down: 12-1 month momentum (SKIP MOST RECENT MONTH)
    const allStocks = await this._getStocksByMarketCap();
    const stocks = allStocks.slice(0, 500); // Top 500

    const scoredPromises = stocks.map(async (s) => {
      const prices = await this._getPriceHistory(s.id, date, 270);
      if (prices.length < 250) return null;

      // 12 month return EXCLUDING last month
      const price1MonthAgo = prices[21]?.price; // ~1 month ago
      const price12MonthsAgo = prices[252]?.price || prices[prices.length - 1]?.price;

      if (!price1MonthAgo || !price12MonthsAgo) return null;

      const momentum = (price1MonthAgo - price12MonthsAgo) / price12MonthsAgo;
      return { ...s, momentum };
    });
    const scored = (await Promise.all(scoredPromises)).filter(Boolean);

    scored.sort((a, b) => b.momentum - a.momentum);

    const quintile = Math.floor(scored.length / 5);
    const winners = scored.slice(0, quintile);
    const losers = scored.slice(-quintile);

    const winnerReturn = await this._calculatePortfolioReturn(winners, date);
    const loserReturn = await this._calculatePortfolioReturn(losers, date);

    return winnerReturn - loserReturn;
  }

  async _calculateQMJ(date) {
    // Quality minus Junk: high quality - low quality
    const allStocks = await this._getStocksByMarketCap();
    const stocks = allStocks.slice(0, 500);

    const scoredPromises = stocks.map(async (s) => {
      const metrics = await this._getMetrics(s.id);
      if (!metrics) return null;

      // Quality score: high ROE, low leverage
      const roe = metrics.roe || 0;
      const debtEquity = metrics.debt_to_equity || 1;

      const qualityScore = roe * 10 - debtEquity;
      return { ...s, qualityScore };
    });
    const scored = (await Promise.all(scoredPromises)).filter(Boolean);

    scored.sort((a, b) => b.qualityScore - a.qualityScore);

    const quintile = Math.floor(scored.length / 5);
    const quality = scored.slice(0, quintile);
    const junk = scored.slice(-quintile);

    const qualityReturn = await this._calculatePortfolioReturn(quality, date);
    const junkReturn = await this._calculatePortfolioReturn(junk, date);

    return qualityReturn - junkReturn;
  }

  async _calculateBAB(date) {
    // Betting Against Beta: low beta - high beta (leveraged)
    const allStocks = await this._getStocksByMarketCap();
    const stocks = allStocks.slice(0, 500);

    const scoredPromises = stocks.map(async (s) => {
      const prices = await this._getPriceHistory(s.id, date, 252);
      if (prices.length < 60) return null;

      // Calculate beta (simplified)
      const returns = [];
      for (let i = 1; i < Math.min(prices.length, 63); i++) {
        returns.push((prices[i - 1].price - prices[i].price) / prices[i].price);
      }

      const volatility = this._std(returns);
      const beta = volatility / 0.01; // Rough beta estimate

      return { ...s, beta };
    });
    const scored = (await Promise.all(scoredPromises)).filter(Boolean);

    scored.sort((a, b) => a.beta - b.beta);

    const quintile = Math.floor(scored.length / 5);
    const lowBeta = scored.slice(0, quintile);
    const highBeta = scored.slice(-quintile);

    const lowBetaReturn = await this._calculatePortfolioReturn(lowBeta, date);
    const highBetaReturn = await this._calculatePortfolioReturn(highBeta, date);

    // BAB is leveraged low beta minus deleveraged high beta
    return lowBetaReturn * 1.5 - highBetaReturn * 0.75;
  }

  async _calculatePortfolioReturn(stocks, date) {
    if (stocks.length === 0) return 0;

    let totalReturn = 0;
    let count = 0;

    const returnsPromises = stocks.map(async (stock) => {
      const prices = await this._getPriceHistory(stock.id, date, 2);
      if (prices.length >= 2) {
        const ret = (prices[0].price - prices[1].price) / prices[1].price;
        return { valid: true, ret };
      }
      return { valid: false };
    });

    const returns = await Promise.all(returnsPromises);

    for (const result of returns) {
      if (result.valid) {
        totalReturn += result.ret;
        count++;
      }
    }

    return count > 0 ? totalReturn / count : 0;
  }

  /**
   * Calculate portfolio factor exposures using rolling regression
   * @param {Array} portfolioReturns - Array of {date, return}
   * @param {number} window - Regression window in days
   * @returns {Object} Factor exposures and alpha
   */
  async calculatePortfolioFactorExposure(portfolioReturns, window = 63) {
    if (portfolioReturns.length < window) {
      return { error: 'Insufficient data for regression' };
    }

    // Get factor returns for the period
    const startDate = portfolioReturns[0].date;
    const endDate = portfolioReturns[portfolioReturns.length - 1].date;
    const factorData = await this._getFactorReturns(startDate, endDate);

    if (factorData.length < window) {
      // Calculate missing factor returns
      for (const pr of portfolioReturns) {
        try {
          await this.calculateDailyFactorReturns(pr.date);
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Align portfolio returns with factor returns
    const aligned = this._alignData(portfolioReturns, factorData);
    if (aligned.y.length < 30) {
      return { error: 'Insufficient aligned data' };
    }

    // Run multiple regression
    const regression = this._multipleRegression(aligned.y, aligned.X);

    const dailyAlpha = regression.coefficients[0];
    const annualizedAlpha = dailyAlpha * 252 * 100;

    return {
      alpha: {
        daily: dailyAlpha,
        annualized: annualizedAlpha,
        tStat: regression.tStats[0],
        pValue: regression.pValues[0],
        isSignificant: Math.abs(regression.tStats[0]) > 2
      },
      factorLoadings: {
        mkt: regression.coefficients[1],
        smb: regression.coefficients[2],
        hml: regression.coefficients[3],
        umd: regression.coefficients[4],
        qmj: regression.coefficients[5],
        bab: regression.coefficients[6]
      },
      rSquared: regression.rSquared,
      residualVol: this._std(regression.residuals) * Math.sqrt(252),
      informationRatio: annualizedAlpha / (this._std(regression.residuals) * Math.sqrt(252) * 100),
      observations: aligned.y.length
    };
  }

  _alignData(portfolioReturns, factorData) {
    const factorMap = new Map(factorData.map(f => [f.date, f]));
    const y = [];
    const X = [];

    for (const pr of portfolioReturns) {
      const factors = factorMap.get(pr.date);
      if (factors) {
        y.push(pr.return - factors.rf); // Excess return
        X.push([
          1, // Intercept
          factors.mkt_rf,
          factors.smb,
          factors.hml,
          factors.umd,
          factors.qmj,
          factors.bab
        ]);
      }
    }

    return { y, X };
  }

  /**
   * Decompose returns into factor contributions
   * @param {number} portfolioReturn - Total portfolio return
   * @param {Object} factorExposures - Factor loadings
   * @param {Object} factorReturns - Period factor returns
   * @returns {Object} Return attribution
   */
  decomposeReturns(portfolioReturn, factorExposures, factorReturns) {
    const contributions = {
      mkt: factorExposures.mkt * factorReturns.mkt_rf,
      smb: factorExposures.smb * factorReturns.smb,
      hml: factorExposures.hml * factorReturns.hml,
      umd: factorExposures.umd * factorReturns.umd,
      qmj: factorExposures.qmj * factorReturns.qmj,
      bab: factorExposures.bab * factorReturns.bab
    };

    const factorContribution = Object.values(contributions).reduce((a, b) => a + b, 0);
    const alpha = portfolioReturn - factorContribution;

    const totalAbs = Math.abs(portfolioReturn) || 1;
    const percentages = {
      mkt: (contributions.mkt / totalAbs) * 100,
      smb: (contributions.smb / totalAbs) * 100,
      hml: (contributions.hml / totalAbs) * 100,
      umd: (contributions.umd / totalAbs) * 100,
      qmj: (contributions.qmj / totalAbs) * 100,
      bab: (contributions.bab / totalAbs) * 100,
      alpha: (alpha / totalAbs) * 100
    };

    return {
      totalReturn: portfolioReturn,
      contributions: { ...contributions, alpha },
      percentages,
      factorContribution,
      interpretation: this._interpretAttribution(percentages)
    };
  }

  _interpretAttribution(percentages) {
    const interpretations = [];

    if (percentages.mkt > 50) {
      interpretations.push('Primarily driven by market beta');
    }
    if (percentages.hml > 15) {
      interpretations.push('Significant value tilt');
    } else if (percentages.hml < -15) {
      interpretations.push('Significant growth tilt');
    }
    if (percentages.umd > 15) {
      interpretations.push('Momentum factor contributing positively');
    }
    if (percentages.smb > 10) {
      interpretations.push('Small-cap bias');
    }
    if (percentages.alpha > 20) {
      interpretations.push('Strong unexplained alpha - verify not overfitting');
    } else if (percentages.alpha < -10) {
      interpretations.push('Negative alpha - strategy destroying value');
    }

    return interpretations.join('. ') || 'Returns primarily factor-driven';
  }

  /**
   * Generate comprehensive attribution report
   * @param {Array} portfolioReturns - Portfolio return series
   * @param {string} startDate - Report start date
   * @param {string} endDate - Report end date
   * @returns {Object} Full attribution report
   */
  async generateAttributionReport(portfolioReturns, startDate, endDate) {
    // Calculate exposures
    const exposures = await this.calculatePortfolioFactorExposure(portfolioReturns);
    if (exposures.error) return exposures;

    // Get cumulative factor returns for period
    const factorData = await this._getFactorReturns(startDate, endDate);
    const cumulativeFactors = this._calculateCumulativeReturns(factorData);

    // Total portfolio return
    const totalReturn = portfolioReturns.reduce((cum, r) => cum * (1 + r.return), 1) - 1;

    // Decompose returns
    const attribution = this.decomposeReturns(totalReturn, exposures.factorLoadings, cumulativeFactors);

    return {
      period: { startDate, endDate },
      performance: {
        totalReturn: (totalReturn * 100).toFixed(2) + '%',
        annualizedReturn: (((1 + totalReturn) ** (252 / portfolioReturns.length) - 1) * 100).toFixed(2) + '%'
      },
      factorExposures: exposures,
      attribution,
      styleDrift: await this._analyzeStyleDrift(portfolioReturns),
      summary: {
        isAlphaSignificant: exposures.alpha.isSignificant,
        dominantFactor: this._getDominantFactor(attribution.percentages),
        recommendation: exposures.alpha.annualized > 0
          ? 'Strategy generating positive alpha'
          : 'Review strategy - negative alpha detected'
      }
    };
  }

  _calculateCumulativeReturns(factorData) {
    const cumulative = { mkt_rf: 0, smb: 0, hml: 0, umd: 0, qmj: 0, bab: 0 };

    for (const day of factorData) {
      cumulative.mkt_rf += day.mkt_rf || 0;
      cumulative.smb += day.smb || 0;
      cumulative.hml += day.hml || 0;
      cumulative.umd += day.umd || 0;
      cumulative.qmj += day.qmj || 0;
      cumulative.bab += day.bab || 0;
    }

    return cumulative;
  }

  async _analyzeStyleDrift(portfolioReturns) {
    // Compare first half vs second half exposures
    const midpoint = Math.floor(portfolioReturns.length / 2);
    const firstHalf = portfolioReturns.slice(0, midpoint);
    const secondHalf = portfolioReturns.slice(midpoint);

    const exp1 = await this.calculatePortfolioFactorExposure(firstHalf);
    const exp2 = await this.calculatePortfolioFactorExposure(secondHalf);

    if (exp1.error || exp2.error) return { hasDrift: false };

    const drifts = {};
    for (const factor of ['mkt', 'smb', 'hml', 'umd', 'qmj', 'bab']) {
      const diff = Math.abs(exp2.factorLoadings[factor] - exp1.factorLoadings[factor]);
      drifts[factor] = diff;
    }

    const maxDrift = Math.max(...Object.values(drifts));
    return {
      hasDrift: maxDrift > 0.3,
      drifts,
      maxDriftFactor: Object.entries(drifts).sort((a, b) => b[1] - a[1])[0][0]
    };
  }

  _getDominantFactor(percentages) {
    const factors = ['mkt', 'smb', 'hml', 'umd', 'qmj', 'bab', 'alpha'];
    let max = 0;
    let dominant = 'mkt';

    for (const f of factors) {
      if (Math.abs(percentages[f]) > Math.abs(max)) {
        max = percentages[f];
        dominant = f;
      }
    }

    return dominant;
  }

  // ========== Statistical Helpers ==========

  _multipleRegression(y, X) {
    const n = y.length;
    const k = X[0].length;

    // X'X
    const XtX = this._matrixMultiply(this._transpose(X), X);

    // X'y
    const Xty = this._matrixVectorMultiply(this._transpose(X), y);

    // Solve (X'X)^(-1) * X'y
    const XtXinv = this._invertMatrix(XtX);
    const coefficients = this._matrixVectorMultiply(XtXinv, Xty);

    // Calculate residuals
    const yHat = X.map(row => row.reduce((sum, x, i) => sum + x * coefficients[i], 0));
    const residuals = y.map((yi, i) => yi - yHat[i]);

    // R-squared
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const ssResid = residuals.reduce((sum, e) => sum + e ** 2, 0);
    const rSquared = 1 - ssResid / ssTotal;

    // Standard errors
    const mse = ssResid / (n - k);
    const seCoef = XtXinv.map((row, i) => Math.sqrt(Math.abs(row[i]) * mse));

    // T-statistics
    const tStats = coefficients.map((b, i) => b / (seCoef[i] || 1));

    // P-values (approximate using normal distribution)
    const pValues = tStats.map(t => 2 * (1 - this._normalCDF(Math.abs(t))));

    return { coefficients, residuals, rSquared, tStats, pValues };
  }

  _transpose(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
  }

  _matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < A[0].length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  _matrixVectorMultiply(matrix, vector) {
    return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
  }

  _invertMatrix(matrix) {
    // Simple Gauss-Jordan elimination for small matrices
    const n = matrix.length;
    const augmented = matrix.map((row, i) => {
      const identity = Array(n).fill(0);
      identity[i] = 1;
      return [...row, ...identity];
    });

    // Forward elimination
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      const pivot = augmented[i][i];
      if (Math.abs(pivot) < 1e-10) continue;

      for (let j = i; j < 2 * n; j++) {
        augmented[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = augmented[k][i];
          for (let j = i; j < 2 * n; j++) {
            augmented[k][j] -= factor * augmented[i][j];
          }
        }
      }
    }

    return augmented.map(row => row.slice(n));
  }

  _normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }
}

function createFactorAttribution() {
  return new FactorAttribution();
}

module.exports = { FactorAttribution, createFactorAttribution };
