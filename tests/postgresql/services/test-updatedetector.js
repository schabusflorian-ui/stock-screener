/**
 * Tests for UpdateDetector service with PostgreSQL async
 */

const path = require('path');
const fs = require('fs');
const { TestResults, testDatabaseConnection, testMethod, testMethodReturns } = require('../testUtils');

async function runUpdateDetectorTests() {
  const results = new TestResults('UpdateDetector');

  // Test database connection
  await testDatabaseConnection(results);

  // Load service
  const UpdateDetector = require('../../../src/services/updateDetector');
  const service = new UpdateDetector();

  // Test 1: Service instantiates without database parameter
  await testMethod(results, 'Service instantiates without db parameter', async () => {
    if (!service) {
      throw new Error('Service did not instantiate');
    }
    if (service.db !== undefined) {
      throw new Error('Service should not have db property');
    }
  });

  // Test 2: getUpdateSummary() returns summary object
  await testMethod(results, 'getUpdateSummary() returns summary', async () => {
    const summary = await service.getUpdateSummary();
    if (typeof summary !== 'object') {
      throw new Error('Expected object');
    }
    if (typeof summary.totalCompanies !== 'number') {
      throw new Error('Expected totalCompanies to be number');
    }
    if (typeof summary.freshnessInitialized !== 'boolean') {
      throw new Error('Expected freshnessInitialized to be boolean');
    }
  });

  // Test 3: getCompaniesNeedingUpdate() returns array
  await testMethod(results, 'getCompaniesNeedingUpdate() returns array', async () => {
    const companies = await service.getCompaniesNeedingUpdate();
    if (!Array.isArray(companies)) {
      throw new Error('Expected array');
    }
    // Array may be empty if no companies need updates
  });

  // Test 4: parseSubmissionsFile() handles missing file gracefully
  await testMethod(results, 'parseSubmissionsFile() handles missing file', async () => {
    const fakePath = '/tmp/nonexistent-file-12345.txt';
    try {
      await service.parseSubmissionsFile(fakePath);
      throw new Error('Should have thrown error for missing file');
    } catch (error) {
      if (!error.message.includes('not found')) {
        throw new Error(`Unexpected error message: ${error.message}`);
      }
    }
  });

  // Test 5: Create a test submissions file and parse it
  await testMethod(results, 'parseSubmissionsFile() parses valid file', async () => {
    const testFilePath = '/tmp/test-submissions.txt';
    const testData = [
      'CIK\tNAME\tFORM\tFILED\tPERIOD\tFY\tFP\tADSH',
      '0000320193\tAPPLE INC\t10-K\t20231103\t20230930\t2023\tFY\t0000320193-23-000106',
      '0000320193\tAPPLE INC\t10-Q\t20230804\t20230701\t2023\tQ3\t0000320193-23-000077',
      '0001018724\tAMAZON.COM INC\t10-K\t20230202\t20221231\t2022\tFY\t0001018724-23-000004'
    ].join('\n');

    fs.writeFileSync(testFilePath, testData);

    try {
      const filings = await service.parseSubmissionsFile(testFilePath);

      if (!(filings instanceof Map)) {
        throw new Error('Expected Map');
      }
      if (filings.size !== 2) {
        throw new Error(`Expected 2 companies, got ${filings.size}`);
      }

      // Check Apple's filings
      const apple = filings.get('0000320193');
      if (!apple) {
        throw new Error('Apple not found in filings');
      }
      if (apple.filings.length !== 2) {
        throw new Error(`Expected 2 Apple filings, got ${apple.filings.length}`);
      }
      if (apple.name !== 'APPLE INC') {
        throw new Error(`Expected APPLE INC, got ${apple.name}`);
      }

    } finally {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  // Test 6: checkCompanyForUpdates() handles invalid CIK
  await testMethod(results, 'checkCompanyForUpdates() handles invalid CIK', async () => {
    const result = await service.checkCompanyForUpdates('9999999999');
    if (result.needsUpdate !== false) {
      throw new Error('Expected needsUpdate to be false for invalid CIK');
    }
    if (!result.error) {
      throw new Error('Expected error message for invalid CIK');
    }
  });

  // Test 7: getCompanyFreshness() returns null for non-existent company
  await testMethod(results, 'getCompanyFreshness() returns null for invalid ID', async () => {
    const freshness = await service.getCompanyFreshness(999999999);
    if (freshness !== null) {
      throw new Error('Expected null for non-existent company');
    }
  });

  // Test 8: resetUpdateFlags() executes without error
  await testMethod(results, 'resetUpdateFlags() executes successfully', async () => {
    await service.resetUpdateFlags();
    // If it completes without throwing, it's successful
  });

  // Test 9: markCompanyUpdated() executes without error
  await testMethod(results, 'markCompanyUpdated() executes successfully', async () => {
    // Try to mark a company as updated (will silently succeed even if company doesn't exist)
    await service.markCompanyUpdated(1);
  });

  // Test 10: detectUpdatesFromBulkFile() with test file
  await testMethod(results, 'detectUpdatesFromBulkFile() processes file', async () => {
    const testFilePath = '/tmp/test-bulk-submissions.txt';
    const testData = [
      'CIK\tNAME\tFORM\tFILED\tPERIOD\tFY\tFP\tADSH',
      '0000320193\tAPPLE INC\t10-K\t20231103\t20230930\t2023\tFY\t0000320193-23-000106',
      '0000789019\tMICROSOFT CORP\t10-Q\t20230725\t20230630\t2023\tQ4\t0000789019-23-000045'
    ].join('\n');

    fs.writeFileSync(testFilePath, testData);

    try {
      const updates = await service.detectUpdatesFromBulkFile(testFilePath);

      if (!Array.isArray(updates)) {
        throw new Error('Expected array of updates');
      }
      // Array size depends on which companies exist in the database

    } finally {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  return results.summary();
}

// Run if called directly
if (require.main === module) {
  runUpdateDetectorTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runUpdateDetectorTests };
