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
    const tradingDaysResult = await this.db.query(
      `SELECT DISTINCT date
       FROM daily_prices
       WHERE date >= $1 AND date <= $2
       ORDER BY date ASC`,
      [startDate, endDate]
    );
    const tradingDays = tradingDaysResult.rows.map(row => row.date);

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

    // Track universe statistics at each rebalance
    const universeStats = [];

    // Simulate each trading day
    for (let i = 0; i < tradingDays.length; i++) {
      const date = tradingDays[i];

      // Calculate portfolio value
      const portfolioValue = await this.calculatePortfolioValue(positions, date, capital);

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

          // Track universe statistics for this rebalance
          const sectors = [...new Set(factorResult.values.map(v => v.sector).filter(Boolean))];
          universeStats.push({
            date,
            eligible: factorResult.values.length,
            longCount: long.length,
            shortCount: short.length,
            sectorCount: sectors.length
          });

          // Execute rebalance
          const rebalanceResult = await this.executeRebalance(
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

    // Calculate aggregated universe statistics
    const avgEligible = universeStats.length > 0
      ? Math.round(universeStats.reduce((a, b) => a + b.eligible, 0) / universeStats.length)
      : 0;
    const avgLongPositions = universeStats.length > 0
      ? Math.round(universeStats.reduce((a, b) => a + b.longCount, 0) / universeStats.length)
      : 0;
    const avgShortPositions = universeStats.length > 0
      ? Math.round(universeStats.reduce((a, b) => a + b.shortCount, 0) / universeStats.length)
      : 0;
    const avgSectors = universeStats.length > 0
      ? Math.round(universeStats.reduce((a, b) => a + b.sectorCount, 0) / universeStats.length)
      : 0;

    // Calculate summary metrics and period returns
    return {
      equity: equityCurve,
      summary: this.calculateSummaryMetrics(equityCurve),
      periodReturns: {
        yearly: this.calculateYearlyReturns(equityCurve),
        monthly: this.calculateMonthlyReturns(equityCurve)
      },
      universe: {
        filter: config.universe || 'ALL',
        minMarketCap: config.minMarketCap || null,
        rebalanceCount: universeStats.length,
        avgEligible,
        avgLongPositions,
        avgShortPositions,
        avgSectors,
        longShortRatio,
        // Per-rebalance breakdown (optional, for detailed analysis)
        stats: universeStats
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
   *
   * Short position accounting:
   * - When we short, we receive proceeds but owe shares
   * - P&L = (entry price - current price) * shares
   * - If price drops, we profit; if price rises, we lose
   * - The proceeds are already in cash, so we only add the unrealized P&L
   */
  async calculatePortfolioValue(positions, date, cash) {
    let value = cash;

    for (const [symbol, position] of positions) {
      const priceResult = await this.db.query(
        `SELECT dp.adjusted_close as price
         FROM daily_prices dp
         JOIN companies c ON dp.company_id = c.id
         WHERE c.symbol = $1 AND dp.date <= $2
         ORDER BY dp.date DESC
         LIMIT 1`,
        [symbol, date]
      );

      if (priceResult.rows.length === 0) {
        console.warn(`No price found for ${symbol} on ${date}`);
        continue;
      }

      const currentPrice = priceResult.rows[0].price;

      if (position.side === 'long') {
        // Long: current market value
        value += position.shares * currentPrice;
      } else {
        // Short: only the unrealized P&L (proceeds already in cash)
        // P&L = (entry price - current price) * shares
        // Positive if price dropped (we profit), negative if price rose (we lose)
        value += position.shares * (position.avgPrice - currentPrice);
      }
    }

    return value;
  }

  /**
   * Execute rebalance: close old positions, open new positions
   *
   * Simplified NAV-based approach:
   * - NAV = portfolioValue at start
   * - Apply transaction costs as percentage of turnover
   * - Allocate 50% notional to longs, 50% notional to shorts
   * - Track positions; cash is implicit (NAV minus position values)
   */
  async executeRebalance(oldPositions, targets, portfolioValue, date, transactionCost) {
    const newPositions = new Map();

    // Calculate turnover cost (closing old + opening new positions)
    let turnoverNotional = 0;
    for (const [symbol, position] of oldPositions) {
      const priceResult = await this.db.query(
        `SELECT dp.adjusted_close as price
         FROM daily_prices dp
         JOIN companies c ON dp.company_id = c.id
         WHERE c.symbol = $1 AND dp.date <= $2
         ORDER BY dp.date DESC
         LIMIT 1`,
        [symbol, date]
      );
      if (priceResult.rows.length > 0) {
        turnoverNotional += position.shares * priceResult.rows[0].price;
      }
    }

    // NAV after closing costs
    let nav = portfolioValue - (turnoverNotional * transactionCost);

    // Target 50% long exposure, 50% short exposure (by notional)
    const targetLongNotional = nav * 0.5;
    const targetShortNotional = nav * 0.5;

    // Build new long positions (equal weight)
    let actualLongNotional = 0;
    if (targets.long.length > 0) {
      const perStockLong = targetLongNotional / targets.long.length;

      for (const stock of targets.long) {
        const priceResult = await this.db.query(
          `SELECT dp.adjusted_close as price
           FROM daily_prices dp
           JOIN companies c ON dp.company_id = c.id
           WHERE c.symbol = $1 AND dp.date <= $2
           ORDER BY dp.date DESC
           LIMIT 1`,
          [stock.symbol, date]
        );
        if (priceResult.rows.length === 0 || priceResult.rows[0].price <= 0) continue;

        const price = priceResult.rows[0].price;
        const shares = Math.floor(perStockLong / price);

        if (shares > 0) {
          newPositions.set(stock.symbol, {
            shares,
            avgPrice: price,
            side: 'long'
          });
          actualLongNotional += shares * price;
        }
      }
    }

    // Build new short positions (equal weight)
    let actualShortNotional = 0;
    if (targets.short.length > 0) {
      const perStockShort = targetShortNotional / targets.short.length;

      for (const stock of targets.short) {
        const priceResult = await this.db.query(
          `SELECT dp.adjusted_close as price
           FROM daily_prices dp
           JOIN companies c ON dp.company_id = c.id
           WHERE c.symbol = $1 AND dp.date <= $2
           ORDER BY dp.date DESC
           LIMIT 1`,
          [stock.symbol, date]
        );
        if (priceResult.rows.length === 0 || priceResult.rows[0].price <= 0) continue;

        const price = priceResult.rows[0].price;
        const shares = Math.floor(perStockShort / price);

        if (shares > 0) {
          newPositions.set(stock.symbol, {
            shares,
            avgPrice: price,
            side: 'short'
          });
          actualShortNotional += shares * price;
        }
      }
    }

    // Opening transaction costs
    const openingCosts = (actualLongNotional + actualShortNotional) * transactionCost;

    // Remaining cash = NAV - long notional (shorts are funded by borrowed shares)
    // We only "spend" cash on longs; shorts generate proceeds that offset the liability
    const remainingCash = nav - actualLongNotional - openingCosts;

    return { positions: newPositions, capital: remainingCash };
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
