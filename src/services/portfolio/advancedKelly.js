// src/services/portfolio/advancedKelly.js
// Advanced Kelly Criterion Analytics with Historical Data
// Enhanced with Taleb/Spitznagel safety: Kelly caps, ruin awareness, convexity
// Integrated with parametric return distributions for fat-tail awareness

const { getDatabaseAsync } = require('../../lib/db');
const ParametricDistributions = require('../statistics/parametricDistributions');
const MatrixOps = require('../../utils/matrixOps');

// TALEB/SPITZNAGEL SAFETY CONSTANTS
// "The Kelly formula assumes ergodicity, which doesn't hold in real markets" - Taleb
const MAX_SAFE_KELLY = 0.25; // Never bet more than 1/4 Kelly (Spitznagel recommendation)
const KELLY_WARNING_THRESHOLD = 0.5; // Warn at half Kelly
const MIN_OBSERVATIONS_FOR_KELLY = 252; // Need at least 1 year of data
const TAIL_PERCENTILE = 0.01; // 1% for extreme value analysis
const RUIN_THRESHOLD = 0.5; // 50% drawdown = effective ruin

// Default configuration - can be overridden per-request
const DEFAULT_CONFIG = {
  TRADING_DAYS_PER_YEAR: 252,
  RISK_FREE_RATE: 0.05,           // 5% annual risk-free rate
  DEFAULT_PERIOD: '3y',
  DEFAULT_KELLY_FRACTIONS: [0.10, 0.25, 0.5], // Safer defaults (removed 0.75, 1.0)
  DEFAULT_REBALANCE_FREQ: 'monthly',
  DEFAULT_INITIAL_CAPITAL: 100000,
  DEFAULT_MAX_WEIGHT: 0.40,
  DEFAULT_MIN_WEIGHT: 0.02,
  DEFAULT_LOOKBACK_WINDOW: 60,    // Days for rolling calculations
  VOLATILITY_THRESHOLDS: { low: 15, high: 25 },
  // Taleb/Spitznagel additions
  MAX_SAFE_KELLY: MAX_SAFE_KELLY,
  ENFORCE_KELLY_CAP: true // Set to true to hard-cap Kelly at MAX_SAFE_KELLY
};

class AdvancedKelly {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    console.log('🎯 Advanced Kelly Engine initialized');
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }

  // Get available options for frontend
  getOptions() {
    return {
      periods: ['1y', '2y', '3y', '5y', '10y'],
      rebalanceFrequencies: ['daily', 'weekly', 'monthly', 'quarterly'],
      kellyFractions: [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5],
      defaults: this.config
    };
  }

  // ============================================
  // Historical Kelly Backtest
  // Test Kelly sizing with actual historical returns
  // ============================================
  async historicalKellyBacktest(portfolioId, params = {}) {
    const {
      period = this.config.DEFAULT_PERIOD,
      kellyFractions = this.config.DEFAULT_KELLY_FRACTIONS,
      rebalanceFrequency = this.config.DEFAULT_REBALANCE_FREQ,
      initialCapital = this.config.DEFAULT_INITIAL_CAPITAL,
      riskFreeRate = this.config.RISK_FREE_RATE
    } = params;

    // Store risk-free rate for this calculation
    this._currentRiskFreeRate = riskFreeRate;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const missingData = returns._missingData || [];

    const symbolsWithData = Object.keys(returns).filter(k => k !== '_missingData');
    if (symbolsWithData.length === 0) {
      const errorMsg = missingData.length > 0
        ? `Missing price data for: ${missingData.join(', ')}. Load historical prices for these securities.`
        : 'No historical price data available';
      return { error: errorMsg, missingData };
    }

    // Get aligned dates across all positions
    const dates = this._getAlignedDates(returns);
    if (dates.length < 60) {
      const errorMsg = missingData.length > 0
        ? `Insufficient data. Missing prices for: ${missingData.join(', ')}`
        : 'Insufficient historical data (need at least 60 days)';
      return { error: errorMsg, daysAvailable: dates.length, missingData };
    }

    // Run backtest for each Kelly fraction
    const results = {};

    for (const fraction of kellyFractions) {
      results[`kelly_${fraction}`] = this._runKellyBacktest(
        positions, returns, dates, fraction, rebalanceFrequency, initialCapital
      );
    }

    // Also run equal-weight and buy-and-hold for comparison
    results.equal_weight = this._runEqualWeightBacktest(
      positions, returns, dates, rebalanceFrequency, initialCapital
    );

    results.buy_and_hold = this._runBuyAndHoldBacktest(
      positions, returns, dates, initialCapital
    );

    // Calculate comparative metrics
    const comparison = this._compareStrategies(results);

    return {
      portfolioId,
      period,
      startDate,
      endDate: dates[dates.length - 1],
      tradingDays: dates.length,
      positions: positions.map(p => p.symbol),
      strategies: results,
      comparison,
      recommendation: this._getKellyRecommendation(results),
      missingData: missingData.length > 0 ? missingData : undefined
    };
  }

  // ============================================
  // Multi-Asset Kelly Optimization
  // Find optimal weights maximizing geometric growth rate
  // ============================================
  async optimizeKellyWeights(portfolioId, params = {}) {
    const {
      period = this.config.DEFAULT_PERIOD,
      targetVolatility = null,
      maxWeight = this.config.DEFAULT_MAX_WEIGHT,
      minWeight = this.config.DEFAULT_MIN_WEIGHT,
      leverageAllowed = false,
      riskFreeRate = this.config.RISK_FREE_RATE
    } = params;

    this._currentRiskFreeRate = riskFreeRate;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (!positions || positions.length < 2) {
      return { error: 'Need at least 2 positions for optimization' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < 60) {
      return { error: 'Insufficient historical data' };
    }

    // Calculate expected returns and covariance matrix
    const stats = this._calculateReturnStatistics(positions, returns, dates);

    // Optimize using gradient descent on Kelly objective (log growth)
    const optimizedWeights = this._optimizeKellyGradient(
      stats, positions, maxWeight, minWeight, leverageAllowed, targetVolatility
    );

    // Calculate portfolio metrics with optimized weights
    const portfolioStats = this._calculatePortfolioStats(stats, optimizedWeights);

    // Compare to current weights
    const currentWeights = this._getCurrentWeights(positions);
    const currentStats = this._calculatePortfolioStats(stats, currentWeights);

    return {
      portfolioId,
      period,
      positions: positions.map((p, i) => ({
        symbol: p.symbol,
        currentWeight: currentWeights[i] * 100,
        optimalWeight: optimizedWeights[i] * 100,
        change: (optimizedWeights[i] - currentWeights[i]) * 100,
        expectedReturn: stats.meanReturns[i] * this.config.TRADING_DAYS_PER_YEAR * 100,
        volatility: Math.sqrt(stats.covariance[i][i] * this.config.TRADING_DAYS_PER_YEAR) * 100
      })),
      current: {
        expectedReturn: currentStats.expectedReturn * 100,
        volatility: currentStats.volatility * 100,
        sharpe: currentStats.sharpe,
        kellyGrowth: currentStats.kellyGrowth * 100,
        maxDrawdownEstimate: currentStats.maxDrawdownEstimate * 100
      },
      optimized: {
        expectedReturn: portfolioStats.expectedReturn * 100,
        volatility: portfolioStats.volatility * 100,
        sharpe: portfolioStats.sharpe,
        kellyGrowth: portfolioStats.kellyGrowth * 100,
        maxDrawdownEstimate: portfolioStats.maxDrawdownEstimate * 100
      },
      improvement: {
        returnIncrease: (portfolioStats.expectedReturn - currentStats.expectedReturn) * 100,
        growthIncrease: (portfolioStats.kellyGrowth - currentStats.kellyGrowth) * 100,
        sharpeChange: portfolioStats.sharpe - currentStats.sharpe
      },
      constraints: { maxWeight, minWeight, leverageAllowed, targetVolatility }
    };
  }

  // ============================================
  // Regime-Aware Kelly Sizing
  // Adjust Kelly based on market regime
  // ============================================
  async regimeAwareKelly(portfolioId, params = {}) {
    const {
      period = '5y',
      regimeWindow = this.config.DEFAULT_LOOKBACK_WINDOW,
      volatilityThresholds = this.config.VOLATILITY_THRESHOLDS,
      riskFreeRate = this.config.RISK_FREE_RATE
    } = params;

    this._currentRiskFreeRate = riskFreeRate;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < regimeWindow + 60) {
      return { error: 'Insufficient data for regime analysis' };
    }

    // Detect regimes over time
    const regimeHistory = this._detectRegimes(positions, returns, dates, regimeWindow, volatilityThresholds);

    // Calculate Kelly sizing per regime
    const regimeStats = this._calculateRegimeStats(positions, returns, dates, regimeHistory);

    // Current regime assessment
    const currentRegime = regimeHistory[regimeHistory.length - 1];

    // Recommended Kelly multipliers by regime
    const kellyMultipliers = {
      bull_low_vol: 1.0,      // Full Kelly
      bull_high_vol: 0.5,     // Half Kelly
      bear_low_vol: 0.25,     // Quarter Kelly
      bear_high_vol: 0.1,     // Minimal exposure
      neutral: 0.5            // Default half Kelly
    };

    const recommendedMultiplier = kellyMultipliers[currentRegime.regime] || 0.5;

    // Calculate regime-adjusted weights
    const adjustedWeights = this._calculateRegimeAdjustedWeights(
      positions, returns, dates, currentRegime, recommendedMultiplier
    );

    return {
      portfolioId,
      period,
      currentRegime: {
        type: currentRegime.regime,
        marketTrend: currentRegime.trend,
        volatility: currentRegime.volatility,
        volatilityLevel: currentRegime.volLevel,
        confidence: currentRegime.confidence
      },
      regimeMultipliers: kellyMultipliers,
      recommendedMultiplier,
      regimeHistory: regimeHistory.slice(-90).map(r => ({
        date: r.date,
        regime: r.regime,
        volatility: r.volatility
      })),
      regimeStats,
      adjustedPositions: positions.map((p, i) => ({
        symbol: p.symbol,
        baseKellyWeight: adjustedWeights.base[i] * 100,
        adjustedWeight: adjustedWeights.adjusted[i] * 100,
        adjustment: (adjustedWeights.adjusted[i] - adjustedWeights.base[i]) * 100
      })),
      regimeBreakdown: this._summarizeRegimes(regimeHistory)
    };
  }

  // ============================================
  // Kelly Drawdown Analysis
  // Analyze historical drawdowns at various Kelly levels
  // ============================================
  async kellyDrawdownAnalysis(portfolioId, params = {}) {
    const {
      period = '5y',
      kellyFractions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5],
      initialCapital = this.config.DEFAULT_INITIAL_CAPITAL,
      riskFreeRate = this.config.RISK_FREE_RATE
    } = params;

    this._currentRiskFreeRate = riskFreeRate;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < 252) {
      return { error: 'Need at least 1 year of data for drawdown analysis' };
    }

    const drawdownAnalysis = [];

    for (const fraction of kellyFractions) {
      const backtest = this._runKellyBacktest(
        positions, returns, dates, fraction, 'monthly', initialCapital
      );

      // Find all drawdown periods
      const drawdowns = this._findAllDrawdowns(backtest.equityCurve);

      // Risk of ruin analysis
      const ruinAnalysis = this._calculateRiskOfRuin(backtest, fraction);

      drawdownAnalysis.push({
        kellyFraction: fraction,
        finalValue: backtest.finalValue,
        totalReturn: backtest.totalReturn,
        cagr: backtest.cagr,
        maxDrawdown: backtest.maxDrawdown,
        avgDrawdown: drawdowns.reduce((s, d) => s + d.depth, 0) / drawdowns.length || 0,
        drawdownCount: drawdowns.length,
        avgRecoveryDays: drawdowns.reduce((s, d) => s + d.recoveryDays, 0) / drawdowns.length || 0,
        longestDrawdown: Math.max(...drawdowns.map(d => d.durationDays), 0),
        worstDrawdowns: drawdowns
          .sort((a, b) => a.depth - b.depth)
          .slice(0, 3)
          .map(d => ({
            depth: d.depth,
            startDate: d.startDate,
            bottomDate: d.bottomDate,
            recoveryDate: d.recoveryDate,
            durationDays: d.durationDays
          })),
        riskOfRuin: ruinAnalysis
      });
    }

    // Find optimal Kelly considering drawdown tolerance
    const optimalByDrawdown = this._findOptimalKellyForDrawdown(drawdownAnalysis);

    return {
      portfolioId,
      period,
      tradingDays: dates.length,
      analysis: drawdownAnalysis,
      optimalByDrawdown,
      recommendation: this._getDrawdownRecommendation(drawdownAnalysis)
    };
  }

  // ============================================
  // Kelly Strategy Comparison
  // Compare Kelly vs other sizing methods
  // ============================================
  async compareKellyStrategies(portfolioId, params = {}) {
    const {
      period = '5y',
      initialCapital = this.config.DEFAULT_INITIAL_CAPITAL,
      rebalanceFrequency = this.config.DEFAULT_REBALANCE_FREQ,
      riskFreeRate = this.config.RISK_FREE_RATE
    } = params;

    this._currentRiskFreeRate = riskFreeRate;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const missingData = returns._missingData || [];
    const dates = this._getAlignedDates(returns);

    if (dates.length < 252) {
      const errorMsg = missingData.length > 0
        ? `Insufficient data (need 1 year). Missing prices for: ${missingData.join(', ')}`
        : 'Need at least 1 year of data for comparison';
      return { error: errorMsg, daysAvailable: dates.length, missingData };
    }

    // Run all strategies
    const strategies = {
      'Full Kelly': this._runKellyBacktest(positions, returns, dates, 1.0, rebalanceFrequency, initialCapital),
      'Half Kelly': this._runKellyBacktest(positions, returns, dates, 0.5, rebalanceFrequency, initialCapital),
      'Quarter Kelly': this._runKellyBacktest(positions, returns, dates, 0.25, rebalanceFrequency, initialCapital),
      'Equal Weight': this._runEqualWeightBacktest(positions, returns, dates, rebalanceFrequency, initialCapital),
      'Risk Parity': this._runRiskParityBacktest(positions, returns, dates, rebalanceFrequency, initialCapital),
      'Buy & Hold': this._runBuyAndHoldBacktest(positions, returns, dates, initialCapital),
      'Fixed 5%': this._runFixedFractionBacktest(positions, returns, dates, 0.05, rebalanceFrequency, initialCapital)
    };

    // Calculate rankings
    const rankings = {
      byReturn: Object.entries(strategies)
        .sort((a, b) => b[1].totalReturn - a[1].totalReturn)
        .map(([name], i) => ({ strategy: name, rank: i + 1 })),
      bySharpe: Object.entries(strategies)
        .sort((a, b) => b[1].sharpe - a[1].sharpe)
        .map(([name], i) => ({ strategy: name, rank: i + 1 })),
      byMaxDrawdown: Object.entries(strategies)
        .sort((a, b) => b[1].maxDrawdown - a[1].maxDrawdown)
        .map(([name], i) => ({ strategy: name, rank: i + 1 })),
      byCAGR: Object.entries(strategies)
        .sort((a, b) => b[1].cagr - a[1].cagr)
        .map(([name], i) => ({ strategy: name, rank: i + 1 }))
    };

    // Composite score
    const scores = {};
    for (const [name, result] of Object.entries(strategies)) {
      const returnRank = rankings.byReturn.find(r => r.strategy === name).rank;
      const sharpeRank = rankings.bySharpe.find(r => r.strategy === name).rank;
      const ddRank = rankings.byMaxDrawdown.find(r => r.strategy === name).rank;
      scores[name] = {
        ...result,
        compositeScore: (returnRank + sharpeRank + ddRank) / 3
      };
    }

    const winner = Object.entries(scores)
      .sort((a, b) => a[1].compositeScore - b[1].compositeScore)[0][0];

    return {
      portfolioId,
      period,
      tradingDays: dates.length,
      strategies: Object.entries(strategies).map(([name, result]) => ({
        name,
        finalValue: result.finalValue,
        totalReturn: result.totalReturn,
        cagr: result.cagr,
        volatility: result.volatility,
        sharpe: result.sharpe,
        maxDrawdown: result.maxDrawdown,
        calmar: result.cagr / Math.abs(result.maxDrawdown) || 0,
        compositeScore: scores[name].compositeScore
      })),
      rankings,
      winner,
      equityCurves: Object.entries(strategies).reduce((acc, [name, result]) => {
        // Sample equity curve for charting (every 5th point)
        acc[name] = result.equityCurve.filter((_, i) => i % 5 === 0 || i === result.equityCurve.length - 1);
        return acc;
      }, {})
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  async _getPortfolioPositions(portfolioId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        pp.company_id,
        pp.shares,
        pp.cost_basis,
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.volatility_30d as volatility
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);

    return result.rows.map(pos => ({
      ...pos,
      value: pos.shares * (pos.last_price || 0)
    }));
  }

  _getPeriodDates(period) {
    const now = new Date();
    const periodDays = {
      '1y': 365, '2y': 730, '3y': 1095, '5y': 1825, '10y': 3650
    };
    const days = periodDays[period] || 1095;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    };
  }

  async _loadDailyReturns(positions, startDate) {
    const database = await getDatabaseAsync();
    const returns = {};
    const missingData = [];

    for (const pos of positions) {
      const result = await database.query(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = $1 AND date >= $2
        ORDER BY date ASC
      `, [pos.company_id, startDate]);

      const prices = result.rows;

      if (prices.length < 2) {
        missingData.push(pos.symbol);
        continue;
      }

      returns[pos.symbol] = {
        dates: [],
        returns: [],
        prices: []
      };

      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1].adjusted_close || prices[i - 1].close;
        const curr = prices[i].adjusted_close || prices[i].close;
        if (prev && curr) {
          returns[pos.symbol].dates.push(prices[i].date);
          returns[pos.symbol].returns.push((curr - prev) / prev);
          returns[pos.symbol].prices.push(curr);
        }
      }
    }

    // Attach missing data info for error reporting
    returns._missingData = missingData;

    return returns;
  }

  _getAlignedDates(returns) {
    // Filter out _missingData and any non-data keys
    const symbols = Object.keys(returns).filter(s =>
      s !== '_missingData' && returns[s] && returns[s].dates
    );
    if (symbols.length === 0) return [];

    // Find common dates across all symbols
    const dateSets = symbols.map(s => new Set(returns[s].dates));
    const commonDates = [...dateSets[0]].filter(date =>
      dateSets.every(set => set.has(date))
    );

    return commonDates.sort();
  }

  _runKellyBacktest(positions, returns, dates, kellyFraction, rebalanceFreq, initialCapital) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;

    // Calculate Kelly weights using historical data (rolling window)
    const lookback = 60; // 60-day lookback for Kelly calculation

    let capital = initialCapital;
    const equityCurve = [{ date: dates[0], value: capital }];
    let weights = new Array(n).fill(1 / n); // Start equal weight

    const rebalanceDays = { daily: 1, weekly: 5, monthly: 21, quarterly: 63 };
    const rebalanceInterval = rebalanceDays[rebalanceFreq] || 21;

    for (let d = lookback; d < dates.length; d++) {
      // Get daily returns for this date
      const dayReturns = symbols.map(sym => {
        const idx = returns[sym].dates.indexOf(dates[d]);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });

      // Calculate portfolio return
      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * dayReturns[i], 0);
      capital *= (1 + portfolioReturn);

      equityCurve.push({ date: dates[d], value: capital });

      // Rebalance if needed
      if ((d - lookback) % rebalanceInterval === 0 && d > lookback) {
        // Calculate new Kelly weights based on rolling window
        const windowReturns = symbols.map(sym => {
          const idx = returns[sym].dates.indexOf(dates[d]);
          if (idx < lookback) return [];
          return returns[sym].returns.slice(idx - lookback, idx);
        });

        weights = this._calculateKellyWeights(windowReturns, kellyFraction);
      }
    }

    return this._calculateBacktestMetrics(equityCurve, initialCapital);
  }

  _calculateKellyWeights(returnsArrays, kellyFraction, options = {}) {
    const n = returnsArrays.length;
    if (n === 0 || returnsArrays.some(r => r.length === 0)) {
      return new Array(Math.max(n, 1)).fill(1 / Math.max(n, 1));
    }

    // Calculate mean returns and covariance
    const means = returnsArrays.map(r => r.reduce((a, b) => a + b, 0) / r.length);
    const minLen = Math.min(...returnsArrays.map(r => r.length));

    // Need at least 2 data points for covariance calculation
    if (minLen < 2) {
      return new Array(n).fill(1 / n);
    }

    // Build full covariance matrix
    const cov = [];
    for (let i = 0; i < n; i++) {
      cov[i] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < minLen; k++) {
          sum += (returnsArrays[i][k] - means[i]) * (returnsArrays[j][k] - means[j]);
        }
        cov[i][j] = sum / (minLen - 1);
      }
    }

    // Kelly optimal: f* = Σ^(-1) * μ
    // Use full covariance matrix with regularization for numerical stability
    const {
      maxConditionNumber = 1000,
      regularizationMethod = 'tikhonov'
    } = options;

    const kellyResult = MatrixOps.computeKellyWeights(cov, means, {
      maxConditionNumber,
      regularizationMethod,
      fallbackToDiagonal: true
    });

    let weights = kellyResult.weights;

    // Log if regularization was applied (for diagnostics)
    if (kellyResult.regularized) {
      console.log(`Kelly weights: ${kellyResult.method} applied (cond=${kellyResult.conditionNumber.toFixed(0)})`);
    }

    // Apply Kelly fraction
    weights = weights.map(w => w * kellyFraction);

    // Normalize to sum to 1, handle negative weights
    weights = weights.map(w => Math.max(0, w)); // No short positions
    const sum = weights.reduce((a, b) => a + b, 0);

    if (sum <= 0) {
      return new Array(n).fill(1 / n);
    }

    return weights.map(w => w / sum);
  }

  _runEqualWeightBacktest(positions, returns, dates, rebalanceFreq, initialCapital) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;
    const weights = new Array(n).fill(1 / n);

    let capital = initialCapital;
    const equityCurve = [{ date: dates[0], value: capital }];

    for (let d = 1; d < dates.length; d++) {
      const dayReturns = symbols.map(sym => {
        const idx = returns[sym].dates.indexOf(dates[d]);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });

      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * dayReturns[i], 0);
      capital *= (1 + portfolioReturn);
      equityCurve.push({ date: dates[d], value: capital });
    }

    return this._calculateBacktestMetrics(equityCurve, initialCapital);
  }

  _runBuyAndHoldBacktest(positions, returns, dates, initialCapital) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;

    // Calculate initial weights based on current portfolio weights
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
    const weights = positions.map(p => totalValue > 0 ? p.value / totalValue : 1 / n);

    let capital = initialCapital;
    const equityCurve = [{ date: dates[0], value: capital }];

    // Track individual position values (no rebalancing)
    let positionValues = weights.map(w => w * capital);

    for (let d = 1; d < dates.length; d++) {
      const dayReturns = symbols.map(sym => {
        const idx = returns[sym].dates.indexOf(dates[d]);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });

      // Update each position value
      positionValues = positionValues.map((val, i) => val * (1 + dayReturns[i]));
      capital = positionValues.reduce((a, b) => a + b, 0);
      equityCurve.push({ date: dates[d], value: capital });
    }

    return this._calculateBacktestMetrics(equityCurve, initialCapital);
  }

  _runRiskParityBacktest(positions, returns, dates, rebalanceFreq, initialCapital) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;
    const lookback = 60;

    let capital = initialCapital;
    const equityCurve = [{ date: dates[0], value: capital }];
    let weights = new Array(n).fill(1 / n);

    const rebalanceDays = { daily: 1, weekly: 5, monthly: 21, quarterly: 63 };
    const rebalanceInterval = rebalanceDays[rebalanceFreq] || 21;

    for (let d = lookback; d < dates.length; d++) {
      const dayReturns = symbols.map(sym => {
        const idx = returns[sym].dates.indexOf(dates[d]);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });

      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * dayReturns[i], 0);
      capital *= (1 + portfolioReturn);
      equityCurve.push({ date: dates[d], value: capital });

      // Rebalance to risk parity
      if ((d - lookback) % rebalanceInterval === 0) {
        const vols = symbols.map(sym => {
          const idx = returns[sym].dates.indexOf(dates[d]);
          if (idx < lookback) return 1;
          const window = returns[sym].returns.slice(idx - lookback, idx);
          const mean = window.reduce((a, b) => a + b, 0) / window.length;
          const variance = window.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / window.length;
          return Math.sqrt(variance * this.config.TRADING_DAYS_PER_YEAR) || 1;
        });

        // Inverse volatility weighting
        const invVols = vols.map(v => 1 / v);
        const sumInvVols = invVols.reduce((a, b) => a + b, 0);
        weights = invVols.map(iv => iv / sumInvVols);
      }
    }

    return this._calculateBacktestMetrics(equityCurve, initialCapital);
  }

  _runFixedFractionBacktest(positions, returns, dates, fraction, rebalanceFreq, initialCapital) {
    // Fixed fraction means each position gets exactly `fraction` of portfolio
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;
    const targetWeight = fraction;
    const cashWeight = 1 - (n * targetWeight);

    let capital = initialCapital;
    const equityCurve = [{ date: dates[0], value: capital }];

    const rebalanceDays = { daily: 1, weekly: 5, monthly: 21, quarterly: 63 };
    const rebalanceInterval = rebalanceDays[rebalanceFreq] || 21;

    let weights = new Array(n).fill(Math.min(targetWeight, 1 / n));

    for (let d = 1; d < dates.length; d++) {
      const dayReturns = symbols.map(sym => {
        const idx = returns[sym].dates.indexOf(dates[d]);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });

      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * dayReturns[i], 0);
      capital *= (1 + portfolioReturn);
      equityCurve.push({ date: dates[d], value: capital });

      // Rebalance back to fixed weights
      if (d % rebalanceInterval === 0) {
        weights = new Array(n).fill(Math.min(targetWeight, 1 / n));
      }
    }

    return this._calculateBacktestMetrics(equityCurve, initialCapital);
  }

  _calculateBacktestMetrics(equityCurve, initialCapital) {
    const finalValue = equityCurve[equityCurve.length - 1].value;
    const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

    // Calculate daily returns from equity curve
    const dailyReturns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      dailyReturns.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value);
    }

    // Volatility
    const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
    const tradingDays = this.config.TRADING_DAYS_PER_YEAR;
    const volatility = Math.sqrt(variance * tradingDays) * 100;

    // CAGR
    const years = equityCurve.length / tradingDays;
    const cagr = (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;

    // Sharpe Ratio (use current risk-free rate or default)
    const riskFreeRate = this._currentRiskFreeRate || this.config.RISK_FREE_RATE;
    const annualizedReturn = meanReturn * tradingDays;
    const annualizedVol = Math.sqrt(variance * tradingDays);
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

    // Max Drawdown
    let peak = equityCurve[0].value;
    let maxDrawdown = 0;
    let maxDrawdownDate = equityCurve[0].date;

    for (const point of equityCurve) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = (peak - point.value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownDate = point.date;
      }
    }

    return {
      equityCurve,
      finalValue: Math.round(finalValue * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      cagr: Math.round(cagr * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100 * 100) / 100,
      maxDrawdownDate
    };
  }

  _calculateReturnStatistics(positions, returns, dates) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;

    // Get aligned returns
    const alignedReturns = symbols.map(sym =>
      dates.map(date => {
        const idx = returns[sym].dates.indexOf(date);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      })
    );

    // Mean returns
    const meanReturns = alignedReturns.map(r =>
      r.reduce((a, b) => a + b, 0) / r.length
    );

    // Covariance matrix
    const covariance = [];
    for (let i = 0; i < n; i++) {
      covariance[i] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < dates.length; k++) {
          sum += (alignedReturns[i][k] - meanReturns[i]) * (alignedReturns[j][k] - meanReturns[j]);
        }
        covariance[i][j] = sum / (dates.length - 1);
      }
    }

    return { meanReturns, covariance, symbols };
  }

  _optimizeKellyGradient(stats, positions, maxWeight, minWeight, leverageAllowed, targetVol) {
    const n = positions.length;
    let weights = new Array(n).fill(1 / n);

    const learningRate = 0.01;
    const iterations = 1000;

    for (let iter = 0; iter < iterations; iter++) {
      // Calculate gradient of log growth rate
      // g = log(1 + w'μ) - 0.5 * w'Σw
      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * stats.meanReturns[i], 0);

      // Gradient: μ / (1 + w'μ) - Σw
      const gradient = stats.meanReturns.map((mu, i) => {
        let sigmaW = 0;
        for (let j = 0; j < n; j++) {
          sigmaW += stats.covariance[i][j] * weights[j];
        }
        return mu / (1 + portfolioReturn) - sigmaW;
      });

      // Update weights
      weights = weights.map((w, i) => w + learningRate * gradient[i]);

      // Apply constraints
      if (!leverageAllowed) {
        weights = weights.map(w => Math.max(0, w));
      }

      // Normalize
      const sum = weights.reduce((a, b) => a + Math.abs(b), 0);
      if (sum > 0) {
        weights = weights.map(w => w / sum);
      }

      // Apply min/max constraints
      weights = weights.map(w => {
        if (Math.abs(w) < minWeight) return 0;
        return Math.min(Math.max(w, -maxWeight), maxWeight);
      });

      // Re-normalize after constraints
      const constrainedSum = weights.reduce((a, b) => a + Math.abs(b), 0);
      if (constrainedSum > 0 && constrainedSum !== 1) {
        weights = weights.map(w => w / constrainedSum);
      }
    }

    return weights;
  }

  _getCurrentWeights(positions) {
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
    return positions.map(p => totalValue > 0 ? p.value / totalValue : 1 / positions.length);
  }

  _calculatePortfolioStats(stats, weights) {
    const n = weights.length;
    const tradingDays = this.config.TRADING_DAYS_PER_YEAR;
    const riskFreeRate = this._currentRiskFreeRate || this.config.RISK_FREE_RATE;

    // Expected return (annualized)
    const expectedReturn = weights.reduce((sum, w, i) =>
      sum + w * stats.meanReturns[i], 0) * tradingDays;

    // Variance
    let variance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * stats.covariance[i][j];
      }
    }
    const volatility = Math.sqrt(variance * tradingDays);

    const sharpe = volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0;

    // Kelly growth rate: g ≈ μ - σ²/2
    const kellyGrowth = expectedReturn - (volatility * volatility) / 2;

    // Estimated max drawdown (approximation: 2σ for 95% confidence)
    const maxDrawdownEstimate = volatility * 2;

    return { expectedReturn, volatility, sharpe, kellyGrowth, maxDrawdownEstimate };
  }

  _detectRegimes(positions, returns, dates, window, thresholds) {
    const symbols = positions.map(p => p.symbol);
    const regimeHistory = [];

    for (let d = window; d < dates.length; d++) {
      // Calculate rolling portfolio return and volatility
      let totalReturn = 0;
      const volatilities = [];

      for (const sym of symbols) {
        const idx = returns[sym].dates.indexOf(dates[d]);
        if (idx >= window) {
          const windowReturns = returns[sym].returns.slice(idx - window, idx);
          const meanRet = windowReturns.reduce((a, b) => a + b, 0) / window;
          const variance = windowReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / window;
          totalReturn += meanRet * this.config.TRADING_DAYS_PER_YEAR * 100;
          volatilities.push(Math.sqrt(variance * this.config.TRADING_DAYS_PER_YEAR) * 100);
        }
      }

      const avgReturn = totalReturn / symbols.length;
      const avgVol = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;

      // Determine regime
      const trend = avgReturn > 5 ? 'bull' : avgReturn < -5 ? 'bear' : 'neutral';
      const volLevel = avgVol > thresholds.high ? 'high_vol' : avgVol < thresholds.low ? 'low_vol' : 'normal_vol';

      let regime;
      if (trend === 'bull' && volLevel === 'low_vol') regime = 'bull_low_vol';
      else if (trend === 'bull' && volLevel === 'high_vol') regime = 'bull_high_vol';
      else if (trend === 'bear' && volLevel === 'low_vol') regime = 'bear_low_vol';
      else if (trend === 'bear' && volLevel === 'high_vol') regime = 'bear_high_vol';
      else regime = 'neutral';

      regimeHistory.push({
        date: dates[d],
        regime,
        trend,
        volLevel,
        volatility: Math.round(avgVol * 100) / 100,
        return: Math.round(avgReturn * 100) / 100,
        confidence: Math.min(100, Math.abs(avgReturn) * 2 + Math.abs(avgVol - 20))
      });
    }

    return regimeHistory;
  }

  _calculateRegimeStats(positions, returns, dates, regimeHistory) {
    const regimeTypes = ['bull_low_vol', 'bull_high_vol', 'bear_low_vol', 'bear_high_vol', 'neutral'];
    const stats = {};

    for (const regime of regimeTypes) {
      const regimeDates = regimeHistory.filter(r => r.regime === regime);
      const count = regimeDates.length;

      if (count === 0) {
        stats[regime] = { count: 0, avgReturn: 0, avgVol: 0, pctTime: 0 };
        continue;
      }

      const avgReturn = regimeDates.reduce((s, r) => s + r.return, 0) / count;
      const avgVol = regimeDates.reduce((s, r) => s + r.volatility, 0) / count;

      stats[regime] = {
        count,
        avgReturn: Math.round(avgReturn * 100) / 100,
        avgVol: Math.round(avgVol * 100) / 100,
        pctTime: Math.round(count / regimeHistory.length * 100)
      };
    }

    return stats;
  }

  _calculateRegimeAdjustedWeights(positions, returns, dates, currentRegime, multiplier) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;
    const lookback = 60;
    const lastDate = dates[dates.length - 1];

    // Calculate base Kelly weights
    const windowReturns = symbols.map(sym => {
      const idx = returns[sym].dates.indexOf(lastDate);
      if (idx < lookback) return [];
      return returns[sym].returns.slice(idx - lookback, idx);
    });

    const baseWeights = this._calculateKellyWeights(windowReturns, 1.0);
    const adjustedWeights = baseWeights.map(w => w * multiplier);

    // Normalize adjusted weights
    const sum = adjustedWeights.reduce((a, b) => a + b, 0);
    const normalizedAdjusted = sum > 0 ? adjustedWeights.map(w => w / sum) : adjustedWeights;

    return { base: baseWeights, adjusted: normalizedAdjusted };
  }

  _summarizeRegimes(regimeHistory) {
    const summary = {};
    for (const r of regimeHistory) {
      summary[r.regime] = (summary[r.regime] || 0) + 1;
    }
    const total = regimeHistory.length;
    return Object.entries(summary).map(([regime, count]) => ({
      regime,
      days: count,
      percentage: Math.round(count / total * 100)
    })).sort((a, b) => b.days - a.days);
  }

  _findAllDrawdowns(equityCurve) {
    const drawdowns = [];
    let peak = equityCurve[0].value;
    let peakIdx = 0;
    let inDrawdown = false;
    let currentDrawdown = null;

    for (let i = 1; i < equityCurve.length; i++) {
      const { date, value } = equityCurve[i];

      if (value >= peak) {
        if (inDrawdown && currentDrawdown) {
          currentDrawdown.recoveryDate = date;
          currentDrawdown.recoveryDays = i - currentDrawdown.bottomIdx;
          currentDrawdown.durationDays = i - peakIdx;
          drawdowns.push(currentDrawdown);
        }
        peak = value;
        peakIdx = i;
        inDrawdown = false;
        currentDrawdown = null;
      } else {
        const drawdown = (peak - value) / peak;

        if (!inDrawdown) {
          inDrawdown = true;
          currentDrawdown = {
            startDate: equityCurve[peakIdx].date,
            depth: -drawdown * 100,
            bottomDate: date,
            bottomIdx: i,
            recoveryDate: null,
            recoveryDays: null
          };
        } else if (drawdown > Math.abs(currentDrawdown.depth / 100)) {
          currentDrawdown.depth = -drawdown * 100;
          currentDrawdown.bottomDate = date;
          currentDrawdown.bottomIdx = i;
        }
      }
    }

    // Handle ongoing drawdown
    if (inDrawdown && currentDrawdown) {
      currentDrawdown.durationDays = equityCurve.length - peakIdx;
      drawdowns.push(currentDrawdown);
    }

    return drawdowns;
  }

  _calculateRiskOfRuin(backtest, kellyFraction) {
    // Simplified risk of ruin estimation
    // RoR = ((1-p)/p)^(capital/bet) where p = win rate

    const returns = [];
    for (let i = 1; i < backtest.equityCurve.length; i++) {
      returns.push(
        (backtest.equityCurve[i].value - backtest.equityCurve[i-1].value) /
        backtest.equityCurve[i-1].value
      );
    }

    const winRate = returns.filter(r => r > 0).length / returns.length;
    const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / returns.filter(r => r > 0).length || 0;
    const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / returns.filter(r => r < 0).length) || 0;

    // Risk of 50% drawdown
    const riskOf50pctDD = kellyFraction > 0.5 ?
      Math.min(99, Math.pow(kellyFraction / 0.5, 2) * 10) :
      Math.max(1, kellyFraction * 10);

    return {
      winRate: Math.round(winRate * 100),
      avgWin: Math.round(avgWin * 10000) / 100,
      avgLoss: Math.round(avgLoss * 10000) / 100,
      riskOf50pctDrawdown: Math.round(riskOf50pctDD)
    };
  }

  _findOptimalKellyForDrawdown(analysis) {
    const targets = [
      { maxDD: 10, name: 'Conservative (10% max DD)' },
      { maxDD: 20, name: 'Moderate (20% max DD)' },
      { maxDD: 30, name: 'Aggressive (30% max DD)' }
    ];

    return targets.map(target => {
      const eligible = analysis.filter(a => Math.abs(a.maxDrawdown) <= target.maxDD);
      if (eligible.length === 0) {
        return {
          ...target,
          optimalFraction: null,
          expectedCAGR: null,
          message: 'No fraction meets this constraint'
        };
      }
      const best = eligible.sort((a, b) => b.cagr - a.cagr)[0];
      return {
        ...target,
        optimalFraction: best.kellyFraction,
        expectedCAGR: best.cagr,
        actualMaxDD: best.maxDrawdown
      };
    });
  }

  _compareStrategies(results) {
    const strategies = Object.entries(results);

    return {
      bestReturn: strategies.sort((a, b) => b[1].totalReturn - a[1].totalReturn)[0][0],
      bestSharpe: strategies.sort((a, b) => b[1].sharpe - a[1].sharpe)[0][0],
      lowestDrawdown: strategies.sort((a, b) => b[1].maxDrawdown - a[1].maxDrawdown)[0][0],
      bestCAGR: strategies.sort((a, b) => b[1].cagr - a[1].cagr)[0][0]
    };
  }

  _getKellyRecommendation(results) {
    const halfKelly = results['kelly_0.5'];
    const quarterKelly = results['kelly_0.25'];
    const equalWeight = results.equal_weight;

    if (!halfKelly || !quarterKelly) {
      return 'Insufficient data for recommendation';
    }

    if (halfKelly.sharpe > equalWeight.sharpe && Math.abs(halfKelly.maxDrawdown) < 30) {
      return 'Half Kelly recommended - good risk-adjusted returns with manageable drawdowns';
    } else if (quarterKelly.sharpe > equalWeight.sharpe) {
      return 'Quarter Kelly recommended - conservative approach with steady growth';
    } else {
      return 'Equal weight may be preferable - Kelly sizing not showing clear advantage for this portfolio';
    }
  }

  _getDrawdownRecommendation(analysis) {
    const halfKelly = analysis.find(a => a.kellyFraction === 0.5);
    const quarterKelly = analysis.find(a => a.kellyFraction === 0.25);

    if (!halfKelly && !quarterKelly) return 'Insufficient data';

    // Taleb/Spitznagel philosophy: always recommend conservative Kelly
    if (halfKelly && Math.abs(halfKelly.maxDrawdown) > 40) {
      return 'DANGER: High drawdown risk. Taleb recommends Quarter Kelly (0.25) or lower. Full Kelly assumes ergodicity which markets lack.';
    } else if (halfKelly && Math.abs(halfKelly.maxDrawdown) > 25) {
      return 'CAUTION: Moderate drawdown risk. Use Quarter Kelly (0.25) for safety. Remember: you cannot recover from ruin.';
    } else {
      return 'Quarter Kelly (0.25) recommended. Even with low historical drawdowns, tail risks are underestimated by historical data.';
    }
  }

  // ============================================
  // Taleb/Spitznagel Risk Analysis
  // Non-ergodic, tail-aware risk assessment
  // ============================================
  async getTalebRiskAnalysis(portfolioId, params = {}) {
    const {
      period = '5y',
      initialCapital = this.config.DEFAULT_INITIAL_CAPITAL
    } = params;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < MIN_OBSERVATIONS_FOR_KELLY) {
      return {
        error: `Insufficient data for reliable Kelly analysis. Need ${MIN_OBSERVATIONS_FOR_KELLY} days, have ${dates.length}.`,
        talebWarning: 'Small samples dramatically underestimate tail risk. Do not use Kelly with limited data.'
      };
    }

    // Calculate portfolio returns
    const symbols = positions.map(p => p.symbol);
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
    const weights = positions.map(p => totalValue > 0 ? p.value / totalValue : 1 / positions.length);

    const portfolioReturns = dates.map(date => {
      let dayReturn = 0;
      symbols.forEach((sym, i) => {
        const idx = returns[sym]?.dates.indexOf(date);
        if (idx >= 0) {
          dayReturn += weights[i] * returns[sym].returns[idx];
        }
      });
      return dayReturn;
    });

    // Extreme Value Theory analysis
    const evtAnalysis = this._calculateEVTMetrics(portfolioReturns);

    // Non-ergodic risk (path dependency)
    const pathDependencyRisk = this._analyzePathDependency(portfolioReturns, initialCapital);

    // Calculate safe Kelly fraction
    const safeKelly = this._calculateSafeKellyFraction(portfolioReturns, evtAnalysis);

    // Convexity analysis
    const convexityAnalysis = this._analyzePortfolioConvexity(portfolioReturns);

    // Parametric distribution analysis for portfolio returns
    let distributionAnalysis = null;
    let cornishFisherVaR = null;
    try {
      const distFit = ParametricDistributions.findBestFit(portfolioReturns);
      const moments = ParametricDistributions.calculateMoments(portfolioReturns);

      // Cornish-Fisher VaR adjustment
      const cfVaR95 = ParametricDistributions.cornishFisherVaR(
        moments.mean, moments.std, moments.skewness, moments.kurtosis, 0.95
      );
      const cfVaR99 = ParametricDistributions.cornishFisherVaR(
        moments.mean, moments.std, moments.skewness, moments.kurtosis, 0.99
      );

      cornishFisherVaR = {
        var95: {
          normal: Math.round(cfVaR95.normalVaR * 10000) / 100,
          adjusted: Math.round(cfVaR95.adjustedVaR * 10000) / 100,
          adjustmentPct: Math.round(cfVaR95.adjustmentPercent * 100) / 100
        },
        var99: {
          normal: Math.round(cfVaR99.normalVaR * 10000) / 100,
          adjusted: Math.round(cfVaR99.adjustedVaR * 10000) / 100,
          adjustmentPct: Math.round(cfVaR99.adjustmentPercent * 100) / 100
        }
      };

      distributionAnalysis = {
        bestFit: distFit.type,
        moments: {
          skewness: Math.round(moments.skewness * 100) / 100,
          kurtosis: Math.round(moments.kurtosis * 100) / 100,
          excessKurtosis: Math.round((moments.kurtosis - 3) * 100) / 100
        },
        interpretation: this._interpretDistribution(distFit.type, moments.skewness, moments.kurtosis)
      };
    } catch (err) {
      // Parametric analysis failed, continue with EVT results
    }

    return {
      portfolioId,
      period,
      tradingDays: dates.length,
      extremeValueAnalysis: evtAnalysis,
      distributionAnalysis,
      cornishFisherVaR,
      pathDependencyRisk,
      safeKellyFraction: safeKelly,
      convexityAnalysis,
      talebWarnings: this._generateTalebWarnings(evtAnalysis, pathDependencyRisk, safeKelly),
      spitznagelRecommendation: this._getSpitznagelRecommendation(safeKelly, evtAnalysis)
    };
  }

  // Extreme Value Theory metrics
  _calculateEVTMetrics(returns) {
    const n = returns.length;
    const sorted = [...returns].sort((a, b) => a - b);

    // Left tail (losses) - this is what matters for ruin
    const tailCount = Math.max(10, Math.floor(n * TAIL_PERCENTILE));
    const leftTail = sorted.slice(0, tailCount);

    // Calculate tail statistics
    const tailMean = leftTail.reduce((a, b) => a + b, 0) / tailCount;
    const tailVariance = leftTail.reduce((s, r) => s + Math.pow(r - tailMean, 2), 0) / tailCount;
    const tailStdDev = Math.sqrt(tailVariance);

    // Expected Shortfall (CVaR) - average loss beyond VaR
    const var99 = sorted[Math.floor(n * 0.01)];
    const var95 = sorted[Math.floor(n * 0.05)];
    const cvar99 = leftTail.slice(0, Math.floor(n * 0.01)).reduce((a, b) => a + b, 0) / Math.floor(n * 0.01) || var99;

    // Estimate tail index (alpha) - lower alpha = fatter tails
    // Using Hill estimator
    const k = tailCount;
    const threshold = sorted[k];
    let hillSum = 0;
    for (let i = 0; i < k; i++) {
      if (sorted[i] < threshold && threshold < 0) {
        hillSum += Math.log(Math.abs(threshold) / Math.abs(sorted[i]));
      }
    }
    const tailIndex = k / hillSum || 4; // Default to 4 if calculation fails

    // Calculate kurtosis for comparison
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n);
    const kurtosis = stdDev > 0
      ? returns.reduce((s, r) => s + Math.pow((r - mean) / stdDev, 4), 0) / n
      : 3;

    // Max observed loss
    const maxLoss = Math.min(...returns);

    // Fat tail indicator
    const isFatTailed = kurtosis > 4 || tailIndex < 3;

    return {
      var95: Math.round(var95 * 10000) / 100, // as percentage
      var99: Math.round(var99 * 10000) / 100,
      cvar99: Math.round(cvar99 * 10000) / 100,
      expectedShortfall: Math.round(cvar99 * 10000) / 100,
      tailIndex: Math.round(tailIndex * 100) / 100,
      kurtosis: Math.round(kurtosis * 100) / 100,
      maxObservedLoss: Math.round(maxLoss * 10000) / 100,
      isFatTailed,
      tailWarning: isFatTailed
        ? 'DANGER: Fat tails detected. Historical VaR underestimates true risk by 2-10x.'
        : tailIndex < 4
        ? 'CAUTION: Moderate tail risk. Standard models may underestimate risk.'
        : 'Tail behavior appears relatively normal, but remain cautious.',
      gaussianVsRealityRatio: kurtosis > 3 ? Math.round((kurtosis / 3) * 10) / 10 : 1
    };
  }

  // Path dependency analysis (non-ergodicity)
  _analyzePathDependency(returns, initialCapital) {
    // Simulate multiple paths to show non-ergodicity
    const numPaths = 1000;
    const pathLength = Math.min(252, returns.length);
    const finalValues = [];
    let ruinCount = 0;

    for (let p = 0; p < numPaths; p++) {
      let capital = initialCapital;
      // Random sampling with replacement
      for (let d = 0; d < pathLength; d++) {
        const randomIdx = Math.floor(Math.random() * returns.length);
        capital *= (1 + returns[randomIdx]);

        // Check for ruin
        if (capital < initialCapital * (1 - RUIN_THRESHOLD)) {
          ruinCount++;
          break;
        }
      }
      finalValues.push(capital);
    }

    // Calculate statistics
    const avgFinal = finalValues.reduce((a, b) => a + b, 0) / numPaths;
    const medianFinal = [...finalValues].sort((a, b) => a - b)[Math.floor(numPaths / 2)];
    const minFinal = Math.min(...finalValues);
    const maxFinal = Math.max(...finalValues);

    // Ergodicity gap: difference between ensemble average and time average
    const ergodicityGap = (avgFinal - medianFinal) / avgFinal;

    return {
      ensembleAverage: Math.round(avgFinal),
      medianOutcome: Math.round(medianFinal),
      worstPath: Math.round(minFinal),
      bestPath: Math.round(maxFinal),
      ergodicityGap: Math.round(ergodicityGap * 100),
      ruinProbability: Math.round((ruinCount / numPaths) * 100),
      talebInsight: ergodicityGap > 0.1
        ? 'CRITICAL: Large ergodicity gap. The "expected" return is not what you will experience. Focus on median, not mean.'
        : ergodicityGap > 0.05
        ? 'CAUTION: Moderate ergodicity gap. Your actual outcome will likely be below the average.'
        : 'Ergodicity gap is manageable, but still prioritize survival over optimization.',
      nonErgodicityExplainer: 'In non-ergodic systems, the ensemble average (what happens across many people) differs from the time average (what happens to you over time). Ruin is absorbing - you cannot recover.'
    };
  }

  // Calculate truly safe Kelly fraction
  _calculateSafeKellyFraction(returns, evtAnalysis) {
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n;

    // Traditional Kelly
    const traditionalKelly = variance > 0 ? mean / variance : 0;

    // Adjust for fat tails - reduce Kelly proportionally to excess kurtosis
    const kurtosisAdjustment = evtAnalysis.kurtosis > 3
      ? 3 / evtAnalysis.kurtosis
      : 1;

    // Adjust for tail index - lower index = more reduction
    const tailAdjustment = evtAnalysis.tailIndex < 4
      ? evtAnalysis.tailIndex / 4
      : 1;

    // Adjusted Kelly
    const adjustedKelly = traditionalKelly * kurtosisAdjustment * tailAdjustment;

    // Apply hard cap (Spitznagel recommendation)
    const cappedKelly = Math.min(adjustedKelly, MAX_SAFE_KELLY);

    // Final recommendation
    const recommendedKelly = Math.max(0.05, Math.min(cappedKelly, 0.25));

    return {
      traditionalKelly: Math.round(traditionalKelly * 100) / 100,
      kurtosisAdjusted: Math.round((traditionalKelly * kurtosisAdjustment) * 100) / 100,
      tailAdjusted: Math.round(adjustedKelly * 100) / 100,
      recommended: Math.round(recommendedKelly * 100) / 100,
      maxSafe: MAX_SAFE_KELLY,
      adjustments: {
        kurtosisMultiplier: Math.round(kurtosisAdjustment * 100) / 100,
        tailMultiplier: Math.round(tailAdjustment * 100) / 100
      },
      warning: traditionalKelly > 0.5
        ? 'DANGER: Traditional Kelly suggests aggressive sizing. This assumes Gaussian returns and ergodicity - both false. Use recommended fraction.'
        : traditionalKelly > 0.25
        ? 'CAUTION: Traditional Kelly suggests moderate sizing. Apply safety margin.'
        : null
    };
  }

  // Portfolio convexity analysis
  _analyzePortfolioConvexity(returns) {
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n);

    // Calculate skewness
    const skewness = stdDev > 0
      ? returns.reduce((s, r) => s + Math.pow((r - mean) / stdDev, 3), 0) / n
      : 0;

    // Analyze upside vs downside capture
    const positiveReturns = returns.filter(r => r > 0);
    const negativeReturns = returns.filter(r => r < 0);

    const avgUpside = positiveReturns.length > 0
      ? positiveReturns.reduce((a, b) => a + b, 0) / positiveReturns.length
      : 0;
    const avgDownside = negativeReturns.length > 0
      ? Math.abs(negativeReturns.reduce((a, b) => a + b, 0) / negativeReturns.length)
      : 0;

    const upsideDownsideRatio = avgDownside > 0 ? avgUpside / avgDownside : 1;

    // Convexity score: positive = antifragile, negative = fragile
    const convexityScore = (skewness * 20) + ((upsideDownsideRatio - 1) * 30);

    return {
      skewness: Math.round(skewness * 100) / 100,
      upsideDownsideRatio: Math.round(upsideDownsideRatio * 100) / 100,
      avgUpside: Math.round(avgUpside * 10000) / 100,
      avgDownside: Math.round(avgDownside * 10000) / 100,
      convexityScore: Math.round(convexityScore),
      interpretation: convexityScore > 10
        ? 'Positive convexity - gains tend to exceed losses'
        : convexityScore < -10
        ? 'Negative convexity - losses tend to exceed gains (fragile)'
        : 'Neutral convexity',
      talebRecommendation: convexityScore < 0
        ? 'Add positions with positive skew to improve portfolio convexity'
        : 'Convexity is acceptable but consider tail hedges for protection'
    };
  }

  _generateTalebWarnings(evtAnalysis, pathDependency, safeKelly) {
    const warnings = [];

    if (evtAnalysis.isFatTailed) {
      warnings.push({
        severity: 'high',
        category: 'fat_tails',
        message: `Fat tails detected (kurtosis: ${evtAnalysis.kurtosis}). Your risk is ${evtAnalysis.gaussianVsRealityRatio}x higher than Gaussian models suggest.`
      });
    }

    if (pathDependency.ruinProbability > 5) {
      warnings.push({
        severity: 'critical',
        category: 'ruin_risk',
        message: `${pathDependency.ruinProbability}% probability of 50%+ drawdown in simulations. Reduce position sizing immediately.`
      });
    }

    if (pathDependency.ergodicityGap > 10) {
      warnings.push({
        severity: 'high',
        category: 'non_ergodicity',
        message: 'Large gap between average and median outcomes. Do not use expected returns for planning - use median.'
      });
    }

    if (safeKelly.traditionalKelly > 0.5) {
      warnings.push({
        severity: 'high',
        category: 'kelly_danger',
        message: `Traditional Kelly (${safeKelly.traditionalKelly}) is dangerously high. Capped at ${safeKelly.recommended} for safety.`
      });
    }

    if (warnings.length === 0) {
      warnings.push({
        severity: 'info',
        category: 'general',
        message: 'No critical risks detected, but maintain conservative sizing. Black swans are by definition unexpected.'
      });
    }

    return warnings;
  }

  _getSpitznagelRecommendation(safeKelly, evtAnalysis) {
    const fraction = safeKelly.recommended;

    if (evtAnalysis.isFatTailed && evtAnalysis.kurtosis > 6) {
      return {
        recommendation: 'MINIMAL EXPOSURE',
        kellyFraction: 0.10,
        rationale: 'Extreme fat tails detected. Use 10% Kelly or less. Consider tail hedge overlay.',
        action: 'Reduce equity exposure significantly. Add explicit tail protection (OTM puts, VIX calls).'
      };
    } else if (fraction <= 0.15) {
      return {
        recommendation: 'VERY CONSERVATIVE',
        kellyFraction: fraction,
        rationale: 'Risk metrics suggest minimal sizing. This protects against ruin.',
        action: 'Maintain small positions. Focus on survival over returns.'
      };
    } else if (fraction <= 0.25) {
      return {
        recommendation: 'CONSERVATIVE (SPITZNAGEL OPTIMAL)',
        kellyFraction: fraction,
        rationale: 'Quarter Kelly is the sweet spot - captures most of the growth with fraction of the risk.',
        action: 'This is the recommended approach. Rebalance monthly.'
      };
    } else {
      return {
        recommendation: 'CAPPED AT SAFE MAXIMUM',
        kellyFraction: MAX_SAFE_KELLY,
        rationale: 'Even favorable metrics warrant caution. Historical data underestimates tail risk.',
        action: `Using ${MAX_SAFE_KELLY * 100}% Kelly cap. Never exceed this regardless of apparent edge.`
      };
    }
  }

  // ============================================
  // Single Holding Kelly Analysis
  // Analyze Kelly sizing for a single stock (existing or potential)
  // ============================================
  async analyzeSingleHolding(params = {}) {
    const database = await getDatabaseAsync();

    const {
      symbol,
      portfolioId = null,
      period = this.config.DEFAULT_PERIOD,
      kellyFractions = this.config.DEFAULT_KELLY_FRACTIONS,
      riskFreeRate = this.config.RISK_FREE_RATE,
      benchmarkSymbol = 'SPY'
    } = params;

    if (!symbol) {
      return { error: 'Symbol is required' };
    }

    this._currentRiskFreeRate = riskFreeRate;

    // Look up company
    const companyResult = await database.query(`
      SELECT id, symbol, name, sector
      FROM companies
      WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);

    const company = companyResult.rows[0];

    if (!company) {
      return { error: `Company not found: ${symbol}` };
    }

    // Get price history
    const { startDate } = this._getPeriodDates(period);
    const pricesResult = await database.query(`
      SELECT date, adjusted_close, close
      FROM daily_prices
      WHERE company_id = $1 AND date >= $2
      ORDER BY date ASC
    `, [company.id, startDate]);

    const prices = pricesResult.rows;

    if (prices.length < MIN_OBSERVATIONS_FOR_KELLY) {
      return {
        error: `Insufficient price history for ${symbol}. Need at least ${MIN_OBSERVATIONS_FOR_KELLY} days.`,
        daysAvailable: prices.length
      };
    }

    // Calculate daily returns
    const returns = [];
    const dates = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1].adjusted_close || prices[i - 1].close;
      const curr = prices[i].adjusted_close || prices[i].close;
      if (prev && curr) {
        returns.push((curr - prev) / prev);
        dates.push(prices[i].date);
      }
    }

    // Calculate statistics
    const tradingDays = this.config.TRADING_DAYS_PER_YEAR;
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const annualReturn = meanReturn * tradingDays;
    const annualVol = Math.sqrt(variance * tradingDays);

    // Win/Loss statistics
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0);
    const winRate = wins.length / returns.length;
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;

    // Classic Kelly: f* = (bp - q) / b
    // Handle edge case where avgLoss = 0 (no historical losses)
    let classicKelly;
    let kellyWarning = null;

    if (avgLoss === 0 && winRate === 1) {
      // Perfect win rate - theoretical Kelly is infinite, cap at 100%
      classicKelly = 1.0;
      kellyWarning = 'Perfect historical win rate - unlikely to repeat. Use maximum caution.';
    } else if (avgLoss === 0) {
      // No losses but not 100% win rate (some neutral days)
      classicKelly = winRate;
      kellyWarning = 'No historical losses observed - data may be insufficient.';
    } else {
      const b = avgWin / avgLoss;
      classicKelly = b > 0 ? ((b * winRate) - (1 - winRate)) / b : 0;
    }

    // Continuous Kelly: f* = (μ - r) / σ²
    const continuousKelly = variance > 0 ? (annualReturn - riskFreeRate) / (annualVol * annualVol) : 0;

    // Sharpe ratio
    const sharpe = annualVol > 0 ? (annualReturn - riskFreeRate) / annualVol : 0;

    // Tail analysis for this holding - now with parametric distribution fitting
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95 = sortedReturns[Math.floor(returns.length * 0.05)];
    const var99 = sortedReturns[Math.floor(returns.length * 0.01)];
    const maxLoss = Math.min(...returns);

    // Parametric distribution analysis - fits best distribution to return data
    let distributionAnalysis = null;
    let cornishFisherVaR = null;
    const stdDev = Math.sqrt(variance);
    let kurtosis = 3;
    let skewness = 0;

    try {
      // Fit parametric distribution to returns
      const distFit = ParametricDistributions.findBestFit(returns);
      const moments = ParametricDistributions.calculateMoments(returns);

      kurtosis = moments.kurtosis || 3;
      skewness = moments.skewness || 0;

      // Cornish-Fisher VaR adjustment for non-normal returns
      const cfVaR95 = ParametricDistributions.cornishFisherVaR(
        meanReturn, stdDev, skewness, kurtosis, 0.95
      );
      const cfVaR99 = ParametricDistributions.cornishFisherVaR(
        meanReturn, stdDev, skewness, kurtosis, 0.99
      );

      cornishFisherVaR = {
        var95: {
          normal: Math.round(cfVaR95.normalVaR * 10000) / 100,
          adjusted: Math.round(cfVaR95.adjustedVaR * 10000) / 100,
          adjustmentPct: Math.round(cfVaR95.adjustmentPercent * 100) / 100
        },
        var99: {
          normal: Math.round(cfVaR99.normalVaR * 10000) / 100,
          adjusted: Math.round(cfVaR99.adjustedVaR * 10000) / 100,
          adjustmentPct: Math.round(cfVaR99.adjustmentPercent * 100) / 100
        }
      };

      distributionAnalysis = {
        bestFit: distFit.type,
        params: distFit.params,
        goodnessOfFit: distFit.goodnessOfFit,
        moments: {
          mean: Math.round(moments.mean * 10000) / 100,
          std: Math.round(moments.std * 10000) / 100,
          skewness: Math.round(skewness * 100) / 100,
          kurtosis: Math.round(kurtosis * 100) / 100,
          excessKurtosis: Math.round((kurtosis - 3) * 100) / 100
        },
        interpretation: this._interpretDistribution(distFit.type, skewness, kurtosis)
      };
    } catch (err) {
      // Fallback to simple kurtosis calculation if distribution fitting fails
      kurtosis = stdDev > 0
        ? returns.reduce((s, r) => s + Math.pow((r - meanReturn) / stdDev, 4), 0) / returns.length
        : 3;
    }

    // Kelly fraction analysis
    // Kelly growth formula: E[g] = f*μ - f²*σ²/2 (using annualized values)
    const fractionAnalysis = kellyFractions.map(fraction => {
      const kellyGrowth = (fraction * annualReturn) - (fraction * fraction * annualVol * annualVol) / 2;
      const expectedMaxDD = fraction * annualVol * 2;
      const riskOf50DD = fraction > 0.5 ? Math.min(99, Math.pow(fraction / 0.5, 2) * 15) : fraction * 20;

      return {
        fraction,
        kellyGrowth: Math.round(kellyGrowth * 10000) / 100,
        expectedReturn: Math.round(fraction * annualReturn * 10000) / 100,
        expectedVolatility: Math.round(fraction * annualVol * 10000) / 100,
        expectedMaxDrawdown: Math.round(expectedMaxDD * 10000) / 100,
        riskOf50pctDrawdown: Math.round(riskOf50DD)
      };
    });

    // Benchmark comparison
    let benchmarkComparison = null;
    const benchmarkResult = await database.query(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [benchmarkSymbol]);

    const benchmark = benchmarkResult.rows[0];

    if (benchmark) {
      const benchPricesResult = await database.query(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = $1 AND date >= $2
        ORDER BY date ASC
      `, [benchmark.id, startDate]);

      const benchPrices = benchPricesResult.rows;

      if (benchPrices.length > MIN_OBSERVATIONS_FOR_KELLY) {
        const benchReturns = [];
        for (let i = 1; i < benchPrices.length; i++) {
          const prev = benchPrices[i - 1].adjusted_close || benchPrices[i - 1].close;
          const curr = benchPrices[i].adjusted_close || benchPrices[i].close;
          if (prev && curr) benchReturns.push((curr - prev) / prev);
        }
        const benchMean = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
        const benchVar = benchReturns.reduce((s, r) => s + Math.pow(r - benchMean, 2), 0) / benchReturns.length;
        const benchAnnualReturn = benchMean * tradingDays;
        const benchAnnualVol = Math.sqrt(benchVar * tradingDays);

        // Beta calculation
        const minLen = Math.min(returns.length, benchReturns.length);
        let covariance = 0;
        for (let i = 0; i < minLen; i++) {
          covariance += (returns[i] - meanReturn) * (benchReturns[i] - benchMean);
        }
        covariance /= minLen;
        const beta = benchVar > 0 ? covariance / benchVar : 1;
        const alpha = annualReturn - (riskFreeRate + beta * (benchAnnualReturn - riskFreeRate));

        benchmarkComparison = {
          benchmark: benchmarkSymbol,
          beta: Math.round(beta * 100) / 100,
          alpha: Math.round(alpha * 10000) / 100,
          benchmarkReturn: Math.round(benchAnnualReturn * 10000) / 100,
          benchmarkVol: Math.round(benchAnnualVol * 10000) / 100,
          excessReturn: Math.round((annualReturn - benchAnnualReturn) * 10000) / 100
        };
      }
    }

    // Portfolio context
    let portfolioContext = null;
    if (portfolioId) {
      const positions = await this._getPortfolioPositions(portfolioId);
      const existingPosition = positions.find(p => p.symbol.toUpperCase() === symbol.toUpperCase());

      if (existingPosition) {
        const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
        portfolioContext = {
          currentShares: existingPosition.shares,
          currentValue: Math.round(existingPosition.value * 100) / 100,
          currentWeight: totalValue > 0 ? Math.round((existingPosition.value / totalValue) * 10000) / 100 : 0,
          isExisting: true
        };
      } else {
        portfolioContext = {
          isExisting: false,
          message: 'Stock not currently in portfolio'
        };
      }
    }

    // Safe Kelly recommendation (Taleb-adjusted) - now includes skewness
    const safeKelly = this._calculateSafeKellyForHolding(classicKelly, continuousKelly, sharpe, annualVol, kurtosis, skewness);

    return {
      symbol: company.symbol,
      name: company.name,
      sector: company.sector,
      period,
      tradingDays: returns.length,
      startDate,
      endDate: dates[dates.length - 1],
      statistics: {
        annualReturn: Math.round(annualReturn * 10000) / 100,
        annualVolatility: Math.round(annualVol * 10000) / 100,
        sharpeRatio: Math.round(sharpe * 100) / 100,
        winRate: Math.round(winRate * 10000) / 100,
        avgWin: Math.round(avgWin * 10000) / 100,
        avgLoss: Math.round(avgLoss * 10000) / 100,
        winLossRatio: avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : 0,
        skewness: Math.round(skewness * 100) / 100
      },
      tailRisk: {
        var95: Math.round(var95 * 10000) / 100,
        var99: Math.round(var99 * 10000) / 100,
        maxObservedLoss: Math.round(maxLoss * 10000) / 100,
        kurtosis: Math.round(kurtosis * 100) / 100,
        isFatTailed: kurtosis > 4,
        isNegativelySkewed: skewness < -0.5,
        warning: this._getTailRiskWarning(kurtosis, skewness)
      },
      // NEW: Parametric distribution analysis
      distributionAnalysis,
      // NEW: Cornish-Fisher adjusted VaR (accounts for skewness & kurtosis)
      cornishFisherVaR,
      kelly: {
        // Classic Kelly capped at 100% (theoretical max)
        classic: Math.round(Math.max(0, Math.min(1, classicKelly)) * 10000) / 100,
        // Continuous Kelly capped at 100% (values above are mathematically possible but practically meaningless)
        continuous: Math.round(Math.max(0, Math.min(1, continuousKelly)) * 10000) / 100,
        // Raw uncapped values for transparency
        classicRaw: Math.round(classicKelly * 10000) / 100,
        continuousRaw: Math.round(continuousKelly * 10000) / 100,
        recommended: safeKelly,
        // Warning for edge cases (e.g., no historical losses)
        warning: kellyWarning
      },
      fractionAnalysis,
      benchmarkComparison,
      portfolioContext,
      parameters: {
        riskFreeRate: Math.round(riskFreeRate * 10000) / 100,
        period,
        kellyFractions
      }
    };
  }

  _calculateSafeKellyForHolding(classicKelly, continuousKelly, sharpe, volatility, kurtosis, skewness = 0) {
    const baseKelly = Math.min(classicKelly, continuousKelly);

    // Kurtosis adjustment - fat tails mean underestimated risk
    const kurtosisAdj = kurtosis > 3 ? 3 / kurtosis : 1;

    // Skewness adjustment - negative skew means larger downside risk
    // Reduce Kelly for negatively skewed returns (crash risk)
    let skewAdj = 1;
    if (skewness < -1) skewAdj = 0.5;        // Severe negative skew
    else if (skewness < -0.5) skewAdj = 0.7; // Moderate negative skew
    else if (skewness > 0.5) skewAdj = 1.1;  // Positive skew is favorable (capped at 1.1)

    // Volatility adjustment
    let volAdj = 1;
    if (volatility > 0.4) volAdj = 0.5;
    else if (volatility > 0.25) volAdj = 0.75;

    // Sharpe adjustment
    let sharpeAdj = 1;
    if (sharpe < 0.5) sharpeAdj = 0.5;
    else if (sharpe < 1.0) sharpeAdj = 0.75;

    const adjustedKelly = baseKelly * kurtosisAdj * skewAdj * volAdj * sharpeAdj;
    const finalKelly = Math.max(0.05, Math.min(MAX_SAFE_KELLY, adjustedKelly));

    let recommendation;
    let reason;
    if (sharpe < 0) {
      recommendation = { fraction: 0, label: 'Avoid', reason: 'Negative risk-adjusted returns' };
    } else if (finalKelly >= 0.20) {
      reason = 'Favorable metrics';
      if (skewness > 0.3) reason += ' with positive skew';
      recommendation = { fraction: 0.25, label: 'Quarter Kelly', reason };
    } else if (finalKelly >= 0.10) {
      reason = 'Moderate opportunity';
      if (skewness < -0.5) reason += ' - reduced for negative skew';
      else if (kurtosis > 4) reason += ' - reduced for fat tails';
      recommendation = { fraction: 0.10, label: 'Tenth Kelly', reason };
    } else {
      reason = 'Conservative sizing recommended';
      if (skewness < -0.5 && kurtosis > 4) reason = 'Fat tails + negative skew = high tail risk';
      else if (skewness < -0.5) reason = 'Negative skew increases downside risk';
      else if (kurtosis > 5) reason = 'Extreme fat tails detected';
      recommendation = { fraction: 0.05, label: 'Minimal', reason };
    }

    recommendation.adjustments = {
      kurtosis: Math.round(kurtosisAdj * 100) / 100,
      skewness: Math.round(skewAdj * 100) / 100,
      volatility: Math.round(volAdj * 100) / 100,
      sharpe: Math.round(sharpeAdj * 100) / 100
    };

    return recommendation;
  }

  // Helper: Interpret distribution type for investors
  _interpretDistribution(type, skewness, kurtosis) {
    const interpretations = [];

    // Distribution type interpretation
    switch (type) {
      case 'normal':
        interpretations.push('Returns follow a normal distribution - standard risk models apply');
        break;
      case 'studentT':
        interpretations.push('Returns show fat tails (Student\'s t) - extreme moves more likely than normal');
        break;
      case 'skewedT':
        interpretations.push('Returns show both fat tails and asymmetry - complex risk profile');
        break;
      case 'johnsonSU':
        interpretations.push('Returns require Johnson SU fit - highly non-normal behavior');
        break;
      default:
        interpretations.push('Distribution type not determined');
    }

    // Skewness interpretation
    if (skewness < -0.5) {
      interpretations.push('Negative skew: Losses tend to be larger than gains (crash risk)');
    } else if (skewness > 0.5) {
      interpretations.push('Positive skew: Gains tend to be larger than losses (favorable)');
    }

    // Kurtosis interpretation
    if (kurtosis > 6) {
      interpretations.push('Very high kurtosis: Extreme events much more frequent than normal');
    } else if (kurtosis > 4) {
      interpretations.push('High kurtosis: Fat tails present - VaR may underestimate risk');
    }

    return interpretations;
  }

  // Helper: Generate tail risk warning
  _getTailRiskWarning(kurtosis, skewness) {
    if (kurtosis > 6 && skewness < -0.5) {
      return 'DANGER: Extreme fat tails + negative skew = high crash risk';
    } else if (kurtosis > 6) {
      return 'DANGER: Extreme fat tails - standard VaR unreliable';
    } else if (kurtosis > 4 && skewness < -0.5) {
      return 'CAUTION: Fat tails with negative skew - elevated crash risk';
    } else if (kurtosis > 4) {
      return 'CAUTION: Fat tails detected - consider Cornish-Fisher VaR';
    } else if (skewness < -0.5) {
      return 'NOTE: Negative skew - losses tend to exceed gains';
    }
    return null;
  }

  // ============================================
  // Multi-Asset Kelly Allocation
  // Returns optimal weights using full covariance matrix
  // ============================================
  async getMultiAssetAllocation(portfolioId, params = {}) {
    const {
      period = '3y',
      kellyFraction = 0.25,
      riskFreeRate = 0.05
    } = params;

    const positions = await this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = await this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < MIN_OBSERVATIONS_FOR_KELLY) {
      return {
        error: `Insufficient data. Need ${MIN_OBSERVATIONS_FOR_KELLY} days, have ${dates.length}.`
      };
    }

    const symbols = positions.map(p => p.symbol);
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
    const currentWeights = positions.map(p => totalValue > 0 ? p.value / totalValue : 1 / positions.length);

    // Build returns arrays for each symbol
    const returnsArrays = symbols.map(sym => {
      return dates.map(date => {
        const idx = returns[sym]?.dates.indexOf(date);
        return idx >= 0 ? returns[sym].returns[idx] : 0;
      });
    });

    // Calculate full covariance matrix
    const n = symbols.length;
    const minLen = dates.length;
    const means = returnsArrays.map(r => r.reduce((a, b) => a + b, 0) / r.length);

    const covMatrix = [];
    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < minLen; k++) {
          sum += (returnsArrays[i][k] - means[i]) * (returnsArrays[j][k] - means[j]);
        }
        covMatrix[i][j] = sum / (minLen - 1);
      }
    }

    // Build correlation matrix from covariance
    const correlationMatrix = [];
    for (let i = 0; i < n; i++) {
      correlationMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        const stdI = Math.sqrt(covMatrix[i][i]);
        const stdJ = Math.sqrt(covMatrix[j][j]);
        correlationMatrix[i][j] = stdI > 0 && stdJ > 0
          ? Math.round((covMatrix[i][j] / (stdI * stdJ)) * 100) / 100
          : i === j ? 1 : 0;
      }
    }

    // Use MatrixOps for Kelly calculation with regularization
    let optimalWeights;
    let method = 'full_matrix';
    try {
      const MatrixOps = require('../../utils/matrixOps');
      const kellyResult = MatrixOps.computeKellyWeights(covMatrix, means, {
        maxConditionNumber: 1000,
        regularizationMethod: 'tikhonov',
        fallbackToDiagonal: true
      });
      optimalWeights = kellyResult.weights;
      method = kellyResult.method;
    } catch (err) {
      // Fallback to diagonal approximation
      optimalWeights = means.map((m, i) => {
        const variance = covMatrix[i][i];
        return variance > 0 ? m / variance : 0;
      });
      method = 'diagonal_fallback';
    }

    // Apply Kelly fraction and normalize
    optimalWeights = optimalWeights.map(w => w * kellyFraction);
    optimalWeights = optimalWeights.map(w => Math.max(0, w)); // No short positions

    const sumWeights = optimalWeights.reduce((a, b) => a + b, 0);
    if (sumWeights > 0) {
      optimalWeights = optimalWeights.map(w => w / sumWeights);
    } else {
      optimalWeights = new Array(n).fill(1 / n);
    }

    // Calculate risk contribution per asset
    const portfolioStd = Math.sqrt(
      optimalWeights.reduce((sum, wi, i) =>
        sum + optimalWeights.reduce((inner, wj, j) =>
          inner + wi * wj * covMatrix[i][j], 0
        ), 0
      )
    );

    const riskContribution = symbols.map((sym, i) => {
      const marginalContrib = optimalWeights.reduce((sum, wj, j) =>
        sum + wj * covMatrix[i][j], 0
      ) / (portfolioStd || 1);
      return {
        symbol: sym,
        contribution: Math.max(0, (optimalWeights[i] * marginalContrib) / (portfolioStd || 1))
      };
    });

    // Normalize risk contributions
    const totalRiskContrib = riskContribution.reduce((a, b) => a + b.contribution, 0);
    if (totalRiskContrib > 0) {
      riskContribution.forEach(r => r.contribution = r.contribution / totalRiskContrib);
    }

    // Calculate diversification ratio
    const weightedAvgVol = symbols.reduce((sum, sym, i) =>
      sum + optimalWeights[i] * Math.sqrt(covMatrix[i][i]), 0
    );
    const diversificationRatio = portfolioStd > 0 ? weightedAvgVol / portfolioStd : 1;

    return {
      portfolioId,
      period,
      tradingDays: dates.length,
      method,
      optimalWeights: symbols.map((sym, i) => ({
        symbol: sym,
        currentWeight: currentWeights[i],
        optimalWeight: optimalWeights[i],
        delta: optimalWeights[i] - currentWeights[i],
        annualReturn: means[i] * 252,
        annualVol: Math.sqrt(covMatrix[i][i]) * Math.sqrt(252)
      })),
      correlationMatrix,
      riskContribution,
      diversificationRatio: Math.round(diversificationRatio * 100) / 100,
      portfolioMetrics: {
        expectedReturn: means.reduce((sum, m, i) => sum + optimalWeights[i] * m, 0) * 252,
        expectedVol: portfolioStd * Math.sqrt(252),
        sharpeRatio: portfolioStd > 0
          ? (means.reduce((sum, m, i) => sum + optimalWeights[i] * m, 0) * 252 - riskFreeRate) / (portfolioStd * Math.sqrt(252))
          : 0
      }
    };
  }
}

module.exports = new AdvancedKelly();
