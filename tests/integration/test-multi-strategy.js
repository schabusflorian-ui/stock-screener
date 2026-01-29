// test-multi-strategy.js
// Create and test multi-strategy configuration

const Database = require('better-sqlite3');
const { StrategyConfigManager } = require('./src/services/agent/strategyConfig');
const { MultiStrategyBacktester } = require('./src/services/backtesting/multiStrategyBacktester');

const db = new Database('./data/stocks.db');

async function main() {
  const configManager = new StrategyConfigManager(db);

  console.log('📋 Creating Multi-Strategy Configuration...\n');

  // Check if multi-strategy already exists
  const existing = db.prepare(`
    SELECT id, name FROM strategy_configs WHERE mode = 'multi' LIMIT 1
  `).get();

  let multiStrategyId;

  if (existing) {
    console.log(`✅ Using existing multi-strategy: "${existing.name}" (ID: ${existing.id})`);
    multiStrategyId = existing.id;
  } else {
    // Create multi-strategy parent
    const result = db.prepare(`
      INSERT INTO strategy_configs (
        name, description, mode, created_at
      ) VALUES (?, ?, ?, datetime('now'))
    `).run(
      'Diversified Multi-Strategy',
      'AI-driven allocation across multiple strategies with regime adaptation',
      'multi'
    );

    multiStrategyId = result.lastInsertRowid;
    console.log(`✅ Created multi-strategy (ID: ${multiStrategyId})`);

    // Get all single strategies
    const strategies = db.prepare(`
      SELECT id, name FROM strategy_configs WHERE mode = 'single'
    `).all();

    console.log(`   Found ${strategies.length} child strategies\n`);

    // Create allocations (equal weight initially)
    const equalWeight = 1.0 / strategies.length;

    for (const strategy of strategies) {
      db.prepare(`
        INSERT INTO multi_strategy_allocations (
          parent_strategy_id, child_strategy_id, target_allocation
        ) VALUES (?, ?, ?)
      `).run(multiStrategyId, strategy.id, equalWeight);

      console.log(`   ✓ Added ${strategy.name} (${(equalWeight * 100).toFixed(1)}%)`);
    }
  }

  console.log('\n🚀 Running Multi-Strategy Backtest...\n');

  const backtester = new MultiStrategyBacktester(db);

  const results = await backtester.backtestMultiStrategy({
    multiStrategyId,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    initialCapital: 100000,
    rebalanceFrequency: 'weekly'
  });

  // Display results
  console.log('\n' + '='.repeat(80));
  console.log('📊 MULTI-STRATEGY BACKTEST RESULTS');
  console.log('='.repeat(80));
  console.log(`\nStrategy: ${results.multiStrategyName}`);
  console.log(`Period: ${results.period.startDate} to ${results.period.endDate}`);
  console.log(`Days: ${results.performance.days}`);

  console.log('\n--- Overall Performance ---');
  console.log(`Initial Capital:  $${results.performance.initialCapital.toLocaleString()}`);
  console.log(`Final Value:      $${results.performance.finalValue.toLocaleString()}`);
  console.log(`Total Return:     ${results.performance.totalReturnPct.toFixed(2)}%`);
  console.log(`Benchmark (SPY):  ${results.performance.benchmarkReturnPct.toFixed(2)}%`);
  console.log(`Alpha:            ${results.performance.alphaPct.toFixed(2)}%`);
  console.log(`Sharpe Ratio:     ${results.performance.sharpe.toFixed(2)}`);
  console.log(`Max Drawdown:     ${results.performance.maxDrawdownPct.toFixed(2)}%`);
  console.log(`Volatility:       ${(results.performance.volatility * 100).toFixed(2)}%`);

  console.log('\n--- Trade Statistics ---');
  console.log(`Total Trades:     ${results.performance.trades.total}`);
  console.log(`Winning Trades:   ${results.performance.trades.winning}`);
  console.log(`Losing Trades:    ${results.performance.trades.losing}`);
  console.log(`Win Rate:         ${(results.performance.trades.winRate * 100).toFixed(1)}%`);

  console.log('\n--- Child Strategy Performance ---');
  for (const child of results.childStrategies) {
    console.log(`\n${child.name}:`);
    console.log(`  Average Allocation:  ${(child.avgAllocation * 100).toFixed(1)}%`);
    console.log(`  Final Value:         $${child.finalValue.toLocaleString()}`);
    console.log(`  Trades:              ${child.trades}`);
    if (child.performance && !child.performance.error) {
      console.log(`  Return:              ${child.performance.totalReturnPct.toFixed(2)}%`);
    }
  }

  console.log('\n--- Allocation History (Sample) ---');
  const sampleAllocations = results.allocationHistory.slice(0, 3);
  for (const alloc of sampleAllocations) {
    console.log(`\n${alloc.date}:`);
    console.log(`  Regime: ${alloc.regime}, Risk: ${alloc.riskLevel}`);
    // alloc.allocations is an object like { "1": { allocation: 0.3 }, "2": { allocation: 0.2 } }
    for (const strategyIdStr in alloc.allocations) {
      const strategyId = parseInt(strategyIdStr);
      const allocation = alloc.allocations[strategyIdStr];
      const child = results.childStrategies.find(c => c.strategyId === strategyId);
      console.log(`    ${child?.name}: ${(allocation.allocation * 100).toFixed(1)}%`);
    }
  }

  console.log('\n--- Diversification Benefits ---');
  console.log(results.correlationBenefits);

  console.log('\n' + '='.repeat(80));

  // Save results to file
  const fs = require('fs');
  fs.writeFileSync(
    './data/multi-strategy-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Full results saved to: data/multi-strategy-results.json\n');

  db.close();
}

main().catch(console.error);
