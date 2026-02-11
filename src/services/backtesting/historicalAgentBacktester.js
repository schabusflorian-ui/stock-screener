// src/services/backtesting/historicalAgentBacktester.js
// Historical Agent Backtester - Runs trading agents against historical data
// Enables accelerated testing with point-in-time data to prevent lookahead bias

const { getDatabaseAsync } = require('../../lib/db');
const { HistoricalDataProvider } = require('./historicalDataProvider');

/**
 * HistoricalAgentBacktester - Main orchestration engine for agent backtesting
 *
 * Runs a trading agent through historical data, generating signals and
 * simulating trades to produce performance benchmarks.
 */
class HistoricalAgentBacktester {
  /**
   * @param {Object} config - Backtest configuration
   */
  constructor(config = {}) {
    this.database = null;
    this.config = {
      // Date range
      startDate: config.startDate || '2024-01-01',
      endDate: config.endDate || '2024-12-31',

      // Capital
      initialCapital: config.initialCapital || 100000,

      // Step frequency
      stepFrequency: config.stepFrequency || 'weekly', // 'daily' or 'weekly'

      // Universe
      universe: config.universe || 'top100', // 'all', 'top100', 'top500', or array of symbols
      minMarketCap: config.minMarketCap || 1e9, // $1B minimum

      // Agent settings
      minConfidence: config.minConfidence || 0.6,
      minScore: config.minScore || 0.3,
      maxPositions: config.maxPositions || 20,
      maxPositionSize: config.maxPositionSize || 0.10, // 10% max per position

      // Transaction costs
      commissionBps: config.commissionBps || 5, // 5 bps = 0.05%
      slippageBps: config.slippageBps || 5,

      // Benchmark
      benchmark: config.benchmark || 'SPY',

      // Verbose logging
      verbose: config.verbose || false,

      // Signal weights (optional - for weight optimization)
      signalWeights: config.signalWeights || null,

      ...config
    };

    // Initialize data provider
    this.dataProvider = new HistoricalDataProvider();

    console.log('HistoricalAgentBacktester initialized');
  }

  async _initializeDatabase() {
    if (!this.database) {
      this.database = await getDatabaseAsync();
    }
  }

  /**
   * Run the historical backtest
   * @returns {Object} Backtest results
   */
  async runBacktest() {
    await this._initializeDatabase();
    const startTime = Date.now();
    const { startDate, endDate, initialCapital, verbose } = this.config;

    console.log(`\n${'='.repeat(60)}`);
    console.log('HISTORICAL AGENT BACKTEST');
    console.log(`${'='.repeat(60)}`);
    console.log(`Period: ${startDate} to ${endDate}`);
    console.log(`Initial Capital: $${initialCapital.toLocaleString()}`);
    console.log(`Step Frequency: ${this.config.stepFrequency}`);

    // Get trading days
    const tradingDays = this._getTradingDays();
    console.log(`Trading Days: ${tradingDays.length}`);

    // Get universe
    const universe = await this._getUniverse();
    console.log(`Universe: ${universe.length} stocks`);

    // Initialize portfolio state
    const portfolio = {
      cash: initialCapital,
      positions: new Map(), // symbol -> { shares, avgCost, entryDate }
      totalValue: initialCapital
    };

    // Track results
    const snapshots = [];
    const trades = [];
    const signals = [];

    // Get benchmark starting price
    this.dataProvider.setSimulationDate(startDate);
    const benchmarkStart = this.dataProvider.getBenchmarkPrice();
    const benchmarkStartPrice = benchmarkStart?.price || 100;

    // Main simulation loop
    for (let i = 0; i < tradingDays.length; i++) {
      const currentDate = tradingDays[i];
      this.dataProvider.setSimulationDate(currentDate);

      if (verbose && i % 10 === 0) {
        console.log(`Processing: ${currentDate} (${i + 1}/${tradingDays.length})`);
      }

      // Step 1: Update portfolio values
      await this._updatePortfolioValues(portfolio);

      // Step 2: Generate signals for universe
      const daySignals = await this._generateSignals(universe, portfolio);
      signals.push(...daySignals.map(s => ({ ...s, date: currentDate })));

      // Step 3: Execute trading decisions
      const dayTrades = this._executeTrades(portfolio, daySignals, currentDate);
      trades.push(...dayTrades);

      // Step 4: Record snapshot
      const benchmarkPrice = this.dataProvider.getBenchmarkPrice()?.price || benchmarkStartPrice;
      snapshots.push({
        date: currentDate,
        portfolioValue: portfolio.totalValue,
        cash: portfolio.cash,
        positionsValue: portfolio.totalValue - portfolio.cash,
        positionCount: portfolio.positions.size,
        benchmarkValue: (benchmarkPrice / benchmarkStartPrice) * initialCapital,
        drawdown: this._calculateDrawdown(snapshots, portfolio.totalValue)
      });
    }

    // Calculate performance metrics
    const metrics = this._calculateMetrics(snapshots, trades, initialCapital);

    // Calculate benchmark comparison
    const benchmarkMetrics = this._calculateBenchmarkComparison(snapshots);

    const elapsed = (Date.now() - startTime) / 1000;

    const results = {
      config: this.config,
      performance: metrics,
      benchmark: benchmarkMetrics,
      trades: {
        total: trades.length,
        buys: trades.filter(t => t.side === 'buy').length,
        sells: trades.filter(t => t.side === 'sell').length,
        winningTrades: trades.filter(t => t.realizedPnL > 0).length,
        losingTrades: trades.filter(t => t.realizedPnL < 0).length,
        avgWin: this._avg(trades.filter(t => t.realizedPnL > 0).map(t => t.realizedPnL)),
        avgLoss: this._avg(trades.filter(t => t.realizedPnL < 0).map(t => t.realizedPnL)),
        avgHoldingPeriod: this._calculateAvgHoldingPeriod(trades)
      },
      signals: {
        total: signals.length,
        buySignals: signals.filter(s => s.action === 'buy' || s.action === 'strong_buy').length,
        sellSignals: signals.filter(s => s.action === 'sell' || s.action === 'strong_sell').length,
        avgConfidence: this._avg(signals.map(s => s.confidence))
      },
      equityCurve: snapshots,
      tradeHistory: trades,
      elapsedSeconds: elapsed
    };

    // Print summary
    this._printSummary(results);

    // Store results if configured
    await this._storeBacktestResults(results);

    return results;
  }

  /**
   * Get trading days based on step frequency
   */
  _getTradingDays() {
    const { startDate, endDate, stepFrequency } = this.config;
    const allDays = this.dataProvider.getTradingDays(startDate, endDate);

    if (stepFrequency === 'daily') {
      return allDays;
    }

    // Weekly: take every 5th trading day
    return allDays.filter((_, i) => i % 5 === 0);
  }

  /**
   * Get universe of stocks to trade
   * IMPORTANT: Uses point-in-time market cap to avoid survivorship bias
   */
  async _getUniverse() {
    const { universe, minMarketCap, startDate } = this.config;

    if (Array.isArray(universe)) {
      // Custom symbol list - still compute point-in-time market cap
      const results = [];
      for (const symbol of universe) {
        const company = await this._getCompanyBySymbol(symbol);
        if (!company) continue;

        // Calculate point-in-time market cap
        const historicalMarketCap = await this._getPointInTimeMarketCap(company.id, company.market_cap, startDate);
        results.push({ id: company.id, symbol, sector: company.sector, marketCap: historicalMarketCap });
      }
      return results;
    }

    // Get top companies by POINT-IN-TIME market cap (avoid survivorship bias)
    let limit = 100;
    if (universe === 'top500') limit = 500;
    if (universe === 'all') limit = 2000;

    // First, get all eligible companies (with any market cap)
    const result = await this.database.query(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies
      WHERE market_cap >= $1
        AND symbol NOT LIKE $2
        AND symbol NOT LIKE $3
    `, [1e6, '^%', '%.%']);

    const allCompanies = result.rows || [];

    // Calculate point-in-time market cap for each and filter/sort
    const companiesWithHistoricalCap = [];
    for (const c of allCompanies) {
      const historicalMarketCap = await this._getPointInTimeMarketCap(c.id, c.market_cap, startDate);
      if (historicalMarketCap >= minMarketCap) {
        companiesWithHistoricalCap.push({
          id: c.id,
          symbol: c.symbol,
          sector: c.sector,
          marketCap: historicalMarketCap
        });
      }
    }

    companiesWithHistoricalCap.sort((a, b) => b.marketCap - a.marketCap);
    return companiesWithHistoricalCap.slice(0, limit);
  }

  /**
   * Get company by symbol
   */
  async _getCompanyBySymbol(symbol) {
    const result = await this.database.query(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies
      WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);

    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Calculate point-in-time market cap to avoid survivorship bias
   * Uses: historical_price × (current_market_cap / current_price)
   * This approximates: historical_price × shares_outstanding
   *
   * @param {number} companyId
   * @param {number} currentMarketCap
   * @param {string} asOfDate - Simulation date
   * @returns {number} Point-in-time market cap
   */
  async _getPointInTimeMarketCap(companyId, currentMarketCap, asOfDate) {
    // Get historical price as of the simulation date
    const historicalPriceResult = await this.database.query(`
      SELECT close
      FROM daily_prices
      WHERE company_id = $1 AND date <= $2
      ORDER BY date DESC
      LIMIT 1
    `, [companyId, asOfDate]);

    const historicalPrice = historicalPriceResult.rows && historicalPriceResult.rows.length > 0
      ? historicalPriceResult.rows[0]
      : null;

    // Get current/latest price
    const currentPriceResult = await this.database.query(`
      SELECT close
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [companyId]);

    const currentPrice = currentPriceResult.rows && currentPriceResult.rows.length > 0
      ? currentPriceResult.rows[0]
      : null;

    if (!historicalPrice || !currentPrice || currentPrice.close === 0) {
      // Fallback to current market cap if no price data
      return currentMarketCap;
    }

    // Calculate point-in-time market cap
    // Formula: historical_price × shares_outstanding
    // Where shares_outstanding ≈ current_market_cap / current_price
    const sharesOutstanding = currentMarketCap / currentPrice.close;
    const pointInTimeMarketCap = historicalPrice.close * sharesOutstanding;

    return pointInTimeMarketCap;
  }

  /**
   * Update portfolio position values with current prices
   */
  async _updatePortfolioValues(portfolio) {
    let positionsValue = 0;

    for (const [symbol, position] of portfolio.positions) {
      const company = await this._getCompanyBySymbol(symbol);
      if (!company) continue;

      const priceData = this.dataProvider.getLatestPrice(company.id);
      if (priceData) {
        position.currentPrice = priceData.price;
        position.marketValue = position.shares * priceData.price;
        position.unrealizedPnL = (priceData.price - position.avgCost) * position.shares;
        positionsValue += position.marketValue;
      }
    }

    portfolio.totalValue = portfolio.cash + positionsValue;
  }

  /**
   * Generate signals for all stocks in universe
   */
  async _generateSignals(universe, portfolio) {
    const { minConfidence, minScore } = this.config;
    const signals = [];

    for (const stock of universe) {
      try {
        const signal = this._generateSignalForStock(stock, portfolio);
        if (signal && signal.confidence >= minConfidence && Math.abs(signal.score) >= minScore) {
          signals.push(signal);
        }
      } catch (error) {
        // Skip stocks with data issues
      }
    }

    // Sort by absolute score (strongest signals first)
    signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    return signals;
  }

  /**
   * Generate signal for a single stock using historical data
   */
  _generateSignalForStock(stock, portfolio) {
    // Get price and technical data
    const priceData = this.dataProvider.getLatestPrice(stock.id);
    if (!priceData) return null;

    const technicals = this.dataProvider.calculateTechnicalMetrics(stock.id);
    if (!technicals) return null;

    // Get fundamental data
    const metrics = this.dataProvider.getCalculatedMetrics(stock.id);
    const sentiment = this.dataProvider.getSentiment(stock.id);
    const insider = this.dataProvider.getInsiderActivity(stock.id);
    const intrinsic = this.dataProvider.getIntrinsicValue(stock.id);
    const factors = this.dataProvider.getFactorScores(stock.id);

    // Calculate component scores (simplified scoring)
    const scores = {
      technical: this._scoreTechnicals(technicals),
      fundamental: this._scoreFundamentals(metrics),
      sentiment: this._scoreSentiment(sentiment),
      insider: this._scoreInsider(insider),
      valuation: this._scoreValuation(intrinsic, priceData.price),
      factor: this._scoreFactor(factors)
    };

    // Combine scores with configurable weights (defaults to equal weights)
    const weights = this.config.signalWeights || this._getDefaultWeights();
    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, score] of Object.entries(scores)) {
      if (score !== null) {
        totalScore += score * weights[key];
        totalWeight += weights[key];
      }
    }

    if (totalWeight === 0) return null;

    const normalizedScore = totalScore / totalWeight;
    const confidence = 0.5 + Math.abs(normalizedScore) * 0.4; // 0.5-0.9 range

    // Determine action
    let action = 'hold';
    if (normalizedScore > 0.3) action = 'strong_buy';
    else if (normalizedScore > 0.1) action = 'buy';
    else if (normalizedScore < -0.3) action = 'strong_sell';
    else if (normalizedScore < -0.1) action = 'sell';

    return {
      symbol: stock.symbol,
      companyId: stock.id,
      sector: stock.sector,
      price: priceData.price,
      action,
      score: normalizedScore,
      confidence,
      scores,
      hasPosition: portfolio.positions.has(stock.symbol)
    };
  }

  // ========== Scoring Functions ==========

  _scoreTechnicals(tech) {
    if (!tech) return null;
    let score = 0;

    // RSI
    if (tech.rsi < 30) score += 0.3; // Oversold
    else if (tech.rsi > 70) score -= 0.3; // Overbought

    // Price vs MAs
    if (tech.priceVsSma20 > 0) score += 0.15;
    if (tech.priceVsSma50 > 0) score += 0.15;
    if (tech.priceVsSma200 > 0) score += 0.15;

    // Trend
    if (tech.trend === 'bullish') score += 0.1;
    else score -= 0.1;

    // Volume
    if (tech.volumeRatio > 1.5) score += 0.15;

    return Math.max(-1, Math.min(1, score));
  }

  _scoreFundamentals(metrics) {
    if (!metrics) return null;
    let score = 0;

    // ROE
    if (metrics.roe > 0.2) score += 0.25;
    else if (metrics.roe > 0.1) score += 0.1;
    else if (metrics.roe < 0) score -= 0.2;

    // Profit margin
    if (metrics.net_margin > 0.15) score += 0.2;
    else if (metrics.net_margin > 0.05) score += 0.1;
    else if (metrics.net_margin < 0) score -= 0.2;

    // Revenue growth
    if (metrics.revenue_growth > 0.2) score += 0.25;
    else if (metrics.revenue_growth > 0.1) score += 0.1;
    else if (metrics.revenue_growth < 0) score -= 0.15;

    // Debt/Equity
    if (metrics.debt_to_equity < 0.5) score += 0.15;
    else if (metrics.debt_to_equity > 2) score -= 0.2;

    return Math.max(-1, Math.min(1, score));
  }

  _scoreSentiment(sentiment) {
    if (!sentiment) return null;

    const combined = sentiment.combined_score || sentiment.sentiment_score || 0;
    return Math.max(-1, Math.min(1, combined / 50)); // Normalize from 0-100 to -1 to 1
  }

  _scoreInsider(insider) {
    if (!insider) return null;

    const buyValue = insider.buy_value || 0;
    const sellValue = insider.sell_value || 0;

    if (buyValue > sellValue * 2) return 0.5;
    if (buyValue > sellValue) return 0.2;
    if (sellValue > buyValue * 2) return -0.5;
    if (sellValue > buyValue) return -0.2;
    return 0;
  }

  _scoreValuation(intrinsic, currentPrice) {
    if (!intrinsic || !currentPrice) return null;

    const marginOfSafety = intrinsic.margin_of_safety;
    if (marginOfSafety == null) return null;

    if (marginOfSafety > 0.3) return 0.6;
    if (marginOfSafety > 0.15) return 0.3;
    if (marginOfSafety > 0) return 0.1;
    if (marginOfSafety > -0.15) return -0.1;
    if (marginOfSafety > -0.3) return -0.3;
    return -0.5;
  }

  _scoreFactor(factors) {
    if (!factors) return null;

    // Average of key factor scores
    const scores = [
      factors.value_score,
      factors.momentum_score,
      factors.quality_score
    ].filter(s => s != null);

    if (scores.length === 0) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return (avg - 50) / 50; // Normalize 0-100 to -1 to 1
  }

  // ========== Trade Execution ==========

  _executeTrades(portfolio, signals, date) {
    const trades = [];
    const { maxPositions, maxPositionSize, commissionBps, slippageBps } = this.config;

    // Check for stop loss and profit taking on existing positions
    const positionsToClose = [];
    for (const [symbol, position] of portfolio.positions) {
      const pnlPercent = (position.currentPrice - position.avgCost) / position.avgCost;
      const holdingDays = this._daysBetween(position.entryDate, date);

      // Stop loss at -10%
      if (pnlPercent < -0.10) {
        positionsToClose.push({ symbol, reason: 'stop_loss' });
      }
      // Profit taking at +25%
      else if (pnlPercent > 0.25) {
        positionsToClose.push({ symbol, reason: 'profit_taking' });
      }
      // Time-based exit after 60 days if underwater
      else if (holdingDays > 60 && pnlPercent < 0) {
        positionsToClose.push({ symbol, reason: 'time_exit' });
      }
    }

    // Execute stop/profit exits
    for (const { symbol } of positionsToClose) {
      const position = portfolio.positions.get(symbol);
      if (position) {
        const trade = this._executeSell(portfolio, symbol, position, date, commissionBps, slippageBps);
        if (trade) trades.push(trade);
      }
    }

    // Get existing positions that should be sold based on signals
    const sellSignals = signals.filter(s =>
      (s.action === 'sell' || s.action === 'strong_sell') &&
      portfolio.positions.has(s.symbol)
    );

    // Execute sells first
    for (const signal of sellSignals) {
      const position = portfolio.positions.get(signal.symbol);
      if (!position) continue;

      const proceeds = this._executeSell(portfolio, signal.symbol, position, date, commissionBps, slippageBps);
      if (proceeds) {
        trades.push(proceeds);
      }
    }

    // Get buy signals (prioritize strong_buy)
    const buySignals = signals.filter(s =>
      (s.action === 'buy' || s.action === 'strong_buy') &&
      !portfolio.positions.has(s.symbol)
    ).slice(0, maxPositions - portfolio.positions.size);

    // Execute buys
    for (const signal of buySignals) {
      if (portfolio.positions.size >= maxPositions) break;

      const positionValue = Math.min(
        portfolio.totalValue * maxPositionSize,
        portfolio.cash * 0.9 // Keep some cash buffer
      );

      if (positionValue < 1000) continue; // Minimum position size

      const trade = this._executeBuy(portfolio, signal, positionValue, date, commissionBps, slippageBps);
      if (trade) {
        trades.push(trade);
      }
    }

    return trades;
  }

  _executeBuy(portfolio, signal, positionValue, date, commissionBps, slippageBps) {
    const slippage = signal.price * (slippageBps / 10000);
    const fillPrice = signal.price + slippage;
    const shares = Math.floor(positionValue / fillPrice);
    if (shares <= 0) return null;

    const cost = shares * fillPrice;
    const commission = cost * (commissionBps / 10000);
    const totalCost = cost + commission;

    if (totalCost > portfolio.cash) return null;

    // Update portfolio
    portfolio.cash -= totalCost;
    portfolio.positions.set(signal.symbol, {
      shares,
      avgCost: fillPrice,
      entryDate: date,
      currentPrice: fillPrice,
      marketValue: shares * fillPrice,
      unrealizedPnL: 0
    });

    return {
      date,
      symbol: signal.symbol,
      side: 'buy',
      shares,
      price: fillPrice,
      cost,
      commission,
      slippage: slippage * shares,
      score: signal.score,
      confidence: signal.confidence
    };
  }

  _executeSell(portfolio, symbol, position, date, commissionBps, slippageBps) {
    const slippage = position.currentPrice * (slippageBps / 10000);
    const fillPrice = position.currentPrice - slippage;
    const proceeds = position.shares * fillPrice;
    const commission = proceeds * (commissionBps / 10000);
    const netProceeds = proceeds - commission;

    const realizedPnL = netProceeds - (position.avgCost * position.shares);

    // Update portfolio
    portfolio.cash += netProceeds;
    portfolio.positions.delete(symbol);

    return {
      date,
      symbol,
      side: 'sell',
      shares: position.shares,
      price: fillPrice,
      proceeds,
      commission,
      slippage: slippage * position.shares,
      realizedPnL,
      entryDate: position.entryDate,
      holdingDays: this._daysBetween(position.entryDate, date)
    };
  }

  // ========== Metrics Calculation ==========

  _calculateMetrics(snapshots, trades, initialCapital) {
    if (snapshots.length === 0) return {};

    const finalValue = snapshots[snapshots.length - 1].portfolioValue;
    const returns = this._calculateReturns(snapshots);

    const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
    const annualizedReturn = this._annualizeReturn(totalReturn, snapshots.length);
    const volatility = this._std(returns) * Math.sqrt(252) * 100;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - 2) / volatility : 0; // Assume 2% risk-free

    const downsideReturns = returns.filter(r => r < 0);
    const downstdDev = this._std(downsideReturns) * Math.sqrt(252) * 100;
    const sortinoRatio = downstdDev > 0 ? (annualizedReturn - 2) / downstdDev : 0;

    const maxDrawdown = this._calculateMaxDrawdown(snapshots);

    const closedTrades = trades.filter(t => t.realizedPnL != null);
    const winningTrades = closedTrades.filter(t => t.realizedPnL > 0);
    const losingTrades = closedTrades.filter(t => t.realizedPnL < 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : null;

    const totalWins = winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnL, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return {
      finalValue,
      totalReturn: totalReturn.toFixed(2),
      annualizedReturn: annualizedReturn.toFixed(2),
      volatility: volatility.toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      sortinoRatio: sortinoRatio.toFixed(2),
      maxDrawdown: maxDrawdown.toFixed(2),
      winRate: winRate !== null ? winRate.toFixed(1) : 'N/A',
      profitFactor: profitFactor.toFixed(2)
    };
  }

  _calculateBenchmarkComparison(snapshots) {
    if (snapshots.length < 2) return {};

    const initialBenchmark = snapshots[0].benchmarkValue;
    const finalBenchmark = snapshots[snapshots.length - 1].benchmarkValue;
    const initialPortfolio = snapshots[0].portfolioValue;
    const finalPortfolio = snapshots[snapshots.length - 1].portfolioValue;

    const benchmarkReturn = ((finalBenchmark - initialBenchmark) / initialBenchmark) * 100;
    const portfolioReturn = ((finalPortfolio - initialPortfolio) / initialPortfolio) * 100;
    const alpha = portfolioReturn - benchmarkReturn;

    // Calculate beta using covariance
    const portfolioReturns = this._calculateReturns(snapshots);
    const benchmarkReturns = snapshots.slice(1).map((s, i) =>
      (s.benchmarkValue - snapshots[i].benchmarkValue) / snapshots[i].benchmarkValue
    );

    const beta = this._calculateBeta(portfolioReturns, benchmarkReturns);

    return {
      ticker: this.config.benchmark,
      benchmarkReturn: benchmarkReturn.toFixed(2),
      alpha: alpha.toFixed(2),
      beta: beta.toFixed(2)
    };
  }

  // ========== Helper Functions ==========

  _calculateReturns(snapshots) {
    return snapshots.slice(1).map((s, i) =>
      (s.portfolioValue - snapshots[i].portfolioValue) / snapshots[i].portfolioValue
    );
  }

  _calculateDrawdown(snapshots, currentValue) {
    if (snapshots.length === 0) return 0;
    const peak = Math.max(...snapshots.map(s => s.portfolioValue), currentValue);
    return ((peak - currentValue) / peak) * 100;
  }

  _calculateMaxDrawdown(snapshots) {
    let peak = 0;
    let maxDD = 0;

    for (const snapshot of snapshots) {
      peak = Math.max(peak, snapshot.portfolioValue);
      const dd = ((peak - snapshot.portfolioValue) / peak) * 100;
      maxDD = Math.max(maxDD, dd);
    }

    return maxDD;
  }

  _calculateBeta(portfolioReturns, benchmarkReturns) {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) return 1;

    const avgP = this._avg(portfolioReturns);
    const avgB = this._avg(benchmarkReturns);

    let covariance = 0;
    let variance = 0;

    for (let i = 0; i < portfolioReturns.length; i++) {
      covariance += (portfolioReturns[i] - avgP) * (benchmarkReturns[i] - avgB);
      variance += Math.pow(benchmarkReturns[i] - avgB, 2);
    }

    return variance > 0 ? covariance / variance : 1;
  }

  _calculateAvgHoldingPeriod(trades) {
    const sellTrades = trades.filter(t => t.holdingDays != null);
    if (sellTrades.length === 0) return 0;
    return Math.round(sellTrades.reduce((sum, t) => sum + t.holdingDays, 0) / sellTrades.length);
  }

  _annualizeReturn(totalReturn, periods) {
    // Assume 252 trading days per year
    const years = periods / 52; // Weekly periods
    if (years <= 0) return 0;
    return ((Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100);
  }

  _avg(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = this._avg(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  _daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  async _storeBacktestResults(results) {
    try {
      const parametersJson = JSON.stringify(results.config);
      const metricsJson = JSON.stringify(results.performance);
      const equityCurveJson = JSON.stringify(results.equityCurve);
      const tradesJson = JSON.stringify(results.tradeHistory);

      const query = `
        INSERT INTO backtest_results (
          strategy_name, run_type, start_date, end_date,
          parameters, metrics, equity_curve, trades,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id;
      `;

      const result = await this.database.query(query, [
        'historical_agent_backtest',
        'historical_agent',
        results.config.startDate,
        results.config.endDate,
        parametersJson,
        metricsJson,
        equityCurveJson,
        tradesJson,
        'completed'
      ]);

      console.log(`Backtest results stored with ID: ${result.rows[0].id}`);
    } catch (error) {
      console.error('Failed to store backtest results:', error.message);
    }
  }

  _printSummary(results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('BACKTEST RESULTS');
    console.log(`${'='.repeat(60)}`);
    console.log('\nPerformance Metrics:');
    console.log(`  Total Return: ${results.performance.totalReturn}%`);
    console.log(`  Annualized Return: ${results.performance.annualizedReturn}%`);
    console.log(`  Volatility: ${results.performance.volatility}%`);
    console.log(`  Sharpe Ratio: ${results.performance.sharpeRatio}`);
    console.log(`  Sortino Ratio: ${results.performance.sortinoRatio}`);
    console.log(`  Max Drawdown: ${results.performance.maxDrawdown}%`);

    console.log('\nTrading Activity:');
    console.log(`  Total Trades: ${results.trades.total}`);
    console.log(`  Win Rate: ${results.performance.winRate}%`);
    console.log(`  Profit Factor: ${results.performance.profitFactor}`);
    console.log(`  Avg Holding Period: ${results.trades.avgHoldingPeriod} days`);

    console.log(`\nBenchmark Comparison (${results.benchmark.ticker}):`);
    console.log(`  Benchmark Return: ${results.benchmark.benchmarkReturn}%`);
    console.log(`  Alpha: ${results.benchmark.alpha}%`);
    console.log(`  Beta: ${results.benchmark.beta}`);

    console.log(`\nExecution Time: ${results.elapsedSeconds.toFixed(1)}s`);
    console.log(`${'='.repeat(60)}\n`);
  }

  /**
   * Get default signal weights
   * @returns {Object} Default weights for each signal type
   */
  _getDefaultWeights() {
    return {
      technical: 0.20,
      fundamental: 0.20,
      sentiment: 0.15,
      insider: 0.15,
      valuation: 0.15,
      factor: 0.15
    };
  }
}

module.exports = { HistoricalAgentBacktester };
