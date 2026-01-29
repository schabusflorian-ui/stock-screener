#!/usr/bin/env node
// src/database-migrations/run-postgres-migrations.js
// PostgreSQL migration runner
//
// Usage:
//   DATABASE_URL=postgres://... node src/database-migrations/run-postgres-migrations.js
//   Or: npm run migrate:postgres

const { getDatabase, isUsingPostgres } = require('../lib/db');
const path = require('path');
const fs = require('fs');

// List of PostgreSQL migrations in order
// Add new migrations here as they are created
const POSTGRES_MIGRATIONS = [
  '000-postgres-base-schema.js',
  // Add more PostgreSQL-compatible migrations here
];

async function runMigrations() {
  if (!isUsingPostgres()) {
    console.log('⚠️  DATABASE_URL not set or not PostgreSQL');
    console.log('   Set DATABASE_URL=postgres://user:pass@host:port/db to run PostgreSQL migrations');
    console.log('');
    console.log('   For SQLite, the schema is created automatically by src/database.js');
    process.exit(0);
  }

  console.log('🐘 PostgreSQL Migration Runner');
  console.log('================================');
  console.log('');

  const db = await getDatabase();

  // Ensure migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const result = await db.query('SELECT migration_name FROM schema_migrations');
  const appliedMigrations = new Set(result.rows.map(r => r.migration_name));

  console.log(`Found ${appliedMigrations.size} already applied migrations`);
  console.log('');

  let migrationsRun = 0;

  for (const migrationFile of POSTGRES_MIGRATIONS) {
    const migrationName = migrationFile.replace('.js', '');

    if (appliedMigrations.has(migrationName)) {
      console.log(`⏭️  Skipping ${migrationName} (already applied)`);
      continue;
    }

    console.log(`▶️  Running ${migrationName}...`);

    try {
      const migrationPath = path.join(__dirname, migrationFile);

      if (!fs.existsSync(migrationPath)) {
        console.error(`   ❌ Migration file not found: ${migrationPath}`);
        continue;
      }

      // Run the migration
      const migration = require(migrationPath);

      // Check if it's a function (new style) or runs on require (old style)
      if (typeof migration === 'function') {
        await migration(db);
      } else if (typeof migration.run === 'function') {
        await migration.run(db);
      }
      // Otherwise, migration ran on require

      // Record the migration
      await db.query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
        [migrationName]
      );

      console.log(`   ✅ ${migrationName} completed`);
      migrationsRun++;
    } catch (err) {
      console.error(`   ❌ ${migrationName} failed:`, err.message);
      console.error('');
      console.error('Migration aborted. Fix the error and run again.');
      process.exit(1);
    }
  }

  console.log('');
  console.log('================================');
  console.log(`✅ Migrations complete: ${migrationsRun} new, ${appliedMigrations.size} previously applied`);

  await db.close();
}

// Run migrations
runMigrations().catch(err => {
  console.error('❌ Migration runner failed:', err.message);
  process.exit(1);
});
