// diagnose-zero-winrate.js
// Investigate why strategies have 0% win rate

const Database = require('better-sqlite3');
const db = new Database('./data/stocks.db');

console.log('\n' + '='.repeat(80));
console.log('🔍 DIAGNOSTIC: Why is Win Rate 0%?');
console.log('='.repeat(80));

// Get a sample of trades from one strategy
const trades = db.prepare(`
  SELECT
    t.*,
    c.name as company_name,
    c.ticker
  FROM backtest_trades t
  JOIN companies c ON t.company_id = c.id
  WHERE t.action = 'sell'
  ORDER BY t.trade_date DESC
  LIMIT 50
`).all();

console.log(`\n📊 Analyzing ${trades.length} recent exit trades...\n`);

// Analyze trade outcomes
const outcomes = {
  profitable: [],
  breakeven: [],
  losses: []
};

for (const trade of trades) {
  const returnPct = trade.return_pct || 0;

  if (returnPct > 0.01) {
    outcomes.profitable.push(trade);
  } else if (returnPct >= -0.01) {
    outcomes.breakeven.push(trade);
  } else {
    outcomes.losses.push(trade);
  }
}

console.log('Trade Outcome Distribution:');
console.log(`  Profitable (>1%): ${outcomes.profitable.length} (${(outcomes.profitable.length/trades.length*100).toFixed(1)}%)`);
console.log(`  Breakeven (±1%): ${outcomes.breakeven.length} (${(outcomes.breakeven.length/trades.length*100).toFixed(1)}%)`);
console.log(`  Losses (<-1%): ${outcomes.losses.length} (${(outcomes.losses.length/trades.length*100).toFixed(1)}%)`);

// Analyze exit reasons
console.log('\n📋 Exit Reasons Analysis:\n');

const exitReasons = {};
for (const trade of trades) {
  const reason = trade.exit_reason || 'unknown';
  exitReasons[reason] = exitReasons[reason] || [];
  exitReasons[reason].push(trade);
}

for (const [reason, tradesList] of Object.entries(exitReasons)) {
  const avgReturn = tradesList.reduce((sum, t) => sum + (t.return_pct || 0), 0) / tradesList.length;
  const count = tradesList.length;
  const pct = (count / trades.length * 100).toFixed(1);

  console.log(`  ${reason.padEnd(25)} | ${count.toString().padStart(3)} trades (${pct.padStart(5)}%) | Avg: ${(avgReturn * 100).toFixed(2)}%`);
}

// Check if stop losses are being hit immediately
console.log('\n⏱️  Holding Period Analysis:\n');

const holdingDays = trades.map(t => t.holding_days || 0).filter(d => d > 0);

if (holdingDays.length > 0) {
  const avgHoldingDays = holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length;
  const minHolding = Math.min(...holdingDays);
  const maxHolding = Math.max(...holdingDays);

  console.log(`  Average: ${avgHoldingDays.toFixed(1)} days`);
  console.log(`  Min: ${minHolding} days`);
  console.log(`  Max: ${maxHolding} days`);
} else {
  console.log('  No holding period data available');
}

// Check if stops are too tight
console.log('\n🛑 Stop Loss Analysis:\n');

const stopLosses = trades.filter(t =>
  (t.exit_reason || '').includes('stop') ||
  (t.return_pct && t.return_pct <= -0.09)
);

console.log(`  ${stopLosses.length} trades hit stop loss or lost >9%`);

if (stopLosses.length > 0) {
  const avgStopLoss = stopLosses.reduce((sum, t) => sum + (t.return_pct || 0), 0) / stopLosses.length;
  console.log(`  Average stop loss: ${(avgStopLoss * 100).toFixed(2)}%`);

  // Sample some stop losses
  console.log('\n  Sample Stop Loss Exits:');
  for (const trade of stopLosses.slice(0, 5)) {
    console.log(`    ${trade.ticker.padEnd(6)} | ${(trade.return_pct * 100).toFixed(2).padStart(7)}% | ${trade.holding_days || 0} days | ${trade.exit_reason}`);
  }
}

// Check signal quality at entry
console.log('\n📊 Signal Quality at Entry:\n');

const signalScores = db.prepare(`
  SELECT
    AVG(signal_score) as avg_score,
    AVG(confidence) as avg_confidence,
    COUNT(*) as count
  FROM backtest_trades
  WHERE action = 'buy'
`).get();

console.log(`  Average Signal Score: ${signalScores.avg_score?.toFixed(3) || 'N/A'}`);
console.log(`  Average Confidence: ${signalScores.avg_confidence?.toFixed(3) || 'N/A'}`);
console.log(`  Total Buy Signals: ${signalScores.count}`);

// Check if we're trading in wrong market conditions
console.log('\n🌍 Market Context Analysis:\n');

const marketPerformance = db.prepare(`
  SELECT
    MIN(date) as start_date,
    MAX(date) as end_date,
    (SELECT close FROM market_indicators WHERE ticker = 'SPY' ORDER BY date DESC LIMIT 1) as latest_spy,
    (SELECT close FROM market_indicators WHERE ticker = 'SPY' ORDER BY date ASC LIMIT 1) as earliest_spy
  FROM market_indicators
  WHERE ticker = 'SPY'
`).get();

if (marketPerformance.latest_spy && marketPerformance.earliest_spy) {
  const marketReturn = (marketPerformance.latest_spy - marketPerformance.earliest_spy) / marketPerformance.earliest_spy * 100;
  console.log(`  Test Period: ${marketPerformance.start_date} to ${marketPerformance.end_date}`);
  console.log(`  SPY Return: ${marketReturn.toFixed(2)}%`);
  console.log(`  Market Direction: ${marketReturn > 0 ? 'Up Market' : 'Down Market'}`);
}

// Check for data quality issues
console.log('\n🔍 Data Quality Checks:\n');

const missingData = db.prepare(`
  SELECT
    COUNT(CASE WHEN signal_score IS NULL THEN 1 END) as null_scores,
    COUNT(CASE WHEN confidence IS NULL THEN 1 END) as null_confidence,
    COUNT(CASE WHEN return_pct IS NULL THEN 1 END) as null_returns,
    COUNT(*) as total
  FROM backtest_trades
  WHERE action = 'sell'
`).get();

console.log(`  Trades missing signal_score: ${missingData.null_scores}/${missingData.total}`);
console.log(`  Trades missing confidence: ${missingData.null_confidence}/${missingData.total}`);
console.log(`  Trades missing return_pct: ${missingData.null_returns}/${missingData.total}`);

// Most traded stocks - are we picking losers?
console.log('\n📈 Most Traded Stocks:\n');

const topTrades = db.prepare(`
  SELECT
    c.ticker,
    c.name,
    COUNT(*) as trade_count,
    AVG(t.return_pct) as avg_return
  FROM backtest_trades t
  JOIN companies c ON t.company_id = c.id
  WHERE t.action = 'sell' AND t.return_pct IS NOT NULL
  GROUP BY c.ticker, c.name
  ORDER BY trade_count DESC
  LIMIT 10
`).all();

console.log('  Ticker | Trades | Avg Return');
console.log('  ' + '-'.repeat(35));
for (const stock of topTrades) {
  console.log(`  ${stock.ticker.padEnd(6)} | ${stock.trade_count.toString().padStart(6)} | ${(stock.avg_return * 100).toFixed(2).padStart(9)}%`);
}

console.log('\n' + '='.repeat(80));
console.log('💡 PRELIMINARY DIAGNOSIS');
console.log('='.repeat(80));

// Generate diagnosis
const diagnosis = [];

if (outcomes.losses.length > trades.length * 0.9) {
  diagnosis.push('🔴 CRITICAL: >90% of trades are losses - fundamental stock selection problem');
}

if (holdingDays.length > 0) {
  const avgHoldingDays = holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length;
  if (avgHoldingDays < 10) {
    diagnosis.push('⚠️  Very short holding period (<10 days) - stops may be too tight');
  }
}

if (stopLosses.length > trades.length * 0.7) {
  diagnosis.push('⚠️  >70% of exits are stop losses - need wider stops or better entries');
}

if (signalScores.avg_score && signalScores.avg_score < 0.4) {
  diagnosis.push('⚠️  Low average signal score - signals may not be predictive');
}

if (marketPerformance.latest_spy && marketPerformance.earliest_spy) {
  const marketReturn = (marketPerformance.latest_spy - marketPerformance.earliest_spy) / marketPerformance.earliest_spy;
  if (marketReturn > 0.1) {
    diagnosis.push('🔴 Market was up >10% but strategies lost money - BROKEN LOGIC');
  }
}

if (diagnosis.length === 0) {
  diagnosis.push('✅ No obvious issues found - needs deeper investigation');
}

console.log('\n');
diagnosis.forEach(d => console.log(`  ${d}`));

console.log('\n' + '='.repeat(80));
console.log('📋 NEXT INVESTIGATION STEPS');
console.log('='.repeat(80));

console.log('\n1. Review signal generation logic in ConfigurableStrategyAgent');
console.log('2. Check if fundamental/sentiment data is accurate and timely');
console.log('3. Analyze individual factor contributions (which factors hurt?)');
console.log('4. Review exit logic - are stops too aggressive?');
console.log('5. Check if lookahead bias fix broke something else');
console.log('\n');

db.close();
