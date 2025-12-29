// src/services/portfolio/advancedKelly.js
// Advanced Kelly Criterion Analytics with Historical Data

const db = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.05; // 5% annual risk-free rate

class AdvancedKelly {
  constructor() {
    this.db = db.getDatabase();
    console.log('🎯 Advanced Kelly Engine initialized');
  }

  // ============================================
  // Historical Kelly Backtest
  // Test Kelly sizing with actual historical returns
  // ============================================
  historicalKellyBacktest(portfolioId, params = {}) {
    const {
      period = '3y',
      kellyFractions = [0.25, 0.5, 0.75, 1.0], // Test multiple fractions
      rebalanceFrequency = 'monthly', // daily, weekly, monthly, quarterly
      initialCapital = 100000
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadDailyReturns(positions, startDate);

    if (Object.keys(returns).length === 0) {
      return { error: 'No historical price data available' };
    }

    // Get aligned dates across all positions
    const dates = this._getAlignedDates(returns);
    if (dates.length < 60) {
      return { error: 'Insufficient historical data (need at least 60 days)' };
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
      recommendation: this._getKellyRecommendation(results)
    };
  }

  // ============================================
  // Multi-Asset Kelly Optimization
  // Find optimal weights maximizing geometric growth rate
  // ============================================
  optimizeKellyWeights(portfolioId, params = {}) {
    const {
      period = '3y',
      targetVolatility = null, // Optional vol constraint
      maxWeight = 0.40, // Max 40% in any single position
      minWeight = 0.02, // Min 2% if included
      leverageAllowed = false
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 2) {
      return { error: 'Need at least 2 positions for optimization' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadDailyReturns(positions, startDate);
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
        expectedReturn: stats.meanReturns[i] * TRADING_DAYS_PER_YEAR * 100,
        volatility: Math.sqrt(stats.covariance[i][i] * TRADING_DAYS_PER_YEAR) * 100
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
  regimeAwareKelly(portfolioId, params = {}) {
    const {
      period = '5y',
      regimeWindow = 60, // Days to assess regime
      volatilityThresholds = { low: 15, high: 25 } // Annualized vol thresholds
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadDailyReturns(positions, startDate);
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
  kellyDrawdownAnalysis(portfolioId, params = {}) {
    const {
      period = '5y',
      kellyFractions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5],
      initialCapital = 100000
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadDailyReturns(positions, startDate);
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
  compareKellyStrategies(portfolioId, params = {}) {
    const {
      period = '5y',
      initialCapital = 100000,
      rebalanceFrequency = 'monthly'
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadDailyReturns(positions, startDate);
    const dates = this._getAlignedDates(returns);

    if (dates.length < 252) {
      return { error: 'Need at least 1 year of data for comparison' };
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

  _getPortfolioPositions(portfolioId) {
    return this.db.prepare(`
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
      WHERE pp.portfolio_id = ?
    `).all(portfolioId).map(pos => ({
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

  _loadDailyReturns(positions, startDate) {
    const returns = {};

    for (const pos of positions) {
      const prices = this.db.prepare(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = ? AND date >= ?
        ORDER BY date ASC
      `).all(pos.company_id, startDate);

      if (prices.length < 2) continue;

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

    return returns;
  }

  _getAlignedDates(returns) {
    const symbols = Object.keys(returns);
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

  _calculateKellyWeights(returnsArrays, kellyFraction) {
    const n = returnsArrays.length;
    if (n === 0 || returnsArrays.some(r => r.length === 0)) {
      return new Array(n).fill(1 / n);
    }

    // Calculate mean returns and covariance
    const means = returnsArrays.map(r => r.reduce((a, b) => a + b, 0) / r.length);
    const minLen = Math.min(...returnsArrays.map(r => r.length));

    // Covariance matrix
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
    // Simplified: use diagonal covariance approximation for stability
    let weights = means.map((m, i) => {
      const variance = cov[i][i];
      if (variance <= 0) return 0;
      return m / variance;
    });

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
    let weights = positions.map(p => totalValue > 0 ? p.value / totalValue : 1 / n);

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
          return Math.sqrt(variance * TRADING_DAYS_PER_YEAR) || 1;
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
    const volatility = Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;

    // CAGR
    const years = equityCurve.length / TRADING_DAYS_PER_YEAR;
    const cagr = (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;

    // Sharpe Ratio
    const annualizedReturn = meanReturn * TRADING_DAYS_PER_YEAR;
    const annualizedVol = Math.sqrt(variance * TRADING_DAYS_PER_YEAR);
    const sharpe = annualizedVol > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualizedVol : 0;

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

    // Expected return (annualized)
    const expectedReturn = weights.reduce((sum, w, i) =>
      sum + w * stats.meanReturns[i], 0) * TRADING_DAYS_PER_YEAR;

    // Variance
    let variance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * stats.covariance[i][j];
      }
    }
    const volatility = Math.sqrt(variance * TRADING_DAYS_PER_YEAR);

    const sharpe = volatility > 0 ? (expectedReturn - RISK_FREE_RATE) / volatility : 0;

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
      let volatilities = [];

      for (const sym of symbols) {
        const idx = returns[sym].dates.indexOf(dates[d]);
        if (idx >= window) {
          const windowReturns = returns[sym].returns.slice(idx - window, idx);
          const meanRet = windowReturns.reduce((a, b) => a + b, 0) / window;
          const variance = windowReturns.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / window;
          totalReturn += meanRet * TRADING_DAYS_PER_YEAR * 100;
          volatilities.push(Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100);
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
    const fullKelly = analysis.find(a => a.kellyFraction === 1.0);

    if (!halfKelly) return 'Insufficient data';

    if (Math.abs(halfKelly.maxDrawdown) > 40) {
      return 'High drawdown risk detected. Consider Quarter Kelly (0.25) or lower for this portfolio.';
    } else if (Math.abs(halfKelly.maxDrawdown) > 25) {
      return 'Moderate drawdown risk. Half Kelly (0.5) is appropriate but monitor closely.';
    } else {
      if (fullKelly && Math.abs(fullKelly.maxDrawdown) < 30 && fullKelly.cagr > halfKelly.cagr * 1.3) {
        return 'Low drawdown risk. Could consider 0.75 Kelly for higher returns.';
      }
      return 'Low drawdown risk. Half Kelly (0.5) provides good balance.';
    }
  }
}

module.exports = new AdvancedKelly();
