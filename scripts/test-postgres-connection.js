#!/usr/bin/env node
/**
 * PostgreSQL Connection Test
 *
 * Tests connection to PostgreSQL and verifies the database abstraction works.
 * Requires Docker PostgreSQL to be running:
 *   docker-compose up -d postgres redis
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/investment node scripts/test-postgres-connection.js
 */

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          POSTGRESQL CONNECTION TEST                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.log('❌ DATABASE_URL not set');
    console.log('\nTo test PostgreSQL connection:');
    console.log('  1. Start Docker: docker-compose up -d postgres redis');
    console.log('  2. Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/investment node scripts/test-postgres-connection.js');
    process.exit(1);
  }

  console.log(`📊 Database URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  // Force reload of db module with new env
  delete require.cache[require.resolve('../src/lib/db')];

  const {
    getDatabaseSync,
    getDatabaseType,
    isUsingPostgres,
    dialect
  } = require('../src/lib/db');

  console.log(`   Type: ${getDatabaseType()}`);
  console.log(`   PostgreSQL: ${isUsingPostgres()}`);
  console.log('');

  // Test 1: Connection
  console.log('Test 1: Connection');
  try {
    const db = getDatabaseSync();
    console.log('   ✅ Database connection established');
  } catch (e) {
    console.log(`   ❌ Connection failed: ${e.message}`);
    console.log('\n   Make sure Docker is running: docker-compose up -d postgres');
    process.exit(1);
  }

  // Test 2: Basic query
  console.log('\nTest 2: Basic query');
  try {
    const db = getDatabaseSync();
    const result = db.prepare('SELECT 1 as test').get();
    if (result && result.test === 1) {
      console.log('   ✅ Basic query works');
    } else {
      console.log('   ❌ Unexpected result:', result);
    }
  } catch (e) {
    console.log(`   ❌ Query failed: ${e.message}`);
  }

  // Test 3: SQL dialect conversion
  console.log('\nTest 3: SQL dialect conversion');
  try {
    const testSql = "INSERT OR REPLACE INTO test (id) VALUES (1)";
    const converted = dialect.convertSQL ? dialect.convertSQL(testSql) : testSql;
    console.log(`   Input:  ${testSql}`);
    console.log(`   Output: ${converted}`);
    if (isUsingPostgres() && converted.includes('ON CONFLICT')) {
      console.log('   ✅ SQL conversion working');
    } else if (!isUsingPostgres()) {
      console.log('   ⚠️  SQLite mode - no conversion needed');
    } else {
      console.log('   ❌ Expected ON CONFLICT syntax');
    }
  } catch (e) {
    console.log(`   ❌ Conversion failed: ${e.message}`);
  }

  // Test 4: Create test table
  console.log('\nTest 4: Create test table');
  try {
    const db = getDatabaseSync();
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migration_test (
        id INTEGER PRIMARY KEY,
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Table creation works');

    // Cleanup
    db.exec('DROP TABLE IF EXISTS _migration_test');
    console.log('   ✅ Table cleanup works');
  } catch (e) {
    console.log(`   ❌ Table creation failed: ${e.message}`);
  }

  // Test 5: Redis connection (if configured)
  console.log('\nTest 5: Redis connection');
  if (process.env.REDIS_URL) {
    try {
      const { unifiedCache } = require('../src/lib/redisCache');
      await unifiedCache.waitForReady();
      const backend = unifiedCache.getBackend();
      if (backend === 'redis') {
        console.log('   ✅ Redis connected');
      } else {
        console.log(`   ⚠️  Using ${backend} (Redis may not be ready)`);
      }
    } catch (e) {
      console.log(`   ❌ Redis failed: ${e.message}`);
    }
  } else {
    console.log('   ⏭️  REDIS_URL not set, skipping');
  }

  console.log('\n' + '='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
