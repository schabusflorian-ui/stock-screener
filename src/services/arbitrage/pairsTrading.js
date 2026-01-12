// src/services/arbitrage/pairsTrading.js
// Pairs Trading Engine - Simons-inspired statistical arbitrage
// Market-neutral alpha from mean reversion in cointegrated pairs

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
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this.cointegrationCache = new Map();
    this._initializeTables();
    this._prepareStatements();
    console.log('⚖️ PairsTradingEngine initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cointegration_pairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol1 TEXT NOT NULL,
        symbol2 TEXT NOT NULL,
        cointegration_pvalue REAL,
        hedge_ratio REAL,
        half_life REAL,
        spread_mean REAL,
        spread_std REAL,
        test_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(symbol1, symbol2, test_date)
      );

      CREATE TABLE IF NOT EXISTS pair_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair_id INTEGER REFERENCES cointegration_pairs(id),
        symbol1 TEXT,
        symbol2 TEXT,
        entry_date TEXT,
        entry_zscore REAL,
        stock1_shares INTEGER,
        stock1_entry_price REAL,
        stock1_side TEXT,
        stock2_shares INTEGER,
        stock2_entry_price REAL,
        stock2_side TEXT,
        status TEXT DEFAULT 'open',
        exit_date TEXT,
        exit_zscore REAL,
        pnl REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pair_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair_id INTEGER,
        symbol1 TEXT,
        symbol2 TEXT,
        trade_date TEXT,
        action TEXT,
        zscore_at_trade REAL,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtGetCompanyId = this.db.prepare(`
      SELECT id, symbol, sector FROM companies WHERE symbol = ? COLLATE NOCASE
    `);

    this.stmtGetPriceHistory = this.db.prepare(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    this.stmtStorePair = this.db.prepare(`
      INSERT OR REPLACE INTO cointegration_pairs (
        symbol1, symbol2, cointegration_pvalue, hedge_ratio,
        half_life, spread_mean, spread_std, test_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    this.stmtGetActivePairs = this.db.prepare(`
      SELECT * FROM cointegration_pairs
      WHERE is_active = 1
        AND test_date >= date('now', '-30 days')
      ORDER BY cointegration_pvalue ASC
    `);

    this.stmtStorePosition = this.db.prepare(`
      INSERT INTO pair_positions (
        pair_id, symbol1, symbol2, entry_date, entry_zscore,
        stock1_shares, stock1_entry_price, stock1_side,
        stock2_shares, stock2_entry_price, stock2_side, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `);

    this.stmtGetOpenPositions = this.db.prepare(`
      SELECT * FROM pair_positions WHERE status = 'open'
    `);

    this.stmtClosePosition = this.db.prepare(`
      UPDATE pair_positions
      SET status = 'closed', exit_date = ?, exit_zscore = ?, pnl = ?
      WHERE id = ?
    `);

    this.stmtStoreTrade = this.db.prepare(`
      INSERT INTO pair_trades (pair_id, symbol1, symbol2, trade_date, action, zscore_at_trade, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetCompaniesBySector = this.db.prepare(`
      SELECT id, symbol FROM companies
      WHERE sector = ? AND market_cap > 1000000000
      ORDER BY market_cap DESC
      LIMIT 50
    `);
  }

  /**
   * Find cointegrated pairs within a sector or universe
   * @param {string|Array} sectorOrUniverse - Sector name or array of symbols
   * @param {number} lookback - Lookback period in days
   * @returns {Array} Cointegrated pairs
   */
  async findCointegrationPairs(sectorOrUniverse, lookback = 252) {
    let symbols = [];

    if (typeof sectorOrUniverse === 'string') {
      // Get stocks in sector
      const companies = this.stmtGetCompaniesBySector.all(sectorOrUniverse);
      symbols = companies.map(c => c.symbol);
    } else {
      symbols = sectorOrUniverse;
    }

    if (symbols.length < 2) return [];

    const pairs = [];
    const date = new Date().toISOString().split('T')[0];

    // Test all pairs
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const result = this.testCointegration(symbols[i], symbols[j], lookback);

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
          this.stmtStorePair.run(
            symbols[i], symbols[j], result.pValue, result.hedgeRatio,
            result.halfLife, result.spreadMean, result.spreadStd, date
          );
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
  testCointegration(symbol1, symbol2, lookback = 252) {
    const company1 = this.stmtGetCompanyId.get(symbol1);
    const company2 = this.stmtGetCompanyId.get(symbol2);

    if (!company1 || !company2) {
      return { isCointegrated: false, error: 'Company not found' };
    }

    const prices1 = this.stmtGetPriceHistory.all(company1.id, lookback);
    const prices2 = this.stmtGetPriceHistory.all(company2.id, lookback);

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
  calculateSpreadZScore(pair, currentPrices, lookback = 60) {
    const company1 = this.stmtGetCompanyId.get(pair.symbol1);
    const company2 = this.stmtGetCompanyId.get(pair.symbol2);

    if (!company1 || !company2) return null;

    // Get historical prices for spread calculation
    const prices1 = this.stmtGetPriceHistory.all(company1.id, lookback);
    const prices2 = this.stmtGetPriceHistory.all(company2.id, lookback);

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
  generatePairSignals(cointegrationPairs) {
    const signals = [];

    for (const pair of cointegrationPairs) {
      // Get current prices
      const company1 = this.stmtGetCompanyId.get(pair.symbol1);
      const company2 = this.stmtGetCompanyId.get(pair.symbol2);

      if (!company1 || !company2) continue;

      const price1 = this.stmtGetPriceHistory.all(company1.id, 1)[0]?.price;
      const price2 = this.stmtGetPriceHistory.all(company2.id, 1)[0]?.price;

      if (!price1 || !price2) continue;

      const currentPrices = {
        [pair.symbol1]: price1,
        [pair.symbol2]: price2
      };

      const spreadAnalysis = this.calculateSpreadZScore(pair, currentPrices);
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
  getActivePairs() {
    return this.stmtGetActivePairs.all();
  }

  /**
   * Get open pair positions
   * @returns {Array} Open positions
   */
  getOpenPositions() {
    return this.stmtGetOpenPositions.all();
  }

  /**
   * Monitor cointegration breakdown for active pairs
   * @param {Array} activePairs - Pairs to monitor
   * @returns {Array} Breakdown warnings
   */
  monitorCointegrationBreakdown(activePairs) {
    const warnings = [];

    for (const pair of activePairs) {
      // Re-test cointegration
      const result = this.testCointegration(pair.symbol1, pair.symbol2, 63);

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
  calculatePairsPortfolioPnL(positions) {
    let totalPnL = 0;
    const pairPnLs = [];

    for (const pos of positions) {
      const company1 = this.stmtGetCompanyId.get(pos.symbol1);
      const company2 = this.stmtGetCompanyId.get(pos.symbol2);

      if (!company1 || !company2) continue;

      const currentPrice1 = this.stmtGetPriceHistory.all(company1.id, 1)[0]?.price;
      const currentPrice2 = this.stmtGetPriceHistory.all(company2.id, 1)[0]?.price;

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
  openPosition(pairId, position) {
    const date = new Date().toISOString().split('T')[0];

    this.stmtStorePosition.run(
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
    );

    this.stmtStoreTrade.run(
      pairId,
      position.stock1.symbol,
      position.stock2.symbol,
      date,
      'OPEN',
      position.entryZScore,
      position.reason || 'Signal entry'
    );
  }

  /**
   * Close a pair position
   * @param {number} positionId - Position ID
   * @param {number} exitZScore - Z-score at exit
   * @param {number} pnl - Realized P&L
   */
  closePosition(positionId, exitZScore, pnl) {
    const date = new Date().toISOString().split('T')[0];
    this.stmtClosePosition.run(date, exitZScore, pnl, positionId);
  }
}

function createPairsTradingEngine(db) {
  return new PairsTradingEngine(db);
}

module.exports = { PairsTradingEngine, createPairsTradingEngine };
