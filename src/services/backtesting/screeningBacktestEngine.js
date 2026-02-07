// src/services/backtesting/screeningBacktestEngine.js
// Screening Backtest Engine - Tests stock screening strategies historically

const { getDatabaseAsync } = require('../../database');
const { calculateMetrics } = require('./walkForwardEngine');

/**
 * Preset screening criteria
 */
const SCREEN_PRESETS = {
  buffett: {
    name: 'Buffett Quality',
    description: 'High ROIC, low debt, positive FCF',
    criteria: {
      minROIC: 15,
      maxDebtToEquity: 0.5,
      minFCFYield: 0,
      sortBy: 'roic'
    }
  },
  value: {
    name: 'Deep Value (Graham)',
    description: 'Low P/E, low P/B, positive earnings',
    criteria: {
      maxPERatio: 15,
      maxPBRatio: 1.5,
      minROIC: 0,
      sortBy: 'pe_ratio',
      sortOrder: 'ASC'
    }
  },
  magic: {
    name: 'Magic Formula (Greenblatt)',
    description: 'High ROIC combined with low P/E',
    criteria: {
      minROIC: 20,
      maxPERatio: 20,
      sortBy: 'roic'
    }
  },
  quality: {
    name: 'Quality',
    description: 'High margins, high ROE, low debt',
    criteria: {
      minROE: 15,
      minOperatingMargin: 15,
      maxDebtToEquity: 1.0,
      sortBy: 'roe'
    }
  },
  growth: {
    name: 'Growth',
    description: 'High revenue and earnings growth',
    criteria: {
      minRevenueGrowth: 15,
      minEarningsGrowth: 15,
      minROIC: 5,
      sortBy: 'revenue_growth_yoy'
    }
  },
  dividend: {
    name: 'Dividend Value',
    description: 'Stable dividends with reasonable valuation',
    criteria: {
      maxPERatio: 20,
      minROE: 10,
      maxDebtToEquity: 1.0,
      sortBy: 'pe_ratio',
      sortOrder: 'ASC'
    }
  },
  momentum: {
    name: 'Momentum Quality',
    description: 'Strong price momentum with quality fundamentals',
    criteria: {
      minROIC: 10,
      minRevenueGrowth: 5,
      sortBy: 'roic'
    }
  }
};

/**
 * ScreeningBacktestEngine
 *
 * Backtests screening strategies:
 * - Uses preset or custom screening criteria
 * - Runs screen at each rebalance date
 * - Simulates portfolio based on screened stocks
 * - Returns performance metrics and analysis
 */
class ScreeningBacktestEngine {
  constructor(options = {}) {
    this.options = {
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
      initialCapital: 100000,
      transactionCosts: 0.001,
      slippage: 0.0005,
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
   * Get available preset screens
   */
  static getPresets() {
    return Object.entries(SCREEN_PRESETS).map(([key, preset]) => ({
      key,
      name: preset.name,
      description: preset.description
    }));
  }

  /**
   * Run screening backtest with preset
   */
  async runPresetBacktest(presetKey, config = {}) {
    const preset = SCREEN_PRESETS[presetKey];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetKey}. Available: ${Object.keys(SCREEN_PRESETS).join(', ')}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔬 SCREENING BACKTEST: ${preset.name}`);
    console.log('='.repeat(60));
    console.log(`Description: ${preset.description}`);

    return this.runScreeningBacktest(preset.criteria, {
      ...config,
      screenName: preset.name
    });
  }

  /**
   * Run screening backtest with custom criteria
   */
  async runScreeningBacktest(criteria, config = {}) {
    const {
      startDate = '2019-01-01',
      endDate = new Date().toISOString().split('T')[0],
      rebalanceFrequency = 'quarterly',
      maxPositions = 20,
      minMarketCap = 1e9,
      benchmark = 'SPY',
      positionSizing = 'equal_weight',
      screenName = 'Custom Screen'
    } = config;

    console.log(`\nPeriod: ${startDate} to ${endDate}`);
    console.log(`Rebalance: ${rebalanceFrequency}, Max ${maxPositions} positions`);
    console.log('Criteria:', JSON.stringify(criteria, null, 2));

    const database = await this._getDatabase();

    // Get benchmark prices for trading days
    const benchmarkPricesResult = await database.query(`
      SELECT dp.date, dp.close
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER($1)
        AND dp.date BETWEEN $2 AND $3
      ORDER BY dp.date ASC
    `, [benchmark, startDate, endDate]);

    const benchmarkPrices = benchmarkPricesResult.rows;
    if (benchmarkPrices.length < 30) {
      throw new Error('Insufficient trading days for backtest');
    }

    // Get rebalance dates
    const rebalanceDates = this._getRebalanceDates(benchmarkPrices.map(p => p.date), rebalanceFrequency);
    console.log(`Rebalance dates: ${rebalanceDates.length}`);

    // Initialize portfolio
    let capital = this.options.initialCapital;
    const positions = new Map();
    const equityCurve = [];
    const trades = [];
    const dailyReturns = [];
    const screeningHistory = [];

    let lastValue = capital;

    // Simulate each trading day
    for (let i = 0; i < benchmarkPrices.length; i++) {
      const date = benchmarkPrices[i].date;

      // Calculate portfolio value
      const portfolioValue = await this._calculatePortfolioValue(positions, date);
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
        console.log(`\n📅 Screening on ${date}...`);

        // Run screen
        const screenedStocks = await this._runScreen(criteria, date, minMarketCap);

        if (screenedStocks.length === 0) {
          console.log('  No stocks passed screening criteria');
          continue;
        }

        // Select top N
        const targetHoldings = screenedStocks.slice(0, maxPositions);

        // Record screening results
        screeningHistory.push({
          date,
          stocksScreened: screenedStocks.length,
          selected: targetHoldings.map(s => ({
            symbol: s.symbol,
            name: s.name,
            sector: s.sector,
            roic: s.roic,
            pe_ratio: s.pe_ratio
          }))
        });

        console.log(`  Found ${screenedStocks.length} stocks, selected top ${targetHoldings.length}`);

        // Calculate target weights
        const targetWeights = this._calculateWeights(targetHoldings, positionSizing);

        // Execute rebalance
        const rebalanceTrades = await this._executeRebalance(
          positions,
          targetWeights,
          totalValue,
          date
        );

        trades.push(...rebalanceTrades);

        // Update capital
        for (const trade of rebalanceTrades) {
          if (trade.action === 'BUY') {
            capital -= trade.value * (1 + this.options.transactionCosts);
          } else if (trade.action === 'SELL') {
            capital += trade.value * (1 - this.options.transactionCosts);
          }
        }
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
      screenName,
      criteria,
      config: { startDate, endDate, rebalanceFrequency, maxPositions, minMarketCap, benchmark },
      initialCapital: this.options.initialCapital,
      finalValue: equityCurve[equityCurve.length - 1]?.value || this.options.initialCapital,
      totalReturn: ((equityCurve[equityCurve.length - 1]?.value || this.options.initialCapital) / this.options.initialCapital - 1) * 100,
      metrics: {
        ...metrics,
        alpha,
        beta,
        sharpe: metrics.sharpeRatio || 0,
        sortino: metrics.sortinoRatio || 0,
        maxDrawdown: metrics.maxDrawdown || 0
      },
      benchmarkMetrics: {
        ...benchmarkMetrics,
        totalReturn: ((benchmarkPrices[benchmarkPrices.length - 1]?.close || 1) / (benchmarkPrices[0]?.close || 1) - 1) * 100
      },
      equityCurve,
      trades,
      screeningHistory,
      tradingDays: benchmarkPrices.length,
      rebalanceCount: rebalanceDates.length
    };

    this._printSummary(results);

    return results;
  }

  /**
   * Run screen at a historical date
   */
  async _runScreen(criteria, asOfDate, minMarketCap) {
    const database = await this._getDatabase();

    // Get all stocks with metrics
    const stocksResult = await database.query(`
      SELECT DISTINCT
        c.id as company_id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        cm.roic,
        cm.roe,
        cm.pe_ratio,
        cm.pb_ratio,
        cm.debt_to_equity,
        cm.fcf_yield,
        cm.operating_margin,
        cm.revenue_growth_yoy,
        cm.earnings_growth_yoy
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE cm.fiscal_period <= $1
        AND cm.fiscal_period >= $1::date - INTERVAL '1 year'
        AND c.market_cap >= $3
        AND c.symbol IS NOT NULL
        AND c.symbol NOT LIKE 'CIK%'
      GROUP BY c.id, c.symbol, c.name, c.sector, c.market_cap, cm.roic, cm.roe, cm.pe_ratio, cm.pb_ratio, cm.debt_to_equity, cm.fcf_yield, cm.operating_margin, cm.revenue_growth_yoy, cm.earnings_growth_yoy
      HAVING MAX(cm.fiscal_period) IS NOT NULL
      ORDER BY cm.roic DESC
      LIMIT 500
    `, [asOfDate, asOfDate, minMarketCap]);

    const stocks = stocksResult.rows;

    // Apply criteria filters
    const filtered = stocks.filter(stock => {
      // ROIC criteria
      if (criteria.minROIC !== undefined && (stock.roic === null || stock.roic < criteria.minROIC)) return false;
      if (criteria.maxROIC !== undefined && stock.roic > criteria.maxROIC) return false;

      // ROE criteria
      if (criteria.minROE !== undefined && (stock.roe === null || stock.roe < criteria.minROE)) return false;
      if (criteria.maxROE !== undefined && stock.roe > criteria.maxROE) return false;

      // P/E criteria
      if (criteria.minPERatio !== undefined && (stock.pe_ratio === null || stock.pe_ratio < criteria.minPERatio)) return false;
      if (criteria.maxPERatio !== undefined && (stock.pe_ratio === null || stock.pe_ratio > criteria.maxPERatio)) return false;

      // P/B criteria
      if (criteria.minPBRatio !== undefined && (stock.pb_ratio === null || stock.pb_ratio < criteria.minPBRatio)) return false;
      if (criteria.maxPBRatio !== undefined && (stock.pb_ratio === null || stock.pb_ratio > criteria.maxPBRatio)) return false;

      // Debt criteria
      if (criteria.maxDebtToEquity !== undefined && (stock.debt_to_equity === null || stock.debt_to_equity > criteria.maxDebtToEquity)) return false;

      // FCF criteria
      if (criteria.minFCFYield !== undefined && (stock.fcf_yield === null || stock.fcf_yield < criteria.minFCFYield)) return false;

      // Margin criteria
      if (criteria.minOperatingMargin !== undefined && (stock.operating_margin === null || stock.operating_margin < criteria.minOperatingMargin)) return false;

      // Growth criteria
      if (criteria.minRevenueGrowth !== undefined && (stock.revenue_growth_yoy === null || stock.revenue_growth_yoy < criteria.minRevenueGrowth)) return false;
      if (criteria.minEarningsGrowth !== undefined && (stock.earnings_growth_yoy === null || stock.earnings_growth_yoy < criteria.minEarningsGrowth)) return false;

      return true;
    });

    // Sort by specified field
    const sortBy = criteria.sortBy || 'roic';
    const sortOrder = criteria.sortOrder || 'DESC';

    filtered.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return sortOrder === 'DESC' ? bVal - aVal : aVal - bVal;
    });

    return filtered;
  }

  /**
   * Get rebalance dates
   */
  _getRebalanceDates(allDates, frequency) {
    if (frequency === 'monthly') {
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

    return allDates;
  }

  /**
   * Calculate position weights
   */
  _calculateWeights(holdings, method) {
    const weights = {};

    if (method === 'equal_weight') {
      const weight = 1 / holdings.length;
      for (const h of holdings) {
        weights[h.symbol] = weight;
      }
    } else if (method === 'market_cap_weight') {
      const totalCap = holdings.reduce((sum, h) => sum + (h.market_cap || 0), 0);
      for (const h of holdings) {
        weights[h.symbol] = totalCap > 0 ? (h.market_cap || 0) / totalCap : 1 / holdings.length;
      }
    }

    return weights;
  }

  /**
   * Calculate portfolio value
   */
  async _calculatePortfolioValue(positions, date) {
    const database = await this._getDatabase();
    let value = 0;
    for (const [symbol, position] of positions) {
      const priceResult = await database.query(`
        SELECT dp.close
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE LOWER(c.symbol) = LOWER($1)
          AND dp.date <= $2
        ORDER BY dp.date DESC
        LIMIT 1
      `, [symbol, date]);

      if (priceResult.rows.length > 0) {
        const priceData = priceResult.rows[0];
        value += position.shares * priceData.close;
      }
    }
    return value;
  }

  /**
   * Execute rebalance trades
   */
  async _executeRebalance(positions, targetWeights, totalValue, date) {
    const database = await this._getDatabase();
    const trades = [];
    const targetSymbols = new Set(Object.keys(targetWeights));

    // Helper function to get price
    const getPrice = async (symbol, asOfDate) => {
      const priceResult = await database.query(`
        SELECT dp.close
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE LOWER(c.symbol) = LOWER($1)
          AND dp.date <= $2
        ORDER BY dp.date DESC
        LIMIT 1
      `, [symbol, asOfDate]);

      return priceResult.rows.length > 0 ? priceResult.rows[0] : null;
    };

    // Sell positions not in target
    for (const [symbol, position] of positions) {
      if (!targetSymbols.has(symbol)) {
        const priceData = await getPrice(symbol, date);
        if (priceData && position.shares > 0) {
          trades.push({
            date,
            symbol,
            action: 'SELL',
            shares: position.shares,
            price: priceData.close,
            value: position.shares * priceData.close,
            reason: 'Exit - failed screen'
          });
          positions.delete(symbol);
        }
      }
    }

    // Calculate available capital
    let availableCapital = totalValue;
    for (const [symbol, position] of positions) {
      const priceData = await getPrice(symbol, date);
      if (priceData) {
        availableCapital -= position.shares * priceData.close;
      }
    }

    // Add/adjust target positions
    for (const [symbol, targetWeight] of Object.entries(targetWeights)) {
      const targetValue = totalValue * targetWeight;
      const priceData = await getPrice(symbol, date);

      if (!priceData || priceData.close <= 0) continue;

      const currentPosition = positions.get(symbol);
      const currentValue = currentPosition ? currentPosition.shares * priceData.close : 0;
      const valueDiff = targetValue - currentValue;

      if (Math.abs(valueDiff) > totalValue * 0.01) {
        if (valueDiff > 0 && availableCapital > 0) {
          const buyValue = Math.min(valueDiff, availableCapital);
          const shares = Math.floor(buyValue / priceData.close);

          if (shares > 0) {
            availableCapital -= shares * priceData.close;

            trades.push({
              date,
              symbol,
              action: 'BUY',
              shares,
              price: priceData.close,
              value: shares * priceData.close,
              reason: currentPosition ? 'Increase' : 'New position'
            });

            const existingShares = currentPosition ? currentPosition.shares : 0;
            positions.set(symbol, {
              shares: existingShares + shares,
              avgPrice: priceData.close
            });
          }
        }
      }
    }

    return trades;
  }

  /**
   * Calculate alpha and beta
   */
  _calculateAlphaBeta(strategyReturns, benchmarkReturns) {
    const n = Math.min(strategyReturns.length, benchmarkReturns.length);
    if (n < 10) return { alpha: 0, beta: 1 };

    const strategyMean = strategyReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const benchmarkMean = benchmarkReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;

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
    const alpha = (strategyMean - beta * benchmarkMean) * this.options.tradingDaysPerYear;

    return { alpha, beta };
  }

  /**
   * Print summary
   */
  _printSummary(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SCREENING BACKTEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Screen: ${results.screenName}`);
    console.log(`Total Return: ${results.totalReturn.toFixed(2)}%`);
    console.log(`Benchmark Return: ${results.benchmarkMetrics.totalReturn.toFixed(2)}%`);
    console.log(`Alpha: ${(results.metrics.alpha * 100).toFixed(2)}%`);
    console.log(`Beta: ${results.metrics.beta.toFixed(2)}`);
    console.log(`Sharpe Ratio: ${results.metrics.sharpe.toFixed(2)}`);
    console.log(`Max Drawdown: ${(results.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`Trades: ${results.trades.length}`);
    console.log(`Rebalances: ${results.rebalanceCount}`);
    console.log('='.repeat(60));
  }
}

module.exports = { ScreeningBacktestEngine, SCREEN_PRESETS };
