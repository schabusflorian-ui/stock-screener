#!/usr/bin/env node
/**
 * Force-run PostgreSQL migrations on Railway
 * 
 * This script will:
 * 1. Connect to Railway PostgreSQL database
 * 2. List all migrations
 * 3. Run any pending migrations
 * 4. Verify insider tables exist
 * 
 * Usage: node scripts/railway-force-migrate.js
 */

require('dotenv').config();

const { getDatabase, isUsingPostgres } = require('../src/lib/db');

async function checkInsiderTables(db) {
  console.log('\n📊 Checking insider tables...');
  
  const tables = ['insiders', 'insider_transactions', 'insider_activity_summary'];
  
  for (const table of tables) {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      `, [table]);
      
      const exists = result.rows[0].count > 0;
      
      if (exists) {
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ✅ ${table}: EXISTS (${countResult.rows[0].count} rows)`);
      } else {
        console.log(`   ❌ ${table}: MISSING`);
      }
    } catch (err) {
      console.log(`   ❌ ${table}: ERROR - ${err.message}`);
    }
  }
}

async function main() {
  console.log('🚀 Railway PostgreSQL Migration Force-Runner');
  console.log('='.repeat(50));
  console.log('');
  
  if (!isUsingPostgres()) {
    console.error('❌ DATABASE_URL not set or not PostgreSQL');
    console.error('   This script must be run with a PostgreSQL DATABASE_URL');
    process.exit(1);
  }
  
  console.log('✅ DATABASE_URL detected (PostgreSQL)');
  const db = await getDatabase();
  
  // Check current state
  await checkInsiderTables(db);
  
  // Run migrations
  console.log('\n🐘 Running migrations...');
  console.log('');
  
  const { spawn } = require('child_process');
  const path = require('path');
  
  const migrationProcess = spawn('node', [
    path.join(__dirname, '..', 'src', 'database-migrations', 'run-postgres-migrations.js')
  ], {
    stdio: 'inherit',
    env: process.env
  });
  
  migrationProcess.on('exit', async (code) => {
    if (code === 0) {
      console.log('\n✅ Migrations completed successfully');
      
      // Check tables again
      await checkInsiderTables(db);
      
      console.log('\n✅ Done!');
      await db.close();
      process.exit(0);
    } else {
      console.error(`\n❌ Migration failed with code ${code}`);
      await db.close();
      process.exit(1);
    }
  });
  
  migrationProcess.on('error', async (err) => {
    console.error('❌ Failed to spawn migration process:', err);
    await db.close();
    process.exit(1);
  });
}

main().catch(async (err) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
