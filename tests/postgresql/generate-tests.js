// tests/postgresql/generate-tests.js
/**
 * Auto-generate basic smoke tests for PostgreSQL-converted services
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate a basic test file for a service
 */
function generateTestFile(servicePath, serviceName, exportName, methods = []) {
  const testContent = `// tests/postgresql/services/test-${serviceName.toLowerCase()}.js
/**
 * PostgreSQL conversion tests for ${serviceName}
 */

const { ${exportName} } = require('../../../${servicePath}');
const {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function run${serviceName}Tests() {
  printTestHeader('${serviceName}');
  const results = new TestResults('${serviceName}');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service instantiation
  let service;
  await testMethod(results, 'Service instantiation', async () => {
    service = new ${exportName}();
    if (!service) {
      throw new Error('Failed to create service instance');
    }
  });

  if (!service) {
    console.log('\\n⚠️  Cannot continue tests - service instantiation failed');
    return results.summary();
  }

${methods.map((method, i) => `
  // Test ${i + 3}: ${method}
  await testMethod(results, '${method}() basic test', async () => {
    const result = await service.${method}();
    // Basic smoke test - just ensure it doesn't throw
  });`).join('\n')}

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  run${serviceName}Tests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { run${serviceName}Tests };
`;

  return testContent;
}

/**
 * Generate test for a singleton service (no constructor)
 */
function generateSingletonTestFile(servicePath, serviceName, methods = []) {
  const testContent = `// tests/postgresql/services/test-${serviceName.toLowerCase()}.js
/**
 * PostgreSQL conversion tests for ${serviceName}
 */

const service = require('../../../${servicePath}');
const {
  TestResults,
  testMethod,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function run${serviceName}Tests() {
  printTestHeader('${serviceName}');
  const results = new TestResults('${serviceName}');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service availability
  await testMethod(results, 'Service available', async () => {
    if (!service || typeof service !== 'object') {
      throw new Error('Service not properly exported');
    }
  });

${methods.map((method, i) => `
  // Test ${i + 3}: ${method}
  await testMethod(results, '${method}() basic test', async () => {
    if (typeof service.${method} === 'function') {
      const result = await service.${method}();
      // Basic smoke test - just ensure it doesn't throw
    }
  });`).join('\n')}

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  run${serviceName}Tests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { run${serviceName}Tests };
`;

  return testContent;
}

// Service configurations to generate
const SERVICES_TO_TEST = [
  // Portfolio services
  { path: 'src/services/portfolio/advancedAnalytics', name: 'AdvancedAnalytics', export: 'AdvancedAnalyticsService', methods: ['analyze'] },
  { path: 'src/services/portfolio/advancedKelly', name: 'AdvancedKelly', export: 'AdvancedKellyService', methods: ['calculateOptimalSize'] },
  { path: 'src/services/portfolio/alphaAnalytics', name: 'AlphaAnalytics', export: 'AlphaAnalyticsService', methods: ['analyze'] },
  { path: 'src/services/portfolio/backtestEngine', name: 'BacktestEngine', export: 'BacktestEngine', methods: ['run'] },
  { path: 'src/services/portfolio/correlationManager', name: 'CorrelationManager', export: 'CorrelationManager', methods: ['calculate'] },
  { path: 'src/services/portfolio/dividendProcessor', name: 'DividendProcessor', export: 'DividendProcessor', methods: ['process'] },
  { path: 'src/services/portfolio/exportService', name: 'ExportService', export: 'ExportService', methods: ['export'] },
  { path: 'src/services/portfolio/hedgeOptimizer', name: 'HedgeOptimizer', export: 'HedgeOptimizer', methods: ['optimize'] },
  { path: 'src/services/portfolio/holdingsEngine', name: 'HoldingsEngine', export: 'HoldingsEngine', methods: ['getHoldings'] },
];

if (require.main === module) {
  const outputDir = path.join(__dirname, 'services');

  for (const svc of SERVICES_TO_TEST) {
    const fileName = `test-${svc.name.toLowerCase()}.js`;
    const filePath = path.join(outputDir, fileName);

    const content = generateTestFile(svc.path, svc.name, svc.export, svc.methods);

    fs.writeFileSync(filePath, content);
    console.log(`✓ Generated ${fileName}`);
  }

  console.log(`\n✅ Generated ${SERVICES_TO_TEST.length} test files`);
}

module.exports = { generateTestFile, generateSingletonTestFile };
