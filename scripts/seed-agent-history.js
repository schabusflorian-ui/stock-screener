/**
 * Seed Script: Create 3 test agents with 6 months of trading history
 *
 * This script creates:
 * - 3 agents with different strategies (technical, fundamental, hybrid)
 * - 6 months of signals with realistic distribution
 * - Executed trades with P&L
 * - Paper trading account with positions
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/stocks.db');
const db = new Database(dbPath);

// Stock universe for testing (real stocks in the database)
const STOCK_UNIVERSE = [];

// Initialize stock universe from database
function initStockUniverse() {
  const stocks = db.prepare(`
    SELECT DISTINCT c.symbol, c.name, c.sector, dp.close as price
    FROM companies c
    JOIN daily_prices dp ON c.id = dp.company_id
    WHERE dp.date = (SELECT MAX(date) FROM daily_prices)
    AND dp.close > 5 AND dp.close < 500
    ORDER BY RANDOM()
    LIMIT 100
  `).all();

  STOCK_UNIVERSE.push(...stocks);
  console.log(`Loaded ${STOCK_UNIVERSE.length} stocks for testing`);
}

// Agent configurations
const AGENTS = [
  {
    name: 'Alpha Momentum Strategy',
    description: 'Technical momentum-based agent focusing on price trends and relative strength',
    strategy_type: 'technical',
    technical_weight: 0.4,
    sentiment_weight: 0.1,
    insider_weight: 0.05,
    fundamental_weight: 0.1,
    alternative_weight: 0.05,
    valuation_weight: 0.1,
    thirteenf_weight: 0.1,
    earnings_weight: 0.05,
    value_quality_weight: 0.05,
    min_confidence: 0.55,
    min_signal_score: 0.25,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    initial_capital: 100000,
    // Performance characteristics
    win_rate: 0.58,
    avg_win: 0.12,
    avg_loss: -0.08,
    signal_frequency: 8 // signals per month
  },
  {
    name: 'Value Hunter Strategy',
    description: 'Fundamental value-based agent targeting undervalued quality companies',
    strategy_type: 'fundamental',
    technical_weight: 0.1,
    sentiment_weight: 0.05,
    insider_weight: 0.15,
    fundamental_weight: 0.35,
    alternative_weight: 0.05,
    valuation_weight: 0.15,
    thirteenf_weight: 0.05,
    earnings_weight: 0.05,
    value_quality_weight: 0.05,
    min_confidence: 0.6,
    min_signal_score: 0.3,
    max_position_size: 0.1,
    max_sector_exposure: 0.3,
    initial_capital: 150000,
    win_rate: 0.52,
    avg_win: 0.18,
    avg_loss: -0.1,
    signal_frequency: 5
  },
  {
    name: 'Smart Money Follower',
    description: 'Hybrid strategy following institutional flows and insider activity',
    strategy_type: 'hybrid',
    technical_weight: 0.15,
    sentiment_weight: 0.1,
    insider_weight: 0.2,
    fundamental_weight: 0.15,
    alternative_weight: 0.05,
    valuation_weight: 0.1,
    thirteenf_weight: 0.2,
    earnings_weight: 0.05,
    value_quality_weight: 0,
    min_confidence: 0.55,
    min_signal_score: 0.28,
    max_position_size: 0.07,
    max_sector_exposure: 0.25,
    initial_capital: 200000,
    win_rate: 0.55,
    avg_win: 0.15,
    avg_loss: -0.09,
    signal_frequency: 6
  }
];

// Generate random date within range
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate realistic signal scores
function generateSignalScores(agentConfig, action) {
  const isPositive = action.includes('buy');
  const baseScore = isPositive ?
    0.3 + Math.random() * 0.5 :
    -(0.3 + Math.random() * 0.5);

  return {
    overall_score: baseScore,
    confidence: 0.5 + Math.random() * 0.4,
    raw_score: baseScore * (0.8 + Math.random() * 0.3)
  };
}

// Create agent in database
function createAgent(config) {
  const result = db.prepare(`
    INSERT INTO trading_agents (
      name, description, strategy_type,
      technical_weight, sentiment_weight, insider_weight,
      fundamental_weight, alternative_weight, valuation_weight,
      thirteenf_weight, earnings_weight, value_quality_weight,
      min_confidence, min_signal_score,
      max_position_size, max_sector_exposure,
      is_active, status, auto_execute
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      1, 'idle', 0
    )
  `).run(
    config.name, config.description, config.strategy_type,
    config.technical_weight, config.sentiment_weight, config.insider_weight,
    config.fundamental_weight, config.alternative_weight, config.valuation_weight,
    config.thirteenf_weight, config.earnings_weight, config.value_quality_weight,
    config.min_confidence, config.min_signal_score,
    config.max_position_size, config.max_sector_exposure
  );

  return result.lastInsertRowid;
}

// Create portfolio for agent
function createPortfolio(agentId, name, initialCapital) {
  // Create portfolio
  const portfolioResult = db.prepare(`
    INSERT INTO portfolios (name, description, initial_cash, current_cash, current_value, agent_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(`${name} Portfolio`, `Portfolio for ${name}`, initialCapital, initialCapital, initialCapital, agentId);

  const portfolioId = portfolioResult.lastInsertRowid;

  // Link to agent
  db.prepare(`
    INSERT INTO agent_portfolios (agent_id, portfolio_id, mode, initial_capital, is_active)
    VALUES (?, ?, 'paper', ?, 1)
  `).run(agentId, portfolioId, initialCapital);

  // Create paper account
  const accountName = `portfolio_${portfolioId}`;
  try {
    db.prepare(`
      INSERT INTO paper_accounts (name, initial_capital, cash_balance)
      VALUES (?, ?, ?)
    `).run(accountName, initialCapital, initialCapital);
  } catch (e) {
    // Account may already exist
  }

  return portfolioId;
}

// Generate signals for an agent
function generateSignals(agentId, config, portfolioId) {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const signals = [];
  const actions = ['strong_buy', 'buy', 'sell', 'strong_sell'];
  const statuses = ['executed', 'approved', 'rejected', 'expired', 'pending'];

  // Generate signals for each month
  let currentDate = new Date(sixMonthsAgo);
  let totalPnl = 0;
  let winCount = 0;
  let lossCount = 0;

  while (currentDate < now) {
    const signalsThisMonth = Math.floor(config.signal_frequency * (0.7 + Math.random() * 0.6));

    for (let i = 0; i < signalsThisMonth; i++) {
      const stock = STOCK_UNIVERSE[Math.floor(Math.random() * STOCK_UNIVERSE.length)];
      if (!stock) continue;

      // Determine action (weighted towards buys)
      const actionRoll = Math.random();
      let action;
      if (actionRoll < 0.35) action = 'strong_buy';
      else if (actionRoll < 0.65) action = 'buy';
      else if (actionRoll < 0.85) action = 'sell';
      else action = 'strong_sell';

      const scores = generateSignalScores(config, action);
      const signalDate = randomDate(currentDate, new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000));

      // Determine status based on how old the signal is
      const daysOld = (now - signalDate) / (24 * 60 * 60 * 1000);
      let status;
      let executedAt = null;
      let executedPrice = null;
      let executedShares = null;
      let exitDate = null;
      let exitPrice = null;
      let actualReturn = null;
      let holdingDays = null;

      if (daysOld > 7) {
        // Older signals are mostly executed or rejected
        const statusRoll = Math.random();
        if (statusRoll < 0.6) {
          status = 'executed';
          executedAt = new Date(signalDate.getTime() + Math.random() * 2 * 24 * 60 * 60 * 1000).toISOString();
          executedPrice = stock.price * (0.98 + Math.random() * 0.04);
          executedShares = Math.floor((config.initial_capital * config.max_position_size) / executedPrice);

          // Simulate exit for executed trades
          if (daysOld > 14) {
            holdingDays = Math.floor(5 + Math.random() * 30);
            exitDate = new Date(new Date(executedAt).getTime() + holdingDays * 24 * 60 * 60 * 1000).toISOString();

            // Determine if win or loss based on strategy win rate
            const isWin = Math.random() < config.win_rate;
            if (isWin) {
              actualReturn = config.avg_win * (0.5 + Math.random());
              winCount++;
            } else {
              actualReturn = config.avg_loss * (0.5 + Math.random());
              lossCount++;
            }
            exitPrice = executedPrice * (1 + actualReturn);
            totalPnl += (exitPrice - executedPrice) * executedShares;
          }
        } else if (statusRoll < 0.8) {
          status = 'rejected';
        } else {
          status = 'expired';
        }
      } else if (daysOld > 2) {
        // Recent signals are approved or pending
        status = Math.random() < 0.6 ? 'approved' : 'pending';
      } else {
        status = 'pending';
      }

      const positionSize = config.max_position_size * (0.5 + Math.random() * 0.5);
      const positionValue = config.initial_capital * positionSize;
      const suggestedShares = Math.floor(positionValue / stock.price);

      // Build signals JSON
      const signalsJson = JSON.stringify({
        technical: {
          score: (Math.random() - 0.3) * 0.8,
          confidence: 0.6 + Math.random() * 0.3,
          source: 'technical',
          signal: action,
          interpretation: `Technical analysis ${action.includes('buy') ? 'bullish' : 'bearish'} signal`
        },
        fundamental: {
          score: (Math.random() - 0.3) * 0.6,
          confidence: 0.5 + Math.random() * 0.4,
          source: 'fundamental',
          signal: action.includes('buy') ? 'buy' : 'sell'
        },
        thirteenF: {
          score: (Math.random() - 0.2) * 0.5,
          confidence: 0.4 + Math.random() * 0.5,
          source: 'thirteenF',
          signal: 'hold'
        }
      });

      signals.push({
        agent_id: agentId,
        symbol: stock.symbol,
        signal_date: signalDate.toISOString(),
        action,
        overall_score: scores.overall_score,
        confidence: scores.confidence,
        raw_score: scores.raw_score,
        signals: signalsJson,
        regime: Math.random() < 0.7 ? 'BULL' : (Math.random() < 0.5 ? 'BEAR' : 'NEUTRAL'),
        regime_confidence: 0.4 + Math.random() * 0.5,
        price_at_signal: stock.price,
        sector: stock.sector || 'Technology',
        position_size_pct: positionSize,
        position_value: positionValue,
        suggested_shares: suggestedShares,
        status,
        expires_at: new Date(signalDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        executed_at: executedAt,
        executed_price: executedPrice,
        executed_shares: executedShares,
        portfolio_id: portfolioId,
        outcome_tracked: exitDate ? 1 : 0,
        exit_date: exitDate,
        exit_price: exitPrice,
        actual_return: actualReturn,
        holding_period_days: holdingDays,
        reasoning: JSON.stringify([
          { factor: 'Primary Signal', direction: action.includes('buy') ? 'bullish' : 'bearish', weight: 0.3 },
          { factor: 'Market Regime', direction: 'supportive', weight: 0.1 }
        ])
      });
    }

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Insert all signals
  const insertStmt = db.prepare(`
    INSERT INTO agent_signals (
      agent_id, symbol, signal_date, action,
      overall_score, confidence, raw_score, signals,
      regime, regime_confidence, price_at_signal, sector,
      position_size_pct, position_value, suggested_shares,
      status, expires_at, executed_at, executed_price, executed_shares,
      portfolio_id, outcome_tracked, exit_date, exit_price,
      actual_return, holding_period_days, reasoning
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertMany = db.transaction((signals) => {
    for (const s of signals) {
      insertStmt.run(
        s.agent_id, s.symbol, s.signal_date, s.action,
        s.overall_score, s.confidence, s.raw_score, s.signals,
        s.regime, s.regime_confidence, s.price_at_signal, s.sector,
        s.position_size_pct, s.position_value, s.suggested_shares,
        s.status, s.expires_at, s.executed_at, s.executed_price, s.executed_shares,
        s.portfolio_id, s.outcome_tracked, s.exit_date, s.exit_price,
        s.actual_return, s.holding_period_days, s.reasoning
      );
    }
  });

  insertMany(signals);

  return {
    totalSignals: signals.length,
    executed: signals.filter(s => s.status === 'executed').length,
    pending: signals.filter(s => s.status === 'pending').length,
    approved: signals.filter(s => s.status === 'approved').length,
    totalPnl,
    winCount,
    lossCount,
    winRate: winCount / (winCount + lossCount) || 0
  };
}

// Create paper trades from executed signals
function createPaperTrades(agentId, portfolioId, config) {
  // Get executed signals for this agent
  const executedSignals = db.prepare(`
    SELECT * FROM agent_signals
    WHERE agent_id = ? AND status = 'executed' AND executed_price IS NOT NULL
    ORDER BY executed_at
  `).all(agentId);

  if (executedSignals.length === 0) return { trades: 0 };

  // Get paper account
  const accountName = `portfolio_${portfolioId}`;
  let account = db.prepare('SELECT * FROM paper_accounts WHERE name = ?').get(accountName);

  if (!account) {
    db.prepare(`
      INSERT INTO paper_accounts (name, initial_capital, cash_balance)
      VALUES (?, ?, ?)
    `).run(accountName, config.initial_capital, config.initial_capital);
    account = db.prepare('SELECT * FROM paper_accounts WHERE name = ?').get(accountName);
  }

  let tradesCreated = 0;
  let cashBalance = account.cash_balance;

  for (const signal of executedSignals) {
    const side = signal.action.includes('buy') ? 'BUY' : 'SELL';
    const quantity = signal.executed_shares || 10;
    const price = signal.executed_price;
    const commission = 0;
    const slippage = price * 0.001; // 0.1% slippage

    // Calculate realized P&L for sells
    let realizedPnl = null;
    if (side === 'SELL' && signal.exit_price) {
      realizedPnl = (signal.exit_price - price) * quantity;
    }

    try {
      db.prepare(`
        INSERT INTO paper_trades (
          account_id, order_id, symbol, side, quantity, price, commission, slippage, realized_pnl, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        account.id,
        `SEED-${Date.now()}-${tradesCreated}`,
        signal.symbol,
        side,
        quantity,
        price,
        commission,
        slippage,
        realizedPnl,
        signal.executed_at
      );

      tradesCreated++;

      // Update cash balance
      if (side === 'BUY') {
        cashBalance -= price * quantity + commission + slippage;
      } else {
        cashBalance += price * quantity - commission - slippage;
        if (realizedPnl) cashBalance += realizedPnl;
      }
    } catch (e) {
      // Ignore duplicate trades
    }
  }

  // Update account balance
  db.prepare('UPDATE paper_accounts SET cash_balance = ? WHERE id = ?').run(cashBalance, account.id);

  return { trades: tradesCreated, finalBalance: cashBalance };
}

// Log agent activity
function logActivity(agentId, portfolioId, type, message) {
  try {
    db.prepare(`
      INSERT INTO agent_activity_log (agent_id, portfolio_id, activity_type, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(agentId, portfolioId, type, message);
  } catch (e) {
    // Table might not exist
  }
}

// Main execution
function main() {
  console.log('Starting agent history seed...\n');

  // Initialize stock universe
  initStockUniverse();

  if (STOCK_UNIVERSE.length === 0) {
    console.error('No stocks found in database. Please ensure stock data is loaded.');
    process.exit(1);
  }

  const results = [];

  for (const config of AGENTS) {
    console.log(`\n Creating agent: ${config.name}`);
    console.log('='.repeat(50));

    // Create agent
    const agentId = createAgent(config);
    console.log(`  Agent ID: ${agentId}`);

    // Create portfolio
    const portfolioId = createPortfolio(agentId, config.name, config.initial_capital);
    console.log(`  Portfolio ID: ${portfolioId}`);

    // Generate signals
    const signalStats = generateSignals(agentId, config, portfolioId);
    console.log(`  Signals generated: ${signalStats.totalSignals}`);
    console.log(`    - Executed: ${signalStats.executed}`);
    console.log(`    - Pending: ${signalStats.pending}`);
    console.log(`    - Approved: ${signalStats.approved}`);
    console.log(`    - Win Rate: ${(signalStats.winRate * 100).toFixed(1)}%`);
    console.log(`    - Total P&L: $${signalStats.totalPnl.toFixed(2)}`);

    // Create paper trades
    const tradeStats = createPaperTrades(agentId, portfolioId, config);
    console.log(`  Paper trades created: ${tradeStats.trades}`);

    // Log activity
    logActivity(agentId, portfolioId, 'agent_created', `Seeded agent with 6 months of history`);

    results.push({
      name: config.name,
      agentId,
      portfolioId,
      signals: signalStats,
      trades: tradeStats
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('SEED COMPLETE');
  console.log('='.repeat(60));

  for (const r of results) {
    console.log(`\n${r.name}:`);
    console.log(`  Agent ID: ${r.agentId}`);
    console.log(`  Signals: ${r.signals.totalSignals} (${r.signals.pending} pending, ${r.signals.approved} approved)`);
    console.log(`  Win Rate: ${(r.signals.winRate * 100).toFixed(1)}%`);
    console.log(`  Total P&L: $${r.signals.totalPnl.toFixed(2)}`);
  }

  console.log('\nYou can now test the frontend with realistic agent data!');
}

main();
