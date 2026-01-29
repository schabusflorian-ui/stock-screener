// test-price-bug.js
// Test to isolate the 2x price bug

const Database = require('better-sqlite3');
const db = new Database('./data/stocks.db');
const { ConfigurableStrategyAgent } = require('./src/services/agent/configurableStrategyAgent');

// Get JPM company
const jpm = db.prepare('SELECT * FROM companies WHERE symbol = ?').get('JPM');
console.log('JPM Company ID:', jpm.id);

// Get actual database price for 2024-01-02
const dbPrice = db.prepare(`
  SELECT close as price, date
  FROM daily_prices
  WHERE company_id = ? AND date <= ?
  ORDER BY date DESC
  LIMIT 1
`).get(jpm.id, '2024-01-02');

console.log('\nDatabase Price for JPM on 2024-01-02:');
console.log('  Date:', dbPrice.date);
console.log('  Close Price:', dbPrice.price);

// Create agent
const strategyId = 1;
const agent = new ConfigurableStrategyAgent(db, strategyId);
agent.setSimulationDate('2024-01-02');

// Get price through agent
const agentPriceData = agent._getPrice(jpm.id);
console.log('\nAgent Price for JPM on 2024-01-02:');
console.log('  Date:', agentPriceData?.date);
console.log('  Price:', agentPriceData?.price);

// Calculate ratio
if (agentPriceData && dbPrice) {
  const ratio = agentPriceData.price / dbPrice.price;
  console.log('\nRatio (agent / database):', ratio.toFixed(4));

  if (Math.abs(ratio - 1.9) < 0.1) {
    console.log('🔴 CONFIRMED: Agent is returning ~1.9x the database price!');
  } else if (Math.abs(ratio - 1.0) < 0.01) {
    console.log('✅ Prices match - bug is elsewhere');
  } else {
    console.log('⚠️  Unexpected ratio:', ratio);
  }
}

db.close();
