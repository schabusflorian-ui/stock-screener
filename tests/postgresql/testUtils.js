// tests/postgresql/testUtils.js
/**
 * Shared utilities for PostgreSQL conversion tests
 */

const { getDatabaseAsync } = require('../../src/database');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test result tracking
class TestResults {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.tests = [];
    this.startTime = Date.now();
  }

  pass(testName, details = '') {
    this.tests.push({ name: testName, status: 'pass', details });
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    if (details) console.log(`    ${colors.cyan}${details}${colors.reset}`);
  }

  fail(testName, error) {
    this.tests.push({ name: testName, status: 'fail', error: error.message, stack: error.stack });
    console.log(`  ${colors.red}✗${colors.reset} ${testName}`);
    console.log(`    ${colors.red}Error: ${error.message}${colors.reset}`);
    if (process.env.DEBUG) {
      console.log(`    ${colors.red}${error.stack}${colors.reset}`);
    }
  }

  skip(testName, reason) {
    this.tests.push({ name: testName, status: 'skip', reason });
    console.log(`  ${colors.yellow}⊘${colors.reset} ${testName} (${reason})`);
  }

  summary() {
    const duration = Date.now() - this.startTime;
    const passed = this.tests.filter(t => t.status === 'pass').length;
    const failed = this.tests.filter(t => t.status === 'fail').length;
    const skipped = this.tests.filter(t => t.status === 'skip').length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${colors.bright}${this.serviceName} Test Summary${colors.reset}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Total:   ${this.tests.length}`);
    console.log(`  ${colors.green}Passed:  ${passed}${colors.reset}`);
    console.log(`  ${colors.red}Failed:  ${failed}${colors.reset}`);
    console.log(`  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      service: this.serviceName,
      total: this.tests.length,
      passed,
      failed,
      skipped,
      duration,
      success: failed === 0
    };
  }
}

/**
 * Test a service method with error handling
 */
async function testMethod(results, testName, fn) {
  try {
    await fn();
    results.pass(testName);
    return true;
  } catch (error) {
    results.fail(testName, error);
    return false;
  }
}

/**
 * Test that a method returns expected data structure
 */
async function testMethodReturns(results, testName, fn, validator) {
  try {
    const result = await fn();
    if (validator(result)) {
      results.pass(testName, `Returned: ${JSON.stringify(result).substring(0, 100)}...`);
      return true;
    } else {
      throw new Error('Validator failed: result does not match expected structure');
    }
  } catch (error) {
    results.fail(testName, error);
    return false;
  }
}

/**
 * Test database connectivity
 */
async function testDatabaseConnection(results) {
  return testMethod(results, 'Database Connection', async () => {
    const db = await getDatabaseAsync();
    if (!db) throw new Error('Database is null');
    if (!db.query) throw new Error('Database missing query method');

    const result = await db.query('SELECT 1 as test');
    if (!result.rows || result.rows[0]?.test !== 1) {
      throw new Error('Test query failed');
    }
  });
}

/**
 * Test SQL parameter binding (most common issue)
 */
async function testSQLParameterBinding(results, testName, sql, params, expectedRowCount = null) {
  return testMethod(results, testName, async () => {
    const db = await getDatabaseAsync();

    // Count $N placeholders in SQL
    const placeholderCount = (sql.match(/\$\d+/g) || []).length;
    const paramCount = params ? params.length : 0;

    if (placeholderCount !== paramCount) {
      throw new Error(
        `Parameter mismatch: SQL has ${placeholderCount} placeholders but ${paramCount} params provided`
      );
    }

    const result = await db.query(sql, params);

    if (expectedRowCount !== null && result.rows.length !== expectedRowCount) {
      throw new Error(
        `Expected ${expectedRowCount} rows but got ${result.rows.length}`
      );
    }

    if (process.env.DEBUG) {
      console.log(`    SQL: ${sql.substring(0, 100)}...`);
      console.log(`    Params: ${JSON.stringify(params)}`);
      console.log(`    Rows: ${result.rows.length}`);
    }
  });
}

/**
 * Test boolean conversion (true/false vs 1/0)
 */
async function testBooleanHandling(results, tableName, booleanColumn) {
  return testMethod(results, `Boolean Handling (${tableName}.${booleanColumn})`, async () => {
    const db = await getDatabaseAsync();

    // Check if table exists
    const tableCheck = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, booleanColumn]);

    if (tableCheck.rows.length === 0) {
      throw new Error(`Table ${tableName} or column ${booleanColumn} not found`);
    }

    // Try to query with boolean
    const result = await db.query(
      `SELECT ${booleanColumn} FROM ${tableName} WHERE ${booleanColumn} = $1 LIMIT 1`,
      [true]
    );

    // Check result type
    if (result.rows.length > 0) {
      const value = result.rows[0][booleanColumn];
      if (typeof value !== 'boolean') {
        throw new Error(`Expected boolean but got ${typeof value}: ${value}`);
      }
    }
  });
}

/**
 * Test date handling (CURRENT_TIMESTAMP vs datetime('now'))
 */
async function testDateHandling(results) {
  return testMethod(results, 'Date Handling', async () => {
    const db = await getDatabaseAsync();

    // Test CURRENT_TIMESTAMP
    const result1 = await db.query('SELECT CURRENT_TIMESTAMP as now');
    if (!result1.rows[0].now) {
      throw new Error('CURRENT_TIMESTAMP returned null');
    }

    // Test CURRENT_DATE
    const result2 = await db.query('SELECT CURRENT_DATE as today');
    if (!result2.rows[0].today) {
      throw new Error('CURRENT_DATE returned null');
    }

    // Test INTERVAL
    const result3 = await db.query("SELECT CURRENT_DATE - INTERVAL '30 days' as past");
    if (!result3.rows[0].past) {
      throw new Error('INTERVAL arithmetic failed');
    }
  });
}

/**
 * Test result object access (.rows vs direct)
 */
async function testResultObjectAccess(results) {
  return testMethod(results, 'Result Object Access', async () => {
    const db = await getDatabaseAsync();

    const result = await db.query('SELECT 1 as num, $1 as str', ['test']);

    // Check .rows exists
    if (!result.rows) {
      throw new Error('Result missing .rows property');
    }

    // Check rows is array
    if (!Array.isArray(result.rows)) {
      throw new Error('.rows is not an array');
    }

    // Check first row access
    if (!result.rows[0]) {
      throw new Error('Cannot access result.rows[0]');
    }

    // Check column access
    if (result.rows[0].num !== 1 || result.rows[0].str !== 'test') {
      throw new Error('Column values incorrect');
    }
  });
}

/**
 * Create test data for a service
 */
async function createTestData(tableName, data) {
  const db = await getDatabaseAsync();
  const columns = Object.keys(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const values = columns.map(col => data[col]);

  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${placeholders})
    RETURNING id
  `;

  const result = await db.query(sql, values);
  return result.rows[0].id;
}

/**
 * Clean up test data
 */
async function cleanupTestData(tableName, condition, params) {
  const db = await getDatabaseAsync();
  await db.query(`DELETE FROM ${tableName} WHERE ${condition}`, params);
}

/**
 * Print test header
 */
function printTestHeader(serviceName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.bright}Testing: ${serviceName}${colors.reset}`);
  console.log(`${'='.repeat(60)}\n`);
}

module.exports = {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  testSQLParameterBinding,
  testBooleanHandling,
  testDateHandling,
  testResultObjectAccess,
  createTestData,
  cleanupTestData,
  printTestHeader,
  colors
};
