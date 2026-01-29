#!/usr/bin/env node
/**
 * Comprehensive test script for the Agents module
 * Tests database tables, API endpoints, and integrations
 */

const path = require('path');

// Set up database path
process.env.DATABASE_PATH = path.join(__dirname, 'data', 'stocks.db');

const database = require('./src/database');
const db = database.getDatabase();

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.errors.push({ name, error: error.message });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.errors.push({ name, error: error.message });
  }
}

console.log('='.repeat(60));
console.log('AGENTS MODULE COMPREHENSIVE TEST');
console.log('='.repeat(60));
console.log('');

// ============================================
// 1. DATABASE TABLES TEST
// ============================================
console.log('\n📊 1. DATABASE TABLES');
console.log('-'.repeat(40));

test('trading_agents table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trading_agents'").get();
  if (!result) throw new Error('Table not found');
});

test('agent_signals table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_signals'").get();
  if (!result) throw new Error('Table not found');
});

test('agent_portfolios table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_portfolios'").get();
  if (!result) throw new Error('Table not found');
});

test('agent_activity_log table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_activity_log'").get();
  if (!result) throw new Error('Table not found');
});

test('portfolios table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portfolios'").get();
  if (!result) throw new Error('Table not found');
});

test('portfolio_transactions table exists', () => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portfolio_transactions'").get();
  if (!result) throw new Error('Table not found');
});

// ============================================
// 2. AGENT SERVICE TEST
// ============================================
console.log('\n🤖 2. AGENT SERVICE');
console.log('-'.repeat(40));

const agentService = require('./src/services/agent/agentService');

test('agentService module loads', () => {
  if (!agentService) throw new Error('Module not loaded');
});

test('getAllAgents function exists', () => {
  if (typeof agentService.getAllAgents !== 'function') throw new Error('Function not found');
});

test('createAgent function exists', () => {
  if (typeof agentService.createAgent !== 'function') throw new Error('Function not found');
});

test('getAgent function exists', () => {
  if (typeof agentService.getAgent !== 'function') throw new Error('Function not found');
});

test('getAgentPortfolios function exists', () => {
  if (typeof agentService.getAgentPortfolios !== 'function') throw new Error('Function not found');
});

test('getSignals function exists', () => {
  if (typeof agentService.getSignals !== 'function') throw new Error('Function not found');
});

test('getActivityLog function exists', () => {
  if (typeof agentService.getActivityLog !== 'function') throw new Error('Function not found');
});

// Test getAllAgents works
test('getAllAgents returns array', () => {
  const agents = agentService.getAllAgents();
  if (!Array.isArray(agents)) throw new Error('Expected array');
});

// ============================================
// 3. CREATE AND TEST AGENT
// ============================================
console.log('\n🔧 3. AGENT CRUD OPERATIONS');
console.log('-'.repeat(40));

let testAgentId = null;

test('createAgent creates agent successfully', () => {
  const agent = agentService.createAgent({
    name: 'Test Agent ' + Date.now(),
    description: 'Test agent for automated testing',
    strategy_type: 'hybrid'
  });
  if (!agent || !agent.id) throw new Error('Agent not created');
  testAgentId = agent.id;
  console.log(`   Created agent ID: ${testAgentId}`);
});

test('getAgent retrieves created agent', () => {
  if (!testAgentId) throw new Error('No test agent');
  const agent = agentService.getAgent(testAgentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.id !== testAgentId) throw new Error('Wrong agent returned');
});

test('getAgentPortfolios works for agent with no portfolios', () => {
  if (!testAgentId) throw new Error('No test agent');
  const portfolios = agentService.getAgentPortfolios(testAgentId);
  if (!Array.isArray(portfolios)) throw new Error('Expected array');
});

test('getSignals works for agent with no signals', () => {
  if (!testAgentId) throw new Error('No test agent');
  const signals = agentService.getSignals(testAgentId);
  if (!Array.isArray(signals)) throw new Error('Expected array');
});

test('getActivityLog works for new agent', () => {
  if (!testAgentId) throw new Error('No test agent');
  const activity = agentService.getActivityLog(testAgentId);
  if (!Array.isArray(activity)) throw new Error('Expected array');
});

test('getAgentStatus works', () => {
  if (!testAgentId) throw new Error('No test agent');
  const status = agentService.getAgentStatus(testAgentId);
  if (!status) throw new Error('Status not returned');
});

test('updateAgent updates agent', () => {
  if (!testAgentId) throw new Error('No test agent');
  const updated = agentService.updateAgent(testAgentId, {
    description: 'Updated description'
  });
  if (!updated) throw new Error('Update failed');
});

test('getAgentConfig returns config', () => {
  if (!testAgentId) throw new Error('No test agent');
  const config = agentService.getAgentConfig(testAgentId);
  if (!config) throw new Error('Config not returned');
});

// ============================================
// 4. PORTFOLIO CREATION FOR AGENT
// ============================================
console.log('\n💼 4. PORTFOLIO OPERATIONS');
console.log('-'.repeat(40));

let testPortfolioId = null;

test('createPortfolioForAgent creates portfolio', () => {
  if (!testAgentId) throw new Error('No test agent');
  const result = agentService.createPortfolioForAgent(testAgentId, {
    name: 'Test Portfolio ' + Date.now(),
    mode: 'paper',
    initial_capital: 100000
  });
  if (!result || !result.portfolio_id) throw new Error('Portfolio not created');
  testPortfolioId = result.portfolio_id;
  console.log(`   Created portfolio ID: ${testPortfolioId}`);
});

test('getAgentPortfolios returns created portfolio', () => {
  if (!testAgentId) throw new Error('No test agent');
  const portfolios = agentService.getAgentPortfolios(testAgentId);
  if (!portfolios.length) throw new Error('No portfolios found');
  const found = portfolios.find(p => p.portfolio_id === testPortfolioId);
  if (!found) throw new Error('Created portfolio not in list');
});

// ============================================
// 5. PAPER TRADING ENGINE
// ============================================
console.log('\n📝 5. PAPER TRADING ENGINE');
console.log('-'.repeat(40));

let paperEngine = null;
let paperAccountId = null;

test('PaperTradingEngine loads', () => {
  const { PaperTradingEngine } = require('./src/services/trading/paperTrading');
  paperEngine = new PaperTradingEngine(db);
  if (!paperEngine) throw new Error('Engine not created');
});

test('Paper trading tables created', () => {
  const tables = ['paper_accounts', 'paper_positions', 'paper_orders', 'paper_trades', 'paper_snapshots'];
  for (const table of tables) {
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).get();
    if (!result) throw new Error(`Table ${table} not found`);
  }
});

test('createAccount creates paper account', () => {
  const account = paperEngine.createAccount('test_account_' + Date.now(), 50000);
  if (!account || !account.id) throw new Error('Account not created');
  paperAccountId = account.id;
  console.log(`   Created paper account ID: ${paperAccountId}`);
});

test('getAccountStatus returns status', () => {
  if (!paperAccountId) throw new Error('No paper account');
  const status = paperEngine.getAccountStatus(paperAccountId);
  if (!status) throw new Error('Status not returned');
  if (!status.summary) throw new Error('Summary missing');
  if (!status.positions) throw new Error('Positions missing');
});

test('getPositions returns empty array', () => {
  if (!paperAccountId) throw new Error('No paper account');
  const positions = paperEngine.getPositions(paperAccountId);
  if (!Array.isArray(positions)) throw new Error('Expected array');
});

test('getTrades returns empty array', () => {
  if (!paperAccountId) throw new Error('No paper account');
  const trades = paperEngine.getTrades(paperAccountId);
  if (!Array.isArray(trades)) throw new Error('Expected array');
});

test('getOrders returns empty array', () => {
  if (!paperAccountId) throw new Error('No paper account');
  const orders = paperEngine.getOrders(paperAccountId);
  if (!Array.isArray(orders)) throw new Error('Expected array');
});

// ============================================
// 6. SIGNAL COMBINER
// ============================================
console.log('\n🧠 6. ML SIGNAL COMBINER');
console.log('-'.repeat(40));

test('MLSignalCombiner loads', () => {
  const { MLSignalCombiner } = require('./src/services/ml/signalCombiner');
  const combiner = new MLSignalCombiner(db);
  if (!combiner) throw new Error('Combiner not created');
});

test('MLSignalCombiner getStatus works', () => {
  const { MLSignalCombiner } = require('./src/services/ml/signalCombiner');
  const combiner = new MLSignalCombiner(db);
  const status = combiner.getStatus();
  if (typeof status.modelsLoaded !== 'boolean') throw new Error('modelsLoaded should be boolean');
});

test('MLSignalCombiner isModelTrained works', () => {
  const { MLSignalCombiner } = require('./src/services/ml/signalCombiner');
  const combiner = new MLSignalCombiner(db);
  const trained = combiner.isModelTrained();
  if (typeof trained !== 'boolean') throw new Error('isModelTrained should return boolean');
});

// ============================================
// 7. API ROUTES STRUCTURE
// ============================================
console.log('\n🌐 7. API ROUTES');
console.log('-'.repeat(40));

test('agents router loads', () => {
  const router = require('./src/api/routes/agents');
  if (!router) throw new Error('Router not loaded');
});

test('paperTrading router loads', () => {
  const router = require('./src/api/routes/paperTrading');
  if (!router) throw new Error('Router not loaded');
});

test('validation router loads', () => {
  const router = require('./src/api/routes/validation');
  if (!router) throw new Error('Router not loaded');
});

// ============================================
// 8. CLEANUP
// ============================================
console.log('\n🧹 8. CLEANUP');
console.log('-'.repeat(40));

test('deleteAgent removes test agent', () => {
  if (!testAgentId) throw new Error('No test agent');
  const result = agentService.deleteAgent(testAgentId);
  // Verify it's deleted (soft delete - is_active = 0)
  const agent = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(testAgentId);
  if (agent && agent.is_active === 1) throw new Error('Agent not deleted');
});

test('Delete test paper account', () => {
  if (!paperAccountId) throw new Error('No paper account');
  db.prepare('DELETE FROM paper_snapshots WHERE account_id = ?').run(paperAccountId);
  db.prepare('DELETE FROM paper_trades WHERE account_id = ?').run(paperAccountId);
  db.prepare('DELETE FROM paper_orders WHERE account_id = ?').run(paperAccountId);
  db.prepare('DELETE FROM paper_positions WHERE account_id = ?').run(paperAccountId);
  db.prepare('DELETE FROM paper_accounts WHERE id = ?').run(paperAccountId);
});

// ============================================
// RESULTS
// ============================================
console.log('\n' + '='.repeat(60));
console.log('TEST RESULTS');
console.log('='.repeat(60));
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);

if (results.errors.length > 0) {
  console.log('\nFailed Tests:');
  results.errors.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
}

console.log('\n' + '='.repeat(60));

process.exit(results.failed > 0 ? 1 : 0);
