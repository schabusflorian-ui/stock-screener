// src/services/backtesting/factorBacktestEngine.js
// Factor Combination Backtester - Tests weighted factor combinations historically

const { getDatabaseAsync } = require('../../lib/db');
const { calculateMetrics } = require('./walkForwardEngine');

/**
 * FactorBacktestEngine
 *
 * Backtests factor combinations:
 * - User specifies weights for Value, Quality, Momentum, Growth, Size, Volatility
 * - Engine calculates combined scores and selects top stocks
 * - Simulates portfolio with periodic rebalancing
 * - Returns performance metrics, equity curve, and trade history
 */
class FactorBacktestEngine {
  constructor(options = {}) {
    this.database = null;
    this.options = {
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
      initialCapital: 100000,
      transactionCosts: 0.001, // 10 bps
      slippage: 0.0005, // 5 bps
      ...options
    };
  }

  async _getDatabase() {
    if (!this.database) {
      this.database = await getDatabaseAsync();
    }
    return this.database;
  }

  /**
   * Run factor combination backtest
   *
   * @param {Object} factorWeights - { value: 0.4, quality: 0.3, momentum: 0.3, ... }
   * @param {Object} config - Backtest configuration
   * @returns {Object} Backtest results
   */
  async runFactorBacktest(factorWeights, config = {}) {
    const {
      startDate = '2020-01-01',
      endDate = new Date().toISOString().split('T')[0],
      rebalanceFrequency = 'monthly', // monthly, quarterly
      topN = 20,
      minMarketCap = 1e9,
      benchmark = 'SPY',
      equalWeight = true
    } = config;

    const database = await this._getDatabase();

    console.log('\n' + '='.repeat(60));
    console.log('FACTOR COMBINATION BACKTEST');
    console.log('='.repeat(60));
    console.log('Factor Weights:', factorWeights);
    console.log(`Period: ${startDate} to ${endDate}`);
    console.log(`Rebalance: ${rebalanceFrequency}, Top ${topN} stocks`);

    // Normalize weights
    const normalizedWeights = this._normalizeWeights(factorWeights);
    console.log('Normalized Weights:', normalizedWeights);

    // Get benchmark prices for trading days
    const benchmarkPrices = await this._getBenchmarkPrices(database, benchmark, startDate, endDate);
    if (benchmarkPrices.length < 30) {
      throw new Error('Insufficient trading days for backtest');
    }

    // Get rebalance dates
    const rebalanceDates = await this._getRebalanceDatesAsync(database, benchmark, startDate, endDate, rebalanceFrequency);
    console.log(`Rebalance dates: ${rebalanceDates.length}`);

    // Initialize portfolio
    let capital = this.options.initialCapital;
    const positions = new Map(); // symbol -> { shares, avgPrice }
    const equityCurve = [];
    const trades = [];
    const dailyReturns = [];
    const holdingsHistory = [];

    let lastValue = capital;
    let currentHoldings = [];

    // Simulate each trading day
    for (let i = 0; i < benchmarkPrices.length; i++) {
      const date = benchmarkPrices[i].date;

      // Calculate portfolio value
      const portfolioValue = await this._calculatePortfolioValue(database, positions, date);
      const totalValue = capital + portfolioValue;

      // Calculate daily return
      if (lastValue > 0 && i > 0) {
        dailyReturns.push((totalValue - lastValue) / lastValue);
      }
      lastValue = totalValue;

      // Record equity curve
      equityCurve.push({
        date,
        value: totalValue,
        cash: capital,
        invested: portfolioValue,
        positions: positions.size
      });

      // Check if rebalance day
      if (rebalanceDates.includes(date)) {
        console.log(`\nRebalancing on ${date}...`);

        // Get factor scores and calculate combined score
        const rankedStocks = await this._getRankedStocks(database, date, normalizedWeights, minMarketCap);

        if (rankedStocks.length === 0) {
          console.log('  No stocks with factor scores available');
          continue;
        }

        // Select top N stocks
        const targetHoldings = rankedStocks.slice(0, topN);
        currentHoldings = targetHoldings;

        // Record holdings
        holdingsHistory.push({
          date,
          holdings: targetHoldings.map(h => ({
            symbol: h.symbol,
            combinedScore: h.combinedScore,
            factorScores: h.factorScores
          }))
        });

        // Calculate target weights
        const targetWeights = equalWeight
          ? targetHoldings.reduce((acc, h) => { acc[h.symbol] = 1 / topN; return acc; }, {})
          : this._calculateScoreWeights(targetHoldings);

        // Execute rebalance trades
        const rebalanceTrades = await this._executeRebalance(
          database,
          positions,
          targetWeights,
          totalValue,
          date
        );

        trades.push(...rebalanceTrades);

        // Update capital from trades
        for (const trade of rebalanceTrades) {
          if (trade.action === 'BUY') {
            capital -= trade.value * (1 + this.options.transactionCosts);
          } else if (trade.action === 'SELL') {
            capital += trade.value * (1 - this.options.transactionCosts);
          }
        }

        console.log(`  Holdings: ${positions.size} stocks, Total value: $${totalValue.toFixed(0)}`);
      }
    }

    // Calculate final metrics
    const metrics = calculateMetrics(dailyReturns, this.options.riskFreeRate);

    // Calculate benchmark metrics
    const benchmarkReturns = [];
    for (let i = 1; i < benchmarkPrices.length; i++) {
      benchmarkReturns.push(
        (benchmarkPrices[i].close - benchmarkPrices[i - 1].close) / benchmarkPrices[i - 1].close
      );
    }
    const benchmarkMetrics = calculateMetrics(benchmarkReturns, this.options.riskFreeRate);

    // Calculate alpha and beta
    const { alpha, beta } = this._calculateAlphaBeta(dailyReturns, benchmarkReturns);

    // Compile results
    const results = {
      factorWeights: normalizedWeights,
      config: { startDate, endDate, rebalanceFrequency, topN, minMarketCap, benchmark },
      initialCapital: this.options.initialCapital,
      finalValue: equityCurve[equityCurve.length - 1]?.value || this.options.initialCapital,
      totalReturn: ((equityCurve[equityCurve.length - 1]?.value || this.options.initialCapital) / this.options.initialCapital - 1) * 100,
      metrics: {
        ...metrics,
        alpha,
        beta,
        sharpe: metrics.sharpeRatio || 0,
        sortino: metrics.sortinoRatio || 0,
        maxDrawdown: metrics.maxDrawdown || 0,
        winRate: this._calculateWinRate(trades)
      },
      benchmarkMetrics: {
        ...benchmarkMetrics,
        totalReturn: ((benchmarkPrices[benchmarkPrices.length - 1]?.close || 1) / (benchmarkPrices[0]?.close || 1) - 1) * 100
      },
      equityCurve,
      trades,
      holdingsHistory,
      tradingDays: benchmarkPrices.length,
      rebalanceCount: rebalanceDates.length
    };

    this._printSummary(results);

    return results;
  }

  /**
   * Get benchmark prices from database
   */
  async _getBenchmarkPrices(database, symbol, startDate, endDate) {
    const result = await database.query(`
      SELECT dp.date, dp.close
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER($1)
        AND dp.date BETWEEN $2 AND $3
      ORDER BY dp.date ASC
    `, [symbol, startDate, endDate]);

    return result.rows;
  }

  /**
   * Get rebalance dates based on frequency (month-end or quarter-end)
   */
  async _getRebalanceDatesAsync(database, symbol, startDate, endDate, frequency) {
    const result = await database.query(`
      SELECT dp.date
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER($1)
        AND dp.date BETWEEN $2 AND $3
      ORDER BY dp.date ASC
    `, [symbol, startDate, endDate]);

    const allDates = result.rows.map(p => p.date);

    if (frequency === 'monthly') {
      // Last trading day of each month
      const monthlyDates = [];
      let currentMonth = null;
      let lastDate = null;

      for (const date of allDates) {
        const month = date.substring(0, 7);
        if (currentMonth && month !== currentMonth && lastDate) {
          monthlyDates.push(lastDate);
        }
        currentMonth = month;
        lastDate = date;
      }
      if (lastDate) monthlyDates.push(lastDate);

      return monthlyDates;
    } else if (frequency === 'quarterly') {
      // Last trading day of each quarter
      const quarterlyDates = [];
      let currentQuarter = null;
      let lastDate = null;

      for (const date of allDates) {
        const quarter = Math.floor((parseInt(date.substring(5, 7)) - 1) / 3);
        const year = date.substring(0, 4);
        const quarterKey = `${year}-Q${quarter}`;

        if (currentQuarter && quarterKey !== currentQuarter && lastDate) {
          quarterlyDates.push(lastDate);
        }
        currentQuarter = quarterKey;
        lastDate = date;
      }
      if (lastDate) quarterlyDates.push(lastDate);

      return quarterlyDates;
    }

    return allDates; // Daily
  }

  /**
   * Normalize factor weights to sum to 1
   */
  _normalizeWeights(weights) {
    const factors = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility'];
    const normalized = {};

    let sum = 0;
    for (const factor of factors) {
      const weight = weights[factor] || 0;
      normalized[factor] = Math.max(0, weight);
      sum += normalized[factor];
    }

    if (sum === 0) {
      // Default to equal weight if all zero
      for (const factor of factors) {
        normalized[factor] = 1 / factors.length;
      }
    } else {
      for (const factor of factors) {
        normalized[factor] = normalized[factor] / sum;
      }
    }

    return normalized;
  }

  /**
   * Get stocks ranked by combined factor score
   */
  async _getRankedStocks(database, date, weights, minMarketCap) {
    const result = await database.query(`
      SELECT
        sfs.symbol,
        sfs.company_id,
        sfs.value_percentile,
        sfs.quality_percentile,
        sfs.momentum_percentile,
        sfs.growth_percentile,
        sfs.size_percentile,
        sfs.volatility_score as volatility_percentile,
        c.market_cap,
        c.sector
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date <= $1
        AND sfs.score_date >= $1::date - INTERVAL '30 days'
        AND c.market_cap >= $2
      ORDER BY sfs.score_date DESC
    `, [date, minMarketCap]);

    const scores = result.rows;

    // Dedupe by symbol (keep most recent)
    const uniqueScores = new Map();
    for (const score of scores) {
      if (!uniqueScores.has(score.symbol)) {
        uniqueScores.set(score.symbol, score);
      }
    }

    // Calculate combined score
    const ranked = Array.from(uniqueScores.values()).map(stock => {
      const factorScores = {
        value: stock.value_percentile || 50,
        quality: stock.quality_percentile || 50,
        momentum: stock.momentum_percentile || 50,
        growth: stock.growth_percentile || 50,
        size: stock.size_percentile || 50,
        volatility: 100 - (stock.volatility_percentile || 50) // Lower volatility is better
      };

      const combinedScore =
        weights.value * factorScores.value +
        weights.quality * factorScores.quality +
        weights.momentum * factorScores.momentum +
        weights.growth * factorScores.growth +
        weights.size * factorScores.size +
        weights.volatility * factorScores.volatility;

      return {
        symbol: stock.symbol,
        companyId: stock.company_id,
        combinedScore,
        factorScores,
        marketCap: stock.market_cap,
        sector: stock.sector
      };
    });

    // Sort by combined score descending
    ranked.sort((a, b) => b.combinedScore - a.combinedScore);

    return ranked;
  }

  /**
   * Calculate portfolio value
   */
  async _calculatePortfolioValue(database, positions, date) {
    let value = 0;

    for (const [symbol, position] of positions) {
      const priceData = await this._getPrice(database, symbol, date);
      if (priceData) {
        value += position.shares * priceData.close;
      }
    }

    return value;
  }

  /**
   * Get price on a specific date
   */
  async _getPrice(database, symbol, date) {
    const result = await database.query(`
      SELECT dp.close
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER($1)
        AND dp.date <= $2
      ORDER BY dp.date DESC
      LIMIT 1
    `, [symbol, date]);

    return result.rows[0] || null;
  }

  /**
   * Execute rebalance trades
   */
  async _executeRebalance(database, positions, targetWeights, totalValue, date) {
    const trades = [];
    const targetSymbols = new Set(Object.keys(targetWeights));

    // Sell positions not in target
    for (const [symbol, position] of positions) {
      if (!targetSymbols.has(symbol)) {
        const priceData = await this._getPrice(database, symbol, date);
        if (priceData && position.shares > 0) {
          const value = position.shares * priceData.close;
          trades.push({
            date,
            symbol,
            action: 'SELL',
            shares: position.shares,
            price: priceData.close,
            value,
            reason: 'Exit - not in top N'
          });
          positions.delete(symbol);
        }
      }
    }

    // Calculate available capital after sells
    let availableCapital = totalValue;
    for (const [symbol, position] of positions) {
      const priceData = await this._getPrice(database, symbol, date);
      if (priceData) {
        availableCapital -= position.shares * priceData.close;
      }
    }

    // Add/rebalance target positions
    for (const [symbol, targetWeight] of Object.entries(targetWeights)) {
      const targetValue = totalValue * targetWeight;
      const priceData = await this._getPrice(database, symbol, date);

      if (!priceData || priceData.close <= 0) continue;

      const currentPosition = positions.get(symbol);
      const currentValue = currentPosition ? currentPosition.shares * priceData.close : 0;
      const valueDiff = targetValue - currentValue;

      if (Math.abs(valueDiff) > totalValue * 0.01) { // Only trade if diff > 1%
        if (valueDiff > 0 && availableCapital > 0) {
          // Buy
          const buyValue = Math.min(valueDiff, availableCapital);
          const shares = Math.floor(buyValue / priceData.close);

          if (shares > 0) {
            const actualValue = shares * priceData.close;
            availableCapital -= actualValue;

            trades.push({
              date,
              symbol,
              action: 'BUY',
              shares,
              price: priceData.close,
              value: actualValue,
              reason: currentPosition ? 'Increase position' : 'New position'
            });

            const existingShares = currentPosition ? currentPosition.shares : 0;
            const existingAvgPrice = currentPosition ? currentPosition.avgPrice : 0;
            const newTotalShares = existingShares + shares;
            const newAvgPrice = (existingShares * existingAvgPrice + shares * priceData.close) / newTotalShares;

            positions.set(symbol, { shares: newTotalShares, avgPrice: newAvgPrice });
          }
        } else if (valueDiff < 0 && currentPosition) {
          // Reduce position
          const sellShares = Math.min(currentPosition.shares, Math.floor(-valueDiff / priceData.close));

          if (sellShares > 0) {
            const actualValue = sellShares * priceData.close;

            trades.push({
              date,
              symbol,
              action: 'SELL',
              shares: sellShares,
              price: priceData.close,
              value: actualValue,
              reason: 'Reduce position'
            });

            const remainingShares = currentPosition.shares - sellShares;
            if (remainingShares > 0) {
              positions.set(symbol, { shares: remainingShares, avgPrice: currentPosition.avgPrice });
            } else {
              positions.delete(symbol);
            }
          }
        }
      }
    }

    return trades;
  }

  /**
   * Calculate score-based weights
   */
  _calculateScoreWeights(holdings) {
    const totalScore = holdings.reduce((sum, h) => sum + h.combinedScore, 0);
    const weights = {};

    for (const holding of holdings) {
      weights[holding.symbol] = holding.combinedScore / totalScore;
    }

    return weights;
  }

  /**
   * Calculate alpha and beta
   */
  _calculateAlphaBeta(strategyReturns, benchmarkReturns) {
    const n = Math.min(strategyReturns.length, benchmarkReturns.length);
    if (n < 10) return { alpha: 0, beta: 1 };

    // Calculate means
    const strategyMean = strategyReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const benchmarkMean = benchmarkReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;

    // Calculate beta (covariance / variance)
    let covariance = 0;
    let benchmarkVariance = 0;

    for (let i = 0; i < n; i++) {
      const stratDev = strategyReturns[i] - strategyMean;
      const benchDev = benchmarkReturns[i] - benchmarkMean;
      covariance += stratDev * benchDev;
      benchmarkVariance += benchDev * benchDev;
    }

    covariance /= n;
    benchmarkVariance /= n;

    const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;

    // Calculate alpha (annualized)
    const alpha = (strategyMean - beta * benchmarkMean) * this.options.tradingDaysPerYear;

    return { alpha, beta };
  }

  /**
   * Calculate win rate from trades
   */
  _calculateWinRate(trades) {
    const sellTrades = trades.filter(t => t.action === 'SELL');
    if (sellTrades.length === 0) return 0;

    // This is a simplification - would need to track entry prices properly
    return sellTrades.length > 0 ? 0.5 : 0; // Placeholder
  }

  /**
   * Print summary
   */
  _printSummary(results) {
    console.log('\n' + '='.repeat(60));
    console.log('BACKTEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Return: ${results.totalReturn.toFixed(2)}%`);
    console.log(`Benchmark Return: ${results.benchmarkMetrics.totalReturn.toFixed(2)}%`);
    console.log(`Alpha: ${(results.metrics.alpha * 100).toFixed(2)}%`);
    console.log(`Beta: ${results.metrics.beta.toFixed(2)}`);
    console.log(`Sharpe Ratio: ${results.metrics.sharpe.toFixed(2)}`);
    console.log(`Max Drawdown: ${(results.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`Trades: ${results.trades.length}`);
    console.log('='.repeat(60));
  }
}

module.exports = { FactorBacktestEngine };
