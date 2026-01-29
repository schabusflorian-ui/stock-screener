// create-test-portfolio.js
// Creates a test portfolio with holdings designed to show fat-tail distribution warnings

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = new Database(dbPath);

async function createTestPortfolio() {
  try {
    // Get company IDs for high-volatility stocks
    const companies = {
      TSLA: db.prepare('SELECT id FROM companies WHERE symbol = ?').get('TSLA'),
      NVDA: db.prepare('SELECT id FROM companies WHERE symbol = ?').get('NVDA'),
      META: db.prepare('SELECT id FROM companies WHERE symbol = ?').get('META'),
      COIN: db.prepare('SELECT id FROM companies WHERE symbol = ?').get('COIN'),
      SHOP: db.prepare('SELECT id FROM companies WHERE symbol = ?').get('SHOP')
    };

    console.log('Found companies:', Object.entries(companies).filter(([k,v]) => v).map(([k,v]) => `${k}:${v.id}`).join(', '));

    // Create portfolio
    const portfolioResult = db.prepare(`
      INSERT INTO portfolios (name, description, initial_cash, initial_date, current_cash, portfolio_type, created_at)
      VALUES (?, ?, ?, date('now', '-90 days'), ?, 'manual', datetime('now'))
    `).run(
      'Fat Tail Test Portfolio',
      'Test portfolio designed to demonstrate heavy-tailed distribution warnings with high-volatility tech stocks',
      100000,
      5000
    );

    const portfolioId = portfolioResult.lastInsertRowid;
    console.log(`✅ Created portfolio with ID: ${portfolioId}`);

    // Add high-volatility holdings that typically show fat-tailed distributions
    const holdings = [
      { symbol: 'TSLA', companyId: companies.TSLA?.id, shares: 50, avgCost: 250.00 },
      { symbol: 'NVDA', companyId: companies.NVDA?.id, shares: 30, avgCost: 450.00 },
      { symbol: 'META', companyId: companies.META?.id, shares: 40, avgCost: 320.00 },
      { symbol: 'COIN', companyId: companies.COIN?.id, shares: 100, avgCost: 180.00 },
      { symbol: 'SHOP', companyId: companies.SHOP?.id, shares: 25, avgCost: 600.00 }
    ];

    const insertStmt = db.prepare(`
      INSERT INTO portfolio_positions (portfolio_id, company_id, shares, average_cost, first_bought_at)
      VALUES (?, ?, ?, ?, date('now', '-90 days'))
    `);

    holdings.forEach(holding => {
      if (holding.companyId) {
        insertStmt.run(portfolioId, holding.companyId, holding.shares, holding.avgCost);
        console.log(`  ✓ Added ${holding.shares} shares of ${holding.symbol} (company_id: ${holding.companyId})`);
      } else {
        console.log(`  ⚠ Skipped ${holding.symbol} - company not found in database`);
      }
    });

    console.log('\n📊 Test Portfolio Created Successfully!');
    console.log('━'.repeat(60));
    console.log(`Portfolio ID: ${portfolioId}`);
    console.log('Portfolio Name: Fat Tail Test Portfolio');
    console.log('Initial Value: $100,000');
    console.log('\nHoldings:');
    holdings.forEach(h => {
      if (h.companyId) {
        console.log(`  • ${h.symbol}: ${h.shares} shares @ $${h.avgCost}`);
      }
    });
    console.log('\n🧪 Testing Instructions:');
    console.log('━'.repeat(60));
    console.log('1. Navigate to: http://localhost:3001/portfolios/' + portfolioId);
    console.log('2. Click on "Risk Analysis" tab');
    console.log('3. Click on "Monte Carlo" sub-tab');
    console.log('4. Set configuration:');
    console.log('   - Distribution: Student\'s t (or Auto-fit)');
    console.log('   - Return Model: Any (Statistical, Parametric, or Forecasted)');
    console.log('   - Simulation Count: 10,000');
    console.log('   - Time Horizon: 10 years');
    console.log('5. Click "Run Simulation"');
    console.log('\n✨ Expected Results:');
    console.log('   - Kurtosis > 3.5 (fat tails detected)');
    console.log('   - FatTailWarningBanner will appear at top');
    console.log('   - TalebRiskDashboard will show risk comparison');
    console.log('   - DistributionComparisonChart will visualize the difference');
    console.log('━'.repeat(60));

    return portfolioId;
  } catch (err) {
    console.error('❌ Error creating test portfolio:', err);
    throw err;
  }
}

// Run it
createTestPortfolio()
  .then(portfolioId => {
    console.log('\n✅ Setup complete! Portfolio ID:', portfolioId);
    db.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Setup failed:', err);
    db.close();
    process.exit(1);
  });
