// src/services/portfolio/backtestEngine.js
// Backtest Engine for Portfolio Simulation (Agent 2)

const { getDatabaseAsync } = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.05;

// Default transaction cost parameters
const DEFAULT_COSTS = {
  commissionBps: 5,        // 5 basis points commission
  spreadBps: 5,            // 5 bps half-spread
  impactCoefficient: 0.1,  // Market impact coefficient
};

class BacktestEngine {
  constructor() {
    // No database initialization needed for async pattern
    console.log('📈 Backtest Engine initialized');
  }

  /**
   * Calculate transaction cost for a trade
   * Uses Almgren-Chriss style market impact model
   */
  _calculateTransactionCost(tradeValue, avgDailyVolume, volatility, costConfig) {
    const config = { ...DEFAULT_COSTS, ...costConfig };

    // Commission cost
    const commission = tradeValue * (config.commissionBps / 10000);

    // Spread cost
    const spreadCost = tradeValue * (config.spreadBps / 10000);

    // Market impact (simplified Almgren-Chriss)
    // Impact = η × σ × sqrt(Q/V)
    const participationRate = avgDailyVolume > 0 ? tradeValue / avgDailyVolume : 0.01;
    const vol = volatility || 0.02;
    const impactCost = tradeValue * config.impactCoefficient * vol * Math.sqrt(Math.min(participationRate, 0.3));

    return {
      commission,
      spreadCost,
      impactCost,
      totalCost: commission + spreadCost + impactCost,
      totalCostBps: tradeValue > 0 ? ((commission + spreadCost + impactCost) / tradeValue) * 10000 : 0,
    };
  }

  // ============================================
  // Run Backtest
  // ============================================
  async runBacktest(config) {
    const startTime = Date.now();

    const {
      name = null,
      allocations,
      startDate,
      endDate,
      initialValue = 100000,
      benchmarkIndexId = 1, // S&P 500 by default
      rebalanceFrequency = 'never', // monthly, quarterly, annually, never
      reinvestDividends = true,
      includeTransactionCosts = true,  // NEW: Enable transaction cost modeling
      transactionCosts = {},            // NEW: Custom cost parameters
    } = config;

    // Store cost config for use in trades
    this._costConfig = includeTransactionCosts ? { ...DEFAULT_COSTS, ...transactionCosts } : null;
    this._totalTransactionCosts = 0;
    this._transactionCostBreakdown = { commission: 0, spread: 0, impact: 0 };

    // Validate inputs
    if (!allocations || allocations.length === 0) {
      throw new Error('Allocations are required');
    }

    if (!startDate || !endDate) {
      throw new Error('Start and end dates are required');
    }

    // Normalize weights
    const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
    const normalizedAllocations = allocations.map(a => ({
      ...a,
      weight: a.weight / totalWeight
    }));

    // Resolve symbols to company IDs and load price data
    const { positions, priceData, tradingDays } = await this._loadBacktestData(
      normalizedAllocations,
      startDate,
      endDate
    );

    if (tradingDays.length < 2) {
      throw new Error('Insufficient price data for backtest period');
    }

    // Load benchmark data
    const benchmarkPrices = await this._loadBenchmarkData(benchmarkIndexId, startDate, endDate);

    // Initialize portfolio
    const portfolio = this._initializePortfolio(positions, initialValue, tradingDays[0], priceData);

    // Run simulation
    const valueSeries = [];
    const drawdownSeries = [];
    let peak = initialValue;
    let maxDrawdown = 0;
    let maxDrawdownStart = tradingDays[0];
    let maxDrawdownEnd = tradingDays[0];
    let currentDrawdownStart = tradingDays[0];
    let totalTrades = positions.length; // Initial buys
    let lastRebalanceDate = tradingDays[0];
    const annualReturns = {};

    for (let i = 0; i < tradingDays.length; i++) {
      const date = tradingDays[i];
      const year = date.substring(0, 4);

      // Update position values
      let portfolioValue = 0;
      for (const pos of portfolio.positions) {
        const dayPrices = priceData[pos.companyId]?.[date];
        if (dayPrices) {
          pos.currentPrice = dayPrices.close;
          pos.currentValue = pos.shares * pos.currentPrice;

          // Handle dividends
          if (reinvestDividends && dayPrices.dividend) {
            const dividendAmount = pos.shares * dayPrices.dividend;
            const newShares = dividendAmount / pos.currentPrice;
            pos.shares += newShares;
            pos.currentValue = pos.shares * pos.currentPrice;
          }
        }
        portfolioValue += pos.currentValue;
      }

      // Record value
      valueSeries.push({ date, value: portfolioValue });

      // Track drawdown
      if (portfolioValue > peak) {
        peak = portfolioValue;
        currentDrawdownStart = date;
      }
      const drawdown = (peak - portfolioValue) / peak;
      drawdownSeries.push({ date, drawdown: drawdown * 100 });

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownStart = currentDrawdownStart;
        maxDrawdownEnd = date;
      }

      // Track annual returns
      if (!annualReturns[year]) {
        annualReturns[year] = { startValue: portfolioValue };
      }
      annualReturns[year].endValue = portfolioValue;

      // Check for rebalancing
      if (this._shouldRebalance(date, lastRebalanceDate, rebalanceFrequency)) {
        const trades = this._rebalancePortfolio(portfolio, normalizedAllocations, portfolioValue, priceData, date);
        totalTrades += trades;
        lastRebalanceDate = date;
      }
    }

    // Calculate final metrics
    const finalValue = valueSeries[valueSeries.length - 1].value;
    const totalReturnPct = ((finalValue - initialValue) / initialValue) * 100;
    const years = tradingDays.length / TRADING_DAYS_PER_YEAR;
    const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;

    // Calculate daily returns for volatility/Sharpe/Sortino
    const dailyReturns = [];
    for (let i = 1; i < valueSeries.length; i++) {
      dailyReturns.push((valueSeries[i].value - valueSeries[i - 1].value) / valueSeries[i - 1].value);
    }

    const volatility = this._calculateVolatility(dailyReturns) * 100;
    const sharpeRatio = this._calculateSharpe(cagr / 100, volatility / 100);
    const sortinoRatio = this._calculateSortino(dailyReturns, cagr / 100);
    const calmarRatio = maxDrawdown > 0 ? (cagr / 100) / maxDrawdown : null;

    // Calculate benchmark comparison
    let benchmarkMetrics = null;
    if (benchmarkPrices.length > 0) {
      benchmarkMetrics = this._calculateBenchmarkMetrics(
        valueSeries,
        benchmarkPrices,
        dailyReturns,
        years
      );
    }

    // Calculate annual returns
    const annualReturnsList = Object.entries(annualReturns).map(([year, data]) => ({
      year,
      return: ((data.endValue - data.startValue) / data.startValue) * 100
    }));

    const executionTimeMs = Date.now() - startTime;

    // Calculate transaction cost impact on returns
    const transactionCostImpact = this._costConfig ? {
      totalCosts: Math.round(this._totalTransactionCosts * 100) / 100,
      totalCostsBps: Math.round((this._totalTransactionCosts / initialValue) * 10000 * 10) / 10,
      breakdown: {
        commission: Math.round(this._transactionCostBreakdown.commission * 100) / 100,
        spread: Math.round(this._transactionCostBreakdown.spread * 100) / 100,
        marketImpact: Math.round(this._transactionCostBreakdown.impact * 100) / 100,
      },
      costPerTrade: totalTrades > 0 ? Math.round((this._totalTransactionCosts / totalTrades) * 100) / 100 : 0,
      returnDrag: Math.round((this._totalTransactionCosts / initialValue) * 100 * 100) / 100, // As percentage
    } : null;

    // Save backtest to database
    const database = await getDatabaseAsync();

    const insertResult = await database.query(`
      INSERT INTO backtests (
        name, config, start_date, end_date, initial_value, benchmark_index_id,
        rebalance_frequency, final_value, total_return_pct, cagr, volatility,
        sharpe_ratio, sortino_ratio, max_drawdown, max_drawdown_start, max_drawdown_end,
        calmar_ratio, benchmark_final_value, benchmark_cagr, alpha, beta,
        tracking_error, information_ratio, total_trades, annual_returns,
        value_series, drawdown_series, execution_time_ms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      )
      RETURNING id
    `, [
      name,
      JSON.stringify(config),
      tradingDays[0],
      tradingDays[tradingDays.length - 1],
      initialValue,
      benchmarkIndexId,
      rebalanceFrequency,
      finalValue,
      totalReturnPct,
      cagr,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown * 100,
      maxDrawdownStart,
      maxDrawdownEnd,
      calmarRatio,
      benchmarkMetrics?.finalValue,
      benchmarkMetrics?.cagr,
      benchmarkMetrics?.alpha,
      benchmarkMetrics?.beta,
      benchmarkMetrics?.trackingError,
      benchmarkMetrics?.informationRatio,
      totalTrades,
      JSON.stringify(annualReturnsList),
      JSON.stringify(this._sampleSeries(valueSeries, 500)),
      JSON.stringify(this._sampleSeries(drawdownSeries, 500)),
      executionTimeMs
    ]);

    const backtestId = insertResult.rows[0].id;

    const result = {
      id: backtestId,
      name,
      config: JSON.stringify(config),
      startDate: tradingDays[0],
      endDate: tradingDays[tradingDays.length - 1],
      initialValue,
      benchmarkIndexId,
      rebalanceFrequency,
      finalValue,
      totalReturnPct,
      cagr,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      maxDrawdownStart,
      maxDrawdownEnd,
      calmarRatio,
      benchmarkFinalValue: benchmarkMetrics?.finalValue,
      benchmarkCagr: benchmarkMetrics?.cagr,
      alpha: benchmarkMetrics?.alpha,
      beta: benchmarkMetrics?.beta,
      trackingError: benchmarkMetrics?.trackingError,
      informationRatio: benchmarkMetrics?.informationRatio,
      totalTrades,
      transactionCostImpact,  // NEW: Transaction cost summary
      annualReturns: JSON.stringify(annualReturnsList),
      valueSeries: JSON.stringify(this._sampleSeries(valueSeries, 500)),
      drawdownSeries: JSON.stringify(this._sampleSeries(drawdownSeries, 500)),
      executionTimeMs
    };

    // Return parsed data for API response
    return {
      ...result,
      annualReturns: annualReturnsList,
      valueSeries: this._sampleSeries(valueSeries, 500),
      drawdownSeries: this._sampleSeries(drawdownSeries, 500),
      positions: positions.map(p => ({ symbol: p.symbol, weight: p.weight }))
    };
  }

  // ============================================
  // Get Saved Backtest
  // ============================================
  async getBacktest(id) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM backtests WHERE id = $1
    `, [id]);

    const backtest = result.rows[0];

    if (!backtest) {
      throw new Error(`Backtest ${id} not found`);
    }

    return {
      ...backtest,
      config: JSON.parse(backtest.config || '{}'),
      annualReturns: JSON.parse(backtest.annual_returns || '[]'),
      valueSeries: JSON.parse(backtest.value_series || '[]'),
      drawdownSeries: JSON.parse(backtest.drawdown_series || '[]')
    };
  }

  // ============================================
  // List Backtests
  // ============================================
  async listBacktests(limit = 20) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        id, name, start_date, end_date, initial_value, final_value,
        total_return_pct, cagr, sharpe_ratio, max_drawdown,
        rebalance_frequency, execution_time_ms, created_at
      FROM backtests
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  // ============================================
  // Delete Backtest
  // ============================================
  async deleteBacktest(id) {
    const database = await getDatabaseAsync();
    const result = await database.query('DELETE FROM backtests WHERE id = $1', [id]);
    return { deleted: result.rowCount > 0 };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  async _loadBacktestData(allocations, startDate, endDate) {
    const database = await getDatabaseAsync();
    const positions = [];
    const priceData = {};
    const tradingDaysSet = new Set();

    for (const alloc of allocations) {
      // Resolve symbol to company ID
      const companyResult = await database.query(`
        SELECT id, symbol, name FROM companies WHERE LOWER(symbol) = LOWER($1)
      `, [alloc.symbol]);

      const company = companyResult.rows[0];

      if (!company) {
        throw new Error(`Symbol ${alloc.symbol} not found`);
      }

      positions.push({
        symbol: company.symbol,
        companyId: company.id,
        name: company.name,
        weight: alloc.weight
      });

      // Load price data
      const pricesResult = await database.query(`
        SELECT date, open, high, low, close, adjusted_close, volume
        FROM daily_prices
        WHERE company_id = $1 AND date >= $2 AND date <= $3
        ORDER BY date ASC
      `, [company.id, startDate, endDate]);

      const prices = pricesResult.rows;

      priceData[company.id] = {};
      for (const price of prices) {
        priceData[company.id][price.date] = {
          open: price.open,
          high: price.high,
          low: price.low,
          close: price.adjusted_close || price.close,
          volume: price.volume
        };
        tradingDaysSet.add(price.date);
      }
    }

    const tradingDays = Array.from(tradingDaysSet).sort();

    // Only keep days where ALL positions have data
    const validDays = tradingDays.filter(day =>
      positions.every(pos => priceData[pos.companyId]?.[day])
    );

    return { positions, priceData, tradingDays: validDays };
  }

  async _loadBenchmarkData(benchmarkIndexId, startDate, endDate) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT date, close
      FROM market_index_prices
      WHERE index_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date ASC
    `, [benchmarkIndexId, startDate, endDate]);

    return result.rows;
  }

  _initializePortfolio(positions, initialValue, startDate, priceData) {
    const portfolio = {
      positions: [],
      cash: 0
    };

    for (const pos of positions) {
      let allocationAmount = initialValue * pos.weight;
      const startPrice = priceData[pos.companyId]?.[startDate]?.close;

      if (!startPrice) {
        throw new Error(`No price data for ${pos.symbol} on ${startDate}`);
      }

      // Apply transaction costs on initial purchase
      if (this._costConfig) {
        const avgVolume = priceData[pos.companyId]?.[startDate]?.volume || 1000000;
        const avgDailyValue = avgVolume * startPrice;
        const costs = this._calculateTransactionCost(allocationAmount, avgDailyValue, 0.02, this._costConfig);

        // Deduct costs from allocation
        allocationAmount -= costs.totalCost;

        // Track costs
        this._totalTransactionCosts += costs.totalCost;
        this._transactionCostBreakdown.commission += costs.commission;
        this._transactionCostBreakdown.spread += costs.spreadCost;
        this._transactionCostBreakdown.impact += costs.impactCost;
      }

      const shares = allocationAmount / startPrice;

      portfolio.positions.push({
        symbol: pos.symbol,
        companyId: pos.companyId,
        targetWeight: pos.weight,
        shares,
        currentPrice: startPrice,
        currentValue: allocationAmount
      });
    }

    return portfolio;
  }

  _shouldRebalance(currentDate, lastRebalanceDate, frequency) {
    if (frequency === 'never') return false;

    const current = new Date(currentDate);
    const last = new Date(lastRebalanceDate);

    switch (frequency) {
      case 'daily':
        return true;
      case 'weekly':
        const weeksDiff = (current - last) / (7 * 24 * 60 * 60 * 1000);
        return weeksDiff >= 1;
      case 'monthly':
        return current.getMonth() !== last.getMonth() || current.getFullYear() !== last.getFullYear();
      case 'quarterly':
        const currentQ = Math.floor(current.getMonth() / 3);
        const lastQ = Math.floor(last.getMonth() / 3);
        return currentQ !== lastQ || current.getFullYear() !== last.getFullYear();
      case 'annually':
        return current.getFullYear() !== last.getFullYear();
      default:
        return false;
    }
  }

  _rebalancePortfolio(portfolio, targetAllocations, portfolioValue, priceData, date) {
    let trades = 0;

    for (const pos of portfolio.positions) {
      const target = targetAllocations.find(a => a.symbol.toUpperCase() === pos.symbol.toUpperCase());
      if (!target) continue;

      const targetValue = portfolioValue * target.weight;
      const currentValue = pos.currentValue;
      let diff = targetValue - currentValue;

      const currentPrice = priceData[pos.companyId]?.[date]?.close;
      if (!currentPrice) continue;

      if (Math.abs(diff) > portfolioValue * 0.01) { // 1% threshold
        // Apply transaction costs on rebalance trades
        if (this._costConfig) {
          const tradeValue = Math.abs(diff);
          const avgVolume = priceData[pos.companyId]?.[date]?.volume || 1000000;
          const avgDailyValue = avgVolume * currentPrice;
          const costs = this._calculateTransactionCost(tradeValue, avgDailyValue, 0.02, this._costConfig);

          // Reduce trade amount by cost (for buys) or deduct from proceeds (for sells)
          if (diff > 0) {
            diff -= costs.totalCost;
          }

          // Track costs
          this._totalTransactionCosts += costs.totalCost;
          this._transactionCostBreakdown.commission += costs.commission;
          this._transactionCostBreakdown.spread += costs.spreadCost;
          this._transactionCostBreakdown.impact += costs.impactCost;
        }

        const sharesToTrade = diff / currentPrice;
        pos.shares += sharesToTrade;
        pos.currentValue = pos.shares * currentPrice;
        trades++;
      }
    }

    return trades;
  }

  _calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  _calculateSharpe(annualReturn, volatility) {
    if (volatility === 0) return null;
    return (annualReturn - RISK_FREE_RATE) / volatility;
  }

  _calculateSortino(dailyReturns, annualReturn) {
    const negativeReturns = dailyReturns.filter(r => r < 0);
    if (negativeReturns.length < 2) return null;

    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

    if (downsideDeviation === 0) return null;
    return (annualReturn - RISK_FREE_RATE) / downsideDeviation;
  }

  _calculateBenchmarkMetrics(valueSeries, benchmarkPrices, portfolioReturns, years) {
    // Create benchmark price map
    const benchmarkMap = {};
    for (const price of benchmarkPrices) {
      benchmarkMap[price.date] = price.close;
    }

    // Calculate benchmark returns aligned with portfolio
    const benchmarkReturns = [];
    let prevBenchmark = null;

    for (const entry of valueSeries) {
      const benchmarkValue = benchmarkMap[entry.date];
      if (benchmarkValue && prevBenchmark) {
        benchmarkReturns.push((benchmarkValue - prevBenchmark) / prevBenchmark);
      }
      prevBenchmark = benchmarkValue;
    }

    // Align arrays
    const len = Math.min(portfolioReturns.length, benchmarkReturns.length);
    if (len < 2) return null;

    const pReturns = portfolioReturns.slice(0, len);
    const bReturns = benchmarkReturns.slice(0, len);

    // Calculate beta
    const pMean = pReturns.reduce((a, b) => a + b, 0) / len;
    const bMean = bReturns.reduce((a, b) => a + b, 0) / len;

    let covariance = 0;
    let bVariance = 0;
    const excessReturns = [];

    for (let i = 0; i < len; i++) {
      covariance += (pReturns[i] - pMean) * (bReturns[i] - bMean);
      bVariance += Math.pow(bReturns[i] - bMean, 2);
      excessReturns.push(pReturns[i] - bReturns[i]);
    }

    covariance /= len;
    bVariance /= len;

    const beta = bVariance > 0 ? covariance / bVariance : 1;

    // Benchmark final value (normalized to initial value of 100000)
    const firstBenchmark = benchmarkPrices[0]?.close;
    const lastBenchmark = benchmarkPrices[benchmarkPrices.length - 1]?.close;
    const benchmarkReturn = firstBenchmark && lastBenchmark
      ? (lastBenchmark - firstBenchmark) / firstBenchmark
      : 0;
    const benchmarkFinalValue = 100000 * (1 + benchmarkReturn);
    const benchmarkCagr = (Math.pow(1 + benchmarkReturn, 1 / years) - 1) * 100;

    // Alpha
    const portfolioCagr = (Math.pow(valueSeries[valueSeries.length - 1].value / valueSeries[0].value, 1 / years) - 1);
    const alpha = (portfolioCagr - (RISK_FREE_RATE + beta * (benchmarkCagr / 100 - RISK_FREE_RATE))) * 100;

    // Tracking error
    const excessMean = excessReturns.reduce((a, b) => a + b, 0) / len;
    const trackingVariance = excessReturns.reduce((sum, r) => sum + Math.pow(r - excessMean, 2), 0) / len;
    const trackingError = Math.sqrt(trackingVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

    // Information ratio
    const informationRatio = trackingError > 0
      ? ((portfolioCagr * 100) - benchmarkCagr) / trackingError
      : null;

    return {
      beta,
      alpha,
      trackingError,
      informationRatio,
      finalValue: benchmarkFinalValue,
      cagr: benchmarkCagr
    };
  }

  _sampleSeries(series, maxPoints) {
    if (series.length <= maxPoints) return series;

    const step = Math.ceil(series.length / maxPoints);
    const sampled = [];

    for (let i = 0; i < series.length; i += step) {
      sampled.push(series[i]);
    }

    // Always include the last point
    if (sampled[sampled.length - 1] !== series[series.length - 1]) {
      sampled.push(series[series.length - 1]);
    }

    return sampled;
  }
}

// Export singleton instance
module.exports = new BacktestEngine();
