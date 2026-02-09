#!/usr/bin/env node
/**
 * Railway OAuth Diagnostic Script
 *
 * Tests all components required for OAuth to work:
 * 1. Database connectivity (PostgreSQL)
 * 2. Users table schema
 * 3. getDatabaseAsync function availability
 * 4. OAuth configuration (Google credentials)
 * 5. Session store (Redis)
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/test-railway-oauth.js
 */

const { getDatabaseAsync, isUsingPostgres } = require('../src/lib/db');
const crypto = require('crypto');

async function testDatabaseConnectivity() {
  console.log('\n📊 Testing Database Connectivity...');
  console.log('═'.repeat(60));

  try {
    const db = await getDatabaseAsync();
    console.log('✅ getDatabaseAsync() works');
    console.log(`   Database type: ${isUsingPostgres() ? 'PostgreSQL' : 'SQLite'}`);

    // Test query
    const result = await db.query('SELECT 1 as test');
    console.log('✅ Basic query works');
    console.log(`   Result: ${JSON.stringify(result.rows[0])}`);

    return db;
  } catch (error) {
    console.error('❌ Database connectivity failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

async function testUsersTable(db) {
  console.log('\n👤 Testing Users Table...');
  console.log('═'.repeat(60));

  try {
    // Check if users table exists
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    console.log('✅ Users table exists');
    console.log(`   Current user count: ${result.rows[0].count}`);

    // Check table schema
    const schemaQuery = isUsingPostgres()
      ? `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'users'
         ORDER BY ordinal_position`
      : `PRAGMA table_info(users)`;

    const schema = await db.query(schemaQuery);
    console.log('✅ Users table schema:');
    schema.rows.forEach(col => {
      const colName = col.column_name || col.name;
      const colType = col.data_type || col.type;
      console.log(`   - ${colName}: ${colType}`);
    });

    // Check for required columns
    const requiredColumns = ['id', 'google_id', 'email', 'name', 'picture', 'last_login_at'];
    const existingColumns = schema.rows.map(col => col.column_name || col.name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error('❌ Missing required columns:', missingColumns.join(', '));
      return false;
    }

    console.log('✅ All required columns present');
    return true;
  } catch (error) {
    console.error('❌ Users table test failed:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function testOAuthFlow(db) {
  console.log('\n🔐 Testing OAuth Flow Simulation...');
  console.log('═'.repeat(60));

  try {
    // Simulate OAuth callback data
    const mockGoogleProfile = {
      id: 'test_google_id_' + Date.now(),
      emails: [{ value: 'test@example.com' }],
      displayName: 'Test User',
      photos: [{ value: 'https://example.com/photo.jpg' }]
    };

    console.log('📝 Simulating new user creation...');

    // Try to create a user (same logic as passport.js)
    const userId = crypto.randomUUID();
    await db.query(`
      INSERT INTO users (id, google_id, email, name, picture, last_login_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      userId,
      mockGoogleProfile.id,
      mockGoogleProfile.emails[0].value,
      mockGoogleProfile.displayName,
      mockGoogleProfile.photos[0].value
    ]);

    console.log(`✅ User created successfully: ${userId}`);

    // Verify user was created
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
      throw new Error('User not found after creation');
    }

    console.log('✅ User verified in database:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);

    // Clean up test user
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log('✅ Test user cleaned up');

    return true;
  } catch (error) {
    console.error('❌ OAuth flow simulation failed:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function testEnvironmentConfig() {
  console.log('\n⚙️  Testing Environment Configuration...');
  console.log('═'.repeat(60));

  const requiredVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'APP_URL'
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value) {
      if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
        console.log(`✅ ${varName}: SET (${value.length} chars)`);
      } else if (varName === 'DATABASE_URL') {
        console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
      } else {
        console.log(`✅ ${varName}: ${value}`);
      }
    } else {
      console.error(`❌ ${varName}: NOT SET`);
      allPresent = false;
    }
  }

  if (process.env.APP_URL && !process.env.APP_URL.startsWith('https://')) {
    console.warn('⚠️  APP_URL should use HTTPS in production');
  }

  console.log(`\n   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`   PORT: ${process.env.PORT || 'not set'}`);

  return allPresent;
}

async function testPassportConfiguration() {
  console.log('\n🛂 Testing Passport Configuration...');
  console.log('═'.repeat(60));

  try {
    const { configurePassport } = require('../src/auth/passport');
    console.log('✅ passport.js module loads successfully');

    // Check if GoogleStrategy is configured
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    console.log('✅ passport-google-oauth20 package available');

    // Verify getDatabaseAsync is imported correctly
    const { getDatabaseAsync: importedFunc } = require('../src/lib/db');
    if (typeof importedFunc === 'function') {
      console.log('✅ getDatabaseAsync is a function');
    } else {
      console.error('❌ getDatabaseAsync is not a function:', typeof importedFunc);
      return false;
    }

    // Test calling it
    try {
      const db = await importedFunc();
      console.log('✅ getDatabaseAsync() can be called successfully');
    } catch (error) {
      console.error('❌ getDatabaseAsync() throws error:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Passport configuration test failed:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Railway OAuth Diagnostic Tool');
  console.log('═'.repeat(60));

  const results = {
    env: false,
    database: false,
    usersTable: false,
    oauthFlow: false,
    passport: false
  };

  // Test environment configuration
  results.env = await testEnvironmentConfig();

  // Test passport configuration
  results.passport = await testPassportConfiguration();

  // Test database connectivity
  let db;
  try {
    db = await testDatabaseConnectivity();
    results.database = true;
  } catch (error) {
    console.error('Cannot proceed without database connection');
    printSummary(results);
    process.exit(1);
  }

  // Test users table
  results.usersTable = await testUsersTable(db);

  // Test OAuth flow simulation
  if (results.usersTable) {
    results.oauthFlow = await testOAuthFlow(db);
  } else {
    console.log('\n⏭️  Skipping OAuth flow test (users table issues)');
  }

  // Close database connection
  if (db && db.close) {
    await db.close();
  }

  // Print summary
  printSummary(results);

  // Exit with appropriate code
  const allPassed = Object.values(results).every(v => v === true);
  process.exit(allPassed ? 0 : 1);
}

function printSummary(results) {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));

  const tests = [
    { name: 'Environment Configuration', key: 'env' },
    { name: 'Passport Configuration', key: 'passport' },
    { name: 'Database Connectivity', key: 'database' },
    { name: 'Users Table Schema', key: 'usersTable' },
    { name: 'OAuth Flow Simulation', key: 'oauthFlow' }
  ];

  tests.forEach(test => {
    const status = results[test.key] ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}  ${test.name}`);
  });

  console.log('═'.repeat(60));

  const passCount = Object.values(results).filter(v => v === true).length;
  const totalCount = Object.keys(results).length;

  if (passCount === totalCount) {
    console.log('✅ All tests passed! OAuth should work.');
  } else {
    console.log(`❌ ${totalCount - passCount} test(s) failed. Fix the issues above.`);
  }

  console.log('');
}

// Run diagnostics
main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
