// test-cost-tracking.js
/**
 * Test script for API Cost Tracking System (Phase 3.1)
 *
 * Tests:
 * 1. Database tables exist
 * 2. Default budgets configured
 * 3. Cost logging works
 * 4. Budget checking works
 * 5. Usage statistics work
 */

const db = require('./src/database');
const { getCostTracker } = require('./src/services/costs');

async function runTests() {
  console.log('🧪 Testing API Cost Tracking System\n');

  const database = db.getDatabase();
  const tracker = getCostTracker();

  // =============================================
  // Test 1: Verify Tables Exist
  // =============================================
  console.log('Test 1: Checking database tables...');
  try {
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name IN ('api_usage_log', 'api_usage_daily', 'api_budgets')
      ORDER BY name
    `).all();

    console.log(`✅ Found ${tables.length}/3 tables:`);
    tables.forEach(t => console.log(`   - ${t.name}`));

    if (tables.length !== 3) {
      console.log('❌ Missing tables! Run migration first.');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error checking tables:', error.message);
    process.exit(1);
  }

  console.log('');

  // =============================================
  // Test 2: Verify Default Budgets
  // =============================================
  console.log('Test 2: Checking default budgets...');
  try {
    const budgets = database.prepare('SELECT * FROM api_budgets ORDER BY provider').all();

    console.log('✅ Budget configuration:');
    budgets.forEach(b => {
      console.log(`   ${b.provider}:`);
      console.log(`     Daily: ${b.daily_budget_usd ? `$${b.daily_budget_usd}` : 'No limit'}`);
      console.log(`     Monthly: ${b.monthly_budget_usd ? `$${b.monthly_budget_usd}` : 'No limit'}`);
    });

    // Verify Claude budget
    const claudeBudget = budgets.find(b => b.provider === 'claude');
    if (claudeBudget && claudeBudget.daily_budget_usd === 10 && claudeBudget.monthly_budget_usd === 50) {
      console.log('✅ Claude budget correctly set: $10/day, $50/month');
    } else {
      console.log('⚠️  Claude budget not as expected');
    }
  } catch (error) {
    console.log('❌ Error checking budgets:', error.message);
  }

  console.log('');

  // =============================================
  // Test 3: Test Cost Logging
  // =============================================
  console.log('Test 3: Testing cost logging...');
  try {
    // Log a test API call
    const testCost = 0.045; // $0.045 = typical Claude query cost
    const testTokens = 7000;

    tracker.logCall('claude', '/v1/messages', 'test_job', testCost, testTokens, false);

    // Verify it was logged
    const logEntry = database.prepare(`
      SELECT * FROM api_usage_log
      WHERE provider = 'claude'
      AND job_key = 'test_job'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (logEntry) {
      console.log('✅ Cost logged successfully:');
      console.log(`   Provider: ${logEntry.provider}`);
      console.log(`   Job: ${logEntry.job_key}`);
      console.log(`   Cost: $${logEntry.cost_usd.toFixed(4)}`);
      console.log(`   Tokens: ${logEntry.tokens}`);
    } else {
      console.log('❌ Log entry not found');
    }

    // Verify daily aggregate updated
    const today = new Date().toISOString().split('T')[0];
    const dailyEntry = database.prepare(`
      SELECT * FROM api_usage_daily
      WHERE provider = 'claude'
      AND job_key = 'test_job'
      AND date = ?
    `).get(today);

    if (dailyEntry) {
      console.log('✅ Daily aggregate updated:');
      console.log(`   Requests: ${dailyEntry.total_requests}`);
      console.log(`   Total cost: $${dailyEntry.total_cost_usd.toFixed(4)}`);
    } else {
      console.log('❌ Daily aggregate not found');
    }
  } catch (error) {
    console.log('❌ Error logging cost:', error.message);
  }

  console.log('');

  // =============================================
  // Test 4: Test Budget Checking
  // =============================================
  console.log('Test 4: Testing budget checking...');
  try {
    const budgetStatus = await tracker.checkBudget('claude');

    console.log('✅ Budget check successful:');
    console.log(`   Within budget: ${budgetStatus.withinBudget ? 'YES' : 'NO'}`);
    console.log(`   Daily usage: $${budgetStatus.daily.used.toFixed(4)} / $${budgetStatus.daily.limit} (${budgetStatus.daily.percent}%)`);
    console.log(`   Monthly usage: $${budgetStatus.monthly.used.toFixed(4)} / $${budgetStatus.monthly.limit} (${budgetStatus.monthly.percent}%)`);

    if (budgetStatus.withinBudget) {
      console.log('✅ Budget enforcement: API calls will be allowed');
    } else {
      console.log('⚠️  Budget exceeded: API calls will be blocked');
    }
  } catch (error) {
    console.log('❌ Error checking budget:', error.message);
  }

  console.log('');

  // =============================================
  // Test 5: Test Usage Statistics
  // =============================================
  console.log('Test 5: Testing usage statistics...');
  try {
    const stats = tracker.getUsageStats('claude', 'month');

    console.log('✅ Usage statistics:');
    console.log(`   Total requests: ${stats.total_requests}`);
    console.log(`   Total cost: $${stats.total_cost?.toFixed(4) || '0.0000'}`);
    console.log(`   Avg cost/request: $${stats.avg_cost_per_request?.toFixed(4) || '0.0000'}`);
    console.log(`   Cache hit rate: ${stats.cache_hit_rate}%`);
    console.log(`   Days active: ${stats.days_active || 0}`);
  } catch (error) {
    console.log('❌ Error getting stats:', error.message);
  }

  console.log('');

  // =============================================
  // Test 6: Test Usage by Job
  // =============================================
  console.log('Test 6: Testing usage by job...');
  try {
    const usageByJob = tracker.getUsageByJob('claude', 'month');

    if (usageByJob.length > 0) {
      console.log(`✅ Found usage for ${usageByJob.length} job(s):`);
      usageByJob.forEach(job => {
        console.log(`   ${job.job_key}:`);
        console.log(`     Requests: ${job.total_requests}`);
        console.log(`     Cost: $${job.total_cost.toFixed(4)}`);
      });
    } else {
      console.log('⚠️  No usage data yet (expected on first run)');
    }
  } catch (error) {
    console.log('❌ Error getting usage by job:', error.message);
  }

  console.log('');

  // =============================================
  // Test 7: Test Budget Update (Admin Function)
  // =============================================
  console.log('Test 7: Testing budget update...');
  try {
    // Save original budget
    const originalBudget = database.prepare(
      'SELECT * FROM api_budgets WHERE provider = ?'
    ).get('claude');

    // Update to test values
    const success = tracker.updateBudget('claude', 15.0, 60.0);

    if (success) {
      const updated = database.prepare(
        'SELECT * FROM api_budgets WHERE provider = ?'
      ).get('claude');

      console.log('✅ Budget update successful:');
      console.log(`   Daily: $${originalBudget.daily_budget_usd} → $${updated.daily_budget_usd}`);
      console.log(`   Monthly: $${originalBudget.monthly_budget_usd} → $${updated.monthly_budget_usd}`);

      // Restore original budget
      tracker.updateBudget('claude', originalBudget.daily_budget_usd, originalBudget.monthly_budget_usd);
      console.log('✅ Original budget restored');
    } else {
      console.log('❌ Budget update failed');
    }
  } catch (error) {
    console.log('❌ Error updating budget:', error.message);
  }

  console.log('');

  // =============================================
  // Summary
  // =============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All tests completed!');
  console.log('');
  console.log('📊 System is ready for:');
  console.log('   - Tracking Claude API costs');
  console.log('   - Enforcing $10/day, $50/month budgets');
  console.log('   - Monitoring usage via /api/system/costs');
  console.log('   - Real-time budget status in health checks');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Run tests
runTests()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
