// src/services/backtesting/enhancedBacktestRunner.js
// Enhanced Backtest Runner - Integrates all council recommendations
// Runs comparative backtests to measure improvement from quant enhancements

const path = require('path');
const { db, isPostgres } = require('../../database');
const { HistoricalAgentBacktester } = require('./historicalAgentBacktester');
const { EnhancedQuantSystem } = require('../quant/enhancedQuantSystem');

/**
 * EnhancedBacktestRunner - Runs backtests with council improvements
 *
 * Compares baseline vs enhanced performance to measure:
 * - Alpha generation from factor/regime overlays
 * - Risk reduction from tail hedging and correlation management
 * - Signal quality from decorrelation and moat scoring
 */
class EnhancedBacktestRunner {
  constructor(db) {
    this.db = db;
    this.quantSystem = new EnhancedQuantSystem(db);
  }

  /**
   * Run enhanced backtest with all improvements
   */
  async runEnhancedBacktest(config = {}) {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(70));
    console.log('🚀 ENHANCED BACKTEST WITH COUNCIL IMPROVEMENTS');
    console.log('='.repeat(70));

    // Show active subsystems
    const status = this.quantSystem.getSystemStatus();
    console.log('\n📋 Active Subsystems:');
    for (const [name, state] of Object.entries(status.subsystems)) {
      console.log(`   ${name}: ${state}`);
    }

    // Get market assessment
    console.log('\n📊 Current Market Assessment:');
    const marketAssessment = this.quantSystem.getMarketAssessment();
    console.log(`   Overall Risk: ${marketAssessment.overallRisk.toUpperCase()}`);
    console.log(`   Exposure Multiplier: ${(marketAssessment.exposureMultiplier * 100).toFixed(0)}%`);
    console.log(`   Economic Regime: ${marketAssessment.economicRegime.regime}`);
    console.log(`   Credit Cycle Phase: ${marketAssessment.creditCycle.phase.phase}`);

    if (marketAssessment.recommendations.length > 0) {
      console.log('\n   Recommendations:');
      marketAssessment.recommendations.forEach(r => console.log(`   • ${r}`));
    }

    // Default config
    const backtestConfig = {
      startDate: config.startDate || '2024-01-01',
      endDate: config.endDate || '2024-12-31',
      initialCapital: config.initialCapital || 100000,
      stepFrequency: config.stepFrequency || 'weekly',
      universe: config.universe || 'top100',
      minMarketCap: config.minMarketCap || 1e9,
      minConfidence: config.minConfidence || 0.6,
      minScore: config.minScore || 0.3,
      maxPositions: config.maxPositions || 20,
      maxPositionSize: config.maxPositionSize || 0.08, // Reduced from 10% for better diversification
      commissionBps: config.commissionBps || 5,
      slippageBps: config.slippageBps || 5,
      benchmark: config.benchmark || 'SPY',
      verbose: config.verbose || false,

      // Enhanced settings
      useRegimeOverlay: true,
      useCorrelationConstraints: true,
      useMoatScoring: true,
      useTailHedging: true,
      useSignalDecorrelation: true
    };

    // Create enhanced backtester
    const backtester = new EnhancedAgentBacktester(this.db, backtestConfig, this.quantSystem);

    // Run enhanced backtest
    console.log('\n' + '-'.repeat(70));
    console.log('Running Enhanced Backtest...');
    console.log('-'.repeat(70));

    const enhancedResults = await backtester.runBacktest();

    // Run baseline for comparison (without enhancements)
    console.log('\n' + '-'.repeat(70));
    console.log('Running Baseline Backtest (for comparison)...');
    console.log('-'.repeat(70));

    const baselineBacktester = new HistoricalAgentBacktester(this.db, {
      ...backtestConfig,
      verbose: false
    });
    const baselineResults = await baselineBacktester.runBacktest();

    // Compare results
    const comparison = this._compareResults(enhancedResults, baselineResults);

    const elapsed = (Date.now() - startTime) / 1000;

    // Print comparison
    this._printComparison(enhancedResults, baselineResults, comparison, elapsed);

    return {
      enhanced: enhancedResults,
      baseline: baselineResults,
      comparison,
      marketAssessment,
      elapsedSeconds: elapsed
    };
  }

  _compareResults(enhanced, baseline) {
    const ePerf = enhanced.performance;
    const bPerf = baseline.performance;

    return {
      returnImprovement: (parseFloat(ePerf.totalReturn) - parseFloat(bPerf.totalReturn)).toFixed(2),
      sharpeImprovement: (parseFloat(ePerf.sharpeRatio) - parseFloat(bPerf.sharpeRatio)).toFixed(2),
      sortinoImprovement: (parseFloat(ePerf.sortinoRatio) - parseFloat(bPerf.sortinoRatio)).toFixed(2),
      drawdownReduction: (parseFloat(bPerf.maxDrawdown) - parseFloat(ePerf.maxDrawdown)).toFixed(2),
      volatilityChange: (parseFloat(ePerf.volatility) - parseFloat(bPerf.volatility)).toFixed(2),
      alphaImprovement: (parseFloat(enhanced.benchmark.alpha) - parseFloat(baseline.benchmark.alpha)).toFixed(2),
      winRateChange: (parseFloat(ePerf.winRate) - parseFloat(bPerf.winRate)).toFixed(1)
    };
  }

  _printComparison(enhanced, baseline, comparison, elapsed) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 ENHANCED VS BASELINE COMPARISON');
    console.log('='.repeat(70));

    console.log('\n┌──────────────────────────┬────────────────┬────────────────┬────────────────┐');
    console.log('│ Metric                   │ Enhanced       │ Baseline       │ Improvement    │');
    console.log('├──────────────────────────┼────────────────┼────────────────┼────────────────┤');

    const rows = [
      ['Total Return', enhanced.performance.totalReturn + '%', baseline.performance.totalReturn + '%', comparison.returnImprovement + '%'],
      ['Sharpe Ratio', enhanced.performance.sharpeRatio, baseline.performance.sharpeRatio, comparison.sharpeImprovement],
      ['Sortino Ratio', enhanced.performance.sortinoRatio, baseline.performance.sortinoRatio, comparison.sortinoImprovement],
      ['Max Drawdown', enhanced.performance.maxDrawdown + '%', baseline.performance.maxDrawdown + '%', comparison.drawdownReduction + '%'],
      ['Volatility', enhanced.performance.volatility + '%', baseline.performance.volatility + '%', comparison.volatilityChange + '%'],
      ['Alpha', enhanced.benchmark.alpha + '%', baseline.benchmark.alpha + '%', comparison.alphaImprovement + '%'],
      ['Win Rate', enhanced.performance.winRate + '%', baseline.performance.winRate + '%', comparison.winRateChange + '%']
    ];

    for (const row of rows) {
      console.log(`│ ${row[0].padEnd(24)} │ ${row[1].toString().padEnd(14)} │ ${row[2].toString().padEnd(14)} │ ${row[3].toString().padEnd(14)} │`);
    }

    console.log('└──────────────────────────┴────────────────┴────────────────┴────────────────┘');

    console.log('\n📈 Council Improvements Impact:');
    const impactScore = (
      parseFloat(comparison.returnImprovement) * 0.3 +
      parseFloat(comparison.sharpeImprovement) * 20 +
      parseFloat(comparison.drawdownReduction) * 0.5 +
      parseFloat(comparison.alphaImprovement) * 0.4
    ).toFixed(1);

    console.log(`   Composite Impact Score: ${impactScore}`);

    if (parseFloat(comparison.returnImprovement) > 0) {
      console.log(`   ✅ Return improved by ${comparison.returnImprovement}%`);
    } else {
      console.log(`   ⚠️ Return decreased by ${Math.abs(parseFloat(comparison.returnImprovement))}%`);
    }

    if (parseFloat(comparison.sharpeImprovement) > 0) {
      console.log(`   ✅ Risk-adjusted return (Sharpe) improved by ${comparison.sharpeImprovement}`);
    }

    if (parseFloat(comparison.drawdownReduction) > 0) {
      console.log(`   ✅ Max drawdown reduced by ${comparison.drawdownReduction}%`);
    }

    console.log(`\n⏱️ Total Execution Time: ${elapsed.toFixed(1)}s`);
    console.log('='.repeat(70) + '\n');
  }
}

/**
 * EnhancedAgentBacktester - Backtester with all council improvements
 */
class EnhancedAgentBacktester extends HistoricalAgentBacktester {
  constructor(db, config, quantSystem) {
    super(db, config);
    this.quantSystem = quantSystem;
  }

  /**
   * Override signal generation to include enhancements
   */
  _generateSignals(universe, portfolio) {
    const { minConfidence, minScore } = this.config;
    const signals = [];

    // Get market assessment for regime overlay
    const marketAssessment = this.quantSystem.getMarketAssessment();
    const regime = marketAssessment.economicRegime;

    for (const stock of universe) {
      try {
        const signal = this._generateEnhancedSignalForStock(stock, portfolio, regime, marketAssessment);
        if (signal && signal.confidence >= minConfidence && Math.abs(signal.score) >= minScore) {
          signals.push(signal);
        }
      } catch (error) {
        // Skip stocks with data issues
      }
    }

    // Sort by absolute score
    signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    return signals;
  }

  /**
   * Enhanced signal generation with all council improvements
   */
  _generateEnhancedSignalForStock(stock, portfolio, regime, marketAssessment) {
    // Get base signal
    const baseSignal = this._generateSignalForStock(stock, portfolio);
    if (!baseSignal) return null;

    let adjustedScore = baseSignal.score;
    let adjustedConfidence = baseSignal.confidence;
    const adjustments = [];

    // 1. Regime Overlay (Dalio)
    if (this.config.useRegimeOverlay) {
      const sectorMultipliers = this.quantSystem.economicRegime.getSectorMultipliers(regime.regime);
      const sectorMult = sectorMultipliers.sectorMultipliers[stock.sector] || 1.0;

      if (sectorMult !== 1.0) {
        const regimeAdjustment = (sectorMult - 1) * 0.3; // Scale down impact
        adjustedScore += regimeAdjustment;
        adjustments.push({ type: 'regime', value: regimeAdjustment.toFixed(3) });
      }
    }

    // 2. Moat Scoring (Buffett)
    if (this.config.useMoatScoring) {
      try {
        const moatScore = this.quantSystem.moatScorer.calculateMoatScore(stock.id);
        if (!moatScore.error) {
          // Favor wide moat companies
          if (moatScore.moatStrength === 'wide') {
            adjustedScore += 0.1;
            adjustedConfidence += 0.05;
            adjustments.push({ type: 'moat_wide', value: '+0.10' });
          } else if (moatScore.moatStrength === 'narrow') {
            adjustedScore += 0.03;
            adjustments.push({ type: 'moat_narrow', value: '+0.03' });
          } else if (moatScore.moatStrength === 'none') {
            adjustedScore -= 0.05;
            adjustments.push({ type: 'moat_none', value: '-0.05' });
          }
        }
      } catch (e) {
        // Continue without moat adjustment
      }
    }

    // 3. Market Risk Adjustment (Spitznagel)
    if (this.config.useTailHedging) {
      const exposureMultiplier = marketAssessment.exposureMultiplier;
      if (exposureMultiplier < 1.0) {
        // Reduce confidence in high-risk environments
        adjustedConfidence *= exposureMultiplier;
        adjustments.push({ type: 'tail_risk', value: `×${exposureMultiplier.toFixed(2)}` });
      }
    }

    // 4. Correlation Check (Simons)
    if (this.config.useCorrelationConstraints && portfolio.positions.size > 0) {
      const positions = Array.from(portfolio.positions.entries()).map(([symbol, pos]) => ({
        symbol,
        value: pos.marketValue
      }));

      try {
        const corrCheck = this.quantSystem.correlationManager.checkNewPositionCorrelation(
          stock.symbol,
          positions,
          0.7
        );

        if (!corrCheck.canAdd && corrCheck.highlyCorrelatedWith.length > 0) {
          // Penalize highly correlated additions
          adjustedScore *= 0.7;
          adjustedConfidence *= 0.85;
          adjustments.push({ type: 'correlation_penalty', value: '×0.70' });
        }
      } catch (e) {
        // Continue without correlation adjustment
      }
    }

    // Clamp values
    adjustedScore = Math.max(-1, Math.min(1, adjustedScore));
    adjustedConfidence = Math.max(0.3, Math.min(0.95, adjustedConfidence));

    // Update action based on adjusted score
    let action = 'hold';
    if (adjustedScore > 0.3) action = 'strong_buy';
    else if (adjustedScore > 0.1) action = 'buy';
    else if (adjustedScore < -0.3) action = 'strong_sell';
    else if (adjustedScore < -0.1) action = 'sell';

    return {
      ...baseSignal,
      score: adjustedScore,
      confidence: adjustedConfidence,
      action,
      baseScore: baseSignal.score,
      baseConfidence: baseSignal.confidence,
      adjustments
    };
  }

  /**
   * Override trade execution with enhanced constraints
   */
  _executeTrades(portfolio, signals, date) {
    const trades = [];
    const { maxPositions, maxPositionSize, commissionBps, slippageBps } = this.config;

    // Get market risk adjustment
    const marketAssessment = this.quantSystem.getMarketAssessment();
    const exposureMultiplier = marketAssessment.exposureMultiplier;

    // Adjusted max position size based on market risk
    const adjustedMaxSize = maxPositionSize * exposureMultiplier;

    // Check for exits on existing positions
    const positionsToClose = [];
    for (const [symbol, position] of portfolio.positions) {
      const pnlPercent = (position.currentPrice - position.avgCost) / position.avgCost;
      const holdingDays = this._daysBetween(position.entryDate, date);

      // Dynamic stop loss based on market conditions
      const stopLoss = marketAssessment.overallRisk === 'extreme' ? -0.05 :
                       marketAssessment.overallRisk === 'high' ? -0.07 : -0.10;

      // Tighter stops in high-risk environments
      if (pnlPercent < stopLoss) {
        positionsToClose.push({ symbol, reason: 'stop_loss' });
      }
      // Profit taking
      else if (pnlPercent > 0.25) {
        positionsToClose.push({ symbol, reason: 'profit_taking' });
      }
      // Time-based exit
      else if (holdingDays > 60 && pnlPercent < 0) {
        positionsToClose.push({ symbol, reason: 'time_exit' });
      }
    }

    // Execute exits
    for (const { symbol } of positionsToClose) {
      const position = portfolio.positions.get(symbol);
      if (position) {
        const trade = this._executeSell(portfolio, symbol, position, date, commissionBps, slippageBps);
        if (trade) trades.push(trade);
      }
    }

    // Sell signals
    const sellSignals = signals.filter(s =>
      (s.action === 'sell' || s.action === 'strong_sell') &&
      portfolio.positions.has(s.symbol)
    );

    for (const signal of sellSignals) {
      const position = portfolio.positions.get(signal.symbol);
      if (!position) continue;

      const trade = this._executeSell(portfolio, signal.symbol, position, date, commissionBps, slippageBps);
      if (trade) trades.push(trade);
    }

    // Adjust max positions based on risk
    const adjustedMaxPositions = Math.floor(maxPositions * exposureMultiplier);

    // Buy signals with enhanced filtering
    const buySignals = signals.filter(s =>
      (s.action === 'buy' || s.action === 'strong_buy') &&
      !portfolio.positions.has(s.symbol)
    );

    // Apply sector diversification constraint
    const sectorCounts = new Map();
    for (const [symbol] of portfolio.positions) {
      const company = this.stmtGetCompany.get(symbol);
      if (company) {
        sectorCounts.set(company.sector, (sectorCounts.get(company.sector) || 0) + 1);
      }
    }

    const maxPerSector = Math.ceil(adjustedMaxPositions / 4); // Max 25% per sector

    for (const signal of buySignals) {
      if (portfolio.positions.size >= adjustedMaxPositions) break;

      // Check sector constraint
      const currentSectorCount = sectorCounts.get(signal.sector) || 0;
      if (currentSectorCount >= maxPerSector) continue;

      const positionValue = Math.min(
        portfolio.totalValue * adjustedMaxSize,
        portfolio.cash * 0.9
      );

      if (positionValue < 1000) continue;

      const trade = this._executeBuy(portfolio, signal, positionValue, date, commissionBps, slippageBps);
      if (trade) {
        trades.push(trade);
        sectorCounts.set(signal.sector, currentSectorCount + 1);
      }
    }

    return trades;
  }
}

/**
 * Run the enhanced backtest
 */
async function runEnhancedBacktest() {
  if (isPostgres) {
    console.error('runEnhancedBacktest() is not yet supported in PostgreSQL mode.');
    console.error('Use async database methods from lib/db.js');
    process.exit(1);
  }

  try {
    const runner = new EnhancedBacktestRunner(db);
    const results = await runner.runEnhancedBacktest({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      initialCapital: 100000,
      stepFrequency: 'weekly',
      universe: 'top100',
      verbose: false
    });

    // Save results
    const resultsPath = path.join(__dirname, '../../../data/enhanced-backtest-results.json');
    require('fs').writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${resultsPath}`);

    return results;
  } catch (error) {
    throw error;
  }
  // Note: Don't close shared database instance
}

// Run if called directly
if (require.main === module) {
  runEnhancedBacktest()
    .then(results => {
      console.log('\n✅ Enhanced backtest completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Backtest failed:', error);
      process.exit(1);
    });
}

module.exports = { EnhancedBacktestRunner, EnhancedAgentBacktester, runEnhancedBacktest };
