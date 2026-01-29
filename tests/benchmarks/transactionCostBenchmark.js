// tests/benchmarks/transactionCostBenchmark.js
/**
 * Transaction Cost Analysis (TCA) Benchmark
 *
 * Comprehensive benchmark for measuring execution quality:
 * - Implementation Shortfall: Actual fill vs decision price
 * - VWAP Deviation: Execution vs market VWAP
 * - Market Impact: Price move during execution
 * - Spread Cost Analysis: Half-spread paid on fills
 * - Timing Cost: Delay from signal to execution
 * - Opportunity Cost: Unexecuted orders (partial fills)
 *
 * Production-ready thresholds:
 * - Implementation shortfall: < 10bps for liquid names
 * - VWAP deviation: < 5bps
 * - Market impact: < 15bps for 1% ADV orders
 * - Spread cost: < 3bps for S&P 500 names
 */

const path = require('path');
const { db } = require(path.join(__dirname, '../../src/database'));
const { TransactionCostModel, CostModels, BROKER_PROFILES } = require('../../src/services/costs');

// ============================================
// TCA Benchmark Thresholds (Production-Ready)
// ============================================

const TCA_THRESHOLDS = {
  // By liquidity tier
  MEGA_CAP: { // ADV > $500M
    implementationShortfall: 5,  // bps
    vwapDeviation: 3,
    marketImpact: 8,
    spreadCost: 2
  },
  LARGE_CAP: { // ADV $100-500M
    implementationShortfall: 10,
    vwapDeviation: 5,
    marketImpact: 15,
    spreadCost: 3
  },
  MID_CAP: { // ADV $20-100M
    implementationShortfall: 20,
    vwapDeviation: 10,
    marketImpact: 30,
    spreadCost: 8
  },
  SMALL_CAP: { // ADV < $20M
    implementationShortfall: 40,
    vwapDeviation: 20,
    marketImpact: 50,
    spreadCost: 15
  }
};

// ============================================
// TCA Metrics Calculator
// ============================================

class TCAMetricsCalculator {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Check if required tables exist
    const tableCheck = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('historical_prices', 'companies')
    `).all();
    const tables = tableCheck.map(t => t.name);
    const hasHistoricalPrices = tables.includes('historical_prices');
    const hasCompanies = tables.includes('companies');

    if (!hasHistoricalPrices || !hasCompanies) {
      console.warn('TCA: Required tables not found. Using fallback mode.');
      this.stmts = {
        getHistoricalPrices: { all: () => [] },
        getCompanyBySymbol: { get: () => null },
        getADV: { get: () => ({ adv: 1e6 }) },
        getVolatility: { get: () => ({ avg_range: 0.02, avg_price: 100 }) }
      };
      return;
    }

    // Get historical prices for VWAP/TWAP calculation
    this.stmts = {
      getHistoricalPrices: this.db.prepare(`
        SELECT date, open, high, low, close, volume
        FROM historical_prices
        WHERE company_id = ? AND date BETWEEN ? AND ?
        ORDER BY date
      `),
      getCompanyBySymbol: this.db.prepare(`
        SELECT id, symbol, name, market_cap FROM companies WHERE symbol = ?
      `),
      getADV: this.db.prepare(`
        SELECT AVG(volume * close) as adv
        FROM historical_prices
        WHERE company_id = ? AND date >= date('now', '-30 days')
      `),
      getVolatility: this.db.prepare(`
        SELECT
          AVG(ABS((close - open) / open)) as avg_range,
          AVG(close) as avg_price
        FROM historical_prices
        WHERE company_id = ? AND date >= date('now', '-30 days')
      `)
    };
  }

  /**
   * Calculate Implementation Shortfall
   * IS = (Execution Price - Decision Price) / Decision Price
   *
   * For buys: positive IS means we paid more than expected
   * For sells: positive IS means we received less than expected
   */
  calculateImplementationShortfall(decisionPrice, executionPrice, side) {
    if (!decisionPrice || !executionPrice) return null;

    let shortfallPct;
    if (side === 'buy') {
      shortfallPct = (executionPrice - decisionPrice) / decisionPrice;
    } else {
      shortfallPct = (decisionPrice - executionPrice) / decisionPrice;
    }

    return {
      decisionPrice,
      executionPrice,
      shortfallPct,
      shortfallBps: shortfallPct * 10000,
      side
    };
  }

  /**
   * Calculate VWAP for a trading period
   * VWAP = Σ(Price × Volume) / Σ(Volume)
   */
  calculateVWAP(symbol, startDate, endDate) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    const prices = this.stmts.getHistoricalPrices.all(company.id, startDate, endDate);
    if (prices.length === 0) return null;

    let sumPV = 0;
    let sumV = 0;

    for (const day of prices) {
      // Use typical price as proxy for intraday VWAP
      const typicalPrice = (day.high + day.low + day.close) / 3;
      sumPV += typicalPrice * day.volume;
      sumV += day.volume;
    }

    return sumV > 0 ? sumPV / sumV : null;
  }

  /**
   * Calculate TWAP for a trading period
   * TWAP = Σ(Price) / n
   */
  calculateTWAP(symbol, startDate, endDate) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    const prices = this.stmts.getHistoricalPrices.all(company.id, startDate, endDate);
    if (prices.length === 0) return null;

    let sumPrice = 0;
    for (const day of prices) {
      const typicalPrice = (day.high + day.low + day.close) / 3;
      sumPrice += typicalPrice;
    }

    return sumPrice / prices.length;
  }

  /**
   * Calculate deviation from VWAP
   */
  calculateVWAPDeviation(executionPrice, vwap, side) {
    if (!executionPrice || !vwap) return null;

    let deviationPct;
    if (side === 'buy') {
      deviationPct = (executionPrice - vwap) / vwap;
    } else {
      deviationPct = (vwap - executionPrice) / vwap;
    }

    return {
      executionPrice,
      vwap,
      deviationPct,
      deviationBps: deviationPct * 10000,
      quality: deviationPct <= 0 ? 'better_than_vwap' : 'worse_than_vwap'
    };
  }

  /**
   * Estimate market impact from order execution
   * Uses price reversion analysis
   */
  calculateMarketImpact(symbol, executionDate, shares, side) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    // Get ADV to calculate participation rate
    const advResult = this.stmts.getADV.get(company.id);
    const adv = advResult?.adv || 1e6;

    // Get price at execution and subsequent prices
    const prices = this.db.prepare(`
      SELECT date, open, close
      FROM historical_prices
      WHERE company_id = ? AND date >= ?
      ORDER BY date
      LIMIT 5
    `).all(company.id, executionDate);

    if (prices.length < 2) return null;

    const executionDayPrice = prices[0].close;
    const nextDayPrice = prices[1]?.open || prices[1]?.close;

    // Participation rate
    const avgVolume = adv / prices[0].close;
    const participationRate = shares / avgVolume;

    // Temporary impact (price move during execution that reverts)
    const priceMove = side === 'buy'
      ? (executionDayPrice - prices[0].open) / prices[0].open
      : (prices[0].open - executionDayPrice) / prices[0].open;

    // Permanent impact (price move that persists)
    const priceReversion = side === 'buy'
      ? (nextDayPrice - executionDayPrice) / executionDayPrice
      : (executionDayPrice - nextDayPrice) / executionDayPrice;

    const temporaryImpact = Math.max(0, priceMove + priceReversion);
    const permanentImpact = Math.max(0, -priceReversion);

    return {
      participationRate,
      participationPct: participationRate * 100,
      temporaryImpactBps: temporaryImpact * 10000,
      permanentImpactBps: permanentImpact * 10000,
      totalImpactBps: (temporaryImpact + permanentImpact) * 10000,
      warning: participationRate > 0.10 ? 'High participation rate' : null
    };
  }

  /**
   * Estimate spread cost
   */
  calculateSpreadCost(symbol) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    const volResult = this.stmts.getVolatility.get(company.id);
    const advResult = this.stmts.getADV.get(company.id);

    const avgPrice = volResult?.avg_price || 100;
    const adv = advResult?.adv || 1e6;
    const dailyVolatility = volResult?.avg_range || 0.02;

    // Estimate spread based on liquidity and volatility
    // More liquid stocks have tighter spreads
    let baseSpreadBps;
    if (adv > 500e6) {
      baseSpreadBps = 1.5; // Mega-cap
    } else if (adv > 100e6) {
      baseSpreadBps = 2.5; // Large-cap
    } else if (adv > 20e6) {
      baseSpreadBps = 5; // Mid-cap
    } else {
      baseSpreadBps = 12; // Small-cap
    }

    // Volatility adjustment
    const volMultiplier = 1 + Math.max(0, (dailyVolatility - 0.02) * 20);

    return {
      estimatedFullSpreadBps: baseSpreadBps * volMultiplier,
      estimatedHalfSpreadBps: (baseSpreadBps * volMultiplier) / 2,
      adv,
      liquidityTier: adv > 500e6 ? 'mega' : adv > 100e6 ? 'large' : adv > 20e6 ? 'mid' : 'small'
    };
  }

  /**
   * Get liquidity tier for a symbol
   */
  getLiquidityTier(symbol) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return 'SMALL_CAP';

    const advResult = this.stmts.getADV.get(company.id);
    const adv = advResult?.adv || 0;

    if (adv > 500e6) return 'MEGA_CAP';
    if (adv > 100e6) return 'LARGE_CAP';
    if (adv > 20e6) return 'MID_CAP';
    return 'SMALL_CAP';
  }

  /**
   * Calculate Timing Cost (Delay Cost)
   * Cost of delay between decision and execution
   *
   * Timing Cost = (Execution Price - Decision Price) due to delay
   * For overnight delay: measures price gap
   * For intraday delay: measures drift during wait
   */
  calculateTimingCost(symbol, decisionPrice, decisionDate, executionDate, side) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    // Get prices between decision and execution
    const prices = this.db.prepare(`
      SELECT date, open, close
      FROM historical_prices
      WHERE company_id = ? AND date BETWEEN ? AND ?
      ORDER BY date
    `).all(company.id, decisionDate, executionDate);

    if (prices.length === 0) return null;

    // Calculate price drift during delay
    const decisionDayClose = prices[0]?.close || decisionPrice;
    const executionDayOpen = prices[prices.length - 1]?.open || decisionDayClose;

    let timingCostPct;
    if (side === 'buy') {
      // For buys, timing cost is positive if price increased during delay
      timingCostPct = (executionDayOpen - decisionDayClose) / decisionDayClose;
    } else {
      // For sells, timing cost is positive if price decreased during delay
      timingCostPct = (decisionDayClose - executionDayOpen) / decisionDayClose;
    }

    const delayDays = prices.length - 1;

    return {
      decisionPrice: decisionDayClose,
      executionOpenPrice: executionDayOpen,
      timingCostPct,
      timingCostBps: timingCostPct * 10000,
      delayDays,
      overnightGap: delayDays > 0,
      assessment: timingCostPct > 0.002 ? 'significant_delay_cost' :
                  timingCostPct > 0 ? 'minor_delay_cost' : 'favorable_timing'
    };
  }

  /**
   * Calculate Opportunity Cost
   * Cost of not executing the full order (partial fills)
   *
   * Opportunity Cost = Unfilled Shares × (Subsequent Price - Decision Price)
   * Measures the cost of missing the trade due to insufficient execution
   */
  calculateOpportunityCost(symbol, targetShares, filledShares, decisionPrice, executionDate, side, horizonDays = 5) {
    if (filledShares >= targetShares) {
      return {
        unfilledShares: 0,
        fillRate: 1.0,
        opportunityCostBps: 0,
        assessment: 'fully_filled'
      };
    }

    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) return null;

    // Get subsequent price to measure missed opportunity
    const subsequentPrices = this.db.prepare(`
      SELECT date, close
      FROM historical_prices
      WHERE company_id = ? AND date > ?
      ORDER BY date
      LIMIT ?
    `).all(company.id, executionDate, horizonDays);

    if (subsequentPrices.length === 0) return null;

    const unfilledShares = targetShares - filledShares;
    const fillRate = filledShares / targetShares;

    // Use average subsequent price as "what we missed"
    const avgSubsequentPrice = subsequentPrices.reduce((sum, p) => sum + p.close, 0) / subsequentPrices.length;

    let opportunityCostPct;
    if (side === 'buy') {
      // For buys, opportunity cost is positive if price went up (missed the move)
      opportunityCostPct = Math.max(0, (avgSubsequentPrice - decisionPrice) / decisionPrice);
    } else {
      // For sells, opportunity cost is positive if price went down (could have sold higher)
      opportunityCostPct = Math.max(0, (decisionPrice - avgSubsequentPrice) / decisionPrice);
    }

    const opportunityCostDollars = unfilledShares * decisionPrice * opportunityCostPct;

    return {
      targetShares,
      filledShares,
      unfilledShares,
      fillRate,
      decisionPrice,
      avgSubsequentPrice,
      opportunityCostPct,
      opportunityCostBps: opportunityCostPct * 10000,
      opportunityCostDollars,
      assessment: fillRate < 0.5 ? 'significant_shortfall' :
                  fillRate < 0.9 ? 'partial_fill' : 'mostly_filled'
    };
  }

  /**
   * Calculate comprehensive Implementation Shortfall breakdown
   * IS = Delay Cost + Market Impact + Timing Cost + Spread Cost
   */
  calculateISBreakdown(trade) {
    const {
      symbol, side, shares, filledShares,
      decisionPrice, decisionDate, executionPrice, executionDate
    } = trade;

    // Total IS
    const totalIS = this.calculateImplementationShortfall(
      decisionPrice, executionPrice, side
    );

    // Timing/Delay Cost
    const timingCost = this.calculateTimingCost(
      symbol, decisionPrice, decisionDate, executionDate, side
    );

    // Market Impact
    const marketImpact = this.calculateMarketImpact(
      symbol, executionDate, filledShares || shares, side
    );

    // Spread Cost
    const spreadCost = this.calculateSpreadCost(symbol);

    // Opportunity Cost
    const opportunityCost = this.calculateOpportunityCost(
      symbol, shares, filledShares || shares, decisionPrice, executionDate, side
    );

    return {
      total: totalIS,
      breakdown: {
        delayCost: timingCost,
        marketImpact: marketImpact,
        spreadCost: spreadCost,
        opportunityCost: opportunityCost
      },
      summary: {
        totalBps: totalIS?.shortfallBps || 0,
        delayCostBps: timingCost?.timingCostBps || 0,
        marketImpactBps: marketImpact?.totalImpactBps || 0,
        spreadCostBps: spreadCost?.estimatedHalfSpreadBps || 0,
        opportunityCostBps: opportunityCost?.opportunityCostBps || 0
      }
    };
  }
}

// ============================================
// TCA Benchmark Suite
// ============================================

class TCABenchmark {
  constructor(db, options = {}) {
    this.db = db;
    this.calculator = new TCAMetricsCalculator(db);
    this.options = {
      verbose: options.verbose !== false,
      ...options
    };
    this.results = {
      trades: [],
      summary: null,
      byLiquidityTier: {},
      passFail: {}
    };
  }

  /**
   * Run full TCA benchmark on executed trades
   */
  async runBenchmark(trades = null) {
    console.log('='.repeat(70));
    console.log('TRANSACTION COST ANALYSIS (TCA) BENCHMARK');
    console.log('='.repeat(70));

    // Get trades to analyze
    const tradesToAnalyze = trades || this._getRecentTrades();

    if (tradesToAnalyze.length === 0) {
      console.log('\nNo trades found for analysis. Generating synthetic test data...');
      return this._runSyntheticBenchmark();
    }

    console.log(`\nAnalyzing ${tradesToAnalyze.length} trades...\n`);

    // Analyze each trade
    for (const trade of tradesToAnalyze) {
      const analysis = this._analyzeTrade(trade);
      this.results.trades.push(analysis);
    }

    // Calculate summary statistics
    this._calculateSummary();

    // Determine pass/fail
    this._evaluateThresholds();

    // Print results
    this._printResults();

    return this.results;
  }

  /**
   * Run benchmark with synthetic data when no real trades exist
   */
  _runSyntheticBenchmark() {
    console.log('\nGenerating synthetic trades for benchmark validation...\n');

    // Try to get real symbols from database, fall back to hardcoded
    let symbols = [];
    try {
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='companies'
      `).all();

      if (tableCheck.length > 0) {
        symbols = this.db.prepare(`
          SELECT c.symbol, c.market_cap,
                 (SELECT AVG(volume * close) FROM historical_prices hp
                  WHERE hp.company_id = c.id AND date >= date('now', '-30 days')) as adv
          FROM companies c
          WHERE c.market_cap > 0
          ORDER BY c.market_cap DESC
          LIMIT 20
        `).all();
      }
    } catch (e) {
      // Use fallback
    }

    // Fallback to synthetic portfolio if no real data
    if (symbols.length === 0) {
      console.log('Using synthetic test portfolio (no database data available)...\n');
      symbols = [
        { symbol: 'AAPL', market_cap: 3000e9, adv: 500e6, price: 180 },
        { symbol: 'MSFT', market_cap: 2800e9, adv: 300e6, price: 380 },
        { symbol: 'GOOGL', market_cap: 1800e9, adv: 200e6, price: 140 },
        { symbol: 'AMZN', market_cap: 1600e9, adv: 250e6, price: 175 },
        { symbol: 'NVDA', market_cap: 1200e9, adv: 400e6, price: 500 },
        { symbol: 'META', market_cap: 900e9, adv: 200e6, price: 350 },
        { symbol: 'JPM', market_cap: 500e9, adv: 100e6, price: 180 },
        { symbol: 'V', market_cap: 450e9, adv: 80e6, price: 270 },
        { symbol: 'XOM', market_cap: 400e9, adv: 90e6, price: 110 },
        { symbol: 'JNJ', market_cap: 350e9, adv: 60e6, price: 160 },
        { symbol: 'WMT', market_cap: 400e9, adv: 70e6, price: 160 },
        { symbol: 'PG', market_cap: 350e9, adv: 50e6, price: 155 },
        { symbol: 'MA', market_cap: 380e9, adv: 60e6, price: 420 },
        { symbol: 'HD', market_cap: 300e9, adv: 40e6, price: 340 },
        { symbol: 'CVX', market_cap: 280e9, adv: 55e6, price: 155 },
        // Mid-cap examples
        { symbol: 'POOL', market_cap: 15e9, adv: 30e6, price: 380 },
        { symbol: 'DECK', market_cap: 18e9, adv: 35e6, price: 650 },
        // Small-cap examples
        { symbol: 'SIGI', market_cap: 5e9, adv: 8e6, price: 75 },
        { symbol: 'PRGS', market_cap: 3e9, adv: 5e6, price: 55 },
      ];
    }

    // Create synthetic trades
    const syntheticTrades = [];
    const costModel = new TransactionCostModel({ broker: 'IBKR_TIERED' });

    for (const sym of symbols) {
      // Get latest price (from DB or fallback)
      let price = sym.price;
      if (!price) {
        try {
          const priceData = this.db.prepare(`
            SELECT close FROM historical_prices hp
            JOIN companies c ON hp.company_id = c.id
            WHERE c.symbol = ?
            ORDER BY hp.date DESC LIMIT 1
          `).get(sym.symbol);
          price = priceData?.close;
        } catch (e) {
          // Use market cap estimate
          price = 100;
        }
      }

      if (!price) continue;

      const adv = sym.adv || 1e6;
      const shares = Math.round((adv / price) * 0.02); // 2% of ADV

      // Calculate realistic costs
      const costs = costModel.calculateTotalCost({
        shares,
        price,
        side: 'buy',
        adv: adv / price,
        volatility: 0.02,
        marketCap: sym.market_cap
      });

      syntheticTrades.push({
        symbol: sym.symbol,
        side: 'buy',
        shares,
        decisionPrice: price,
        executionPrice: costs.fillPrice,
        executionDate: new Date().toISOString().split('T')[0],
        adv,
        marketCap: sym.market_cap,
        synthetic: true,
        costs
      });
    }

    // Analyze synthetic trades
    for (const trade of syntheticTrades) {
      const analysis = this._analyzeSimulatedTrade(trade);
      this.results.trades.push(analysis);
    }

    // Calculate summary
    this._calculateSummary();
    this._evaluateThresholds();
    this._printResults();

    return this.results;
  }

  /**
   * Analyze a simulated trade
   */
  _analyzeSimulatedTrade(trade) {
    const tier = this._getLiquidityTierFromADV(trade.adv);

    // Implementation shortfall from cost model
    const is = this.calculator.calculateImplementationShortfall(
      trade.decisionPrice,
      trade.executionPrice,
      trade.side
    );

    // Use cost breakdown for components
    const breakdown = trade.costs.breakdown;

    return {
      symbol: trade.symbol,
      side: trade.side,
      shares: trade.shares,
      liquidityTier: tier,
      metrics: {
        implementationShortfall: is,
        vwapDeviation: {
          deviationBps: breakdown.slippage.bps + (Math.random() * 2 - 1), // Simulated
          quality: 'simulated'
        },
        marketImpact: {
          totalImpactBps: breakdown.marketImpact.bps,
          temporaryImpactBps: breakdown.marketImpact.temporary || 0,
          permanentImpactBps: breakdown.marketImpact.permanent || 0,
          participationPct: trade.shares / (trade.adv / trade.decisionPrice) * 100
        },
        spreadCost: {
          estimatedHalfSpreadBps: breakdown.spread.bps
        },
        totalCostBps: trade.costs.totalCostBps
      },
      thresholds: TCA_THRESHOLDS[tier],
      synthetic: true
    };
  }

  /**
   * Get liquidity tier from ADV
   */
  _getLiquidityTierFromADV(adv) {
    if (adv > 500e6) return 'MEGA_CAP';
    if (adv > 100e6) return 'LARGE_CAP';
    if (adv > 20e6) return 'MID_CAP';
    return 'SMALL_CAP';
  }

  /**
   * Get recent executed trades from database
   */
  _getRecentTrades() {
    try {
      // Try algo_orders table first
      const algoTrades = this.db.prepare(`
        SELECT ao.*, eb.arrival_price as decision_price, eb.vwap_price,
               eb.vs_arrival_bps, eb.vs_vwap_bps, eb.market_impact_bps
        FROM algo_orders ao
        LEFT JOIN execution_benchmarks eb ON ao.id = eb.order_id
        WHERE ao.status = 'completed'
        ORDER BY ao.completed_at DESC
        LIMIT 100
      `).all();

      if (algoTrades.length > 0) {
        return algoTrades.map(t => ({
          symbol: t.symbol,
          side: t.side,
          shares: t.total_shares,
          decisionPrice: t.arrival_price,
          executionPrice: t.avg_fill_price,
          executionDate: t.completed_at,
          vwap: t.vwap_price,
          preCalculated: {
            vsArrivalBps: t.vs_arrival_bps,
            vsVwapBps: t.vs_vwap_bps,
            marketImpactBps: t.market_impact_bps
          }
        }));
      }

      // Fall back to paper_trades or transactions
      const paperTrades = this.db.prepare(`
        SELECT pt.*, c.symbol
        FROM paper_trades pt
        JOIN portfolios p ON pt.portfolio_id = p.id
        JOIN companies c ON pt.symbol = c.symbol
        WHERE pt.executed_at IS NOT NULL
        ORDER BY pt.executed_at DESC
        LIMIT 100
      `).all();

      return paperTrades.map(t => ({
        symbol: t.symbol,
        side: t.side,
        shares: t.shares,
        decisionPrice: t.signal_price || t.price,
        executionPrice: t.price,
        executionDate: t.executed_at
      }));
    } catch (e) {
      console.warn('Could not load trades:', e.message);
      return [];
    }
  }

  /**
   * Analyze a single trade
   */
  _analyzeTrade(trade) {
    const tier = this.calculator.getLiquidityTier(trade.symbol);

    // Use pre-calculated metrics if available
    if (trade.preCalculated?.vsArrivalBps !== null) {
      return {
        symbol: trade.symbol,
        side: trade.side,
        shares: trade.shares,
        liquidityTier: tier,
        metrics: {
          implementationShortfall: {
            shortfallBps: trade.preCalculated.vsArrivalBps
          },
          vwapDeviation: {
            deviationBps: trade.preCalculated.vsVwapBps
          },
          marketImpact: {
            totalImpactBps: trade.preCalculated.marketImpactBps
          }
        },
        thresholds: TCA_THRESHOLDS[tier]
      };
    }

    // Calculate metrics
    const is = this.calculator.calculateImplementationShortfall(
      trade.decisionPrice,
      trade.executionPrice,
      trade.side
    );

    const vwap = trade.vwap || this.calculator.calculateVWAP(
      trade.symbol,
      trade.executionDate,
      trade.executionDate
    );

    const vwapDev = this.calculator.calculateVWAPDeviation(
      trade.executionPrice,
      vwap,
      trade.side
    );

    const impact = this.calculator.calculateMarketImpact(
      trade.symbol,
      trade.executionDate,
      trade.shares,
      trade.side
    );

    const spread = this.calculator.calculateSpreadCost(trade.symbol);

    return {
      symbol: trade.symbol,
      side: trade.side,
      shares: trade.shares,
      liquidityTier: tier,
      metrics: {
        implementationShortfall: is,
        vwapDeviation: vwapDev,
        marketImpact: impact,
        spreadCost: spread
      },
      thresholds: TCA_THRESHOLDS[tier]
    };
  }

  /**
   * Calculate summary statistics
   */
  _calculateSummary() {
    const trades = this.results.trades;
    if (trades.length === 0) return;

    // Overall metrics
    const isBps = trades.map(t => t.metrics.implementationShortfall?.shortfallBps).filter(v => v != null);
    const vwapBps = trades.map(t => t.metrics.vwapDeviation?.deviationBps).filter(v => v != null);
    const impactBps = trades.map(t => t.metrics.marketImpact?.totalImpactBps).filter(v => v != null);
    const spreadBps = trades.map(t => t.metrics.spreadCost?.estimatedHalfSpreadBps).filter(v => v != null);

    this.results.summary = {
      totalTrades: trades.length,
      implementationShortfall: {
        mean: this._mean(isBps),
        median: this._median(isBps),
        std: this._std(isBps),
        p95: this._percentile(isBps, 95)
      },
      vwapDeviation: {
        mean: this._mean(vwapBps),
        median: this._median(vwapBps),
        std: this._std(vwapBps),
        p95: this._percentile(vwapBps, 95)
      },
      marketImpact: {
        mean: this._mean(impactBps),
        median: this._median(impactBps),
        std: this._std(impactBps),
        p95: this._percentile(impactBps, 95)
      },
      spreadCost: {
        mean: this._mean(spreadBps),
        median: this._median(spreadBps),
        std: this._std(spreadBps)
      }
    };

    // By liquidity tier
    for (const tier of ['MEGA_CAP', 'LARGE_CAP', 'MID_CAP', 'SMALL_CAP']) {
      const tierTrades = trades.filter(t => t.liquidityTier === tier);
      if (tierTrades.length === 0) continue;

      const tierIS = tierTrades.map(t => t.metrics.implementationShortfall?.shortfallBps).filter(v => v != null);
      const tierVWAP = tierTrades.map(t => t.metrics.vwapDeviation?.deviationBps).filter(v => v != null);
      const tierImpact = tierTrades.map(t => t.metrics.marketImpact?.totalImpactBps).filter(v => v != null);

      this.results.byLiquidityTier[tier] = {
        count: tierTrades.length,
        implementationShortfall: this._mean(tierIS),
        vwapDeviation: this._mean(tierVWAP),
        marketImpact: this._mean(tierImpact),
        thresholds: TCA_THRESHOLDS[tier]
      };
    }
  }

  /**
   * Evaluate against thresholds
   */
  _evaluateThresholds() {
    const summary = this.results.summary;
    if (!summary) return;

    // Use large-cap thresholds for overall evaluation
    const thresholds = TCA_THRESHOLDS.LARGE_CAP;

    this.results.passFail = {
      implementationShortfall: {
        value: summary.implementationShortfall.median,
        threshold: thresholds.implementationShortfall,
        pass: summary.implementationShortfall.median <= thresholds.implementationShortfall
      },
      vwapDeviation: {
        value: summary.vwapDeviation.median,
        threshold: thresholds.vwapDeviation,
        pass: summary.vwapDeviation.median <= thresholds.vwapDeviation
      },
      marketImpact: {
        value: summary.marketImpact.median,
        threshold: thresholds.marketImpact,
        pass: summary.marketImpact.median <= thresholds.marketImpact
      },
      spreadCost: {
        value: summary.spreadCost.median,
        threshold: thresholds.spreadCost,
        pass: summary.spreadCost.median <= thresholds.spreadCost
      }
    };

    // Overall pass
    const tests = Object.values(this.results.passFail);
    this.results.overallPass = tests.every(t => t.pass);
    this.results.passRate = tests.filter(t => t.pass).length / tests.length;
  }

  /**
   * Print results
   */
  _printResults() {
    const summary = this.results.summary;
    if (!summary) {
      console.log('\nNo results to display.');
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('TCA BENCHMARK RESULTS');
    console.log('='.repeat(70));

    console.log(`\nTotal Trades Analyzed: ${summary.totalTrades}`);
    if (this.results.trades[0]?.synthetic) {
      console.log('(Using simulated trades based on cost model)');
    }

    console.log('\n' + '-'.repeat(70));
    console.log('OVERALL METRICS (in basis points)');
    console.log('-'.repeat(70));

    console.log(`
Metric                    | Mean    | Median  | Std Dev | P95     | Status
--------------------------|---------|---------|---------|---------|--------`);

    const pf = this.results.passFail;

    console.log(
      `Implementation Shortfall  | ${this._fmt(summary.implementationShortfall.mean)} | ` +
      `${this._fmt(summary.implementationShortfall.median)} | ` +
      `${this._fmt(summary.implementationShortfall.std)} | ` +
      `${this._fmt(summary.implementationShortfall.p95)} | ` +
      `${pf.implementationShortfall.pass ? 'PASS' : 'FAIL'}`
    );

    console.log(
      `VWAP Deviation            | ${this._fmt(summary.vwapDeviation.mean)} | ` +
      `${this._fmt(summary.vwapDeviation.median)} | ` +
      `${this._fmt(summary.vwapDeviation.std)} | ` +
      `${this._fmt(summary.vwapDeviation.p95)} | ` +
      `${pf.vwapDeviation.pass ? 'PASS' : 'FAIL'}`
    );

    console.log(
      `Market Impact             | ${this._fmt(summary.marketImpact.mean)} | ` +
      `${this._fmt(summary.marketImpact.median)} | ` +
      `${this._fmt(summary.marketImpact.std)} | ` +
      `${this._fmt(summary.marketImpact.p95)} | ` +
      `${pf.marketImpact.pass ? 'PASS' : 'FAIL'}`
    );

    console.log(
      `Spread Cost               | ${this._fmt(summary.spreadCost.mean)} | ` +
      `${this._fmt(summary.spreadCost.median)} | ` +
      `${this._fmt(summary.spreadCost.std)} | ` +
      '   N/A  | ' +
      `${pf.spreadCost.pass ? 'PASS' : 'FAIL'}`
    );

    // By liquidity tier
    console.log('\n' + '-'.repeat(70));
    console.log('BY LIQUIDITY TIER');
    console.log('-'.repeat(70));

    console.log(`
Tier      | Count | IS (bps) | VWAP Dev | Impact  | Threshold (IS)
----------|-------|----------|----------|---------|---------------`);

    for (const [tier, data] of Object.entries(this.results.byLiquidityTier)) {
      console.log(
        `${tier.padEnd(9)} | ${String(data.count).padStart(5)} | ` +
        `${this._fmt(data.implementationShortfall)} | ` +
        `${this._fmt(data.vwapDeviation)} | ` +
        `${this._fmt(data.marketImpact)} | ` +
        `${this._fmt(data.thresholds.implementationShortfall)}`
      );
    }

    // Overall status
    console.log('\n' + '='.repeat(70));
    console.log(`OVERALL STATUS: ${this.results.overallPass ? 'PASS' : 'FAIL'} (${Math.round(this.results.passRate * 100)}% tests passing)`);
    console.log('='.repeat(70));

    if (!this.results.overallPass) {
      console.log('\nFailed Tests:');
      for (const [name, result] of Object.entries(this.results.passFail)) {
        if (!result.pass) {
          console.log(`  - ${name}: ${this._fmt(result.value)} bps (threshold: ${result.threshold} bps)`);
        }
      }
    }
  }

  // ============================================
  // Utility functions
  // ============================================

  _mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = this._mean(arr);
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(this._mean(squaredDiffs));
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  _fmt(val) {
    if (val == null || isNaN(val)) return '   N/A ';
    return val.toFixed(2).padStart(7);
  }
}

// ============================================
// Export and CLI
// ============================================

module.exports = {
  TCABenchmark,
  TCAMetricsCalculator,
  TCA_THRESHOLDS
};

// Run if called directly
if (require.main === module) {
  const benchmark = new TCABenchmark(db);
  benchmark.runBenchmark()
    .then(results => {
      process.exit(results.overallPass ? 0 : 1);
    })
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
