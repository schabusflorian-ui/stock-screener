// src/services/factors/factorBacktestAdapter.js
// Factor Backtest Adapter - Long-short portfolio simulation for custom factors

/**
 * FactorBacktestAdapter
 *
 * Runs historical backtest for custom factor formulas using long-short portfolio strategy.
 *
 * Strategy:
 * - Rank stocks by factor value (z-score)
 * - Long top X% (e.g., 20%)
 * - Short bottom X% (e.g., 20%)
 * - Rebalance monthly/quarterly
 * - Equal weight within long/short buckets
 *
 * Returns:
 * - Daily equity curve with drawdowns
 * - Summary metrics (CAGR, Sharpe, max DD, win rate, Calmar)
 * - Period returns (yearly, monthly)
 */
class FactorBacktestAdapter {
  constructor(db, customFactorCalculator) {
    this.db = db;
    this.calculator = customFactorCalculator;

    // Prepare SQL statements
    this._prepareStatements();
  }

  _prepareStatements() {
    // Get trading days in date range
    this.stmtGetTradingDays = this.db.prepare(`
      SELECT DISTINCT date
      FROM daily_prices
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `);

    // Get price for a symbol on a specific date
    this.stmtGetPrice = this.db.prepare(`
      SELECT dp.adjusted_close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = ? AND dp.date = ?
      LIMIT 1
    `);

    // Get latest price on or before date
    this.stmtGetLatestPrice = this.db.prepare(`
      SELECT dp.adjusted_close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = ? AND dp.date <= ?
      ORDER BY dp.date DESC
      LIMIT 1
    `);
  }

  /**
   * Run factor backtest
   */
  async runFactorBacktest(factorId, formula, config) {
    const {
      startDate = '2015-01-01',
      endDate = new Date().toISOString().split('T')[0],
      rebalanceFrequency = 'monthly', // 'monthly' or 'quarterly'
      longShortRatio = { long: 20, short: 20 }, // Top/bottom percentiles
      transactionCost = 0.001 // 10 bps
    } = config;

    console.log(`Running factor backtest: ${formula.substring(0, 50)}...`);
    console.log(`Period: ${startDate} to ${endDate}, Rebalance: ${rebalanceFrequency}`);

    // Get all trading days
    const tradingDays = this.stmtGetTradingDays.all(startDate, endDate).map(row => row.date);

    if (tradingDays.length === 0) {
      throw new Error('No trading days found in date range');
    }

    // Get rebalance dates
    const rebalanceDates = this.getRebalanceDates(tradingDays, rebalanceFrequency);
    console.log(`Rebalance dates: ${rebalanceDates.length}`);

    // Initialize portfolio
    let capital = 100000;
    let positions = new Map(); // symbol -> { shares, avgPrice, side: 'long' | 'short' }
    let runningMax = 100000;
    const equityCurve = [];
    let lastRebalanceDate = null;

    // Simulate each trading day
    for (let i = 0; i < tradingDays.length; i++) {
      const date = tradingDays[i];

      // Calculate portfolio value
      const portfolioValue = this.calculatePortfolioValue(positions, date, capital);

      // Track running maximum for drawdown
      if (portfolioValue > runningMax) {
        runningMax = portfolioValue;
      }
      const drawdown = (portfolioValue - runningMax) / runningMax;

      equityCurve.push({
        date,
        value: portfolioValue,
        drawdown
      });

      // Rebalance if scheduled
      if (rebalanceDates.includes(date)) {
        console.log(`Rebalancing on ${date}...`);

        try {
          // Calculate factor values at this date
          const factorResult = this.calculator.calculateFactorValues(
            factorId,
            formula,
            { asOfDate: date, storeResults: false }
          );

          if (factorResult.values.length < 20) {
            console.warn(`Insufficient stocks (${factorResult.values.length}) on ${date}, skipping rebalance`);
            continue;
          }

          // Build long-short portfolio
          const { long, short } = this.buildLongShortPortfolio(
            factorResult.values,
            longShortRatio
          );

          console.log(`  Long: ${long.length} stocks, Short: ${short.length} stocks`);

          // Execute rebalance
          const rebalanceResult = this.executeRebalance(
            positions,
            { long, short },
            portfolioValue,
            date,
            transactionCost
          );

          positions = rebalanceResult.positions;
          capital = rebalanceResult.capital;
          lastRebalanceDate = date;

        } catch (err) {
          console.error(`Error during rebalance on ${date}:`, err.message);
        }
      }

      // Progress logging every 252 days (1 year)
      if (i % 252 === 0 && i > 0) {
        const years = i / 252;
        console.log(`  Year ${years.toFixed(1)}: Portfolio value = $${portfolioValue.toFixed(0)}`);
      }
    }

    console.log('Backtest complete. Calculating metrics...');

    // Calculate summary metrics and period returns
    return {
      equity: equityCurve,
      summary: this.calculateSummaryMetrics(equityCurve),
      periodReturns: {
        yearly: this.calculateYearlyReturns(equityCurve),
        monthly: this.calculateMonthlyReturns(equityCurve)
      }
    };
  }

  /**
   * Build long-short portfolio from ranked factor values
   */
  buildLongShortPortfolio(factorValues, longShortRatio) {
    // Sort by z-score descending (highest factor value = best)
    const ranked = factorValues
      .filter(v => v.zscoreValue !== null && !isNaN(v.zscoreValue))
      .sort((a, b) => b.zscoreValue - a.zscoreValue);

    const totalStocks = ranked.length;
    const longCount = Math.floor(totalStocks * longShortRatio.long / 100);
    const shortCount = Math.floor(totalStocks * longShortRatio.short / 100);

    return {
      long: ranked.slice(0, longCount),           // Top 20%
      short: ranked.slice(totalStocks - shortCount) // Bottom 20%
    };
  }

  /**
   * Calculate current portfolio value (long positions + short P&L + cash)
   */
  calculatePortfolioValue(positions, date, cash) {
    let value = cash;

    for (const [symbol, position] of positions) {
      const priceRow = this.stmtGetLatestPrice.get(symbol, date);

      if (!priceRow) {
        console.warn(`No price found for ${symbol} on ${date}`);
        continue;
      }

      const currentPrice = priceRow.price;

      if (position.side === 'long') {
        // Long: current market value
        value += position.shares * currentPrice;
      } else {
        // Short: entry value + (entry price - current price) * shares
        // = shares * (2 * entry - current)
        value += position.shares * (2 * position.avgPrice - currentPrice);
      }
    }

    return value;
  }

  /**
   * Execute rebalance: sell old positions, buy new positions
   */
  executeRebalance(oldPositions, targets, portfolioValue, date, transactionCost) {
    const newPositions = new Map();
    let cash = 0;

    // Step 1: Liquidate all old positions
    for (const [symbol, position] of oldPositions) {
      const priceRow = this.stmtGetLatestPrice.get(symbol, date);
      if (!priceRow) continue;

      const currentPrice = priceRow.price;

      if (position.side === 'long') {
        // Sell long position
        const proceeds = position.shares * currentPrice;
        cash += proceeds * (1 - transactionCost);
      } else {
        // Cover short position
        const coverCost = position.shares * currentPrice;
        const shortProceeds = position.shares * (2 * position.avgPrice - currentPrice);
        cash += shortProceeds * (1 - transactionCost);
      }
    }

    // Add any existing cash
    cash += portfolioValue - this.calculatePortfolioValue(oldPositions, date, 0);

    // Step 2: Allocate 50% to longs, 50% to shorts
    const longCapital = cash * 0.5;
    const shortCapital = cash * 0.5;

    // Step 3: Buy new long positions (equal weight)
    if (targets.long.length > 0) {
      const perStockLong = longCapital / targets.long.length;

      for (const stock of targets.long) {
        const priceRow = this.stmtGetLatestPrice.get(stock.symbol, date);
        if (!priceRow) continue;

        const price = priceRow.price;
        const sharesToBuy = Math.floor(perStockLong / price);

        if (sharesToBuy > 0) {
          const cost = sharesToBuy * price * (1 + transactionCost);

          newPositions.set(stock.symbol, {
            shares: sharesToBuy,
            avgPrice: price,
            side: 'long'
          });

          cash -= cost;
        }
      }
    }

    // Step 4: Sell new short positions (equal weight)
    if (targets.short.length > 0) {
      const perStockShort = shortCapital / targets.short.length;

      for (const stock of targets.short) {
        const priceRow = this.stmtGetLatestPrice.get(stock.symbol, date);
        if (!priceRow) continue;

        const price = priceRow.price;
        const sharesToShort = Math.floor(perStockShort / price);

        if (sharesToShort > 0) {
          const proceeds = sharesToShort * price * (1 - transactionCost);

          newPositions.set(stock.symbol, {
            shares: sharesToShort,
            avgPrice: price,
            side: 'short'
          });

          cash += proceeds;
        }
      }
    }

    return { positions: newPositions, capital: cash };
  }

  /**
   * Get rebalance dates based on frequency
   */
  getRebalanceDates(tradingDays, frequency) {
    const rebalanceDates = [];
    let lastMonth = null;
    let lastQuarter = null;

    for (const date of tradingDays) {
      const d = new Date(date);
      const month = d.getMonth();
      const quarter = Math.floor(month / 3);

      if (frequency === 'monthly') {
        if (month !== lastMonth) {
          rebalanceDates.push(date);
          lastMonth = month;
        }
      } else if (frequency === 'quarterly') {
        if (quarter !== lastQuarter) {
          rebalanceDates.push(date);
          lastQuarter = quarter;
        }
      }
    }

    return rebalanceDates;
  }

  /**
   * Calculate summary metrics from equity curve
   */
  calculateSummaryMetrics(equityCurve) {
    if (equityCurve.length < 2) {
      return null;
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value;
      returns.push(ret);
    }

    // Total return
    const totalReturn = equityCurve[equityCurve.length - 1].value / equityCurve[0].value - 1;

    // CAGR
    const years = equityCurve.length / 252;
    const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;

    // Volatility (annualized)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);

    // Sharpe ratio (assuming 2% risk-free rate)
    const sharpe = volatility > 0 ? (cagr - 0.02) / volatility : 0;

    // Max drawdown (already calculated in equity curve)
    const maxDrawdown = Math.min(...equityCurve.map(e => e.drawdown));

    // Win rate
    const winRate = returns.filter(r => r > 0).length / returns.length;

    // Calmar ratio
    const calmarRatio = Math.abs(maxDrawdown) > 0 ? cagr / Math.abs(maxDrawdown) : 0;

    return {
      totalReturn,
      cagr,
      sharpe,
      maxDrawdown,
      winRate,
      volatility,
      calmarRatio
    };
  }

  /**
   * Calculate yearly returns from equity curve
   */
  calculateYearlyReturns(equityCurve) {
    const yearlyReturns = [];
    const yearData = {};

    // Group by year
    for (const point of equityCurve) {
      const year = new Date(point.date).getFullYear();

      if (!yearData[year]) {
        yearData[year] = { values: [], drawdowns: [] };
      }

      yearData[year].values.push(point.value);
      yearData[year].drawdowns.push(point.drawdown);
    }

    // Calculate return and max DD for each year
    for (const [year, data] of Object.entries(yearData)) {
      if (data.values.length < 2) continue;

      const yearReturn = (data.values[data.values.length - 1] - data.values[0]) / data.values[0];
      const yearMaxDD = Math.min(...data.drawdowns);

      yearlyReturns.push({
        year: parseInt(year),
        return: yearReturn,
        maxDD: yearMaxDD
      });
    }

    return yearlyReturns.sort((a, b) => a.year - b.year);
  }

  /**
   * Calculate monthly returns from equity curve
   */
  calculateMonthlyReturns(equityCurve) {
    const monthlyReturns = [];
    const monthData = {};

    // Group by year-month
    for (const point of equityCurve) {
      const d = new Date(point.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthData[month]) {
        monthData[month] = [];
      }

      monthData[month].push(point.value);
    }

    // Calculate return for each month
    for (const [month, values] of Object.entries(monthData)) {
      if (values.length < 2) continue;

      const monthReturn = (values[values.length - 1] - values[0]) / values[0];

      monthlyReturns.push({
        month,
        return: monthReturn
      });
    }

    return monthlyReturns.sort((a, b) => a.month.localeCompare(b.month));
  }
}

module.exports = FactorBacktestAdapter;
