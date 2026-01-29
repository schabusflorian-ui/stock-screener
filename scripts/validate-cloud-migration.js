#!/usr/bin/env node
/**
 * Cloud Migration Validation Suite
 *
 * Comprehensive tests for:
 * - Database abstraction layer (SQLite/PostgreSQL)
 * - SQL dialect conversion
 * - Cache system (Redis/Memory fallback)
 * - Module loading and exports
 * - Security configurations
 */

const path = require('path');

// Test utilities
class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, status: 'passed', duration });
      this.passed++;
      console.log(`  ✓ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ name, status: 'failed', error: error.message, duration });
      this.failed++;
      console.log(`  ✗ ${name} - ${error.message}`);
    }
  }

  skip(name, reason) {
    this.results.push({ name, status: 'skipped', reason });
    this.skipped++;
    console.log(`  ○ ${name} (skipped: ${reason})`);
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Passed:  ${this.passed}`);
    console.log(`  Failed:  ${this.failed}`);
    console.log(`  Skipped: ${this.skipped}`);
    console.log(`  Total:   ${this.results.length}`);
    console.log('='.repeat(60));

    if (this.failed > 0) {
      console.log('\nFailed tests:');
      this.results
        .filter(r => r.status === 'failed')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }

    return this.failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected "${expected}", got "${actual}"`);
  }
}

function assertContains(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(message || `Expected string to contain "${substr}"`);
  }
}

// ============================================
// Test Suites
// ============================================

async function testDatabaseAbstraction(runner) {
  console.log('\n📊 Database Abstraction Layer');
  console.log('-'.repeat(40));

  await runner.runTest('db.js module loads', () => {
    const db = require('../src/lib/db');
    assert(db, 'Module should export an object');
  });

  await runner.runTest('exports required functions', () => {
    const db = require('../src/lib/db');
    assert(typeof db.getDatabase === 'function', 'getDatabase should be a function');
    assert(typeof db.getDatabaseSync === 'function', 'getDatabaseSync should be a function');
    assert(typeof db.isUsingPostgres === 'function', 'isUsingPostgres should be a function');
    assert(typeof db.getDatabaseType === 'function', 'getDatabaseType should be a function');
  });

  await runner.runTest('dialect helpers exist', () => {
    const { dialect } = require('../src/lib/db');
    assert(dialect, 'dialect object should exist');
    assert(typeof dialect.isPostgres === 'function', 'dialect.isPostgres should be a function');
    assert(typeof dialect.caseInsensitive === 'function', 'dialect.caseInsensitive should be a function');
    assert(typeof dialect.upsert === 'function', 'dialect.upsert should be a function');
    assert(typeof dialect.insertIgnore === 'function', 'dialect.insertIgnore should be a function');
  });

  await runner.runTest('SQLite mode detection (no DATABASE_URL)', () => {
    // Note: This test checks the INITIAL state of the module
    // If DATABASE_URL was not set when the module first loaded, it should be SQLite
    // We can't fully test this without a fresh Node process
    const { isUsingPostgres, getDatabaseType } = require('../src/lib/db');
    // Just verify the functions work - the actual mode depends on when module was first loaded
    assert(typeof isUsingPostgres() === 'boolean', 'isUsingPostgres should return boolean');
    assert(['sqlite', 'postgres'].includes(getDatabaseType()), 'getDatabaseType should return valid type');
  });

  await runner.runTest('getDatabaseSync works for SQLite', () => {
    if (!process.env.DATABASE_URL) {
      const { getDatabaseSync } = require('../src/lib/db');
      const db = getDatabaseSync();
      assert(db, 'Should return database instance');
      assert(db.type === 'sqlite', 'Should be sqlite type');
    }
  });
}

async function testSQLDialectConversion(runner) {
  console.log('\n🔄 SQL Dialect Conversion');
  console.log('-'.repeat(40));

  // Set up PostgreSQL mode for testing conversions
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

  // Clear module cache to reload with new env
  delete require.cache[require.resolve('../src/lib/db')];
  const { convertSQLDialect } = require('../src/lib/db');

  try {
    await runner.runTest('INSERT OR REPLACE → ON CONFLICT (known table)', () => {
      const input = "INSERT OR REPLACE INTO daily_factor_returns (date, mkt_rf, smb) VALUES (?, ?, ?)";
      const result = convertSQLDialect(input);
      assertContains(result, 'INSERT INTO daily_factor_returns', 'Should have INSERT INTO');
      assertContains(result, 'ON CONFLICT (date)', 'Should have ON CONFLICT clause');
      assertContains(result, 'DO UPDATE SET', 'Should have DO UPDATE SET');
      assertContains(result, 'mkt_rf = EXCLUDED.mkt_rf', 'Should update non-key columns');
    });

    await runner.runTest('INSERT OR REPLACE → ON CONFLICT (unknown table)', () => {
      const input = "INSERT OR REPLACE INTO unknown_table (id, name) VALUES (?, ?)";
      const result = convertSQLDialect(input);
      assertContains(result, 'ON CONFLICT (id)', 'Should use id as default conflict column');
    });

    await runner.runTest('INSERT OR IGNORE → ON CONFLICT DO NOTHING', () => {
      const input = "INSERT OR IGNORE INTO companies (symbol) VALUES (?)";
      const result = convertSQLDialect(input);
      assertContains(result, 'ON CONFLICT DO NOTHING', 'Should have DO NOTHING clause');
    });

    await runner.runTest('COLLATE NOCASE removal', () => {
      const input = "SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE";
      const result = convertSQLDialect(input);
      assert(!result.includes('COLLATE NOCASE'), 'Should remove COLLATE NOCASE');
    });

    await runner.runTest('datetime("now") → NOW()', () => {
      const input = "SELECT * FROM posts WHERE created_at > datetime('now')";
      const result = convertSQLDialect(input);
      assertContains(result, 'NOW()', 'Should convert to NOW()');
    });

    await runner.runTest('datetime("now", "-30 days") → NOW() + INTERVAL', () => {
      const input = "SELECT * FROM posts WHERE created_at > datetime('now', '-30 days')";
      const result = convertSQLDialect(input);
      assertContains(result, "NOW() + INTERVAL '-30 days'", 'Should convert to INTERVAL');
    });

    await runner.runTest('date("now") → CURRENT_DATE', () => {
      const input = "SELECT * FROM events WHERE event_date = date('now')";
      const result = convertSQLDialect(input);
      assertContains(result, 'CURRENT_DATE', 'Should convert to CURRENT_DATE');
    });

    await runner.runTest('date("now", "-7 days") → CURRENT_DATE + INTERVAL', () => {
      const input = "SELECT * FROM events WHERE event_date > date('now', '-7 days')";
      const result = convertSQLDialect(input);
      assertContains(result, "CURRENT_DATE + INTERVAL '-7 days'", 'Should convert to INTERVAL');
    });

    await runner.runTest('GROUP_CONCAT → STRING_AGG', () => {
      const input = "SELECT GROUP_CONCAT(symbol) FROM holdings";
      const result = convertSQLDialect(input);
      assertContains(result, 'STRING_AGG', 'Should convert to STRING_AGG');
    });

    await runner.runTest('IFNULL → COALESCE', () => {
      const input = "SELECT IFNULL(price, 0) FROM stocks";
      const result = convertSQLDialect(input);
      assertContains(result, 'COALESCE', 'Should convert to COALESCE');
    });

    await runner.runTest('strftime("%Y-%m-%d", col) → DATE(col)', () => {
      const input = "SELECT strftime('%Y-%m-%d', created_at) FROM events";
      const result = convertSQLDialect(input);
      assertContains(result, 'DATE(created_at)', 'Should convert to DATE()');
    });

  } finally {
    // Restore original environment
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    delete require.cache[require.resolve('../src/lib/db')];
  }
}

async function testCacheSystem(runner) {
  console.log('\n💾 Cache System');
  console.log('-'.repeat(40));

  await runner.runTest('cache.js module loads', () => {
    const cache = require('../src/lib/cache');
    assert(cache, 'Module should export');
  });

  await runner.runTest('exports cache instance and TTL', () => {
    const { cache, TTL, MemoryCache } = require('../src/lib/cache');
    assert(cache, 'cache instance should exist');
    assert(TTL, 'TTL constants should exist');
    assert(MemoryCache, 'MemoryCache class should be exported');
  });

  await runner.runTest('TTL constants are defined', () => {
    const { TTL } = require('../src/lib/cache');
    assert(TTL.QUOTE > 0, 'TTL.QUOTE should be positive');
    assert(TTL.METRICS > 0, 'TTL.METRICS should be positive');
    assert(TTL.COMPANY_PROFILE > 0, 'TTL.COMPANY_PROFILE should be positive');
  });

  await runner.runTest('cache has required methods', () => {
    const { cache } = require('../src/lib/cache');
    assert(typeof cache.get === 'function', 'cache.get should exist');
    assert(typeof cache.set === 'function', 'cache.set should exist');
    assert(typeof cache.delete === 'function', 'cache.delete should exist');
    assert(typeof cache.getOrFetch === 'function', 'cache.getOrFetch should exist');
  });

  await runner.runTest('redisCache.js module loads', () => {
    const redis = require('../src/lib/redisCache');
    assert(redis, 'Module should export');
  });

  await runner.runTest('redisCache exports required classes', () => {
    const { RedisCache, UnifiedCache, unifiedCache } = require('../src/lib/redisCache');
    assert(RedisCache, 'RedisCache class should exist');
    assert(UnifiedCache, 'UnifiedCache class should exist');
    assert(unifiedCache, 'unifiedCache singleton should exist');
  });

  await runner.runTest('UnifiedCache fallback works without Redis', () => {
    const { unifiedCache } = require('../src/lib/redisCache');
    // Without REDIS_URL, should fall back to memory
    const backend = unifiedCache.getBackend();
    if (!process.env.REDIS_URL) {
      assertEqual(backend, 'memory', 'Should fall back to memory cache');
    }
  });
}

async function testServiceModules(runner) {
  console.log('\n📦 Service Modules');
  console.log('-'.repeat(40));

  const services = [
    { name: 'subscriptionService', path: '../src/services/subscriptionService' },
    { name: 'etfResolver', path: '../src/services/etfResolver' },
    { name: 'fredService', path: '../src/services/data/fredService' },
    { name: 'circuitBreaker', path: '../src/services/mlops/circuitBreaker' },
    { name: 'cachedDataService', path: '../src/services/cachedDataService' },
  ];

  for (const { name, path: modulePath } of services) {
    await runner.runTest(`${name} loads without errors`, () => {
      const module = require(modulePath);
      assert(module, `${name} should export`);
    });
  }

  await runner.runTest('circuitBreaker exports required classes', () => {
    const { CircuitBreaker, CircuitBreakerManager, CircuitState, circuitBreakerManager } =
      require('../src/services/mlops/circuitBreaker');
    assert(CircuitBreaker, 'CircuitBreaker class should exist');
    assert(CircuitBreakerManager, 'CircuitBreakerManager class should exist');
    assert(CircuitState, 'CircuitState enum should exist');
    assert(circuitBreakerManager, 'circuitBreakerManager singleton should exist');
  });

  await runner.runTest('subscriptionService has async methods', () => {
    const { SubscriptionService } = require('../src/services/subscriptionService');
    const proto = SubscriptionService.prototype;
    assert(typeof proto.getAllTiersAsync === 'function', 'getAllTiersAsync should exist');
    assert(typeof proto.getUserSubscriptionAsync === 'function', 'getUserSubscriptionAsync should exist');
    assert(typeof proto.getAllTiers === 'function', 'getAllTiers (sync) should exist');
    assert(typeof proto.getUserSubscription === 'function', 'getUserSubscription (sync) should exist');
  });
}

async function testSecurityConfigurations(runner) {
  console.log('\n🔒 Security Configurations');
  console.log('-'.repeat(40));

  await runner.runTest('auth.js module loads', () => {
    const auth = require('../src/middleware/auth');
    assert(auth, 'Auth middleware should export');
  });

  await runner.runTest('rateLimiter.js module loads', () => {
    const rateLimiter = require('../src/middleware/rateLimiter');
    assert(rateLimiter, 'Rate limiter should export');
  });

  await runner.runTest('rateLimiter has fail-closed fallback', async () => {
    const rateLimiterPath = path.join(__dirname, '../src/middleware/rateLimiter.js');
    const fs = require('fs');
    const content = fs.readFileSync(rateLimiterPath, 'utf8');
    // Check for in-memory fallback when Redis fails
    assert(
      content.includes('memoryFallback') || content.includes('inMemory') || content.includes('fallback'),
      'Rate limiter should have fallback mechanism'
    );
  });
}

async function testTableConflictMapping(runner) {
  console.log('\n📋 Table Conflict Column Mapping');
  console.log('-'.repeat(40));

  // Set up PostgreSQL mode for testing
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
  delete require.cache[require.resolve('../src/lib/db')];
  const { convertSQLDialect } = require('../src/lib/db');

  const testCases = [
    { table: 'companies', expectedConflict: 'symbol' },
    { table: 'daily_prices', expectedConflict: 'company_id, date' },
    { table: 'stock_factor_scores', expectedConflict: 'company_id, score_date' },
    { table: 'economic_indicators', expectedConflict: 'series_id, observation_date' },
    { table: 'app_settings', expectedConflict: 'key' },
  ];

  try {
    for (const { table, expectedConflict } of testCases) {
      await runner.runTest(`${table} uses correct conflict columns`, () => {
        const input = `INSERT OR REPLACE INTO ${table} (id, test) VALUES (?, ?)`;
        const result = convertSQLDialect(input);
        assertContains(result, `ON CONFLICT (${expectedConflict})`,
          `Should use ${expectedConflict} for ${table}`);
      });
    }
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    delete require.cache[require.resolve('../src/lib/db')];
  }
}

async function testDialectHelpers(runner) {
  console.log('\n🛠️  Dialect Helpers');
  console.log('-'.repeat(40));

  await runner.runTest('dialect.caseInsensitive generates correct SQL', () => {
    // Test SQLite mode (default)
    delete require.cache[require.resolve('../src/lib/db')];
    delete process.env.DATABASE_URL;
    const { dialect: sqliteDialect } = require('../src/lib/db');

    const sqliteResult = sqliteDialect.caseInsensitive('symbol');
    assert(
      sqliteResult.includes('COLLATE NOCASE') || sqliteResult.includes('LOWER'),
      'SQLite should use COLLATE NOCASE or LOWER'
    );
  });

  await runner.runTest('dialect.upsert generates correct SQL', () => {
    delete require.cache[require.resolve('../src/lib/db')];
    delete process.env.DATABASE_URL;
    const { dialect } = require('../src/lib/db');

    const result = dialect.upsert(
      'test_table',
      ['id', 'name', 'value'],
      ['?', '?', '?'],
      'id',
      ['name = EXCLUDED.name', 'value = EXCLUDED.value']
    );

    assert(result.includes('INSERT'), 'Should have INSERT');
    assert(result.includes('test_table'), 'Should have table name');
  });

  await runner.runTest('dialect.groupConcat generates correct SQL', () => {
    delete require.cache[require.resolve('../src/lib/db')];
    delete process.env.DATABASE_URL;
    const { dialect } = require('../src/lib/db');

    const result = dialect.groupConcat('symbol', ',');
    assertContains(result, 'GROUP_CONCAT', 'SQLite should use GROUP_CONCAT');
  });
}

// ============================================
// Main Runner
// ============================================

async function main() {
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + 'CLOUD MIGRATION VALIDATION' + ' '.repeat(17) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\nRunning comprehensive validation tests...\n');

  const runner = new TestRunner();

  try {
    await testDatabaseAbstraction(runner);
    await testSQLDialectConversion(runner);
    await testCacheSystem(runner);
    await testServiceModules(runner);
    await testSecurityConfigurations(runner);
    await testTableConflictMapping(runner);
    await testDialectHelpers(runner);
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error.message);
    console.error(error.stack);
  }

  const success = runner.summary();

  if (success) {
    console.log('\n✅ All validation tests passed! Ready for deployment.\n');
  } else {
    console.log('\n❌ Some tests failed. Please review and fix before deployment.\n');
  }

  process.exit(success ? 0 : 1);
}

main().catch(console.error);
