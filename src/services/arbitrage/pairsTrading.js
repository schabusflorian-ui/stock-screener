// src/services/arbitrage/pairsTrading.js
// Pairs Trading Engine - Simons-inspired statistical arbitrage
// Market-neutral alpha from mean reversion in cointegrated pairs

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * PairsTradingEngine - Statistical arbitrage for cointegrated pairs
 *
 * Implements:
 * - Cointegration testing (Engle-Granger method)
 * - Spread calculation and z-score tracking
 * - Entry/exit signal generation
 * - Dollar-neutral position sizing
 */
class PairsTradingEngine {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    // Tables should be created via migrations, not in service code
    this.cointegrationCache = new Map();
    console.log('⚖️ PairsTradingEngine initialized');
  }

  /**
   * Find cointegrated pairs within a sector or universe
   * @param {string|Array} sectorOrUniverse - Sector name or array of symbols
   * @param {number} lookback - Lookback period in days
   * @returns {Array} Cointegrated pairs
   */
  async findCointegrationPairs(sectorOrUniverse, lookback = 252) {
    const database = await getDatabaseAsync();
    let symbols = [];

    if (typeof sectorOrUniverse === 'string') {
      // Get stocks in sector
      const result = await database.query(`
        SELECT id, symbol FROM companies
        WHERE sector = $1 AND market_cap > 1000000000
        ORDER BY market_cap DESC
        LIMIT 50
      `, [sectorOrUniverse]);
      symbols = result.rows.map(c => c.symbol);
    } else {
      symbols = sectorOrUniverse;
    }

    if (symbols.length < 2) return [];

    const pairs = [];
    const date = new Date().toISOString().split('T')[0];

    // Test all pairs
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const result = await this.testCointegration(symbols[i], symbols[j], lookback);

        if (result.isCointegrated && result.halfLife >= 5 && result.halfLife <= 60) {
          pairs.push({
            symbol1: symbols[i],
            symbol2: symbols[j],
            cointegrationPValue: result.pValue,
            hedgeRatio: result.hedgeRatio,
            halfLife: result.halfLife,
            spreadMean: result.spreadMean,
            spreadStd: result.spreadStd
          });

          // Store to database
          const upsertSQL = isUsingPostgres()
            ? `INSERT INTO cointegration_pairs (
                symbol1, symbol2, cointegration_pvalue, hedge_ratio,
                half_life, spread_mean, spread_std, test_date, is_active
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
              ON CONFLICT (symbol1, symbol2, test_date)
              DO UPDATE SET
                cointegration_pvalue = EXCLUDED.cointegration_pvalue,
                hedge_ratio = EXCLUDED.hedge_ratio,
                half_life = EXCLUDED.half_life,
                spread_mean = EXCLUDED.spread_mean,
                spread_std = EXCLUDED.spread_std,
                is_active = EXCLUDED.is_active`
            : `INSERT OR REPLACE INTO cointegration_pairs (
                symbol1, symbol2, cointegration_pvalue, hedge_ratio,
                half_life, spread_mean, spread_std, test_date, is_active
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`;

          await database.query(upsertSQL, [
            symbols[i], symbols[j], result.pValue, result.hedgeRatio,
            result.halfLife, result.spreadMean, result.spreadStd, date
          ]);
        }
      }
    }

    // Sort by p-value (most cointegrated first)
    pairs.sort((a, b) => a.cointegrationPValue - b.cointegrationPValue);

    return pairs;
  }

  /**
   * Test cointegration between two price series
   * @param {string} symbol1 - First symbol
   * @param {string} symbol2 - Second symbol
   * @param {number} lookback - Lookback period
   * @returns {Object} Cointegration test results
   */
  async testCointegration(symbol1, symbol2, lookback = 252) {
    const database = await getDatabaseAsync();

    const result1 = await database.query(
      `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
      [symbol1]
    );
    const result2 = await database.query(
      `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
      [symbol2]
    );

    const company1 = result1.rows[0];
    const company2 = result2.rows[0];

    if (!company1 || !company2) {
      return { isCointegrated: false, error: 'Company not found' };
    }

    const priceResult1 = await database.query(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT $2
    `, [company1.id, lookback]);

    const priceResult2 = await database.query(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT $2
    `, [company2.id, lookback]);

    const prices1 = priceResult1.rows;
    const prices2 = priceResult2.rows;

    if (prices1.length < lookback * 0.8 || prices2.length < lookback * 0.8) {
      return { isCointegrated: false, error: 'Insufficient data' };
    }

    // Align prices by date
    const aligned = this._alignPrices(prices1, prices2);
    if (aligned.p1.length < 100) {
      return { isCointegrated: false, error: 'Insufficient aligned data' };
    }

    // Step 1: OLS regression to get hedge ratio
    const regression = this._linearRegression(aligned.p1, aligned.p2);
    const hedgeRatio = regression.slope;
    const residuals = regression.residuals;

    // Step 2: ADF test on residuals
    const adf = this._augmentedDickeyFuller(residuals);

    // Step 3: Calculate half-life
    const halfLife = this._calculateHalfLife(residuals);

    // Step 4: Calculate spread statistics
    const spreadMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const spreadStd = Math.sqrt(
      residuals.reduce((sum, r) => sum + (r - spreadMean) ** 2, 0) / (residuals.length - 1)
    );

    return {
      isCointegrated: adf.pValue < 0.05,
      pValue: adf.pValue,
      adfStatistic: adf.statistic,
      hedgeRatio,
      halfLife,
      spreadMean,
      spreadStd,
      residuals,
      rSquared: regression.rSquared
    };
  }

  _alignPrices(prices1, prices2) {
    const map1 = new Map(prices1.map(p => [p.date, p.price]));
    const p1 = [], p2 = [], dates = [];

    for (const p of prices2) {
      if (map1.has(p.date)) {
        p1.push(map1.get(p.date));
        p2.push(p.price);
        dates.push(p.date);
      }
    }

    return { p1, p2, dates };
  }

  _linearRegression(y, x) {
    const n = y.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));

    // R-squared
    const meanY = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0);
    const ssResid = residuals.reduce((sum, r) => sum + r * r, 0);
    const rSquared = 1 - ssResid / ssTotal;

    return { slope, intercept, residuals, rSquared };
  }

  _augmentedDickeyFuller(series) {
    // Simplified ADF test
    // H0: series has unit root (non-stationary)
    // H1: series is stationary

    const n = series.length;
    if (n < 20) return { statistic: 0, pValue: 1 };

    // Calculate first differences
    const diffs = [];
    for (let i = 1; i < n; i++) {
      diffs.push(series[i] - series[i - 1]);
    }

    // Regress diff on lagged level
    const y = diffs;
    const x = series.slice(0, -1);

    const regression = this._linearRegression(y, x);
    const gamma = regression.slope;

    // Calculate t-statistic
    const residuals = regression.residuals;
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const mse = sse / (n - 2);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const seGamma = Math.sqrt(mse / sumX2);

    const tStat = gamma / seGamma;

    // Critical values for ADF (approximate)
    // 1%: -3.43, 5%: -2.86, 10%: -2.57
    let pValue = 1;
    if (tStat < -3.43) pValue = 0.01;
    else if (tStat < -2.86) pValue = 0.05;
    else if (tStat < -2.57) pValue = 0.10;
    else if (tStat < -1.94) pValue = 0.25;
    else pValue = 0.50;

    return { statistic: tStat, pValue };
  }

  _calculateHalfLife(spread) {
    // AR(1) model: spread_t = rho * spread_{t-1} + epsilon
    // Half-life = -log(2) / log(rho)

    const n = spread.length;
    if (n < 10) return 999;

    const y = spread.slice(1);
    const x = spread.slice(0, -1);

    const regression = this._linearRegression(y, x);
    const rho = regression.slope;

    if (rho >= 1 || rho <= 0) return 999;

    const halfLife = -Math.log(2) / Math.log(rho);
    return Math.max(1, Math.min(252, halfLife));
  }

  /**
   * Calculate current spread z-score for a pair
   * @param {Object} pair - Pair info with symbol1, symbol2, hedgeRatio
   * @param {Object} currentPrices - {symbol1: price1, symbol2: price2}
   * @param {number} lookback - Lookback for mean/std calculation
   * @returns {Object} Spread analysis
   */
  async calculateSpreadZScore(pair, currentPrices, lookback = 60) {
    const database = await getDatabaseAsync();

    const result1 = await database.query(
      `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
      [pair.symbol1]
    );
    const result2 = await database.query(
      `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
      [pair.symbol2]
    );

    const company1 = result1.rows[0];
    const company2 = result2.rows[0];

    if (!company1 || !company2) return null;

    // Get historical prices for spread calculation
    const priceResult1 = await database.query(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT $2
    `, [company1.id, lookback]);

    const priceResult2 = await database.query(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT $2
    `, [company2.id, lookback]);

    const prices1 = priceResult1.rows;
    const prices2 = priceResult2.rows;

    const aligned = this._alignPrices(prices1, prices2);
    if (aligned.p1.length < 20) return null;

    // Calculate historical spreads
    const spreads = aligned.p1.map((p1, i) => p1 - pair.hedgeRatio * aligned.p2[i]);

    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const std = Math.sqrt(
      spreads.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (spreads.length - 1)
    );

    // Current spread
    const currentSpread = currentPrices[pair.symbol1] - pair.hedgeRatio * currentPrices[pair.symbol2];
    const zScore = (currentSpread - mean) / std;

    // Percentile
    const sortedSpreads = [...spreads].sort((a, b) => a - b);
    const percentile = sortedSpreads.filter(s => s < currentSpread).length / spreads.length * 100;

    return {
      spread: currentSpread,
      zScore,
      mean,
      std,
      percentile,
      isExtreme: Math.abs(zScore) > 2
    };
  }

  /**
   * Generate trading signals for cointegrated pairs
   * @param {Array} cointegrationPairs - List of pairs to analyze
   * @returns {Array} Trading signals
   */
  async generatePairSignals(cointegrationPairs) {
    const database = await getDatabaseAsync();
    const signals = [];

    for (const pair of cointegrationPairs) {
      // Get current prices
      const result1 = await database.query(
        `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [pair.symbol1]
      );
      const result2 = await database.query(
        `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [pair.symbol2]
      );

      const company1 = result1.rows[0];
      const company2 = result2.rows[0];

      if (!company1 || !company2) continue;

      const priceResult1 = await database.query(`
        SELECT date, close as price
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [company1.id]);

      const priceResult2 = await database.query(`
        SELECT date, close as price
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [company2.id]);

      const price1 = priceResult1.rows[0]?.price;
      const price2 = priceResult2.rows[0]?.price;

      if (!price1 || !price2) continue;

      const currentPrices = {
        [pair.symbol1]: price1,
        [pair.symbol2]: price2
      };

      const spreadAnalysis = await this.calculateSpreadZScore(pair, currentPrices);
      if (!spreadAnalysis) continue;

      let signal = 'hold';
      let confidence = 0.5;
      let reason = '';

      // Entry signals
      if (spreadAnalysis.zScore < -2.0) {
        signal = 'long_spread';
        confidence = Math.min(0.9, 0.5 + Math.abs(spreadAnalysis.zScore) * 0.15);
        reason = `Spread oversold (z=${spreadAnalysis.zScore.toFixed(2)})`;
      } else if (spreadAnalysis.zScore > 2.0) {
        signal = 'short_spread';
        confidence = Math.min(0.9, 0.5 + Math.abs(spreadAnalysis.zScore) * 0.15);
        reason = `Spread overbought (z=${spreadAnalysis.zScore.toFixed(2)})`;
      }

      // Exit signal (for existing positions)
      else if (Math.abs(spreadAnalysis.zScore) < 0.5) {
        signal = 'exit';
        confidence = 0.7;
        reason = `Spread mean reverted (z=${spreadAnalysis.zScore.toFixed(2)})`;
      }

      // Stop loss signal
      else if (Math.abs(spreadAnalysis.zScore) > 3.0) {
        signal = 'stop_loss';
        confidence = 0.9;
        reason = `Spread breakout - cointegration may have broken (z=${spreadAnalysis.zScore.toFixed(2)})`;
      }

      signals.push({
        pair: { symbol1: pair.symbol1, symbol2: pair.symbol2 },
        signal,
        zScore: spreadAnalysis.zScore,
        confidence,
        reason,
        expectedHoldingPeriod: pair.halfLife * 2,
        hedgeRatio: pair.hedgeRatio,
        currentPrices
      });
    }

    return signals.filter(s => s.signal !== 'hold');
  }

  /**
   * Calculate position sizes for a pair trade
   * @param {Object} signal - Trade signal
   * @param {number} portfolioValue - Total portfolio value
   * @param {number} maxPairAllocation - Max allocation per pair
   * @returns {Object} Position sizing
   */
  calculatePairPosition(signal, portfolioValue, maxPairAllocation = 0.02) {
    const dollarAmount = portfolioValue * maxPairAllocation;
    const halfAmount = dollarAmount / 2; // Equal dollar amounts each side

    const price1 = signal.currentPrices[signal.pair.symbol1];
    const price2 = signal.currentPrices[signal.pair.symbol2];

    let stock1Side, stock2Side;

    if (signal.signal === 'long_spread') {
      // Long spread = buy stock1, sell stock2
      stock1Side = 'long';
      stock2Side = 'short';
    } else if (signal.signal === 'short_spread') {
      // Short spread = sell stock1, buy stock2
      stock1Side = 'short';
      stock2Side = 'long';
    } else {
      return null;
    }

    const shares1 = Math.floor(halfAmount / price1);
    const shares2 = Math.floor(halfAmount / price2);

    const netExposure = (shares1 * price1) - (shares2 * price2);

    return {
      stock1: {
        symbol: signal.pair.symbol1,
        shares: shares1,
        side: stock1Side,
        dollarValue: shares1 * price1
      },
      stock2: {
        symbol: signal.pair.symbol2,
        shares: shares2,
        side: stock2Side,
        dollarValue: shares2 * price2
      },
      netExposure,
      isMarketNeutral: Math.abs(netExposure) < dollarAmount * 0.1,
      totalCapitalRequired: shares1 * price1 + shares2 * price2
    };
  }

  /**
   * Get all active cointegrated pairs
   * @returns {Array} Active pairs
   */
  async getActivePairs() {
    const database = await getDatabaseAsync();

    const dateCondition = isUsingPostgres()
      ? `test_date >= CURRENT_DATE - INTERVAL '30 days'`
      : `test_date >= date('now', '-30 days')`;

    const result = await database.query(`
      SELECT * FROM cointegration_pairs
      WHERE is_active = 1
        AND ${dateCondition}
      ORDER BY cointegration_pvalue ASC
    `);

    return result.rows;
  }

  /**
   * Get open pair positions
   * @returns {Array} Open positions
   */
  async getOpenPositions() {
    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT * FROM pair_positions WHERE status = 'open'`
    );
    return result.rows;
  }

  /**
   * Monitor cointegration breakdown for active pairs
   * @param {Array} activePairs - Pairs to monitor
   * @returns {Array} Breakdown warnings
   */
  async monitorCointegrationBreakdown(activePairs) {
    const warnings = [];

    for (const pair of activePairs) {
      // Re-test cointegration
      const result = await this.testCointegration(pair.symbol1, pair.symbol2, 63);

      let status = 'intact';
      if (result.pValue > 0.20) {
        status = 'broken';
      } else if (result.pValue > 0.10) {
        status = 'weakening';
      }

      warnings.push({
        pair: { symbol1: pair.symbol1, symbol2: pair.symbol2 },
        cointegrationStatus: status,
        currentPValue: result.pValue,
        originalPValue: pair.cointegration_pvalue,
        recommendation: status === 'broken'
          ? 'Exit position immediately'
          : status === 'weakening'
          ? 'Consider reducing position size'
          : 'Maintain position'
      });
    }

    return warnings.filter(w => w.cointegrationStatus !== 'intact');
  }

  /**
   * Calculate P&L for pairs portfolio
   * @param {Array} positions - Open positions
   * @returns {Object} Portfolio P&L
   */
  async calculatePairsPortfolioPnL(positions) {
    const database = await getDatabaseAsync();
    let totalPnL = 0;
    const pairPnLs = [];

    for (const pos of positions) {
      const result1 = await database.query(
        `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [pos.symbol1]
      );
      const result2 = await database.query(
        `SELECT id, symbol, sector FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [pos.symbol2]
      );

      const company1 = result1.rows[0];
      const company2 = result2.rows[0];

      if (!company1 || !company2) continue;

      const priceResult1 = await database.query(`
        SELECT date, close as price
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [company1.id]);

      const priceResult2 = await database.query(`
        SELECT date, close as price
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [company2.id]);

      const currentPrice1 = priceResult1.rows[0]?.price;
      const currentPrice2 = priceResult2.rows[0]?.price;

      if (!currentPrice1 || !currentPrice2) continue;

      // Calculate P&L for each leg
      let pnl1, pnl2;

      if (pos.stock1_side === 'long') {
        pnl1 = (currentPrice1 - pos.stock1_entry_price) * pos.stock1_shares;
      } else {
        pnl1 = (pos.stock1_entry_price - currentPrice1) * pos.stock1_shares;
      }

      if (pos.stock2_side === 'long') {
        pnl2 = (currentPrice2 - pos.stock2_entry_price) * pos.stock2_shares;
      } else {
        pnl2 = (pos.stock2_entry_price - currentPrice2) * pos.stock2_shares;
      }

      const pairPnL = pnl1 + pnl2;
      totalPnL += pairPnL;

      pairPnLs.push({
        pair: `${pos.symbol1}/${pos.symbol2}`,
        pnl: pairPnL,
        pnl1,
        pnl2,
        entryDate: pos.entry_date,
        entryZScore: pos.entry_zscore
      });
    }

    return {
      totalPnL,
      pairPnLs,
      numPositions: positions.length
    };
  }

  /**
   * Store a new pair position
   * @param {number} pairId - Cointegration pair ID
   * @param {Object} position - Position details
   */
  async openPosition(pairId, position) {
    const database = await getDatabaseAsync();
    const date = new Date().toISOString().split('T')[0];

    await database.query(`
      INSERT INTO pair_positions (
        pair_id, symbol1, symbol2, entry_date, entry_zscore,
        stock1_shares, stock1_entry_price, stock1_side,
        stock2_shares, stock2_entry_price, stock2_side, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')
    `, [
      pairId,
      position.stock1.symbol,
      position.stock2.symbol,
      date,
      position.entryZScore,
      position.stock1.shares,
      position.stock1.price,
      position.stock1.side,
      position.stock2.shares,
      position.stock2.price,
      position.stock2.side
    ]);

    await database.query(`
      INSERT INTO pair_trades (pair_id, symbol1, symbol2, trade_date, action, zscore_at_trade, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      pairId,
      position.stock1.symbol,
      position.stock2.symbol,
      date,
      'OPEN',
      position.entryZScore,
      position.reason || 'Signal entry'
    ]);
  }

  /**
   * Close a pair position
   * @param {number} positionId - Position ID
   * @param {number} exitZScore - Z-score at exit
   * @param {number} pnl - Realized P&L
   */
  async closePosition(positionId, exitZScore, pnl) {
    const database = await getDatabaseAsync();
    const date = new Date().toISOString().split('T')[0];

    await database.query(`
      UPDATE pair_positions
      SET status = 'closed', exit_date = $1, exit_zscore = $2, pnl = $3
      WHERE id = $4
    `, [date, exitZScore, pnl, positionId]);
  }
}

function createPairsTradingEngine() {
  return new PairsTradingEngine();
}

module.exports = { PairsTradingEngine, createPairsTradingEngine };
