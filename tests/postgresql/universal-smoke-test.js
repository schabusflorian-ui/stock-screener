// tests/postgresql/universal-smoke-test.js
/**
 * Universal smoke test for all PostgreSQL-converted services
 * Tests service instantiation and basic database connectivity
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TestResults, testDatabaseConnection, colors } = require('./testUtils');

// Get all services that use getDatabaseAsync
function getAllConvertedServices() {
  try {
    const cmd = 'grep -r "getDatabaseAsync" src/services --include="*.js" | cut -d: -f1 | sort -u';
    const output = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (err) {
    console.error('Error finding converted services:', err.message);
    return [];
  }
}

async function testService(servicePath) {
  const serviceName = path.basename(servicePath, '.js');
  const results = new TestResults(serviceName);

  // Test 1: File exists and is readable
  try {
    if (!fs.existsSync(servicePath)) {
      results.fail('File exists', new Error('Service file not found'));
      return results;
    }
    results.pass('File exists');
  } catch (err) {
    results.fail('File exists', err);
    return results;
  }

  // Test 2: Service can be required
  let serviceModule;
  try {
    serviceModule = require(path.resolve(servicePath));
    results.pass('Module loads');
  } catch (err) {
    results.fail('Module loads', err);
    return results;
  }

  // Test 3: Service exports something
  if (!serviceModule || (typeof serviceModule !== 'object' && typeof serviceModule !== 'function')) {
    results.fail('Exports valid', new Error('No valid exports found'));
    return results;
  }
  results.pass('Exports valid');

  // Test 4: Check for common async methods
  const asyncMethodsFound = [];
  const checkForAsyncMethods = (obj) => {
    if (!obj) return;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'function' && obj[key].constructor.name === 'AsyncFunction') {
        asyncMethodsFound.push(key);
      }
    }
  };

  if (typeof serviceModule === 'function') {
    // Class export
    try {
      const instance = new serviceModule();
      checkForAsyncMethods(instance);
      if (asyncMethodsFound.length > 0) {
        results.pass(`Found ${asyncMethodsFound.length} async methods`);
      }
    } catch (err) {
      // Might require parameters
      checkForAsyncMethods(serviceModule.prototype);
      if (asyncMethodsFound.length > 0) {
        results.pass(`Found ${asyncMethodsFound.length} async methods`);
      }
    }
  } else {
    // Object/singleton export
    checkForAsyncMethods(serviceModule);
    if (asyncMethodsFound.length > 0) {
      results.pass(`Found ${asyncMethodsFound.length} async methods`);
    }
  }

  return results;
}

async function runUniversalSmokeTests() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.bright}PostgreSQL Conversion - Universal Smoke Tests${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  // First test database connection
  console.log(`${colors.cyan}Testing database connection...${colors.reset}`);
  const dbResults = new TestResults('Database');
  await testDatabaseConnection(dbResults);

  if (dbResults.tests.some(t => t.status === 'fail')) {
    console.log(`\n${colors.red}✗ Database connection failed - cannot continue${colors.reset}\n`);
    return { success: false };
  }

  console.log(`\n${colors.cyan}Finding all PostgreSQL-converted services...${colors.reset}`);
  const services = getAllConvertedServices();
  console.log(`${colors.green}✓${colors.reset} Found ${services.length} services\n`);

  const results = {
    total: services.length,
    passed: 0,
    failed: 0,
    services: []
  };

  const startTime = Date.now();

  for (const servicePath of services) {
    const serviceName = path.basename(servicePath, '.js');
    const serviceResults = await testService(servicePath);

    const passed = serviceResults.tests.filter(t => t.status === 'pass').length;
    const failed = serviceResults.tests.filter(t => t.status === 'fail').length;

    if (failed === 0) {
      results.passed++;
      console.log(`  ${colors.green}✓${colors.reset} ${serviceName}`);
    } else {
      results.failed++;
      console.log(`  ${colors.red}✗${colors.reset} ${serviceName} (${failed} failures)`);
    }

    results.services.push({
      path: servicePath,
      name: serviceName,
      passed,
      failed,
      success: failed === 0
    });
  }

  const duration = Date.now() - startTime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.bright}SMOKE TEST SUMMARY${colors.reset}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`${colors.bright}Total Services:${colors.reset}  ${results.total}`);
  console.log(`${colors.green}Passed:${colors.reset}          ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}          ${results.failed}`);
  console.log(`${colors.bright}Pass Rate:${colors.reset}       ${Math.round(results.passed / results.total * 100)}%`);
  console.log(`${colors.bright}Duration:${colors.reset}        ${duration}ms`);
  console.log(`${'='.repeat(70)}\n`);

  if (results.failed > 0) {
    console.log(`${colors.yellow}Failed services:${colors.reset}`);
    results.services
      .filter(s => !s.success)
      .forEach(s => console.log(`  - ${s.name} (${s.path})`));
    console.log();
  }

  return {
    success: results.failed === 0,
    results
  };
}

// Run if executed directly
if (require.main === module) {
  runUniversalSmokeTests()
    .then(({ success }) => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Smoke test error:', err);
      process.exit(1);
    });
}

module.exports = { runUniversalSmokeTests, testService };
