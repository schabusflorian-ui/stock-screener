#!/usr/bin/env node
// scripts/run-historical-backtest.js
// Run a historical backtest of the trading agent
// Usage: node scripts/run-historical-backtest.js [options]

const path = require('path');
process.env.DATABASE_PATH = path.join(__dirname, '..', 'data', 'stocks.db');

const database = require('../src/database');
const { HistoricalAgentBacktester } = require('../src/services/backtesting/historicalAgentBacktester');

async function runBacktest() {
  console.log('\n🚀 Starting Historical Agent Backtest\n');

  // Initialize database
  const db = database.getDatabase();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const getArg = (name, defaultVal) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
  };

  // Configuration
  const config = {
    // Date range - default to 2024 (1 year ago)
    startDate: getArg('start', '2024-01-01'),
    endDate: getArg('end', '2024-12-31'),

    // Capital
    initialCapital: parseFloat(getArg('capital', '100000')),

    // Step frequency
    stepFrequency: getArg('frequency', 'weekly'), // 'daily' or 'weekly'

    // Universe - top 100 stocks by market cap
    universe: getArg('universe', 'top100'),
    minMarketCap: parseFloat(getArg('min-cap', '1000000000')), // $1B

    // Agent settings
    minConfidence: parseFloat(getArg('min-confidence', '0.55')),
    minScore: parseFloat(getArg('min-score', '0.15')),
    maxPositions: parseInt(getArg('max-positions', '20')),
    maxPositionSize: parseFloat(getArg('max-position-size', '0.08')), // 8%

    // Transaction costs
    commissionBps: parseFloat(getArg('commission', '5')),
    slippageBps: parseFloat(getArg('slippage', '5')),

    // Benchmark
    benchmark: getArg('benchmark', 'SPY'),

    // Verbose logging
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  console.log('Configuration:');
  console.log(`  Period: ${config.startDate} to ${config.endDate}`);
  console.log(`  Initial Capital: $${config.initialCapital.toLocaleString()}`);
  console.log(`  Universe: ${config.universe}`);
  console.log(`  Step Frequency: ${config.stepFrequency}`);
  console.log(`  Max Positions: ${config.maxPositions}`);
  console.log(`  Transaction Costs: ${config.commissionBps + config.slippageBps} bps\n`);

  try {
    // Create backtester and run
    const backtester = new HistoricalAgentBacktester(db, config);
    const results = await backtester.runBacktest();

    // Save results to JSON
    const outputPath = path.join(__dirname, '..', 'data', 'backtest-results.json');
    const fs = require('fs');
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      config,
      summary: {
        performance: results.performance,
        benchmark: results.benchmark,
        trades: results.trades,
        signals: results.signals
      },
      // Don't save full equity curve and trade history to keep file size manageable
      equityCurveSummary: {
        startValue: results.equityCurve[0]?.portfolioValue,
        endValue: results.equityCurve[results.equityCurve.length - 1]?.portfolioValue,
        maxValue: Math.max(...results.equityCurve.map(s => s.portfolioValue)),
        minValue: Math.min(...results.equityCurve.map(s => s.portfolioValue)),
        dataPoints: results.equityCurve.length
      }
    }, null, 2));

    console.log(`\n✅ Results saved to: ${outputPath}`);

    // Print key metrics
    console.log('\n' + '='.repeat(60));
    console.log('KEY PERFORMANCE METRICS');
    console.log('='.repeat(60));
    console.log(`\n📈 Returns:`);
    console.log(`   Total Return: ${results.performance.totalReturn}%`);
    console.log(`   Annualized Return: ${results.performance.annualizedReturn}%`);
    console.log(`   vs ${config.benchmark}: ${results.benchmark.benchmarkReturn}%`);
    console.log(`   Alpha: ${results.benchmark.alpha}%`);

    console.log(`\n📊 Risk-Adjusted:`);
    console.log(`   Sharpe Ratio: ${results.performance.sharpeRatio}`);
    console.log(`   Sortino Ratio: ${results.performance.sortinoRatio}`);
    console.log(`   Max Drawdown: ${results.performance.maxDrawdown}%`);
    console.log(`   Beta: ${results.benchmark.beta}`);

    console.log(`\n💼 Trading:`);
    console.log(`   Total Trades: ${results.trades.total}`);
    console.log(`   Win Rate: ${results.performance.winRate}%`);
    console.log(`   Profit Factor: ${results.performance.profitFactor}`);
    console.log(`   Avg Holding Period: ${results.trades.avgHoldingPeriod} days`);

    console.log(`\n⏱️  Execution Time: ${results.elapsedSeconds.toFixed(1)}s`);
    console.log('='.repeat(60) + '\n');

    return results;

  } catch (error) {
    console.error('\n❌ Backtest failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBacktest()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runBacktest };
