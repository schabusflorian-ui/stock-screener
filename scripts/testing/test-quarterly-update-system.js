/**
 * Test Script: Quarterly Update System
 *
 * Tests all components of the quarterly update system:
 * 1. Database migration
 * 2. UpdateDetector service
 * 3. QuarterlyUpdater service
 * 4. API endpoints
 *
 * Run with: node test-quarterly-update-system.js
 */

const path = require('path');
const fs = require('fs');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   ${details}`);
  results.tests.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

function logSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log('='.repeat(60) + '\n');
}

// ============================================
// TEST 1: Database Migration
// ============================================
async function testDatabaseMigration() {
  logSection('TEST 1: Database Migration');

  const dbPath = path.join(__dirname, 'data', 'stocks.db');

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    logTest('Database file exists', false, `Not found at ${dbPath}`);
    return false;
  }
  logTest('Database file exists', true, dbPath);

  try {
    const { checkMigrationStatus, runMigration, rollbackMigration } = require('./src/database-migrations/add-update-tracking');

    // Check current status
    let status = checkMigrationStatus(dbPath);
    console.log('   Current migration status:', status);

    // If not migrated, run migration
    if (!status.migrated) {
      console.log('   Running migration...');
      const result = runMigration(dbPath);
      logTest('Migration runs successfully', result.success, `Created tables: ${result.tables.join(', ')}`);

      // Verify migration
      status = checkMigrationStatus(dbPath);
    }

    logTest('update_history table exists', status.hasUpdateHistory);
    logTest('company_data_freshness table exists', status.hasFreshness);

    // Test rollback (optional - commented out to preserve data)
    // console.log('   Testing rollback...');
    // rollbackMigration(dbPath);
    // const afterRollback = checkMigrationStatus(dbPath);
    // logTest('Rollback removes tables', !afterRollback.migrated);
    // Re-run migration after rollback test
    // runMigration(dbPath);

    return status.migrated;

  } catch (error) {
    logTest('Migration module loads', false, error.message);
    return false;
  }
}

// ============================================
// TEST 2: UpdateDetector Service
// ============================================
async function testUpdateDetector() {
  logSection('TEST 2: UpdateDetector Service');

  try {
    const db = require('./src/database').getDatabase();
    const UpdateDetector = require('./src/services/updateDetector');

    logTest('UpdateDetector module loads', true);

    const detector = new UpdateDetector(db);
    logTest('UpdateDetector instantiates', true);

    // Test getUpdateSummary
    const summary = detector.getUpdateSummary();
    console.log('   Update summary:', JSON.stringify(summary, null, 2));
    logTest('getUpdateSummary() returns data', summary !== null);
    logTest('Summary has totalCompanies', typeof summary.totalCompanies === 'number');

    // Test getCompaniesNeedingUpdate (may be empty)
    const needingUpdate = detector.getCompaniesNeedingUpdate();
    logTest('getCompaniesNeedingUpdate() returns array', Array.isArray(needingUpdate));
    console.log(`   Companies needing update: ${needingUpdate.length}`);

    // Test freshness initialization check
    const freshnessInitialized = summary.freshnessInitialized;
    console.log(`   Freshness tracking initialized: ${freshnessInitialized}`);

    if (!freshnessInitialized && summary.totalCompanies > 0) {
      console.log('   Initializing freshness tracking (this may take a minute)...');
      const initResult = await detector.initializeFreshnessTracking((progress) => {
        if (progress.processed % 50 === 0) {
          process.stdout.write(`\r   Progress: ${progress.processed}/${progress.total}`);
        }
      });
      console.log('');
      logTest('Freshness initialization succeeds', initResult.success);
      console.log(`   Initialized ${initResult.companiesProcessed} companies`);
    } else if (freshnessInitialized) {
      logTest('Freshness already initialized', true);
    }

    return true;

  } catch (error) {
    logTest('UpdateDetector tests', false, error.message);
    console.error(error.stack);
    return false;
  }
}

// ============================================
// TEST 3: QuarterlyUpdater Service
// ============================================
async function testQuarterlyUpdater() {
  logSection('TEST 3: QuarterlyUpdater Service');

  try {
    const db = require('./src/database').getDatabase();
    const QuarterlyUpdater = require('./src/services/quarterlyUpdater');

    logTest('QuarterlyUpdater module loads', true);

    const updater = new QuarterlyUpdater(db);
    logTest('QuarterlyUpdater instantiates', true);

    // Test getCurrentQuarter
    const currentQuarter = updater.getCurrentQuarter();
    console.log(`   Current quarter: ${currentQuarter}`);
    logTest('getCurrentQuarter() returns valid format', /^\d{4}q[1-4]$/.test(currentQuarter));

    // Test getNextQuarter
    const nextQuarter = updater.getNextQuarter();
    console.log(`   Next quarter: ${nextQuarter}`);
    logTest('getNextQuarter() returns valid format', /^\d{4}q[1-4]$/.test(nextQuarter));

    // Test getUpdateStatus
    const status = updater.getUpdateStatus();
    console.log('   Update status:', status.status);
    logTest('getUpdateStatus() returns status', status.status !== undefined);

    // Test getUpdateHistory
    const history = updater.getUpdateHistory(5);
    logTest('getUpdateHistory() returns array', Array.isArray(history));
    console.log(`   History entries: ${history.length}`);

    // Test checkBulkFileAvailable (network test)
    console.log(`   Checking if ${currentQuarter} bulk file is available...`);
    const isAvailable = await updater.checkBulkFileAvailable(currentQuarter);
    console.log(`   Bulk file available: ${isAvailable}`);
    logTest('checkBulkFileAvailable() works', typeof isAvailable === 'boolean');

    // Test detector integration
    const detectorSummary = updater.detector.getUpdateSummary();
    logTest('Detector integration works', detectorSummary !== null);

    return true;

  } catch (error) {
    logTest('QuarterlyUpdater tests', false, error.message);
    console.error(error.stack);
    return false;
  }
}

// ============================================
// TEST 4: API Routes (requires server)
// ============================================
async function testAPIRoutes() {
  logSection('TEST 4: API Routes');

  console.log('   Note: These tests require the server to be running.');
  console.log('   Start with: npm start (in another terminal)\n');

  const baseUrl = 'http://localhost:3000/api/updates';

  // Simple fetch wrapper
  async function apiCall(endpoint, method = 'GET', body = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(`${baseUrl}${endpoint}`, options);
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  // Test /status endpoint
  const statusResult = await apiCall('/status');
  if (statusResult.error && statusResult.error.includes('ECONNREFUSED')) {
    logTest('Server is running', false, 'Start server with: npm start');
    console.log('\n   Skipping remaining API tests - server not running');
    return false;
  }

  logTest('GET /status returns 200', statusResult.ok);
  if (statusResult.ok) {
    console.log('   Status response:', JSON.stringify(statusResult.data, null, 2).substring(0, 200) + '...');
    logTest('Status has updateInProgress field', 'updateInProgress' in statusResult.data);
    logTest('Status has availableQuarter field', 'availableQuarter' in statusResult.data);
    logTest('Status has dataFreshness field', 'dataFreshness' in statusResult.data);
  }

  // Test /progress endpoint
  const progressResult = await apiCall('/progress');
  logTest('GET /progress returns 200', progressResult.ok);
  if (progressResult.ok) {
    console.log('   Progress status:', progressResult.data.status);
  }

  // Test /history endpoint
  const historyResult = await apiCall('/history?limit=5');
  logTest('GET /history returns 200', historyResult.ok);
  if (historyResult.ok) {
    logTest('History is an array', Array.isArray(historyResult.data));
    console.log(`   History entries: ${historyResult.data.length}`);
  }

  // Test /quarters endpoint
  const quartersResult = await apiCall('/quarters');
  logTest('GET /quarters returns 200', quartersResult.ok);
  if (quartersResult.ok) {
    console.log(`   Current quarter: ${quartersResult.data.currentQuarter}`);
    console.log(`   Available quarters: ${quartersResult.data.quarters?.length || 0}`);
  }

  // Test /check-available endpoint
  const checkResult = await apiCall('/check-available', 'POST', { quarter: '2024q3' });
  logTest('POST /check-available returns 200', checkResult.ok);
  if (checkResult.ok) {
    console.log(`   Quarter 2024q3 available: ${checkResult.data.isAvailable}`);
  }

  // Note: Not testing /run endpoint to avoid actually running an update
  console.log('\n   Note: /run endpoint not tested to avoid triggering actual update');

  return true;
}

// ============================================
// TEST 5: Integration Test (Full Flow)
// ============================================
async function testIntegration() {
  logSection('TEST 5: Integration Test');

  try {
    const db = require('./src/database').getDatabase();
    const QuarterlyUpdater = require('./src/services/quarterlyUpdater');

    const updater = new QuarterlyUpdater(db);

    // Check if we have any companies
    const companyCount = db.prepare('SELECT COUNT(*) as count FROM companies WHERE cik IS NOT NULL').get();
    console.log(`   Companies with CIK: ${companyCount.count}`);

    if (companyCount.count === 0) {
      logTest('Integration test', false, 'No companies with CIK in database');
      return false;
    }

    // Check freshness status
    const summary = updater.detector.getUpdateSummary();
    console.log('   Freshness summary:');
    console.log(`     - Total companies: ${summary.totalCompanies}`);
    console.log(`     - Needing update: ${summary.needingUpdate}`);
    console.log(`     - Freshness initialized: ${summary.freshnessInitialized}`);

    // Check if we have existing data
    const lineItemCount = db.prepare('SELECT COUNT(*) as count FROM financial_line_items').get();
    console.log(`   Financial line items: ${lineItemCount.count}`);

    // Check latest filing dates
    const latestFiling = db.prepare(`
      SELECT MAX(filed_date) as latest FROM financial_line_items
    `).get();
    console.log(`   Latest filing date in DB: ${latestFiling.latest || 'none'}`);

    // Check update history
    const history = updater.getUpdateHistory(3);
    if (history.length > 0) {
      console.log('   Recent update history:');
      history.forEach(h => {
        console.log(`     - ${h.quarter}: ${h.status} (${h.records_added || 0} records)`);
      });
    } else {
      console.log('   No update history yet');
    }

    logTest('Integration data check complete', true);

    // Optionally run a dry-run check (no actual import)
    console.log('\n   Checking for available updates (dry run)...');
    const currentQuarter = updater.getCurrentQuarter();
    const isAvailable = await updater.checkBulkFileAvailable(currentQuarter);

    if (isAvailable) {
      console.log(`   ✅ ${currentQuarter} bulk file is available for import`);

      // Check if already imported
      const existingUpdate = db.prepare(`
        SELECT * FROM update_history
        WHERE quarter = ? AND status = 'completed'
      `).get(currentQuarter);

      if (existingUpdate) {
        console.log(`   ℹ️  ${currentQuarter} was already imported on ${existingUpdate.completed_at}`);
      } else {
        console.log(`   ℹ️  ${currentQuarter} has not been imported yet`);
      }
    } else {
      console.log(`   ⏳ ${currentQuarter} bulk file not yet available`);
    }

    return true;

  } catch (error) {
    logTest('Integration test', false, error.message);
    console.error(error.stack);
    return false;
  }
}

// ============================================
// TEST 6: File Structure Verification
// ============================================
function testFileStructure() {
  logSection('TEST 6: File Structure Verification');

  const requiredFiles = [
    'src/database-migrations/add-update-tracking.js',
    'src/services/updateDetector.js',
    'src/services/quarterlyUpdater.js',
    'src/api/routes/updates.js',
    'frontend/src/pages/UpdatesPage.js',
    'frontend/src/pages/UpdatesPage.css'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, file);
    const exists = fs.existsSync(fullPath);
    logTest(`File exists: ${file}`, exists);
  }

  // Check server.js has updates route
  const serverPath = path.join(__dirname, 'src/api/server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  logTest('server.js imports updates router', serverContent.includes("require('./routes/updates')"));
  logTest('server.js uses updates router', serverContent.includes("/api/updates"));

  // Check App.js has updates route
  const appPath = path.join(__dirname, 'frontend/src/App.js');
  const appContent = fs.readFileSync(appPath, 'utf8');
  logTest('App.js imports UpdatesPage', appContent.includes("import UpdatesPage"));
  logTest('App.js has /updates route', appContent.includes('path="/updates"'));

  // Check api.js has updatesAPI
  const apiPath = path.join(__dirname, 'frontend/src/services/api.js');
  const apiContent = fs.readFileSync(apiPath, 'utf8');
  logTest('api.js exports updatesAPI', apiContent.includes('export const updatesAPI'));

  return true;
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      QUARTERLY UPDATE SYSTEM - TEST SUITE                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // Run tests in sequence
  testFileStructure();
  await testDatabaseMigration();
  await testUpdateDetector();
  await testQuarterlyUpdater();
  await testAPIRoutes();
  await testIntegration();

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n   Total tests: ${results.passed + results.failed}`);
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⏱️  Time: ${elapsed}s\n`);

  if (results.failed > 0) {
    console.log('   Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.details}`);
    });
  }

  console.log('\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
