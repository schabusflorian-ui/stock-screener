// src/services/backtesting/multiStrategyBacktester.js
// Multi-strategy backtest runner for testing MetaAllocator

const { getDatabaseAsync } = require('../../database');
const { MetaAllocator } = require('../agent/metaAllocator');
const { HistoricalDataProvider } = require('./historicalDataProvider');
const { StrategyConfigManager } = require('../agent/strategyConfig');

/**
 * Backtests a multi-strategy configuration with dynamic capital allocation
 */
class MultiStrategyBacktester {
  async initialize() {
    this.database = await getDatabaseAsync();
    this.dataProvider = new HistoricalDataProvider(this.database);
    this.configManager = new StrategyConfigManager(this.database);
  }

  /**
   * Run backtest for a multi-strategy
   * @param {Object} config - Backtest configuration
   * @returns {Object} Results with allocation history and performance
   */
  async backtestMultiStrategy(config) {
    const {
      multiStrategyId,
      startDate,
      endDate,
      initialCapital = 100000,
      rebalanceFrequency = 'weekly' // 'daily', 'weekly', 'monthly'
    } = config;

    console.log('\n🎯 Starting Multi-Strategy Backtest');
    console.log(`   Period: ${startDate} to ${endDate}`);
    console.log(`   Initial Capital: $${initialCapital.toLocaleString()}`);

    // Initialize MetaAllocator
    const metaAllocator = new MetaAllocator(this.db, multiStrategyId);
    const multiStrategyConfig = metaAllocator.parentConfig;

    // Initialize child agent portfolios
    const childPortfolios = new Map();
    for (const [strategyId, childInfo] of metaAllocator.childAgents) {
      childPortfolios.set(strategyId, {
        strategyId,
        name: childInfo.name,
        cash: 0,
        positions: new Map(),
        totalValue: 0,
        allocation: childInfo.config.target_allocation, // Initial allocation
        trades: [],
        snapshots: []
      });
    }

    // Trading days
    const tradingDays = this._getTradingDays(startDate, endDate, rebalanceFrequency);
    console.log(`   Trading days: ${tradingDays.length}`);

    // Tracking
    const allocationHistory = [];
    const aggregateSnapshots = [];
    const allTrades = [];

    // Initial allocation
    this._allocateCapital(childPortfolios, initialCapital);

    // Main simulation loop
    for (let i = 0; i < tradingDays.length; i++) {
      const currentDate = tradingDays[i];
      this.dataProvider.setSimulationDate(currentDate);

      // Sync all child agents to current date
      for (const [strategyId, childInfo] of metaAllocator.childAgents) {
        childInfo.agent.setSimulationDate(currentDate);
      }

      // Update all portfolio values
      this._updateAllPortfolioValues(childPortfolios, currentDate);

      // Get current total portfolio value
      const totalValue = this._getTotalPortfolioValue(childPortfolios);

      // Calculate optimal allocations (MetaAllocator decision)
      const allocationDecision = metaAllocator.calculateOptimalAllocations();

      allocationHistory.push({
        date: currentDate,
        regime: allocationDecision.marketContext.regime,
        riskLevel: allocationDecision.marketContext.riskLevel,
        allocations: allocationDecision.allocations,
        reasoning: allocationDecision.reasoning
      });

      // Rebalance if needed
      const rebalanceTrades = this._rebalancePortfolios(
        childPortfolios,
        allocationDecision.allocations,
        totalValue
      );
      allTrades.push(...rebalanceTrades);

      // Generate signals and execute trades for each child strategy
      for (const [strategyId, portfolio] of childPortfolios) {
        const childInfo = metaAllocator.childAgents.get(strategyId);
        const agent = childInfo.agent;

        // Get universe for this strategy
        const universe = agent.getUniverse();

        // Generate signals
        const signals = [];
        for (const stock of universe) {
          try {
            const signal = agent.generateSignal(stock, portfolio.positions);
            if (signal) {
              signals.push(signal);
            }
          } catch (e) {
            // Skip errors
          }
        }

        // Sort by score
        signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

        // Execute trades within this child's capital
        const dayTrades = this._executeTrades(portfolio, signals, currentDate, childInfo.agent.config);
        allTrades.push(...dayTrades.map(t => ({ ...t, strategyId, strategyName: portfolio.name })));

        // Check exits
        const exitTrades = this._checkExits(portfolio, agent, currentDate);
        allTrades.push(...exitTrades.map(t => ({ ...t, strategyId, strategyName: portfolio.name })));
      }

      // Record aggregate snapshot
      const benchmarkPrice = this.dataProvider.getBenchmarkPrice()?.price || 100;
      aggregateSnapshots.push({
        date: currentDate,
        totalValue,
        childAllocations: Array.from(childPortfolios.entries()).map(([id, p]) => ({
          strategyId: id,
          name: p.name,
          value: p.totalValue,
          allocation: p.totalValue / totalValue
        })),
        benchmarkValue: benchmarkPrice
      });

      // Store snapshots for each child
      for (const [strategyId, portfolio] of childPortfolios) {
        portfolio.snapshots.push({
          date: currentDate,
          value: portfolio.totalValue,
          cash: portfolio.cash,
          positionsValue: portfolio.totalValue - portfolio.cash,
          positionCount: portfolio.positions.size
        });
      }
    }

    // Calculate performance metrics
    const performance = this._calculatePerformance(
      aggregateSnapshots,
      allTrades,
      initialCapital,
      startDate,
      endDate
    );

    // Calculate per-strategy performance
    const childPerformance = new Map();
    for (const [strategyId, portfolio] of childPortfolios) {
      childPerformance.set(strategyId, {
        name: portfolio.name,
        trades: portfolio.trades.length,
        finalValue: portfolio.totalValue,
        avgAllocation: portfolio.snapshots.reduce((sum, s) => sum + (s.value / aggregateSnapshots.find(a => a.date === s.date)?.totalValue || 0), 0) / portfolio.snapshots.length,
        performance: this._calculateStrategyMetrics(portfolio.snapshots, initialCapital * portfolio.allocation)
      });
    }

    return {
      multiStrategyName: multiStrategyConfig.name,
      period: { startDate, endDate },
      performance,
      childStrategies: Array.from(childPerformance.entries()).map(([id, perf]) => ({
        strategyId: id,
        ...perf
      })),
      allocationHistory,
      aggregateSnapshots,
      trades: allTrades,
      correlationBenefits: this._calculateCorrelationBenefits(childPortfolios)
    };
  }

  _getTradingDays(startDate, endDate, frequency) {
    const allDays = this.dataProvider.getTradingDays(startDate, endDate);

    if (frequency === 'daily') {
      return allDays;
    } else if (frequency === 'weekly') {
      return allDays.filter((_, i) => i % 5 === 0);
    } else if (frequency === 'monthly') {
      return allDays.filter((_, i) => i % 21 === 0);
    }

    return allDays;
  }

  _allocateCapital(childPortfolios, totalCapital) {
    for (const [strategyId, portfolio] of childPortfolios) {
      portfolio.cash = totalCapital * portfolio.allocation;
      portfolio.totalValue = portfolio.cash;
    }
  }

  _updateAllPortfolioValues(childPortfolios, currentDate) {
    for (const [strategyId, portfolio] of childPortfolios) {
      let positionsValue = 0;

      for (const [companyId, position] of portfolio.positions) {
        const priceData = this.dataProvider.getLatestPrice(companyId);
        if (priceData) {
          position.currentPrice = priceData.price;
          position.marketValue = position.shares * position.currentPrice;
          positionsValue += position.marketValue;
        }
      }

      portfolio.totalValue = portfolio.cash + positionsValue;
    }
  }

  _getTotalPortfolioValue(childPortfolios) {
    let total = 0;
    for (const [_, portfolio] of childPortfolios) {
      total += portfolio.totalValue;
    }
    return total;
  }

  _rebalancePortfolios(childPortfolios, targetAllocations, totalValue) {
    const trades = [];
    const rebalanceThreshold = 0.02; // 2% drift triggers rebalance

    // targetAllocations is an object like { "1": { allocation: 0.3 }, "2": { allocation: 0.2 } }
    for (const strategyIdStr in targetAllocations) {
      const strategyId = parseInt(strategyIdStr);
      const alloc = targetAllocations[strategyIdStr];
      const portfolio = childPortfolios.get(strategyId);
      if (!portfolio) continue;

      const currentAllocation = portfolio.totalValue / totalValue;
      const targetAllocation = alloc.allocation;
      const drift = Math.abs(currentAllocation - targetAllocation);

      if (drift > rebalanceThreshold) {
        const targetValue = totalValue * targetAllocation;
        const diff = targetValue - portfolio.totalValue;

        if (diff > 0) {
          // Add capital
          portfolio.cash += diff;
        } else if (diff < 0) {
          // Remove capital (liquidate positions if needed)
          portfolio.cash += diff;
          if (portfolio.cash < 0) {
            // Need to liquidate some positions
            // For simplicity, just adjust cash (in practice would sell positions)
            portfolio.cash = 0;
          }
        }

        portfolio.totalValue = targetValue;
        portfolio.allocation = targetAllocation;

        trades.push({
          date: this.dataProvider.simulationDate,
          type: 'rebalance',
          strategyId: strategyId,
          strategyName: portfolio.name,
          amount: diff,
          reason: `Drift ${(drift * 100).toFixed(1)}% from target`
        });
      }
    }

    return trades;
  }

  _executeTrades(portfolio, signals, currentDate, strategyConfig) {
    const trades = [];
    const maxPositions = strategyConfig.max_positions || 20;
    const maxPositionSize = strategyConfig.max_position_size || 0.10;

    for (const signal of signals) {
      if (signal.action !== 'buy' && signal.action !== 'sell') continue;
      if (portfolio.positions.size >= maxPositions && signal.action === 'buy') continue;

      const priceData = this.dataProvider.getLatestPrice(signal.companyId);
      if (!priceData) continue;

      const price = priceData.price;

      if (signal.action === 'buy') {
        const targetValue = portfolio.totalValue * Math.min(signal.targetSize || maxPositionSize, maxPositionSize);
        const sharesToBuy = Math.floor(targetValue / price);
        const cost = sharesToBuy * price;

        if (cost > portfolio.cash || sharesToBuy <= 0) continue;

        portfolio.cash -= cost;
        portfolio.positions.set(signal.companyId, {
          symbol: signal.symbol,
          shares: sharesToBuy,
          avgPrice: price,
          currentPrice: price,
          marketValue: cost,
          entryDate: currentDate,
          entryReason: signal.reasons?.join(', ') || 'Signal'
        });

        trades.push({
          date: currentDate,
          type: 'buy',
          symbol: signal.symbol,
          companyId: signal.companyId,
          shares: sharesToBuy,
          price,
          value: cost,
          reason: signal.reasons?.join(', ')
        });
      }
    }

    return trades;
  }

  _checkExits(portfolio, agent, currentDate) {
    const trades = [];
    const config = agent.config;

    for (const [companyId, position] of portfolio.positions) {
      const priceData = this.dataProvider.getLatestPrice(companyId);
      if (!priceData) continue;

      const price = priceData.price;
      const returnPct = (price - position.avgPrice) / position.avgPrice;
      let shouldExit = false;
      let exitReason = '';

      // Stop loss
      if (config.stop_loss_pct && returnPct <= -config.stop_loss_pct) {
        shouldExit = true;
        exitReason = 'Stop loss';
      }

      // Take profit
      if (config.take_profit_pct && returnPct >= config.take_profit_pct) {
        shouldExit = true;
        exitReason = 'Take profit';
      }

      // Time-based exit
      const daysHeld = this._getDaysBetween(position.entryDate, currentDate);
      if (config.max_hold_days && daysHeld >= config.max_hold_days) {
        shouldExit = true;
        exitReason = 'Max hold period';
      }

      // Underwater exit
      if (config.exit_underwater_days && returnPct < 0 && daysHeld >= config.exit_underwater_days) {
        shouldExit = true;
        exitReason = 'Underwater exit';
      }

      if (shouldExit) {
        const proceeds = position.shares * price;
        portfolio.cash += proceeds;

        trades.push({
          date: currentDate,
          type: 'sell',
          symbol: position.symbol,
          companyId,
          shares: position.shares,
          price,
          value: proceeds,
          returnPct,
          daysHeld,
          reason: exitReason
        });

        portfolio.positions.delete(companyId);
      }
    }

    return trades;
  }

  _getDaysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  _calculatePerformance(snapshots, trades, initialCapital, startDate, endDate) {
    if (snapshots.length === 0) {
      return { error: 'No snapshots' };
    }

    const finalValue = snapshots[snapshots.length - 1].totalValue;
    const totalReturn = (finalValue - initialCapital) / initialCapital;

    // Calculate daily returns
    const dailyReturns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const ret = (snapshots[i].totalValue - snapshots[i - 1].totalValue) / snapshots[i - 1].totalValue;
      dailyReturns.push(ret);
    }

    // Benchmark (SPY) performance
    const benchmarkStart = snapshots[0].benchmarkValue;
    const benchmarkEnd = snapshots[snapshots.length - 1].benchmarkValue;
    const benchmarkReturn = (benchmarkEnd - benchmarkStart) / benchmarkStart;

    // Risk metrics
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance * 252); // Annualized

    const sharpe = volatility > 0 ? (totalReturn - 0.02) / volatility : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let peak = initialCapital;
    for (const snap of snapshots) {
      if (snap.totalValue > peak) peak = snap.totalValue;
      const drawdown = (peak - snap.totalValue) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Trade statistics
    const buyTrades = trades.filter(t => t.type === 'buy');
    const sellTrades = trades.filter(t => t.type === 'sell');
    const winningTrades = sellTrades.filter(t => t.returnPct > 0);
    const losingTrades = sellTrades.filter(t => t.returnPct <= 0);

    return {
      initialCapital,
      finalValue,
      totalReturn,
      totalReturnPct: totalReturn * 100,
      benchmarkReturn,
      benchmarkReturnPct: benchmarkReturn * 100,
      alpha: totalReturn - benchmarkReturn,
      alphaPct: (totalReturn - benchmarkReturn) * 100,
      volatility,
      sharpe,
      maxDrawdown,
      maxDrawdownPct: maxDrawdown * 100,
      trades: {
        total: buyTrades.length,
        winning: winningTrades.length,
        losing: losingTrades.length,
        winRate: sellTrades.length > 0 ? winningTrades.length / sellTrades.length : 0
      },
      period: { startDate, endDate },
      days: snapshots.length
    };
  }

  _calculateStrategyMetrics(snapshots, initialCapital) {
    if (snapshots.length === 0) return { error: 'No data' };

    const finalValue = snapshots[snapshots.length - 1].value;
    const totalReturn = (finalValue - initialCapital) / initialCapital;

    return {
      initialCapital,
      finalValue,
      totalReturnPct: totalReturn * 100
    };
  }

  _calculateCorrelationBenefits(childPortfolios) {
    // Simple volatility comparison
    const portfolioValues = [];

    // Get aligned snapshots
    const firstPortfolio = Array.from(childPortfolios.values())[0];
    if (!firstPortfolio || firstPortfolio.snapshots.length === 0) {
      return 'Insufficient data';
    }

    for (const snap of firstPortfolio.snapshots) {
      let totalValue = 0;
      for (const [_, portfolio] of childPortfolios) {
        const portfolioSnap = portfolio.snapshots.find(s => s.date === snap.date);
        if (portfolioSnap) {
          totalValue += portfolioSnap.value;
        }
      }
      portfolioValues.push(totalValue);
    }

    // Calculate volatility
    const returns = [];
    for (let i = 1; i < portfolioValues.length; i++) {
      returns.push((portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1]);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const portfolioVol = Math.sqrt(variance * 252);

    return `Portfolio volatility: ${(portfolioVol * 100).toFixed(2)}% (annualized)`;
  }
}

module.exports = { MultiStrategyBacktester };
