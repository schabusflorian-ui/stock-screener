/**
 * Demo Admin Account Setup Script
 *
 * Creates 10 diverse AI trading agents with simulated trading history
 * for demo purposes. Deletes all existing agents first.
 *
 * Usage: node scripts/setup-demo-agents.js
 */

const path = require('path');
const Database = require('better-sqlite3');

// Initialize database
const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

// Import agent service after DB is ready
const agentService = require('../src/services/agent/agentService');

// Demo agent configurations
const demoAgents = [
  {
    name: 'Buffett Value Hunter',
    description: 'Deep value investing inspired by Warren Buffett. Focuses on quality companies trading below intrinsic value.',
    strategy_type: 'fundamental',
    min_confidence: 0.75,
    min_signal_score: 0.55,
    fundamental_weight: 0.30,
    valuation_weight: 0.30,
    value_quality_weight: 0.25,
    insider_weight: 0.10,
    technical_weight: 0.05,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    simulatedDays: 30
  },
  {
    name: 'Momentum Surfer',
    description: 'Rides strong price trends using technical analysis and momentum indicators.',
    strategy_type: 'technical',
    min_confidence: 0.55,
    min_signal_score: 0.40,
    technical_weight: 0.40,
    earnings_weight: 0.25,
    sentiment_weight: 0.20,
    fundamental_weight: 0.10,
    valuation_weight: 0.05,
    max_position_size: 0.10,
    max_sector_exposure: 0.30,
    simulatedDays: 21
  },
  {
    name: 'Sentiment Scanner',
    description: 'Analyzes news, social media, and market sentiment to find trading opportunities.',
    strategy_type: 'sentiment',
    min_confidence: 0.55,
    min_signal_score: 0.42,
    sentiment_weight: 0.40,
    alternative_weight: 0.25,
    technical_weight: 0.20,
    earnings_weight: 0.10,
    fundamental_weight: 0.05,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    simulatedDays: 14
  },
  {
    name: 'Smart Money Tracker',
    description: 'Follows institutional investors and insider trading patterns.',
    strategy_type: 'hybrid',
    min_confidence: 0.60,
    min_signal_score: 0.45,
    insider_weight: 0.35,
    thirteenf_weight: 0.30,
    fundamental_weight: 0.20,
    valuation_weight: 0.10,
    technical_weight: 0.05,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    simulatedDays: 21
  },
  {
    name: 'Balanced Alpha',
    description: 'Diversified approach using all signal types with balanced weighting.',
    strategy_type: 'hybrid',
    min_confidence: 0.65,
    min_signal_score: 0.45,
    technical_weight: 0.12,
    sentiment_weight: 0.12,
    insider_weight: 0.12,
    fundamental_weight: 0.14,
    valuation_weight: 0.14,
    thirteenf_weight: 0.12,
    earnings_weight: 0.12,
    value_quality_weight: 0.12,
    max_position_size: 0.06,
    max_sector_exposure: 0.20,
    simulatedDays: 30
  },
  {
    name: 'Safe Haven Guardian',
    description: 'Ultra-conservative strategy prioritizing capital preservation.',
    strategy_type: 'fundamental',
    min_confidence: 0.80,
    min_signal_score: 0.60,
    fundamental_weight: 0.30,
    valuation_weight: 0.25,
    value_quality_weight: 0.25,
    insider_weight: 0.15,
    technical_weight: 0.05,
    max_position_size: 0.05,
    max_sector_exposure: 0.15,
    max_drawdown: 0.10,
    simulatedDays: 14
  },
  {
    name: 'Growth Accelerator',
    description: 'Aggressive growth strategy targeting high-momentum stocks.',
    strategy_type: 'technical',
    min_confidence: 0.50,
    min_signal_score: 0.35,
    technical_weight: 0.35,
    earnings_weight: 0.30,
    sentiment_weight: 0.20,
    fundamental_weight: 0.10,
    valuation_weight: 0.05,
    max_position_size: 0.12,
    max_sector_exposure: 0.35,
    simulatedDays: 7
  },
  {
    name: 'Dividend Compounder',
    description: 'Focuses on dividend-paying stocks with sustainable yields.',
    strategy_type: 'fundamental',
    min_confidence: 0.70,
    min_signal_score: 0.50,
    fundamental_weight: 0.35,
    value_quality_weight: 0.30,
    valuation_weight: 0.20,
    insider_weight: 0.10,
    technical_weight: 0.05,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    simulatedDays: 21
  },
  {
    name: 'Quant Factor Alpha',
    description: 'Systematic factor-based investing using quantitative models.',
    strategy_type: 'hybrid',
    min_confidence: 0.60,
    min_signal_score: 0.45,
    value_quality_weight: 0.25,
    technical_weight: 0.20,
    fundamental_weight: 0.20,
    earnings_weight: 0.15,
    sentiment_weight: 0.10,
    valuation_weight: 0.10,
    max_position_size: 0.07,
    max_sector_exposure: 0.25,
    use_factor_exposure: 1,
    simulatedDays: 14
  },
  {
    name: 'Contrarian Opportunist',
    description: 'Counter-trend strategy buying fear and selling greed.',
    strategy_type: 'sentiment',
    min_confidence: 0.65,
    min_signal_score: 0.50,
    sentiment_weight: 0.35,
    valuation_weight: 0.25,
    fundamental_weight: 0.20,
    insider_weight: 0.15,
    technical_weight: 0.05,
    max_position_size: 0.08,
    max_sector_exposure: 0.25,
    simulatedDays: 1
  }
];

// Sample stocks for signal generation (top market cap)
const sampleStocks = [
  { symbol: 'AAPL', companyId: 1 },
  { symbol: 'MSFT', companyId: 2 },
  { symbol: 'GOOGL', companyId: 3 },
  { symbol: 'AMZN', companyId: 4 },
  { symbol: 'NVDA', companyId: 5 },
  { symbol: 'META', companyId: 6 },
  { symbol: 'TSLA', companyId: 7 },
  { symbol: 'BRK.B', companyId: 8 },
  { symbol: 'JPM', companyId: 9 },
  { symbol: 'V', companyId: 10 },
  { symbol: 'JNJ', companyId: 11 },
  { symbol: 'WMT', companyId: 12 },
  { symbol: 'PG', companyId: 13 },
  { symbol: 'MA', companyId: 14 },
  { symbol: 'HD', companyId: 15 },
  { symbol: 'CVX', companyId: 16 },
  { symbol: 'MRK', companyId: 17 },
  { symbol: 'ABBV', companyId: 18 },
  { symbol: 'PEP', companyId: 19 },
  { symbol: 'KO', companyId: 20 },
  { symbol: 'COST', companyId: 21 },
  { symbol: 'AVGO', companyId: 22 },
  { symbol: 'TMO', companyId: 23 },
  { symbol: 'MCD', companyId: 24 },
  { symbol: 'CSCO', companyId: 25 },
  { symbol: 'ACN', companyId: 26 },
  { symbol: 'ABT', companyId: 27 },
  { symbol: 'DHR', companyId: 28 },
  { symbol: 'LIN', companyId: 29 },
  { symbol: 'CMCSA', companyId: 30 }
];

/**
 * Get actual company IDs from database
 */
function getCompanyIds() {
  const companies = db.prepare(`
    SELECT id, symbol FROM companies
    WHERE symbol IN (${sampleStocks.map(() => '?').join(',')})
  `).all(sampleStocks.map(s => s.symbol));

  const symbolToId = {};
  for (const c of companies) {
    symbolToId[c.symbol] = c.id;
  }
  return symbolToId;
}

/**
 * Generate simulated historical signals for an agent
 */
function simulateHistory(agentId, agentConfig, portfolioId, companyIds) {
  const daysBack = agentConfig.simulatedDays;
  const signalsPerDay = Math.floor(5 + Math.random() * 10); // 5-15 signals per day

  console.log(`    Generating ${daysBack} days of history (${signalsPerDay} signals/day)...`);

  let totalSignals = 0;
  let totalTrades = 0;

  for (let day = daysBack; day >= 1; day--) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - day);
    targetDate.setHours(9 + Math.floor(Math.random() * 7), Math.floor(Math.random() * 60), 0, 0);
    const dateStr = targetDate.toISOString().replace('T', ' ').substring(0, 19);

    // Generate signals for this day
    const daySignals = Math.floor(signalsPerDay * (0.5 + Math.random()));
    const shuffledStocks = [...sampleStocks].sort(() => Math.random() - 0.5).slice(0, daySignals);

    for (const stock of shuffledStocks) {
      const companyId = companyIds[stock.symbol];
      if (!companyId) continue;

      // Generate realistic scores based on agent config
      const baseScore = agentConfig.min_signal_score + Math.random() * (0.8 - agentConfig.min_signal_score);
      const baseConf = agentConfig.min_confidence + Math.random() * (0.95 - agentConfig.min_confidence);

      // Determine action based on score
      let action = 'hold';
      if (baseScore >= 0.55) action = 'strong_buy';
      else if (baseScore >= 0.40) action = 'buy';
      else if (baseScore <= -0.15) action = 'sell';
      else if (baseScore <= -0.40) action = 'strong_sell';

      // Skip hold signals
      if (action === 'hold') continue;

      // 70% chance signal was approved and executed
      const wasExecuted = Math.random() < 0.7;
      const status = wasExecuted ? 'executed' : (Math.random() < 0.5 ? 'approved' : 'expired');

      try {
        db.prepare(`
          INSERT INTO agent_signals (
            agent_id, symbol, company_id, signal_date, action,
            overall_score, confidence, raw_score,
            regime, price_at_signal, position_size_pct,
            risk_approved, status, portfolio_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          agentId,
          stock.symbol,
          companyId,
          dateStr,
          action,
          Math.round(baseScore * 1000) / 1000,
          Math.round(baseConf * 1000) / 1000,
          Math.round(baseScore * 1000) / 1000,
          ['BULL', 'SIDEWAYS', 'BEAR'][Math.floor(Math.random() * 3)],
          Math.round((100 + Math.random() * 400) * 100) / 100, // Random price 100-500
          Math.round(agentConfig.max_position_size * 0.8 * 1000) / 1000,
          1,
          status,
          portfolioId,
          dateStr
        );
        totalSignals++;

        if (wasExecuted) totalTrades++;
      } catch (e) {
        // Skip duplicate or constraint errors
      }
    }
  }

  // Update agent stats
  db.prepare(`
    UPDATE trading_agents
    SET total_signals_generated = ?,
        total_trades_executed = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(totalSignals, totalTrades, agentId);

  return { signals: totalSignals, trades: totalTrades };
}

/**
 * Main setup function
 */
async function setupDemoAgents() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           DEMO ADMIN ACCOUNT SETUP                             ║');
  console.log('║           10 Diverse AI Trading Agents                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Phase 1: Clean up existing agents
  console.log('PHASE 1: Cleaning up existing agents...');
  try {
    // Disable foreign keys for cleanup
    db.pragma('foreign_keys = OFF');

    // Get all existing agent IDs
    const existingAgents = db.prepare('SELECT id FROM trading_agents').all();
    console.log(`  Found ${existingAgents.length} existing agents to delete...`);

    // Delete in correct order for each agent
    const portfolioLinks = db.prepare('SELECT portfolio_id FROM agent_portfolios WHERE agent_id = ?');

    for (const agent of existingAgents) {
      // Get linked portfolios
      const portfolios = portfolioLinks.all(agent.id);

      // Delete activity logs
      db.prepare('DELETE FROM agent_activity_log WHERE agent_id = ?').run(agent.id);

      // Delete signals
      db.prepare('DELETE FROM agent_signals WHERE agent_id = ?').run(agent.id);

      // Delete portfolio links
      db.prepare('DELETE FROM agent_portfolios WHERE agent_id = ?').run(agent.id);

      // Delete portfolios and paper accounts
      for (const p of portfolios) {
        try {
          db.prepare('DELETE FROM paper_positions WHERE account_id IN (SELECT id FROM paper_accounts WHERE portfolio_id = ?)').run(p.portfolio_id);
          db.prepare('DELETE FROM paper_orders WHERE account_id IN (SELECT id FROM paper_accounts WHERE portfolio_id = ?)').run(p.portfolio_id);
          db.prepare('DELETE FROM paper_accounts WHERE portfolio_id = ?').run(p.portfolio_id);
          db.prepare('DELETE FROM portfolio_holdings WHERE portfolio_id = ?').run(p.portfolio_id);
          db.prepare('DELETE FROM portfolios WHERE id = ?').run(p.portfolio_id);
        } catch(e) {}
      }

      // Delete agent
      db.prepare('DELETE FROM trading_agents WHERE id = ?').run(agent.id);
    }

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    console.log('  [OK] All existing agents deleted\n');
  } catch (e) {
    console.log('  [WARN] Some cleanup failed:', e.message);
    db.pragma('foreign_keys = ON');
  }

  // Get company IDs for signal generation
  const companyIds = getCompanyIds();
  console.log(`  Found ${Object.keys(companyIds).length} companies for signal generation\n`);

  // Phase 2 & 3: Create agents with portfolios
  console.log('PHASE 2-3: Creating demo agents with portfolios...\n');
  const createdAgents = [];

  for (const config of demoAgents) {
    try {
      // Create agent
      const agent = agentService.createAgent({
        name: config.name,
        description: config.description,
        strategy_type: config.strategy_type,
        min_confidence: config.min_confidence,
        min_signal_score: config.min_signal_score,
        fundamental_weight: config.fundamental_weight,
        valuation_weight: config.valuation_weight,
        value_quality_weight: config.value_quality_weight,
        insider_weight: config.insider_weight,
        technical_weight: config.technical_weight,
        sentiment_weight: config.sentiment_weight,
        alternative_weight: config.alternative_weight,
        thirteenf_weight: config.thirteenf_weight,
        earnings_weight: config.earnings_weight,
        max_position_size: config.max_position_size,
        max_sector_exposure: config.max_sector_exposure,
        max_drawdown: config.max_drawdown,
        use_factor_exposure: config.use_factor_exposure
      });

      // Create portfolio for agent
      const portfolioResult = agentService.createPortfolioForAgent(agent.id, {
        name: `${config.name} Portfolio`,
        initialCash: 100000,
        portfolioType: 'paper'
      });

      // Get portfolio ID and update cash balance
      const portfolioLink = db.prepare(`
        SELECT portfolio_id FROM agent_portfolios WHERE agent_id = ? LIMIT 1
      `).get(agent.id);

      // Ensure portfolio has correct cash balance
      if (portfolioLink) {
        db.prepare('UPDATE portfolios SET current_cash = 100000 WHERE id = ?')
          .run(portfolioLink.portfolio_id);
      }

      createdAgents.push({
        id: agent.id,
        portfolioId: portfolioLink?.portfolio_id,
        ...config
      });

      console.log(`  [OK] ${config.name}`);
      console.log(`       Agent ID: ${agent.id} | Strategy: ${config.strategy_type}`);
      console.log(`       Thresholds: conf >= ${config.min_confidence}, score >= ${config.min_signal_score}`);
      console.log(`       History: ${config.simulatedDays} days`);
      console.log('');
    } catch (e) {
      console.log(`  [ERR] ${config.name}: ${e.message}\n`);
    }
  }

  console.log(`Created ${createdAgents.length}/10 agents\n`);

  // Phase 4: Simulate historical trading activity
  console.log('PHASE 4: Simulating historical trading activity...\n');

  let totalSignals = 0;
  let totalTrades = 0;

  for (const agent of createdAgents) {
    if (!agent.portfolioId) {
      console.log(`  [SKIP] ${agent.name}: No portfolio linked`);
      continue;
    }

    const result = simulateHistory(agent.id, agent, agent.portfolioId, companyIds);
    totalSignals += result.signals;
    totalTrades += result.trades;

    console.log(`  [OK] ${agent.name}: ${result.signals} signals, ${result.trades} trades\n`);
  }

  console.log(`Total: ${totalSignals} signals, ${totalTrades} trades simulated\n`);

  // Phase 5: Start all agents
  console.log('PHASE 5: Starting agents for continuous operation...\n');

  for (const agent of createdAgents) {
    try {
      agentService.startAgent(agent.id);
      console.log(`  [OK] ${agent.name} started`);
    } catch (e) {
      console.log(`  [ERR] ${agent.name}: ${e.message}`);
    }
  }

  // Final summary
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    SETUP COMPLETE                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Summary:');
  console.log(`  - Agents created: ${createdAgents.length}`);
  console.log(`  - Total signals: ${totalSignals}`);
  console.log(`  - Total trades: ${totalTrades}`);
  console.log(`  - All agents: RUNNING`);
  console.log('');

  // Verification query
  console.log('Verification:');
  const agents = db.prepare(`
    SELECT id, name, strategy_type, status, total_signals_generated, total_trades_executed
    FROM trading_agents WHERE is_active = 1
    ORDER BY id
  `).all();

  console.log('');
  console.log('ID  | Name                      | Type        | Status  | Signals | Trades');
  console.log('----|---------------------------|-------------|---------|---------|-------');
  for (const a of agents) {
    const name = a.name.substring(0, 25).padEnd(25);
    const type = a.strategy_type.padEnd(11);
    const status = a.status.padEnd(7);
    console.log(`${String(a.id).padStart(3)} | ${name} | ${type} | ${status} | ${String(a.total_signals_generated || 0).padStart(7)} | ${String(a.total_trades_executed || 0).padStart(5)}`);
  }
  console.log('');
}

// Run setup
setupDemoAgents().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
