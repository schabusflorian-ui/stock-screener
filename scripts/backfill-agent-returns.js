#!/usr/bin/env node
/**
 * Backfill actual_return values for executed agent signals
 *
 * This script calculates and populates actual_return for signals that were executed
 * but don't have return data yet. This is needed for agent performance metrics to work.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('Starting actual_return backfill...\n');

/**
 * Calculate return for a signal based on entry and exit prices
 * Only calculates for CLOSED positions (buy->sell or sell->buy pairs)
 */
function calculateSignalReturn(signal) {
  const entryPrice = signal.executed_price || signal.price_at_signal;

  if (!entryPrice || entryPrice <= 0) {
    console.log(`  [SKIP] ${signal.symbol}: No valid entry price`);
    return null;
  }

  // For executed signals, try to find exit price
  let exitPrice = null;

  // Method 1: Check if signal was closed (look for opposite action)
  const oppositeAction = signal.action === 'buy' || signal.action === 'strong_buy' ? 'sell' : 'buy';

  // Use whichever date field is populated (executed_at for sells, signal_date for buys)
  const signalDate = signal.executed_at || signal.signal_date;

  const closeSignal = db.prepare(`
    SELECT executed_price, price_at_signal, executed_at, signal_date
    FROM agent_signals
    WHERE agent_id = ?
      AND company_id = ?
      AND (action = ? OR action = ?)
      AND status = 'executed'
      AND (executed_at > ? OR (executed_at IS NULL AND signal_date > ?))
    ORDER BY COALESCE(executed_at, signal_date) ASC
    LIMIT 1
  `).get(signal.agent_id, signal.company_id, oppositeAction, 'strong_' + oppositeAction, signalDate, signalDate);

  if (closeSignal) {
    exitPrice = closeSignal.executed_price || closeSignal.price_at_signal;
  }

  // IMPORTANT: Only calculate returns for CLOSED positions
  // Do NOT use current price - this would mix realized and unrealized returns
  if (!exitPrice) {
    // No closing signal found - position is still open
    // Don't calculate actual_return for open positions
    console.log(`  [OPEN] ${signal.symbol}: Position still open, skipping`);
    return null;
  }

  if (exitPrice <= 0) {
    console.log(`  [SKIP] ${signal.symbol}: Invalid exit price`);
    return null;
  }

  // Calculate return percentage
  let returnPct;
  const isBuyAction = signal.action === 'buy' || signal.action === 'strong_buy';

  if (isBuyAction) {
    // For buy signals: profit when exit price > entry price
    returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
  } else {
    // For sell signals: profit when exit price < entry price (short position)
    returnPct = ((entryPrice - exitPrice) / entryPrice) * 100;
  }

  return returnPct;
}

// Main backfill logic
try {
  // Get all executed signals without actual_return
  const signals = db.prepare(`
    SELECT
      s.id,
      s.agent_id,
      s.company_id,
      s.action,
      s.executed_price,
      s.price_at_signal,
      s.executed_at,
      s.signal_date,
      c.symbol
    FROM agent_signals s
    JOIN companies c ON s.company_id = c.id
    WHERE s.status = 'executed' AND s.actual_return IS NULL
    ORDER BY s.executed_at ASC
  `).all();

  console.log(`Found ${signals.length} executed signals without actual_return\n`);

  if (signals.length === 0) {
    console.log('No signals to backfill. Exiting.');
    process.exit(0);
  }

  let successCount = 0;
  let skipCount = 0;

  const updateStmt = db.prepare(`
    UPDATE agent_signals
    SET actual_return = ?
    WHERE id = ?
  `);

  for (const signal of signals) {
    const actualReturn = calculateSignalReturn(signal);

    if (actualReturn !== null) {
      updateStmt.run(actualReturn, signal.id);
      console.log(`  [OK] ${signal.symbol} (${signal.action}): ${actualReturn.toFixed(2)}%`);
      successCount++;
    } else {
      skipCount++;
    }
  }

  console.log(`\nBackfill complete!`);
  console.log(`  Successfully backfilled: ${successCount} signals (closed positions only)`);
  console.log(`  Skipped: ${skipCount} signals (open positions or missing data)`);

  // Show summary by agent
  console.log(`\nSummary by agent:`);
  const agentSummary = db.prepare(`
    SELECT
      a.id,
      a.name,
      COUNT(*) as total_signals,
      SUM(CASE WHEN s.actual_return IS NOT NULL THEN 1 ELSE 0 END) as with_returns,
      AVG(CASE WHEN s.actual_return IS NOT NULL THEN s.actual_return ELSE NULL END) as avg_return
    FROM trading_agents a
    LEFT JOIN agent_signals s ON a.id = s.agent_id AND s.status = 'executed'
    GROUP BY a.id, a.name
    ORDER BY total_signals DESC
  `).all();

  for (const agent of agentSummary) {
    const coverage = agent.total_signals > 0
      ? ((agent.with_returns / agent.total_signals) * 100).toFixed(1)
      : '0.0';
    const avgReturn = agent.avg_return ? agent.avg_return.toFixed(2) : 'N/A';
    console.log(`  ${agent.name}: ${agent.with_returns}/${agent.total_signals} (${coverage}% coverage), Avg: ${avgReturn}%`);
  }

} catch (error) {
  console.error('Error during backfill:', error);
  process.exit(1);
} finally {
  db.close();
}
