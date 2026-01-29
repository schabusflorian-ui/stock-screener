// src/services/backtesting/strategyBenchmark.js
// Strategy Benchmark - Compare multiple strategies head-to-head
// Provides comprehensive trading behavior statistics

const path = require('path');
const { db, isPostgres } = require('../../database');
const { StrategyConfigManager } = require('../agent/strategyConfig');
const { ConfigurableStrategyAgent } = require('../agent/configurableStrategyAgent');
const { HistoricalDataProvider } = require('./historicalDataProvider');

/**
 * StrategyBenchmark - Backtest and compare multiple strategies
 */
class StrategyBenchmark {
  constructor(db) {
    this.db = db;
    this.configManager = new StrategyConfigManager(db);
    this.dataProvider = new HistoricalDataProvider(db);

    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtGetCompany = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE LOWER(symbol) = LOWER(?)
    `);

    this.stmtGetPrice = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    this.stmtGetForwardPrice = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices
      WHERE company_id = ? AND date >= ?
      ORDER BY date ASC
      LIMIT 1
    `);
  }

  /**
   * Backtest a single strategy
   * @param {number} strategyId - Strategy ID to backtest
   * @param {Object} config - Backtest configuration
   * @returns {Object} Backtest results
   */
  async backtestStrategy(strategyId, config = {}) {
    const {
      startDate = '2024-01-01',
      endDate = '2024-12-31',
      initialCapital = 100000,
      stepFrequency = 'weekly'
    } = config;

    const agent = new ConfigurableStrategyAgent(this.db, strategyId);
    const strategyConfig = agent.config;

    console.log(`\n📊 Backtesting: ${strategyConfig.name}`);

    // Get trading days
    const tradingDays = this._getTradingDays(startDate, endDate, stepFrequency);

    // Initialize portfolio
    const portfolio = {
      cash: initialCapital,
      positions: new Map(),
      totalValue: initialCapital
    };

    // Track results
    const snapshots = [];
    const trades = [];
    const signalHistory = [];

    // Get universe once
    const universe = agent.getUniverse().slice(0, 100); // Top 100 for performance

    // Get benchmark starting price
    this.dataProvider.setSimulationDate(startDate);
    const benchmarkStart = this.dataProvider.getBenchmarkPrice();
    const benchmarkStartPrice = benchmarkStart?.price || 100;

    // Main simulation loop
    for (let i = 0; i < tradingDays.length; i++) {
      const currentDate = tradingDays[i];
      this.dataProvider.setSimulationDate(currentDate);
      agent.setSimulationDate(currentDate); // Sync agent's date for price queries

      // Update portfolio values
      this._updatePortfolioValues(portfolio, currentDate);

      // Generate signals
      const signals = [];
      for (const stock of universe) {
        try {
          const signal = agent.generateSignal(stock, portfolio.positions);
          if (signal) {
            signals.push(signal);
            signalHistory.push({ ...signal, date: currentDate });
          }
        } catch (e) {
          // Skip errors
        }
      }

      // Sort by absolute score
      signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

      // Execute trades
      const dayTrades = this._executeTrades(portfolio, signals, currentDate, strategyConfig);
      trades.push(...dayTrades);

      // Check exits
      const exitTrades = this._checkExits(portfolio, agent, currentDate);
      trades.push(...exitTrades);

      // Record snapshot
      const benchmarkPrice = this.dataProvider.getBenchmarkPrice()?.price || benchmarkStartPrice;
      snapshots.push({
        date: currentDate,
        portfolioValue: portfolio.totalValue,
        cash: portfolio.cash,
        positionsValue: portfolio.totalValue - portfolio.cash,
        positionCount: portfolio.positions.size,
        benchmarkValue: (benchmarkPrice / benchmarkStartPrice) * initialCapital
      });
    }

    // Calculate metrics
    const metrics = this._calculateMetrics(snapshots, trades, initialCapital);
    const tradingBehavior = this._analyzeTradingBehavior(trades, signalHistory, snapshots);
    const benchmarkComparison = this._calculateBenchmarkComparison(snapshots, initialCapital);

    return {
      strategyId,
      strategyName: strategyConfig.name,
      config: {
        weights: strategyConfig.weights,
        risk: strategyConfig.risk,
        holdingPeriod: strategyConfig.holdingPeriod,
        regimeEnabled: strategyConfig.regime.enabled
      },
      performance: metrics,
      benchmark: benchmarkComparison,
      tradingBehavior,
      equityCurve: snapshots,
      trades
    };
  }

  /**
   * Benchmark all preset strategies
   * @param {Object} config - Backtest configuration
   * @returns {Object} Comparison results
   */
  async benchmarkAllPresets(config = {}) {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(70));
    console.log('🏆 STRATEGY BENCHMARK - ALL PRESETS');
    console.log('='.repeat(70));
    console.log(`Period: ${config.startDate || '2024-01-01'} to ${config.endDate || '2024-12-31'}`);
    console.log(`Initial Capital: $${(config.initialCapital || 100000).toLocaleString()}`);

    // Create strategies from presets
    const presets = this.configManager.getPresets();
    const results = [];

    for (const preset of presets) {
      // Try to get existing benchmark strategy or create new one
      let strategy;
      const existingStrategy = this.db.prepare(
        'SELECT * FROM strategy_configs WHERE name = ?'
      ).get(`Benchmark_${preset.name}`);

      if (existingStrategy) {
        strategy = existingStrategy;
      } else {
        strategy = this.configManager.createStrategy({
          name: `Benchmark_${preset.name}`,
          description: preset.description
        }, preset.name);
      }

      // Run backtest
      const result = await this.backtestStrategy(strategy.id, config);
      results.push(result);
    }

    // Sort by total return
    results.sort((a, b) => parseFloat(b.performance.totalReturn) - parseFloat(a.performance.totalReturn));

    // Generate comparison report
    const comparison = this._generateComparisonReport(results);

    const elapsed = (Date.now() - startTime) / 1000;

    return {
      results,
      comparison,
      elapsedSeconds: elapsed
    };
  }

  /**
   * Generate detailed comparison report
   */
  _generateComparisonReport(results) {
    // Performance ranking
    const performanceRanking = results.map((r, i) => ({
      rank: i + 1,
      name: r.strategyName.replace('Benchmark_', ''),
      totalReturn: r.performance.totalReturn,
      sharpeRatio: r.performance.sharpeRatio,
      maxDrawdown: r.performance.maxDrawdown,
      alpha: r.benchmark.alpha
    }));

    // Risk-adjusted ranking (by Sharpe)
    const riskAdjustedRanking = [...results]
      .sort((a, b) => parseFloat(b.performance.sharpeRatio) - parseFloat(a.performance.sharpeRatio))
      .map((r, i) => ({
        rank: i + 1,
        name: r.strategyName.replace('Benchmark_', ''),
        sharpeRatio: r.performance.sharpeRatio,
        sortinoRatio: r.performance.sortinoRatio
      }));

    // Trading behavior comparison
    const tradingComparison = results.map(r => ({
      name: r.strategyName.replace('Benchmark_', ''),
      totalTrades: r.tradingBehavior.totalTrades,
      avgTradesPerWeek: r.tradingBehavior.avgTradesPerWeek,
      avgHoldingDays: r.tradingBehavior.avgHoldingDays,
      winRate: r.tradingBehavior.winRate,
      profitFactor: r.tradingBehavior.profitFactor,
      avgWin: r.tradingBehavior.avgWinPct,
      avgLoss: r.tradingBehavior.avgLossPct,
      turnover: r.tradingBehavior.turnover
    }));

    // Best/Worst analysis
    const bestReturn = results[0];
    const worstReturn = results[results.length - 1];
    const bestSharpe = [...results].sort((a, b) =>
      parseFloat(b.performance.sharpeRatio) - parseFloat(a.performance.sharpeRatio))[0];
    const lowestDrawdown = [...results].sort((a, b) =>
      parseFloat(a.performance.maxDrawdown) - parseFloat(b.performance.maxDrawdown))[0];
    const highestWinRate = [...results].sort((a, b) =>
      parseFloat(b.tradingBehavior.winRate) - parseFloat(a.tradingBehavior.winRate))[0];

    return {
      performanceRanking,
      riskAdjustedRanking,
      tradingComparison,
      highlights: {
        bestReturn: {
          name: bestReturn.strategyName.replace('Benchmark_', ''),
          value: bestReturn.performance.totalReturn + '%'
        },
        worstReturn: {
          name: worstReturn.strategyName.replace('Benchmark_', ''),
          value: worstReturn.performance.totalReturn + '%'
        },
        bestRiskAdjusted: {
          name: bestSharpe.strategyName.replace('Benchmark_', ''),
          sharpe: bestSharpe.performance.sharpeRatio
        },
        lowestDrawdown: {
          name: lowestDrawdown.strategyName.replace('Benchmark_', ''),
          value: lowestDrawdown.performance.maxDrawdown + '%'
        },
        highestWinRate: {
          name: highestWinRate.strategyName.replace('Benchmark_', ''),
          value: highestWinRate.tradingBehavior.winRate + '%'
        }
      }
    };
  }

  /**
   * Analyze trading behavior in detail
   */
  _analyzeTradingBehavior(trades, signalHistory, snapshots) {
    const closedTrades = trades.filter(t => t.side === 'sell' && t.realizedPnL != null);
    const buyTrades = trades.filter(t => t.side === 'buy');

    // Win/Loss analysis
    const winners = closedTrades.filter(t => t.realizedPnL > 0);
    const losers = closedTrades.filter(t => t.realizedPnL < 0);

    const totalWins = winners.reduce((sum, t) => sum + t.realizedPnL, 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.realizedPnL, 0));

    // Holding period analysis
    const holdingDays = closedTrades.map(t => t.holdingDays || 0).filter(d => d > 0);
    const avgHoldingDays = holdingDays.length > 0
      ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length
      : 0;

    // Win/Loss percentages
    const winPcts = winners.map(t => t.pnlPct || (t.realizedPnL / (t.entryPrice * t.shares)));
    const lossPcts = losers.map(t => Math.abs(t.pnlPct || (t.realizedPnL / (t.entryPrice * t.shares))));

    // Sector distribution
    const sectorCounts = {};
    for (const trade of buyTrades) {
      sectorCounts[trade.sector] = (sectorCounts[trade.sector] || 0) + 1;
    }

    // Signal analysis
    const buySignals = signalHistory.filter(s => s.action === 'buy' || s.action === 'strong_buy');
    const sellSignals = signalHistory.filter(s => s.action === 'sell' || s.action === 'strong_sell');
    const avgSignalScore = signalHistory.length > 0
      ? signalHistory.reduce((sum, s) => sum + Math.abs(s.score), 0) / signalHistory.length
      : 0;
    const avgConfidence = signalHistory.length > 0
      ? signalHistory.reduce((sum, s) => sum + s.confidence, 0) / signalHistory.length
      : 0;

    // Turnover calculation
    const totalTradedValue = trades.reduce((sum, t) => sum + (t.cost || t.proceeds || 0), 0);
    const avgPortfolioValue = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.portfolioValue, 0) / snapshots.length
      : 100000;
    const annualizedTurnover = (totalTradedValue / avgPortfolioValue) * (252 / snapshots.length);

    // Consecutive wins/losses
    let maxConsecWins = 0, maxConsecLosses = 0;
    let currentWins = 0, currentLosses = 0;
    for (const trade of closedTrades) {
      if (trade.realizedPnL > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecWins = Math.max(maxConsecWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxConsecLosses = Math.max(maxConsecLosses, currentLosses);
      }
    }

    // Time in market
    const avgPositionCount = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.positionCount, 0) / snapshots.length
      : 0;
    const maxPositionCount = Math.max(...snapshots.map(s => s.positionCount), 0);

    // Trading frequency
    const tradingWeeks = snapshots.length / (snapshots.length > 52 ? 1 : 1);
    const avgTradesPerWeek = trades.length / Math.max(1, tradingWeeks);

    return {
      totalTrades: trades.length,
      buyTrades: buyTrades.length,
      sellTrades: closedTrades.length,
      avgTradesPerWeek: avgTradesPerWeek.toFixed(2),

      // Win/Loss
      winRate: closedTrades.length > 0
        ? ((winners.length / closedTrades.length) * 100).toFixed(1)
        : 'N/A',
      lossRate: closedTrades.length > 0
        ? ((losers.length / closedTrades.length) * 100).toFixed(1)
        : 'N/A',
      profitFactor: totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : 'N/A',

      // P&L Distribution
      avgWinPct: winPcts.length > 0
        ? ((winPcts.reduce((a, b) => a + b, 0) / winPcts.length) * 100).toFixed(2)
        : 'N/A',
      avgLossPct: lossPcts.length > 0
        ? ((lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length) * 100).toFixed(2)
        : 'N/A',
      maxWinPct: winPcts.length > 0
        ? (Math.max(...winPcts) * 100).toFixed(2)
        : 'N/A',
      maxLossPct: lossPcts.length > 0
        ? (Math.max(...lossPcts) * 100).toFixed(2)
        : 'N/A',
      totalPnL: (totalWins - totalLosses).toFixed(2),

      // Holding Period
      avgHoldingDays: avgHoldingDays.toFixed(1),
      minHoldingDays: holdingDays.length > 0 ? Math.min(...holdingDays) : 'N/A',
      maxHoldingDays: holdingDays.length > 0 ? Math.max(...holdingDays) : 'N/A',

      // Streaks
      maxConsecutiveWins: maxConsecWins,
      maxConsecutiveLosses: maxConsecLosses,

      // Portfolio Characteristics
      avgPositionCount: avgPositionCount.toFixed(1),
      maxPositionCount,
      turnover: (annualizedTurnover * 100).toFixed(1) + '%',

      // Sector Distribution
      sectorDistribution: sectorCounts,
      topSector: Object.entries(sectorCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',

      // Signal Quality
      totalSignals: signalHistory.length,
      buySignals: buySignals.length,
      sellSignals: sellSignals.length,
      avgSignalScore: avgSignalScore.toFixed(3),
      avgConfidence: (avgConfidence * 100).toFixed(1) + '%',
      signalToTradeRatio: buyTrades.length > 0
        ? (buySignals.length / buyTrades.length).toFixed(2)
        : 'N/A'
    };
  }

  // ========== Helper Methods ==========

  _getTradingDays(startDate, endDate, frequency) {
    const allDays = this.dataProvider.getTradingDays(startDate, endDate);
    if (frequency === 'daily') return allDays;
    if (frequency === 'monthly') return allDays.filter((_, i) => i % 21 === 0);
    return allDays.filter((_, i) => i % 5 === 0); // weekly
  }

  _updatePortfolioValues(portfolio, date) {
    let positionsValue = 0;

    for (const [symbol, position] of portfolio.positions) {
      const company = this.stmtGetCompany.get(symbol);
      if (!company) continue;

      const priceData = this.stmtGetPrice.get(company.id, date);
      if (priceData) {
        position.currentPrice = priceData.price;
        position.marketValue = position.shares * priceData.price;
        position.unrealizedPnL = (priceData.price - position.avgCost) * position.shares;
        position.pnlPct = (priceData.price - position.avgCost) / position.avgCost;

        // Track high water mark for trailing stops
        if (!position.highWaterMark || priceData.price > position.highWaterMark) {
          position.highWaterMark = priceData.price;
        }

        positionsValue += position.marketValue;
      }
    }

    portfolio.totalValue = portfolio.cash + positionsValue;
  }

  _executeTrades(portfolio, signals, date, strategyConfig) {
    const trades = [];
    const { risk } = strategyConfig;

    // Get buy signals
    const buySignals = signals.filter(s =>
      (s.action === 'buy' || s.action === 'strong_buy') &&
      !portfolio.positions.has(s.symbol)
    );

    // Execute buys
    for (const signal of buySignals) {
      if (portfolio.positions.size >= risk.maxPositions) break;

      // Calculate position size
      const targetSize = Math.min(risk.maxPositionSize, 0.1);
      const positionValue = Math.min(
        portfolio.totalValue * targetSize * Math.abs(signal.score),
        portfolio.cash * 0.9
      );

      if (positionValue < 1000) continue;

      const slippage = signal.price * 0.0005;
      const fillPrice = signal.price + slippage;
      const shares = Math.floor(positionValue / fillPrice);
      if (shares <= 0) continue;

      const cost = shares * fillPrice;
      const commission = cost * 0.0005;

      if (cost + commission > portfolio.cash) continue;

      portfolio.cash -= (cost + commission);
      portfolio.positions.set(signal.symbol, {
        shares,
        avgCost: fillPrice,
        entryDate: date,
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        marketValue: shares * fillPrice,
        unrealizedPnL: 0,
        sector: signal.sector,
        highWaterMark: fillPrice
      });

      trades.push({
        date,
        symbol: signal.symbol,
        sector: signal.sector,
        side: 'buy',
        shares,
        price: fillPrice,
        cost,
        commission,
        score: signal.score,
        confidence: signal.confidence
      });
    }

    return trades;
  }

  _checkExits(portfolio, agent, date) {
    const trades = [];

    for (const [symbol, position] of portfolio.positions) {
      const exitCheck = agent.checkExit(position, position.currentPrice, date);

      if (exitCheck.shouldExit) {
        const slippage = position.currentPrice * 0.0005;
        const fillPrice = position.currentPrice - slippage;
        const proceeds = position.shares * fillPrice;
        const commission = proceeds * 0.0005;
        const netProceeds = proceeds - commission;
        const realizedPnL = netProceeds - (position.avgCost * position.shares);
        const holdingDays = this._daysBetween(position.entryDate, date);

        portfolio.cash += netProceeds;
        portfolio.positions.delete(symbol);

        trades.push({
          date,
          symbol,
          sector: position.sector,
          side: 'sell',
          shares: position.shares,
          price: fillPrice,
          proceeds,
          commission,
          realizedPnL,
          pnlPct: (fillPrice - position.avgCost) / position.avgCost,
          entryDate: position.entryDate,
          entryPrice: position.avgCost,
          holdingDays,
          exitReason: exitCheck.reason
        });
      }
    }

    return trades;
  }

  _calculateMetrics(snapshots, trades, initialCapital) {
    if (snapshots.length === 0) return {};

    const finalValue = snapshots[snapshots.length - 1].portfolioValue;
    const returns = this._calculateReturns(snapshots);

    const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
    const periods = snapshots.length;
    const years = periods / 52;
    const annualizedReturn = years > 0 ? ((Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100) : totalReturn;

    const volatility = this._std(returns) * Math.sqrt(252) * 100;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - 2) / volatility : 0;

    const downsideReturns = returns.filter(r => r < 0);
    const downstdDev = this._std(downsideReturns) * Math.sqrt(252) * 100;
    const sortinoRatio = downstdDev > 0 ? (annualizedReturn - 2) / downstdDev : 0;

    const maxDrawdown = this._calculateMaxDrawdown(snapshots);

    return {
      finalValue: finalValue.toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      annualizedReturn: annualizedReturn.toFixed(2),
      volatility: volatility.toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      sortinoRatio: sortinoRatio.toFixed(2),
      maxDrawdown: maxDrawdown.toFixed(2)
    };
  }

  _calculateBenchmarkComparison(snapshots, initialCapital) {
    if (snapshots.length < 2) return {};

    const initialBenchmark = snapshots[0].benchmarkValue;
    const finalBenchmark = snapshots[snapshots.length - 1].benchmarkValue;
    const finalPortfolio = snapshots[snapshots.length - 1].portfolioValue;

    const benchmarkReturn = ((finalBenchmark - initialBenchmark) / initialBenchmark) * 100;
    const portfolioReturn = ((finalPortfolio - initialCapital) / initialCapital) * 100;
    const alpha = portfolioReturn - benchmarkReturn;

    return {
      benchmarkReturn: benchmarkReturn.toFixed(2),
      alpha: alpha.toFixed(2)
    };
  }

  _calculateReturns(snapshots) {
    return snapshots.slice(1).map((s, i) =>
      (s.portfolioValue - snapshots[i].portfolioValue) / snapshots[i].portfolioValue
    );
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

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  _daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }
}

/**
 * Run the benchmark and print results
 */
async function runStrategyBenchmark() {
  if (isPostgres) {
    console.error('runStrategyBenchmark() is not yet supported in PostgreSQL mode.');
    console.error('Use async database methods from lib/db.js');
    process.exit(1);
  }

  try {
    const benchmark = new StrategyBenchmark(db);

    const results = await benchmark.benchmarkAllPresets({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      initialCapital: 100000,
      stepFrequency: 'weekly'
    });

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log('📊 BENCHMARK RESULTS');
    console.log('='.repeat(80));

    // Performance Ranking Table
    console.log('\n📈 PERFORMANCE RANKING:');
    console.log('┌────────────────────────┬──────────────┬────────────┬──────────────┬──────────┐');
    console.log('│ Strategy               │ Total Return │ Sharpe     │ Max Drawdown │ Alpha    │');
    console.log('├────────────────────────┼──────────────┼────────────┼──────────────┼──────────┤');

    for (const r of results.comparison.performanceRanking) {
      const name = r.name.substring(0, 20).padEnd(20);
      const ret = (r.totalReturn + '%').padStart(10);
      const sharpe = r.sharpeRatio.padStart(8);
      const dd = (r.maxDrawdown + '%').padStart(10);
      const alpha = (r.alpha + '%').padStart(6);
      console.log(`│ ${name}   │ ${ret}   │ ${sharpe}   │ ${dd}   │ ${alpha}   │`);
    }
    console.log('└────────────────────────┴──────────────┴────────────┴──────────────┴──────────┘');

    // Trading Behavior Table
    console.log('\n📊 TRADING BEHAVIOR:');
    console.log('┌────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Strategy               │ Trades │ Win Rate │ Avg Hold │ Turnover │ P/F      │');
    console.log('├────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┤');

    for (const t of results.comparison.tradingComparison) {
      const name = t.name.substring(0, 20).padEnd(20);
      const trades = String(t.totalTrades).padStart(4);
      const winRate = (t.winRate + '%').padStart(6);
      const hold = (t.avgHoldingDays + 'd').padStart(6);
      const turnover = t.turnover.padStart(6);
      const pf = t.profitFactor.padStart(6);
      console.log(`│ ${name}   │ ${trades}   │ ${winRate}   │ ${hold}   │ ${turnover}   │ ${pf}   │`);
    }
    console.log('└────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┘');

    // Highlights
    console.log('\n🏆 HIGHLIGHTS:');
    const h = results.comparison.highlights;
    console.log(`   Best Return:        ${h.bestReturn.name} (${h.bestReturn.value})`);
    console.log(`   Best Risk-Adjusted: ${h.bestRiskAdjusted.name} (Sharpe: ${h.bestRiskAdjusted.sharpe})`);
    console.log(`   Lowest Drawdown:    ${h.lowestDrawdown.name} (${h.lowestDrawdown.value})`);
    console.log(`   Highest Win Rate:   ${h.highestWinRate.name} (${h.highestWinRate.value})`);
    console.log(`   Worst Return:       ${h.worstReturn.name} (${h.worstReturn.value})`);

    console.log(`\n⏱️ Total Benchmark Time: ${results.elapsedSeconds.toFixed(1)}s`);
    console.log('='.repeat(80) + '\n');

    // Save results
    const resultsPath = path.join(__dirname, '../../../data/strategy-benchmark-results.json');
    require('fs').writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`💾 Full results saved to: ${resultsPath}`);

    return results;
  } catch (error) {
    throw error;
  }
  // Note: Don't close shared database instance
}

// Run if called directly
if (require.main === module) {
  runStrategyBenchmark()
    .then(() => {
      console.log('\n✅ Benchmark completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Benchmark failed:', error);
      process.exit(1);
    });
}

module.exports = { StrategyBenchmark, runStrategyBenchmark };
